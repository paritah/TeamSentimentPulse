import axios from "axios";
import * as XLSX from "xlsx";
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

function firstSheetRowsFromWorkbook(workbook: XLSX.WorkBook): Array<Record<string, unknown>> {
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [];
  const sheet = workbook.Sheets[firstSheetName];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json(sheet);
}

function decodeToText(buffer: Buffer): string {
  return buffer.toString("utf8");
}

function isLikelyHtml(text: string): boolean {
  const sample = text.slice(0, 1200).toLowerCase();
  return (
    sample.includes("<html") ||
    sample.includes("<!doctype html") ||
    sample.includes("<head") ||
    sample.includes("<body")
  );
}

function parseRowsFromDownloadedContent(
  buffer: Buffer,
  contentTypeHeader?: string
): Array<Record<string, unknown>> {
  const contentType = (contentTypeHeader || "").toLowerCase();

  // Handle CSV payloads explicitly.
  if (contentType.includes("text/csv") || contentType.includes("application/csv")) {
    const text = decodeToText(buffer);
    const workbook = XLSX.read(text, { type: "string", cellFormula: false });
    return firstSheetRowsFromWorkbook(workbook);
  }

  // Default path: parse as xlsx/xls binary.
  try {
    const workbook = XLSX.read(buffer, { type: "buffer", cellFormula: false });
    return firstSheetRowsFromWorkbook(workbook);
  } catch {
    // If binary parse fails, attempt HTML table parse for rare endpoints that return tabular HTML.
    const text = decodeToText(buffer);
    if (isLikelyHtml(text)) {
      const hasTable = /<table[\s\S]*?>[\s\S]*?<\/table>/i.test(text);
      if (!hasTable) {
        throw new Error(
          "EXCEL_IMPORT_URL returned an HTML page instead of an Excel/CSV file. Use a direct public download link (not a view/edit SharePoint URL that requires sign-in)."
        );
      }

      const workbook = XLSX.read(text, { type: "string", cellFormula: false });
      return firstSheetRowsFromWorkbook(workbook);
    }

    throw new Error(
      "Unable to parse EXCEL_IMPORT_URL response as Excel/CSV. Verify the link points directly to a downloadable survey export file."
    );
  }
}

function buildExcelUrlCandidates(rawUrl: string): string[] {
  const out: string[] = [];
  const add = (u: string) => {
    if (!out.includes(u)) out.push(u);
  };

  add(rawUrl);

  try {
    const parsed = new URL(rawUrl);
    const isSharePointDoc = parsed.pathname.toLowerCase().includes("/_layouts/15/doc.aspx");

    if (!isSharePointDoc) return out;

    const docDownload = new URL(parsed.toString());
    docDownload.searchParams.set("download", "1");
    docDownload.searchParams.set("action", "default");
    docDownload.searchParams.delete("mobileredirect");
    docDownload.searchParams.delete("wdMsFormsCorrelationId");
    docDownload.searchParams.delete("wdtf");
    add(docDownload.toString());

    const layoutsDownload = new URL(docDownload.toString());
    layoutsDownload.pathname = layoutsDownload.pathname.replace(
      /\/Doc\.aspx$/i,
      "/download.aspx"
    );
    add(layoutsDownload.toString());
  } catch {
    // Keep original URL only if parsing fails.
  }

  return out;
}

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

function excelSerialToDate(serial: number | string): Date {
  if (typeof serial === "string") {
    const d = new Date(serial);
    return isNaN(d.getTime()) ? new Date() : d;
  }
  // Excel date serial: days since Jan 1, 1900
  // JS epoch: Jan 1, 1970 = 25569 in Excel serial
  const ms = (serial - 25569) * 86400 * 1000;
  return new Date(ms);
}

function snapToMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust to Monday
  return new Date(d.setDate(diff));
}

interface SurveyRow {
  name?: string;
  email?: string;
  start?: Date;
  completion?: Date;
  q1?: number;
  q2?: number;
  q3?: number;
  q4?: number;
  q5?: number;
  q6?: number;
  q7?: number;
  q8?: string;
}

export async function syncMicrosoftFormsResponses() {
  try {
    const excelUrl = process.env.EXCEL_IMPORT_URL;
    if (!excelUrl) {
      console.log("EXCEL_IMPORT_URL not configured, skipping auto-sync");
      return { success: false, error: "EXCEL_IMPORT_URL not configured" };
    }

    console.log("🔄 Starting Microsoft Forms auto-sync...");

    const urlCandidates = buildExcelUrlCandidates(excelUrl);
    let rows: Array<Record<string, unknown>> | null = null;
    let lastError: unknown = null;

    for (const urlCandidate of urlCandidates) {
      try {
        const response = await axios.get(urlCandidate, {
          responseType: "arraybuffer",
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          },
          timeout: 30000,
        });

        const buffer = Buffer.from(response.data);
        rows = parseRowsFromDownloadedContent(
          buffer,
          response.headers["content-type"]
        );
        break;
      } catch (err) {
        lastError = err;
      }
    }

    if (!rows) {
      throw lastError instanceof Error
        ? lastError
        : new Error("Failed to download and parse Excel/CSV response file");
    }

    if (rows.length === 0) {
      console.log("✓ No new responses in Excel file");
      return { success: true, imported: 0, skipped: 0 };
    }

    // Parse headers
    const headers = Object.keys(rows[0] || {});
    const fieldMap = new Map<string, FieldKey>();
    for (const header of headers) {
      const field = mapColumn(header);
      if (field) fieldMap.set(header, field);
    }

    // Ensure default project/account
    let account = await prisma.account.findFirst();
    if (!account) {
      account = await prisma.account.create({
        data: { name: "Default Account" },
      });
    }

    let project = await prisma.project.findFirst({
      where: { accountId: account.id },
    });
    if (!project) {
      project = await prisma.project.create({
          data: {
            accountId: account.id,
            name: "Default Project",
              status: "active",
            startDate: new Date(),
          },
      });
    }

    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      try {
        const row = rows[i];
        const parsed: SurveyRow = {};

        for (const [header, value] of Object.entries(row)) {
          const field = fieldMap.get(header);
          if (!field) continue;

          if (field === "completion" || field === "start") {
            parsed[field] = excelSerialToDate(value);
          } else if (field.startsWith("q") && field !== "q8") {
            const num = Number(value);
            if (!isNaN(num) && num >= 1 && num <= 10) {
              parsed[field as keyof PulseScores] = Math.round(num);
            }
          } else {
              parsed[field as "q8" | "name" | "email"] = String(value).trim();
          }
        }

        // Skip empty rows
        if (!parsed.name && !parsed.email) {
          skipped++;
          continue;
        }

        // Validate scores
        const scores: PulseScores = {
          q1: parsed.q1 || 5,
          q2: parsed.q2 || 5,
          q3: parsed.q3 || 5,
          q4: parsed.q4 || 5,
          q5: parsed.q5 || 5,
          q6: parsed.q6 || 5,
          q7: parsed.q7 || 5,
        };

        const submittedAt = parsed.completion || new Date();
        const cycleStart = snapToMonday(submittedAt);

        // Get or create team
        const teamName = parsed.email?.split("@")[1] || "Default Team";
        let team = await prisma.team.findFirst({
          where: { projectId: project.id, name: teamName },
        });
        if (!team) {
          team = await prisma.team.create({
            data: {
              projectId: project.id,
              name: teamName,
            },
          });
        }

        // Get or create member
        let member = await prisma.member.findFirst({
          where: { email: parsed.email || undefined, teamId: team.id },
        });

        if (!member && parsed.name && parsed.email) {
          member = await prisma.member.create({
            data: {
              teamId: team.id,
              name: parsed.name,
              email: parsed.email,
              role: "Engineer",
                startDate: new Date(),
                tenureMonths: 0,
            },
          });
        }

        if (!member) {
          skipped++;
          continue;
        }

        // Check for duplicate (same member, same cycle, same timestamp)
        const existing = await prisma.pulseSurveyResponse.findFirst({
          where: {
            memberId: member.id,
            cycleStart,
            submittedAt: {
              equals: submittedAt,
            },
          },
        });

        if (existing) {
          skipped++;
          continue;
        }

        // Create survey form if needed
        let form = await prisma.pulseSurveyForm.findFirst({
            where: { teamId: team.id },
        });
        if (!form) {
          form = await prisma.pulseSurveyForm.create({
            data: {
              teamId: team.id,
                title: "Pulse Survey",
                cadence: "Bi-weekly",
                allowAnonymous: true,
                questions: [],
            },
          });
        }

        // Create response
        const composite = compositeScore(scores);
        const disengagement = disengagementScore(composite, 0, false);
        const riskLevel = riskLevelForComposite(composite);

        await prisma.pulseSurveyResponse.create({
          data: {
            memberId: member.id,
            teamId: team.id,
            formId: form.id,
            cycleStart,
            submittedAt,
              submissionMode: "Named" as SubmissionMode,
            q1: scores.q1,
            q2: scores.q2,
            q3: scores.q3,
            q4: scores.q4,
            q5: scores.q5,
            q6: scores.q6,
            q7: scores.q7,
            feedback: parsed.q8 || "",
          },
        });

        // Create sentiment score
        await prisma.sentimentScore.upsert({
          where: {
            memberId_cycleStart: { memberId: member.id, cycleStart },
          },
          update: { compositeScore: composite, riskLevel, disengagement },
          create: {
            memberId: member.id,
            cycleStart,
            compositeScore: composite,
            riskLevel,
            disengagement,
          },
        });

        imported++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Row ${i + 2}: ${msg}`);
      }
    }

    console.log(
      `✓ Auto-sync complete: ${imported} imported, ${skipped} skipped`
    );
    return { success: true, imported, skipped, errors };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error("❌ Auto-sync failed:", error);
    return { success: false, error };
  }
}
