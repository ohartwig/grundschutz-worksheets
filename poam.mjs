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
// A requirement the plan calls permanently unfulfilled, with a residual risk
// the leadership approved (BSI-Standard 300-1, 4.1.2; see ssp.mjs), is no wish
// but a decision: its risk is a deviation-approved, it needs no action, and
// the metadata counts it apart.
//
// Input (JSON):
//   {
//     "id": "example-poam", "title": "...", "version": "2026-10-01",
//     "last-modified": "2026-10-01T00:00:00Z",
//     "ssp": { "file": "security-plan.json", "href": "security-plan.json" },
//     "results": ["results-protected-tags.json"],
//     "actions": "actions.json",                              optional
//     "risks": "risks.json"                                   optional
//   }
//   actions.json: { "source": "Improvement register",
//     "items": [{ "id": "I-173", "title": "Protect release tags everywhere",
//                 "requirements": ["TEST.4.1"], "due": "2026-10-31",
//                 "status": "open",                   open | in-progress | done
//                 "owner": "J. Doe" }] }             optional: who answers for it
// BSI-Standard 300-1 (4.4) gives every measure a responsible person and a
// deadline: the owner becomes the remediation's prop `responsible`, and
// stderr counts the actions without one.
//
// The risk register: what BSI-Standard 300-1 asks of a risk analysis at the
// least (Annex 3). A permanent nonfulfilment names its risk analysis by ID in
// the plan ("risk"); the register says what that analysis found. Each entry
// carries the minimum of criterion 15 -- ID, the object examined, the risk,
// the protection goals it touches (14), its level and its owner (16) -- and,
// where the risk is treated, the priority, the option and the measures (23,
// 25), which must be actions of the register above:
//   risks.json: { "source": "Risk register",
//     "items": [{ "id": "R-021", "object": "Release pipeline",
//                 "description": "Unreviewed changes reach production",
//                 "goals": ["integrity"], "level": "high", "owner": "J. Doe",
//                 "threats": ["G 0.28", "G 0.46"],
//                 "treatment": "reduce", "priority": "1", "actions": ["I-173"],
//                 "plan-approved": { "by": "J. Doe", "date": "2026-10-27" },
//                 "reviewed": "2026-10-27" },
//               { "id": "R-022", ..., "treatment": "accept",
//                 "accepted": { "by": "Management", "date": "2026-10-27",
//                               "until": "2027-03-31" } }] }
// treatment is reduce, avoid, transfer or accept; an accepted risk needs
// "accepted" (29, 30), and one accepted for a while its "until" (28) -- which
// a risk behind a temporary nonfulfilment always is. The register is checked
// against the plan: every risk analysis the plan names must be in it, and its
// threats must include the elementary threats of the requirement it stands
// for (17; ssp.mjs writes them). On stderr it counts the treated risks whose
// implementation plan the owner has not approved (31), the ones approved by
// someone else, the ones not reviewed within a year of this POA&M (35), and
// the acceptances run out. Each entry becomes a risk of the POA&M, related to
// the items of its requirements.
//
// Paths are relative to the input file. Output: OSCAL 1.2.3 POA&M on stdout,
// deterministic for the same input.
//
//   node poam.mjs poam.json > poam-out.json && node validate.mjs poam-out.json
//
// No dependencies. Node 24 (LTS) or later.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { NS, byId, importResource, uuid5 as uuid5From } from "./lib/oscal.mjs";

const UUID_NS = "c47e2a90-1b5d-4e63-8f2a-6d9b0c3e7a15";
const STATUS = { open: "open", "in-progress": "remediating", done: "closed" };
const TREATMENT = new Set(["reduce", "avoid", "transfer", "accept"]);
const DATE = /^\d{4}-\d\d-\d\d$/;

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

const uuid5 = uuid5From(UUID_NS);
const prop = (x, name) => (x.props ?? []).find((q) => q.name === name)?.value;

// --- Gaps: what the owner's own plan says is not (fully) in place. ---------
const ssp = read(p.ssp.file, "security plan")["system-security-plan"];
if (!ssp) fail(`${p.ssp.file} is not an OSCAL system security plan`);
const gaps = new Map(); // id -> { state, note, nonfulfilment, risk, approved, approvedBy }
for (const r of ssp["control-implementation"]?.["implemented-requirements"] ?? []) {
  const state = prop(r, "implementation-status");
  if (state !== "partial" && state !== "planned") continue;
  const own = (r["by-components"] ?? []).find((b) => prop(b, "basis") && b.description);
  gaps.set(r["control-id"], {
    state,
    note: own?.description ?? "",
    nonfulfilment: prop(r, "nonfulfilment"),
    risk: prop(r, "risk-analysis"),
    approved: prop(r, "residual-risk-approved"),
    approvedBy: prop(r, "residual-risk-approved-by"),
    threats: prop(r, "threats"),
  });
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
const ownerless = new Set();
let source = "";
if (p.actions) {
  const a = read(p.actions, "actions");
  source = a.source || "register";
  for (const it of a.items ?? []) {
    if (!it.id || !it.title || !Array.isArray(it.requirements) || !it.requirements.length) fail(`action ${it.id ?? "?"}: needs id, title and requirements`);
    if (it.due && !/^\d{4}-\d\d-\d\d$/.test(it.due)) fail(`action ${it.id}: due must be YYYY-MM-DD`);
    // Own keys only: "constructor" or "toString" would pass a plain lookup.
    if (!Object.hasOwn(STATUS, it.status ?? "open")) fail(`action ${it.id}: status must be open, in-progress or done`);
    if (it.owner !== undefined && (typeof it.owner !== "string" || !it.owner.trim())) fail(`action ${it.id}: owner must be a non-empty string`);
    if (!it.owner) ownerless.add(it.id);
    for (const id of it.requirements) actions.set(id, [...(actions.get(id) ?? []), it]);
  }
}

// --- The risk register (BSI-Standard 300-1, Annex 3). -----------------------
const register = new Map(); // id -> entry
let registerSource = "";
const allActions = new Map([...actions.values()].flat().map((a) => [a.id, a]));
if (p.risks) {
  const rr = read(p.risks, "risk register");
  registerSource = rr.source || "risk register";
  const text = (v) => typeof v === "string" && v.trim();
  const signed = (v, what, id) => {
    if (v !== undefined && (!text(v?.by) || !DATE.test(v?.date ?? ""))) fail(`risk ${id}: ${what} needs "by" and a "date" as YYYY-MM-DD`);
  };
  for (const r of rr.items ?? []) {
    const id = r.id ?? "?";
    for (const k of ["id", "object", "description", "level", "owner"]) if (!text(r[k])) fail(`risk ${id}: needs "${k}" (BSI-Standard 300-1, Annex 3, criterion 15)`);
    if (register.has(r.id)) fail(`risk ${id}: listed twice`);
    if (!Array.isArray(r.goals) || !r.goals.length || !r.goals.every(text)) fail(`risk ${id}: "goals" names the protection goals it touches (criterion 14)`);
    if (r.threats !== undefined && (!Array.isArray(r.threats) || !r.threats.every(text))) fail(`risk ${id}: "threats" is a list`);
    if (r.treatment !== undefined && !TREATMENT.has(r.treatment)) fail(`risk ${id}: treatment must be reduce, avoid, transfer or accept`);
    if (r.treatment && r.treatment !== "accept") {
      if (!text(r.priority)) fail(`risk ${id}: a treated risk needs its "priority" (criterion 15)`);
      if (!Array.isArray(r.actions) || !r.actions.length) fail(`risk ${id}: a risk treated by ${r.treatment} needs its "actions" (criterion 25)`);
    }
    for (const a of r.actions ?? []) if (!allActions.has(a)) fail(`risk ${id}: action ${a} is not in the actions register`);
    if (r.treatment === "accept" && !r.accepted) fail(`risk ${id}: an accepted risk needs "accepted", by whom and when (criteria 29, 30)`);
    signed(r.accepted, "accepted", id);
    if (r.accepted?.until !== undefined && !DATE.test(r.accepted.until)) fail(`risk ${id}: accepted.until must be YYYY-MM-DD`);
    signed(r["plan-approved"], "plan-approved", id);
    if (r.reviewed !== undefined && !DATE.test(r.reviewed)) fail(`risk ${id}: reviewed must be YYYY-MM-DD`);
    register.set(r.id, { ...r, requirements: new Set() });
  }
  // The plan against the register.
  for (const [rid, g] of gaps) {
    if (!g.risk) continue;
    const r = register.get(g.risk);
    if (!r) fail(`${rid}: the plan names risk analysis ${g.risk}, which the risk register does not have`);
    r.requirements.add(rid);
    const missing = (g.threats ?? "").split(/,\s*/).filter(Boolean).filter((t) => !(r.threats ?? []).includes(t));
    if (g.nonfulfilment === "permanent" && missing.length)
      fail(`risk ${g.risk}: does not consider ${missing.join(", ")}, the elementary threats of ${rid} (BSI-Standard 300-1, Annex 3, criterion 17)`);
    if (g.nonfulfilment === "temporary" && r.treatment === "accept" && !r.accepted?.until)
      fail(`risk ${g.risk}: accepted for the temporary nonfulfilment of ${rid}, so it needs accepted.until (criterion 28)`);
  }
}

// --- The POA&M. ------------------------------------------------------------
const ids = [...new Set([...gaps.keys(), ...findings.keys()])].sort(byId);
const outFindings = [];
const risks = [];
let withoutAction = 0;
let withDeadline = 0;
let deviations = 0;
const items = ids.map((id) => {
  const g = gaps.get(id);
  const f = findings.get(id);
  const acts = (actions.get(id) ?? []).slice().sort((a, b) => a.id.localeCompare(b.id));
  const open = acts.filter((a) => (a.status ?? "open") !== "done");
  const due = open.map((a) => a.due).filter(Boolean).sort()[0];
  const deviation = g?.nonfulfilment === "permanent" && Boolean(g.approved);
  if (deviation) deviations++;
  else if (!acts.length) withoutAction++;
  if (due) withDeadline++;
  const why = [
    g && `The security plan claims it as ${g.state}${g.note ? `: ${g.note}` : "."}`,
    deviation && `Permanently unfulfilled; residual risk approved ${g.approved} by ${g.approvedBy}${g.risk ? ` (risk analysis ${g.risk})` : ""}.`,
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
  const status = deviation ? "deviation-approved" : open.length ? STATUS[open[0].status ?? "open"] : acts.length ? "closed" : "open";
  risks.push({
    uuid: ru,
    title: `${id} not fully in place`,
    description: why,
    statement: deviation
      ? "The requirement stays unfulfilled by decision; the approved residual risk is reviewed with the risk analysis."
      : "Until this is resolved, the requirement is not met as the profile expects.",
    status,
    ...(due && { deadline: `${due}T23:59:59Z` }),
    ...(acts.length && {
      remediations: acts.map((a) => ({
        uuid: uuid5(`response:${p.id}:${id}:${a.id}`),
        lifecycle: (a.status ?? "open") === "done" ? "completed" : "planned",
        title: `${a.id}: ${a.title}`,
        description: `${a.title} (${source}${a.due ? `, due ${a.due}` : ", no due date"}${a.owner ? `, ${a.owner}` : ""}).`,
        ...(a.owner && { props: [{ name: "responsible", ns: NS, value: a.owner.trim() }] }),
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
      ...(g?.nonfulfilment ? [{ name: "nonfulfilment", ns: NS, value: g.nonfulfilment }] : []),
      ...(acts.length || deviation ? [] : [{ name: "no-action", ns: NS, value: "true" }]),
    ],
    ...(findingRef.length && { "related-findings": findingRef }),
    "related-risks": [{ "risk-uuid": ru }, ...(g?.risk && register.has(g.risk) ? [{ "risk-uuid": uuid5(`register-risk:${p.id}:${g.risk}`) }] : [])],
    ...(!acts.length && !deviation && { remarks: `No action in ${source || "a register"} addresses this yet. It needs one before it can have a date.` }),
  };
});

// The register's risks, after the items': what the analysis found, with the
// treatment and its measures, and who approved what.
const today = p["last-modified"].slice(0, 10);
const yearAgo = `${Number(today.slice(0, 4)) - 1}${today.slice(4)}`;
const planUnapproved = [], planByOther = [], unreviewed = [], expired = [];
for (const r of [...register.values()].sort((a, b) => byId(a.id, b.id))) {
  const acts = (r.actions ?? []).map((a) => allActions.get(a)).sort((a, b) => a.id.localeCompare(b.id));
  const open = acts.filter((a) => (a.status ?? "open") !== "done");
  if (acts.length && !r["plan-approved"]) planUnapproved.push(r.id);
  if (r["plan-approved"] && r["plan-approved"].by.trim() !== r.owner.trim()) planByOther.push(r.id);
  if (!r.reviewed || r.reviewed < yearAgo) unreviewed.push(r.id);
  if (r.accepted?.until && r.accepted.until < today) expired.push(r.id);
  const accepted = r.treatment === "accept";
  const due = accepted ? r.accepted?.until : open.map((a) => a.due).filter(Boolean).sort()[0];
  const status = accepted ? "deviation-approved" : open.length ? STATUS[open[0].status ?? "open"] : acts.length ? "closed" : "open";
  const reqs = [...r.requirements].sort(byId);
  risks.push({
    uuid: uuid5(`register-risk:${p.id}:${r.id}`),
    title: `${r.id}: ${r.object}`,
    description: r.description,
    statement: [
      `Risk level ${r.level} for ${r.goals.join(", ")}, owned by ${r.owner}.`,
      r.treatment ? `Treatment: ${r.treatment}${r.priority ? `, priority ${r.priority}` : ""}.` : "No treatment decided.",
      accepted && `Accepted ${r.accepted.date} by ${r.accepted.by}${r.accepted.until ? ` until ${r.accepted.until}` : ""}.`,
      reqs.length && `Risk analysis for ${reqs.join(", ")}.`,
    ].filter(Boolean).join(" "),
    props: [
      { name: "risk-id", ns: NS, value: r.id },
      { name: "risk-register", ns: NS, value: registerSource },
      { name: "object", ns: NS, value: r.object },
      ...r.goals.map((v) => ({ name: "protection-goal", ns: NS, value: v })),
      { name: "risk-level", ns: NS, value: r.level },
      { name: "risk-owner", ns: NS, value: r.owner.trim() },
      ...(r.threats ?? []).map((v) => ({ name: "threat", ns: NS, value: v })),
      ...(r.treatment ? [{ name: "treatment", ns: NS, value: r.treatment }] : []),
      ...(r.priority ? [{ name: "priority", ns: NS, value: r.priority }] : []),
      ...(r.accepted
        ? [
            { name: "accepted", ns: NS, value: r.accepted.date },
            { name: "accepted-by", ns: NS, value: r.accepted.by },
            ...(r.accepted.until ? [{ name: "accepted-until", ns: NS, value: r.accepted.until }] : []),
          ]
        : []),
      ...(r["plan-approved"]
        ? [
            { name: "plan-approved", ns: NS, value: r["plan-approved"].date },
            { name: "plan-approved-by", ns: NS, value: r["plan-approved"].by },
          ]
        : []),
      ...(r.reviewed ? [{ name: "reviewed", ns: NS, value: r.reviewed }] : []),
      ...reqs.map((v) => ({ name: "control-id", ns: NS, value: v })),
    ],
    status,
    ...(due && { deadline: `${due}T23:59:59Z` }),
    ...(acts.length && {
      remediations: acts.map((a) => ({
        uuid: uuid5(`register-response:${p.id}:${r.id}:${a.id}`),
        lifecycle: (a.status ?? "open") === "done" ? "completed" : "planned",
        title: `${a.id}: ${a.title}`,
        description: `${a.title} (${source}${a.due ? `, due ${a.due}` : ", no due date"}${a.owner ? `, ${a.owner}` : ""}).`,
        ...(a.owner && { props: [{ name: "responsible", ns: NS, value: a.owner.trim() }] }),
      })),
    }),
  });
}

const sspResource = importResource(uuid5(`import:ssp:${p.ssp.href}`), ssp.metadata?.title ?? "System security plan", p.ssp.href, readFileSync(resolve(base, p.ssp.file)));

const out = {
  "plan-of-action-and-milestones": {
    uuid: uuid5(`poam:${p.id}`),
    metadata: {
      title: p.title,
      "last-modified": p["last-modified"],
      version: p.version,
      "oscal-version": "1.2.3",
      props: [
        { name: "items", ns: NS, value: String(items.length) },
        { name: "items-gap", ns: NS, value: String(ids.filter((i) => gaps.has(i)).length) },
        { name: "items-finding", ns: NS, value: String(findings.size) },
        { name: "items-with-deadline", ns: NS, value: String(withDeadline) },
        { name: "items-without-action", ns: NS, value: String(withoutAction) },
        { name: "items-deviation-approved", ns: NS, value: String(deviations) },
        ...(p.risks ? [{ name: "risks-register", ns: NS, value: String(register.size) }] : []),
      ],
      remarks:
        "Generated by grundschutz-worksheets poam.mjs from the security plan, the assessment results and the owner's " +
        "register of actions. Dates come from the register only; an item without an action says so.",
    },
    // The security plan through a back-matter resource with the SHA-256 of
    // the local copy read here.
    "import-ssp": { href: `#${sspResource.uuid}` },
    ...(outFindings.length && { findings: outFindings }),
    ...(risks.length && { risks }),
    "poam-items": items,
    "back-matter": { resources: [sspResource] },
  },
};
if (!items.length) fail("nothing to plan: no gap in the security plan and no unsatisfied finding -- check the inputs");
console.error(`poam: ${items.length} items -- ${findings.size} from findings, ${withDeadline} with a deadline, ${withoutAction} without an action, ${deviations} approved deviations`);
if (p.risks)
  console.error(`poam: risk register -- ${register.size} risks; ${planUnapproved.length} treated without the owner's approval of the plan (BSI-Standard 300-1, Annex 3, 31), ` +
    `${planByOther.length} approved by someone other than the owner, ${unreviewed.length} not reviewed within a year (35), ${expired.length} acceptances run out (28)`);
if (ownerless.size) console.error(`poam: ${ownerless.size} actions name no one responsible (BSI-Standard 300-1, 4.4)`);
process.stdout.write(JSON.stringify(out, null, 2) + "\n");
