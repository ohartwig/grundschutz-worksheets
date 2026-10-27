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
  // BSI-Standard 300-1, 3.4.1: the method and every requirement without a
  // target-object category belong in the package -- named for the
  // Anwenderkatalog, a warning, and an error with --strict.
  const tls = a.stderr.includes("warning");
  failed += tls;
  console.log(`${!tls ? "ok  " : "FAIL"} profile: a tailoring of another catalog gets no package warning`);
  const { writeFileSync } = await import("node:fs");
  const { LIBRARY } = await import("../tools/bsi-library.mjs");
  writeFileSync(".schema-cache/tailoring-gspp.json", JSON.stringify({ title: "t", version: "1", "last-modified": "2026-10-27T00:00:00Z",
    catalog: { path: "control_layer/Grundschutz++/Grundschutz++-resolved_catalog.json", commit: LIBRARY.commit },
    applicable: ["DET.2.1"], "not-applicable": [{ id: "GC.1.1", reason: "x" }, { id: "REA.2.5", reason: "y" }] }));
  const warn = spawnSync(process.execPath, ["profile.mjs", ".schema-cache/tailoring-gspp.json"], { encoding: "utf8" });
  const strict = spawnSync(process.execPath, ["profile.mjs", ".schema-cache/tailoring-gspp.json", "--strict"], { encoding: "utf8" });
  for (const [name, ok] of [
    ["a method requirement called not applicable is named", warn.status === 0 && /warning: 1 requirement\(s\) of the method called not applicable[^\n]*: GC\.1\.1\n/.test(warn.stderr)],
    ["method requirements left out are named", /warning: \d+ requirement\(s\) of the method left out[^\n]*GC\.1\.2/.test(warn.stderr)],
    ["requirements without a target-object category left out are named, not those called not applicable",
      /without a target-object category left out[^\n]*ASST\.1\.1/.test(warn.stderr) && !/left out[^\n]*REA\.2\.5(,|\n)/.test(warn.stderr)],
    ["with --strict they are errors", strict.status === 1 && /3 error\(s\)/.test(strict.stderr)],
  ]) {
    failed += !ok;
    console.log(`${ok ? "ok  " : "FAIL"} profile: ${name}${ok ? "" : ": " + warn.stderr.slice(0, 400) + strict.stderr.slice(0, 200)}`);
  }
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
// BSI-Standard 300-1, 4.1: an unfulfilled requirement is so for now or for
// good; for good never for a MUSS, for a SOLLTE only with a risk analysis and
// an approved residual risk. The plan carries it, the POA&M makes the approved
// ones deviations.
{
  const { writeFileSync, readFileSync } = await import("node:fs");
  const cat = ["--catalog", "test/fixtures/ssp/catalog.json"];
  const sys = JSON.parse(readFileSync("test/fixtures/ssp/system.json", "utf8"));
  writeFileSync(".schema-cache/ssp-nf.json", JSON.stringify({ ...sys, profile: { ...sys.profile, file: "../test/fixtures/ssp/profile.json" },
    components: ["ssp-component.json"], results: ["ssp-results.json"], reviews: "ssp-nf-reviews.json" }));
  const approved = { by: "Management", date: "2026-10-27" };
  const run = (requirements, extra = cat) => {
    writeFileSync(".schema-cache/ssp-nf-reviews.json", JSON.stringify({ date: "2026-10-27", source: "Fixture review", requirements }));
    return spawnSync(process.execPath, ["ssp.mjs", ".schema-cache/ssp-nf.json", ...extra], { encoding: "utf8" });
  };
  const good = [
    { id: "DET.5.3", state: "partial", note: "scanner rollout under way", nonfulfilment: "temporary" },
    { id: "TEST.3.1.3", state: "planned", note: "no licence for approvals", nonfulfilment: "permanent", risk: "R-021", approved },
    { id: "DEV.4.3", state: "planned", note: "optional", nonfulfilment: "permanent" },
  ];
  const a = run(good);
  writeFileSync(".schema-cache/test-ssp-nf.json", a.stdout);
  const v = spawnSync(process.execPath, ["validate.mjs", ".schema-cache/test-ssp-nf.json"], { encoding: "utf8" });
  const reqs = a.status === 0 ? Object.fromEntries(JSON.parse(a.stdout)["system-security-plan"]["control-implementation"]["implemented-requirements"].map((r) => [r["control-id"], r])) : {};
  const p = (id, name) => reqs[id]?.props.find((q) => q.name === name)?.value;
  writeFileSync(".schema-cache/poam-nf.json", JSON.stringify({ id: "nf-poam", title: "Fixture POA&M", version: "1", "last-modified": "2026-10-27T00:00:00Z",
    ssp: { file: "test-ssp-nf.json", href: "security-plan.json" }, results: ["ssp-results.json"] }));
  const po = spawnSync(process.execPath, ["poam.mjs", ".schema-cache/poam-nf.json"], { encoding: "utf8" });
  writeFileSync(".schema-cache/test-poam-nf.json", po.stdout);
  const pv = spawnSync(process.execPath, ["validate.mjs", ".schema-cache/test-poam-nf.json"], { encoding: "utf8" });
  const pm = po.status === 0 ? JSON.parse(po.stdout)["plan-of-action-and-milestones"] : {};
  const item = (id) => (pm["poam-items"] ?? []).find((i) => i.props.some((q) => q.name === "control-id" && q.value === id));
  const risk = (id) => (pm.risks ?? []).find((r) => r.uuid === item(id)?.["related-risks"]?.[0]?.["risk-uuid"]);
  for (const [name, ok] of [
    ["ssp: the plan carries temporary and permanent, and validates", a.status === 0 && v.status === 0
      && p("DET.5.3", "nonfulfilment") === "temporary" && p("TEST.3.1.3", "nonfulfilment") === "permanent"
      && p("TEST.3.1.3", "risk-analysis") === "R-021" && p("TEST.3.1.3", "residual-risk-approved") === "2026-10-27"
      && p("TEST.3.1.3", "residual-risk-approved-by") === "Management"],
    ["ssp: the unclassified are counted", /not fulfilled \(BSI-Standard 300-1\) -- 4: 1 temporary, 2 permanent, 1 not classified/.test(a.stderr)],
    ["ssp: a permanent KANN needs no risk analysis", a.status === 0 && !p("DEV.4.3", "risk-analysis")],
    ["ssp: a permanent MUSS is refused", /DEV\.4\.5: a MUSS cannot be permanently unfulfilled/.test(run([...good, { id: "DEV.4.5", state: "planned", note: "x", nonfulfilment: "permanent", risk: "R-1", approved }]).stderr)],
    ["ssp: a permanent SOLLTE without risk analysis or approval is refused", /DET\.5\.3: a permanently unfulfilled SOLLTE needs/.test(run([{ ...good[0], nonfulfilment: "permanent" }]).stderr)],
    ["ssp: a temporary nonfulfilment without a note is refused", /needs a note/.test(run([{ ...good[0], note: "" }]).stderr)],
    ["ssp: an implemented requirement with a nonfulfilment is refused", /implemented requirement has no nonfulfilment/.test(run([{ ...good[0], state: "implemented" }]).stderr)],
    ["ssp: a catalog from outside the library is not fetched", /not from the library at a commit: name a local copy with --catalog/.test(run(good, []).stderr)],
    ["ssp: without a permanent nonfulfilment no catalog is read", run([good[0]], []).status === 0],
    ["poam: an approved permanent nonfulfilment is a deviation, not a missing action", po.status === 0 && pv.status === 0
      && risk("TEST.3.1.3")?.status === "deviation-approved" && !item("TEST.3.1.3").props.some((q) => q.name === "no-action")
      && pm.metadata.props.find((q) => q.name === "items-deviation-approved")?.value === "1"],
    ["poam: a temporary one stays open", risk("DET.5.3")?.status === "open" && item("DET.5.3").props.some((q) => q.name === "nonfulfilment" && q.value === "temporary")],
  ]) {
    failed += !ok;
    console.log(`${ok ? "ok  " : "FAIL"} nonfulfilment: ${name}${ok ? "" : ": " + a.stderr + v.stdout + po.stderr + pv.stdout}`);
  }
}
// BSI-Standard 300-1, Annex 3: the risk register behind the plan's risk
// analyses -- the minimum of criterion 15, the threats of 17, the limit of an
// acceptance (28), the owner's approval of the plan (31), the yearly review
// (35).
{
  const { writeFileSync, readFileSync } = await import("node:fs");
  writeFileSync(".schema-cache/rr-actions.json", JSON.stringify({ source: "Improvement register",
    items: [{ id: "I-173", title: "Approvals in the pipeline", requirements: ["TEST.3.1.3"], due: "2026-12-31", status: "open", owner: "J. Doe" }] }));
  const r021 = { id: "R-021", object: "Release pipeline", description: "Unreviewed changes reach production", goals: ["integrity"], level: "high",
    owner: "J. Doe", threats: ["G 0.28", "G 0.46"], treatment: "reduce", priority: "1", actions: ["I-173"],
    "plan-approved": { by: "J. Doe", date: "2026-10-27" }, reviewed: "2026-10-27" };
  const r030 = { id: "R-030", object: "Shop", description: "Outage during the sale", goals: ["availability"], level: "medium", owner: "A. Roe",
    treatment: "accept", accepted: { by: "Management", date: "2025-01-01", until: "2026-01-31" }, reviewed: "2025-01-01" };
  const r031 = { id: "R-031", object: "Office", description: "Theft of a laptop", goals: ["confidentiality"], level: "low", owner: "A. Roe" };
  const run = (items, ssp = "test-ssp-nf.json") => {
    writeFileSync(".schema-cache/rr-risks.json", JSON.stringify({ source: "Risk register", items }));
    writeFileSync(".schema-cache/rr-poam.json", JSON.stringify({ id: "rr-poam", title: "Fixture POA&M", version: "1", "last-modified": "2026-10-27T00:00:00Z",
      ssp: { file: ssp, href: "security-plan.json" }, results: ["ssp-results.json"], actions: "rr-actions.json", risks: "rr-risks.json" }));
    return spawnSync(process.execPath, ["poam.mjs", ".schema-cache/rr-poam.json"], { encoding: "utf8" });
  };
  const good = run([r021, r030, r031]);
  writeFileSync(".schema-cache/test-poam-rr.json", good.stdout);
  const v = spawnSync(process.execPath, ["validate.mjs", ".schema-cache/test-poam-rr.json"], { encoding: "utf8" });
  const pm = good.status === 0 ? JSON.parse(good.stdout)["plan-of-action-and-milestones"] : {};
  const reg = (id) => (pm.risks ?? []).find((r) => r.props?.some((q) => q.name === "risk-id" && q.value === id));
  const item = (pm["poam-items"] ?? []).find((i) => i.props.some((q) => q.name === "control-id" && q.value === "TEST.3.1.3"));
  const sspPlan = JSON.parse(readFileSync(".schema-cache/test-ssp-nf.json", "utf8"))["system-security-plan"];
  const threats = sspPlan["control-implementation"]["implemented-requirements"].find((r) => r["control-id"] === "TEST.3.1.3")?.props.find((q) => q.name === "threats")?.value;
  // A temporary nonfulfilment that names an accepted risk: the acceptance needs its limit.
  const tmp = JSON.parse(JSON.stringify(sspPlan));
  tmp["control-implementation"]["implemented-requirements"].find((r) => r["control-id"] === "DET.5.3").props.push({ name: "risk-analysis", ns: "x", value: "R-030" });
  writeFileSync(".schema-cache/rr-ssp-tmp.json", JSON.stringify({ "system-security-plan": tmp }));
  const { until, ...unlimited } = r030.accepted;
  for (const [name, ok] of [
    ["ssp: a permanent nonfulfilment carries the elementary threats of its requirement", threats === "G 0.28, G 0.46"],
    ["the register becomes risks of the POA&M, and validates", good.status === 0 && v.status === 0 && reg("R-021")?.status === "open"
      && reg("R-030")?.status === "deviation-approved" && reg("R-030")?.deadline === "2026-01-31T23:59:59Z"
      && reg("R-021").props.some((q) => q.name === "risk-owner" && q.value === "J. Doe") && reg("R-021").remediations?.length === 1
      && pm.metadata.props.find((q) => q.name === "risks-register")?.value === "3"],
    ["the item of a requirement relates to its risk analysis", item?.["related-risks"]?.some((x) => x["risk-uuid"] === reg("R-021")?.uuid)],
    ["stderr counts approval, review and expiry", /3 risks; 0 treated without the owner's approval of the plan[^\n]*, 0 approved by someone other than the owner, 2 not reviewed within a year \(35\), 1 acceptances run out \(28\)/.test(good.stderr)],
    ["the plan approved by someone other than the owner is counted", /1 treated without[^\n]*1 approved by someone other/.test(run([{ ...r021, "plan-approved": { by: "CISO", date: "2026-10-27" } }, { ...r030, actions: ["I-173"], treatment: "reduce", priority: "2" }, r031]).stderr)],
    ["a risk analysis the register lacks is refused", /names risk analysis R-021, which the risk register does not have/.test(run([r030]).stderr)],
    ["a risk that misses a threat of its requirement is refused (17)", /does not consider G 0\.46, the elementary threats of TEST\.3\.1\.3/.test(run([{ ...r021, threats: ["G 0.28"] }]).stderr)],
    ["a risk without owner is refused (16)", /R-021: needs "owner"/.test(run([{ ...r021, owner: "" }]).stderr)],
    ["a reduced risk without actions is refused (25)", /needs its "actions"/.test(run([{ ...r021, actions: [] }]).stderr)],
    ["an action the register does not have is refused", /action I-999 is not in the actions register/.test(run([{ ...r021, actions: ["I-999"] }]).stderr)],
    ["an accepted risk without acceptance is refused (29, 30)", /needs "accepted"/.test(run([r021, { ...r030, accepted: undefined }]).stderr)],
    ["a temporary nonfulfilment accepted without a limit is refused (28)", /accepted for the temporary nonfulfilment of DET\.5\.3, so it needs accepted\.until/.test(run([r021, { ...r030, accepted: unlimited }], "rr-ssp-tmp.json").stderr)],
    ["a treatment outside the four options is refused", /treatment must be reduce, avoid, transfer or accept/.test(run([{ ...r021, treatment: "ignore" }]).stderr)],
  ]) {
    failed += !ok;
    console.log(`${ok ? "ok  " : "FAIL"} risk register: ${name}${ok ? "" : ": " + good.stderr + v.stdout}`);
  }
}
// BSI-Standard 300-1, 3.4.3: own requirements become part of the package, as a
// second catalog the profile carries along.
{
  const { writeFileSync } = await import("node:fs");
  const base = { title: "t", version: "1", "last-modified": "2026-10-27T00:00:00Z",
    catalog: { path: "control_layer/Mindeststandard-TLS/Entwurf-Mindeststandard-TLS-catalog.json", commit: "367d775010abee641b258926bb482fcd05270059" },
    applicable: ["KONF.2.2"], parameters: { "own.1.1-prm1": "zehn Jahre" } };
  const own = { file: "../test/fixtures/own-requirements.json", href: "https://example.org/own-requirements.json" };
  const run = (t) => {
    writeFileSync(".schema-cache/own-tailoring.json", JSON.stringify(t));
    return spawnSync(process.execPath, ["profile.mjs", ".schema-cache/own-tailoring.json"], { encoding: "utf8" });
  };
  const a = run({ ...base, own });
  writeFileSync(".schema-cache/test-profile-own.json", a.stdout);
  const v = spawnSync(process.execPath, ["validate.mjs", ".schema-cache/test-profile-own.json"], { encoding: "utf8" });
  const pr = a.status === 0 ? JSON.parse(a.stdout).profile : {};
  const { resolveImport } = await import("../lib/oscal.mjs");
  const second = pr.imports?.[1];
  const emb = second && resolveImport(pr, second.href);
  const { readFileSync } = await import("node:fs");
  // The plan reads the own catalog from the profile: a permanent own SOLLTE gets its threats.
  writeFileSync(".schema-cache/own-reviews.json", JSON.stringify({ date: "2026-10-27", source: "Fixture review", by: "J. Doe",
    requirements: [{ id: "OWN.1.1", state: "planned", note: "archive not yet bought", nonfulfilment: "permanent", risk: "R-040", approved: { by: "Management", date: "2026-10-27" } }] }));
  const sys = JSON.parse(readFileSync("test/fixtures/ssp/system.json", "utf8"));
  writeFileSync(".schema-cache/own-system.json", JSON.stringify({ ...sys, profile: { file: "test-profile-own.json", href: "https://example.org/profile.json" },
    components: [], results: [], reviews: "own-reviews.json" }));
  const s = spawnSync(process.execPath, ["ssp.mjs", ".schema-cache/own-system.json"], { encoding: "utf8" });
  const req = s.status === 0 ? JSON.parse(s.stdout)["system-security-plan"]["control-implementation"]["implemented-requirements"].find((r) => r["control-id"] === "OWN.1.1") : null;
  for (const [name, ok] of [
    ["the profile imports them as a second catalog, embedded, and validates", a.status === 0 && v.status === 0
      && JSON.stringify(second?.["include-controls"]?.[0]?.["with-ids"]) === '["OWN.1.1","OWN.1.2"]'
      && emb?.bytes?.equals(readFileSync("test/fixtures/own-requirements.json")) && /^[0-9a-f]{64}$/.test(emb.sha256)
      && pr.metadata.props.some((q) => q.name === "own" && q.value === "2")
      && pr.modify?.["set-parameters"]?.some((x) => x["param-id"] === "own.1.1-prm1")],
    ["without own requirements the profile has one import", run(base).status === 1 && JSON.parse(run({ ...base, parameters: {} }).stdout).profile.imports.length === 1],
    ["the plan includes them and reads their modal verb and threats from the profile", s.status === 0
      && req?.props.some((q) => q.name === "threats" && q.value === "G 0.18")],
    ["a permanent own MUSS is refused like the catalog's", /OWN\.1\.2: a MUSS cannot be permanently unfulfilled/.test((() => {
      writeFileSync(".schema-cache/own-reviews.json", JSON.stringify({ date: "2026-10-27", source: "x", requirements: [{ id: "OWN.1.2", state: "planned", note: "x", nonfulfilment: "permanent", risk: "R-1", approved: { by: "M", date: "2026-10-27" } }] }));
      return spawnSync(process.execPath, ["ssp.mjs", ".schema-cache/own-system.json"], { encoding: "utf8" }).stderr;
    })())],
    ["an own ID the catalog uses is refused", /own KONF\.2\.2: the catalog uses this ID already/.test((() => {
      const c = JSON.parse(readFileSync("test/fixtures/own-requirements.json", "utf8"));
      c.catalog.groups[0].controls[1].id = "KONF.2.2";
      writeFileSync(".schema-cache/own-bad.json", JSON.stringify(c));
      return run({ ...base, parameters: {}, own: { ...own, file: "own-bad.json" } }).stderr;
    })())],
    ["an own requirement without a modal verb is refused", /own OWN\.1\.2: the statement needs the prop modal_verb/.test((() => {
      const c = JSON.parse(readFileSync("test/fixtures/own-requirements.json", "utf8"));
      c.catalog.groups[0].controls[1].parts[0].props = [];
      writeFileSync(".schema-cache/own-bad.json", JSON.stringify(c));
      return run({ ...base, parameters: {}, own: { ...own, file: "own-bad.json" } }).stderr;
    })())],
    ["an own requirement listed as applicable is refused", /OWN\.1\.2: an own requirement is always part of the package/.test(run({ ...base, applicable: ["KONF.2.2", "OWN.1.2"], own }).stderr)],
  ]) {
    failed += !ok;
    console.log(`${ok ? "ok  " : "FAIL"} own requirements: ${name}${ok ? "" : ": " + a.stderr + v.stdout + s.stderr}`);
  }
}
// worksheet.mjs: the elementary threats of each requirement, last in the CSV.
{
  const { LIBRARY } = await import("../tools/bsi-library.mjs");
  const ws = (fmt) => spawnSync(process.execPath, ["worksheet.mjs", "control_layer/Grundschutz++/Grundschutz++-resolved_catalog.json",
    "--commit", LIBRARY.commit, "--practices", "REA", ...fmt], { encoding: "utf8" });
  const csv = ws(["--format", "csv"]);
  const [head, row] = csv.stdout.split("\n");
  const md = ws([]);
  const sum = ws(["--summary"]);
  for (const [name, ok] of [
    ["the CSV keeps its columns and adds threats last", csv.status === 0 && head.endsWith(',"statement","evidence","status","note","threats"'.replace(/"/g, "")) && /,"G 0\.\d+[^"]*"$/.test(row)],
    ["the Markdown row names them", md.status === 0 && / · threats G 0\.\d+/.test(md.stdout)],
    ["the summary counts each threat", sum.status === 0 && /## Elementary threat\n\n- G 0\.\d+: \d+/.test(sum.stdout)],
  ]) {
    failed += !ok;
    console.log(`${ok ? "ok  " : "FAIL"} worksheet: ${name}${ok ? "" : ": " + csv.stderr + head}`);
  }
}
// Partial coverage: a check that shows only part of a requirement says so in
// its finding, and the security plan keeps it -- unless another check shows
// the requirement in full.
{
  const { writeFileSync, readFileSync, mkdirSync } = await import("node:fs");
  mkdirSync(".schema-cache", { recursive: true });
  const cat = ["--catalog", "test/fixtures/recheck-catalog.json"];
  const res = (name, change) => {
    const run = JSON.parse(readFileSync("test/fixtures/results-run.json", "utf8"));
    change(run);
    writeFileSync(`.schema-cache/${name}-run.json`, JSON.stringify(run));
    const r = spawnSync(process.execPath, ["results.mjs", `.schema-cache/${name}-run.json`, ...cat], { encoding: "utf8" });
    if (r.status === 0) writeFileSync(`.schema-cache/${name}.json`, r.stdout);
    return r;
  };
  const part = res("partial", (r) => (r.partial = ["TEST.3.1.3", "DEV.4.3"]));
  const one = res("partial-one", (r) => (r.partial = ["TEST.3.1.3"]));
  const full = res("full", (r) => ((r.check = "full-check"), (r.requirements = ["DEV.4.3"])));
  const wrong = res("partial-wrong", (r) => (r.partial = ["DET.5.3"]));
  const findings = one.status === 0 ? JSON.parse(one.stdout)["assessment-results"].results[0].findings : [];
  const cov = (id) => findings.find((f) => f.target["target-id"] === id)?.props?.find((p) => p.name === "coverage")?.value;
  const v = spawnSync(process.execPath, ["validate.mjs", ".schema-cache/partial-one.json"], { encoding: "utf8" });
  const sys = JSON.parse(readFileSync("test/fixtures/ssp/system.json", "utf8"));
  sys.profile.file = "../test/fixtures/ssp/profile.json";
  sys.components = [];
  sys.reviews = undefined;
  sys.results = ["partial.json", "full.json"];
  writeFileSync(".schema-cache/ssp-partial.json", JSON.stringify(sys));
  const ssp = spawnSync(process.execPath, ["ssp.mjs", ".schema-cache/ssp-partial.json"], { encoding: "utf8" });
  const reqs = ssp.status === 0 ? Object.fromEntries(JSON.parse(ssp.stdout)["system-security-plan"]["control-implementation"]["implemented-requirements"].map((r) => [r["control-id"], r])) : {};
  const sspCov = (id) => reqs[id]?.props.find((p) => p.name === "assessment-coverage")?.value;
  const cases = [
    ["a partial requirement is marked in its finding, the others are not", one.status === 0 && part.status === 0 && v.status === 0 && cov("TEST.3.1.3") === "partial" && !cov("DEV.4.3")
      && /only part of this requirement/.test(findings.find((f) => f.target["target-id"] === "TEST.3.1.3").description)],
    ["partial names only requirements of the run", wrong.status === 1 && /partial DET\.5\.3: not one of/.test(wrong.stderr)],
    ["the plan keeps a partial pass partial", ssp.status === 0 && sspCov("TEST.3.1.3") === "partial"],
    ["another check showing it in full makes it full", ssp.status === 0 && reqs["DEV.4.3"] && !sspCov("DEV.4.3")],
  ];
  for (const [name, ok] of cases) {
    failed += !ok;
    console.log(`${ok ? "ok  " : "FAIL"} partial coverage: ${name}${ok ? "" : ": " + part.stderr + wrong.stderr + ssp.stderr + v.stdout}`);
  }
}
// coverage.mjs and period.mjs over the same kind of results: how far a
// measurement reaches through a mapping, and whether the runs covered a period.
{
  const { writeFileSync, readFileSync, mkdirSync } = await import("node:fs");
  mkdirSync(".schema-cache", { recursive: true });
  const cat = ["--catalog", "test/fixtures/recheck-catalog.json"];
  const res = (name, change) => {
    const run = JSON.parse(readFileSync("test/fixtures/results-run.json", "utf8"));
    change(run);
    writeFileSync(`.schema-cache/${name}-run.json`, JSON.stringify(run));
    const r = spawnSync(process.execPath, ["results.mjs", `.schema-cache/${name}-run.json`, ...cat], { encoding: "utf8" });
    writeFileSync(`.schema-cache/${name}.json`, r.stdout);
    return `.schema-cache/${name}.json`;
  };
  // TEST.3.1.3 satisfied but only in part, DEV.4.3 satisfied in full, DET.5.3 not measured.
  const ok = res("cov-ok", (r) => (r.partial = ["TEST.3.1.3"]));
  const bad = res("cov-bad", (r) => ((r.requirements = ["TEST.3.1.3"]), (r.subjects[0].satisfied = false)));
  const cov = (...files) => spawnSync(process.execPath, ["coverage.mjs", "--mapping-file", "test/fixtures/coverage-mapping.json", ...files, "--format", "csv"], { encoding: "utf8" });
  const state = (r) => Object.fromEntries(r.stdout.trim().split("\n").slice(1).map((l) => l.split(",").map((x) => x.replace(/^"|"$/g, ""))).map(([id, s]) => [id, s]));
  const a = state(cov(ok));
  const b = state(cov(bad));
  const md = spawnSync(process.execPath, ["coverage.mjs", "--mapping-file", "test/fixtures/coverage-mapping.json", ok], { encoding: "utf8" });
  // Three nightly runs with a four-day hole.
  const nights = ["2026-09-30", "2026-10-01", "2026-10-05"].map((d, i) =>
    res(`night-${i}`, (r) => ((r.start = `${d}T03:00:00Z`), (r.end = `${d}T03:04:00Z`), i === 1 && (r.subjects[0].satisfied = false))));
  const period = (...extra) => spawnSync(process.execPath, ["period.mjs", ...nights, "--from", "2026-09-30", "--to", "2026-10-05", ...extra], { encoding: "utf8" });
  const p = period("--every", "24h");
  const pc = period("--format", "csv");
  const row = (kind, key) => pc.stdout.split("\n").find((l) => l.startsWith(`"${kind}","${key}"`))?.split(",").map((x) => x.replace(/^"|"$/g, ""));
  const cases = [
    ["equivalent and fully measured, but the check is partial: partial", a["A.1"] === "partial"],
    ["intersects-with stays partial however well measured", a["A.2"] === "partial"],
    ["equivalent, measured in full and satisfied: satisfied", a["A.5"] === "satisfied"],
    ["nothing measured is not measured, never satisfied", a["A.3"] === "not measured"],
    ["what the mapping cannot reach is named: no mapping", a["A.4"] === "no mapping"],
    ["a measured failure makes its sources not satisfied", b["A.1"] === "not satisfied"],
    ["the report leads with the gaps", /\*\*Not measured: 1\*\*/.test(md.stdout) && /\*\*No mapping: 1\*\*/.test(md.stdout)],
    ["period: runs and failures per check", row("check", "protected-branches")?.slice(2, 4).join() === "3,1"],
    ["period: the longest gap, from run to run", row("check", "protected-branches")?.[7] === "96"],
    ["period: a gap longer than the cadence is named", p.status === 0 && /Gaps longer than the cadence: 1 check/.test(p.stdout) && /\*\*\(late\)\*\*/.test(p.stdout)],
    ["period: nothing in the period is an error", spawnSync(process.execPath, ["period.mjs", ...nights, "--from", "2027-01-01", "--to", "2027-01-02"], { encoding: "utf8" }).status === 1],
  ];
  for (const [name, good] of cases) {
    failed += !good;
    console.log(`${good ? "ok  " : "FAIL"} coverage/period: ${name}${good ? "" : ": " + JSON.stringify({ a, b }) + p.stderr + pc.stdout}`);
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
    ["what is left out is named with its reason, a paragraph or a whole article", !ctl("Art.1.3") && /Art\.1\.3: Verpflichtet die Kommission/.test(cat.metadata?.remarks)
      && !ctl("Art.3") && !cat.groups?.some((g) => g.id === "Art.3") && /Art\.3: Verpflichtet die Behörden/.test(cat.metadata?.remarks)],
    ["an article without numbered paragraphs is one control, its points below it",
      ctl("Art.2")?.parts[0].prose === "Die Einrichtungen verwenden Systeme, die" && ctl("Art.2.b")?.parts[0].prose === "resilient sind." && ctl("Art.2.b")?.title === "Art. 2 Buchst. b"],
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
  const art = spawnSync(process.execPath, ["mapping.mjs", "test/fixtures/mapping-source-article.json"], { encoding: "utf8" });
  const am = art.status === 0 ? JSON.parse(art.stdout)["mapping-collection"].mappings[0] : {};
  writeFileSync(".schema-cache/test-mapping-article.json", art.stdout);
  const byArticle = spawnSync(process.execPath, ["worksheet.mjs", "control_layer/Mindeststandard-TLS/Entwurf-Mindeststandard-TLS-catalog.json",
    "--mapping-file", ".schema-cache/test-mapping-article.json", "--commit", "367d775010abee641b258926bb482fcd05270059", "--sources", "Art.9", "--summary"], { encoding: "utf8" });
  const now = ws("Art.21.2.h");
  const then = ws("21.2.h");
  const count = (r) => r.stdout.match(/^(\d+) requirements$/m)?.[1];
  const mcases = [
    ["a mapping imports its source catalog with the catalog's SHA-256", m.status === 0 && mv.status === 0
      && imp.href === "../standards/nis2.json" && imp.sha256 === sha256(readFileSync("standards/nis2.json"))],
    ["its review sheet quotes the source's text", rv.status === 0 && /^Text: Konzepte und Verfahren für den Einsatz von Kryptografie/m.test(rv.stdout)],
    ["a source ID the catalog does not have is refused", unknown.status === 1 && /Art\.99\.1: neither a control nor an article of standards\/nis2\.json/.test(unknown.stderr)],
    ["an article stands for all its paragraphs, mapped and unmapped", art.status === 0
      && am.maps?.[0]?.sources.map((s) => s["id-ref"]).join() === "Art.9.1,Art.9.2,Art.9.3,Art.9.4"
      && am["source-gap-summary"]?.["unmapped-controls"][0]["with-ids"].join() === "Art.16.1,Art.16.2"],
    ["worksheet selects an article's paragraphs by the article", byArticle.status === 0 && /^1 requirements$/m.test(byArticle.stdout)],
    ["worksheet still takes the short ID of 1.0, with a note", now.status === 0 && count(now) === "1" && count(then) === "1"
      && /accepted until 2\.0/.test(then.stderr) && !/accepted until/.test(now.stderr)],
  ];
  for (const [name, ok] of mcases) {
    failed += !ok;
    console.log(`${ok ? "ok  " : "FAIL"} mapping from a catalog: ${name}${ok ? "" : ": " + m.stderr + mv.stdout + unknown.stderr + art.stderr + byArticle.stderr + now.stderr + then.stderr}`);
  }
}
// tools/eu-catalog.mjs on an annex: numbered headings are groups, points and
// a subsection's own words are controls, nothing is lost; mapping.mjs takes a
// heading at any depth as a source.
{
  const { writeFileSync, readFileSync, mkdirSync } = await import("node:fs");
  mkdirSync(".schema-cache", { recursive: true });
  const eu = (src, xhtml = "test/fixtures/eu-annex.xhtml") => spawnSync(process.execPath, ["tools/eu-catalog.mjs", src, "--file", xhtml], { encoding: "utf8" });
  const a = eu("test/fixtures/eu-annex-source.json");
  writeFileSync(".schema-cache/test-eu-annex.json", a.stdout);
  const v = spawnSync(process.execPath, ["validate.mjs", ".schema-cache/test-eu-annex.json"], { encoding: "utf8" });
  const cat = a.status === 0 ? JSON.parse(a.stdout).catalog : {};
  const ctl = (id) => [...everyControl(cat)].find((c) => c.id === id);
  // The same annex with a point under the wrong heading.
  const astray = readFileSync("test/fixtures/eu-annex.xhtml", "utf8").replace("<p class=\"oj-normal\">2.1.</p>", "<p class=\"oj-normal\">3.1.</p>");
  writeFileSync(".schema-cache/eu-annex-astray.xhtml", astray);
  const src = JSON.parse(readFileSync("test/fixtures/eu-annex-source.json", "utf8"));
  src.document.sha256 = sha256(Buffer.from(astray));
  writeFileSync(".schema-cache/eu-annex-astray.json", JSON.stringify(src));
  const wrong = eu(".schema-cache/eu-annex-astray.json", ".schema-cache/eu-annex-astray.xhtml");
  const m = spawnSync(process.execPath, ["mapping.mjs", "test/fixtures/mapping-source-annex.json"], { encoding: "utf8" });
  const mm = m.status === 0 ? JSON.parse(m.stdout)["mapping-collection"].mappings[0] : {};
  const ir = JSON.parse(readFileSync("standards/nis2-ir.json", "utf8")).catalog;
  const pointsOf11 = ir.groups.find((g) => g.id === "Nr.11").groups.flatMap((g) => g.controls.map((c) => c.id));
  const cases = [
    ["validates and is deterministic", a.status === 0 && v.status === 0 && a.stdout === eu("test/fixtures/eu-annex-source.json").stdout],
    ["a section is a group of subsections, a subsection a group of points",
      cat.groups?.[0]?.id === "Nr.1" && cat.groups[0].groups.map((g) => g.id).join() === "Nr.1.1,Nr.1.2,Nr.1.3" && ctl("Anh.1.1.1")?.title === "Anhang Nr. 1.1.1"],
    ["a point keeps its words and its lettered points", ctl("Anh.1.1.1")?.parts[0].prose === "Das Konzept muss" && ctl("Anh.1.1.1.b")?.parts[0].prose === "mitgeteilt werden."],
    ["words after a point stay with it, labelled",
      ctl("Anh.1.1.1")?.parts[0].parts?.[0]?.props[0].value === "Unterabsatz 2" && /auch Behörden/.test(ctl("Anh.1.1.1").parts[0].parts[0].prose)],
    ["a subsection with words of its own is one control under its number", ctl("Anh.1.2")?.parts[0].prose === "Die Einrichtungen führen ein Verzeichnis, das Folgendes umfasst:"
      && ctl("Anh.1.2.b")?.parts[0].prose === "eine Liste der Dienste." && ctl("Anh.1.3")?.parts[0].prose === "Die Einrichtungen regeln die Rückgabe von Werten."],
    ["a section without subsections holds its points", cat.groups?.[1]?.id === "Nr.2" && cat.groups[1].controls?.[0]?.id === "Anh.2.1" && !cat.groups[1].groups],
    ["a point under the wrong heading is refused", wrong.status === 1 && /point 3\.1 outside Nr\.2/.test(wrong.stderr)],
    ["the committed NIS2 Implementing Regulation catalog has its 13 sections", ir.groups.length === 13 && ir.groups.every((g, i) => g.id === `Nr.${i + 1}`)],
    ["a mapping source that is a section stands for every point of its subsections", m.status === 0
      && mm.maps?.[0]?.sources.map((s) => s["id-ref"]).join() === pointsOf11.join() && pointsOf11.length > 0
      && mm["source-gap-summary"]?.["unmapped-controls"][0]["with-ids"].join() === "Anh.12.5"],
  ];
  for (const [name, ok] of cases) {
    failed += !ok;
    console.log(`${ok ? "ok  " : "FAIL"} eu-catalog annex: ${name}${ok ? "" : ": " + a.stderr + v.stdout + wrong.stderr + m.stderr}`);
  }
}
// tools/enisa-iso.mjs: ENISA's step to ISO, read by its rules from the pinned
// table, and the mapping source held to it.
{
  const { writeFileSync, readFileSync, mkdirSync } = await import("node:fs");
  mkdirSync(".schema-cache", { recursive: true });
  const run = (src, table = "test/fixtures/enisa-table.xlsx", ...more) =>
    spawnSync(process.execPath, ["tools/enisa-iso.mjs", src, "--file", table, ...more], { encoding: "utf8" });
  const src = JSON.parse(readFileSync("test/fixtures/enisa-source.json", "utf8"));
  const variant = (name, change) => {
    const s = structuredClone(src);
    change(s);
    writeFileSync(`.schema-cache/${name}`, JSON.stringify(s, null, 2) + "\n");
    return `.schema-cache/${name}`;
  };
  const same = run("test/fixtures/enisa-source.json");
  const differs = run(variant("enisa-differs.json", (s) => (s.maps[1].via.iso27001 = ["5.3"])));
  const untold = run(variant("enisa-untold.json", (s) => (s.maps[0].remarks = "Policy.")));
  const pinned = run("test/fixtures/enisa-source.json", "test/fixtures/enisa-table-old-iso.xlsx");
  const oldIso = run(variant("enisa-old-iso.json", (s) => (s["iso-step"].sha256 = sha256(readFileSync("test/fixtures/enisa-table-old-iso.xlsx")))), "test/fixtures/enisa-table-old-iso.xlsx");
  const blank = variant("enisa-blank.json", (s) => s.maps.forEach((x) => delete x.via));
  const wrote = run(blank, undefined, "--write");
  const written = JSON.parse(readFileSync(blank, "utf8")).maps;
  const cases = [
    ["a mapping source that follows the table passes", same.status === 0 && /all 3 points/.test(same.stdout)],
    ["a step to ISO other than ENISA's is reported", differs.status === 1 && /Nr\.1\.2: via\.iso27001 is \[5\.3\], ENISA 1\.2 says \[5\.3, 5\.4\]/.test(differs.stderr)],
    ["a clause ENISA names must be in the remarks", untold.status === 1 && /Nr\.1\.1: ENISA names ISO clause\(s\) 5\.2/.test(untold.stderr)],
    ["another table than the pinned one is refused", pinned.status === 1 && /not the pinned one/.test(pinned.stderr)],
    ["an entry that is no Annex A control of 2022 is refused", oldIso.status === 1 && /A\.9\.2 is not an Annex A control/.test(oldIso.stderr)],
    ["--write reads ENISA's spelling: a Greek alpha, a missing dot, a space", wrote.status === 0
      && written[0].via?.iso27001.join() === "5.1,5.36" && written[1].via?.iso27001.join() === "5.3,5.4" && !written[2].via?.iso27001],
  ];
  for (const [name, ok] of cases) {
    failed += !ok;
    console.log(`${ok ? "ok  " : "FAIL"} enisa-iso: ${name}${ok ? "" : ": " + same.stderr + differs.stderr + untold.stderr + pinned.stderr + oldIso.stderr + wrote.stderr}`);
  }
}
// tools/id-catalog.mjs: the IDs of a standard whose text may not be copied
// (SOC 2), each with an own title and a statement that only points at the text.
{
  const { writeFileSync, readFileSync, mkdirSync } = await import("node:fs");
  mkdirSync(".schema-cache", { recursive: true });
  const idc = (src) => spawnSync(process.execPath, ["tools/id-catalog.mjs", src], { encoding: "utf8" });
  const a = idc("standards/src/soc2.json");
  writeFileSync(".schema-cache/test-id-catalog.json", a.stdout);
  const v = spawnSync(process.execPath, ["validate.mjs", ".schema-cache/test-id-catalog.json"], { encoding: "utf8" });
  const src = JSON.parse(readFileSync("standards/src/soc2.json", "utf8"));
  const variant = (name, change) => {
    const s = structuredClone(src);
    change(s);
    writeFileSync(`.schema-cache/${name}`, JSON.stringify(s));
    return idc(`.schema-cache/${name}`);
  };
  const miscounted = variant("id-miscounted.json", (s) => (s.count = 60));
  const twice = variant("id-twice.json", (s) => s.criteria[0].groups[0].controls.push(["CC1.1", "again"]));
  const astray = variant("id-astray.json", (s) => s.criteria[0].groups[0].controls.push(["CC2.9", "astray"]));
  const cat = a.status === 0 ? JSON.parse(a.stdout).catalog : {};
  const all = [...everyControl(cat)];
  const committed = readFileSync("standards/soc2.json", "utf8");
  const cases = [
    ["validates, is deterministic and is what is committed", a.status === 0 && v.status === 0 && a.stdout === idc("standards/src/soc2.json").stdout && a.stdout === committed],
    ["61 criteria, 33 of them common criteria", all.length === 61 && all.filter((c) => c.id.startsWith("CC")).length === 33],
    ["a statement says where the text is, and is no text", all.every((c) => c.parts[0].prose.startsWith(`The text of ${c.id} is not reproduced here`))],
    ["a count other than the source's is refused", miscounted.status === 1 && /61 criteria, but the source has 60/.test(miscounted.stderr)],
    ["an ID twice is refused", twice.status === 1 && /CC1\.1 occurs twice/.test(twice.stderr)],
    ["a criterion outside its series is refused", astray.status === 1 && /CC2\.9: not in series CC1/.test(astray.stderr)],
  ];
  for (const [name, ok] of cases) {
    failed += !ok;
    console.log(`${ok ? "ok  " : "FAIL"} id-catalog: ${name}${ok ? "" : ": " + a.stderr + v.stdout + miscounted.stderr + twice.stderr + astray.stderr}`);
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
// BSI-Standard 300-1, 4.3 and 4.4: who checked, when, who answers for an
// action, who ran a measurement.
{
  const { writeFileSync, readFileSync } = await import("node:fs");
  const prop = (x, name) => (x?.props ?? []).find((q) => q.name === name)?.value;
  // results: performed_by becomes a prop of the result; an empty one is refused.
  const run = JSON.parse(readFileSync("test/fixtures/results-run.json", "utf8"));
  const gen = (r) => {
    writeFileSync(".schema-cache/run-performed.json", JSON.stringify(r));
    return spawnSync(process.execPath, ["results.mjs", ".schema-cache/run-performed.json", "--catalog", "test/fixtures/recheck-catalog.json"], { encoding: "utf8" });
  };
  const res = gen({ ...run, plan: { href: "assessment-plan.json" }, performed_by: "scheduler@example.org" });
  const rr = res.status === 0 ? JSON.parse(res.stdout)["assessment-results"].results[0] : null;
  // ssp: the file's reviewer, a requirement's own reviewer and date.
  const sys = JSON.parse(readFileSync("test/fixtures/ssp/system.json", "utf8"));
  writeFileSync(".schema-cache/ssp-by.json", JSON.stringify({ ...sys, profile: { ...sys.profile, file: "../test/fixtures/ssp/profile.json" },
    components: ["ssp-component.json"], results: ["ssp-results.json"], reviews: "ssp-by-reviews.json" }));
  const reviews = (r) => {
    writeFileSync(".schema-cache/ssp-by-reviews.json", JSON.stringify(r));
    return spawnSync(process.execPath, ["ssp.mjs", ".schema-cache/ssp-by.json"], { encoding: "utf8" });
  };
  const s = reviews({ date: "2026-10-27", source: "Fixture review", by: "J. Doe", requirements: [
    { id: "DET.5.3", state: "partial", note: "rollout", nonfulfilment: "temporary" },
    { id: "DEV.4.5", state: "planned", note: "x", date: "2026-10-20", by: "A. Roe", nonfulfilment: "temporary", approved: { by: "Management", date: "2026-10-21" } },
  ] });
  const reqs = s.status === 0 ? Object.fromEntries(JSON.parse(s.stdout)["system-security-plan"]["control-implementation"]["implemented-requirements"].map((r) => [r["control-id"], r])) : {};
  writeFileSync(".schema-cache/test-ssp-by.json", s.stdout);
  const sv = spawnSync(process.execPath, ["validate.mjs", ".schema-cache/test-ssp-by.json"], { encoding: "utf8" });
  const anon = reviews({ date: "2026-10-27", source: "Fixture review", requirements: [{ id: "DET.5.3", state: "partial", note: "x" }] });
  // poam: an action's owner becomes the remediation's responsible.
  writeFileSync(".schema-cache/actions-owner.json", JSON.stringify({ source: "Fixture register", items: [
    { id: "I-1", title: "Scan every image", requirements: ["DET.5.3"], due: "2026-10-31", owner: "J. Doe" },
    { id: "I-2", title: "Update dependencies", requirements: ["DEV.4.5"], due: "2026-11-30" },
  ] }));
  writeFileSync(".schema-cache/poam-owner.json", JSON.stringify({ id: "owner-poam", title: "Fixture POA&M", version: "1", "last-modified": "2026-10-27T00:00:00Z",
    ssp: { file: "test-ssp-by.json", href: "security-plan.json" }, results: ["ssp-results.json"], actions: "actions-owner.json" }));
  const po = spawnSync(process.execPath, ["poam.mjs", ".schema-cache/poam-owner.json"], { encoding: "utf8" });
  writeFileSync(".schema-cache/test-poam-owner.json", po.stdout);
  const pv = spawnSync(process.execPath, ["validate.mjs", ".schema-cache/test-poam-owner.json"], { encoding: "utf8" });
  const pm = po.status === 0 ? JSON.parse(po.stdout)["plan-of-action-and-milestones"] : {};
  const remediation = (id) => (pm.risks ?? []).flatMap((r) => r.remediations ?? []).find((x) => x.title.startsWith(id));
  for (const [name, ok] of [
    ["results: performed_by becomes the result's performed-by", res.status === 0 && prop(rr, "performed-by") === "scheduler@example.org"],
    ["results: an empty performed_by is refused", gen({ ...run, plan: { href: "assessment-plan.json" }, performed_by: " " }).status === 1],
    ["ssp: the file's reviewer and date hold where a requirement names none", s.status === 0 && sv.status === 0
      && prop(reqs["DET.5.3"], "reviewed") === "2026-10-27" && prop(reqs["DET.5.3"], "reviewed-by") === "J. Doe"],
    ["ssp: a requirement's own reviewer and date win", prop(reqs["DEV.4.5"], "reviewed") === "2026-10-20" && prop(reqs["DEV.4.5"], "reviewed-by") === "A. Roe"
      && /Reviewed 2026-10-20 by A\. Roe/.test(reqs["DEV.4.5"]["by-components"].at(-1)["implementation-status"].remarks)],
    ["ssp: a temporary one without the leadership's approval is counted", /1 temporary without the leadership's approval/.test(s.stderr)],
    ["ssp: reviews that name no one are counted", /1 reviews name no person who checked/.test(anon.stderr) && !/name no person/.test(s.stderr)],
    ["ssp: a review date that is not YYYY-MM-DD is refused", reviews({ date: "2026-10-27", source: "x", requirements: [{ id: "DET.5.3", state: "partial", date: "27.10.2026" }] }).status === 1],
    ["poam: an action's owner is the remediation's responsible, and validates", po.status === 0 && pv.status === 0
      && prop(remediation("I-1"), "responsible") === "J. Doe" && !prop(remediation("I-2"), "responsible")],
    ["poam: actions without an owner are counted", /1 actions name no one responsible/.test(po.stderr)],
  ]) {
    failed += !ok;
    console.log(`${ok ? "ok  " : "FAIL"} persons: ${name}${ok ? "" : ": " + res.stderr + s.stderr + sv.stdout + po.stderr + pv.stdout}`);
  }
}
// package.mjs: the package of BSI-Standard 300-1, 3.4, from processes and assets.
{
  const { writeFileSync } = await import("node:fs");
  const fx = ["--catalog", "test/fixtures/package/catalog.json", "--categories", "test/fixtures/package/categories.csv"];
  const base = { title: "Fixture package", version: "1", "last-modified": "2026-10-27T00:00:00Z",
    catalog: { path: "control_layer/Grundschutz++/Grundschutz++-resolved_catalog.json", commit: "160c177db6c84d3c621fff614559943b1de8c600" },
    processes: [
      { id: "GP-1", name: "Hosting", owner: "Ops", description: "Sites are served.", protection: { confidentiality: "normal", integrity: "hoch", availability: "normal" } },
      { id: "GP-2", name: "Office", owner: "Office", description: "Invoices.", protection: { confidentiality: "normal", integrity: "normal", availability: "normal" } },
    ],
    assets: [
      { id: "A-1", name: "Web server", categories: ["Webserver"], processes: ["GP-1"] },
      { id: "A-2", name: "Staff", categories: ["Mitarbeitende"], processes: ["GP-1", "GP-2"] },
    ] };
  const run = (p, extra = []) => {
    writeFileSync(".schema-cache/package.json", JSON.stringify(p));
    return spawnSync(process.execPath, ["package.mjs", ".schema-cache/package.json", ...fx, ...extra], { encoding: "utf8" });
  };
  const a = run(base);
  const t = a.status === 0 ? JSON.parse(a.stdout) : { applicable: [] };
  const has = (x, id) => x.applicable.includes(id);
  const mobile = run({ ...base, assets: [...base.assets, { id: "A-3", name: "Notebook", categories: ["Mobile Endgeräte"], processes: ["GP-2"] }] });
  const tm = mobile.status === 0 ? JSON.parse(mobile.stdout) : { applicable: [] };
  const adopted = run({ ...base, adopt: ["KONF.3.1"], "not-applicable": [{ id: "ASST.1.1", reason: "x" }, { id: "KONF.4.1", reason: "y" }] });
  const ta = adopted.status === 0 ? JSON.parse(adopted.stdout) : { applicable: [] };
  const rep = run(base, ["--report"]);
  for (const [name, ok] of [
    ["the method and every requirement without a category are in", a.status === 0 && has(t, "GC.1.1") && has(t, "ASST.1.1")],
    ["an asset holds the categories above its own", has(t, "KONF.1.1")],
    ["a requirement of a category no asset holds is out", !has(t, "KONF.4.1")],
    ["several categories need all of them", !has(t, "KONF.2.1") && has(tm, "KONF.2.1")],
    ["erhöht is a candidate for a process of high protection need, not in the package", !has(t, "KONF.3.1")
      && /\| KONF\.3\.1 \| GP-1 \|/.test(rep.stdout) && /GP-1 has a high protection need: it needs a risk analysis/.test(a.stderr)],
    ["adopt takes a candidate over; not-applicable leaves the package with its reason", has(ta, "KONF.3.1") && !has(ta, "ASST.1.1")
      && ta["not-applicable"].some((e) => e.id === "ASST.1.1") && /not-applicable KONF\.4\.1: not in the package anyway/.test(adopted.stderr)],
    ["the same input gives the same bytes", a.stdout === run(base).stdout],
    ["an unknown category is refused, with the known ones", /"Server" is not a target-object category; known: .*Webserver/.test(run({ ...base, assets: [{ ...base.assets[0], categories: ["Server"] }] }).stderr)],
    ["an asset of a process not listed is refused", /process GP-9 is not listed/.test(run({ ...base, assets: [{ ...base.assets[0], processes: ["GP-9"] }] }).stderr)],
    ["a process without its responsible is refused (Annex 2)", /process GP-1: missing "owner"/.test(run({ ...base, processes: [{ ...base.processes[0], owner: "" }, base.processes[1]] }).stderr)],
    ["a protection need other than normal or hoch is refused", run({ ...base, processes: [{ ...base.processes[0], protection: { confidentiality: "sehr hoch", integrity: "normal", availability: "normal" } }, base.processes[1]] }).status === 1],
    ["another catalog than the Anwenderkatalog is refused", run({ ...base, catalog: { ...base.catalog, path: "control_layer/WLAN/WLAN-resolved_catalog.json" } }).status === 1],
  ]) {
    failed += !ok;
    console.log(`${ok ? "ok  " : "FAIL"} package: ${name}${ok ? "" : ": " + a.stderr + mobile.stderr + adopted.stderr}`);
  }
}
process.exit(failed ? 1 : 0);
