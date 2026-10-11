#!/usr/bin/env node
// Generate an OSCAL mapping collection - another framework's requirements
// mapped onto Grundschutz++ - from a small mapping file.
//
// The BSI library maps ISO 27001 and the IT-Grundschutz-Kompendium 2023 onto
// Grundschutz++. For C5, NIS2, DORA and the like it has nothing yet; a mapping
// written here fills that gap until an official one exists. worksheet.mjs
// reads the result like a BSI mapping, and a preset can name it.
//
// Input (JSON):
//   {
//     "title": "NIS2 Art. 21(2) to Grundschutz++",
//     "version": "0.1.0",
//     "last-modified": "2026-10-11T00:00:00Z",
//     "status": "draft",              // draft | not-complete | complete
//     "method": "hybrid",             // human | automation | hybrid
//     "description": "What it maps, from which text, and who reviewed it.",
//     "source": { "title": "Directive (EU) 2022/2555, Art. 21(2)",
//                 "href": "https://eur-lex.europa.eu/eli/dir/2022/2555/oj",
//                 "ids": ["21.2.a", ...] },          // every ID of the source
//     "catalog": { "path": "control_layer/.../...-resolved_catalog.json",
//                  "commit": "<40-char sha of the BSI library>" },
//     "via": { "iso27001": { "title": "ISO/IEC 27001:2022 Annex A",
//                            "path": "control_layer/Mappings/.../...mapping_collection.json" } },
//     "maps": [{ "source": "21.2.a", "remarks": "why",
//                "via": { "iso27001": ["5.1", "5.2"] },             // derived
//                "relationship": "subset-of", "targets": ["RISK.1.1"] }, // direct
//              ...],
//     "unmapped": [{ "source": "21.2.x", "reason": "why no target fits" }]
//   }
//
// Derived targets: a source can name controls of a framework the BSI library
// already maps (ISO 27001 Annex A). Their Grundschutz++ targets come from that
// BSI mapping at the same commit, so the only judgement made here is the step
// to ISO, which a reviewer can check against the familiar control list. A
// derived target gets "intersects-with": two set relationships in a row do
// not give a sharper one. Direct targets cover what ISO does not have; they
// carry their own relationship. A source needs at least one of the two.
// Until the mapping is "complete", no relationship may claim that the targets
// cover the whole source (subset-of, equal-to, equivalent-to).
//
// Output: an OSCAL 1.2.2 mapping collection on stdout, the version of the
// library's own mappings. Source texts are not copied, only their IDs: the
// mapping is a judgement about them, not a copy of them.
//
// Checked, and an error otherwise - nothing is dropped silently:
//   - every target is in the catalog at the pinned commit
//   - every source ID in "source.ids" is either mapped or listed as unmapped
//     with a reason, and nothing outside "source.ids" appears
//   - relationships are the set-theory ones of NIST IR 8477, and a mapping
//     that is not "complete" claims no full coverage
//
// Deterministic like profile.mjs: same input, same bytes.
//
//   node mapping.mjs mappings/src/nis2-art21.json > mappings/nis2-art21-to-gspp.json
//
// No dependencies. Node 24 (LTS) or later.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const REPO = "https://raw.githubusercontent.com/BSI-Bund/Stand-der-Technik-Bibliothek";
const NS = "https://github.com/ohartwig/grundschutz-worksheets/ns";
const UUID_NS = "b1f0c6a2-5d3e-4f7a-9c8b-2e6d1a4f0b37";
const RELATIONSHIPS = ["equivalent-to", "equal-to", "subset-of", "superset-of", "intersects-with"];
const FULL = ["equivalent-to", "equal-to", "subset-of"];

const file = process.argv[2];
if (!file) {
  console.error("usage: mapping.mjs <mapping source.json>");
  process.exit(2);
}
const m = JSON.parse(readFileSync(file, "utf8"));
const fail = (msg) => {
  console.error(msg);
  process.exit(1);
};

if (!/^[0-9a-f]{40}$/.test(m.catalog?.commit ?? "")) fail("catalog.commit must be a 40-character commit");
for (const k of ["title", "version", "last-modified", "description"]) if (!m[k]) fail(`missing "${k}"`);
if (!["draft", "not-complete", "complete"].includes(m.status)) fail('status must be draft, not-complete or complete');
if (!["human", "automation", "hybrid"].includes(m.method)) fail("method must be human, automation or hybrid");
if (!m.source?.title || !m.source?.href || !m.source?.ids?.length) fail("source needs title, href and ids");

const uuid5 = (name) => {
  const ns = Buffer.from(UUID_NS.replace(/-/g, ""), "hex");
  const h = createHash("sha1").update(Buffer.concat([ns, Buffer.from(name, "utf8")])).digest();
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
};

// A path in the library is plain segments. An empty one, "." or ".." would
// resolve above the pinned commit and fetch another repository or a branch.
const libraryUrl = (p, what) => {
  const segs = String(p ?? "").split("/");
  if (segs.some((x) => !x || x === "." || x === "..")) fail(`${what} is not a path in the library: ${p}`);
  return `${REPO}/${m.catalog.commit}/${segs.map(encodeURIComponent).join("/")}`;
};
const href = libraryUrl(m.catalog.path, "catalog.path");
const r = await fetch(href);
if (!r.ok) fail(`${r.status} for ${href}`);
const { catalog } = await r.json();
if (!catalog) fail("not an OSCAL catalog");
const known = new Set();
const walk = (controls) => {
  for (const c of controls ?? []) {
    known.add(c.id);
    walk(c.controls);
  }
};
const groups = (gs) => {
  for (const g of gs ?? []) {
    walk(g.controls);
    groups(g.groups);
  }
};
walk(catalog.controls);
groups(catalog.groups);

const errors = [];
const ids = new Set(m.source.ids);
const covered = new Set();
const maps = m.maps ?? [];
const unmapped = m.unmapped ?? [];
// The BSI mappings a source can go through: control -> Grundschutz++ targets.
const via = new Map();
for (const [name, v] of Object.entries(m.via ?? {})) {
  const u = libraryUrl(v.path, `via.${name}.path`);
  const res = await fetch(u);
  if (!res.ok) fail(`${res.status} for ${u}`);
  const { "mapping-collection": mc } = await res.json();
  const targets = new Map();
  for (const mp of mc?.mappings ?? [])
    for (const x of mp.maps ?? [])
      for (const s of x.sources ?? []) {
        const set = targets.get(s["id-ref"]) ?? new Set();
        for (const t of x.targets ?? []) set.add(t["id-ref"]);
        targets.set(s["id-ref"], set);
      }
  via.set(name, { ...v, href: u, targets });
}
const byId = (a, b) => a.localeCompare(b, "en", { numeric: true });
const lagging = new Set();
for (const [i, x] of maps.entries()) {
  const at = `maps[${i}] (${x.source})`;
  if (!ids.has(x.source)) errors.push(`${at}: source not in source.ids`);
  if (!x.targets?.length && !Object.keys(x.via ?? {}).length) errors.push(`${at}: no targets and nothing via`);
  if (x.targets?.length && !RELATIONSHIPS.includes(x.relationship)) errors.push(`${at}: relationship must be one of ${RELATIONSHIPS.join(", ")}`);
  // subset-of, equal-to and equivalent-to say the targets cover all of the
  // source. Only a person who has checked that may say it.
  if (x.targets?.length && m.status !== "complete" && FULL.includes(x.relationship)) errors.push(`${at}: ${x.relationship} claims full coverage, which a ${m.status} mapping cannot -- use intersects-with or superset-of until it is reviewed`);
  if (!x.remarks) errors.push(`${at}: no remarks -- say why these targets`);
  // Derived targets, minus the direct ones; a BSI target the catalog no longer
  // has is reported, not kept (the BSI mapping lags the catalog).
  x.derived = [];
  for (const [name, controls] of Object.entries(x.via ?? {})) {
    const v = via.get(name);
    if (!v) {
      errors.push(`${at}: via ${name} is not declared in "via"`);
      continue;
    }
    for (const c of controls) {
      if (!v.targets.has(c)) errors.push(`${at}: ${name} ${c} is not a source of ${v.path.split("/").pop()}`);
      for (const t of v.targets.get(c) ?? []) {
        if (!known.has(t)) lagging.add(`${t} (${name} ${c})`);
        else if (!x.derived.includes(t) && !(x.targets ?? []).includes(t)) x.derived.push(t);
      }
    }
  }
  x.derived.sort(byId);
  if (!x.targets?.length && !x.derived.length && Object.keys(x.via ?? {}).length) errors.push(`${at}: via leads to no target in the catalog`);
  const seen = new Set();
  for (const t of x.targets ?? []) {
    if (seen.has(t)) errors.push(`${at}: ${t} listed twice`);
    seen.add(t);
    if (!known.has(t)) errors.push(`${at}: ${t} not in the catalog at ${m.catalog.commit.slice(0, 7)}`);
  }
  covered.add(x.source);
}
const laggingNote = lagging.size ? `Targets of the BSI mapping not in the catalog, left out (${lagging.size}): ${[...lagging].sort(byId).join("; ")}` : "";
if (laggingNote) console.error(laggingNote);
for (const u of unmapped) {
  if (!ids.has(u.source)) errors.push(`unmapped ${u.source}: not in source.ids`);
  if (!u.reason) errors.push(`unmapped ${u.source}: no reason`);
  if (covered.has(u.source)) errors.push(`unmapped ${u.source}: also mapped`);
  covered.add(u.source);
}
for (const id of ids) if (!covered.has(id)) errors.push(`${id}: neither mapped nor listed as unmapped`);
if (errors.length) fail(`${errors.length} error(s):\n  ${errors.join("\n  ")}`);

const mappingUuid = uuid5(`mapping:${m.title}:${m.catalog.path}`);
const out = {
  "mapping-collection": {
    uuid: uuid5(`mapping-collection:${m.title}`),
    metadata: {
      title: m.title,
      "last-modified": m["last-modified"],
      version: m.version,
      "oscal-version": "1.2.2",
      props: [
        { name: "catalog-commit", ns: NS, value: m.catalog.commit },
        { name: "source-ids", ns: NS, value: String(ids.size) },
        { name: "unmapped", ns: NS, value: String(unmapped.length) },
        ...[...via].map(([name, v]) => ({ name: "derived-via", ns: NS, value: v.href, remarks: `${name}: ${v.title}` })),
      ],
      remarks: `Generated by grundschutz-worksheets mapping.mjs from a mapping file. Do not edit by hand.${laggingNote ? `\n\n${laggingNote}.` : ""}`,
    },
    provenance: {
      method: m.method,
      "matching-rationale": "semantic",
      status: m.status,
      "mapping-description": m.description,
    },
    mappings: [
      {
        uuid: mappingUuid,
        "source-resource": { type: "catalog", href: m.source.href, remarks: m.source.title },
        "target-resource": { type: "catalog", href },
        maps: maps.flatMap((x, i) => [
          ...(x.targets?.length
            ? [{
                uuid: uuid5(`map:${mappingUuid}:${i}:${x.source}`),
                relationship: x.relationship,
                sources: [{ type: "control", "id-ref": x.source }],
                targets: x.targets.map((t) => ({ type: "control", "id-ref": t })),
                remarks: x.remarks,
              }]
            : []),
          ...(x.derived.length
            ? [{
                uuid: uuid5(`map:${mappingUuid}:${i}:${x.source}:derived`),
                relationship: "intersects-with",
                sources: [{ type: "control", "id-ref": x.source }],
                targets: x.derived.map((t) => ({ type: "control", "id-ref": t })),
                props: Object.entries(x.via).flatMap(([name, cs]) => cs.map((c) => ({ name: "via", ns: NS, value: `${name}:${c}` }))),
                remarks: `${x.remarks}\n\nDerived through the BSI mapping${Object.keys(x.via).length > 1 ? "s" : ""} from ${Object.entries(x.via)
                  .map(([name, cs]) => `${via.get(name).title} ${cs.join(", ")}`)
                  .join("; ")}.`,
              }]
            : []),
        ]),
        // The gap summary takes IDs only; the reasons go into the remarks.
        ...(unmapped.length && {
          "source-gap-summary": {
            uuid: uuid5(`gap:${mappingUuid}`),
            "unmapped-controls": [{ "with-ids": unmapped.map((u) => u.source) }],
          },
          remarks: `Not mapped:\n\n${unmapped.map((u) => `- ${u.source}: ${u.reason}`).join("\n")}`,
        }),
      },
    ],
  },
};

process.stdout.write(JSON.stringify(out, null, 2) + "\n");
