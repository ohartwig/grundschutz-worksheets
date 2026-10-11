#!/usr/bin/env node
// Turn the BSI "Stand der Technik" library into review worksheets.
//
// The BSI publishes Grundschutz++ and related catalogs as OSCAL in
// https://github.com/BSI-Bund/Stand-der-Technik-Bibliothek. This script reads a
// catalog - optionally through one of the library's mapping collections, e.g.
// ISO 27001 Annex A -> Grundschutz++ - and prints every requirement as a
// checklist row with the fields that matter for a technical review:
// security level, modal verb, action word, target object and the kind of
// documentation the catalog expects.
//
// Two rules are built in:
//   - Pinned: a 40-character commit is required. The library republishes
//     continuously; a check is only reproducible if it names its commit.
//   - Nothing is dropped silently: nested requirements are resolved, and
//     mapping targets that the catalog no longer contains are listed at the end.
//
// No dependencies. Node 24 (LTS) or later.
//
// Usage:
//   node worksheet.mjs <catalog path> --commit <sha> [options]
//   node worksheet.mjs --preset <id> [options]
//   node worksheet.mjs --presets
//
// Options:
//   --preset <id>         a named audit scope from presets/<id>.json: catalog,
//                         mapping and the commit it is tested at; options given
//                         on the command line win
//   --presets             list the presets
//   --mapping <path>      only requirements a mapping collection points at,
//                         each with the source controls that lead to it
//   --sources <list|@file> with --mapping: only these source controls
//                         (e.g. your applicable Annex A controls), comma-separated
//                         or one per line in a file; a trailing * matches a prefix
//                         (APP.1.1* is every aspect of that Baustein)
//   --profile <file>      only the requirements an OSCAL profile includes (see
//                         profile.mjs); its catalog import must name --commit
//   --practices <list>    only these practices, e.g. DET,KONF
//   --levels <list>       only these security levels, e.g. normal-SdT
//   --modal <list>        only these modal verbs, e.g. MUSS,SOLLTE
//   --format md|csv       Markdown checklist (default) or CSV for a spreadsheet
//   --summary             counts by practice, level, modal verb and action word

import { readFileSync, readdirSync } from "node:fs";

const REPO = "https://raw.githubusercontent.com/BSI-Bund/Stand-der-Technik-Bibliothek";

const args = process.argv.slice(2);
const valued = ["--commit", "--mapping", "--sources", "--profile", "--practices", "--levels", "--modal", "--format", "--preset"];
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] ?? "" : "";
};
const valueAt = new Set(valued.map((n) => args.indexOf(n) + 1).filter((i) => i > 0));

// A preset names a catalog, maybe a mapping, and the commit it is tested at.
const presetDir = new URL("presets/", import.meta.url);
const readPreset = (id) => JSON.parse(readFileSync(new URL(`${id}.json`, presetDir), "utf8"));
const presetIds = () => readdirSync(presetDir).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)).sort();
if (args.includes("--presets")) {
  for (const id of presetIds()) {
    const p = readPreset(id);
    console.log(`${id.padEnd(12)} ${p.title} · commit ${p.commit.slice(0, 7)}${p["sources-hint"] ? `\n${"".padEnd(13)}--sources: ${p["sources-hint"]}` : ""}`);
  }
  process.exit(0);
}
const presetId = opt("--preset");
let preset = {};
if (presetId) {
  if (!presetIds().includes(presetId)) {
    console.error(`unknown preset "${presetId}"; known: ${presetIds().join(", ")}`);
    process.exit(2);
  }
  preset = readPreset(presetId);
}

const path = args.find((a, i) => !a.startsWith("--") && !valueAt.has(i)) ?? preset.catalog;
const commit = opt("--commit") || preset.commit || "";
const mappingPath = opt("--mapping") || (opt("--profile") ? "" : preset.mapping ?? "");
const profilePath = opt("--profile");
const list = (s) => s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
const sourcesArg = opt("--sources");
const sourceFilter = new Set(sourcesArg.startsWith("@") ? list(readFileSync(sourcesArg.slice(1), "utf8")) : list(sourcesArg));
const sourcePrefixes = [...sourceFilter].filter((s) => s.endsWith("*")).map((s) => s.slice(0, -1));
const sourceWanted = (id) => !sourceFilter.size || sourceFilter.has(id) || sourcePrefixes.some((p) => id.startsWith(p));
const practices = list(opt("--practices"));
const levels = list(opt("--levels"));
const modals = list(opt("--modal"));
const format = opt("--format") || "md";
const summary = args.includes("--summary");

if (!path || !/^[0-9a-f]{40}$/.test(commit) || !["md", "csv"].includes(format)) {
  console.error("usage: worksheet.mjs <catalog path> --commit <40-char sha> [--mapping <path>] [--sources <list|@file>] [--profile <file>] [--practices A,B] [--levels L] [--modal M] [--format md|csv] [--summary]");
  console.error("       worksheet.mjs --preset <id> [options]   ·   worksheet.mjs --presets");
  console.error("A branch name is refused on purpose: the library republishes continuously.");
  process.exit(2);
}
if (profilePath && mappingPath) {
  console.error("--profile and --mapping exclude each other");
  process.exit(2);
}
if (sourceFilter.size && !mappingPath) {
  console.error("--sources needs --mapping");
  process.exit(2);
}

const rawUrl = (p) => `${REPO}/${commit}/${p.split("/").map(encodeURIComponent).join("/")}`;
const load = async (p) => {
  const r = await fetch(rawUrl(p));
  if (!r.ok) {
    console.error(`${r.status} for ${rawUrl(p)}`);
    process.exit(1);
  }
  return r.json();
};

const { catalog } = await load(path);
if (!catalog) {
  console.error("not an OSCAL catalog (no top-level `catalog`)");
  process.exit(1);
}

const insertParams = (text, params) =>
  text.replace(/\{\{\s*insert:\s*param,\s*([\w.-]+)\s*\}\}/g, (_, id) => {
    const p = params.get(id);
    return p ? `[${(p.values ?? [p.label]).join(" / ")}]` : `[${id}]`;
  });
const propOf = (props, name) => (props ?? []).find((p) => p.name === name)?.value ?? "";

// Index every requirement, however deeply nested, with its practice and depth.
const rows = new Map();
const index = (controls, practice, params, depth) => {
  for (const c of controls ?? []) {
    const own = new Map(params);
    for (const p of c.params ?? []) own.set(p.id, p);
    const stm = (c.parts ?? []).find((p) => p.name === "statement");
    const statement = insertParams(stm?.prose ?? "", own).replace(/\s+/g, " ").trim();
    const modal = propOf(stm?.props, "modal_verb") || (statement.match(/\b(MUSS|MÜSSEN|SOLLTE|SOLLTEN|KANN|KÖNNEN|DARF)\b/) ?? [""])[0];
    rows.set(c.id, {
      id: c.id,
      practice,
      depth,
      title: c.title ?? "",
      level: propOf(c.props, "sec_level"),
      effort: propOf(c.props, "effort_level"),
      modal,
      action: propOf(stm?.props, "action_word"),
      // The sentence subject ("Konfiguration für IT-Systeme") names where to look;
      // the explicit target field is missing on some requirements.
      subject: modal ? statement.slice(0, statement.indexOf(modal)).trim() : "",
      target: propOf(stm?.props, "target_object_categories"),
      documentation: propOf(stm?.props, "documentation"),
      statement,
      from: [],
    });
    index(c.controls, practice, own, depth + 1);
  }
};
const walkGroups = (gs, practice, depth) => {
  for (const g of gs ?? []) {
    const p = practice ?? g.id;
    index(g.controls, p, new Map(), depth);
    walkGroups(g.groups, p, depth);
  }
};
index(catalog.controls, "", new Map(), 0);
walkGroups(catalog.groups, null, 0);

// Select: the whole catalog, or the targets of a mapping collection.
let selected = [...rows.values()];
const orphans = [];
if (mappingPath) {
  const { "mapping-collection": mc } = await load(mappingPath);
  // target -> source -> relationships. The relationship says how much of the
  // source control the requirement covers: intersects-with is only a part.
  const sources = new Map();
  for (const m of mc?.mappings ?? []) {
    for (const x of m.maps ?? []) {
      const src = (x.sources ?? []).map((s) => s["id-ref"]).filter(sourceWanted);
      if (!src.length) continue;
      for (const t of x.targets ?? []) {
        const bySource = sources.get(t["id-ref"]) ?? new Map();
        for (const s of src) bySource.set(s, (bySource.get(s) ?? new Set()).add(x.relationship || "-"));
        sources.set(t["id-ref"], bySource);
      }
    }
  }
  selected = [];
  for (const [id, bySource] of [...sources].sort(([a], [b]) => a.localeCompare(b, "en", { numeric: true }))) {
    const from = [...bySource.keys()];
    const r = rows.get(id);
    if (!r) {
      orphans.push(`${id} (from ${from.join(", ")})`);
      continue;
    }
    selected.push({ ...r, depth: 0, from, relationship: from.map((s) => [...bySource.get(s)].join("/")) });
  }
}
if (profilePath) {
  const { profile } = JSON.parse(readFileSync(profilePath, "utf8"));
  const imp = profile?.imports?.[0];
  if (!imp || !imp.href.includes(`/${commit}/`)) {
    console.error(`profile does not import the catalog at commit ${commit}: ${imp?.href}`);
    process.exit(2);
  }
  const include = new Set((imp["include-controls"] ?? []).flatMap((x) => x["with-ids"] ?? []));
  const exclude = new Set((imp["exclude-controls"] ?? []).flatMap((x) => x["with-ids"] ?? []));
  selected = [];
  for (const id of [...include].sort((a, b) => a.localeCompare(b, "en", { numeric: true }))) {
    if (exclude.has(id)) continue;
    const r = rows.get(id);
    if (!r) orphans.push(`${id} (from the profile)`);
    else selected.push({ ...r, depth: 0 });
  }
}
if (practices.length) selected = selected.filter((r) => practices.includes(r.practice));
if (levels.length) selected = selected.filter((r) => levels.includes(r.level));
if (modals.length) selected = selected.filter((r) => modals.includes(r.modal));

const meta = `${catalog.metadata?.title} · catalog version ${catalog.metadata?.version} · commit ${commit}${presetId ? ` · preset ${presetId}` : ""}`;

if (summary) {
  const count = (key) => {
    const m = new Map();
    for (const r of selected) m.set(r[key] || "-", (m.get(r[key] || "-") ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]);
  };
  console.log(`# Summary: ${meta}\n\n${selected.length} requirements\n`);
  for (const [key, label] of [["practice", "Practice"], ["level", "Security level"], ["modal", "Modal verb"], ["action", "Action word"], ["subject", "Subject"], ["documentation", "Documentation"]]) {
    console.log(`## ${label}\n`);
    for (const [k, n] of count(key)) console.log(`- ${k}: ${n}`);
    console.log("");
  }
} else if (format === "csv") {
  const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
  // relationship lists one entry per source in `from`, in the same order.
  const cols = ["id", "practice", "title", "level", "modal", "action", "subject", "target", "documentation", "effort", "from", "relationship", "statement"];
  console.log([...cols, "evidence", "status", "note"].join(","));
  for (const r of selected) console.log([...cols.map((c) => q(c === "from" ? r.from.join(" ") : c === "relationship" ? (r.relationship ?? []).join(" ") : r[c])), "", "", ""].join(","));
} else {
  console.log(`# Worksheet: ${meta}`);
  if (presetId) console.log(`Preset: ${presetId} · ${preset.title}${commit !== preset.commit ? ` · tested at ${preset.commit}, run at another commit` : ""}`);
  if (mappingPath) console.log(`Mapping: ${mappingPath.split("/").pop()}${sourceFilter.size ? ` · ${sourceFilter.size} source controls` : ""}`);
  const narrowed = [levels.length && `levels ${levels.join(", ")}`, modals.length && `modal ${modals.join(", ")}`, practices.length && `practices ${practices.join(", ")}`].filter(Boolean);
  if (narrowed.length) console.log(`Only: ${narrowed.join(" · ")}`);
  if (profilePath) console.log(`Profile: ${profilePath.split("/").pop()}`);
  console.log("");
  let practice;
  for (const r of selected) {
    if (r.practice !== practice) {
      practice = r.practice;
      console.log(`\n## ${practice || "(no practice)"} (${selected.filter((x) => x.practice === practice).length})\n`);
    }
    const pad = "  ".repeat(r.depth);
    const facts = [r.level, r.modal, r.action, r.subject && `subject ${r.subject}`, r.documentation && `doc ${r.documentation}`, r.effort && `effort ${r.effort}`, r.from.length && `from ${r.from.map((s, i) => `${s} (${r.relationship[i]})`).join(", ")}`].filter(Boolean);
    console.log(`${pad}- [ ] **${r.id}** ${r.title} · ${facts.join(" · ")}`);
    if (r.statement) console.log(`${pad}      ${r.statement}`);
  }
  console.log(`\n${selected.length} requirements.`);
}
if (orphans.length) console.error(`\nMapping targets not in the catalog (${orphans.length}): ${orphans.join("; ")}`);
