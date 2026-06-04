import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function RecommendationsPage() {
  const recommendations = await prisma.recommendation.findMany({
    include: {
      member: {
        include: {
          team: true,
        },
      },
    },
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    take: 250,
  });

  return (
    <div className="space-y-4">
      <h2 className="font-display text-2xl font-semibold text-white">Recommendations</h2>
      <p className="text-sm text-slate-300">Action items generated from pulse-threshold triggers plus manual manager actions.</p>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {recommendations.map((item) => (
          <article key={item.id} className="panel bg-app-panel-soft/70">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold text-white">{item.title}</p>
              <span className="rounded-full bg-cyan-400/10 px-2 py-1 text-xs font-medium uppercase tracking-wide text-cyan-200">
                {item.priority}
              </span>
            </div>
            <p className="mt-2 text-sm text-slate-300">{item.description}</p>
            <p className="mt-2 text-sm text-slate-200">{item.suggestedAction}</p>
            <p className="mt-3 text-xs text-slate-300">{item.member.name} - {item.member.team.name}</p>
            <p className="text-xs text-slate-400">Target date: {item.targetDate.toISOString().slice(0, 10)}</p>
            <Link href={`/member/${item.memberId}`} className="mt-3 inline-block text-sm font-medium text-cyan-300">
              Open member profile
            </Link>
          </article>
        ))}
      </div>
    </div>
  );
}
