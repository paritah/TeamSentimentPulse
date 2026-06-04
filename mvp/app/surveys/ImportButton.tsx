"use client";

import { useRef, useState, useTransition } from "react";

const MS_FORMS_URL =
  "https://forms.office.com/Pages/ResponsePage.aspx?id=yRhxcMBls0WkNTPv43zwzA5fxkSHKkhAo6rmoZgWEuVUMDNFOE84S0hBWDJaVU5LVkVKMEo3QVU2VS4u&origin=Invitation&channel=1";

const MS_FORMS_RESULTS_URL =
  "https://forms.office.com/Pages/AnalysisPage.aspx?id=yRhxcMBls0WkNTPv43zwzA5fxkSHKkhAo6rmoZgWEuVUMDNFOE84S0hBWDJaVU5LVkVKMEo3QVU2VS4u";

type ImportResult = {
  success: boolean;
  imported: number;
  skipped: number;
  errors: string[];
};

export function ImportSurveyButton() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ImportResult | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    startTransition(async () => {
      setResult(null);
      const body = new FormData();
      body.append("file", file);

      const res = await fetch("/api/import/survey", { method: "POST", body });
      const json: ImportResult = await res.json();
      setResult(json);

      if (inputRef.current) inputRef.current.value = "";
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.csv"
          className="hidden"
          onChange={handleFile}
        />

        {/* Open the live form */}
        <a
          href={MS_FORMS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full border border-sky-400/40 bg-sky-400/10 px-4 py-2 text-sm font-medium text-sky-200 transition hover:bg-sky-400/25"
        >
          Open Survey Form ↗
        </a>

        {/* Import the Excel export */}
        <button
          onClick={() => inputRef.current?.click()}
          disabled={pending}
          className="rounded-full border border-emerald-400/40 bg-emerald-400/10 px-4 py-2 text-sm font-medium text-emerald-200 transition hover:bg-emerald-400/25 disabled:opacity-40"
        >
          {pending ? "Importing…" : "Import Responses (.xlsx)"}
        </button>

        {/* How-to toggle */}
        <button
          onClick={() => setShowHelp((v) => !v)}
          className="text-xs text-slate-400 underline"
        >
          {showHelp ? "Hide instructions" : "How to export?"}
        </button>
      </div>

      {/* MS Forms export instructions */}
      {showHelp ? (
        <div className="rounded-xl border border-white/10 bg-app-panel-soft/80 p-4 text-sm text-slate-200">
          <p className="mb-2 font-semibold text-white">How to export responses from Microsoft Forms:</p>
          <ol className="list-decimal space-y-1.5 pl-5">
            <li>
              Open the{" "}
              <a href={MS_FORMS_RESULTS_URL} target="_blank" rel="noopener noreferrer" className="text-cyan-300 underline">
                form responses page
              </a>{" "}
              (requires form owner access).
            </li>
            <li>
              Click <strong>Responses</strong> tab → <strong>Open in Excel</strong> (or{" "}
              <strong>More options → Download responses</strong>).
            </li>
            <li>Save the downloaded <code className="rounded bg-white/10 px-1">.xlsx</code> file.</li>
            <li>Click <strong>Import Responses (.xlsx)</strong> above and select the file.</li>
          </ol>
          <p className="mt-3 text-xs text-slate-400">
            The importer reads: Name, Email, Completion time, Q1–Q7 scores, and Q8 feedback.
            Rows without Name/Email are imported as Anonymous. Re-importing the same file is safe — duplicates are skipped.
          </p>
        </div>
      ) : null}

      {/* Result feedback */}
      {result ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-white/15 px-3 py-1 text-xs text-slate-300">
            ✓ {result.imported} imported · {result.skipped} skipped
          </span>
          {result.errors.length > 0 ? (
            <details>
              <summary className="cursor-pointer text-xs text-rose-300">
                {result.errors.length} error{result.errors.length !== 1 ? "s" : ""}
              </summary>
              <ul className="mt-1 max-h-32 overflow-auto rounded border border-rose-400/30 bg-rose-900/30 p-2 text-xs text-rose-200">
                {result.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </details>
          ) : null}
          <button onClick={() => window.location.reload()} className="text-xs text-cyan-300 underline">
            Refresh
          </button>
        </div>
      ) : null}
    </div>
  );
}
