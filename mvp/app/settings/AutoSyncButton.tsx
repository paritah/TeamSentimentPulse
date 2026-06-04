"use client";

import { useState } from "react";

export function AutoSyncButton() {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    imported?: number;
    skipped?: number;
    error?: string;
  } | null>(null);

  async function handleSync() {
    setPending(true);
    setResult(null);

    try {
      const res = await fetch("/api/sync/forms", { method: "POST" });
      const data = await res.json();
      setResult(data);

      // Reload page if successful
      if (data.success) {
        setTimeout(() => window.location.reload(), 1500);
      }
    } catch (err) {
      setResult({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        onClick={handleSync}
        disabled={pending}
        className="rounded-full border border-cyan-400/40 bg-cyan-400/10 px-4 py-2 text-sm font-medium text-cyan-200 transition hover:bg-cyan-400/25 disabled:opacity-40"
      >
        {pending ? "Syncing..." : "🔄 Sync Now"}
      </button>

      {result && (
        <div
          className={`rounded-lg border px-3 py-2 text-sm ${
            result.success
              ? "border-emerald-400/30 bg-emerald-900/30 text-emerald-200"
              : "border-rose-400/30 bg-rose-900/30 text-rose-200"
          }`}
        >
          {result.success ? (
            <div>
              ✓ Synced: {result.imported} imported · {result.skipped} skipped
            </div>
          ) : (
            <div>❌ {result.error}</div>
          )}
        </div>
      )}
    </div>
  );
}
