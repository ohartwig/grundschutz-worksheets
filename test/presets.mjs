// Every preset at its own commit yields the requirement and orphan counts it
// expects. Fetches from the BSI library; run with `npm run test:presets`.
// A changed count is not an error to silence: raise the commit and the
// expectation together, and read the diff.
import { readdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

let failed = 0;
for (const f of readdirSync("presets").filter((f) => f.endsWith(".json")).sort()) {
  const p = JSON.parse(readFileSync(`presets/${f}`, "utf8"));
  const r = spawnSync(process.execPath, ["worksheet.mjs", "--preset", p.id, "--summary"], { encoding: "utf8" });
  const requirements = Number(r.stdout.match(/^(\d+) requirements$/m)?.[1]);
  const orphans = Number(r.stderr.match(/not in the catalog \((\d+)\)/)?.[1] ?? 0);
  const ok = r.status === 0 && p.id === f.slice(0, -5) && requirements === p.expect.requirements && orphans === p.expect.orphans;
  failed += !ok;
  console.log(`${ok ? "ok  " : "FAIL"} ${p.id}: ${requirements} requirements, ${orphans} orphans; want ${p.expect.requirements}, ${p.expect.orphans}`);
  if (!ok && r.status !== 0) console.log(r.stderr);
}
process.exit(failed ? 1 : 0);
