#!/usr/bin/env node
// Assemble an OSCAL system security plan: the owner's statement of how the
// system implements each requirement the profile includes. In OSCAL's chain
// the plan is the claim ("this is how we do it"); the assessment plan says how
// it is verified, the assessment results what was found, the POA&M what will
// be fixed. This tool writes the first and refers to the third.
//
// For every requirement the plan states one of three things, and what the
// statement rests on (prop `basis`):
//
//   reviewed   the owner's dated verdict from the `reviews` file
//              (implemented, partial or planned)
//   claimed    no review, but a component definition claims it with evidence:
//              implemented, as far as the components go
//   none       nothing speaks for it: planned, an honest gap and not a silence
//
// Component definitions also contribute their implementation statements and
// evidence links to every requirement they claim, reviewed or not. They never
// change a reviewed state: one image's definition says what that build had,
// not what the whole system does.
//
// Assessment results are referenced, not merged. Per requirement, the latest
// one is named (props `assessed`, `assessment-state`, `assessment-check`); a
// requirement claimed as implemented whose latest assessment was not satisfied
// gets a remark, and the metadata counts them (`assessment-disagrees`). The
// claim itself stays until the owner changes it -- whether a statement is true
// is the assessment's job, and deciding what follows is the owner's.
//
// Nothing is written by hand into the plan; the system description comes from
// a small file, everything else from the inputs. The same inputs give the same
// bytes.
//
// Input: a system file (JSON), plus the files it names:
//   {
//     "title": "Security plan of Example GmbH",
//     "version": "2026-10-01",
//     "last-modified": "2026-10-01T00:00:00Z",
//     "system": { "id": "example-platform", "name": "Example platform",
//                 "description": "...", "sensitivity": "moderate",
//                 "information-type": { "title": "Customer web content", "description": "..." },
//                 "boundary": "What is inside the system and what is not.",
//                 "status": "operational" },
//     "profile": { "file": "profile.json", "href": "https://example.org/profile.json" },
//     "components": ["component-a.json"],
//     "results": ["results-2026-10-01.json"],
//     "reviews": "reviews.json",
//     "inventory": "inventory.json"                       optional
//   }
// inventory.json (optional): what the infrastructure code declares, as
//   { "source": "OpenTofu state of example-infra",
//     "items": [{ "id": "example.org|www.example.org|A", "type": "dns-record",
//                 "description": "A record www.example.org" }] }
// becomes the plan's inventory-items, so the plan lists what exists by code,
// not by memory.
// reviews.json (optional): { "date": "2026-09-26", "source": "SoA check",
//   "requirements": [{ "id": "KONF.3.2", "state": "implemented|partial|planned",
//                      "note": "evidence in your own words" }] }
// Paths are relative to the system file. `profile.href` is what the plan
// imports; `file` is the local copy read to learn which requirements apply.
//
//   node ssp.mjs system.json > ssp.json && node validate.mjs ssp.json
//
// A requirement a component or measurement names that the profile does not
// include is reported on stderr: either the profile lacks it or the claim is
// out of scope, and both deserve a look.
//
// No dependencies. Node 24 (LTS) or later.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const NS = "https://github.com/ohartwig/grundschutz-worksheets/ns";
const UUID_NS = "8e3f1a52-6c0d-4b7e-9a21-f4c5d7e6b039";

const file = process.argv[2];
const fail = (msg) => {
  console.error(`ssp: ${msg}`);
  process.exit(1);
};
if (!file) {
  console.error("usage: ssp.mjs <system.json>");
  process.exit(2);
}
const base = dirname(resolve(file));
const read = (p, what) => {
  try {
    return JSON.parse(readFileSync(resolve(base, p), "utf8"));
  } catch (e) {
    fail(`${what} ${p}: ${e.message}`);
  }
};

const s = read(resolve(file), "system file");
for (const k of ["title", "version", "last-modified"]) if (!s[k]) fail(`missing "${k}"`);
const sys = s.system ?? {};
for (const k of ["id", "name", "description", "boundary"]) if (!sys[k]) fail(`missing "system.${k}"`);
if (!sys["information-type"]?.title) fail('missing "system.information-type.title"');
if (!s.profile?.file || !s.profile?.href) fail('"profile" needs "file" and "href"');

const uuid5 = (name) => {
  const ns = Buffer.from(UUID_NS.replace(/-/g, ""), "hex");
  const h = createHash("sha1").update(Buffer.concat([ns, Buffer.from(name, "utf8")])).digest();
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
};
const byId = (a, b) => a.localeCompare(b, "en", { numeric: true });

// --- What applies: the profile's selection. -------------------------------
const profile = read(s.profile.file, "profile").profile;
if (!profile) fail(`${s.profile.file} is not an OSCAL profile`);
const applicable = new Set();
for (const imp of profile.imports ?? [])
  for (const sel of imp["include-controls"] ?? []) for (const id of sel["with-ids"] ?? []) applicable.add(id);
if (!applicable.size) fail("the profile includes no requirement by ID");

// --- What the components claim. -------------------------------------------
const components = []; // { uuid, type, title, description, claims: Map(id -> {description, links, alt}) }
for (const f of s.components ?? []) {
  const cd = read(f, "component definition")["component-definition"];
  if (!cd) fail(`${f} is not an OSCAL component definition`);
  for (const c of cd.components ?? []) {
    const claims = new Map();
    for (const ci of c["control-implementations"] ?? [])
      for (const r of ci["implemented-requirements"] ?? [])
        claims.set(r["control-id"], {
          description: r.description,
          links: r.links ?? [],
          alt: (r.props ?? []).find((p) => p.name === "alt-identifier")?.value,
        });
    components.push({
      uuid: uuid5(`component:${c.uuid}`),
      source: c.uuid,
      type: c.type,
      title: c.title,
      description: c.description,
      props: c.props ?? [],
      claims,
    });
  }
}

// --- What was measured: per requirement, the latest finding. --------------
const measured = new Map(); // id -> { state, at, title, description, check }
for (const f of s.results ?? []) {
  const ar = read(f, "assessment results")["assessment-results"];
  if (!ar) fail(`${f} is not OSCAL assessment results`);
  for (const r of ar.results ?? []) {
    const at = r.end || r.start;
    const check = (r.props ?? []).find((p) => p.name === "check")?.value || r.title;
    for (const fd of r.findings ?? []) {
      const id = fd.target?.["target-id"];
      const state = fd.target?.status?.state;
      if (!id || !state) continue;
      const prev = measured.get(id);
      if (!prev || at > prev.at) measured.set(id, { state, at, title: r.title, description: fd.description, check });
    }
  }
}

// --- What the infrastructure code declares: the inventory. ---------------
let inventory = [];
let inventorySource = "";
if (s.inventory) {
  const inv = read(s.inventory, "inventory");
  inventorySource = inv.source || "";
  const seen = new Set();
  for (const it of inv.items ?? []) {
    if (!it.id || !it.type) fail(`inventory: every item needs "id" and "type"`);
    if (seen.has(it.id)) fail(`inventory: "${it.id}" is listed twice`);
    seen.add(it.id);
  }
  inventory = [...(inv.items ?? [])].sort((a, b) => a.id.localeCompare(b.id));
}

// --- What a person reviewed, dated. ----------------------------------------
const reviewed = new Map(); // id -> { state, note }
let review = null;
if (s.reviews) {
  review = read(s.reviews, "reviews");
  if (!review.date || !review.source) fail('reviews need "date" and "source"');
  for (const r of review.requirements ?? []) {
    if (!["implemented", "partial", "planned"].includes(r.state)) fail(`review ${r.id}: state must be implemented, partial or planned`);
    reviewed.set(r.id, { state: r.state, note: r.note || "" });
  }
}

// Claims and measurements outside the profile: reported, not silently dropped.
const outside = new Set();
for (const c of components) for (const id of c.claims.keys()) if (!applicable.has(id)) outside.add(`${id} (claimed by ${c.title})`);
for (const id of measured.keys()) if (!applicable.has(id)) outside.add(`${id} (measured)`);
for (const id of reviewed.keys()) if (!applicable.has(id)) outside.add(`${id} (reviewed)`);
for (const o of [...outside].sort()) console.error(`ssp: not in the profile: ${o}`);

// --- The plan. -------------------------------------------------------------
// The plan is the owner's statement of how the system implements each
// requirement -- a claim, not a verdict. Its state comes from the owner's
// dated review; where none exists, from a component that claims the
// requirement with evidence; else it is planned. Measurements do not change
// it: whether the statement is true is the assessment's job, recorded in the
// assessment results. The plan refers to the latest one per requirement
// (props `assessed`, `assessment-state`, `assessment-check`), so a reader sees
// both, and a disagreement is visible without the claim being rewritten.
const thisSystem = uuid5(`this-system:${sys.id}`);
const counts = { implemented: 0, partial: 0, planned: 0 };
const bases = { reviewed: 0, claimed: 0, none: 0 };
let disagreements = 0;
const requirements = [...applicable].sort(byId).map((id) => {
  const m = measured.get(id);
  const rv = reviewed.get(id);
  const claimants = components.filter((c) => c.claims.has(id));
  const state = rv ? rv.state : claimants.length ? "implemented" : "planned";
  const basis = rv ? "reviewed" : claimants.length ? "claimed" : "none";
  counts[state]++;
  bases[basis]++;
  // A claim of "implemented" that the latest assessment did not find
  // satisfied: shown, not resolved. The owner decides (status MR).
  const disagrees = m && m.state === "not-satisfied" && state === "implemented";
  if (disagrees) disagreements++;
  const byComponents = claimants.map((c) => {
    const cl = c.claims.get(id);
    return {
      "component-uuid": c.uuid,
      uuid: uuid5(`by-component:${sys.id}:${id}:${c.source}`),
      description: cl.description,
      ...(cl.links.length && { links: cl.links }),
      props: [{ name: "basis", ns: NS, value: "claimed" }],
      "implementation-status": {
        state: "implemented",
        remarks: "Claimed by the component definition, with the evidence it links. What one component provides, not a statement about the whole system.",
      },
    };
  });
  byComponents.push({
    "component-uuid": thisSystem,
    uuid: uuid5(`by-component:${sys.id}:${id}:this-system`),
    description: rv
      ? rv.note || `Reviewed in ${review.source}.`
      : claimants.length
        ? "Implemented by the components named here; no dated review assessed the whole system yet."
        : "No component claims this requirement and no review assessed it.",
    props: [{ name: "basis", ns: NS, value: basis }],
    "implementation-status": {
      state,
      ...(rv && { remarks: `Reviewed ${review.date} (${review.source}).` }),
    },
  });
  const alt = claimants.map((c) => c.claims.get(id).alt).find(Boolean);
  return {
    uuid: uuid5(`requirement:${sys.id}:${id}`),
    "control-id": id,
    props: [
      { name: "implementation-status", ns: NS, value: state },
      { name: "basis", ns: NS, value: basis },
      ...(alt ? [{ name: "alt-identifier", ns: NS, value: alt }] : []),
      ...(m
        ? [
            { name: "assessed", ns: NS, value: m.at },
            { name: "assessment-state", ns: NS, value: m.state },
            { name: "assessment-check", ns: NS, value: m.check },
          ]
        : []),
    ],
    ...(disagrees && {
      remarks: `The latest assessment (${m.at}, "${m.title}") did not find this requirement satisfied; the claim stands until the owner reviews it.`,
    }),
    "by-components": byComponents,
  };
});

const out = {
  "system-security-plan": {
    uuid: uuid5(`ssp:${sys.id}`),
    metadata: {
      title: s.title,
      "last-modified": s["last-modified"],
      version: s.version,
      "oscal-version": "1.2.2",
      props: [
        ...Object.entries(counts).map(([k, v]) => ({ name: `requirements-${k}`, ns: NS, value: String(v) })),
        ...Object.entries(bases).map(([k, v]) => ({ name: `basis-${k}`, ns: NS, value: String(v) })),
        { name: "assessed", ns: NS, value: String(measured.size) },
        { name: "inventory-items", ns: NS, value: String(inventory.length) },
        { name: "assessment-disagrees", ns: NS, value: String(disagreements) },
      ],
      remarks:
        "Generated by grundschutz-worksheets ssp.mjs from a profile, component definitions and the owner's review. " +
        "It states how the system implements each requirement, as claimed; assessment results are referenced, not merged. " +
        "It is not a statement that the system is compliant.",
    },
    "import-profile": { href: s.profile.href },
    "system-characteristics": {
      "system-ids": [{ "identifier-type": NS, id: sys.id }],
      "system-name": sys.name,
      description: sys.description,
      ...(sys.sensitivity && { "security-sensitivity-level": sys.sensitivity }),
      "system-information": {
        "information-types": [
          {
            uuid: uuid5(`information-type:${sys.id}`),
            title: sys["information-type"].title,
            description: sys["information-type"].description || sys["information-type"].title,
          },
        ],
      },
      status: { state: sys.status || "operational" },
      "authorization-boundary": { description: sys.boundary },
    },
    "system-implementation": {
      users: [{ uuid: uuid5(`user:${sys.id}:operator`), title: "Operator" }],
      components: [
        {
          uuid: thisSystem,
          type: "this-system",
          title: sys.name,
          description: sys.description,
          status: { state: "operational" },
        },
        ...components.map((c) => ({
          uuid: c.uuid,
          type: c.type,
          title: c.title,
          description: c.description,
          ...(c.props.length && { props: c.props }),
          status: { state: "operational" },
        })),
      ],
      ...(inventory.length && {
        "inventory-items": inventory.map((it) => ({
          uuid: uuid5(`inventory:${sys.id}:${it.id}`),
          description: it.description || it.id,
          props: [
            { name: "asset-id", value: it.id },
            { name: "asset-type", ns: NS, value: it.type },
            ...(inventorySource ? [{ name: "inventory-source", ns: NS, value: inventorySource }] : []),
          ],
        })),
      }),
    },
    "control-implementation": {
      description: `${applicable.size} requirements from the imported profile: ${counts.implemented} implemented, ${counts.partial} partial, ${counts.planned} planned.`,
      "implemented-requirements": requirements,
    },
  },
};
console.error(`ssp: ${applicable.size} requirements -- ${counts.implemented} implemented, ${counts.partial} partial, ${counts.planned} planned`);
console.error(`ssp: resting on -- ${bases.reviewed} reviewed, ${bases.claimed} claimed, ${bases.none} nothing; ${measured.size} assessed, ${disagreements} where the assessment disagrees`);
process.stdout.write(JSON.stringify(out, null, 2) + "\n");
