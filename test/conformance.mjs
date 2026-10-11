// Writes one document per OSCAL model into .schema-cache/conformance/, chained
// so that every import resolves: catalog (the BSI library at a commit) ->
// profile -> security plan -> assessment plan -> assessment results and
// POA&M. Each import goes through a back-matter resource with the SHA-256 of
// the file next to it. A validator that follows imports -- oscal-cli 3 does --
// then checks the whole chain, not each file on its own.
//
// Run after `npm test`, which writes the component and results inputs into
// .schema-cache. CI runs oscal-cli over the directory.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const dir = resolve(".schema-cache/conformance");
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
const json = (p) => JSON.parse(readFileSync(p, "utf8"));
const put = (name, data) => writeFileSync(`${dir}/${name}`, typeof data === "string" ? data : JSON.stringify(data, null, 2));
const gen = (name, script, ...args) => {
  const r = spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
  if (r.status !== 0) {
    console.error(`${script} ${args.join(" ")}:\n${r.stderr}`);
    process.exit(1);
  }
  put(name, r.stdout);
  console.log(`${dir}/${name}`);
};
const abs = (p) => resolve(p);

// The profile: the requirements of the plan fixture, from the real catalog, plus
// one that does not apply.
const ids = json("test/fixtures/ssp/profile.json").profile.imports.flatMap((i) => i["include-controls"].flatMap((x) => x["with-ids"]));
put("tailoring.json", {
  title: "Conformance profile",
  version: "1",
  "last-modified": "2026-10-11T00:00:00Z",
  catalog: { path: "control_layer/Grundschutz++/Grundschutz++-resolved_catalog.json", commit: "367d775010abee641b258926bb482fcd05270059" },
  applicable: ids,
  "not-applicable": [{ id: "ARCH.6.1", reason: "no own WAN links" }],
});
gen("profile.json", "profile.mjs", `${dir}/tailoring.json`);

const sys = json("test/fixtures/ssp/system.json");
put("system.json", {
  ...sys,
  profile: { file: "profile.json", href: "profile.json" },
  components: sys.components.map((c) => abs(`test/fixtures/ssp/${c}`)),
  results: sys.results.map((c) => abs(`test/fixtures/ssp/${c}`)),
  reviews: abs(`test/fixtures/ssp/${sys.reviews}`),
});
gen("security-plan.json", "ssp.mjs", `${dir}/system.json`);

put("checks.json", { ...json("test/fixtures/checks.json"), ssp: { href: "security-plan.json", file: "security-plan.json" } });
gen("assessment-plan.json", "assessment-plan.mjs", `${dir}/checks.json`, "--catalog", "test/fixtures/recheck-catalog.json");

put("run.json", { ...json("test/fixtures/results-run.json"), plan: { href: "assessment-plan.json", file: "assessment-plan.json" } });
gen("assessment-results.json", "results.mjs", `${dir}/run.json`, "--catalog", "test/fixtures/recheck-catalog.json");

const poam = json(".schema-cache/poam-in.json");
put("poam-in.json", {
  ...poam,
  ssp: { file: "security-plan.json", href: "security-plan.json" },
  results: poam.results.map((r) => abs(`.schema-cache/${r}`)),
  ...(poam.actions && { actions: abs(`.schema-cache/${poam.actions}`) }),
});
gen("poam.json", "poam.mjs", `${dir}/poam-in.json`);

gen("component-definition.json", "component.mjs", "test/fixtures/component-source.json");
for (const f of ["tailoring.json", "system.json", "checks.json", "run.json", "poam-in.json"]) rmSync(`${dir}/${f}`);
