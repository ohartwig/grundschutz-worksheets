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
//     "parameters": { "rea.1.2-prm1": "jährlich", "rea.1.1.2-prm1": ["CISO", "SOC"] },
//     "own": { "file": "own-requirements.json",                     optional
//              "href": "https://example.org/own-requirements.json" }
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
// BSI-Standard 300-1 (3.4.1) leaves two kinds of requirement out of the
// tailoring's hands: those of the method practices (GC, STM, UMS, VRB, PERF)
// apply to every information domain, and every other requirement without a
// target-object category belongs in the package as well. For a catalog under
// control_layer/Grundschutz++/ the tool names each such requirement the tailoring leaves out, and
// each method requirement it calls not applicable. A warning, because a
// tailoring may be a benchmark rather than a package by the standard; with
// --strict it is an error.
//
// Where an asset is not covered well enough by the catalog, or where the law,
// a contract or a stakeholder asks for more, BSI-Standard 300-1 (3.4.3) has
// the institution write requirements of its own, in the format of
// Grundschutz++, and add them to the package. "own" names them: an OSCAL
// catalog whose every control has a title and a statement with its prose and
// a modal verb (MUSS, SOLLTE or KANN, as the statement's prop `modal_verb`),
// and whose IDs the BSI catalog does not use. All of them belong to the
// package. The profile imports them as a second catalog, through a
// back-matter resource that links to `href` and also carries the file itself
// (base64), so a reader of the profile has them even when `href` is not
// public. `file` is read relative to the tailoring file. Their parameters
// take values like the catalog's.
//
//   node profile.mjs tailoring.json [--strict] > profile.json
//
// No dependencies. Node 24 (LTS) or later.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { NS, byId, embeddedResource, everyControl, importResource, libraryUrl, uuid5 as uuid5From } from "./lib/oscal.mjs";

// Fixed namespace for the derived UUIDs of this tool.
const UUID_NS = "b1f0c6a2-5d3e-4f7a-9c8b-2e6d1a4f0b37";

const args = process.argv.slice(2);
const strict = args.includes("--strict");
const file = args.find((a) => !a.startsWith("--"));
if (!file) {
  console.error("usage: profile.mjs <tailoring.json> [--strict]");
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
// The bytes, not only the JSON: their hash goes into the import below.
const catalogBytes = Buffer.from(await r.arrayBuffer());
const { catalog } = JSON.parse(catalogBytes.toString("utf8"));
if (!catalog) fail("not an OSCAL catalog");

const known = new Set();
const paramOwner = new Map();
// What BSI-Standard 300-1 makes part of every package: the method practices
// (their requirements carry the class of the method catalog) and every other
// requirement without a target-object category on its statement.
const method = new Set();
const noTarget = new Set();
for (const c of everyControl(catalog)) {
  known.add(c.id);
  for (const p of c.params ?? []) paramOwner.set(p.id, c.id);
  const stm = (c.parts ?? []).find((p) => p.name === "statement");
  if (c.class?.startsWith("BSI-Methodik")) method.add(c.id);
  else if (!(stm?.props ?? []).some((p) => p.name === "target_object_categories")) noTarget.add(c.id);
}
// The package is made from the Anwenderkatalog. Other catalogs of the library
// carry method requirements too (the TLS minimum standard does), but a
// tailoring of one of them is not a package by the standard.
const isGspp = t.catalog.path.startsWith("control_layer/Grundschutz++/");

// The own requirements (3.4.3): checked for the format, never for content.
let own = null; // { bytes, catalog, ids }
const ownErrors = [];
if (t.own !== undefined) {
  if (!t.own?.file || !t.own?.href) fail('"own" needs "file" and "href"');
  let bytes, oc;
  try {
    bytes = readFileSync(resolve(dirname(resolve(file)), t.own.file));
    oc = JSON.parse(bytes.toString("utf8")).catalog;
  } catch (e) {
    fail(`own requirements ${t.own.file}: ${e.message}`);
  }
  if (!oc?.metadata?.title) fail(`own requirements ${t.own.file}: not an OSCAL catalog with a title`);
  const ids = [];
  for (const c of everyControl(oc)) {
    const stm = (c.parts ?? []).find((p) => p.name === "statement");
    const verb = (stm?.props ?? []).find((p) => p.name === "modal_verb")?.value;
    if (known.has(c.id)) ownErrors.push(`own ${c.id}: the catalog uses this ID already`);
    if (ids.includes(c.id)) ownErrors.push(`own ${c.id}: listed twice`);
    if (!c.title || !stm?.prose) ownErrors.push(`own ${c.id}: needs a title and a statement with prose`);
    if (!["MUSS", "SOLLTE", "KANN"].includes(verb)) ownErrors.push(`own ${c.id}: the statement needs the prop modal_verb, MUSS, SOLLTE or KANN`);
    for (const p of c.params ?? []) paramOwner.set(p.id, c.id);
    ids.push(c.id);
  }
  if (!ids.length) ownErrors.push(`own requirements ${t.own.file}: no requirement in it`);
  own = { bytes, catalog: oc, ids };
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
const ownIds = new Set(own?.ids);
for (const [id, n] of seen) {
  if (n > 1) errors.push(`${id}: listed ${n} times`);
  if (ownIds.has(id)) errors.push(`${id}: an own requirement is always part of the package; it is not listed here`);
  else if (!known.has(id)) errors.push(`${id}: not in the catalog at ${t.catalog.commit.slice(0, 7)}`);
}
errors.push(...ownErrors);
const params = Object.entries(t.parameters ?? {}).map(([id, v]) => [id, Array.isArray(v) ? v : [v]]);
const inScope = new Set([...applicable, ...ownIds]);
for (const [id, values] of params) {
  const owner = paramOwner.get(id);
  if (!owner) errors.push(`parameter ${id}: not in the catalog at ${t.catalog.commit.slice(0, 7)}`);
  else if (!inScope.has(owner)) errors.push(`parameter ${id}: belongs to ${owner}, which is not applicable`);
  if (!values.length || values.some((v) => typeof v !== "string" || !v.trim())) errors.push(`parameter ${id}: needs a non-empty value`);
}
const findings = [];
if (isGspp) {
  const listed = (ids) => ids.sort(byId).join(", ");
  const methodNa = na.map((e) => e.id).filter((id) => method.has(id));
  if (methodNa.length)
    findings.push(`${methodNa.length} requirement(s) of the method called not applicable; BSI-Standard 300-1 (3.4.1) applies them to every information domain: ${listed(methodNa)}`);
  const missing = (set) => [...set].filter((id) => !seen.has(id));
  const m = missing(method), n = missing(noTarget);
  if (m.length) findings.push(`${m.length} requirement(s) of the method left out; BSI-Standard 300-1 (3.4.1) makes them part of every package: ${listed(m)}`);
  if (n.length) findings.push(`${n.length} requirement(s) without a target-object category left out; BSI-Standard 300-1 (3.4.1) makes them part of every package: ${listed(n)}`);
}
if (strict) errors.push(...findings);
else for (const f of findings) console.error(`profile: warning: ${f}`);
if (errors.length) fail(`${errors.length} error(s):\n  ${errors.join("\n  ")}`);

const catalogResource = importResource(uuid5(`import:catalog:${href}`), `${catalog.metadata?.title ?? "Catalog"} at ${t.catalog.commit.slice(0, 7)}`, href, catalogBytes);
const ownResource = own && {
  ...embeddedResource(uuid5(`import:own:${t.own.href}`), `Own requirements: ${own.catalog.metadata.title}`, t.own.href, "own-requirements.json", own.bytes),
  props: [{ name: "tailoring", ns: NS, value: "own-requirements" }],
};

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
        ...(own ? [{ name: "own", ns: NS, value: String(own.ids.length) }] : []),
      ],
      remarks:
        "Generated by grundschutz-worksheets profile.mjs from a tailoring file. Do not edit by hand. " +
        "Requirements that do not apply are listed in back-matter with their reason.",
    },
    // The catalog through a back-matter resource that carries its SHA-256 at
    // the pinned commit.
    imports: [
      {
        href: `#${catalogResource.uuid}`,
        "include-controls": [{ "with-child-controls": "no", "with-ids": applicable.sort(byId) }],
      },
      ...(own
        ? [{ href: `#${ownResource.uuid}`, "include-controls": [{ "with-child-controls": "no", "with-ids": [...own.ids].sort(byId) }] }]
        : []),
    ],
    merge: { "as-is": true },
    ...(params.length && {
      modify: {
        "set-parameters": params
          .sort(([a], [b]) => byId(a, b))
          .map(([id, values]) => ({ "param-id": id, values })),
      },
    }),
    "back-matter": {
      resources: [
        catalogResource,
        ...(own ? [ownResource] : []),
        ...na
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
      ],
    },
  },
};

process.stdout.write(JSON.stringify(profile, null, 2) + "\n");
