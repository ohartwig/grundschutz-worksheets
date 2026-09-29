#!/usr/bin/env node
// Assemble an OSCAL system security plan from what the other generators wrote:
// the profile (what applies), component definitions (what the components
// claim, with evidence links) and assessment results (what was measured).
//
// For every requirement the profile includes, the plan says one of three
// things, and says where it comes from:
//
//   implemented   a component claims it and the latest measurement, if any,
//                 found it satisfied -- or a measurement alone found it so
//   partial       the latest measurement found it not satisfied
//   planned       nothing claims or measures it yet: an honest gap, not a
//                 silence
//
// Where neither a component nor a measurement speaks, a dated review by a
// person may: the optional `reviews` file carries the verdict of a manual
// check per requirement. Precedence is measurement, then component claim,
// then review, and every entry says which one it rests on.
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
//     "reviews": "reviews.json"
//   }
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
const thisSystem = uuid5(`this-system:${sys.id}`);
const counts = { implemented: 0, partial: 0, planned: 0 };
const bases = { measured: 0, claimed: 0, reviewed: 0, none: 0 };
const requirements = [...applicable].sort(byId).map((id) => {
  const m = measured.get(id);
  const claimants = components.filter((c) => c.claims.has(id));
  const byComponents = claimants.map((c) => {
    const cl = c.claims.get(id);
    const state = m?.state === "not-satisfied" ? "partial" : "implemented";
    return {
      "component-uuid": c.uuid,
      uuid: uuid5(`by-component:${sys.id}:${id}:${c.source}`),
      description: cl.description,
      ...(cl.links.length && { links: cl.links }),
      "implementation-status": {
        state,
        remarks: m
          ? `Measured ${m.at} by "${m.title}": ${m.state}.`
          : "Claimed by the component with evidence; no measurement covers it yet.",
      },
    };
  });
  if (!claimants.length) {
    const rv = reviewed.get(id);
    let description, state, remarks, basis;
    if (m) {
      description = `${m.description} (check: ${m.check})`;
      state = m.state === "satisfied" ? "implemented" : "partial";
      remarks = `Measured ${m.at} by "${m.title}": ${m.state}.`;
      basis = "measured";
    } else if (rv) {
      description = rv.note || `Reviewed in ${review.source}.`;
      state = rv.state;
      remarks = `Reviewed ${review.date} (${review.source}); not measured automatically.`;
      basis = "reviewed";
    } else {
      description = "No component claims this requirement, no measurement covers it and no review assessed it.";
      state = "planned";
      basis = "none";
    }
    byComponents.push({
      "component-uuid": thisSystem,
      uuid: uuid5(`by-component:${sys.id}:${id}:this-system`),
      description,
      props: [{ name: "basis", ns: NS, value: basis }],
      "implementation-status": { state, ...(remarks && { remarks }) },
    });
  }
  for (const b of byComponents) if (b["component-uuid"] !== thisSystem) b.props = [{ name: "basis", ns: NS, value: m ? "measured" : "claimed" }];
  const overall = byComponents.some((b) => b["implementation-status"].state === "partial")
    ? "partial"
    : byComponents.every((b) => b["implementation-status"].state === "planned")
      ? "planned"
      : "implemented";
  counts[overall]++;
  const basis = byComponents.map((b) => b.props?.[0]?.value).sort((a, b) =>
    ["measured", "claimed", "reviewed", "none"].indexOf(a) - ["measured", "claimed", "reviewed", "none"].indexOf(b))[0];
  bases[basis]++;
  const alt = claimants.map((c) => c.claims.get(id).alt).find(Boolean);
  return {
    uuid: uuid5(`requirement:${sys.id}:${id}`),
    "control-id": id,
    props: [
      { name: "implementation-status", ns: NS, value: overall },
      ...(alt ? [{ name: "alt-identifier", ns: NS, value: alt }] : []),
      ...(m ? [{ name: "measured", ns: NS, value: m.at }] : []),
    ],
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
      ],
      remarks:
        "Generated by grundschutz-worksheets ssp.mjs from a profile, component definitions and assessment results. " +
        "It states what is claimed and measured, not that the system is compliant.",
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
    },
    "control-implementation": {
      description: `${applicable.size} requirements from the imported profile: ${counts.implemented} implemented, ${counts.partial} partial, ${counts.planned} planned.`,
      "implemented-requirements": requirements,
    },
  },
};
console.error(`ssp: ${applicable.size} requirements -- ${counts.implemented} implemented, ${counts.partial} partial, ${counts.planned} planned`);
console.error(`ssp: resting on -- ${bases.measured} measured, ${bases.claimed} claimed, ${bases.reviewed} reviewed, ${bases.none} nothing`);
process.stdout.write(JSON.stringify(out, null, 2) + "\n");
