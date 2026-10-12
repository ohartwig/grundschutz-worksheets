// Tests for validate.mjs: valid fixtures pass, broken ones fail, an unknown
// OSCAL version is a setup error rather than a pass. Run with `npm test`.
import { spawnSync } from "node:child_process";
import { everyControl, resolveImport, sha256 } from "../lib/oscal.mjs";

const cases = [
  ["test/fixtures/valid-catalog.json", 0],
  ["test/fixtures/valid-component.json", 0],
  ["test/fixtures/broken-catalog-no-uuid.json", 1],
  ["test/fixtures/broken-catalog-bad-id.json", 1],
  ["test/fixtures/broken-component-empty-type.json", 1],
  ["test/fixtures/unknown-version.json", 2],
];
let failed = 0;
for (const [file, want] of cases) {
  const r = spawnSync(process.execPath, ["validate.mjs", file], { encoding: "utf8" });
  const ok = r.status === want;
  failed += !ok;
  console.log(`${ok ? "ok  " : "FAIL"} ${file}: exit ${r.status}, want ${want}`);
  if (!ok) console.log(r.stdout + r.stderr);
}
// profile.mjs: the same tailoring gives the same bytes, and the result validates.
{
  const gen = () => spawnSync(process.execPath, ["profile.mjs", "test/fixtures/tailoring.json"], { encoding: "utf8" });
  const a = gen();
  const b = gen();
  const same = a.status === 0 && a.stdout === b.stdout;
  failed += !same;
  console.log(`${same ? "ok  " : "FAIL"} profile.mjs is deterministic${same ? "" : ": " + a.stderr}`);
  if (same) {
    const { writeFileSync, mkdirSync } = await import("node:fs");
    mkdirSync(".schema-cache", { recursive: true });
    writeFileSync(".schema-cache/test-profile.json", a.stdout);
    const v = spawnSync(process.execPath, ["validate.mjs", ".schema-cache/test-profile.json"], { encoding: "utf8" });
    failed += v.status !== 0;
    console.log(`${v.status === 0 ? "ok  " : "FAIL"} generated profile validates${v.status === 0 ? "" : ": " + v.stdout}`);
  }
  const bad = spawnSync(process.execPath, ["profile.mjs", "test/fixtures/tailoring-unknown-id.json"], { encoding: "utf8" });
  failed += bad.status !== 1;
  console.log(`${bad.status === 1 ? "ok  " : "FAIL"} unknown ID is refused (exit ${bad.status})`);
  // Parameters: a value becomes set-parameters and fills the worksheet's blank.
  const sp = same ? JSON.parse(a.stdout).profile.modify?.["set-parameters"] : null;
  const p1 = sp?.length === 1 && sp[0]["param-id"] === "konf.2.2-prm1" && sp[0].values[0] === "BSI TR-02102-2";
  failed += !p1;
  console.log(`${p1 ? "ok  " : "FAIL"} profile: a parameter value becomes set-parameters`);
  if (same) {
    const ws = spawnSync(process.execPath, ["worksheet.mjs", "control_layer/Mindeststandard-TLS/Entwurf-Mindeststandard-TLS-catalog.json",
      "--profile", ".schema-cache/test-profile.json", "--commit", "367d775010abee641b258926bb482fcd05270059"], { encoding: "utf8" });
    const p2 = ws.status === 0 && ws.stdout.includes("[BSI TR-02102-2]");
    failed += !p2;
    console.log(`${p2 ? "ok  " : "FAIL"} worksheet: a profile's parameter value replaces the blank${p2 ? "" : ": " + ws.stderr}`);
  }
  const oos = spawnSync(process.execPath, ["profile.mjs", "test/fixtures/tailoring-param-out-of-scope.json"], { encoding: "utf8" });
  failed += oos.status !== 1;
  console.log(`${oos.status === 1 ? "ok  " : "FAIL"} profile: a parameter of a requirement out of scope is refused (exit ${oos.status})`);
}
// component.mjs: deterministic, validates, unknown ID refused, subject checked.
{
  const D = "sha256:" + "a".repeat(64);
  const gen = (src, extra = []) =>
    spawnSync(process.execPath, ["component.mjs", src, "--subject", `registry.example.org/app@${D}`, ...extra], { encoding: "utf8" });
  const a = gen("test/fixtures/component-source.json");
  const b = gen("test/fixtures/component-source.json");
  const same = a.status === 0 && a.stdout === b.stdout;
  failed += !same;
  console.log(`${same ? "ok  " : "FAIL"} component.mjs is deterministic${same ? "" : ": " + a.stderr}`);
  if (same) {
    const { writeFileSync, mkdirSync } = await import("node:fs");
    mkdirSync(".schema-cache", { recursive: true });
    writeFileSync(".schema-cache/test-component.json", a.stdout);
    const v = spawnSync(process.execPath, ["validate.mjs", ".schema-cache/test-component.json"], { encoding: "utf8" });
    failed += v.status !== 0;
    console.log(`${v.status === 0 ? "ok  " : "FAIL"} generated component definition validates${v.status === 0 ? "" : ": " + v.stdout}`);
  }
  const bad = gen("test/fixtures/component-source-unknown-id.json");
  failed += bad.status !== 1;
  console.log(`${bad.status === 1 ? "ok  " : "FAIL"} component with unknown ID is refused (exit ${bad.status})`);
  const badSubject = spawnSync(process.execPath, ["component.mjs", "test/fixtures/component-source.json", "--subject", "app:latest"], { encoding: "utf8" });
  failed += badSubject.status !== 1;
  console.log(`${badSubject.status === 1 ? "ok  " : "FAIL"} subject without a digest is refused (exit ${badSubject.status})`);
}
// recheck.mjs: an unchanged catalog passes; a bumped one names every change.
{
  const run = (cat) => spawnSync(process.execPath, ["recheck.mjs", "test/fixtures/recheck-component.json", "--catalog", cat], { encoding: "utf8" });
  const same = run("test/fixtures/recheck-catalog.json");
  failed += same.status !== 0;
  console.log(`${same.status === 0 ? "ok  " : "FAIL"} recheck: unchanged catalog passes (exit ${same.status})`);
  const bumped = run("test/fixtures/recheck-catalog-bumped.json");
  const want = ["DEV.4.3: renamed to DEV.4.4", "TEST.3.1.3: withdrawn", "DEV.4.5: uuid-changed", "ok     DET.5.3: unchanged"];
  const ok = bumped.status === 1 && want.every((w) => bumped.stdout.includes(w));
  failed += !ok;
  console.log(`${ok ? "ok  " : "FAIL"} recheck: bump reports rename, withdrawal and new UUID (exit ${bumped.status})`);
  if (!ok) console.log(bumped.stdout + bumped.stderr);
}
// results.mjs: a run validates, a failed subject fails the requirement, no subjects is an error.
{
  const { writeFileSync, readFileSync, mkdirSync } = await import("node:fs");
  mkdirSync(".schema-cache", { recursive: true });
  const cat = ["--catalog", "test/fixtures/recheck-catalog.json"];
  const gen = (f) => spawnSync(process.execPath, ["results.mjs", f, ...cat], { encoding: "utf8" });
  const ok = gen("test/fixtures/results-run.json");
  writeFileSync(".schema-cache/test-results.json", ok.stdout);
  const v = spawnSync(process.execPath, ["validate.mjs", ".schema-cache/test-results.json"], { encoding: "utf8" });
  const same = ok.stdout === gen("test/fixtures/results-run.json").stdout;
  const pass = ok.status === 0 && v.status === 0 && same;
  failed += !pass;
  console.log(`${pass ? "ok  " : "FAIL"} results: a run validates and is deterministic${pass ? "" : ": " + ok.stderr + v.stdout}`);
  const run = JSON.parse(readFileSync("test/fixtures/results-run.json", "utf8"));
  run.subjects[1].satisfied = false;
  writeFileSync(".schema-cache/results-fail.json", JSON.stringify(run));
  const bad = gen(".schema-cache/results-fail.json");
  const states = JSON.parse(bad.stdout)["assessment-results"].results[0].findings.map((f) => f.target.status.state);
  const f2 = states.every((s) => s === "not-satisfied");
  failed += !f2;
  console.log(`${f2 ? "ok  " : "FAIL"} results: one failed subject makes every requirement not-satisfied`);
  run.subjects = [];
  writeFileSync(".schema-cache/results-empty.json", JSON.stringify(run));
  const empty = gen(".schema-cache/results-empty.json");
  failed += empty.status !== 1;
  console.log(`${empty.status === 1 ? "ok  " : "FAIL"} results: a run without subjects is refused (exit ${empty.status})`);
  const noPlan = JSON.parse(readFileSync("test/fixtures/results-run.json", "utf8"));
  delete noPlan.plan;
  writeFileSync(".schema-cache/results-noplan.json", JSON.stringify(noPlan));
  const np = gen(".schema-cache/results-noplan.json");
  failed += np.status !== 1;
  console.log(`${np.status === 1 ? "ok  " : "FAIL"} results: a run without a plan is refused (exit ${np.status})`);
  // measured_by: the props name the code that measured; a false commit is refused.
  const prov = JSON.parse(readFileSync("test/fixtures/results-run.json", "utf8"));
  prov.measured_by = { repository: "g/checks", commit: "c".repeat(40), image: "r/i@sha256:" + "b".repeat(64),
                       job: "https://ci.example.org/j/1", mapping_sha256: "a".repeat(64) };
  writeFileSync(".schema-cache/results-prov.json", JSON.stringify(prov));
  const pr = gen(".schema-cache/results-prov.json");
  writeFileSync(".schema-cache/results-prov-out.json", pr.stdout);
  const pv = spawnSync(process.execPath, ["validate.mjs", ".schema-cache/results-prov-out.json"], { encoding: "utf8" });
  const props = pr.status === 0 ? Object.fromEntries(JSON.parse(pr.stdout)["assessment-results"].results[0].props.map((p) => [p.name, p.value])) : {};
  const p1 = pv.status === 0 && props["measured-by-commit"] === "c".repeat(40) && props["measured-by-image"].endsWith("b".repeat(64))
    && props["mapping-sha256"] === "a".repeat(64) && props["measured-by-job"] === "https://ci.example.org/j/1";
  failed += !p1;
  console.log(`${p1 ? "ok  " : "FAIL"} results: measured_by becomes props and still validates`);
  prov.measured_by.commit = "main";
  writeFileSync(".schema-cache/results-prov-bad.json", JSON.stringify(prov));
  const pb = gen(".schema-cache/results-prov-bad.json");
  failed += pb.status !== 1;
  console.log(`${pb.status === 1 ? "ok  " : "FAIL"} results: a measured_by commit that is not one is refused (exit ${pb.status})`);
}
// ssp.mjs: claims, measurements and reviews become one plan, in that order of precedence.
{
  const { writeFileSync, readFileSync, mkdirSync } = await import("node:fs");
  mkdirSync(".schema-cache", { recursive: true });
  const cat = ["--catalog", "test/fixtures/recheck-catalog.json"];
  // A component claiming DEV.4.3 and TEST.3.1.3, a run measuring TEST.3.1.3 as failed.
  const cd = JSON.parse(readFileSync("test/fixtures/recheck-component.json", "utf8"));
  const ci = cd["component-definition"].components[0]["control-implementations"][0];
  ci["implemented-requirements"] = ci["implemented-requirements"]
    .filter((r) => ["DEV.4.3", "TEST.3.1.3"].includes(r["control-id"]))
    .map((r) => ({ ...r, links: [{ href: "https://ci.example.org/job/1", rel: "reference", text: "evidence job" }] }));
  writeFileSync(".schema-cache/ssp-component.json", JSON.stringify(cd));
  const run = JSON.parse(readFileSync("test/fixtures/results-run.json", "utf8"));
  run.requirements = ["TEST.3.1.3"];
  run.subjects[0].satisfied = false;
  writeFileSync(".schema-cache/ssp-run.json", JSON.stringify(run));
  const ar = spawnSync(process.execPath, ["results.mjs", ".schema-cache/ssp-run.json", ...cat], { encoding: "utf8" });
  writeFileSync(".schema-cache/ssp-results.json", ar.stdout);
  const gen = () => spawnSync(process.execPath, ["ssp.mjs", "test/fixtures/ssp/system.json"], { encoding: "utf8" });
  const a = gen();
  const same = a.status === 0 && a.stdout === gen().stdout;
  writeFileSync(".schema-cache/test-ssp.json", a.stdout);
  const v = spawnSync(process.execPath, ["validate.mjs", ".schema-cache/test-ssp.json"], { encoding: "utf8" });
  const pass = same && v.status === 0;
  failed += !pass;
  console.log(`${pass ? "ok  " : "FAIL"} ssp: assembles, validates and is deterministic${pass ? "" : ": " + a.stderr + v.stdout}`);
  if (a.status === 0) {
    const reqs = Object.fromEntries(JSON.parse(a.stdout)["system-security-plan"]["control-implementation"]["implemented-requirements"]
      .map((r) => [r["control-id"], r]));
    const st = (id) => reqs[id].props.find((p) => p.name === "implementation-status").value;
    const basis = (id) => reqs[id]["by-components"][0].props.find((p) => p.name === "basis").value;
    const cases = [
      ["claimed and not measured is implemented", st("DEV.4.3") === "implemented" && basis("DEV.4.3") === "claimed"],
      ["a failed measurement does not rewrite a claim", st("TEST.3.1.3") === "implemented"
        && reqs["TEST.3.1.3"].props.some((p) => p.name === "assessment-state" && p.value === "not-satisfied")
        && /did not find this requirement satisfied/.test(reqs["TEST.3.1.3"].remarks ?? "")],
      ["a review speaks where nothing else does", st("DET.5.3") === "partial" && basis("DET.5.3") === "reviewed"],
      ["nothing at all is planned, and says so", st("DEV.4.5") === "planned" && basis("DEV.4.5") === "none"],
      ["evidence links survive", (reqs["DEV.4.3"]["by-components"][0].links ?? [])[0]?.href === "https://ci.example.org/job/1"],
    ];
    for (const [name, ok] of cases) {
      failed += !ok;
      console.log(`${ok ? "ok  " : "FAIL"} ssp: ${name}`);
    }
  }
  // A measurement against a review: it may lower the review, never raise it.
  const run2 = JSON.parse(readFileSync("test/fixtures/results-run.json", "utf8"));
  run2.check = "second-check";
  run2.requirements = ["DET.5.3"];
  run2.subjects.forEach((x) => (x.satisfied = true));
  writeFileSync(".schema-cache/ssp-run2.json", JSON.stringify(run2));
  writeFileSync(".schema-cache/ssp-results2.json",
    spawnSync(process.execPath, ["results.mjs", ".schema-cache/ssp-run2.json", ...cat], { encoding: "utf8" }).stdout);
  const run3 = { ...run2, check: "third-check", requirements: ["DEV.4.5"], subjects: run2.subjects.map((x, i) => ({ ...x, satisfied: i > 0 })) };
  writeFileSync(".schema-cache/ssp-run3.json", JSON.stringify(run3));
  writeFileSync(".schema-cache/ssp-results3.json",
    spawnSync(process.execPath, ["results.mjs", ".schema-cache/ssp-run3.json", ...cat], { encoding: "utf8" }).stdout);
  const sys2 = JSON.parse(readFileSync("test/fixtures/ssp/system.json", "utf8"));
  sys2.profile.file = "../test/fixtures/ssp/profile.json";
  sys2.components = ["ssp-component.json"];
  sys2.results = ["ssp-results.json", "ssp-results2.json", "ssp-results3.json"];
  sys2.reviews = "ssp-reviews2.json";
  sys2.inventory = "ssp-inventory2.json";
  writeFileSync(".schema-cache/ssp-inventory2.json", JSON.stringify({ source: "Fixture state", items: [
    { id: "example.org|www.example.org|A", type: "dns-record", description: "A record www.example.org" },
    { id: "example.org|example.org|MX", type: "dns-record" }] }));
  writeFileSync(".schema-cache/ssp-reviews2.json", JSON.stringify({ date: "2026-09-26", source: "Fixture review",
    requirements: [{ id: "DET.5.3", state: "partial" }, { id: "DEV.4.5", state: "implemented" },
      { id: "DEV.4.3", state: "partial" }] }));
  writeFileSync(".schema-cache/ssp-system2.json", JSON.stringify(sys2));
  const b = spawnSync(process.execPath, ["ssp.mjs", ".schema-cache/ssp-system2.json"], { encoding: "utf8" });
  const reqs2 = b.status === 0 ? Object.fromEntries(JSON.parse(b.stdout)["system-security-plan"]["control-implementation"]["implemented-requirements"]
    .map((r) => [r["control-id"], r])) : {};
  const st2 = (id) => reqs2[id]?.props.find((p) => p.name === "implementation-status").value;
  const cases2 = [
    ["a passing measurement does not raise a partial review", st2("DET.5.3") === "partial"],
    ["a failed measurement leaves an implemented review standing, and says so", st2("DEV.4.5") === "implemented"
      && /did not find this requirement satisfied/.test(reqs2["DEV.4.5"]?.remarks ?? "")],
    ["the review is named as the basis", /Reviewed 2026-09-26 \(Fixture review\)/.test(JSON.stringify(reqs2["DET.5.3"] ?? {}))],
    ["a claim does not raise a partial review", st2("DEV.4.3") === "partial"
      && reqs2["DEV.4.3"]?.props.find((p) => p.name === "basis")?.value === "reviewed"],
    ["the declared inventory becomes inventory-items, sorted and validated", b.status === 0
      && (() => { const out = JSON.parse(b.stdout)["system-security-plan"];
        const inv = out["system-implementation"]["inventory-items"] ?? [];
        writeFileSync(".schema-cache/test-ssp2.json", b.stdout);
        const v2 = spawnSync(process.execPath, ["validate.mjs", ".schema-cache/test-ssp2.json"], { encoding: "utf8" });
        return inv.length === 2 && inv[0].props[0].value === "example.org|example.org|MX" && v2.status === 0; })()],
    ["the summary names the claims a review outranks and the failed assessments",
      b.stderr.includes("ssp: state from -- 3 reviews, 1 component claims, 0 nothing; 2 requirements carry a component claim (a review")
      && b.stderr.includes("ssp: assessed -- 3 of 4, 2 not satisfied, 2 of them against a claim of implemented")],
    ["the summary's numbers are in the plan's metadata", b.status === 0 && (() => {
      const md = Object.fromEntries(JSON.parse(b.stdout)["system-security-plan"].metadata.props.map((p) => [p.name, p.value]));
      return Number(md["component-claims"]) >= 2 && Number(md["assessed-not-satisfied"]) >= 1
        && b.stderr.includes(`carry a component claim`) && b.stderr.includes(`assessed -- ${md.assessed} of`); })()],
    ["the claim's statement and evidence stay with a reviewed requirement",
      reqs2["DEV.4.3"]?.["by-components"].some((b) => (b.links ?? []).length)],
  ];
  for (const [name, ok] of cases2) {
    failed += !ok;
    console.log(`${ok ? "ok  " : "FAIL"} ssp: ${name}${b.status ? ": " + b.stderr : ""}`);
  }
  // Two checks on one requirement: a failing one that ended earlier is not
  // hidden by a passing one that ended later.
  const run5 = { ...run2, check: "fifth-check", start: "2000-01-01T00:00:00Z", end: "2000-01-01T00:01:00Z",
    subjects: run2.subjects.map((x) => ({ ...x, satisfied: false })) };
  writeFileSync(".schema-cache/ssp-run5.json", JSON.stringify(run5));
  writeFileSync(".schema-cache/ssp-results5.json",
    spawnSync(process.execPath, ["results.mjs", ".schema-cache/ssp-run5.json", ...cat], { encoding: "utf8" }).stdout);
  const sys3 = { ...sys2, results: ["ssp-results2.json", "ssp-results5.json"] };
  writeFileSync(".schema-cache/ssp-system3.json", JSON.stringify(sys3));
  const c3 = spawnSync(process.execPath, ["ssp.mjs", ".schema-cache/ssp-system3.json"], { encoding: "utf8" });
  const det = c3.status === 0 ? JSON.parse(c3.stdout)["system-security-plan"]["control-implementation"]["implemented-requirements"]
    .find((r) => r["control-id"] === "DET.5.3") : null;
  const pv = (n) => det?.props.find((p) => p.name === n)?.value;
  const ok3 = pv("assessment-state") === "not-satisfied" && /fifth-check/.test(pv("assessment-check") ?? "")
    && /second-check/.test(pv("assessment-check") ?? "");
  failed += !ok3;
  console.log(`${ok3 ? "ok  " : "FAIL"} ssp: an earlier failing check is not hidden by a later passing one${c3.status ? ": " + c3.stderr : ""}`);
}
// assessment-plan.mjs: how the claims are checked, as OSCAL.
{
  const { writeFileSync, readFileSync, mkdirSync } = await import("node:fs");
  mkdirSync(".schema-cache", { recursive: true });
  const cat = ["--catalog", "test/fixtures/recheck-catalog.json"];
  const gen = (f) => spawnSync(process.execPath, ["assessment-plan.mjs", f, ...cat], { encoding: "utf8" });
  const a = gen("test/fixtures/checks.json");
  writeFileSync(".schema-cache/test-ap.json", a.stdout);
  const v = spawnSync(process.execPath, ["validate.mjs", ".schema-cache/test-ap.json"], { encoding: "utf8" });
  const ap = a.status === 0 ? JSON.parse(a.stdout)["assessment-plan"] : {};
  const fixture = JSON.parse(readFileSync("test/fixtures/checks.json", "utf8"));
  const bad = (mutate) => {
    const c = structuredClone(fixture);
    mutate(c);
    writeFileSync(".schema-cache/ap-bad.json", JSON.stringify(c));
    return gen(".schema-cache/ap-bad.json").status;
  };
  const run = JSON.parse(readFileSync("test/fixtures/results-run.json", "utf8"));
  run.plan = { href: "assessment-plan.json" };
  writeFileSync(".schema-cache/run-with-plan.json", JSON.stringify(run));
  const r = spawnSync(process.execPath, ["results.mjs", ".schema-cache/run-with-plan.json", ...cat], { encoding: "utf8" });
  const cases = [
    ["assembles, validates and is deterministic", a.status === 0 && v.status === 0 && a.stdout === gen("test/fixtures/checks.json").stdout],
    ["one activity and one recurring task per check", ap["local-definitions"]?.activities?.length === 2
      && ap.tasks?.every((t) => t.timing["at-frequency"]?.period > 0)],
    ["the activity carries the check name the results use", ap["local-definitions"]?.activities?.some((x) =>
      x.props.some((p) => p.name === "check" && p.value === "protected-tags"))],
    ["it points to the security plan it verifies", resolveImport(ap, ap["import-ssp"]?.href).href === "security-plan.json"],
    ["an ID outside the catalog is refused", bad((c) => c.checks[0].requirements.push("XYZ.9.9")) === 1],
    ["a check listed twice is refused", bad((c) => c.checks.push(c.checks[0])) === 1],
    ["a check without subjects is refused", bad((c) => delete c.checks[0].subjects) === 1],
    ["results point to the plan they follow", r.status === 0
      && ((ar) => resolveImport(ar, ar["import-ap"].href).href === "assessment-plan.json")(JSON.parse(r.stdout)["assessment-results"])],
  ];
  for (const [name, ok] of cases) {
    failed += !ok;
    console.log(`${ok ? "ok  " : "FAIL"} assessment-plan: ${name}`);
  }
}
// poam.mjs: gaps from the plan and findings from the results become items.
{
  const { writeFileSync } = await import("node:fs");
  writeFileSync(".schema-cache/poam-in.json", JSON.stringify({ id: "fixture-poam", title: "Fixture POA&M", version: "2026-10-01",
    "last-modified": "2026-10-01T00:00:00Z", ssp: { file: "test-ssp.json", href: "security-plan.json" },
    results: ["ssp-results.json"], actions: "actions.json" }));
  const acts = (items) => writeFileSync(".schema-cache/actions.json", JSON.stringify({ source: "Fixture register", items }));
  const gen = () => spawnSync(process.execPath, ["poam.mjs", ".schema-cache/poam-in.json"], { encoding: "utf8" });
  acts([{ id: "I-1", title: "Scan every image", requirements: ["DET.5.3"], due: "2026-10-31", status: "in-progress" }]);
  const a = gen();
  writeFileSync(".schema-cache/test-poam.json", a.stdout);
  const v = spawnSync(process.execPath, ["validate.mjs", ".schema-cache/test-poam.json"], { encoding: "utf8" });
  const po = a.status === 0 ? JSON.parse(a.stdout)["plan-of-action-and-milestones"] : {};
  const item = (id) => (po["poam-items"] ?? []).find((i) => i.props.some((q) => q.name === "control-id" && q.value === id));
  const risk = (it) => (po.risks ?? []).find((r) => r.uuid === it?.["related-risks"]?.[0]?.["risk-uuid"]);
  const det = item("DET.5.3");
  acts([{ id: "I-1", title: "Scan every image", requirements: ["DET.5.3"], due: "2026-10-31", status: "done" }]);
  const done = JSON.parse(gen().stdout)["plan-of-action-and-milestones"];
  const doneRisk = done.risks.find((r) => r.title.startsWith("DET.5.3"));
  acts([{ id: "I-1", title: "x", requirements: ["DET.5.3"], due: "31.10.2026" }]);
  const badDate = gen().status;
  acts([{ id: "I-1", title: "Scan every image", requirements: ["DET.5.3"], due: "2026-10-31", status: "in-progress" }]);
  const cases = [
    ["assembles, validates and is deterministic", a.status === 0 && v.status === 0 && a.stdout === gen().stdout],
    ["a partial or planned claim is an item", Boolean(item("DET.5.3")) && Boolean(item("DEV.4.5"))],
    ["an unsatisfied finding is an item even where the plan claims implemented", Boolean(item("TEST.3.1.3"))
      && item("TEST.3.1.3")["related-findings"]?.length === 1],
    ["an action gives the risk its deadline and remediation", risk(det)?.deadline === "2026-10-31T23:59:59Z"
      && risk(det)?.status === "remediating" && risk(det)?.remediations?.[0]?.title.startsWith("I-1")],
    ["no action, no invented date -- and it says so", !risk(item("DEV.4.5"))?.deadline
      && item("DEV.4.5").props.some((q) => q.name === "no-action") && /No action/.test(item("DEV.4.5").remarks)],
    ["a done action closes the risk", doneRisk?.status === "closed" && doneRisk.remediations[0].lifecycle === "completed"],
    ["a due date that is not YYYY-MM-DD is refused", badDate === 1],
  ];
  for (const [name, ok] of cases) {
    failed += !ok;
    console.log(`${ok ? "ok  " : "FAIL"} poam: ${name}`);
  }
}
// mapping.mjs: deterministic, validates; an unknown target or a source left
// out is refused, and worksheet.mjs reads the result from disk.
{
  const gen = (src) => spawnSync(process.execPath, ["mapping.mjs", src], { encoding: "utf8" });
  const a = gen("test/fixtures/mapping-source.json");
  const same = a.status === 0 && a.stdout === gen("test/fixtures/mapping-source.json").stdout;
  failed += !same;
  console.log(`${same ? "ok  " : "FAIL"} mapping.mjs is deterministic${same ? "" : ": " + a.stderr}`);
  if (same) {
    const { writeFileSync, mkdirSync } = await import("node:fs");
    mkdirSync(".schema-cache", { recursive: true });
    writeFileSync(".schema-cache/test-mapping.json", a.stdout);
    const v = spawnSync(process.execPath, ["validate.mjs", ".schema-cache/test-mapping.json"], { encoding: "utf8" });
    failed += v.status !== 0;
    console.log(`${v.status === 0 ? "ok  " : "FAIL"} generated mapping validates${v.status === 0 ? "" : ": " + v.stdout}`);
    const w = spawnSync(process.execPath, ["worksheet.mjs", "control_layer/Mindeststandard-TLS/Entwurf-Mindeststandard-TLS-catalog.json",
      "--mapping-file", ".schema-cache/test-mapping.json", "--commit", "367d775010abee641b258926bb482fcd05270059"], { encoding: "utf8" });
    const ok = w.status === 0 && /status draft/.test(w.stdout) && /from A\.1 \(intersects-with\)/.test(w.stdout) && /3 requirements\./.test(w.stdout)
      && /^> .*not reviewed/m.test(w.stdout)
      && /a proposal to review/.test(w.stderr);
    failed += !ok;
    console.log(`${ok ? "ok  " : "FAIL"} worksheet reads an own mapping from disk and says it is a draft, in the file too${ok ? "" : ": " + w.stdout + w.stderr}`);
    // The mapping was made at 367d775; another commit is another catalog.
    const other = spawnSync(process.execPath, ["worksheet.mjs", "control_layer/Mindeststandard-TLS/Entwurf-Mindeststandard-TLS-catalog.json",
      "--mapping-file", ".schema-cache/test-mapping.json", "--commit", "a12831136f4122a4c43854622180a24f2576a41e"], { encoding: "utf8" });
    const pinned = other.status === 2 && /is not made for/.test(other.stderr);
    failed += !pinned;
    console.log(`${pinned ? "ok  " : "FAIL"} worksheet refuses an own mapping made at another commit (exit ${other.status})`);
  }
  {
    const { writeFileSync, readFileSync, mkdirSync } = await import("node:fs");
    mkdirSync(".schema-cache", { recursive: true });
    const src = JSON.parse(readFileSync("test/fixtures/mapping-source.json", "utf8"));
    src.catalog.path = "../../../ohartwig/grundschutz-worksheets/main/package.json";
    writeFileSync(".schema-cache/mapping-away.json", JSON.stringify(src));
    const away = gen(".schema-cache/mapping-away.json");
    const ok = away.status === 1 && /not a path in the library/.test(away.stderr);
    failed += !ok;
    console.log(`${ok ? "ok  " : "FAIL"} mapping.mjs: a catalog path with .. is refused (exit ${away.status})`);
  }
  const bad = gen("test/fixtures/mapping-source-broken.json");
  const refused = bad.status === 1 && /NOPE\.1 not in the catalog/.test(bad.stderr) && /A\.3: neither mapped/.test(bad.stderr);
  failed += !refused;
  console.log(`${refused ? "ok  " : "FAIL"} unknown target and unmapped source are refused${refused ? "" : ": " + bad.stderr}`);
  const rv = spawnSync(process.execPath, ["mapping.mjs", "test/fixtures/mapping-source.json", "--review"], { encoding: "utf8" });
  const sheetOk = rv.status === 0 && /^## A\.1$/m.test(rv.stdout) && /- \[ \] Direct targets, intersects-with: KONF\.2\.2 /.test(rv.stdout)
    && /^## A\.3$\n\nNot mapped: no TLS requirement fits/m.test(rv.stdout);
  failed += !sheetOk;
  console.log(`${sheetOk ? "ok  " : "FAIL"} mapping.mjs --review writes a sheet with every source and its targets${sheetOk ? "" : ": " + rv.stdout + rv.stderr}`);
  const full = /subset-of claims full coverage, which a draft mapping cannot/.test(bad.stderr);
  failed += !full;
  console.log(`${full ? "ok  " : "FAIL"} a draft mapping may not claim subset-of${full ? "" : ": " + bad.stderr}`);
}
// tools/eu-catalog.mjs: articles of an EU act from the Journal's markup, every
// word kept and pinned by the document's hash; mapping.mjs takes such a catalog
// as its source, and worksheet.mjs still reads the IDs of 1.0 (21.2.h).
{
  const { writeFileSync, readFileSync, mkdirSync } = await import("node:fs");
  mkdirSync(".schema-cache", { recursive: true });
  const eu = (src) => spawnSync(process.execPath, ["tools/eu-catalog.mjs", src, "--file", "test/fixtures/eu-act.xhtml"], { encoding: "utf8" });
  const a = eu("test/fixtures/eu-act-source.json");
  writeFileSync(".schema-cache/test-eu-catalog.json", a.stdout);
  const v = spawnSync(process.execPath, ["validate.mjs", ".schema-cache/test-eu-catalog.json"], { encoding: "utf8" });
  const cat = a.status === 0 ? JSON.parse(a.stdout).catalog : {};
  const ctl = (id) => [...everyControl(cat)].find((c) => c.id === id);
  const src = JSON.parse(readFileSync("test/fixtures/eu-act-source.json", "utf8"));
  const variant = (name, change) => {
    const s = structuredClone(src);
    change(s);
    writeFileSync(`.schema-cache/${name}`, JSON.stringify(s));
    return eu(`.schema-cache/${name}`);
  };
  const otherBytes = variant("eu-other-bytes.json", (s) => (s.document.sha256 = "0".repeat(64)));
  const untold = variant("eu-untold.json", (s) => delete s["left-out"]);
  const nis2Ids = new Set([...everyControl(JSON.parse(readFileSync("standards/nis2.json", "utf8")).catalog)].map((c) => c.id));
  const cases = [
    ["validates and is deterministic", a.status === 0 && v.status === 0 && a.stdout === eu("test/fixtures/eu-act-source.json").stdout],
    ["a paragraph keeps its words, not its number", ctl("Art.1.1")?.parts[0].prose === "Die Einrichtungen treffen geeignete Maßnahmen."],
    ["an article is a group of its paragraphs", cat.groups?.[0]?.id === "Art.1" && cat.groups[0].title === "Pflichten" && !ctl("Art.1")],
    ["a point is a control of its paragraph, sub-points stay in its text",
      /^Meldungen, und zwar\n\ni\) binnen 24 Stunden,\n\nii\) binnen 72 Stunden\.$/.test(ctl("Art.1.2.b")?.parts[0].prose ?? "")],
    ["a subparagraph after the points keeps its place, labelled",
      ctl("Art.1.2")?.parts[0].parts?.[0]?.props[0].value === "Unterabsatz 2" && /12 Stunden/.test(ctl("Art.1.2")?.parts[0].parts[0].prose)],
    ["what is left out is named with its reason", !ctl("Art.1.3") && /Art\.1\.3: Verpflichtet die Kommission/.test(cat.metadata?.remarks)],
    ["other bytes than the pinned ones are refused", otherBytes.status === 1 && /not the pinned one/.test(otherBytes.stderr)],
    ["a paragraph neither taken nor left out is refused", untold.status === 1 && /Art\.1\.3: neither taken/.test(untold.stderr)],
    ["the committed NIS2 catalog has the ten measures of Art. 21(2)",
      [..."abcdefghij"].every((x) => nis2Ids.has(`Art.21.2.${x}`))],
  ];
  for (const [name, ok] of cases) {
    failed += !ok;
    console.log(`${ok ? "ok  " : "FAIL"} eu-catalog: ${name}${ok ? "" : ": " + a.stderr + otherBytes.stderr + untold.stderr}`);
  }
  const m = spawnSync(process.execPath, ["mapping.mjs", "test/fixtures/mapping-source-catalog.json"], { encoding: "utf8" });
  writeFileSync(".schema-cache/test-mapping-catalog.json", m.stdout);
  const mv = spawnSync(process.execPath, ["validate.mjs", ".schema-cache/test-mapping-catalog.json"], { encoding: "utf8" });
  const mc = m.status === 0 ? JSON.parse(m.stdout)["mapping-collection"] : {};
  const imp = mc.mappings ? resolveImport(mc, mc.mappings[0]["source-resource"].href) : {};
  const rv = spawnSync(process.execPath, ["mapping.mjs", "test/fixtures/mapping-source-catalog.json", "--review"], { encoding: "utf8" });
  const msrc = JSON.parse(readFileSync("test/fixtures/mapping-source-catalog.json", "utf8"));
  msrc.source.ids.push("Art.99.1");
  writeFileSync(".schema-cache/mapping-unknown-source.json", JSON.stringify(msrc));
  const unknown = spawnSync(process.execPath, ["mapping.mjs", ".schema-cache/mapping-unknown-source.json"], { encoding: "utf8" });
  const ws = (sources) => spawnSync(process.execPath, ["worksheet.mjs", "control_layer/Mindeststandard-TLS/Entwurf-Mindeststandard-TLS-catalog.json",
    "--mapping-file", ".schema-cache/test-mapping-catalog.json", "--commit", "367d775010abee641b258926bb482fcd05270059", "--sources", sources, "--summary"], { encoding: "utf8" });
  const now = ws("Art.21.2.h");
  const then = ws("21.2.h");
  const count = (r) => r.stdout.match(/^(\d+) requirements$/m)?.[1];
  const mcases = [
    ["a mapping imports its source catalog with the catalog's SHA-256", m.status === 0 && mv.status === 0
      && imp.href === "../standards/nis2.json" && imp.sha256 === sha256(readFileSync("standards/nis2.json"))],
    ["its review sheet quotes the source's text", rv.status === 0 && /^Text: Konzepte und Verfahren für den Einsatz von Kryptografie/m.test(rv.stdout)],
    ["a source ID the catalog does not have is refused", unknown.status === 1 && /Art\.99\.1: not a control of standards\/nis2\.json/.test(unknown.stderr)],
    ["worksheet still takes the short ID of 1.0, with a note", now.status === 0 && count(now) === "1" && count(then) === "1"
      && /accepted until 2\.0/.test(then.stderr) && !/accepted until/.test(now.stderr)],
  ];
  for (const [name, ok] of mcases) {
    failed += !ok;
    console.log(`${ok ? "ok  " : "FAIL"} mapping from a catalog: ${name}${ok ? "" : ": " + m.stderr + mv.stdout + unknown.stderr + now.stderr + then.stderr}`);
  }
}
// --catalog-file: a catalog from disk, pinned by its hash; a preset that names
// a file refuses another one, and refuses to run without it.
{
  const run = (...a) => spawnSync(process.execPath, ["worksheet.mjs", ...a], { encoding: "utf8" });
  const w = run("--catalog-file", "test/fixtures/valid-catalog.json", "--summary");
  const ok = w.status === 0 && /sha256 [0-9a-f]{12}/.test(w.stdout) && /^\d+ requirements$/m.test(w.stdout);
  failed += !ok;
  console.log(`${ok ? "ok  " : "FAIL"} worksheet reads a catalog file and names its hash${ok ? "" : ": " + w.stdout + w.stderr}`);
  const other = run("--preset", "a5", "--catalog-file", "test/fixtures/valid-catalog.json");
  const none = run("--preset", "a5");
  const refused = other.status === 2 && /is not the A5-Basismodul/.test(other.stderr) && none.status === 2 && /needs --catalog-file/.test(none.stderr);
  failed += !refused;
  console.log(`${refused ? "ok  " : "FAIL"} a preset's catalog file is checked by its hash and required${refused ? "" : ": " + other.stderr + none.stderr}`);
}
// What the inputs may not do: leave the pinned library, or pass a status that
// is only a property of Object.prototype.
{
  const { writeFileSync, readFileSync } = await import("node:fs");
  const C = "367d775010abee641b258926bb482fcd05270059";
  const away = "../../../ohartwig/grundschutz-worksheets/main/package.json";
  // The old code also exited 1 on these inputs -- after fetching the wrong file --
  // so the refusal must be the stated one, not a crash downstream.
  const check = (name, r, want, said = /not (a path in|the library)/) => {
    const ok = r.status === want && (want === 0 || said.test(r.stderr));
    failed += !ok;
    console.log(`${ok ? "ok  " : "FAIL"} ${name} (exit ${r.status}, want ${want})`);
    if (!ok) console.log(r.stdout + r.stderr);
  };
  // Every tool that builds a library URL from a path refuses ".." before it fetches.
  check("worksheet: a catalog path with .. is refused", spawnSync(process.execPath, ["worksheet.mjs", away, "--commit", C], { encoding: "utf8" }), 2);
  check("validate --bsi: a path with .. is refused", spawnSync(process.execPath, ["validate.mjs", "--bsi", away, "--commit", C], { encoding: "utf8" }), 2);
  const withPath = (src, dst) => {
    const j = JSON.parse(readFileSync(src, "utf8"));
    j.catalog.path = away;
    writeFileSync(dst, JSON.stringify(j));
    return dst;
  };
  check("profile: a catalog path with .. is refused", spawnSync(process.execPath, ["profile.mjs", withPath("test/fixtures/tailoring.json", ".schema-cache/away-tailoring.json")], { encoding: "utf8" }), 1);
  check("component: a catalog path with .. is refused", spawnSync(process.execPath, ["component.mjs", withPath("test/fixtures/component-source.json", ".schema-cache/away-component.json")], { encoding: "utf8" }), 1);
  check("results: a catalog path with .. is refused", spawnSync(process.execPath, ["results.mjs", withPath("test/fixtures/results-run.json", ".schema-cache/away-run.json")], { encoding: "utf8" }), 1);
  check("assessment-plan: a catalog path with .. is refused", spawnSync(process.execPath, ["assessment-plan.mjs", withPath("test/fixtures/checks.json", ".schema-cache/away-checks.json")], { encoding: "utf8" }), 1);
  // recheck --commit follows the definition's source, so the source must be the library.
  const cd = JSON.parse(readFileSync("test/fixtures/recheck-component.json", "utf8"));
  cd["component-definition"].components[0]["control-implementations"][0].source = `https://mirror.example.org/catalogs/${C}/catalog.json`;
  writeFileSync(".schema-cache/recheck-foreign.json", JSON.stringify(cd));
  check("recheck: a source outside the library is refused", spawnSync(process.execPath, ["recheck.mjs", ".schema-cache/recheck-foreign.json", "--commit", C], { encoding: "utf8" }), 2);
  // A library prefix followed by ".." (plain or percent-encoded) leaves it again once fetched.
  for (const [label, dots] of [["..", ".."], ["%2e%2e", "%2e%2e"]]) {
    cd["component-definition"].components[0]["control-implementations"][0].source = `https://raw.githubusercontent.com/BSI-Bund/Stand-der-Technik-Bibliothek/${C}/${dots}/${dots}/${dots}/ohartwig/grundschutz-worksheets/main/package.json`;
    writeFileSync(".schema-cache/recheck-dots.json", JSON.stringify(cd));
    check(`recheck: a library source with ${label} behind the commit is refused`, spawnSync(process.execPath, ["recheck.mjs", ".schema-cache/recheck-dots.json", "--commit", C], { encoding: "utf8" }), 2);
  }
  // worksheet --profile: the import must be this run's catalog URL, as profile.mjs writes it.
  const CAT = "control_layer/Grundschutz++/Grundschutz++-resolved_catalog.json";
  writeFileSync(".schema-cache/away-profile.json", JSON.stringify({ profile: { imports: [{ href: `https://mirror.example.org/${C}/catalog.json`, "include-controls": [{ "with-ids": ["DET.5.3"] }] }] } }));
  check("worksheet: a profile importing from outside the library is refused", spawnSync(process.execPath, ["worksheet.mjs", CAT, "--commit", C, "--profile", ".schema-cache/away-profile.json"], { encoding: "utf8" }), 2, /does not import/);
  const tailoring = JSON.parse(readFileSync("test/fixtures/tailoring.json", "utf8"));
  const made = spawnSync(process.execPath, ["worksheet.mjs", tailoring.catalog.path, "--commit", tailoring.catalog.commit, "--profile", ".schema-cache/test-profile.json"], { encoding: "utf8" });
  check("worksheet: a profile written by profile.mjs is accepted", made, 0);
  // poam: an action status that is a prototype property is not a status.
  const pin = JSON.parse(readFileSync(".schema-cache/poam-in.json", "utf8"));
  writeFileSync(".schema-cache/actions-proto.json", JSON.stringify({ source: "register", items: [{ id: "I-1", title: "x", requirements: ["DET.5.3"], status: "constructor" }] }));
  writeFileSync(".schema-cache/poam-proto.json", JSON.stringify({ ...pin, actions: "actions-proto.json" }));
  check("poam: a status named after a prototype property is refused", spawnSync(process.execPath, ["poam.mjs", ".schema-cache/poam-proto.json"], { encoding: "utf8" }), 1, /status must be/);
}
// Imports go through back-matter resources that carry the SHA-256 of what the
// document was made from; the plan states what does not apply, with the reason.
{
  const { writeFileSync, readFileSync } = await import("node:fs");
  const report = (name, ok, detail = "") => {
    failed += !ok;
    console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : ": " + detail}`);
  };
  const prof = JSON.parse(readFileSync(".schema-cache/test-profile.json", "utf8")).profile;
  const target = resolveImport(prof, prof.imports[0].href);
  report("profile: the catalog is imported through back-matter, with its SHA-256",
    prof.imports[0].href.startsWith("#") && /\/[0-9a-f]{40}\//.test(target.href ?? "") && /^[0-9a-f]{64}$/.test(target.sha256), JSON.stringify(target));
  // Same URL, other bytes: the worksheet refuses the profile.
  const forged = JSON.parse(readFileSync(".schema-cache/test-profile.json", "utf8"));
  forged.profile["back-matter"].resources[0].rlinks[0].hashes[0].value = "0".repeat(64);
  writeFileSync(".schema-cache/profile-other-bytes.json", JSON.stringify(forged));
  const tailoring = JSON.parse(readFileSync("test/fixtures/tailoring.json", "utf8"));
  const w = spawnSync(process.execPath, ["worksheet.mjs", tailoring.catalog.path, "--commit", tailoring.catalog.commit, "--profile", ".schema-cache/profile-other-bytes.json"], { encoding: "utf8" });
  report("worksheet: a profile made against other bytes of the catalog is refused", w.status === 2 && /other bytes/.test(w.stderr), w.stderr);
  // The plan: its profile, hashed, and what the profile leaves out.
  const sys = JSON.parse(readFileSync("test/fixtures/ssp/system.json", "utf8"));
  const pf = JSON.parse(readFileSync("test/fixtures/ssp/profile.json", "utf8"));
  pf.profile["back-matter"] = { resources: [{ uuid: "6f1c2a9e-0b7d-5c3e-8a41-2d9e7f6b5a10", title: "Not applicable: ARCH.6.1", description: "no own WAN links",
    props: [{ name: "control-id", ns: "https://github.com/ohartwig/grundschutz-worksheets/ns", value: "ARCH.6.1" }, { name: "tailoring", ns: "https://github.com/ohartwig/grundschutz-worksheets/ns", value: "not-applicable" }],
    base64: { filename: "not-applicable-ARCH.6.1.txt", "media-type": "text/plain", value: Buffer.from("no own WAN links").toString("base64") } }] };
  writeFileSync("test/fixtures/ssp/.profile-na.json", JSON.stringify(pf));
  writeFileSync("test/fixtures/ssp/.system-na.json", JSON.stringify({ ...sys, profile: { file: ".profile-na.json", href: sys.profile.href } }));
  const sr = spawnSync(process.execPath, ["ssp.mjs", "test/fixtures/ssp/.system-na.json"], { encoding: "utf8" });
  const { rmSync } = await import("node:fs");
  rmSync("test/fixtures/ssp/.profile-na.json"); rmSync("test/fixtures/ssp/.system-na.json");
  const plan = sr.status === 0 ? JSON.parse(sr.stdout)["system-security-plan"] : {};
  const pt = resolveImport(plan, plan["import-profile"]?.href);
  report("ssp: the profile is imported through back-matter with the SHA-256 of the local copy",
    pt.href === sys.profile.href && pt.sha256 === sha256(Buffer.from(JSON.stringify(pf))), sr.stderr);
  const na = (plan["back-matter"]?.resources ?? []).find((x) => x.props?.some((p) => p.value === "not-applicable"));
  report("ssp: a requirement the profile leaves out is stated as not applicable, with its reason",
    na?.description === "no own WAN links" && plan.metadata?.props?.some((p) => p.name === "requirements-not-applicable" && p.value === "1")
      && !plan["control-implementation"]["implemented-requirements"].some((x) => x["control-id"] === "ARCH.6.1"), sr.stderr);
  writeFileSync(".schema-cache/ssp-na.json", sr.stdout);
  const v = spawnSync(process.execPath, ["validate.mjs", ".schema-cache/ssp-na.json"], { encoding: "utf8" });
  report("ssp: with back-matter it still validates", v.status === 0, v.stdout + v.stderr);
  const poam = JSON.parse(readFileSync(".schema-cache/test-poam.json", "utf8"))["plan-of-action-and-milestones"];
  report("poam: the plan is imported through back-matter with its SHA-256", /^[0-9a-f]{64}$/.test(resolveImport(poam, poam["import-ssp"].href).sha256));
}
process.exit(failed ? 1 : 0);
