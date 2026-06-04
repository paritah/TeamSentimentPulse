"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { sendAlertDigestEmail, type AlertEmailPayload } from "@/lib/email";

export async function acknowledgeAlert(alertId: string, actionTaken: string) {
  await prisma.riskAlert.update({
    where: { id: alertId },
    data: {
      acknowledgedAt: new Date(),
      acknowledgedBy: "Delivery Lead",
      actionTaken: actionTaken || "Acknowledged",
    },
  });
  revalidatePath("/alerts");
}

export async function resolveAlert(alertId: string) {
  await prisma.riskAlert.update({
    where: { id: alertId },
    data: {
      resolvedAt: new Date(),
    },
  });
  revalidatePath("/alerts");
}

export async function sendAlertDigest(): Promise<{ success: boolean; error?: string; count?: number }> {
  const alerts = await prisma.riskAlert.findMany({
    where: {
      resolvedAt: null,
      severity: { in: ["high", "critical"] },
    },
    include: {
      member: { include: { team: true } },
    },
    orderBy: [{ severity: "desc" }, { triggeredAt: "desc" }],
    take: 50,
  });

  if (alerts.length === 0) {
    return { success: true, count: 0 };
  }

  const payload: AlertEmailPayload[] = alerts.map((alert) => ({
    memberId: alert.memberId,
    memberName: alert.member.name,
    teamName: alert.member.team.name,
    alertType: alert.alertType,
    severity: alert.severity,
    message: alert.message,
    triggeredAt: alert.triggeredAt.toISOString().slice(0, 10),
  }));

  const result = await sendAlertDigestEmail(payload);
  return { ...result, count: alerts.length };
}
