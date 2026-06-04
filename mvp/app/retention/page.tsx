import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { latestCycleDate } from "@/lib/dashboard";

function churnBadge(score: number) {
  if (score >= 80) return "Critical";
  if (score >= 60) return "High";
  if (score >= 40) return "Moderate";
  return "Low";
}

export default async function RetentionPage() {
  const latest = await latestCycleDate();
  if (!latest) {
    return <div className="panel">No sentiment data found.</div>;
  }

  const rows = await prisma.sentimentScore.findMany({
    where: { cycleStart: latest },
    include: {
      member: {
        include: {
          team: true,
          recommendations: {
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      },
    },
    orderBy: { disengagementScore: "desc" },
    take: 80,
  });

  return (
    <div className="space-y-4">
      <h2 className="font-display text-2xl font-semibold text-white">Retention Risk View</h2>
      <p className="text-sm text-slate-300">Members sorted by disengagement risk score from latest pulse cycle.</p>

      <section className="panel overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-left text-slate-300">
            <tr>
              <th className="px-2 py-2">Member</th>
              <th className="px-2 py-2">Team</th>
              <th className="px-2 py-2">Disengagement</th>
              <th className="px-2 py-2">Churn Badge</th>
              <th className="px-2 py-2">Latest Recommendation</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-white/10 text-slate-100">
                <td className="px-2 py-2">
                  <Link href={`/member/${row.memberId}`} className="text-cyan-300">
                    {row.member.name}
                  </Link>
                </td>
                <td className="px-2 py-2">{row.member.team.name}</td>
                <td className="px-2 py-2">{row.disengagementScore}</td>
                <td className="px-2 py-2">{churnBadge(row.disengagementScore)}</td>
                <td className="px-2 py-2 text-slate-300">{row.member.recommendations[0]?.title ?? "No recommendation"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
