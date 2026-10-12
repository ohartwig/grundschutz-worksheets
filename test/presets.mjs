// Every preset at its own commit yields the requirement and orphan counts it
// expects. Fetches from the BSI library; run with `npm run test:presets`.
// A changed count is not an error to silence: raise the commit and the
// expectation together, and read the diff.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

let failed = 0;
for (const f of readdirSync("presets").filter((f) => f.endsWith(".json")).sort()) {
  const p = JSON.parse(readFileSync(`presets/${f}`, "utf8"));
  // A catalog that is not in the library is not in this repository either;
  // the check runs where the file is (PRESET_FILES, default catalogs/).
  const extra = [];
  if (p["catalog-file"]) {
    const file = `${process.env.PRESET_FILES ?? "catalogs"}/${p["catalog-file"].name}`;
    if (!existsSync(file)) {
      console.log(`skip ${p.id}: ${file} not present (no licence stated, so not in this repository; see the preset's source)`);
      continue;
    }
    extra.push("--catalog-file", file);
  }
  const r = spawnSync(process.execPath, ["worksheet.mjs", "--preset", p.id, "--summary", ...extra], { encoding: "utf8" });
  const requirements = Number(r.stdout.match(/^(\d+) requirements$/m)?.[1]);
  const orphans = Number(r.stderr.match(/not in the catalog \((\d+)\)/)?.[1] ?? 0);
  const ok = r.status === 0 && p.id === f.slice(0, -5) && requirements === p.expect.requirements && orphans === p.expect.orphans;
  failed += !ok;
  console.log(`${ok ? "ok  " : "FAIL"} ${p.id}: ${requirements} requirements, ${orphans} orphans; want ${p.expect.requirements}, ${p.expect.orphans}`);
  if (!ok && r.status !== 0) console.log(r.stderr);
}
// The catalogs of EU acts are generated from the Journal's text, the ID
// skeletons (SOC 2) from their source file: the committed file must be what
// tools/eu-catalog.mjs or tools/id-catalog.mjs makes of it today.
for (const f of readdirSync("standards/src").filter((f) => f.endsWith(".json")).sort()) {
  const out = `standards/${f}`;
  const tool = JSON.parse(readFileSync(`standards/src/${f}`, "utf8")).criteria ? "tools/id-catalog.mjs" : "tools/eu-catalog.mjs";
  const r = spawnSync(process.execPath, [tool, `standards/src/${f}`], { encoding: "utf8" });
  const ok = r.status === 0 && r.stdout === readFileSync(out, "utf8");
  failed += !ok;
  console.log(`${ok ? "ok  " : "FAIL"} ${out} is generated from standards/src/${f}${ok ? "" : `: run node ${tool} and commit the result. ` + r.stderr}`);
}
// The mappings of this repository are generated: the committed file must be
// what mapping.mjs makes of its source today.
for (const f of readdirSync("mappings/src").filter((f) => f.endsWith(".json")).sort()) {
  const out = `mappings/${f.slice(0, -5)}-to-gspp.json`;
  const r = spawnSync(process.execPath, ["mapping.mjs", `mappings/src/${f}`], { encoding: "utf8" });
  const ok = r.status === 0 && r.stdout === readFileSync(out, "utf8");
  failed += !ok;
  console.log(`${ok ? "ok  " : "FAIL"} ${out} is generated from mappings/src/${f}${ok ? "" : ": run node mapping.mjs and commit the result. " + r.stderr}`);
  const sheet = `mappings/review/${f.slice(0, -5)}.md`;
  const rv = spawnSync(process.execPath, ["mapping.mjs", `mappings/src/${f}`, "--review"], { encoding: "utf8" });
  const same = rv.status === 0 && rv.stdout === readFileSync(sheet, "utf8");
  failed += !same;
  console.log(`${same ? "ok  " : "FAIL"} ${sheet} is generated from mappings/src/${f}${same ? "" : ": run node mapping.mjs --review and commit the result. " + rv.stderr}`);
}
process.exit(failed ? 1 : 0);
