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
//   "by": "J. Doe",                                       optional
//   "requirements": [{ "id": "KONF.3.2", "state": "implemented|partial|planned",
//                      "note": "evidence in your own words",
//                      "date": "2026-10-02", "by": "A. Roe" }] }   optional
// BSI-Standard 300-1 (4.3) asks of every check its date and the person who
// documented or checked it: the file's, or the requirement's own where it
// differs. The plan carries them as props `reviewed` and `reviewed-by`, and
// stderr counts the reviews that name no one.
// Paths are relative to the system file. `profile.href` is what the plan
// imports; `file` is the local copy read to learn which requirements apply.
//
// BSI-Standard 300-1 (4.1) knows three states: erfüllt, nicht erfüllt and
// nicht anwendbar. Implemented is erfüllt; partial and planned are both nicht
// erfüllt; not applicable is the profile's. A requirement that is not
// fulfilled is either temporarily so -- it is in the implementation plan, and
// the note says why it is not yet -- or permanently, and then a SOLLTE needs a
// risk analysis whose residual risk the leadership has approved. A MUSS cannot
// be permanently unfulfilled: neither an exception nor a risk acceptance
// replaces it. A review says which, for partial and planned only:
//   { "id": "DET.5.3", "state": "partial", "note": "...",
//     "nonfulfilment": "temporary" }
//   { "id": "TEST.4.1", "state": "planned", "note": "...",
//     "nonfulfilment": "permanent", "risk": "R-021",
//     "approved": { "by": "Management", "date": "2026-10-27" } }
// A temporary one takes "approved" as well: the risk of what is still in the
// plan is the leadership's to bear (4.1.1), and stderr counts the temporary
// ones without it. The plan carries it as props of the requirement, and
// poam.mjs turns an approved permanent nonfulfilment into an approved
// deviation. To refuse a
// permanent MUSS, the catalog is read -- from the profile's import, checked
// against its SHA-256, or from --catalog <file> (tests, offline use) -- but
// only when a review declares a permanent nonfulfilment.
//
//   node ssp.mjs system.json [--catalog <file>] > ssp.json && node validate.mjs ssp.json
//
// A requirement a component or measurement names that the profile does not
// include is reported on stderr: either the profile lacks it or the claim is
// out of scope, and both deserve a look.
//
// No dependencies. Node 24 (LTS) or later.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { NS, REPO, byId, everyControl, importResource, libraryUrl, measurements, resolveImport, sha256, uuid5 as uuid5From } from "./lib/oscal.mjs";

const UUID_NS = "8e3f1a52-6c0d-4b7e-9a21-f4c5d7e6b039";

const args = process.argv.slice(2);
const localCatalog = args.includes("--catalog") ? args[args.indexOf("--catalog") + 1] : "";
const file = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--catalog");
const fail = (msg) => {
  console.error(`ssp: ${msg}`);
  process.exit(1);
};
if (!file) {
  console.error("usage: ssp.mjs <system.json> [--catalog <file>]");
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

const uuid5 = uuid5From(UUID_NS);

// --- What applies: the profile's selection. -------------------------------
const profile = read(s.profile.file, "profile").profile;
if (!profile) fail(`${s.profile.file} is not an OSCAL profile`);
const applicable = new Set();
for (const imp of profile.imports ?? [])
  for (const sel of imp["include-controls"] ?? []) for (const id of sel["with-ids"] ?? []) applicable.add(id);
if (!applicable.size) fail("the profile includes no requirement by ID");
// The profile is imported through a back-matter resource that carries the
// SHA-256 of the local copy read here: the plan names what it was made from.
const profileResource = importResource(
  uuid5(`import:profile:${s.profile.href}`),
  `Profile: ${profile.metadata?.title ?? s.profile.href}`,
  s.profile.href,
  readFileSync(resolve(base, s.profile.file)),
);
// What the profile left out, with the reason (profile.mjs writes them as
// back-matter resources). The plan repeats them so that it states the whole
// applicability, not only what applies: a Statement of Applicability in one
// document. They are not implemented-requirements -- the imported profile does
// not include them, and a plan speaks only about what its baseline includes.
const notApplicable = (profile["back-matter"]?.resources ?? [])
  .filter((x) => (x.props ?? []).some((p) => p.name === "tailoring" && p.value === "not-applicable"))
  .map((x) => ({ id: x.props.find((p) => p.name === "control-id")?.value, reason: x.description ?? "" }))
  .filter((x) => x.id)
  .sort((a, b) => byId(a.id, b.id));

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

// --- What was measured: per requirement, the latest finding of EACH check
// (lib/oscal.mjs, measurements): satisfied only when every check's latest
// finding is, partial unless one check shows it in full.
const measured = measurements(
  (s.results ?? []).map((f) => read(f, "assessment results")["assessment-results"] ?? fail(`${f} is not OSCAL assessment results`)),
);

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
const reviewed = new Map(); // id -> { state, note, date, by, nonfulfilment, risk, approved }
let review = null;
if (s.reviews) {
  review = read(s.reviews, "reviews");
  if (!review.date || !review.source) fail('reviews need "date" and "source"');
  if (review.by !== undefined && (typeof review.by !== "string" || !review.by.trim())) fail('reviews: "by" must be a non-empty string');
  for (const r of review.requirements ?? []) {
    if (!["implemented", "partial", "planned"].includes(r.state)) fail(`review ${r.id}: state must be implemented, partial or planned`);
    if (r.date !== undefined && !/^\d{4}-\d\d-\d\d$/.test(r.date)) fail(`review ${r.id}: date must be YYYY-MM-DD`);
    if (r.by !== undefined && (typeof r.by !== "string" || !r.by.trim())) fail(`review ${r.id}: "by" must be a non-empty string`);
    const nf = r.nonfulfilment;
    if (nf !== undefined) {
      if (r.state === "implemented") fail(`review ${r.id}: an implemented requirement has no nonfulfilment`);
      if (nf !== "temporary" && nf !== "permanent") fail(`review ${r.id}: nonfulfilment must be temporary or permanent`);
      if (nf === "temporary" && !r.note) fail(`review ${r.id}: a temporary nonfulfilment needs a note that says why`);
      if (r.approved !== undefined && (!r.approved?.by || !/^\d{4}-\d\d-\d\d$/.test(r.approved?.date ?? "")))
        fail(`review ${r.id}: approved needs "by" and a "date" as YYYY-MM-DD`);
    }
    reviewed.set(r.id, {
      state: r.state,
      note: r.note || "",
      date: r.date || review.date,
      by: (r.by || review.by || "").trim(),
      nonfulfilment: nf,
      risk: r.risk || "",
      approved: r.approved,
    });
  }
}

// A permanent nonfulfilment depends on the modal verb: never for a MUSS, with
// a risk analysis and approved residual risk for a SOLLTE, free for a KANN.
const permanent = [...reviewed].filter(([, r]) => r.nonfulfilment === "permanent");
if (permanent.length) {
  const target = resolveImport(profile, profile.imports?.[0]?.href);
  let bytes;
  if (localCatalog) bytes = readFileSync(localCatalog);
  else {
    // Only from the library at a commit, the form profile.mjs writes.
    const [, commit, path] = target.href?.match(/^[^:]+:\/\/[^/]+\/[^/]+\/[^/]+\/([0-9a-f]{40})\/(.+)$/) ?? [];
    if (!commit || !target.href.startsWith(`${REPO}/`) || libraryUrl(commit, path.split("/").map(decodeURIComponent).join("/")) !== target.href)
      fail(`the profile imports its catalog from ${target.href ?? "nowhere"}, not from the library at a commit: name a local copy with --catalog`);
    const res = await fetch(target.href);
    if (!res.ok) fail(`${res.status} for ${target.href}`);
    bytes = Buffer.from(await res.arrayBuffer());
  }
  if (target.sha256 && target.sha256 !== sha256(bytes)) fail(`the catalog read is not the one the profile was made against: sha256 ${sha256(bytes)}, the profile names ${target.sha256}`);
  const catalog = JSON.parse(bytes.toString("utf8")).catalog ?? fail("not an OSCAL catalog");
  const modal = new Map();
  for (const c of everyControl(catalog)) {
    const stm = (c.parts ?? []).find((p) => p.name === "statement");
    modal.set(c.id, (stm?.props ?? []).find((p) => p.name === "modal_verb")?.value || (stm?.prose?.match(/\b(MUSS|SOLLTE|KANN)\b/) ?? [""])[0]);
  }
  for (const [id, r] of permanent) {
    const verb = modal.get(id);
    if (verb === undefined) fail(`review ${id}: not in the catalog the profile imports`);
    if (verb === "MUSS") fail(`review ${id}: a MUSS cannot be permanently unfulfilled; BSI-Standard 300-1 (4.1.2) allows neither an exception nor a risk acceptance`);
    if (verb !== "KANN" && (!r.risk || !r.approved))
      fail(`review ${id}: a permanently unfulfilled ${verb || "requirement"} needs "risk" (its risk analysis) and "approved" (the residual risk, by the leadership)`);
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
// What the summary must say besides the counts above, so that "0 claimed" or
// "8 assessed" cannot be misread: how many requirements carry a component's
// claim although a review decides their state, and how many of the assessed
// ones were not satisfied. Assessed counts requirements of this plan only;
// a measurement outside the profile is reported above, not counted here.
let withClaim = 0, assessedIn = 0, notSatisfied = 0;
const requirements = [...applicable].sort(byId).map((id) => {
  const m = measured.get(id);
  const rv = reviewed.get(id);
  const claimants = components.filter((c) => c.claims.has(id));
  const state = rv ? rv.state : claimants.length ? "implemented" : "planned";
  const basis = rv ? "reviewed" : claimants.length ? "claimed" : "none";
  counts[state]++;
  bases[basis]++;
  if (claimants.length) withClaim++;
  if (m) { assessedIn++; if (m.state !== "satisfied") notSatisfied++; }
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
      ...(rv && { remarks: `Reviewed ${rv.date}${rv.by ? ` by ${rv.by}` : ""} (${review.source}).` }),
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
      ...(rv ? [{ name: "reviewed", ns: NS, value: rv.date }] : []),
      ...(rv?.by ? [{ name: "reviewed-by", ns: NS, value: rv.by }] : []),
      ...(rv?.nonfulfilment ? [{ name: "nonfulfilment", ns: NS, value: rv.nonfulfilment }] : []),
      ...(rv?.nonfulfilment && rv.risk ? [{ name: "risk-analysis", ns: NS, value: rv.risk }] : []),
      ...(rv?.nonfulfilment && rv.approved
        ? [
            { name: "residual-risk-approved", ns: NS, value: rv.approved.date },
            { name: "residual-risk-approved-by", ns: NS, value: rv.approved.by },
          ]
        : []),
      ...(m
        ? [
            { name: "assessed", ns: NS, value: m.at },
            { name: "assessment-state", ns: NS, value: m.state },
            { name: "assessment-check", ns: NS, value: m.check },
            ...(m.partial ? [{ name: "assessment-coverage", ns: NS, value: "partial" }] : []),
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
      "oscal-version": "1.2.3",
      props: [
        ...Object.entries(counts).map(([k, v]) => ({ name: `requirements-${k}`, ns: NS, value: String(v) })),
        ...Object.entries(bases).map(([k, v]) => ({ name: `basis-${k}`, ns: NS, value: String(v) })),
        { name: "requirements-not-applicable", ns: NS, value: String(notApplicable.length) },
        { name: "assessed", ns: NS, value: String(assessedIn) },
        { name: "assessed-not-satisfied", ns: NS, value: String(notSatisfied) },
        { name: "component-claims", ns: NS, value: String(withClaim) },
        { name: "inventory-items", ns: NS, value: String(inventory.length) },
        { name: "assessment-disagrees", ns: NS, value: String(disagreements) },
      ],
      remarks:
        "Generated by grundschutz-worksheets ssp.mjs from a profile, component definitions and the owner's review. " +
        "It states how the system implements each requirement, as claimed; assessment results are referenced, not merged. " +
        "It is not a statement that the system is compliant.",
    },
    "import-profile": { href: `#${profileResource.uuid}` },
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
      description:
        `${applicable.size} requirements from the imported profile: ${counts.implemented} implemented, ${counts.partial} partial, ${counts.planned} planned.` +
        (notApplicable.length ? ` ${notApplicable.length} more are not applicable; each is in back-matter with its reason.` : ""),
      "implemented-requirements": requirements,
    },
    "back-matter": {
      resources: [
        profileResource,
        ...notApplicable.map((e) => ({
          uuid: uuid5(`not-applicable:${sys.id}:${e.id}`),
          title: `Not applicable: ${e.id}`,
          description: e.reason,
          props: [
            { name: "control-id", ns: NS, value: e.id },
            { name: "tailoring", ns: NS, value: "not-applicable" },
          ],
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
console.error(`ssp: ${applicable.size} requirements -- ${counts.implemented} implemented, ${counts.partial} partial, ${counts.planned} planned`);
console.error(`ssp: state from -- ${bases.reviewed} reviews, ${bases.claimed} component claims, ${bases.none} nothing; ` +
  `${withClaim} requirements carry a component claim${bases.reviewed ? " (a review, where there is one, decides the state)" : ""}`);
console.error(`ssp: assessed -- ${assessedIn} of ${applicable.size}, ${notSatisfied} not satisfied, ` +
  `${disagreements} of them against a claim of implemented`);
// BSI-Standard 300-1 asks of every unfulfilled requirement whether it is so
// for now or for good; one the reviews do not say of is counted, not guessed.
const unfulfilled = counts.partial + counts.planned;
const said = [...reviewed].filter(([id, r]) => applicable.has(id) && r.nonfulfilment).map(([, r]) => r);
console.error(`ssp: not fulfilled (BSI-Standard 300-1) -- ${unfulfilled}: ${said.filter((r) => r.nonfulfilment === "temporary").length} temporary, ` +
  `${said.filter((r) => r.nonfulfilment === "permanent").length} permanent, ${unfulfilled - said.length} not classified; ` +
  `${said.filter((r) => r.nonfulfilment === "temporary" && !r.approved).length} temporary without the leadership's approval of the risk (4.1.1)`);
const anonymous = [...reviewed].filter(([id, r]) => applicable.has(id) && !r.by).length;
if (anonymous) console.error(`ssp: ${anonymous} reviews name no person who checked (BSI-Standard 300-1, 4.3)`);
process.stdout.write(JSON.stringify(out, null, 2) + "\n");
