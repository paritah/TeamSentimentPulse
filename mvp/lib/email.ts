import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export type AlertEmailPayload = {
  memberId: string;
  memberName: string;
  teamName: string;
  alertType: string;
  severity: string;
  message: string;
  triggeredAt: string;
};

function severityColor(severity: string): string {
  if (severity === "critical") return "#dc2626";
  if (severity === "high") return "#ea580c";
  return "#d97706";
}

function buildDigestHtml(alerts: AlertEmailPayload[]): string {
  const rows = alerts
    .map(
      (alert) => `
      <tr>
        <td style="padding:10px 8px;border-bottom:1px solid #1e3a5f;color:#ffffff;font-weight:600">${alert.memberName}</td>
        <td style="padding:10px 8px;border-bottom:1px solid #1e3a5f;color:#94a3b8">${alert.teamName}</td>
        <td style="padding:10px 8px;border-bottom:1px solid #1e3a5f">
          <span style="background:${severityColor(alert.severity)};color:#fff;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700;text-transform:uppercase">${alert.severity}</span>
        </td>
        <td style="padding:10px 8px;border-bottom:1px solid #1e3a5f;color:#e2e8f0">${alert.alertType.replaceAll("_", " ")}</td>
        <td style="padding:10px 8px;border-bottom:1px solid #1e3a5f;color:#94a3b8;font-size:12px">${alert.message}</td>
        <td style="padding:10px 8px;border-bottom:1px solid #1e3a5f;color:#64748b;font-size:12px">${alert.triggeredAt}</td>
      </tr>`,
    )
    .join("");

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background:#071321;font-family:Arial,sans-serif">
  <div style="max-width:800px;margin:32px auto;background:#0d2035;border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,0.1)">
    <div style="padding:28px 32px;background:linear-gradient(135deg,#0f4c75,#071321)">
      <p style="margin:0 0 4px;color:#22d3ee;font-size:11px;font-weight:700;letter-spacing:0.15em;text-transform:uppercase">PulseCheck</p>
      <h1 style="margin:0;color:#ffffff;font-size:22px">Alert Digest — Action Required</h1>
      <p style="margin:8px 0 0;color:#94a3b8;font-size:14px">${alerts.length} unresolved HIGH / CRITICAL alert${alerts.length !== 1 ? "s" : ""} require your attention.</p>
    </div>
    <div style="padding:24px 32px">
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="color:#64748b;text-transform:uppercase;font-size:11px;letter-spacing:0.08em">
            <th style="padding:8px;text-align:left">Member</th>
            <th style="padding:8px;text-align:left">Team</th>
            <th style="padding:8px;text-align:left">Severity</th>
            <th style="padding:8px;text-align:left">Type</th>
            <th style="padding:8px;text-align:left">Message</th>
            <th style="padding:8px;text-align:left">Triggered</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div style="padding:20px 32px;border-top:1px solid rgba(255,255,255,0.1);color:#64748b;font-size:12px">
      Log in to PulseCheck to acknowledge alerts and assign recommended actions.
    </div>
  </div>
</body>
</html>`;
}

export async function sendAlertDigestEmail(alerts: AlertEmailPayload[]): Promise<{ success: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.ALERT_EMAIL_TO;
  const from = process.env.ALERT_EMAIL_FROM ?? "PulseCheck Alerts <onboarding@resend.dev>";

  if (!apiKey || apiKey === "re_REPLACE_WITH_YOUR_KEY") {
    return { success: false, error: "RESEND_API_KEY not configured in .env" };
  }
  if (!to || to === "delivery-lead@yourcompany.com") {
    return { success: false, error: "ALERT_EMAIL_TO not configured in .env" };
  }

  const { error } = await resend.emails.send({
    from,
    to,
    subject: `PulseCheck Alert Digest — ${alerts.length} unresolved HIGH/CRITICAL alert${alerts.length !== 1 ? "s" : ""}`,
    html: buildDigestHtml(alerts),
  });

  if (error) {
    return { success: false, error: error.message };
  }
  return { success: true };
}

export async function sendSingleAlertEmail(alert: AlertEmailPayload): Promise<{ success: boolean; error?: string }> {
  return sendAlertDigestEmail([alert]);
}
