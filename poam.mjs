#!/usr/bin/env node
// Write the plan of action and milestones: what will be fixed, and by when.
//
// The last link of OSCAL's chain. The security plan (ssp.mjs) says how the
// system implements each requirement, the assessment plan how that is checked,
// the assessment results what was found. Two things call for action:
//
//   gap       the owner's own claim is partial or planned (from the plan)
//   finding   the latest assessment did not find the requirement satisfied
//             (from the results), whatever the plan claims
//
// Each requirement with either gets one POA&M item, with a risk that is open
// until an action closes it. Actions come from your own register -- a list
// with an ID, a title, the requirements it addresses, a due date and a status.
// An item without an action gets no invented date: it says that it has none,
// and the metadata counts such items. That count is the honest measure of how
// much of the plan is still a wish.
//
// Input (JSON):
//   {
//     "id": "example-poam", "title": "...", "version": "2026-10-01",
//     "last-modified": "2026-10-01T00:00:00Z",
//     "ssp": { "file": "security-plan.json", "href": "security-plan.json" },
//     "results": ["results-protected-tags.json"],
//     "actions": "actions.json"                               optional
//   }
//   actions.json: { "source": "Improvement register",
//     "items": [{ "id": "I-173", "title": "Protect release tags everywhere",
//                 "requirements": ["TEST.4.1"], "due": "2026-10-31",
//                 "status": "open" }] }               open | in-progress | done
//
// Paths are relative to the input file. Output: OSCAL 1.2.2 POA&M on stdout,
// deterministic for the same input.
//
//   node poam.mjs poam.json > poam-out.json && node validate.mjs poam-out.json
//
// No dependencies. Node 24 (LTS) or later.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const NS = "https://github.com/ohartwig/grundschutz-worksheets/ns";
const UUID_NS = "c47e2a90-1b5d-4e63-8f2a-6d9b0c3e7a15";
const STATUS = { open: "open", "in-progress": "remediating", done: "closed" };

const file = process.argv[2];
const fail = (msg) => {
  console.error(`poam: ${msg}`);
  process.exit(1);
};
if (!file) {
  console.error("usage: poam.mjs <poam.json>");
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
const p = read(resolve(file), "input");
for (const k of ["id", "title", "version", "last-modified"]) if (!p[k]) fail(`missing "${k}"`);
if (!p.ssp?.file || !p.ssp?.href) fail('"ssp" needs "file" and "href"');

const uuid5 = (name) => {
  const ns = Buffer.from(UUID_NS.replace(/-/g, ""), "hex");
  const h = createHash("sha1").update(Buffer.concat([ns, Buffer.from(name, "utf8")])).digest();
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
};
const byId = (a, b) => a.localeCompare(b, "en", { numeric: true });
const prop = (x, name) => (x.props ?? []).find((q) => q.name === name)?.value;

// --- Gaps: what the owner's own plan says is not (fully) in place. ---------
const ssp = read(p.ssp.file, "security plan")["system-security-plan"];
if (!ssp) fail(`${p.ssp.file} is not an OSCAL system security plan`);
const gaps = new Map(); // id -> { state, note }
for (const r of ssp["control-implementation"]?.["implemented-requirements"] ?? []) {
  const state = prop(r, "implementation-status");
  if (state !== "partial" && state !== "planned") continue;
  const own = (r["by-components"] ?? []).find((b) => prop(b, "basis") && b.description);
  gaps.set(r["control-id"], { state, note: own?.description ?? "" });
}

// --- Findings: what the latest assessment did not find satisfied. ----------
const latest = new Map(); // id -> { at, state, title, description, uuid, check }
for (const f of p.results ?? []) {
  const ar = read(f, "assessment results")["assessment-results"];
  if (!ar) fail(`${f} is not OSCAL assessment results`);
  for (const r of ar.results ?? []) {
    const at = r.end || r.start;
    for (const fd of r.findings ?? []) {
      const id = fd.target?.["target-id"];
      if (!id) continue;
      const prev = latest.get(id);
      if (!prev || at > prev.at)
        latest.set(id, { at, state: fd.target.status?.state, title: r.title, description: fd.description, check: prop(r, "check") || r.title });
    }
  }
}
const findings = new Map([...latest].filter(([, v]) => v.state === "not-satisfied"));

// --- Actions from the owner's register. -------------------------------------
const actions = new Map(); // requirement -> [action]
let source = "";
if (p.actions) {
  const a = read(p.actions, "actions");
  source = a.source || "register";
  for (const it of a.items ?? []) {
    if (!it.id || !it.title || !Array.isArray(it.requirements) || !it.requirements.length) fail(`action ${it.id ?? "?"}: needs id, title and requirements`);
    if (it.due && !/^\d{4}-\d\d-\d\d$/.test(it.due)) fail(`action ${it.id}: due must be YYYY-MM-DD`);
    if (!STATUS[it.status ?? "open"]) fail(`action ${it.id}: status must be open, in-progress or done`);
    for (const id of it.requirements) actions.set(id, [...(actions.get(id) ?? []), it]);
  }
}

// --- The POA&M. ------------------------------------------------------------
const ids = [...new Set([...gaps.keys(), ...findings.keys()])].sort(byId);
const outFindings = [];
const risks = [];
let withoutAction = 0;
let withDeadline = 0;
const items = ids.map((id) => {
  const g = gaps.get(id);
  const f = findings.get(id);
  const acts = (actions.get(id) ?? []).slice().sort((a, b) => a.id.localeCompare(b.id));
  const open = acts.filter((a) => (a.status ?? "open") !== "done");
  const due = open.map((a) => a.due).filter(Boolean).sort()[0];
  if (!acts.length) withoutAction++;
  if (due) withDeadline++;
  const why = [
    g && `The security plan claims it as ${g.state}${g.note ? `: ${g.note}` : "."}`,
    f && `The latest assessment (${f.at}, "${f.title}") did not find it satisfied. ${f.description}`,
  ].filter(Boolean).join(" ");
  let findingRef = [];
  if (f) {
    const fu = uuid5(`finding:${p.id}:${id}`);
    outFindings.push({
      uuid: fu,
      title: `${id}: not satisfied`,
      description: f.description,
      target: { type: "objective-id", "target-id": id, status: { state: "not-satisfied" } },
      props: [
        { name: "assessed", ns: NS, value: f.at },
        { name: "assessment-check", ns: NS, value: f.check },
      ],
    });
    findingRef = [{ "finding-uuid": fu }];
  }
  const ru = uuid5(`risk:${p.id}:${id}`);
  const status = open.length ? STATUS[open[0].status ?? "open"] : acts.length ? "closed" : "open";
  risks.push({
    uuid: ru,
    title: `${id} not fully in place`,
    description: why,
    statement: "Until this is resolved, the requirement is not met as the profile expects.",
    status,
    ...(due && { deadline: `${due}T23:59:59Z` }),
    ...(acts.length && {
      remediations: acts.map((a) => ({
        uuid: uuid5(`response:${p.id}:${id}:${a.id}`),
        lifecycle: (a.status ?? "open") === "done" ? "completed" : "planned",
        title: `${a.id}: ${a.title}`,
        description: `${a.title} (${source}${a.due ? `, due ${a.due}` : ", no due date"}).`,
      })),
    }),
  });
  return {
    uuid: uuid5(`poam-item:${p.id}:${id}`),
    title: `${id}${g ? ` (${g.state})` : ""}${f ? " — assessment not satisfied" : ""}`,
    description: why,
    props: [
      { name: "control-id", ns: NS, value: id },
      { name: "origin", ns: NS, value: g && f ? "gap-and-finding" : g ? "gap" : "finding" },
      ...(acts.length ? [] : [{ name: "no-action", ns: NS, value: "true" }]),
    ],
    ...(findingRef.length && { "related-findings": findingRef }),
    "related-risks": [{ "risk-uuid": ru }],
    ...(!acts.length && { remarks: `No action in ${source || "a register"} addresses this yet. It needs one before it can have a date.` }),
  };
});

const out = {
  "plan-of-action-and-milestones": {
    uuid: uuid5(`poam:${p.id}`),
    metadata: {
      title: p.title,
      "last-modified": p["last-modified"],
      version: p.version,
      "oscal-version": "1.2.2",
      props: [
        { name: "items", ns: NS, value: String(items.length) },
        { name: "items-gap", ns: NS, value: String(ids.filter((i) => gaps.has(i)).length) },
        { name: "items-finding", ns: NS, value: String(findings.size) },
        { name: "items-with-deadline", ns: NS, value: String(withDeadline) },
        { name: "items-without-action", ns: NS, value: String(withoutAction) },
      ],
      remarks:
        "Generated by grundschutz-worksheets poam.mjs from the security plan, the assessment results and the owner's " +
        "register of actions. Dates come from the register only; an item without an action says so.",
    },
    "import-ssp": { href: p.ssp.href },
    ...(outFindings.length && { findings: outFindings }),
    ...(risks.length && { risks }),
    "poam-items": items,
  },
};
if (!items.length) fail("nothing to plan: no gap in the security plan and no unsatisfied finding -- check the inputs");
console.error(`poam: ${items.length} items -- ${findings.size} from findings, ${withDeadline} with a deadline, ${withoutAction} without an action`);
process.stdout.write(JSON.stringify(out, null, 2) + "\n");
