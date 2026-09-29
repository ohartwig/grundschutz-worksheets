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
process.exit(failed ? 1 : 0);
