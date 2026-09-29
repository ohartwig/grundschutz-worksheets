#!/usr/bin/env node
// Write the result of one run of a check as OSCAL assessment results.
//
// A nightly check already knows what it looked at and what it found. This
// turns that into data a tool can read: which requirements the check
// evidences, which subjects it examined, what it observed for each, and
// whether each requirement was satisfied in this run. One run, one file;
// the date is part of the evidence.
//
// Input (JSON), written by the check itself:
//   {
//     "check": "protected-branches",          stable name, part of every UUID
//     "title": "Protected branches and tags",
//     "description": "What the check does, in your own words.",
//     "method": "TEST",                       TEST | EXAMINE | INTERVIEW
//     "start": "2026-09-30T03:00:00Z", "end": "2026-09-30T03:04:12Z",
//     "catalog": { "path": "control_layer/Grundschutz++/Grundschutz++-resolved_catalog.json",
//                  "commit": "<40-char sha of the BSI library>" },
//     "requirements": ["TEST.1.3", "TEST.4.1"],
//     "evidence": [{ "text": "pipeline 1234", "href": "https://ci.example.org/p/1234" }],
//     "subjects": [
//       { "title": "group/app", "href": "https://git.example.org/group/app",
//         "satisfied": true, "detail": "main protected, force push off" }
//     ]
//   }
//
// Every requirement is satisfied in this run when every subject is; a
// requirement is not-satisfied as soon as one subject is not, and its
// finding names the observations that failed. A run without subjects is an
// error, not a pass: a check that looked at nothing has shown nothing.
//
// Options:
//   --catalog <file>   check the IDs against a local catalog instead of
//                      fetching the pinned commit (tests, offline use)
//
// Output: OSCAL 1.2.2 assessment results on stdout. Deterministic for the
// same input: UUIDs derive from check, start and subject, dates from input.
//
//   node results.mjs run.json > results.json && node validate.mjs results.json
//
// No dependencies. Node 24 (LTS) or later.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const REPO = "https://raw.githubusercontent.com/BSI-Bund/Stand-der-Technik-Bibliothek";
const NS = "https://github.com/ohartwig/grundschutz-worksheets/ns";
const UUID_NS = "5c2b8e41-7a3d-4f69-b0e2-9d1c6a8f4e27";
const METHODS = ["TEST", "EXAMINE", "INTERVIEW"];

const args = process.argv.slice(2);
const local = args.includes("--catalog") ? args[args.indexOf("--catalog") + 1] : "";
const file = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--catalog");
const fail = (msg) => {
  console.error(`results: ${msg}`);
  process.exit(1);
};
if (!file) {
  console.error("usage: results.mjs <run.json> [--catalog <file>]");
  process.exit(2);
}

const r = JSON.parse(readFileSync(file, "utf8"));
for (const k of ["check", "title", "description", "start", "end"]) if (!r[k]) fail(`missing "${k}"`);
if (!/^[a-z0-9][a-z0-9-]*$/.test(r.check)) fail("check must be lowercase letters, digits and hyphens");
if (!METHODS.includes(r.method)) fail(`method must be one of ${METHODS.join(", ")}`);
for (const k of ["start", "end"]) if (Number.isNaN(Date.parse(r[k])) || !/(Z|[+-]\d\d:\d\d)$/.test(r[k])) fail(`${k} must be an ISO date-time with time zone`);
if (Date.parse(r.end) < Date.parse(r.start)) fail("end is before start");
if (!/^[0-9a-f]{40}$/.test(r.catalog?.commit ?? "")) fail("catalog.commit must be a 40-character commit");
if (!Array.isArray(r.requirements) || !r.requirements.length) fail("no requirements");
if (!Array.isArray(r.subjects) || !r.subjects.length) fail("no subjects: a check that looked at nothing has shown nothing");
for (const s of r.subjects) {
  if (!s.title) fail("every subject needs a title");
  if (typeof s.satisfied !== "boolean") fail(`${s.title}: satisfied must be true or false`);
}

const uuid5 = (name) => {
  const ns = Buffer.from(UUID_NS.replace(/-/g, ""), "hex");
  const h = createHash("sha1").update(Buffer.concat([ns, Buffer.from(name, "utf8")])).digest();
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
};

const href = `${REPO}/${r.catalog.commit}/${r.catalog.path.split("/").map(encodeURIComponent).join("/")}`;
let catalog;
if (local) catalog = JSON.parse(readFileSync(local, "utf8")).catalog;
else {
  const res = await fetch(href);
  if (!res.ok) fail(`${res.status} for ${href}`);
  catalog = (await res.json()).catalog;
}
if (!catalog) fail("not an OSCAL catalog");
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
const unknown = r.requirements.filter((id) => !alt.has(id));
if (unknown.length) fail(`not in the catalog at ${r.catalog.commit.slice(0, 7)}: ${unknown.join(", ")}`);
if (new Set(r.requirements).size !== r.requirements.length) fail("a requirement is listed twice");

const run = `${r.check}:${r.start}`;
const b64 = (s) => Buffer.from(s, "utf8").toString("base64");
const planUuid = uuid5(`plan:${r.check}`);
const evidence = (r.evidence ?? []).map((e) => ({ href: e.href, description: e.text || e.href }));
const subjects = [...r.subjects].sort((a, b) => a.title.localeCompare(b.title));
const resources = [
  {
    uuid: planUuid,
    title: `Assessment plan: ${r.title}`,
    description: r.description,
    // A resource must carry its content (rlink or base64): here, the plan text.
    base64: { filename: `${r.check}-plan.txt`, "media-type": "text/plain", value: b64(r.description) },
  },
];
const observations = subjects.map((s) => {
  const res = uuid5(`subject:${r.check}:${s.title}`);
  resources.push({
    uuid: res,
    title: s.title,
    ...(s.href
      ? { rlinks: [{ href: s.href }] }
      : { base64: { filename: "subject.txt", "media-type": "text/plain", value: b64(s.title) } }),
  });
  return {
    uuid: uuid5(`observation:${run}:${s.title}`),
    title: `${s.title}: ${s.satisfied ? "as required" : "NOT as required"}`,
    description: s.detail || (s.satisfied ? "As required." : "Not as required."),
    methods: [r.method],
    ...(!s.satisfied && { types: ["finding"] }),
    subjects: [{ "subject-uuid": res, type: "resource", title: s.title }],
    ...(evidence.length && { "relevant-evidence": evidence }),
    collected: r.end,
    _satisfied: s.satisfied,
  };
});
const failed = observations.filter((o) => !o._satisfied);
const byId = (a, b) => a.localeCompare(b, "en", { numeric: true });
const findings = [...r.requirements].sort(byId).map((id) => ({
  uuid: uuid5(`finding:${run}:${id}`),
  title: `${id}: ${failed.length ? "not satisfied" : "satisfied"}`,
  description: failed.length
    ? `${failed.length} of ${observations.length} subject(s) examined by "${r.title}" were not as required.`
    : `All ${observations.length} subject(s) examined by "${r.title}" were as required.`,
  props: alt.get(id) ? [{ name: "alt-identifier", ns: NS, value: alt.get(id) }] : undefined,
  target: {
    type: "objective-id",
    "target-id": id,
    status: { state: failed.length ? "not-satisfied" : "satisfied", reason: failed.length ? "fail" : "pass" },
  },
  "related-observations": (failed.length ? failed : observations).map((o) => ({ "observation-uuid": o.uuid })),
}));
for (const f of findings) if (!f.props) delete f.props;
for (const o of observations) delete o._satisfied;

const out = {
  "assessment-results": {
    uuid: uuid5(`results:${run}`),
    metadata: {
      title: `${r.title} — ${r.start.slice(0, 10)}`,
      "last-modified": r.end,
      version: r.start,
      "oscal-version": "1.2.2",
      remarks:
        "Generated by grundschutz-worksheets results.mjs from one run of an automated check. " +
        "It states what this run observed, not that a system is compliant.",
    },
    "import-ap": { href: `#${planUuid}` },
    results: [
      {
        uuid: uuid5(`result:${run}`),
        title: r.title,
        description: r.description,
        start: r.start,
        end: r.end,
        props: [
          { name: "check", ns: NS, value: r.check },
          { name: "catalog-commit", ns: NS, value: r.catalog.commit },
        ],
        "reviewed-controls": {
          "control-selections": [{ "include-controls": [...r.requirements].sort(byId).map((id) => ({ "control-id": id })) }],
        },
        observations,
        findings,
      },
    ],
    "back-matter": { resources },
  },
};
process.stdout.write(JSON.stringify(out, null, 2) + "\n");
