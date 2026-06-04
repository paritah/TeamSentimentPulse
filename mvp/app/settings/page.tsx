import { prisma } from "@/lib/prisma";

const MS_FORMS_URL =
  "https://forms.office.com/Pages/ResponsePage.aspx?id=yRhxcMBls0WkNTPv43zwzA5fxkSHKkhAo6rmoZgWEuVUMDNFOE84S0hBWDJaVU5LVkVKMEo3QVU2VS4u&origin=Invitation&channel=1";

import { AutoSyncButton } from "./AutoSyncButton";

export default async function SettingsPage() {
  const forms = await prisma.pulseSurveyForm.findMany({
    include: { team: true },
    orderBy: { team: { name: "asc" } },
  });

  return (
    <div className="space-y-4">
      <h2 className="font-display text-2xl font-semibold text-white">Settings / Survey Management</h2>
      <p className="text-sm text-slate-300">MVP settings are read-only: bi-weekly cadence, anonymous policy, and form mappings.</p>

      {/* Live form link */}
      <section className="panel bg-app-panel-soft/70">
        <h3 className="mb-2 font-semibold text-white">Microsoft Forms — Live Survey</h3>
        <p className="text-sm text-slate-300">Team members complete the pulse survey via the link below (bi-weekly).</p>
        <a
          href={MS_FORMS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-block rounded-full border border-sky-400/40 bg-sky-400/10 px-4 py-2 text-sm font-medium text-sky-200 transition hover:bg-sky-400/25"
        >
          Open Team Sentiment Survey Form ↗
        </a>
        <p className="mt-2 text-xs text-slate-400 break-all">{MS_FORMS_URL}</p>
      </section>

        {/* Auto-sync from Excel */}
        <section className="panel bg-app-panel-soft/70">
          <h3 className="mb-2 font-semibold text-white">Auto-Sync from Excel</h3>
          <p className="text-sm text-slate-300">Automatically import responses from a shared Excel file every 5 minutes.</p>
          <p className="mt-2 text-xs text-slate-400">
            Configure <code className="rounded bg-white/10 px-1">EXCEL_IMPORT_URL</code> in <code className="rounded bg-white/10 px-1">.env</code> with a direct download link to your Excel file.
          </p>
          <div className="mt-3">
            <AutoSyncButton />
          </div>
        </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {forms.map((form) => (
          <article key={form.id} className="panel bg-app-panel-soft/70">
            <p className="text-lg font-semibold text-white">{form.team.name}</p>
            <p className="text-sm text-slate-300">{form.title}</p>
            <ul className="mt-3 space-y-1 text-sm text-slate-200">
              <li>Cadence: {form.cadence}</li>
              <li>Anonymous allowed: {form.allowAnonymous ? "Yes" : "No"}</li>
              <li>Questions: {(form.questions as Array<unknown>).length}</li>
            </ul>
          </article>
        ))}
      </section>
    </div>
  );
}
