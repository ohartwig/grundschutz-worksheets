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
//   node tools/bsi-library.mjs     # prints the commit, for CI and scripts

import { fileURLToPath } from "node:url";

export const LIBRARY = {
  repository: "BSI-Bund/Stand-der-Technik-Bibliothek",
  // renovate: datasource=git-refs depName=BSI-Bund/Stand-der-Technik-Bibliothek packageName=https://github.com/BSI-Bund/Stand-der-Technik-Bibliothek branch=main
  commit: "160c177db6c84d3c621fff614559943b1de8c600",
};

if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(LIBRARY.commit);
