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
//     "maps": [{ "source": "21.2.a", "relationship": "subset-of",
//                "targets": ["RISK.1.1", ...], "remarks": "why" }, ...],
//     "unmapped": [{ "source": "21.2.x", "reason": "why no target fits" }]
//   }
//
// Output: an OSCAL 1.2.2 mapping collection on stdout, the version of the
// library's own mappings. Source texts are not copied, only their IDs: the
// mapping is a judgement about them, not a copy of them.
//
// Checked, and an error otherwise - nothing is dropped silently:
//   - every target is in the catalog at the pinned commit
//   - every source ID in "source.ids" is either mapped or listed as unmapped
//     with a reason, and nothing outside "source.ids" appears
//   - relationships are the set-theory ones of NIST IR 8477
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

const href = `${REPO}/${m.catalog.commit}/${m.catalog.path.split("/").map(encodeURIComponent).join("/")}`;
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
for (const [i, x] of maps.entries()) {
  const at = `maps[${i}] (${x.source})`;
  if (!ids.has(x.source)) errors.push(`${at}: source not in source.ids`);
  if (!RELATIONSHIPS.includes(x.relationship)) errors.push(`${at}: relationship must be one of ${RELATIONSHIPS.join(", ")}`);
  if (!x.targets?.length) errors.push(`${at}: no targets`);
  if (!x.remarks) errors.push(`${at}: no remarks -- say why these targets`);
  const seen = new Set();
  for (const t of x.targets ?? []) {
    if (seen.has(t)) errors.push(`${at}: ${t} listed twice`);
    seen.add(t);
    if (!known.has(t)) errors.push(`${at}: ${t} not in the catalog at ${m.catalog.commit.slice(0, 7)}`);
  }
  covered.add(x.source);
}
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
      ],
      remarks: "Generated by grundschutz-worksheets mapping.mjs from a mapping file. Do not edit by hand.",
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
        maps: maps.map((x, i) => ({
          uuid: uuid5(`map:${mappingUuid}:${i}:${x.source}`),
          relationship: x.relationship,
          sources: [{ type: "control", "id-ref": x.source }],
          targets: x.targets.map((t) => ({ type: "control", "id-ref": t })),
          remarks: x.remarks,
        })),
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
