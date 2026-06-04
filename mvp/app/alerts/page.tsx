import { prisma } from "@/lib/prisma";
import { severityBadgeClass } from "@/lib/dashboard";
import { SendDigestButton, AlertRowActions } from "./AlertActions";

export default async function AlertsPage() {
  const alerts = await prisma.riskAlert.findMany({
    where: { resolvedAt: null },
    include: {
      member: {
        include: {
          team: true,
        },
      },
    },
    orderBy: [{ severity: "desc" }, { triggeredAt: "desc" }],
    take: 250,
  });

  const highCriticalCount = alerts.filter(
    (a) => a.severity === "high" || a.severity === "critical",
  ).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-semibold text-white">Alert Center</h2>
          <p className="text-sm text-slate-300">
            Threshold-based survey alerts — acknowledge, resolve, or email a digest to the delivery lead.
          </p>
        </div>
        <SendDigestButton highCriticalCount={highCriticalCount} />
      </div>

      <section className="panel overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-left text-slate-300">
            <tr>
              <th className="px-2 py-2">Severity</th>
              <th className="px-2 py-2">Type</th>
              <th className="px-2 py-2">Member</th>
              <th className="px-2 py-2">Team</th>
              <th className="px-2 py-2">Triggered</th>
              <th className="px-2 py-2">Message</th>
              <th className="px-2 py-2">Acknowledged</th>
              <th className="px-2 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {alerts.map((alert) => (
              <tr key={alert.id} className="border-t border-white/10 text-slate-100">
                <td className="px-2 py-2">
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-semibold ${severityBadgeClass(alert.severity)}`}
                  >
                    {alert.severity}
                  </span>
                </td>
                <td className="px-2 py-2">{alert.alertType.replaceAll("_", " ")}</td>
                <td className="px-2 py-2">{alert.member.name}</td>
                <td className="px-2 py-2">{alert.member.team.name}</td>
                <td className="px-2 py-2">{alert.triggeredAt.toISOString().slice(0, 10)}</td>
                <td className="px-2 py-2 text-slate-300">{alert.message}</td>
                <td className="px-2 py-2 text-slate-400 text-xs">
                  {alert.acknowledgedAt
                    ? `${alert.acknowledgedAt.toISOString().slice(0, 10)} by ${alert.acknowledgedBy}`
                    : "—"}
                </td>
                <td className="px-2 py-2">
                  <AlertRowActions alertId={alert.id} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
