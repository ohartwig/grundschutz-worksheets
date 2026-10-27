// Writes one document per OSCAL model into .schema-cache/conformance/, chained
// so that every import resolves: catalog (the BSI library at a commit) ->
// profile -> security plan -> assessment plan -> assessment results and
// POA&M. Each import goes through a back-matter resource with the SHA-256 of
// the file next to it. A validator that follows imports -- oscal-cli 3 does --
// then checks the whole chain, not each file on its own.
//
// The catalogs of EU acts this repository generates (standards/) are checked
// alongside, on their own: they import nothing.
//
// Run after `npm test`, which writes the component and results inputs into
// .schema-cache. CI runs oscal-cli over the directory.
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
// one that does not apply, and the own requirements (BSI-Standard 300-1,
// 3.4.3) as a second import, next to it so that the import resolves.
const ids = json("test/fixtures/ssp/profile.json").profile.imports.flatMap((i) => i["include-controls"].flatMap((x) => x["with-ids"]));
put("tailoring.json", {
  title: "Conformance profile",
  version: "1",
  "last-modified": "2026-10-11T00:00:00Z",
  catalog: { path: "control_layer/Grundschutz++/Grundschutz++-resolved_catalog.json", commit: "367d775010abee641b258926bb482fcd05270059" },
  applicable: ids,
  "not-applicable": [{ id: "ARCH.6.1", reason: "no own WAN links" }],
  own: { file: abs("test/fixtures/own-requirements.json"), href: "own-requirements.json" },
});
put("own-requirements.json", readFileSync("test/fixtures/own-requirements.json", "utf8"));
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
  risks: "risks.json",
});
// A risk register (Annex 3): one accepted for a while, one without treatment.
put("risks.json", {
  source: "Risk register",
  items: [
    { id: "R-030", object: "Shop", description: "Outage during the sale", goals: ["availability"], level: "medium", owner: "A. Roe",
      treatment: "accept", accepted: { by: "Management", date: "2026-10-01", until: "2027-03-31" }, reviewed: "2026-10-01" },
    { id: "R-031", object: "Office", description: "Theft of a laptop", goals: ["confidentiality"], level: "low", owner: "A. Roe", threats: ["G 0.16"] },
  ],
});
gen("poam.json", "poam.mjs", `${dir}/poam-in.json`);

gen("component-definition.json", "component.mjs", "test/fixtures/component-source.json");
for (const f of readdirSync("standards").filter((f) => f.endsWith(".json"))) {
  put(`catalog-${f}`, readFileSync(`standards/${f}`, "utf8"));
  console.log(`${dir}/catalog-${f}`);
}
for (const f of ["tailoring.json", "system.json", "checks.json", "run.json", "poam-in.json", "risks.json"]) rmSync(`${dir}/${f}`);
