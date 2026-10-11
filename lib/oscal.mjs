// What every generator here needs, once: where the BSI library is, how a path
// in it becomes a pinned URL, how to visit every requirement of a catalog, and
// how to derive a UUID from content. No dependencies, like the scripts.

import { createHash } from "node:crypto";

export const REPO = "https://raw.githubusercontent.com/BSI-Bund/Stand-der-Technik-Bibliothek";
export const NS = "https://github.com/ohartwig/grundschutz-worksheets/ns";

// A path in the library is plain segments. An empty one, "." or ".." would
// resolve above the pinned commit and fetch another repository or a branch,
// so such a path has no URL: null, and the caller says why it stops.
export const libraryUrl = (commit, path) => {
  const segs = String(path ?? "").split("/");
  if (segs.some((x) => !x || x === "." || x === "..")) return null;
  return `${REPO}/${commit}/${segs.map(encodeURIComponent).join("/")}`;
};

// Every control of a catalog, however deeply nested: the top-level controls
// first, then the groups, each depth-first.
function* inControls(controls) {
  for (const c of controls ?? []) {
    yield c;
    yield* inControls(c.controls);
  }
}
function* inGroups(groups) {
  for (const g of groups ?? []) {
    yield* inControls(g.controls);
    yield* inGroups(g.groups);
  }
}
export function* everyControl(catalog) {
  yield* inControls(catalog?.controls);
  yield* inGroups(catalog?.groups);
}

export const byId = (a, b) => a.localeCompare(b, "en", { numeric: true });

// Deterministic UUIDs (v5-style) under a namespace of each generator's own, so
// the same input gives the same bytes.
export const uuid5 = (namespace) => (name) => {
  const ns = Buffer.from(namespace.replace(/-/g, ""), "hex");
  const h = createHash("sha1").update(Buffer.concat([ns, Buffer.from(name, "utf8")])).digest();
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
};
