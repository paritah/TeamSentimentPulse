import * as XLSX from "xlsx";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  compositeScore,
  disengagementScore,
  riskLevelForComposite,
  type PulseScores,
} from "@/lib/scoring";
import {
  AlertSeverity,
  AlertType,
  RecommendationPriority,
  RecommendationStatus,
  RecommendationType,
  SubmissionMode,
} from "@prisma/client";

// ── Column aliases ─────────────────────────────────────────────────────────
const Q_MAP: Record<string, keyof PulseScores> = {
  "how would you describe your overall well-being and energy level at work":
    "q1",
  "how satisfied are you with your current job": "q2",
  "how would you rate your work-life balance": "q3",
  "how supported do you feel by your manager": "q4",
  "do you see opportunities to grow and develop your skills in this role":
    "q5",
  "how clearly defined are your priorities and role expectations": "q6",
  "how likely are you to recommend this company to a friend": "q7",
};

type FieldKey = keyof PulseScores | "q8" | "name" | "email" | "start" | "completion";

function mapColumn(header: string): FieldKey | null {
  const h = header.toLowerCase().trim();
  if (h === "email") return "email";
  if (h === "name") return "name";
  if (h.includes("completion time")) return "completion";
  if (h.includes("start time") || h === "start") return "start";
  if (h.includes("feedback") || h.includes("call out")) return "q8";
  for (const [key, val] of Object.entries(Q_MAP)) {
    if (h.startsWith(key)) return val;
  }
  return null;
}

/** Convert Excel serial date to JS Date */
function excelSerialToDate(serial: number | string): Date {
  if (typeof serial === "string") {
    const d = new Date(serial);
    return isNaN(d.getTime()) ? new Date() : d;
  }
  return new Date(Math.round((serial - 25569) * 86400 * 1000));
}

function cycleKey(date: Date): string {
  // Snap to nearest Monday for bi-weekly grouping
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay() + 1);
  return d.toISOString().slice(0, 10);
}

async function getOrCreateImportTeam(projectId: string): Promise<string> {
  const existing = await prisma.team.findFirst({ where: { name: "Team Sentiment Survey Form" } });
  if (existing) return existing.id;

  const team = await prisma.team.create({
    data: { projectId, name: "Team Sentiment Survey Form" },
  });
  return team.id;
}

async function getOrCreateProject(): Promise<{ id: string; accountId: string }> {
  const existing = await prisma.project.findFirst({ orderBy: { startDate: "desc" } });
  if (existing) return existing;

  const account = await prisma.account.findFirst();
  const accountId =
    account?.id ??
    (
      await prisma.account.create({
        data: { name: "CitiusTech Delivery" },
      })
    ).id;

  return prisma.project.create({
    data: {
      accountId,
      name: "Team Sentiment Pulse",
      status: "active",
      startDate: new Date("2026-01-01"),
    },
  });
}

async function getOrCreateMember(
  email: string,
  name: string,
  teamId: string,
): Promise<string> {
  const normalized = email.toLowerCase();
  const existing = await prisma.member.findFirst({
    where: { email: normalized },
  });
  if (existing) return existing.id;

  const member = await prisma.member.create({
    data: {
      teamId,
      name,
      email: normalized,
      role: "Engineer",
      startDate: new Date("2025-01-01"),
      tenureMonths: 12,
    },
  });
  return member.id;
}

async function getOrCreateForm(teamId: string): Promise<string> {
  const existing = await prisma.pulseSurveyForm.findFirst({ where: { teamId } });
  if (existing) return existing.id;

  const form = await prisma.pulseSurveyForm.create({
    data: {
      teamId,
      title: "Team Sentiment Survey Form",
      cadence: "bi-weekly",
      allowAnonymous: true,
      questions: [],
    },
  });
  return form.id;
}

// ── Alert + Recommendation helpers ────────────────────────────────────────
async function createAlertsForMember(
  memberId: string,
  scores: PulseScores,
  composite: number,
  drop: number,
  disengagement: number,
  triggeredAt: Date,
) {
  const tasks: Promise<unknown>[] = [];

  if (drop >= 15) {
    tasks.push(
      prisma.riskAlert.create({
        data: { memberId, alertType: AlertType.sentiment_sudden_drop, severity: AlertSeverity.high, message: `Composite dropped ${drop} pts cycle-over-cycle.`, triggeredAt },
      }),
    );
  }
  if (disengagement > 80) {
    tasks.push(
      prisma.riskAlert.create({
        data: { memberId, alertType: AlertType.critical_disengagement, severity: AlertSeverity.critical, message: "Disengagement score >80.", triggeredAt },
      }),
    );
  }
  if (scores.q2 <= 4) {
    tasks.push(
      prisma.riskAlert.create({
        data: { memberId, alertType: AlertType.low_job_satisfaction, severity: AlertSeverity.medium, message: "Job satisfaction ≤4.", triggeredAt },
      }),
    );
  }
  if (scores.q3 <= 4) {
    tasks.push(
      prisma.riskAlert.create({
        data: { memberId, alertType: AlertType.poor_worklife_balance, severity: AlertSeverity.medium, message: "Work-life balance ≤4.", triggeredAt },
      }),
    );
  }
  if (scores.q4 <= 4) {
    tasks.push(
      prisma.riskAlert.create({
        data: { memberId, alertType: AlertType.low_manager_support, severity: AlertSeverity.medium, message: "Manager support ≤4.", triggeredAt },
      }),
    );
  }
  if (scores.q7 <= 6) {
    tasks.push(
      prisma.riskAlert.create({
        data: { memberId, alertType: AlertType.low_recommendation, severity: AlertSeverity.medium, message: "Likelihood to recommend ≤6.", triggeredAt },
      }),
    );
  }

  await Promise.all(tasks);
}

async function createRecommendationIfNeeded(
  memberId: string,
  scores: PulseScores,
  composite: number,
  drop: number,
  targetDate: Date,
) {
  let rec: { type: RecommendationType; title: string; description: string; suggestedAction: string; priority: RecommendationPriority } | null = null;

  if (scores.q1 <= 4) {
    rec = { type: RecommendationType.one_on_one_checkin, title: "1-on-1 Check-in", description: "Low pulse score detected.", suggestedAction: "Schedule a personal check-in this week.", priority: RecommendationPriority.high };
  } else if (scores.q2 <= 5) {
    rec = { type: RecommendationType.role_career_conversation, title: "Role and Career Conversation", description: "Job satisfaction is low.", suggestedAction: "Review role clarity and growth path.", priority: RecommendationPriority.medium };
  } else if (scores.q3 <= 5) {
    rec = { type: RecommendationType.workload_burnout_review, title: "Workload Review", description: "Work-life balance is low.", suggestedAction: "Adjust sprint commitments.", priority: RecommendationPriority.medium };
  } else if (scores.q7 <= 6) {
    rec = { type: RecommendationType.retention_risk_outreach, title: "Retention Risk Outreach", description: "Low recommendation score.", suggestedAction: "Proactively discuss concerns.", priority: RecommendationPriority.high };
  } else if (drop >= 15) {
    rec = { type: RecommendationType.rapid_sentiment_investigation, title: "Rapid Investigation", description: "Sharp sentiment drop.", suggestedAction: "Review sprint events and team dynamics.", priority: RecommendationPriority.high };
  } else if (composite < 40) {
    rec = { type: RecommendationType.mentorship_development_path, title: "Mentorship Path", description: "Sustained low composite.", suggestedAction: "Connect with mentor and align development goals.", priority: RecommendationPriority.high };
  }

  if (rec) {
    await prisma.recommendation.create({
      data: { memberId, ...rec, status: RecommendationStatus.pending, createdBy: "import", targetDate },
    });
  }
}

// ── Route handler ──────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const wb = XLSX.read(buffer, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: "" }) as Record<string, unknown>[];

  if (rows.length === 0) {
    return NextResponse.json({ error: "Empty spreadsheet" }, { status: 400 });
  }

  // Build header→field map from first row keys
  const headers = Object.keys(rows[0]);
  const fieldMap: Record<string, string> = {};
  for (const h of headers) {
    const mapped = mapColumn(h);
    if (mapped) fieldMap[h] = mapped;
  }

  const project = await getOrCreateProject();
  const importTeamId = await getOrCreateImportTeam(project.id);
  const formId = await getOrCreateForm(importTeamId);

  const results = { imported: 0, skipped: 0, errors: [] as string[] };

  // Track per-member previous composite for drop calculation
  const previousComposite = new Map<string, number>();
  let anonCounter = 0;

  for (const row of rows) {
    try {
      // Extract fields
      let email = "";
      let name = "";
      let startSerial: number | string = 0;
      let completionSerial: number | string = 0;
      const scores: Partial<PulseScores> = {};
      let feedback = "";

      for (const [header, field] of Object.entries(fieldMap)) {
        const val = row[header];
        if (field === "email") email = String(val).trim();
        else if (field === "name") name = String(val).trim();
        else if (field === "completion") completionSerial = val as number | string;
        else if (field === "start") startSerial = val as number | string;
        else if (field === "q8") feedback = String(val).trim();
        else if (["q1", "q2", "q3", "q4", "q5", "q6", "q7"].includes(field)) {
          const n = Number(val);
          if (!isNaN(n) && n >= 1 && n <= 10) {
            (scores as Record<string, number>)[field] = n;
          }
        }
      }

      // Treat empty name/email as anonymous
      const isAnonymous = !email || !name;
      if (isAnonymous) {
        anonCounter += 1;
        email = `anonymous_${anonCounter}@ms-forms.local`;
        name = `Anonymous Respondent ${anonCounter}`;
      }

      const requiredScores = ["q1", "q2", "q3", "q4", "q5", "q6", "q7"] as (keyof PulseScores)[];
      if (requiredScores.some((k) => scores[k] === undefined)) {
        results.errors.push(`Row for ${name}: missing one or more Q1-Q7 scores`);
        results.skipped += 1;
        continue;
      }

      const fullScores = scores as PulseScores;
      // Prefer Completion time (more accurate) — fall back to Start time
      const submissionSerial = completionSerial || startSerial;
      const submittedAt = submissionSerial ? excelSerialToDate(submissionSerial as number) : new Date();
      const cycleStart = new Date(cycleKey(submittedAt));

      const memberId = await getOrCreateMember(email, name, importTeamId);
      const member = await prisma.member.findUnique({ where: { id: memberId }, select: { teamId: true } });
      const teamId = member?.teamId ?? importTeamId;

      // Deduplicate by member + exact submission timestamp
      const existing = await prisma.pulseSurveyResponse.findFirst({
        where: { memberId, submittedAt },
      });
      if (existing) { results.skipped += 1; continue; }

      const composite = compositeScore(fullScores);
      const prevComp = previousComposite.get(memberId);
      const drop = prevComp !== undefined ? Math.max(0, prevComp - composite) : 0;
      const disengagement = disengagementScore(composite, 0, fullScores.q7 <= 6);
      const riskLevel = riskLevelForComposite(composite);

      await prisma.pulseSurveyResponse.create({
        data: {
          formId,
          submissionMode: isAnonymous ? SubmissionMode.anonymous : SubmissionMode.named,
          memberId: isAnonymous ? null : memberId,
          anonymousToken: isAnonymous ? `msforms_anon_${anonCounter}` : null,
          teamId,
          projectId: project.id,
          cycleStart,
          q1: fullScores.q1,
          q2: fullScores.q2,
          q3: fullScores.q3,
          q4: fullScores.q4,
          q5: fullScores.q5,
          q6: fullScores.q6,
          q7: fullScores.q7,
          feedback: feedback || "",
          submittedAt,
        },
      });

      await prisma.sentimentScore.upsert({
        where: { memberId_cycleStart: { memberId, cycleStart } },
        update: {
          pulseScore: fullScores.q1,
          jobSatisfactionScore: fullScores.q2,
          workLifeBalanceScore: fullScores.q3,
          managerSupportScore: fullScores.q4,
          growthScore: fullScores.q5,
          roleClarityScore: fullScores.q6,
          recommendationScore: fullScores.q7,
          compositeScore: composite,
          disengagementScore: disengagement,
          riskLevel,
        },
        create: {
          memberId,
          cycleStart,
          pulseScore: fullScores.q1,
          jobSatisfactionScore: fullScores.q2,
          workLifeBalanceScore: fullScores.q3,
          managerSupportScore: fullScores.q4,
          growthScore: fullScores.q5,
          roleClarityScore: fullScores.q6,
          recommendationScore: fullScores.q7,
          compositeScore: composite,
          disengagementScore: disengagement,
          riskLevel,
        },
      });

      if (!isAnonymous) {
        await createAlertsForMember(memberId, fullScores, composite, drop, disengagement, submittedAt);
        await createRecommendationIfNeeded(memberId, fullScores, composite, drop, new Date(submittedAt.getTime() + 10 * 86400 * 1000));
      }

      if (!isAnonymous) previousComposite.set(memberId, composite);
      results.imported += 1;
    } catch (err) {
      results.errors.push(String(err));
      results.skipped += 1;
    }
  }

  return NextResponse.json({ success: true, ...results });
}
