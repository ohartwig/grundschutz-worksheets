#!/usr/bin/env node
// The step to ISO 27001 of the NIS2 Implementing Regulation mapping, taken
// from ENISA rather than written here. ENISA's Technical Implementation
// Guidance comes with a mapping table that names, for every point of
// Implementing Regulation (EU) 2024/2690, the ISO/IEC 27001:2022 clauses and
// Annex A controls it corresponds to. mapping.mjs derives Grundschutz++
// targets from Annex A controls through the BSI's own ISO mapping, so with
// ENISA's column the only judgement left in that chain is ENISA's.
//
// The mapping source names the table and pins it:
//   "iso-step": {
//     "title": "ENISA Technical Implementation Guidance, mapping table",
//     "version": "1.2",
//     "href": "https://www.enisa.europa.eu/.../Mapping_table_version_1.2.xlsx",
//     "sha256": "<64 hex>",
//     "licence": "CC BY 4.0",
//     "sheet": "Mapping table",
//     "column": "ISO standard 27001:2022",
//     "points": { "7.1": "Nr.7" }   // ENISA's number -> source ID, where they differ
//   }
// and every other ENISA point N.M is the source Nr.N.M.
//
// ENISA's column is written by hand and needs reading, not just splitting. The
// rules, and an error for anything they do not cover:
//   - entries are separated by commas; spaces inside an entry go ("A. 7.11")
//   - a Greek capital alpha (U+0391) that looks like an A is an A ("Α.5.19")
//   - "A5.7" is "A.5.7"
//   - "A.5.7" is Annex A control 5.7, and must exist in the 2022 Annex A
//     (5.1-5.37, 6.1-6.8, 7.1-7.14, 8.1-8.34)
//   - a bare number ("6.1.2", "9.3") is a clause of the management system part;
//     it has no Annex A control, so it yields no derived target. The remarks of
//     the map must name these clauses, so the reviewer sees them.
//
// Checks the mapping source against the table and exits 1 on any difference:
// every ENISA point is a source, every source an ENISA point, and each map's
// via.iso27001 is exactly ENISA's Annex A controls in ENISA's order. --write
// sets via.iso27001 from the table instead and leaves everything else alone.
//
//   node tools/enisa-iso.mjs mappings/src/nis2-ir.json
//   node tools/enisa-iso.mjs mappings/src/nis2-ir.json --file mapping.xlsx --write
//
// The table is an .xlsx file; this reads it without dependencies: a zip of
// XML, the cells either shared strings or inline. No dependencies. Node 24
// (LTS) or later.

import { readFileSync, writeFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import { sha256 } from "../lib/oscal.mjs";

const args = process.argv.slice(2);
const local = args.includes("--file") ? args[args.indexOf("--file") + 1] : "";
const write = args.includes("--write");
const file = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--file");
if (!file) {
  console.error("usage: enisa-iso.mjs <mapping source.json> [--file <table.xlsx>] [--write]");
  process.exit(2);
}
const fail = (msg) => {
  console.error(msg);
  process.exit(1);
};
const text = readFileSync(file, "utf8");
const m = JSON.parse(text);
const step = m["iso-step"] ?? fail(`${file}: no "iso-step"`);
for (const k of ["title", "version", "href", "licence", "sheet", "column"]) if (!step[k]) fail(`iso-step: missing "${k}"`);
if (!/^[0-9a-f]{64}$/.test(step.sha256 ?? "")) fail("iso-step: sha256 must be 64 hex");

let bytes;
if (local) bytes = readFileSync(local);
else {
  const res = await fetch(step.href);
  if (!res.ok) fail(`${res.status} for ${step.href}`);
  bytes = Buffer.from(await res.arrayBuffer());
}
if (sha256(bytes) !== step.sha256) fail(`the table is not the pinned one: sha256 ${sha256(bytes)}, expected ${step.sha256}`);

// The zip: the central directory at the end lists every entry with the offset
// of its local header; the data follows that header, stored or deflated.
const unzip = (buf) => {
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) fail("the table is not a zip file");
  const files = new Map();
  let p = buf.readUInt32LE(eocd + 16);
  for (let i = buf.readUInt16LE(eocd + 10); i > 0; i--) {
    if (buf.readUInt32LE(p) !== 0x02014b50) fail("the table's zip directory is broken");
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const skip = nameLen + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    const at = buf.readUInt32LE(p + 42);
    const start = at + 30 + buf.readUInt16LE(at + 26) + buf.readUInt16LE(at + 28);
    const data = buf.subarray(start, start + size);
    files.set(name, () => (method === 8 ? inflateRawSync(data) : method === 0 ? data : fail(`${name}: compression ${method}`)).toString("utf8"));
    p += 46 + skip;
  }
  return files;
};
const zip = unzip(bytes);
const part = (name) => (zip.get(name) ?? fail(`the table has no ${name}`))();

// Just enough XML for a spreadsheet: elements with attributes, and text.
const decode = (s) => s.replace(/&(lt|gt|quot|apos|amp|#\d+|#x[0-9a-f]+);/gi, (_, e) =>
  ({ lt: "<", gt: ">", quot: '"', apos: "'", amp: "&" })[e] ?? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1))));
const texts = (xml) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t\s*\/>/g)].map((x) => decode(x[1] ?? "")).join("");
const shared = zip.has("xl/sharedStrings.xml") ? [...part("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((x) => texts(x[1])) : [];

// The sheet by its name: workbook -> relationship -> part.
const wb = part("xl/workbook.xml");
const rid = [...wb.matchAll(/<sheet\s([^>]*)\/>/g)].map((x) => x[1]).find((a) => decode(a.match(/name="([^"]*)"/)?.[1] ?? "") === step.sheet)?.match(/r:id="([^"]*)"/)?.[1];
if (!rid) fail(`the table has no sheet "${step.sheet}"`);
const target = part("xl/_rels/workbook.xml.rels").match(new RegExp(`<Relationship[^>]*Id="${rid}"[^>]*Target="([^"]*)"`))?.[1] ?? fail(`no part for sheet ${rid}`);
const sheet = part(target.startsWith("/") ? target.slice(1) : `xl/${target}`);

const rows = [...sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)].map((r) => {
  const cells = {};
  for (const c of r[1].matchAll(/<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const col = c[1].match(/r="([A-Z]+)\d+"/)?.[1];
    const type = c[1].match(/t="([^"]*)"/)?.[1];
    const v = c[2]?.match(/<v>([\s\S]*?)<\/v>/)?.[1];
    cells[col] = type === "s" ? shared[Number(v)] : type === "inlineStr" ? texts(c[2] ?? "") : type === "n" || !type ? (v === undefined ? "" : { number: v }) : decode(v ?? "");
  }
  return cells;
});
// The header row names the columns; the point number is in the first.
const head = rows.findIndex((r) => Object.values(r).includes(step.column));
if (head < 0) fail(`no column "${step.column}" in sheet "${step.sheet}"`);
const col = Object.entries(rows[head]).find(([, v]) => v === step.column)[0];
const first = Object.keys(rows[head]).sort()[0];

// ENISA's entries, read by the rules above.
const ANNEX_A = { 5: 37, 6: 8, 7: 14, 8: 34 };
const read = (point, cell) => {
  const annexA = [];
  const clauses = [];
  for (let e of cell.split(",")) {
    e = e.replace(/\s+/g, "").replace(/Α/g, "A").replace(/^A(\d)/, "A.$1");
    if (!e) continue;
    let x;
    if ((x = e.match(/^A\.(\d+)\.(\d+)$/))) {
      if (!(Number(x[2]) >= 1 && Number(x[2]) <= (ANNEX_A[x[1]] ?? 0))) fail(`${point}: ${e} is not an Annex A control of ISO/IEC 27001:2022`);
      const c = `${x[1]}.${x[2]}`;
      if (!annexA.includes(c)) annexA.push(c);
    } else if (/^\d+(\.\d+)*$/.test(e)) {
      if (!clauses.includes(e)) clauses.push(e);
    } else fail(`${point}: cannot read "${e}" in ${step.column}`);
  }
  return { annexA, clauses };
};
const enisa = new Map();
for (const r of rows.slice(head + 1)) {
  const n = r[first];
  if (n === undefined || n === "") continue;
  if (typeof n !== "string" || !/^\d+\.\d+$/.test(n.trim())) fail(`a point number that is not text N.M: ${JSON.stringify(n)}`);
  const id = step.points?.[n.trim()] ?? `Nr.${n.trim()}`;
  if (enisa.has(id)) fail(`${id}: twice in the table`);
  enisa.set(id, { point: n.trim(), ...read(n.trim(), typeof r[col] === "string" ? r[col] : "") });
}

const errors = [];
const ids = new Set(m.source?.ids ?? []);
for (const id of enisa.keys()) if (!ids.has(id)) errors.push(`${id}: in ENISA's table, not in source.ids`);
for (const id of ids) if (!enisa.has(id)) errors.push(`${id}: in source.ids, not in ENISA's table`);
const maps = m.maps ?? [];
for (const [id, e] of enisa) {
  const x = maps.find((y) => y.source === id);
  if (!x) {
    if (!(m.unmapped ?? []).some((u) => u.source === id)) errors.push(`${id}: no map`);
    continue;
  }
  if (write) {
    if (e.annexA.length) x.via = { ...x.via, iso27001: e.annexA };
    else if (x.via) delete x.via.iso27001;
    continue;
  }
  const have = (x.via?.iso27001 ?? []).join(", ");
  if (have !== e.annexA.join(", ")) errors.push(`${id}: via.iso27001 is [${have}], ENISA ${e.point} says [${e.annexA.join(", ")}]`);
  const missing = e.clauses.filter((c) => !new RegExp(`(^|[^\\d.])${c.replace(/\./g, "\\.")}(?![\\d])`).test(x.remarks ?? ""));
  if (missing.length) errors.push(`${id}: ENISA names ISO clause(s) ${missing.join(", ")}; the remarks must say so`);
}
if (errors.length) fail(`${errors.length} difference(s) from ${step.title} ${step.version}:\n  ${errors.join("\n  ")}`);
if (write) {
  writeFileSync(file, JSON.stringify(m, null, 2) + "\n");
  console.log(`${file}: via.iso27001 set from ${step.title} ${step.version} for ${enisa.size} points`);
} else console.log(`${file}: the step to ISO is ${step.title} ${step.version}, all ${enisa.size} points`);
