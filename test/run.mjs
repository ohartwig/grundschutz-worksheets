// Tests for validate.mjs: valid fixtures pass, broken ones fail, an unknown
// OSCAL version is a setup error rather than a pass. Run with `npm test`.
import { spawnSync } from "node:child_process";

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
    ["the claim's statement and evidence stay with a reviewed requirement",
      reqs2["DEV.4.3"]?.["by-components"].some((b) => (b.links ?? []).length)],
  ];
  for (const [name, ok] of cases2) {
    failed += !ok;
    console.log(`${ok ? "ok  " : "FAIL"} ssp: ${name}${b.status ? ": " + b.stderr : ""}`);
  }
}
process.exit(failed ? 1 : 0);
