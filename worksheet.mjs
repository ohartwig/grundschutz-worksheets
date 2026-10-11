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
//   node worksheet.mjs --catalog-file <file.json> [options]
//
// Options:
//   --preset <id>         a named audit scope from presets/<id>.json: catalog,
//                         mapping and the commit it is tested at; options given
//                         on the command line win
//   --presets             list the presets
//   --catalog-file <file> a catalog on disk that is not in the library (A5);
//                         pinned by its SHA-256 instead of a commit, and a
//                         preset that names one refuses any other file
//   --mapping <path>      only requirements a mapping collection of the
//                         library points at, each with the source controls
//                         that lead to it
//   --mapping-file <file> the same with a mapping collection on disk (see
//                         mapping.mjs); it must target the catalog at --commit
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

import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { libraryUrl, resolveImport, sha256 } from "./lib/oscal.mjs";
import { LIBRARY } from "./tools/bsi-library.mjs";

const args = process.argv.slice(2);
const valued = ["--commit", "--mapping", "--sources", "--profile", "--practices", "--levels", "--modal", "--format", "--preset", "--catalog-file", "--mapping-file"];
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
    const pin = p["catalog-file"] ? `--catalog-file ${p["catalog-file"].name}` : `commit ${LIBRARY.commit.slice(0, 7)}`;
    console.log(`${id.padEnd(12)} ${p.title} · ${pin}${p["sources-hint"] ? `\n${"".padEnd(13)}--sources: ${p["sources-hint"]}` : ""}`);
  }
  process.exit(0);
}
// Every option, from the command line or a preset, resolved in one place:
// where the catalog comes from and how it is pinned, which mapping or profile
// narrows it, and which filters apply. A conflict is a usage error (exit 2),
// thrown here and reported once below.
class UsageError extends Error {}
const list = (s) => s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
const settings = () => {
  const presetId = opt("--preset");
  let preset = {};
  if (presetId) {
    if (!presetIds().includes(presetId)) throw new UsageError(`unknown preset "${presetId}"; known: ${presetIds().join(", ")}`);
    preset = readPreset(presetId);
  }

  // A catalog the library does not have is read from disk and pinned by its
  // SHA-256. The file is not part of this repository (A5 states no licence), so
  // the preset names it and its hash, and the user supplies it.
  const catalogFile = opt("--catalog-file");
  const fileSha = catalogFile ? createHash("sha256").update(readFileSync(catalogFile)).digest("hex") : "";
  if (preset["catalog-file"]) {
    const want = preset["catalog-file"];
    if (!catalogFile) throw new UsageError(`preset ${presetId} needs --catalog-file ${want.name} (${want.source})`);
    if (fileSha !== want.sha256) throw new UsageError(`${catalogFile} is not the ${want.name} the preset is tested with: sha256 ${fileSha}, want ${want.sha256}`);
  }
  const path = catalogFile ? "" : args.find((a, i) => !a.startsWith("--") && !valueAt.has(i)) ?? preset.catalog;
  // A preset runs at the commit the repository is tested at
  // (tools/bsi-library.mjs); a path on the command line names its own.
  const commit = opt("--commit") || (presetId && !catalogFile ? LIBRARY.commit : "");

  // A mapping is the library's (--mapping, a path at the commit) or a file on
  // disk (--mapping-file, e.g. this repository's mappings/). Which one is said,
  // not guessed from what happens to exist in the working directory. A preset's
  // mapping file lives in this repository; one on the command line is relative
  // to where you are. Anything named on the command line replaces the preset's.
  const profilePath = opt("--profile");
  const own = opt("--mapping") || opt("--mapping-file") || profilePath;
  const mappingPath = opt("--mapping") || (own ? "" : preset.mapping ?? "");
  const mappingFile = opt("--mapping-file") || (own || !preset["mapping-file"] ? "" : new URL(preset["mapping-file"], import.meta.url));
  const mappingName = mappingPath || (mappingFile ? String(opt("--mapping-file") || preset["mapping-file"]) : "");

  const sourcesArg = opt("--sources");
  const sourceFilter = new Set(sourcesArg.startsWith("@") ? list(readFileSync(sourcesArg.slice(1), "utf8")) : list(sourcesArg));
  const format = opt("--format") || "md";

  if (catalogFile && (mappingPath || mappingFile || profilePath)) throw new UsageError("--catalog-file takes no --mapping or --profile: both refer to a library catalog");
  if ((!catalogFile && (!path || !/^[0-9a-f]{40}$/.test(commit))) || !["md", "csv"].includes(format)) {
    throw new UsageError([
      "usage: worksheet.mjs <catalog path> --commit <40-char sha> [--mapping <path> | --mapping-file <file>] [--sources <list|@file>] [--profile <file>] [--practices A,B] [--levels L] [--modal M] [--format md|csv] [--summary]",
      "       worksheet.mjs --preset <id> [options]   ·   worksheet.mjs --presets",
      "A branch name is refused on purpose: the library republishes continuously.",
    ].join("\n"));
  }
  if (opt("--mapping") && opt("--mapping-file")) throw new UsageError("--mapping and --mapping-file exclude each other");
  if (profilePath && (mappingPath || mappingFile)) throw new UsageError("--profile and --mapping exclude each other");
  if (sourceFilter.size && !mappingPath && !mappingFile) throw new UsageError("--sources needs --mapping");

  return {
    presetId, preset, catalogFile, fileSha, path, commit,
    mappingPath, mappingFile, mappingName, profilePath, sourceFilter,
    practices: list(opt("--practices")),
    levels: list(opt("--levels")),
    modals: list(opt("--modal")),
    format,
    summary: args.includes("--summary"),
  };
};
let config;
try {
  config = settings();
} catch (e) {
  if (!(e instanceof UsageError)) throw e;
  console.error(e.message);
  process.exit(2);
}
const {
  presetId, preset, catalogFile, fileSha, path, commit,
  mappingPath, mappingFile, mappingName, profilePath, sourceFilter,
  practices, levels, modals, format, summary,
} = config;
const sourcePrefixes = [...sourceFilter].filter((s) => s.endsWith("*")).map((s) => s.slice(0, -1));
const sourceWanted = (id) => !sourceFilter.size || sourceFilter.has(id) || sourcePrefixes.some((p) => id.startsWith(p));

// A path in the library is plain segments. An empty one, "." or ".." would
// resolve above the pinned commit and fetch another repository or a branch.
const rawUrl = (p) => {
  const url = libraryUrl(commit, p);
  if (!url) {
    console.error(`not a path in the library: ${p}`);
    process.exit(2);
  }
  return url;
};
// The bytes as well as the JSON: a profile's import may carry their hash.
const fetchBytes = async (p) => {
  const r = await fetch(rawUrl(p));
  if (!r.ok) {
    console.error(`${r.status} for ${rawUrl(p)}`);
    process.exit(1);
  }
  return Buffer.from(await r.arrayBuffer());
};
const load = async (p) => JSON.parse((await fetchBytes(p)).toString("utf8"));

const catalogBytes = catalogFile ? readFileSync(catalogFile) : await fetchBytes(path);
const { catalog } = JSON.parse(catalogBytes.toString("utf8"));
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

// A profile's set-parameters fill the catalog's blanks: "jährlich" instead of
// "regelmäßig".
const profile = profilePath ? JSON.parse(readFileSync(profilePath, "utf8")).profile : null;
const setValues = new Map((profile?.modify?.["set-parameters"] ?? []).map((s) => [s["param-id"], s.values]));

// Index every requirement, however deeply nested, with its practice and depth.
const rows = new Map();
const index = (controls, practice, params, depth) => {
  for (const c of controls ?? []) {
    const own = new Map(params);
    for (const p of c.params ?? []) own.set(p.id, setValues.has(p.id) ? { ...p, values: setValues.get(p.id) } : p);
    const stm = (c.parts ?? []).find((p) => p.name === "statement");
    const statement = insertParams(stm?.prose ?? "", own).replace(/\s+/g, " ").trim();
    // The library puts these on the statement; A5 puts them on the requirement,
    // under German names.
    const fact = (name, a5) => propOf(stm?.props, name) || propOf(c.props, a5);
    const modal = fact("modal_verb", "modalverb") || (statement.match(/\b(MUSS|MÜSSEN|SOLLTE|SOLLTEN|KANN|KÖNNEN|DARF)\b/) ?? [""])[0];
    rows.set(c.id, {
      id: c.id,
      practice,
      depth,
      title: c.title ?? "",
      level: propOf(c.props, "sec_level"),
      effort: propOf(c.props, "effort_level"),
      modal,
      action: fact("action_word", "handlungsworte"),
      // The sentence subject ("Konfiguration für IT-Systeme") names where to look;
      // the explicit target field is missing on some requirements.
      subject: modal ? statement.slice(0, statement.indexOf(modal)).trim() : "",
      target: fact("target_object_categories", "target_objects"),
      documentation: fact("documentation", "documentation"),
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
let mappingStatus = "";
const orphans = [];
if (mappingPath || mappingFile) {
  const own = Boolean(mappingFile);
  const { "mapping-collection": mc } = own ? JSON.parse(readFileSync(mappingFile, "utf8")) : await load(mappingPath);
  // An own mapping is derived from one catalog at one commit; applied to
  // another, its targets may not exist or may mean something else. So it must
  // name exactly the catalog this run reads -- the form mapping.mjs writes.
  if (own) {
    const targets = [...new Set((mc?.mappings ?? []).map((x) => x["target-resource"]?.href))];
    if (!targets.length || targets.some((h) => h !== rawUrl(path))) {
      console.error(`mapping ${mappingName} is not made for ${path} at commit ${commit}: it targets ${targets.join(", ") || "nothing"}. Regenerate it with mapping.mjs at that commit.`);
      process.exit(2);
    }
  }
  mappingStatus = mc?.provenance?.status ?? "";
  if (own && mappingStatus !== "complete") console.error(`Mapping ${mappingName} is ${mappingStatus || "of unknown status"}: a proposal to review, not an established mapping.`);
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
if (profile) {
  const imp = profile.imports?.[0];
  // Exactly the URL this run reads, directly or through a back-matter
  // resource (the form profile.mjs writes) -- and where the resource carries
  // a hash, exactly the bytes this run read.
  const target = resolveImport(profile, imp?.href);
  if (!imp || target.href !== rawUrl(path)) {
    console.error(`profile does not import ${path} from the library at commit ${commit}: ${target.href ?? imp?.href}`);
    process.exit(2);
  }
  if (target.sha256 && target.sha256 !== sha256(catalogBytes)) {
    console.error(`profile was made against other bytes of ${path}: sha256 ${target.sha256}, read ${sha256(catalogBytes)}`);
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

const meta = `${catalog.metadata?.title} · catalog version ${catalog.metadata?.version} · ${catalogFile ? `file ${catalogFile.split("/").pop()} sha256 ${fileSha.slice(0, 12)}` : `commit ${commit}`}${presetId ? ` · preset ${presetId}` : ""}${mappingStatus && mappingStatus !== "complete" ? ` · mapping ${mappingStatus}` : ""}`;

// What travels with the output: a worksheet is read by people who never saw
// the README, so the caveat goes into the file, not only onto stderr.
const notice = [
  presetId && "The preset is a starting point, not an approved audit scope: check the selection against the original texts.",
  mappingStatus && mappingStatus !== "complete" && `The mapping is a ${mappingStatus}, not reviewed: every "from" is a proposal.`,
].filter(Boolean).join(" ");

if (summary) {
  const count = (key) => {
    const m = new Map();
    for (const r of selected) m.set(r[key] || "-", (m.get(r[key] || "-") ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]);
  };
  console.log(`# Summary: ${meta}\n${notice ? `\n> ${notice}\n` : ""}\n${selected.length} requirements\n`);
  for (const [key, label] of [["practice", "Practice"], ["level", "Security level"], ["modal", "Modal verb"], ["action", "Action word"], ["subject", "Subject"], ["documentation", "Documentation"]]) {
    console.log(`## ${label}\n`);
    for (const [k, n] of count(key)) console.log(`- ${k}: ${n}`);
    console.log("");
  }
} else if (format === "csv") {
  // A CSV has no place for prose above the header; the caveat goes to stderr.
  if (notice) console.error(notice);
  // A cell that starts with = + - @ (or a tab or CR) is a formula to a
  // spreadsheet; a leading apostrophe makes it text. The prose is the BSI's,
  // but the sheet is where a reviewer works.
  const q = (v) => {
    const s = String(v);
    return `"${(/^[=+@\t\r-]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
  };
  // relationship lists one entry per source in `from`, in the same order.
  const cols = ["id", "practice", "title", "level", "modal", "action", "subject", "target", "documentation", "effort", "from", "relationship", "statement"];
  console.log([...cols, "evidence", "status", "note"].join(","));
  for (const r of selected) console.log([...cols.map((c) => q(c === "from" ? r.from.join(" ") : c === "relationship" ? (r.relationship ?? []).join(" ") : r[c])), "", "", ""].join(","));
} else {
  console.log(`# Worksheet: ${meta}`);
  if (presetId) console.log(`Preset: ${presetId} · ${preset.title}${!catalogFile && commit !== LIBRARY.commit ? ` · tested at ${LIBRARY.commit}, run at another commit` : ""}`);
  if (mappingName) console.log(`Mapping: ${mappingName.split("/").pop()}${mappingStatus ? ` · status ${mappingStatus}` : ""}${sourceFilter.size ? ` · ${sourceFilter.size} source controls` : ""}`);
  const narrowed = [levels.length && `levels ${levels.join(", ")}`, modals.length && `modal ${modals.join(", ")}`, practices.length && `practices ${practices.join(", ")}`].filter(Boolean);
  if (narrowed.length) console.log(`Only: ${narrowed.join(" · ")}`);
  if (profilePath) console.log(`Profile: ${profilePath.split("/").pop()}`);
  if (notice) console.log(`\n> ${notice}`);
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
