#!/usr/bin/env node
// Did the controls work over a period, not only on one day? The question an
// auditor of a SOC 2 Type II report asks, and an ISO or NIS2 audit too.
//
// Reads the assessment results of many runs (results.mjs, nightly, say) and
// writes for a period, per check and per requirement: how many runs, how many
// found something not as required, and the longest stretch without any run --
// from the start of the period to the first run and from the last run to its
// end included. With --every, the cadence the plan promises, a gap longer than
// that is named: a control nobody measured for a week has not been shown to
// work that week.
//
//   node period.mjs results/*.json --from 2026-10-13 --to 2027-01-13 [--every 24h] [--format md|csv]
//
// Runs outside the period are ignored. A day is midnight to midnight UTC.
//
// No dependencies. Node 24 (LTS) or later.

import { readFileSync } from "node:fs";
import { byId, runsOf } from "./lib/oscal.mjs";

const usage = "usage: period.mjs <results.json>... --from <YYYY-MM-DD> --to <YYYY-MM-DD> [--every <n>h|<n>d] [--format md|csv]";
const args = process.argv.slice(2);
const opt = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : "");
const fail = (msg, code = 1) => {
  console.error(msg);
  process.exit(code);
};
const valued = ["--from", "--to", "--every", "--format"];
const files = args.filter((a, i) => !a.startsWith("--") && !valued.includes(args[i - 1]));
const day = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? Date.parse(`${s}T00:00:00Z`) : NaN);
const from = day(opt("--from"));
const to = day(opt("--to")) + 864e5; // the --to day is included
const format = opt("--format") || "md";
const every = opt("--every");
const cadence = every ? Number(every.slice(0, -1)) * (every.endsWith("d") ? 864e5 : every.endsWith("h") ? 36e5 : NaN) : 0;
if (!files.length || Number.isNaN(from) || Number.isNaN(to) || to <= from || !["md", "csv"].includes(format) || Number.isNaN(cadence)) fail(usage, 2);

const results = files.map((f) => JSON.parse(readFileSync(f, "utf8"))["assessment-results"] ?? fail(`${f} is not OSCAL assessment results`));
const runs = runsOf(results)
  .map((r) => ({ ...r, t: Date.parse(r.at) }))
  .filter((r) => r.t >= from && r.t < to)
  .sort((a, b) => a.t - b.t);
if (!runs.length) fail("no run in the period");

const hours = (ms) => Math.round(ms / 36e5);
const span = (times) => {
  const points = [from, ...times, to];
  let longest = 0;
  let at = from;
  for (let i = 1; i < points.length; i++) {
    if (points[i] - points[i - 1] > longest) [longest, at] = [points[i] - points[i - 1], points[i - 1]];
  }
  return { longest, at };
};
const summarise = (key, list) => {
  const times = list.map((r) => r.t);
  const { longest, at } = span(times);
  return {
    key,
    runs: list.length,
    failed: list.filter((r) => r.failed).length,
    partial: list.length && list.every((r) => r.partial),
    first: new Date(times[0]).toISOString(),
    last: new Date(times.at(-1)).toISOString(),
    gapHours: hours(longest),
    gapFrom: new Date(at).toISOString().slice(0, 10),
    late: cadence > 0 && longest > cadence,
  };
};

const byCheck = new Map();
const byReq = new Map();
for (const r of runs) {
  const failed = r.findings.some((f) => f.state !== "satisfied");
  (byCheck.get(r.check) ?? byCheck.set(r.check, []).get(r.check)).push({ t: r.t, failed, partial: false });
  for (const f of r.findings) {
    (byReq.get(f.id) ?? byReq.set(f.id, []).get(f.id)).push({ t: r.t, failed: f.state !== "satisfied", partial: f.partial, check: r.check });
  }
}
const checks = [...byCheck].sort(([a], [b]) => a.localeCompare(b)).map(([k, l]) => summarise(k, l));
const reqs = [...byReq].sort(([a], [b]) => byId(a, b)).map(([k, l]) => ({ ...summarise(k, l), checks: [...new Set(l.map((x) => x.check))].sort().join(", ") }));

const period = `${opt("--from")} to ${opt("--to")}`;
const late = checks.filter((c) => c.late);
const head = [
  `# Period report, ${period}`,
  "",
  `${runs.length} run(s) of ${checks.length} check(s) evidencing ${reqs.length} requirement(s)${cadence ? `; promised cadence every ${every}` : ""}.`,
  "",
  ...(cadence
    ? late.length
      ? [`- **Gaps longer than the cadence: ${late.length} check(s)** -- ${late.map((c) => `${c.key} (${c.gapHours} h from ${c.gapFrom})`).join("; ")}. For those stretches nothing shows the control working.`]
      : ["- No gap longer than the cadence."]
    : ["- No cadence given (--every): gaps are reported, not judged."]),
  `- Runs that found something not as required: ${checks.reduce((n, c) => n + c.failed, 0)}`,
  "",
];
const cell = (s) => String(s).replace(/\|/g, "\\|");
const csv = (rows, cols) => [cols.join(","), ...rows.map((r) => cols.map((c) => `"${String(r[c] ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
const out =
  format === "csv"
    ? csv(
        [...checks.map((c) => ({ kind: "check", ...c })), ...reqs.map((r) => ({ kind: "requirement", ...r }))],
        ["kind", "key", "runs", "failed", "partial", "first", "last", "gapHours", "gapFrom", "late", "checks"],
      ) + "\n"
    : [
        ...head,
        "## Per check",
        "",
        "| Check | Runs | Not as required | First | Last | Longest gap |",
        "|---|---|---|---|---|---|",
        ...checks.map((c) => `| ${c.key} | ${c.runs} | ${c.failed} | ${c.first.slice(0, 16)} | ${c.last.slice(0, 16)} | ${c.gapHours} h from ${c.gapFrom}${c.late ? " **(late)**" : ""} |`),
        "",
        "## Per requirement",
        "",
        "| Requirement | Checks | Runs | Not satisfied | Longest gap |",
        "|---|---|---|---|---|",
        ...reqs.map((r) => `| ${r.key}${r.partial ? " (partial)" : ""} | ${cell(r.checks)} | ${r.runs} | ${r.failed} | ${r.gapHours} h${r.late ? " **(late)**" : ""} |`),
      ].join("\n") + "\n";
if (format === "csv") console.error(head.filter(Boolean).slice(1).join("\n"));
process.stdout.write(out);
