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

export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

// A document this one imports, referenced the way OSCAL provides for: the
// import names "#<uuid>" of a back-matter resource, and the resource carries
// the link -- with the SHA-256 of the bytes this document was generated from,
// where they are at hand. A reader can then check that the catalog, profile or
// plan it fetches is the one this was made against, not merely one at the
// same address.
export const importResource = (uuid, title, href, bytes) => ({
  uuid,
  title,
  rlinks: [
    {
      href,
      "media-type": "application/json",
      ...(bytes && { hashes: [{ algorithm: "SHA-256", value: sha256(bytes) }] }),
    },
  ],
});

// The other direction: what an import's href stands for. A "#<uuid>" is looked
// up in the document's back-matter; anything else is the address itself.
export const resolveImport = (doc, href) => {
  if (!href?.startsWith("#")) return { href, sha256: "" };
  const link = doc?.["back-matter"]?.resources?.find((x) => x.uuid === href.slice(1))?.rlinks?.[0];
  return { href: link?.href, sha256: link?.hashes?.find((h) => h.algorithm === "SHA-256")?.value ?? "" };
};
