import cron from "node-cron";
import { syncMicrosoftFormsResponses } from "@/lib/microsoft-forms-sync";

let syncJob: ReturnType<typeof cron.schedule> | null = null;

export function startAutoSync() {
  if (syncJob) {
    console.log("Auto-sync is already running");
    return;
  }

  // Run every 5 minutes: */5 * * * *
  syncJob = cron.schedule("*/5 * * * *", async () => {
    console.log(`[${new Date().toISOString()}] Running auto-sync...`);
    try {
      await syncMicrosoftFormsResponses();
    } catch (err) {
      console.error("Auto-sync error:", err);
    }
  });

  console.log("✓ Auto-sync service started (runs every 5 minutes)");
}

export function stopAutoSync() {
  if (syncJob) {
    syncJob.stop();
    syncJob = null;
    console.log("✓ Auto-sync service stopped");
  }
}
