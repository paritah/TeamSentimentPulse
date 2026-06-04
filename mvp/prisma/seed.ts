import {
  AlertSeverity,
  AlertType,
  PrismaClient,
  RecommendationPriority,
  RecommendationStatus,
  RecommendationType,
  SubmissionMode,
} from "@prisma/client";
import {
  compositeScore,
  disengagementScore,
  riskLevelForComposite,
  type PulseScores,
} from "../lib/scoring";

const prisma = new PrismaClient();

const QUESTION_SET = [
  { questionId: "q1", type: "scale", prompt: "How would you describe your overall well-being and energy level at work?", scaleMin: 1, scaleMax: 10 },
  { questionId: "q2", type: "scale", prompt: "How satisfied are you with your current job?", scaleMin: 1, scaleMax: 10 },
  { questionId: "q3", type: "scale", prompt: "How would you rate your work-life balance?", scaleMin: 1, scaleMax: 10 },
  { questionId: "q4", type: "scale", prompt: "How supported do you feel by your manager?", scaleMin: 1, scaleMax: 10 },
  { questionId: "q5", type: "scale", prompt: "Do you see opportunities to grow and develop your skills in this role?", scaleMin: 1, scaleMax: 10 },
  { questionId: "q6", type: "scale", prompt: "How clearly defined are your priorities and role expectations?", scaleMin: 1, scaleMax: 10 },
  { questionId: "q7", type: "scale", prompt: "How likely are you to recommend this company to a friend seeking employment?", scaleMin: 1, scaleMax: 10 },
  { questionId: "q8", type: "text", prompt: "Any feedback or suggestion you want to explicitly call out?" },
];

const TEAM_NAMES = ["Aquila", "Nimbus", "Vertex", "Orion", "Sierra"];
const CYCLE_COUNT = 6;

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function clamp(value: number): number {
  return Math.min(10, Math.max(1, Math.round(value)));
}

function responseForCycle(base: number, cycle: number, drift: number): PulseScores {
  return {
    q1: clamp(base + drift * cycle),
    q2: clamp(base - 0.5 + drift * cycle),
    q3: clamp(base - 1 + drift * cycle),
    q4: clamp(base - 0.25 + drift * cycle),
    q5: clamp(base - 0.1 + drift * cycle),
    q6: clamp(base + 0.2 + drift * cycle),
    q7: clamp(base - 0.75 + drift * cycle),
  };
}

function recommendationForScores(scores: PulseScores, composite: number, drop: number) {
  if (scores.q1 <= 4) {
    return {
      type: RecommendationType.one_on_one_checkin,
      title: "1-on-1 Check-in",
      description: "Pulse score remains low for multiple cycles.",
      suggestedAction: "Schedule a personal check-in this week and discuss workload and well-being.",
      priority: RecommendationPriority.high,
    };
  }

  if (scores.q2 <= 5) {
    return {
      type: RecommendationType.role_career_conversation,
      title: "Role and Career Conversation",
      description: "Job satisfaction is below threshold.",
      suggestedAction: "Review role clarity, growth path, and project fit.",
      priority: RecommendationPriority.medium,
    };
  }

  if (scores.q3 <= 5) {
    return {
      type: RecommendationType.workload_burnout_review,
      title: "Workload and Burnout Review",
      description: "Work-life balance score is low.",
      suggestedAction: "Adjust sprint load and rebalance commitments.",
      priority: RecommendationPriority.medium,
    };
  }

  if (scores.q4 <= 5) {
    return {
      type: RecommendationType.manager_alignment,
      title: "Manager Alignment",
      description: "Manager support score indicates potential disconnect.",
      suggestedAction: "Run a manager-member alignment session this sprint.",
      priority: RecommendationPriority.medium,
    };
  }

  if (scores.q7 <= 6) {
    return {
      type: RecommendationType.retention_risk_outreach,
      title: "Retention Risk Outreach",
      description: "Low likelihood to recommend indicates retention risk.",
      suggestedAction: "Initiate a proactive outreach and explore flight risk indicators.",
      priority: RecommendationPriority.high,
    };
  }

  if (drop >= 15) {
    return {
      type: RecommendationType.rapid_sentiment_investigation,
      title: "Rapid Sentiment Investigation",
      description: "Sentiment dropped sharply cycle-over-cycle.",
      suggestedAction: "Investigate recent sprint events, blockers, and team dynamics.",
      priority: RecommendationPriority.high,
    };
  }

  if (composite < 40) {
    return {
      type: RecommendationType.mentorship_development_path,
      title: "Mentorship and Development Path",
      description: "Sustained low composite sentiment.",
      suggestedAction: "Connect member to a mentor and align with development goals.",
      priority: RecommendationPriority.high,
    };
  }

  return null;
}

async function main() {
  // Clean existing data (skip if DB is fresh)
  try {
    await prisma.recommendation.deleteMany();
    await prisma.riskAlert.deleteMany();
    await prisma.managerNote.deleteMany();
    await prisma.sentimentScore.deleteMany();
    await prisma.pulseSurveyResponse.deleteMany();
    await prisma.pulseSurveyForm.deleteMany();
    await prisma.member.deleteMany();
    await prisma.team.deleteMany();
    await prisma.project.deleteMany();
    await prisma.account.deleteMany();
  } catch (e) {
    // Tables may not exist if DB is newly created
    console.log("Skipping cleanup (fresh database)");
  }

  const account = await prisma.account.create({
    data: {
      name: "CitiusTech Delivery - Pulse Demo",
    },
  });

  const project = await prisma.project.create({
    data: {
      accountId: account.id,
      name: "Team Sentiment Pulse",
      status: "active",
      startDate: new Date("2026-01-01"),
    },
  });

  const baseCycle = new Date("2026-03-01");

  for (let teamIndex = 0; teamIndex < TEAM_NAMES.length; teamIndex += 1) {
    const team = await prisma.team.create({
      data: {
        projectId: project.id,
        name: `${TEAM_NAMES[teamIndex]} Team`,
      },
    });

    const manager = await prisma.member.create({
      data: {
        teamId: team.id,
        name: `${TEAM_NAMES[teamIndex]} Manager`,
        email: `${TEAM_NAMES[teamIndex].toLowerCase()}.manager@pulsecheck.ai`,
        role: "Manager",
        startDate: new Date("2024-01-15"),
        tenureMonths: 28,
      },
    });

    await prisma.member.update({
      where: { id: manager.id },
      data: { deliveryLeadId: manager.id },
    });

    await prisma.team.update({
      where: { id: team.id },
      data: { managerId: manager.id },
    });

    const members: { id: string; name: string }[] = [];

    for (let memberIndex = 1; memberIndex <= 8; memberIndex += 1) {
      const member = await prisma.member.create({
        data: {
          teamId: team.id,
          name: `${TEAM_NAMES[teamIndex]} Member ${memberIndex}`,
          email: `${TEAM_NAMES[teamIndex].toLowerCase()}.member${memberIndex}@pulsecheck.ai`,
          role: memberIndex % 4 === 0 ? "Senior Engineer" : "Engineer",
          managerId: manager.id,
          deliveryLeadId: manager.id,
          startDate: addDays(new Date("2024-01-01"), memberIndex * 11),
          tenureMonths: 14 + memberIndex,
        },
      });
      members.push({ id: member.id, name: member.name });
    }

    const form = await prisma.pulseSurveyForm.create({
      data: {
        teamId: team.id,
        title: "Team Sentiment Survey Form",
        cadence: "bi-weekly",
        allowAnonymous: true,
        questions: QUESTION_SET,
      },
    });

    for (let memberIndex = 0; memberIndex < members.length; memberIndex += 1) {
      const member = members[memberIndex];
      const baseline = 8 - teamIndex * 0.6 - memberIndex * 0.12;
      const drift = memberIndex % 3 === 0 ? -0.45 : memberIndex % 4 === 0 ? -0.25 : 0.08;
      let below4Count = 0;
      let previousComposite = 0;

      for (let cycle = 0; cycle < CYCLE_COUNT; cycle += 1) {
        const cycleStart = addDays(baseCycle, cycle * 14);
        const scores = responseForCycle(baseline, cycle, drift);

        if (teamIndex === 4 && memberIndex <= 2 && cycle >= 2) {
          scores.q1 = clamp(4 - (cycle - 2));
          scores.q2 = clamp(5 - (cycle - 2));
          scores.q3 = clamp(4 - (cycle - 2));
          scores.q7 = clamp(6 - (cycle - 2));
        }

        const composite = compositeScore(scores);
        if (scores.q1 <= 4) below4Count += 1;
        const disengagement = disengagementScore(composite, below4Count, scores.q7 <= 6);
        const drop = cycle === 0 ? 0 : previousComposite - composite;

        await prisma.pulseSurveyResponse.create({
          data: {
            formId: form.id,
            submissionMode: memberIndex % 6 === 0 ? SubmissionMode.anonymous : SubmissionMode.named,
            memberId: memberIndex % 6 === 0 ? null : member.id,
            anonymousToken: memberIndex % 6 === 0 ? `anon_${teamIndex}_${memberIndex}` : null,
            teamId: team.id,
            projectId: project.id,
            cycleStart,
            q1: scores.q1,
            q2: scores.q2,
            q3: scores.q3,
            q4: scores.q4,
            q5: scores.q5,
            q6: scores.q6,
            q7: scores.q7,
            feedback:
              composite < 40
                ? "Current sprint feels unsustainable. Need support and clearer priorities."
                : "Sprint is manageable, but collaboration could improve.",
            submittedAt: addDays(cycleStart, 3),
          },
        });

        await prisma.sentimentScore.create({
          data: {
            memberId: member.id,
            cycleStart,
            pulseScore: scores.q1,
            jobSatisfactionScore: scores.q2,
            workLifeBalanceScore: scores.q3,
            managerSupportScore: scores.q4,
            growthScore: scores.q5,
            roleClarityScore: scores.q6,
            recommendationScore: scores.q7,
            compositeScore: composite,
            disengagementScore: disengagement,
            riskLevel: riskLevelForComposite(composite),
          },
        });

        const rec = recommendationForScores(scores, composite, drop);
        if (rec && cycle >= CYCLE_COUNT - 2) {
          await prisma.recommendation.create({
            data: {
              memberId: member.id,
              type: rec.type,
              title: rec.title,
              description: rec.description,
              suggestedAction: rec.suggestedAction,
              priority: rec.priority,
              status: RecommendationStatus.pending,
              createdBy: "system",
              targetDate: addDays(cycleStart, 10),
            },
          });
        }

        if (drop >= 15) {
          await prisma.riskAlert.create({
            data: {
              memberId: member.id,
              alertType: AlertType.sentiment_sudden_drop,
              severity: AlertSeverity.high,
              message: `Composite dropped by ${drop} points in the latest cycle.`,
              triggeredAt: addDays(cycleStart, 3),
            },
          });
        }

        if (composite < 40 && cycle >= 2) {
          await prisma.riskAlert.create({
            data: {
              memberId: member.id,
              alertType: AlertType.chronic_low_engagement,
              severity: AlertSeverity.high,
              message: "Composite score below 40 for multiple cycles.",
              triggeredAt: addDays(cycleStart, 3),
            },
          });
        }

        if (disengagement > 80) {
          await prisma.riskAlert.create({
            data: {
              memberId: member.id,
              alertType: AlertType.critical_disengagement,
              severity: AlertSeverity.critical,
              message: "Disengagement score crossed critical threshold (>80).",
              triggeredAt: addDays(cycleStart, 3),
            },
          });
        }

        if (scores.q2 <= 4) {
          await prisma.riskAlert.create({
            data: {
              memberId: member.id,
              alertType: AlertType.low_job_satisfaction,
              severity: AlertSeverity.medium,
              message: "Job satisfaction score is <= 4.",
              triggeredAt: addDays(cycleStart, 3),
            },
          });
        }

        if (scores.q3 <= 4) {
          await prisma.riskAlert.create({
            data: {
              memberId: member.id,
              alertType: AlertType.poor_worklife_balance,
              severity: AlertSeverity.medium,
              message: "Work-life balance score is <= 4.",
              triggeredAt: addDays(cycleStart, 3),
            },
          });
        }

        if (scores.q4 <= 4) {
          await prisma.riskAlert.create({
            data: {
              memberId: member.id,
              alertType: AlertType.low_manager_support,
              severity: AlertSeverity.medium,
              message: "Manager support score is <= 4.",
              triggeredAt: addDays(cycleStart, 3),
            },
          });
        }

        if (scores.q7 <= 6) {
          await prisma.riskAlert.create({
            data: {
              memberId: member.id,
              alertType: AlertType.low_recommendation,
              severity: AlertSeverity.medium,
              message: "Likelihood-to-recommend score is <= 6.",
              triggeredAt: addDays(cycleStart, 3),
            },
          });
        }

        previousComposite = composite;
      }

      await prisma.managerNote.create({
        data: {
          memberId: member.id,
          managerId: manager.id,
          score: 62,
          note: "Watch workload pressure and increase 1:1 frequency over the next sprint.",
          notedAt: new Date("2026-05-28"),
        },
      });
    }
  }

  console.log("Seed complete: 5 teams, 8 members per team, 6 cycles, alerts/recommendations generated.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
