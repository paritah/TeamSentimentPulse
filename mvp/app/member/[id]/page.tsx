import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { riskBadgeClass, severityBadgeClass } from "@/lib/dashboard";

type Params = {
  params: Promise<{ id: string }>;
};

export default async function MemberProfilePage({ params }: Params) {
  const { id } = await params;

  const member = await prisma.member.findUnique({
    where: { id },
    include: {
      team: true,
      manager: true,
      scores: {
        orderBy: { cycleStart: "desc" },
        take: 6,
      },
      responses: {
        orderBy: { submittedAt: "desc" },
        take: 1,
      },
      alerts: {
        where: { resolvedAt: null },
        orderBy: { triggeredAt: "desc" },
        take: 20,
      },
      recommendations: {
        orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
        take: 10,
      },
      managerNotesAsTarget: {
        orderBy: { notedAt: "desc" },
        take: 10,
      },
    },
  });

  if (!member) {
    notFound();
  }

  const latest = member.scores[0];

  return (
    <div className="space-y-4">
      <section className="panel">
        <h2 className="font-display text-2xl font-semibold text-white">{member.name}</h2>
        <p className="mt-1 text-sm text-slate-300">{member.role} - {member.team.name}</p>
        <p className="text-sm text-slate-300">Manager: {member.manager?.name ?? "Unassigned"}</p>
        <p className="text-sm text-slate-300">Tenure: {member.tenureMonths} months</p>
        {latest ? (
          <div className="mt-3 flex items-center gap-2">
            <span className="text-sm text-slate-300">Latest composite:</span>
            <span className="text-xl font-semibold text-cyan-200">{latest.compositeScore}</span>
            <span className={`rounded-full px-2 py-1 text-xs font-semibold uppercase ${riskBadgeClass(latest.riskLevel)}`}>
              {latest.riskLevel}
            </span>
            <span className="text-sm text-rose-200">Disengagement: {latest.disengagementScore}</span>
          </div>
        ) : null}
      </section>

      <section className="panel">
        <h3 className="mb-2 text-lg font-semibold text-white">Timeline (last 6 cycles)</h3>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {member.scores.map((score) => (
            <article key={score.id} className="rounded-xl border border-white/10 bg-app-panel-soft/60 p-3">
              <p className="text-xs text-slate-300">{score.cycleStart.toISOString().slice(0, 10)}</p>
              <p className="text-lg font-semibold text-white">Composite {score.compositeScore}</p>
              <p className="text-sm text-slate-300">Q1 {score.pulseScore}, Q2 {score.jobSatisfactionScore}, Q3 {score.workLifeBalanceScore}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="panel">
        <h3 className="mb-2 text-lg font-semibold text-white">Latest Pulse Comment</h3>
        <p className="text-sm text-slate-200">{member.responses[0]?.feedback ?? "No latest comment."}</p>
      </section>

      <section className="panel">
        <h3 className="mb-2 text-lg font-semibold text-white">Active Alerts</h3>
        <div className="space-y-2">
          {member.alerts.map((alert) => (
            <article key={alert.id} className="rounded-xl border border-white/10 bg-app-panel-soft/60 p-3">
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-1 text-xs font-semibold ${severityBadgeClass(alert.severity)}`}>
                  {alert.severity}
                </span>
                <p className="text-sm text-slate-200">{alert.alertType.replaceAll("_", " ")}</p>
              </div>
              <p className="mt-1 text-sm text-slate-300">{alert.message}</p>
            </article>
          ))}
          {member.alerts.length === 0 ? <p className="text-sm text-slate-300">No active alerts.</p> : null}
        </div>
      </section>

      <section className="panel">
        <h3 className="mb-2 text-lg font-semibold text-white">Assigned Recommendations</h3>
        <div className="space-y-2">
          {member.recommendations.map((item) => (
            <article key={item.id} className="rounded-xl border border-white/10 bg-app-panel-soft/60 p-3">
              <p className="font-semibold text-white">{item.title}</p>
              <p className="text-sm text-slate-300">{item.suggestedAction}</p>
              <p className="text-xs text-slate-400">Status: {item.status} | Target: {item.targetDate.toISOString().slice(0, 10)}</p>
            </article>
          ))}
          {member.recommendations.length === 0 ? <p className="text-sm text-slate-300">No recommendations assigned.</p> : null}
        </div>
      </section>

      <section className="panel">
        <h3 className="mb-2 text-lg font-semibold text-white">Manager Notes</h3>
        <div className="space-y-2">
          {member.managerNotesAsTarget.map((note) => (
            <article key={note.id} className="rounded-xl border border-white/10 bg-app-panel-soft/60 p-3">
              <p className="text-sm text-slate-300">{note.notedAt.toISOString().slice(0, 10)}</p>
              <p className="text-sm text-slate-100">{note.note}</p>
            </article>
          ))}
          {member.managerNotesAsTarget.length === 0 ? <p className="text-sm text-slate-300">No manager notes yet.</p> : null}
        </div>
      </section>
    </div>
  );
}
