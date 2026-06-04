import { prisma } from "@/lib/prisma";

export async function GET() {
  const rows = await prisma.pulseSurveyResponse.findMany({
    include: { team: true, member: true },
    orderBy: [{ cycleStart: "desc" }, { submittedAt: "desc" }],
  });

  const header = [
    "cycle_start",
    "team",
    "member",
    "submission_mode",
    "q1",
    "q2",
    "q3",
    "q4",
    "q5",
    "q6",
    "q7",
    "feedback",
    "submitted_at",
  ];

  const csvLines = [
    header.join(","),
    ...rows.map((row) =>
      [
        row.cycleStart.toISOString().slice(0, 10),
        row.team.name,
        row.member?.name ?? "Anonymous",
        row.submissionMode,
        row.q1,
        row.q2,
        row.q3,
        row.q4,
        row.q5,
        row.q6,
        row.q7,
        `"${row.feedback.replaceAll('"', '""')}"`,
        row.submittedAt.toISOString(),
      ].join(","),
    ),
  ];

  return new Response(csvLines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=pulse-survey-results.csv",
    },
  });
}
