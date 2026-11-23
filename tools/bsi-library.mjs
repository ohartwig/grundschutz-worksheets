#!/usr/bin/env node
// The BSI library commit this repository is tested at: every preset, the
// own mappings' catalog and the CI checks read it from here.
//
// Raised deliberately, never on its own. pinup announces a new commit of the
// library as a merge request and does not merge it; that merge request is the
// signal to re-run the checks against the difference. test:presets turns it
// red wherever a count moved or an own mapping was made at the old commit, and
// the pin moves together with the new counts and the regenerated mappings
// (README, "Raising the library commit").
//
//   node tools/bsi-library.mjs                    # prints the commit, for CI and scripts
//   node tools/bsi-library.mjs --mappings-read-at # the commit the mappings are read at

import { fileURLToPath } from "node:url";

export const LIBRARY = {
  repository: "BSI-Bund/Stand-der-Technik-Bibliothek",
  // renovate: datasource=git-refs depName=BSI-Bund/Stand-der-Technik-Bibliothek packageName=https://github.com/BSI-Bund/Stand-der-Technik-Bibliothek branch=main
  commit: "dc44ea4fb5815ef84b941a8b5bcc4eaf363daf35",
  // The commit the library's own mappings (ISO 27001, IT-Grundschutz 2023)
  // are read at. They name requirements by ID and were last published in
  // July 2026; the catalog has renumbered since (ASST.2, DET.3, DET.5 at
  // dc44ea4), so read against the pin they would name other requirements.
  // Their targets are carried from this commit to the pin by the
  // requirements' alt-identifier (lib/oscal.mjs, carryMapping). Moved by
  // hand, to the commit that republishes a mapping: the tools refuse to run
  // once a mapping differs from the file it was here.
  mappingsReadAt: "160c177db6c84d3c621fff614559943b1de8c600",
};

if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(process.argv.includes("--mappings-read-at") ? LIBRARY.mappingsReadAt : LIBRARY.commit);
