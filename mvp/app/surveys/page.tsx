import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { recommendationBucket, recommendationNetScore } from "@/lib/scoring";
import { ImportSurveyButton } from "./ImportButton";

export default async function SurveysPage() {
  const responses = await prisma.pulseSurveyResponse.findMany({
    include: {
      team: true,
      member: true,
    },
    orderBy: [{ cycleStart: "desc" }, { submittedAt: "desc" }],
    take: 300,
  });

  const q7ByTeamCycle = new Map<string, number[]>();
  for (const response of responses) {
    const key = `${response.teamId}-${response.cycleStart.toISOString().slice(0, 10)}`;
    const current = q7ByTeamCycle.get(key) ?? [];
    current.push(response.q7);
    q7ByTeamCycle.set(key, current);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-semibold text-white">Pulse Survey Results</h2>
          <p className="text-sm text-slate-300">Bi-weekly responses with named/anonymous mode and recommendation distribution.</p>
        </div>
      <div className="flex flex-wrap items-center gap-3">
          <a href="/api/surveys/export" className="rounded-full border border-cyan-300/40 bg-cyan-400/10 px-4 py-2 text-sm font-medium text-cyan-200">
            Export CSV
          </a>
          <ImportSurveyButton />
        </div>
      </div>

      <section className="panel overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-left text-slate-300">
            <tr>
              <th className="px-2 py-2">Cycle</th>
              <th className="px-2 py-2">Team</th>
              <th className="px-2 py-2">Member</th>
              <th className="px-2 py-2">Mode</th>
              <th className="px-2 py-2">Q1-Q7</th>
              <th className="px-2 py-2">Q7 Bucket</th>
              <th className="px-2 py-2">Team Net Score</th>
              <th className="px-2 py-2">Feedback</th>
            </tr>
          </thead>
          <tbody>
            {responses.map((row) => {
              const cycle = row.cycleStart.toISOString().slice(0, 10);
              const bucket = recommendationBucket(row.q7);
              const key = `${row.teamId}-${cycle}`;
              const teamNet = recommendationNetScore(q7ByTeamCycle.get(key) ?? []);

              return (
                <tr key={row.id} className="border-t border-white/10 text-slate-100">
                  <td className="px-2 py-2">{cycle}</td>
                  <td className="px-2 py-2">
                    <Link href={`/team/${row.teamId}`} className="text-cyan-300">{row.team.name}</Link>
                  </td>
                  <td className="px-2 py-2">{row.member?.name ?? "Anonymous"}</td>
                  <td className="px-2 py-2 uppercase">{row.submissionMode}</td>
                  <td className="px-2 py-2">{row.q1}/{row.q2}/{row.q3}/{row.q4}/{row.q5}/{row.q6}/{row.q7}</td>
                  <td className="px-2 py-2 capitalize">{bucket}</td>
                  <td className="px-2 py-2">{teamNet}</td>
                  <td className="max-w-sm truncate px-2 py-2 text-slate-300" title={row.feedback}>{row.feedback}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
