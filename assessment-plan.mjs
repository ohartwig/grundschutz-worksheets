#!/usr/bin/env node
// Write the assessment plan: how the claims of the security plan are verified.
//
// OSCAL's chain has four links. The system security plan says how the system
// implements each requirement (ssp.mjs), the assessment plan says how that is
// checked, the assessment results what was found (results.mjs), the POA&M
// what will be fixed (poam.mjs). This writes the second: which checks run,
// what each one examines, by which method, how often, and which requirements
// it gives evidence for. One activity and one recurring task per check.
//
// Input (JSON), kept next to the checks themselves:
//   {
//     "id": "example-checks",                  stable name, part of every UUID
//     "title": "How Example GmbH checks its controls",
//     "version": "2026-10-01", "last-modified": "2026-10-01T00:00:00Z",
//     "ssp": { "href": "security-plan.json" }, the plan whose claims are checked
//     "catalog": { "path": "control_layer/Grundschutz++/Grundschutz++-resolved_catalog.json",
//                  "commit": "<40-char sha of the BSI library>" },
//     "checks": [
//       { "check": "protected-tags",           the same name results.mjs uses
//         "title": "Protected release tags",
//         "description": "What the check does, in your own words.",
//         "method": "TEST",                     TEST | EXAMINE | INTERVIEW
//         "requirements": ["TEST.4.1"],
//         "subjects": "Every non-archived project of the groups that sign.",
//         "every": { "period": 6, "unit": "hours" } }
//     ]
//   }
//
// The check names are the join with the results: results.mjs writes the same
// name as prop `check` on each result, and this plan writes it on the
// activity. Every requirement ID is checked against the catalog at the pinned
// commit; a check without requirements or subjects is an error.
//
// Options:
//   --catalog <file>   check the IDs against a local catalog instead of
//                      fetching the pinned commit (tests, offline use)
//
// Output: OSCAL 1.2.3 assessment plan on stdout, deterministic for the same
// input.
//
//   node assessment-plan.mjs checks.json > assessment-plan.json && node validate.mjs assessment-plan.json
//
// No dependencies. Node 24 (LTS) or later.

import { readFileSync } from "node:fs";
import { NS, byId, everyControl, libraryUrl, uuid5 as uuid5From } from "./lib/oscal.mjs";

const UUID_NS = "3d9a7c15-2e4b-4f86-a1c0-7b5e9d2f8a64";
const METHODS = ["TEST", "EXAMINE", "INTERVIEW"];
const UNITS = ["seconds", "minutes", "hours", "days", "months", "years"];

const args = process.argv.slice(2);
const local = args.includes("--catalog") ? args[args.indexOf("--catalog") + 1] : "";
const file = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--catalog");
const fail = (msg) => {
  console.error(`assessment-plan: ${msg}`);
  process.exit(1);
};
if (!file) {
  console.error("usage: assessment-plan.mjs <checks.json> [--catalog <file>]");
  process.exit(2);
}

const p = JSON.parse(readFileSync(file, "utf8"));
for (const k of ["id", "title", "version", "last-modified"]) if (!p[k]) fail(`missing "${k}"`);
if (!p.ssp?.href) fail('missing "ssp.href": a plan verifies the claims of a security plan');
if (!/^[0-9a-f]{40}$/.test(p.catalog?.commit ?? "")) fail("catalog.commit must be a 40-character commit");
if (!Array.isArray(p.checks) || !p.checks.length) fail("no checks");
const names = new Set();
for (const c of p.checks) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(c.check ?? "")) fail(`check "${c.check}": lowercase letters, digits and hyphens`);
  if (names.has(c.check)) fail(`check "${c.check}" is listed twice`);
  names.add(c.check);
  for (const k of ["title", "description", "subjects"]) if (!c[k]) fail(`${c.check}: missing "${k}"`);
  if (!METHODS.includes(c.method)) fail(`${c.check}: method must be one of ${METHODS.join(", ")}`);
  if (!Array.isArray(c.requirements) || !c.requirements.length) fail(`${c.check}: no requirements`);
  if (!(c.every?.period > 0) || !UNITS.includes(c.every?.unit)) fail(`${c.check}: "every" needs a period > 0 and a unit (${UNITS.join(", ")})`);
}

const uuid5 = uuid5From(UUID_NS);

// Every requirement must exist in the catalog at the pinned commit.
// A path in the library is plain segments; anything else has no URL.
const href = libraryUrl(p.catalog.commit, p.catalog.path) ?? fail(`catalog.path is not a path in the library: ${p.catalog.path}`);
let catalog;
if (local) catalog = JSON.parse(readFileSync(local, "utf8")).catalog;
else {
  const res = await fetch(href);
  if (!res.ok) fail(`${res.status} for ${href}`);
  catalog = (await res.json()).catalog;
}
if (!catalog) fail("not an OSCAL catalog");
const known = new Set();
for (const c of everyControl(catalog)) {
  known.add(c.id);
}
for (const c of p.checks) {
  const unknown = c.requirements.filter((id) => !known.has(id));
  if (unknown.length) fail(`${c.check}: not in the catalog at ${p.catalog.commit.slice(0, 7)}: ${unknown.join(", ")}`);
}

const checks = [...p.checks].sort((a, b) => a.check.localeCompare(b.check));
const all = [...new Set(checks.flatMap((c) => c.requirements))].sort(byId);
const selection = (ids) => ({ "control-selections": [{ "include-controls": [...ids].sort(byId).map((id) => ({ "control-id": id })) }] });

const activities = checks.map((c) => ({
  uuid: uuid5(`activity:${p.id}:${c.check}`),
  title: c.title,
  description: c.description,
  props: [
    { name: "check", ns: NS, value: c.check },
    { name: "method", value: c.method },
  ],
  steps: [
    {
      uuid: uuid5(`step:${p.id}:${c.check}`),
      title: "Examine every subject and record one observation each",
      description: `Subjects: ${c.subjects} Each subject that is not as required is a finding against every listed requirement in that run; a run without subjects is an error, not a pass.`,
    },
  ],
  "related-controls": selection(c.requirements),
}));

const out = {
  "assessment-plan": {
    uuid: uuid5(`assessment-plan:${p.id}`),
    metadata: {
      title: p.title,
      "last-modified": p["last-modified"],
      version: p.version,
      "oscal-version": "1.2.3",
      props: [
        { name: "checks", ns: NS, value: String(checks.length) },
        { name: "catalog-commit", ns: NS, value: p.catalog.commit },
      ],
      remarks:
        "Generated by grundschutz-worksheets assessment-plan.mjs. It states how the claims of the security plan are " +
        "checked; what was found is in the assessment results that import this plan.",
    },
    "import-ssp": { href: p.ssp.href },
    "local-definitions": { activities },
    "reviewed-controls": selection(all),
    "assessment-subjects": checks.map((c) => ({
      type: "component",
      description: `${c.title}: ${c.subjects}`,
      "include-all": {},
      props: [{ name: "check", ns: NS, value: c.check }],
    })),
    tasks: checks.map((c, i) => ({
      uuid: uuid5(`task:${p.id}:${c.check}`),
      type: "action",
      title: `${c.title}, every ${c.every.period} ${c.every.unit}`,
      timing: { "at-frequency": { period: c.every.period, unit: c.every.unit } },
      "associated-activities": [
        { "activity-uuid": activities[i].uuid, subjects: [{ type: "component", "include-all": {} }] },
      ],
    })),
  },
};
process.stdout.write(JSON.stringify(out, null, 2) + "\n");
