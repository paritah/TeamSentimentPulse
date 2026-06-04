import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { riskBadgeClass } from "@/lib/dashboard";

type Params = {
  params: Promise<{ id: string }>;
};

export default async function TeamDetailPage({ params }: Params) {
  const { id } = await params;

  const team = await prisma.team.findUnique({
    where: { id },
    include: {
      manager: true,
      project: true,
      members: {
        include: {
          scores: {
            orderBy: { cycleStart: "desc" },
            take: 6,
          },
          responses: {
            orderBy: { submittedAt: "desc" },
            take: 1,
          },
        },
        orderBy: { name: "asc" },
      },
    },
  });

  if (!team) {
    notFound();
  }

  const members = team.members.filter((member) => member.id !== team.managerId);

  return (
    <div className="space-y-4">
      <section className="panel">
        <h2 className="font-display text-2xl font-semibold text-white">{team.name}</h2>
        <p className="mt-1 text-sm text-slate-300">Manager: {team.manager?.name ?? "Unassigned"}</p>
        <p className="text-sm text-slate-300">Project: {team.project.name}</p>
      </section>

      <section className="panel overflow-x-auto">
        <h3 className="mb-3 text-lg font-semibold text-white">Member Sentiment (Last 6 cycles)</h3>
        <table className="min-w-full text-sm">
          <thead className="text-left text-slate-300">
            <tr>
              <th className="px-2 py-2">Member</th>
              <th className="px-2 py-2">Latest Composite</th>
              <th className="px-2 py-2">Risk</th>
              <th className="px-2 py-2">Trend</th>
              <th className="px-2 py-2">Latest Feedback</th>
            </tr>
          </thead>
          <tbody>
            {members.map((member) => {
              const latest = member.scores[0];
              const previous = member.scores[1];
              const trend = !latest || !previous ? "→" : latest.compositeScore > previous.compositeScore ? "↑" : latest.compositeScore < previous.compositeScore ? "↓" : "→";
              return (
                <tr key={member.id} className="border-t border-white/10 text-slate-100">
                  <td className="px-2 py-2">
                    <Link href={`/member/${member.id}`} className="text-cyan-300">{member.name}</Link>
                  </td>
                  <td className="px-2 py-2">{latest?.compositeScore ?? "-"}</td>
                  <td className="px-2 py-2">
                    {latest ? (
                      <span className={`rounded-full px-2 py-1 text-xs font-semibold uppercase ${riskBadgeClass(latest.riskLevel)}`}>
                        {latest.riskLevel}
                      </span>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-2 py-2">{trend}</td>
                  <td className="max-w-sm truncate px-2 py-2 text-slate-300" title={member.responses[0]?.feedback ?? ""}>
                    {member.responses[0]?.feedback ?? "No feedback"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
