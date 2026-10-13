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
//                 "catalog": "standards/nis2.json",   // or "href" to the text
//                 "ids": ["Art.21.2.a", ...] },      // every ID of the source
//     "catalog": { "path": "control_layer/.../...-resolved_catalog.json",
//                  "commit": "<40-char sha of the BSI library>" },
//     "via": { "iso27001": { "title": "ISO/IEC 27001:2022 Annex A",
//                            "path": "control_layer/Mappings/.../...mapping_collection.json" } },
//     "maps": [{ "source": "21.2.a", "remarks": "why",
//                "via": { "iso27001": ["5.1", "5.2"] },             // derived
//                "relationship": "intersects-with", "targets": ["RISK.1.1"] }, // direct
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
// The source: an OSCAL catalog of this repository ("catalog", a path from the
// repository root, written by tools/eu-catalog.mjs), or where there is none
// yet only the address of its text ("href"). With a catalog, every source ID
// must be one of its controls, and the mapping imports it the way the other
// documents here import theirs: a back-matter resource with the catalog's
// SHA-256, its link relative to mappings/, where the output goes. A source can
// be an article that the catalog holds as a group of paragraphs (DORA is
// mapped by article), or a numbered heading of an annex (Nr.1.1 of the NIS2
// Implementing Regulation); the mapping then names every control beneath it.
//
// Output: an OSCAL 1.2.2 mapping collection on stdout, the version of the
// library's own mappings. Source texts are not copied, only their IDs: the
// mapping is a judgement about them, not a copy of them.
//
// Checked, and an error otherwise - nothing is dropped silently:
//   - every target is in the catalog at the pinned commit
//   - with a source catalog, every source ID is one of its controls or articles
//   - every source ID in "source.ids" is either mapped or listed as unmapped
//     with a reason, and nothing outside "source.ids" appears
//   - relationships are the set-theory ones of NIST IR 8477, and a mapping
//     that is not "complete" claims no full coverage
//
// Deterministic like profile.mjs: same input, same bytes.
//
//   node mapping.mjs mappings/src/nis2.json > mappings/nis2-to-gspp.json
//
// With --review it writes, instead of the OSCAL, a Markdown sheet for the
// person who reviews the draft: per source its remark, the step to ISO, every
// target with its title, and boxes to tick. Ticking them is the review; a
// mapping whose sheet is ticked through can change its status to "complete".
//
//   node mapping.mjs mappings/src/nis2.json --review > nis2-review.md
//
// No dependencies. Node 24 (LTS) or later.

import { readFileSync } from "node:fs";
import { NS, byId, everyControl, importResource, libraryUrl, uuid5 as uuid5From } from "./lib/oscal.mjs";

const UUID_NS = "b1f0c6a2-5d3e-4f7a-9c8b-2e6d1a4f0b37";
const RELATIONSHIPS = ["equivalent-to", "equal-to", "subset-of", "superset-of", "intersects-with"];
const FULL = ["equivalent-to", "equal-to", "subset-of"];

const review = process.argv.includes("--review");
const file = process.argv.slice(2).find((a) => !a.startsWith("--"));
if (!file) {
  console.error("usage: mapping.mjs <mapping source.json> [--review]");
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
if (!m.source?.title || !m.source?.ids?.length || !m.source.catalog === !m.source.href) fail("source needs title, ids and either catalog or href");

const uuid5 = uuid5From(UUID_NS);

// A path in the library is plain segments; anything else has no URL.
const pinned = (p, what) => libraryUrl(m.catalog.commit, p) ?? fail(`${what} is not a path in the library: ${p}`);
const href = pinned(m.catalog.path, "catalog.path");
const r = await fetch(href);
if (!r.ok) fail(`${r.status} for ${href}`);
const { catalog } = await r.json();
if (!catalog) fail("not an OSCAL catalog");
const known = new Set();
const titles = new Map();
for (const c of everyControl(catalog)) {
  known.add(c.id);
  titles.set(c.id, c.title ?? "");
}

// The source catalog, read from this repository: its controls and their words.
const sourceText = new Map();
// An article with paragraphs is a group in such a catalog, and a mapping can
// only name controls: a source that is an article stands for its paragraphs,
// all of them together, under the same relationship.
const members = new Map();
let sourceResource = null;
if (m.source.catalog) {
  const segs = m.source.catalog.split("/");
  if (segs.some((x) => !x || x === "." || x === "..")) fail(`source.catalog is not a path in this repository: ${m.source.catalog}`);
  const bytes = readFileSync(new URL(m.source.catalog, import.meta.url));
  const sc = JSON.parse(bytes).catalog ?? fail(`${m.source.catalog} is not an OSCAL catalog`);
  for (const c of everyControl(sc)) {
    const st = c.parts?.find((x) => x.name === "statement");
    const after = (st?.parts ?? []).map((x) => `${x.props?.find((p) => p.name === "label")?.value ?? x.id}: ${x.prose}`);
    sourceText.set(c.id, { prose: st?.prose ?? "", after });
  }
  // A group stands for every control beneath it, in its subgroups too: a
  // section of an annex holds subsections, and those hold the points.
  const collect = (g) => {
    const below = [...(g.controls ?? []).map((c) => c.id), ...(g.groups ?? []).flatMap(collect)];
    members.set(g.id, below);
    return below;
  };
  for (const g of sc.groups ?? []) collect(g);
  sourceResource = importResource(uuid5(`source:${m.source.catalog}`), sc.metadata.title, `../${m.source.catalog}`, bytes);
}

const errors = [];
const ids = new Set(m.source.ids);
if (sourceResource) for (const id of ids) if (!sourceText.has(id) && !members.get(id)?.length) errors.push(`${id}: neither a control nor an article of ${m.source.catalog}`);
const expand = (id) => members.get(id) ?? [id];
const items = (id) => expand(id).map((s) => ({ type: "control", "id-ref": s }));
const covered = new Set();
const maps = m.maps ?? [];
const unmapped = m.unmapped ?? [];
// The BSI mappings a source can go through: control -> Grundschutz++ targets.
const via = new Map();
for (const [name, v] of Object.entries(m.via ?? {})) {
  const u = pinned(v.path, `via.${name}.path`);
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

// --review: one section per source, in the order of source.ids. The boxes are
// the questions a reviewer answers; the remarks are this repository's words.
const reviewSheet = () => {
  const t = (id) => `${id} ${titles.get(id) ?? ""}`.trim();
  const lines = [
    `# Review: ${m.title}`,
    "",
    `Version ${m.version} · status ${m.status} · catalog ${m.catalog.path.split("/").pop()} at ${m.catalog.commit.slice(0, 7)}`,
    "",
    `Source: ${m.source.title} (${m.source.catalog ?? m.source.href}). Check every section against the original text, not against the remark.`,
    "Derived targets come from the BSI's own mapping and are only as right as the step to it; a direct target is this repository's judgement.",
    "",
  ];
  const bySource = new Map(maps.map((x) => [x.source, x]));
  const why = new Map(unmapped.map((u) => [u.source, u.reason]));
  for (const id of ids) {
    const st = sourceText.get(id);
    lines.push(`## ${id}`, "");
    if (st?.prose) lines.push(`Text: ${st.prose.replace(/\n\n/g, " ")}`, "");
    const flat = (s) => sourceText.get(s).prose.replace(/\n\n/g, " ");
    for (const s of members.get(id) ?? []) {
      lines.push(`- ${s}: ${flat(s)}`);
      for (const p of [...sourceText.keys()].filter((k) => k.startsWith(`${s}.`))) lines.push(`  - ${p}: ${flat(p)}`);
      for (const a of sourceText.get(s).after) lines.push(`  - ${a.replace(/\n\n/g, " ")}`);
    }
    if (members.has(id)) lines.push("");
    if (why.has(id)) {
      lines.push(`Not mapped: ${why.get(id)}`, "", "- [ ] No requirement of the catalog fits; the reason holds", "");
      continue;
    }
    const x = bySource.get(id);
    lines.push(`> ${x.remarks}`, "");
    for (const [name, cs] of Object.entries(x.via ?? {})) {
      lines.push(`- [ ] Step to ${via.get(name).title}: ${cs.join(", ")} -- these and no others`);
    }
    if (x.derived.length) lines.push(`  - derived, intersects-with: ${x.derived.map(t).join("; ")}`);
    if (x.targets?.length) {
      lines.push(`- [ ] Direct targets, ${x.relationship}: ${x.targets.map(t).join("; ")}`);
      lines.push(`- [ ] Relationship: ${x.relationship} holds${FULL.includes(x.relationship) ? "" : " (or the targets cover all of the source: then subset-of)"}`);
    }
    lines.push("- [ ] The remark is our own wording, not the source's text", "");
  }
  if (laggingNote) lines.push("## Left out", "", laggingNote, "");
  return lines.join("\n");
};

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
        "source-resource": sourceResource
          ? { type: "catalog", href: `#${sourceResource.uuid}`, remarks: m.source.title }
          : { type: "catalog", href: m.source.href, remarks: m.source.title },
        "target-resource": { type: "catalog", href },
        maps: maps.flatMap((x, i) => [
          ...(x.targets?.length
            ? [{
                uuid: uuid5(`map:${mappingUuid}:${i}:${x.source}`),
                relationship: x.relationship,
                sources: items(x.source),
                targets: x.targets.map((t) => ({ type: "control", "id-ref": t })),
                remarks: x.remarks,
              }]
            : []),
          ...(x.derived.length
            ? [{
                uuid: uuid5(`map:${mappingUuid}:${i}:${x.source}:derived`),
                relationship: "intersects-with",
                sources: items(x.source),
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
            "unmapped-controls": [{ "with-ids": unmapped.flatMap((u) => expand(u.source)) }],
          },
          remarks: `Not mapped:\n\n${unmapped.map((u) => `- ${u.source}: ${u.reason}`).join("\n")}`,
        }),
      },
    ],
    ...(sourceResource && { "back-matter": { resources: [sourceResource] } }),
  },
};

// No process.exit() after this: on a pipe it would cut a long output short.
process.stdout.write(review ? reviewSheet() : JSON.stringify(out, null, 2) + "\n");
