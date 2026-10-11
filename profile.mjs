#!/usr/bin/env node
// Generate an OSCAL profile - your tailoring of a BSI catalog - from a small
// tailoring file.
//
// A Statement of Applicability says which requirements apply. As an OSCAL
// profile that selection becomes data other tools can read: the worksheet
// takes it with --profile, and a system security plan imports it later.
//
// Input (JSON):
//   {
//     "title": "Grundschutz++ tailoring of <organisation>",
//     "version": "2026-09-27",
//     "last-modified": "2026-09-27T00:00:00Z",
//     "catalog": { "path": "control_layer/.../...-resolved_catalog.json",
//                  "commit": "<40-char sha of the BSI library>" },
//     "applicable": ["DET.2.1", "KONF.3.2", ...],
//     "not-applicable": [{ "id": "ARCH.6.1", "reason": "no own WAN links" }, ...],
//     "parameters": { "rea.1.2-prm1": "jährlich", "rea.1.1.2-prm1": ["CISO", "SOC"] }
//   }
//
// Output: an OSCAL 1.1.3 profile on stdout (the version the library's own
// profiles use). It imports the catalog at the pinned commit and includes the
// applicable IDs. OSCAL profiles have no field for "excluded, and why", so the
// not-applicable requirements are recorded as back-matter resources with the
// reason, marked with this repository's namespace. The system security plan
// is where OSCAL expects that statement; until one exists, it stays here.
//
// Parameters are the blanks the catalog leaves to you: "{{regelmäßig}}" (how
// often), "{{zuständigen Personen oder Rollen}}" (who). Your values become the
// profile's set-parameters, so the worksheet prints "jährlich" instead of
// "regelmäßig" and a viewer can read how often a check is due and who owns it.
// A parameter must belong to an applicable requirement: a value for a
// requirement that is out of scope, or for an ID the catalog does not have, is
// an error.
//
// Deterministic: UUIDs are derived from the content (v5-style), and
// last-modified comes from the input. The same input gives the same bytes, so a
// changed profile shows exactly the rows that changed.
//
// Every ID is checked against the catalog at the pinned commit. An unknown ID,
// an ID listed twice, or an ID that is both applicable and not applicable is
// an error - nothing is dropped silently.
//
//   node profile.mjs tailoring.json > profile.json
//
// No dependencies. Node 24 (LTS) or later.

import { readFileSync } from "node:fs";
import { NS, byId, everyControl, libraryUrl, uuid5 as uuid5From } from "./lib/oscal.mjs";

// Fixed namespace for the derived UUIDs of this tool.
const UUID_NS = "b1f0c6a2-5d3e-4f7a-9c8b-2e6d1a4f0b37";

const file = process.argv[2];
if (!file) {
  console.error("usage: profile.mjs <tailoring.json>");
  process.exit(2);
}
const t = JSON.parse(readFileSync(file, "utf8"));
const fail = (msg) => {
  console.error(msg);
  process.exit(1);
};

if (!/^[0-9a-f]{40}$/.test(t.catalog?.commit ?? "")) fail("catalog.commit must be a 40-character commit");
for (const k of ["title", "version", "last-modified"]) if (!t[k]) fail(`missing "${k}"`);

// UUID v5 layout from a SHA-1 over namespace + name.
const uuid5 = uuid5From(UUID_NS);

// A path in the library is plain segments; anything else has no URL.
const href = libraryUrl(t.catalog.commit, t.catalog.path) ?? fail(`catalog.path is not a path in the library: ${t.catalog.path}`);
const r = await fetch(href);
if (!r.ok) fail(`${r.status} for ${href}`);
const { catalog } = await r.json();
if (!catalog) fail("not an OSCAL catalog");

const known = new Set();
const paramOwner = new Map();
for (const c of everyControl(catalog)) {
  known.add(c.id);
  for (const p of c.params ?? []) paramOwner.set(p.id, c.id);
}

const applicable = [...(t.applicable ?? [])];
const na = [...(t["not-applicable"] ?? [])];
const seen = new Map();
const errors = [];
for (const id of applicable) seen.set(id, (seen.get(id) ?? 0) + 1);
for (const e of na) {
  if (!e.reason) errors.push(`${e.id}: not-applicable without a reason`);
  seen.set(e.id, (seen.get(e.id) ?? 0) + 1);
}
for (const [id, n] of seen) {
  if (n > 1) errors.push(`${id}: listed ${n} times`);
  if (!known.has(id)) errors.push(`${id}: not in the catalog at ${t.catalog.commit.slice(0, 7)}`);
}
const params = Object.entries(t.parameters ?? {}).map(([id, v]) => [id, Array.isArray(v) ? v : [v]]);
const inScope = new Set(applicable);
for (const [id, values] of params) {
  const owner = paramOwner.get(id);
  if (!owner) errors.push(`parameter ${id}: not in the catalog at ${t.catalog.commit.slice(0, 7)}`);
  else if (!inScope.has(owner)) errors.push(`parameter ${id}: belongs to ${owner}, which is not applicable`);
  if (!values.length || values.some((v) => typeof v !== "string" || !v.trim())) errors.push(`parameter ${id}: needs a non-empty value`);
}
if (errors.length) fail(`${errors.length} error(s):\n  ${errors.join("\n  ")}`);

const profile = {
  profile: {
    uuid: uuid5(`profile:${t.title}:${t.catalog.path}`),
    metadata: {
      title: t.title,
      "last-modified": t["last-modified"],
      version: t.version,
      "oscal-version": "1.1.3",
      props: [
        { name: "catalog-commit", ns: NS, value: t.catalog.commit },
        { name: "applicable", ns: NS, value: String(applicable.length) },
        { name: "not-applicable", ns: NS, value: String(na.length) },
        { name: "parameters", ns: NS, value: String(params.length) },
      ],
      remarks:
        "Generated by grundschutz-worksheets profile.mjs from a tailoring file. Do not edit by hand. " +
        "Requirements that do not apply are listed in back-matter with their reason.",
    },
    imports: [
      {
        href,
        "include-controls": [{ "with-child-controls": "no", "with-ids": applicable.sort(byId) }],
      },
    ],
    merge: { "as-is": true },
    ...(params.length && {
      modify: {
        "set-parameters": params
          .sort(([a], [b]) => byId(a, b))
          .map(([id, values]) => ({ "param-id": id, values })),
      },
    }),
    ...(na.length && {
      "back-matter": {
        resources: na
          .sort((a, b) => byId(a.id, b.id))
          .map((e) => ({
            uuid: uuid5(`not-applicable:${e.id}`),
            title: `Not applicable: ${e.id}`,
            description: e.reason,
            props: [
              { name: "control-id", ns: NS, value: e.id },
              { name: "tailoring", ns: NS, value: "not-applicable" },
            ],
            // OSCAL requires a resource to carry its content (rlink or base64);
            // the JSON schema does not enforce it, the Metaschema constraints do.
            base64: {
              filename: `not-applicable-${e.id}.txt`,
              "media-type": "text/plain",
              value: Buffer.from(e.reason, "utf8").toString("base64"),
            },
          })),
      },
    }),
  },
};

process.stdout.write(JSON.stringify(profile, null, 2) + "\n");
