#!/usr/bin/env node
// How far measurements against Grundschutz++ reach into another standard.
//
// Checks evidence Grundschutz++ requirements (results.mjs). Through a
// preset's mapping -- ISO 27001 and IT-Grundschutz 2023 from the BSI,
// NIS2, DORA and C5 of this repository -- the same results say something about
// the requirements of that standard, but only as much as the mapping allows.
// This reads assessment results and a preset and writes, per requirement of
// the standard, what the measurements say about it:
//
//   satisfied       every target measured and satisfied in full, through a
//                   relationship that covers the whole source (equivalent-to,
//                   equal-to, subset-of)
//   partial         measured and satisfied, but not enough to say more: a
//                   relationship that covers only part (intersects-with,
//                   superset-of), a target not measured, or a check that
//                   evidences its target only in part
//   not satisfied   a measured target was not satisfied
//   not measured    no target of it was measured -- never read as satisfied
//   no mapping      the mapping says no requirement of the catalog fits it
//                   (its gap summary); nothing measured here can reach it
//
// A requirement mapped only through a draft mapping says so. A preset without
// a mapping (gspp, lieferkette, wlan) is Grundschutz++ itself: each of its
// requirements is its own target.
//
//   node coverage.mjs --preset nis2 results/*.json [--format md|csv]
//   node coverage.mjs --mapping-file own-mapping.json results/*.json
//
// What leads the output are not the percentages but the gaps: how many
// requirements nothing measures, and how many rest on a draft.
//
// No dependencies. Node 24 (LTS) or later.

import { readFileSync } from "node:fs";
import { byId, everyControl, libraryUrl, measurements } from "./lib/oscal.mjs";
import { LIBRARY } from "./tools/bsi-library.mjs";

const FULL = new Set(["equivalent-to", "equal-to", "subset-of"]);

const usage = "usage: coverage.mjs --preset <id> | --mapping-file <file>  <results.json>... [--format md|csv]";
const args = process.argv.slice(2);
const opt = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : "");
const fail = (msg, code = 1) => {
  console.error(msg);
  process.exit(code);
};
const presetId = opt("--preset");
const mappingFile = opt("--mapping-file");
const format = opt("--format") || "md";
const files = args.filter((a, i) => !a.startsWith("--") && !["--preset", "--format", "--mapping-file"].includes(args[i - 1]));
if (!presetId === !mappingFile || !files.length || !["md", "csv"].includes(format)) fail(usage, 2);
let preset = { title: mappingFile, "mapping-file": mappingFile, local: true };
if (presetId) {
  try {
    preset = JSON.parse(readFileSync(new URL(`presets/${presetId}.json`, import.meta.url), "utf8"));
  } catch {
    fail(`no preset ${presetId}`, 2);
  }
}
if (preset["catalog-file"]) fail(`preset ${presetId} reads a catalog outside the library and has no mapping onto Grundschutz++`, 2);

const results = files.map((f) => {
  const ar = JSON.parse(readFileSync(f, "utf8"))["assessment-results"];
  if (!ar) fail(`${f} is not OSCAL assessment results`);
  return ar;
});
const measured = measurements(results);

const fetchJson = async (path) => {
  const url = libraryUrl(LIBRARY.commit, path) ?? fail(`not a path in the library: ${path}`);
  const res = await fetch(url);
  if (!res.ok) fail(`${res.status} for ${url}`);
  return res.json();
};

// source -> { relationships, targets }, from the mapping; or each requirement
// of the catalog as its own source.
const sources = new Map();
let status = "complete";
let what = "";
if (preset.mapping || preset["mapping-file"]) {
  const mc = preset["mapping-file"]
    ? JSON.parse(readFileSync(preset.local ? preset["mapping-file"] : new URL(preset["mapping-file"], import.meta.url), "utf8"))["mapping-collection"]
    : (await fetchJson(preset.mapping))["mapping-collection"];
  if (!mc) fail(`${preset["mapping-file"] ?? preset.mapping} is not an OSCAL mapping collection`);
  status = mc?.provenance?.status ?? "unknown";
  what = `${preset["mapping-file"] ?? preset.mapping} (status ${status})`;
  for (const m of mc?.mappings ?? []) {
    for (const x of m.maps ?? []) {
      for (const s of x.sources ?? []) {
        const e = sources.get(s["id-ref"]) ?? { relationships: new Set(), targets: new Set() };
        e.relationships.add(x.relationship || "unknown");
        for (const t of x.targets ?? []) e.targets.add(t["id-ref"]);
        sources.set(s["id-ref"], e);
      }
    }
    for (const g of m["source-gap-summary"]?.["unmapped-controls"] ?? []) {
      for (const id of g["with-ids"] ?? []) if (!sources.has(id)) sources.set(id, { relationships: new Set(), targets: new Set(), unmapped: true });
    }
  }
} else {
  const { catalog } = await fetchJson(preset.catalog);
  what = `${preset.catalog}, Grundschutz++ itself`;
  for (const c of everyControl(catalog)) sources.set(c.id, { relationships: new Set(["equal-to"]), targets: new Set([c.id]) });
}
const draft = status !== "complete";

const rows = [...sources.keys()].sort(byId).map((id) => {
  const { relationships, targets, unmapped } = sources.get(id);
  const t = [...targets].sort(byId);
  const m = t.filter((x) => measured.has(x));
  const failing = m.filter((x) => measured.get(x).state !== "satisfied");
  const whole = [...relationships].every((r) => FULL.has(r));
  let state;
  if (unmapped) state = "no mapping";
  else if (!m.length) state = "not measured";
  else if (failing.length) state = "not satisfied";
  else if (whole && m.length === t.length && m.every((x) => !measured.get(x).partial)) state = "satisfied";
  else state = "partial";
  const why =
    state === "partial"
      ? [
          !whole && `relationship ${[...relationships].join("/")}`,
          m.length < t.length && `${t.length - m.length} of ${t.length} target(s) not measured`,
          m.some((x) => measured.get(x).partial) && "a check evidences its target only in part",
        ]
          .filter(Boolean)
          .join("; ")
      : "";
  return {
    id,
    state,
    why,
    measured: m.map((x) => `${x} ${measured.get(x).state}${measured.get(x).partial ? " (partial)" : ""} [${measured.get(x).check}]`),
    unmeasured: t.length - m.length,
    draft,
  };
});

const count = (s) => rows.filter((r) => r.state === s).length;
const head = [
  `# Coverage of ${preset.title}`,
  "",
  `${rows.length} requirements · mapping ${what} · results from ${results.length} file(s), latest ${[...measured.values()].map((m) => m.at).sort().at(-1) ?? "none"}`,
  "",
  `- **Not measured: ${count("not measured")}** -- nothing evidences them; they are not satisfied by default.`,
  ...(draft ? [`- **Draft mapping:** every row below rests on a mapping not yet reviewed by a person.`] : []),
  ...(count("no mapping") ? [`- **No mapping: ${count("no mapping")}** -- no Grundschutz++ requirement fits them; no measurement here can reach them.`] : []),
  `- Not satisfied: ${count("not satisfied")}`,
  `- Partial: ${count("partial")}`,
  `- Satisfied: ${count("satisfied")}`,
  "",
];
const cell = (s) => String(s).replace(/\|/g, "\\|");
const out =
  format === "csv"
    ? [
        "requirement,state,why,measured,unmeasured_targets,draft_mapping",
        ...rows.map((r) => [r.id, r.state, r.why, r.measured.join("; "), r.unmeasured, r.draft].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")),
      ].join("\n") + "\n"
    : [
        ...head,
        "| Requirement | State | Why | Measured targets | Not measured |",
        "|---|---|---|---|---|",
        ...rows.map((r) => `| ${r.id} | ${r.state} | ${cell(r.why)} | ${cell(r.measured.join("; "))} | ${r.unmeasured} |`),
      ].join("\n") + "\n";
if (format === "csv") console.error(head.filter(Boolean).slice(1).join("\n"));
// One write, no process.exit() after it: on a pipe it would cut the output short.
process.stdout.write(out);
