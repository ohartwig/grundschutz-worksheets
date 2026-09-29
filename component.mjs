#!/usr/bin/env node
// Generate an OSCAL component definition - what a product or pipeline does
// for which requirements of a BSI catalog - from a small source file.
//
// NIST calls this "self-describing software and containers": the artefact
// carries a machine-readable statement of the requirements it supports. A
// build pipeline can generate one per image, fill in the image digest, and
// attach it to the image as a signed attestation next to the SBOM.
//
// Input (JSON):
//   {
//     "title": "Supply-chain controls of the image pipeline",
//     "version": "1.0.0",
//     "last-modified": "2026-09-27T00:00:00Z",
//     "catalog": { "path": "control_layer/Grundschutz++/Grundschutz++-resolved_catalog.json",
//                  "commit": "<40-char sha of the BSI library>" },
//     "component": { "type": "software", "title": "...", "description": "...", "purpose": "..." },
//     "requirements": [
//       { "id": "DEV.4.3",
//         "description": "What the component does for this requirement, in your own words.",
//         "evidence": [{ "text": "attest:sbom job", "href": "https://..." }] }
//     ]
//   }
//
// Options:
//   --subject <image@sha256:...>   the artefact this definition describes; adds
//                                  image and digest as props of the component
//   --prop <name=value>            further props on the component (repeatable),
//                                  e.g. pipeline URL or commit
//
// Output: an OSCAL 1.2.2 component definition on stdout - the version the BSI
// library's own component definitions use. Every requirement carries both
// identifiers: the Grundschutz++ ID as control-id and the catalog's
// alt-identifier UUID as a prop, because the library's own components refer
// by UUID and tools reading them must be able to join.
//
// Deterministic for the same input and options: UUIDs are derived from the
// content, dates come from the input.
//
//   node component.mjs source.json --subject registry.example/app@sha256:... > component.json
//
// No dependencies. Node 24 (LTS) or later.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const REPO = "https://raw.githubusercontent.com/BSI-Bund/Stand-der-Technik-Bibliothek";
const NS = "https://github.com/ohartwig/grundschutz-worksheets/ns";
const UUID_NS = "b1f0c6a2-5d3e-4f7a-9c8b-2e6d1a4f0b37";

const args = process.argv.slice(2);
const file = args.find((a, i) => !a.startsWith("--") && !["--subject", "--prop"].includes(args[i - 1]));
const subject = args.includes("--subject") ? args[args.indexOf("--subject") + 1] : "";
const extraProps = args.flatMap((a, i) => (a === "--prop" ? [args[i + 1]] : []));
const fail = (msg) => {
  console.error(msg);
  process.exit(1);
};
if (!file) {
  console.error("usage: component.mjs <source.json> [--subject image@sha256:...] [--prop name=value ...]");
  process.exit(2);
}

const s = JSON.parse(readFileSync(file, "utf8"));
if (!/^[0-9a-f]{40}$/.test(s.catalog?.commit ?? "")) fail("catalog.commit must be a 40-character commit");
for (const k of ["title", "version", "last-modified"]) if (!s[k]) fail(`missing "${k}"`);
for (const k of ["type", "title", "description"]) if (!s.component?.[k]) fail(`missing "component.${k}"`);
if (!Array.isArray(s.requirements) || !s.requirements.length) fail("no requirements");
if (subject && !/^[^@\s]+@sha256:[0-9a-f]{64}$/.test(subject)) fail("--subject must be <image>@sha256:<64 hex>");

const uuid5 = (name) => {
  const ns = Buffer.from(UUID_NS.replace(/-/g, ""), "hex");
  const h = createHash("sha1").update(Buffer.concat([ns, Buffer.from(name, "utf8")])).digest();
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
};

const href = `${REPO}/${s.catalog.commit}/${s.catalog.path.split("/").map(encodeURIComponent).join("/")}`;
const r = await fetch(href);
if (!r.ok) fail(`${r.status} for ${href}`);
const { catalog } = await r.json();
if (!catalog) fail("not an OSCAL catalog");

// ID -> alt-identifier UUID for every requirement, however deeply nested.
const alt = new Map();
const walk = (controls) => {
  for (const c of controls ?? []) {
    alt.set(c.id, (c.props ?? []).find((p) => p.name === "alt-identifier")?.value ?? "");
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
const seen = new Set();
for (const req of s.requirements) {
  if (!alt.has(req.id)) errors.push(`${req.id}: not in the catalog at ${s.catalog.commit.slice(0, 7)}`);
  if (seen.has(req.id)) errors.push(`${req.id}: listed twice`);
  if (!req.description) errors.push(`${req.id}: no description`);
  seen.add(req.id);
}
if (errors.length) fail(`${errors.length} error(s):\n  ${errors.join("\n  ")}`);

const props = [];
if (subject) {
  const [image, digest] = subject.split("@");
  props.push({ name: "image", ns: NS, value: image }, { name: "image-digest", ns: NS, value: digest });
}
for (const p of extraProps) {
  const i = p.indexOf("=");
  if (i < 1) fail(`--prop needs name=value: ${p}`);
  props.push({ name: p.slice(0, i), ns: NS, value: p.slice(i + 1) });
}

const byId = (a, b) => a.id.localeCompare(b.id, "en", { numeric: true });
const key = `${s.title}:${s.component.title}:${subject}`;
const component = {
  uuid: uuid5(`component:${key}`),
  type: s.component.type,
  title: s.component.title,
  description: s.component.description,
  ...(s.component.purpose && { purpose: s.component.purpose }),
  ...(props.length && { props }),
  "control-implementations": [
    {
      uuid: uuid5(`implementation:${key}`),
      source: href,
      description: `Requirements of ${catalog.metadata?.title ?? "the catalog"} at library commit ${s.catalog.commit}.`,
      "implemented-requirements": [...s.requirements].sort(byId).map((req) => ({
        uuid: uuid5(`requirement:${key}:${req.id}`),
        "control-id": req.id,
        ...(alt.get(req.id) && { props: [{ name: "alt-identifier", ns: NS, value: alt.get(req.id) }] }),
        ...(req.evidence?.length && {
          links: req.evidence.map((e) => ({ href: e.href, rel: "reference", text: e.text })),
        }),
        description: req.description,
      })),
    },
  ],
};

const out = {
  "component-definition": {
    uuid: uuid5(`definition:${key}`),
    metadata: {
      title: s.title,
      "last-modified": s["last-modified"],
      version: s.version,
      "oscal-version": "1.2.2",
      remarks:
        "Generated by grundschutz-worksheets component.mjs. Describes what the component supports; " +
        "it is not a statement that a system is compliant.",
    },
    components: [component],
  },
};
process.stdout.write(JSON.stringify(out, null, 2) + "\n");
