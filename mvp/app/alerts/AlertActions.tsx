"use client";

import { useTransition, useState } from "react";
import { acknowledgeAlert, resolveAlert, sendAlertDigest } from "@/app/actions/alerts";

export function SendDigestButton({ highCriticalCount }: { highCriticalCount: number }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);

  function handleSend() {
    startTransition(async () => {
      const res = await sendAlertDigest();
      if (res.count === 0) {
        setResult("No HIGH/CRITICAL alerts to send.");
      } else if (res.success) {
        setResult(`Email sent — ${res.count} alert${res.count !== 1 ? "s" : ""} included.`);
      } else {
        setResult(`Failed: ${res.error}`);
      }
    });
  }

  return (
    <div className="flex items-center gap-3">
      {result ? (
        <span className="rounded-full border border-cyan-300/30 px-3 py-1.5 text-xs text-cyan-200">{result}</span>
      ) : null}
      <button
        onClick={handleSend}
        disabled={pending || highCriticalCount === 0}
        className="rounded-full bg-cyan-400/15 border border-cyan-300/40 px-4 py-2 text-sm font-medium text-cyan-200 transition hover:bg-cyan-400/30 disabled:opacity-40"
      >
        {pending ? "Sending…" : `Email Alert Digest (${highCriticalCount})`}
      </button>
    </div>
  );
}

export function AlertRowActions({ alertId }: { alertId: string }) {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState<"ack" | "resolve" | null>(null);

  function handleAck() {
    startTransition(async () => {
      await acknowledgeAlert(alertId, "Acknowledged by delivery lead");
      setDone("ack");
    });
  }

  function handleResolve() {
    startTransition(async () => {
      await resolveAlert(alertId);
      setDone("resolve");
    });
  }

  if (done === "resolve") {
    return <span className="text-xs text-emerald-300">Resolved</span>;
  }
  if (done === "ack") {
    return (
      <button
        onClick={handleResolve}
        disabled={pending}
        className="text-xs text-slate-300 underline disabled:opacity-40"
      >
        Mark resolved
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleAck}
        disabled={pending}
        className="rounded border border-amber-400/40 px-2 py-1 text-xs text-amber-300 transition hover:border-amber-300 disabled:opacity-40"
      >
        Acknowledge
      </button>
      <button
        onClick={handleResolve}
        disabled={pending}
        className="rounded border border-emerald-400/40 px-2 py-1 text-xs text-emerald-300 transition hover:border-emerald-300 disabled:opacity-40"
      >
        Resolve
      </button>
    </div>
  );
}
