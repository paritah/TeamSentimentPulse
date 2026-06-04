import { prisma } from "@/lib/prisma";

export function riskBadgeClass(risk: "green" | "yellow" | "red") {
  if (risk === "green") return "bg-emerald-100 text-emerald-800";
  if (risk === "yellow") return "bg-amber-100 text-amber-800";
  return "bg-rose-100 text-rose-800";
}

export function severityBadgeClass(severity: "low" | "medium" | "high" | "critical") {
  if (severity === "critical") return "bg-red-600 text-white";
  if (severity === "high") return "bg-orange-100 text-orange-800";
  if (severity === "medium") return "bg-amber-100 text-amber-800";
  return "bg-slate-100 text-slate-700";
}

export async function latestCycleDate(): Promise<Date | null> {
  const latest = await prisma.sentimentScore.findFirst({
    orderBy: { cycleStart: "desc" },
    select: { cycleStart: true },
  });
  return latest?.cycleStart ?? null;
}

export async function previousCycleDate(current: Date): Promise<Date | null> {
  const previous = await prisma.sentimentScore.findFirst({
    where: { cycleStart: { lt: current } },
    orderBy: { cycleStart: "desc" },
    select: { cycleStart: true },
  });
  return previous?.cycleStart ?? null;
}

export async function getOverviewMetrics() {
  const current = await latestCycleDate();
  if (!current) {
    return {
      totalTeams: 0,
      totalMembers: 0,
      activeAtRisk: 0,
      averageSentiment: 0,
      responseRate: 0,
      current,
      previous: null as Date | null,
    };
  }

  const previous = await previousCycleDate(current);
  const [totalTeams, totalMembers, scores, responses] = await Promise.all([
    prisma.team.count(),
    prisma.member.count({ where: { role: { not: "Manager" } } }),
    prisma.sentimentScore.findMany({ where: { cycleStart: current } }),
    prisma.pulseSurveyResponse.findMany({ where: { cycleStart: current } }),
  ]);

  const activeAtRisk = scores.filter((score) => score.compositeScore < 40).length;
  const averageSentiment =
    scores.length > 0
      ? Math.round(scores.reduce((sum, score) => sum + score.compositeScore, 0) / scores.length)
      : 0;
  const responseRate = totalMembers > 0 ? Math.min(100, Math.round((responses.length / totalMembers) * 100)) : 0;

  return {
    totalTeams,
    totalMembers,
    activeAtRisk,
    averageSentiment,
    responseRate,
    current,
    previous,
  };
}
