#!/usr/bin/env node
// Build the requirement package of BSI-Standard 300-1 from the business
// processes and the assets behind them, and write it as a tailoring file for
// profile.mjs.
//
// The standard (chapter 3.4) does not leave the package to a choice of IDs:
//
//   - every requirement of the method practices (GC, STM, UMS, VRB, PERF)
//     applies to every information domain (3.4.1);
//   - so does every other requirement without a target-object category;
//   - a requirement with a target-object category applies where an asset of
//     the information domain is assigned that category -- an asset is
//     assigned its category and every category above it (3.4.2), from the
//     hierarchy the library publishes in
//     documentation/namespaces/target_object_categories.csv.
//
// A requirement that names several categories ("Nutzende, Mobile Endgeräte")
// applies only where the information domain has assets of all of them: a rule
// for the users of mobile devices has nothing to apply to without mobile
// devices. The standard does not say; this is the reading chosen here, and
// the report states it.
//
// Requirements of the level "erhöht" are KANN (3.4.2): optional, and a source
// for the risk analysis that a process of high protection need requires
// (2.6, Annex 3, criterion 32). They are not put into the package. The report
// lists those that fit the assets of each such process as candidates; "adopt"
// takes one over.
//
// Input (JSON):
//   {
//     "title": "Grundschutz++ package of Example GmbH",
//     "version": "2026-10-27", "last-modified": "2026-10-27T00:00:00Z",
//     "catalog": { "path": "control_layer/Grundschutz++/Grundschutz++-resolved_catalog.json",
//                  "commit": "<40-char sha of the BSI library>" },
//     "processes": [{ "id": "GP-1", "name": "Web hosting", "owner": "Operations",
//                     "description": "What it is for and what it yields (Annex 2)",
//                     "applications": ["CMS"],
//                     "protection": { "confidentiality": "normal", "integrity": "hoch",
//                                     "availability": "normal" } }],
//     "assets": [{ "id": "A-1", "name": "Web server", "categories": ["Webserver"],
//                  "processes": ["GP-1"] }],
//     "adopt": ["DET.4.12.1"],                                  optional
//     "not-applicable": [{ "id": "ARCH.6.1", "reason": "..." }], optional
//     "parameters": { "rea.1.2-prm1": "jährlich" }              optional
//   }
//
// Output: the tailoring file on stdout, for `node profile.mjs`; with --report a
// Markdown account of the package instead: the processes and whether they
// need a risk analysis, the assets and their categories, where each part of
// the package comes from, the candidates. The same input gives the same bytes.
//
//   node package.mjs package.json > tailoring.json && node profile.mjs tailoring.json > profile.json
//   node package.mjs package.json --report > package.md
//
// Options:
//   --catalog <file>      read the catalog from disk instead of the library
//   --categories <file>   read the category hierarchy (CSV) from disk
//                         (tests, offline use)
//
// No dependencies. Node 24 (LTS) or later.

import { readFileSync } from "node:fs";
import { byId, everyControl, libraryUrl } from "./lib/oscal.mjs";

const CATEGORIES = "documentation/namespaces/target_object_categories.csv";
const PROTECTION = ["normal", "hoch"];

const args = process.argv.slice(2);
const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : "");
const file = args.find((a, i) => !a.startsWith("--") && !["--catalog", "--categories"].includes(args[i - 1]));
const report = args.includes("--report");
const fail = (msg) => {
  console.error(`package: ${msg}`);
  process.exit(1);
};
if (!file) {
  console.error("usage: package.mjs <package.json> [--report] [--catalog <file>] [--categories <file>]");
  process.exit(2);
}

const p = JSON.parse(readFileSync(file, "utf8"));
for (const k of ["title", "version", "last-modified"]) if (!p[k]) fail(`missing "${k}"`);
if (!/^[0-9a-f]{40}$/.test(p.catalog?.commit ?? "")) fail("catalog.commit must be a 40-character commit");
if (!p.catalog.path?.startsWith("control_layer/Grundschutz++/"))
  fail("catalog.path must be a catalog under control_layer/Grundschutz++/: the package is made from the Anwenderkatalog");

const fetchText = async (path) => {
  const href = libraryUrl(p.catalog.commit, path) ?? fail(`not a path in the library: ${path}`);
  const r = await fetch(href);
  if (!r.ok) fail(`${r.status} for ${href}`);
  return r.text();
};
const catalog = JSON.parse(opt("--catalog") ? readFileSync(opt("--catalog"), "utf8") : await fetchText(p.catalog.path)).catalog;
if (!catalog) fail("not an OSCAL catalog");
const csv = opt("--categories") ? readFileSync(opt("--categories"), "utf8") : await fetchText(CATEGORIES);

// --- The category hierarchy. -------------------------------------------------
// RFC 4180: quoted fields may hold commas, doubled quotes and line breaks.
const parseCsv = (text) => {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((x) => x !== "")) rows.push(row);
  return rows;
};
const [head, ...lines] = parseCsv(csv.replace(/^﻿/, ""));
const col = (name) => head.indexOf(name) >= 0 ? head.indexOf(name) : fail(`${CATEGORIES} has no column ${name}`);
const [cName, cUuid, cParent] = [col("Zielobjekt"), col("UUID"), col("ChildOfUUID")];
const byUuid = new Map(lines.map((l) => [l[cUuid], l[cName]]));
const parentOf = new Map(lines.map((l) => [l[cName], byUuid.get(l[cParent]) ?? ""]));
// A category and every category above it.
const lineage = (name) => {
  const out = [];
  for (let n = name; n && !out.includes(n); n = parentOf.get(n)) out.push(n);
  return out;
};

// --- The catalog: what each requirement needs. -------------------------------
const reqs = [];
for (const c of everyControl(catalog)) {
  const stm = (c.parts ?? []).find((x) => x.name === "statement");
  const target = (stm?.props ?? []).find((x) => x.name === "target_object_categories")?.value ?? "";
  reqs.push({
    id: c.id,
    method: Boolean(c.class?.startsWith("BSI-Methodik")),
    level: (c.props ?? []).find((x) => x.name === "sec_level")?.value ?? "",
    categories: target ? target.split(/,\s*/).map((x) => x.trim()).filter(Boolean) : [],
  });
}
const known = new Set(reqs.map((r) => r.id));
for (const r of reqs) for (const k of r.categories) if (!parentOf.has(k)) fail(`${r.id} names the category "${k}", which ${CATEGORIES} at this commit does not know`);

// --- Processes and assets. ---------------------------------------------------
const processes = p.processes ?? [];
const assets = p.assets ?? [];
if (!processes.length) fail("no processes: the package starts from the business processes (2.5)");
if (!assets.length) fail("no assets: the package follows from the assets of the processes (3.1, 3.2)");
const pids = new Set();
for (const g of processes) {
  // Annex 2: ID, name, the responsible person or role, a short description.
  for (const k of ["id", "name", "owner", "description"]) if (!g[k]) fail(`process ${g.id ?? "?"}: missing "${k}"`);
  if (pids.has(g.id)) fail(`process ${g.id}: listed twice`);
  pids.add(g.id);
  for (const k of ["confidentiality", "integrity", "availability"])
    if (!PROTECTION.includes(g.protection?.[k])) fail(`process ${g.id}: protection.${k} must be normal or hoch`);
}
const aids = new Set();
for (const a of assets) {
  if (!a.id || !a.name) fail(`asset ${a.id ?? "?"}: needs "id" and "name"`);
  if (aids.has(a.id)) fail(`asset ${a.id}: listed twice`);
  aids.add(a.id);
  if (!Array.isArray(a.categories) || !a.categories.length) fail(`asset ${a.id}: needs at least one category (3.4.2)`);
  for (const k of a.categories) if (!parentOf.has(k)) fail(`asset ${a.id}: "${k}" is not a target-object category; known: ${[...parentOf.keys()].sort().join(", ")}`);
  if (!Array.isArray(a.processes) || !a.processes.length) fail(`asset ${a.id}: needs the processes it serves`);
  for (const g of a.processes) if (!pids.has(g)) fail(`asset ${a.id}: process ${g} is not listed`);
}
const high = processes.filter((g) => Object.values(g.protection).includes("hoch"));
const idle = processes.filter((g) => !assets.some((a) => a.processes.includes(g.id)));

// Each asset holds its categories and every one above them; the information
// domain holds what any of its assets holds.
const held = (list) => {
  const m = new Map(); // category -> [asset id]
  for (const a of list) for (const k of new Set(a.categories.flatMap(lineage))) m.set(k, [...(m.get(k) ?? []), a.id]);
  return m;
};
const domain = held(assets);
const fits = (r, m) => r.categories.length > 0 && r.categories.every((k) => m.has(k));

// --- The package. ------------------------------------------------------------
const why = new Map(); // id -> reason
for (const r of reqs) {
  if (r.method) why.set(r.id, "method");
  else if (!r.categories.length) why.set(r.id, "no category");
  else if (r.level !== "erhöht" && fits(r, domain)) why.set(r.id, "category");
}
// Candidates: "erhöht" requirements that fit the assets of a process of high
// protection need.
const candidates = new Map(); // id -> [process id]
for (const g of high) {
  const m = held(assets.filter((a) => a.processes.includes(g.id)));
  for (const r of reqs) if (r.level === "erhöht" && !why.has(r.id) && fits(r, m)) candidates.set(r.id, [...(candidates.get(r.id) ?? []), g.id]);
}
for (const id of p.adopt ?? []) {
  if (!known.has(id)) fail(`adopt ${id}: not in the catalog at ${p.catalog.commit.slice(0, 7)}`);
  if (why.has(id)) console.error(`package: adopt ${id}: already in the package (${why.get(id)})`);
  else why.set(id, "adopted");
}
const na = p["not-applicable"] ?? [];
for (const e of na) {
  if (!e.id || !e.reason) fail(`not-applicable ${e.id ?? "?"}: needs "id" and "reason" (4.1.1)`);
  if (!why.has(e.id)) console.error(`package: not-applicable ${e.id}: not in the package anyway`);
}
const naIds = new Set(na.map((e) => e.id));
const applicable = [...why.keys()].filter((id) => !naIds.has(id)).sort(byId);

const count = (reason) => [...why.values()].filter((v) => v === reason).length;
for (const g of high) console.error(`package: ${g.id} has a high protection need: it needs a risk analysis (BSI-Standard 300-1, 2.6; Annex 3, criterion 32)`);
for (const g of idle) console.error(`package: ${g.id} has no asset: its requirements cannot be derived (3.1)`);
console.error(`package: ${why.size} requirements -- ${count("method")} of the method, ${count("no category")} without a category, ` +
  `${count("category")} by category, ${count("adopted")} adopted; ${naIds.size} not applicable; ${candidates.size} candidates of level erhöht`);

if (!report) {
  const tailoring = {
    title: p.title,
    version: p.version,
    "last-modified": p["last-modified"],
    catalog: { path: p.catalog.path, commit: p.catalog.commit },
    applicable,
    "not-applicable": [...na].sort((a, b) => byId(a.id, b.id)),
    ...(p.parameters && { parameters: p.parameters }),
  };
  process.stdout.write(JSON.stringify(tailoring, null, 2) + "\n");
  process.exit(0);
}

// --- The report. -------------------------------------------------------------
const cell = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
const out = [
  `# Requirement package: ${p.title}`,
  "",
  `${catalog.metadata?.title ?? "Catalog"} · catalog version ${catalog.metadata?.version ?? "?"} · commit ${p.catalog.commit} · package ${p.version}`,
  "",
  "Built by BSI-Standard 300-1, 3.4: every requirement of the method, every requirement without a target-object category, " +
    "and every requirement of level normal-SdT whose categories the assets hold, an asset holding its categories and every one above them. " +
    "A requirement that names several categories is in the package only where assets hold all of them -- this tool's reading; the standard does not say. " +
    "Requirements of level erhöht are KANN; those that fit a process of high protection need are listed as candidates for its risk analysis.",
  "",
  `${applicable.length} requirements apply: ${count("method")} of the method, ${count("no category")} without a category, ` +
    `${count("category")} by category, ${count("adopted")} adopted, ${naIds.size} of them not applicable.`,
  "",
  "## Business processes",
  "",
  "| ID | Name | Responsible | C | I | A | Risk analysis |",
  "|---|---|---|---|---|---|---|",
  ...processes.map((g) => `| ${cell(g.id)} | ${cell(g.name)} | ${cell(g.owner)} | ${g.protection.confidentiality} | ${g.protection.integrity} | ${g.protection.availability} | ${high.includes(g) ? "required (Annex 3, 32)" : "–"} |`),
  ...(idle.length ? ["", `No asset serves ${idle.map((g) => g.id).join(", ")}.`] : []),
  "",
  "## Assets",
  "",
  "| ID | Name | Processes | Categories | Above them |",
  "|---|---|---|---|---|",
  ...assets.map((a) => {
    const all = new Set(a.categories.flatMap(lineage));
    return `| ${cell(a.id)} | ${cell(a.name)} | ${a.processes.join(", ")} | ${a.categories.join(", ")} | ${[...all].filter((k) => !a.categories.includes(k)).join(", ") || "–"} |`;
  }),
  "",
  "## By category",
  "",
  "| Category | Assets | Requirements |",
  "|---|---|---|",
  ...[...domain.keys()].sort().map((k) => {
    const ids = reqs.filter((r) => why.get(r.id) === "category" && r.categories.includes(k)).map((r) => r.id);
    return `| ${k} | ${domain.get(k).join(", ")} | ${ids.length} |`;
  }),
  "",
  "## Candidates of level erhöht",
  "",
  ...(candidates.size
    ? ["| Requirement | Processes |", "|---|---|", ...[...candidates].sort(([a], [b]) => byId(a, b)).map(([id, gs]) => `| ${id} | ${gs.join(", ")} |`)]
    : [high.length ? "None fits the assets of the processes of high protection need." : "No process has a high protection need."]),
  "",
  ...(na.length ? ["## Not applicable", "", "| Requirement | Reason |", "|---|---|", ...[...na].sort((a, b) => byId(a.id, b.id)).map((e) => `| ${e.id} | ${cell(e.reason)} |`), ""] : []),
];
process.stdout.write(out.join("\n") + "\n");
