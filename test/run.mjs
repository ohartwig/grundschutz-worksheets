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
process.exit(failed ? 1 : 0);
