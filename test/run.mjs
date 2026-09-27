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
process.exit(failed ? 1 : 0);
