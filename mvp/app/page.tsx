import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getOverviewMetrics, riskBadgeClass } from "@/lib/dashboard";

function trendArrow(current: number, previous: number | null) {
  if (previous === null) return "→";
  if (current > previous) return "↑";
  if (current < previous) return "↓";
  return "→";
}

export default async function Home() {
  const metrics = await getOverviewMetrics();

  const teamCards = metrics.current
    ? await prisma.team.findMany({
        include: {
          members: {
            where: { role: { not: "Manager" } },
            include: {
              scores: {
                where: { cycleStart: metrics.current },
                select: { compositeScore: true, riskLevel: true },
              },
            },
          },
        },
        orderBy: { name: "asc" },
      })
    : [];

  const previousScores = metrics.previous
    ? await prisma.sentimentScore.findMany({
        where: { cycleStart: metrics.previous },
        include: { member: { select: { teamId: true } } },
      })
    : [];

  const previousByTeam = new Map<string, number>();
  for (const score of previousScores) {
    const currentValue = previousByTeam.get(score.member.teamId) ?? 0;
    previousByTeam.set(score.member.teamId, currentValue + score.compositeScore);
  }

  const previousCountByTeam = new Map<string, number>();
  for (const score of previousScores) {
    previousCountByTeam.set(score.member.teamId, (previousCountByTeam.get(score.member.teamId) ?? 0) + 1);
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <article className="panel">
          <p className="text-sm text-slate-300">Total Teams</p>
          <p className="metric">{metrics.totalTeams}</p>
        </article>
        <article className="panel">
          <p className="text-sm text-slate-300">Total Members</p>
          <p className="metric">{metrics.totalMembers}</p>
        </article>
        <article className="panel">
          <p className="text-sm text-slate-300">Active At-Risk</p>
          <p className="metric text-rose-300">{metrics.activeAtRisk}</p>
        </article>
        <article className="panel">
          <p className="text-sm text-slate-300">Avg Sentiment</p>
          <p className="metric">{metrics.averageSentiment}</p>
        </article>
        <article className="panel">
          <p className="text-sm text-slate-300">Response Rate</p>
          <p className="metric">{metrics.responseRate}%</p>
        </article>
      </section>

      <section className="panel">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-xl font-semibold text-white">Team Overview</h2>
            <p className="text-sm text-slate-300">
              Last cycle: {metrics.current ? metrics.current.toISOString().slice(0, 10) : "No data"}
            </p>
          </div>
          <Link
            href="/alerts"
            className="rounded-full border border-cyan-300/40 bg-cyan-400/10 px-4 py-2 text-sm font-medium text-cyan-200"
          >
            View Alert Center
          </Link>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {teamCards.map((team) => {
            const scores = team.members.flatMap((member) => member.scores);
            const averageCurrent =
              scores.length > 0
                ? Math.round(scores.reduce((sum, score) => sum + score.compositeScore, 0) / scores.length)
                : 0;

            const previousSum = previousByTeam.get(team.id) ?? 0;
            const previousCount = previousCountByTeam.get(team.id) ?? 0;
            const averagePrevious = previousCount > 0 ? Math.round(previousSum / previousCount) : null;
            const riskLevel = scores.some((score) => score.riskLevel === "red")
              ? "red"
              : scores.some((score) => score.riskLevel === "yellow")
                ? "yellow"
                : "green";

            return (
              <Link
                key={team.id}
                href={`/team/${team.id}`}
                className="rounded-xl border border-white/10 bg-app-panel-soft/60 p-4 transition hover:border-cyan-300/50"
              >
                <p className="text-lg font-semibold text-white">{team.name}</p>
                <p className="mt-1 text-sm text-slate-300">Members: {team.members.length}</p>
                <div className="mt-3 flex items-center gap-3">
                  <span className={`rounded-full px-2 py-1 text-xs font-semibold uppercase ${riskBadgeClass(riskLevel)}`}>
                    {riskLevel}
                  </span>
                  <span className="text-xl font-semibold text-cyan-200">{averageCurrent}</span>
                  <span className="text-slate-300">{trendArrow(averageCurrent, averagePrevious)}</span>
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
