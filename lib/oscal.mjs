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

// A copy of an imported document, carried along as base64: for one that is
// not published anywhere a reader could fetch it, such as the own
// requirements of a package (profile.mjs). A resource of its own, next to the
// import's, which names it by prop `copy-of`: in the import's resource itself
// a validator that follows imports (oscal-cli) reads the copy as the document
// itself and takes it for an import cycle.
export const copyResource = (uuid, of, title, filename, bytes) => ({
  uuid,
  title,
  props: [{ name: "copy-of", ns: NS, value: of }],
  base64: { filename, "media-type": "application/json", value: Buffer.from(bytes).toString("base64") },
});

// The other direction: what an import's href stands for. A "#<uuid>" is looked
// up in the document's back-matter; anything else is the address itself.
// `bytes` is the copy the document carries along (copyResource), if any.
export const resolveImport = (doc, href) => {
  if (!href?.startsWith("#")) return { href, sha256: "" };
  const resources = doc?.["back-matter"]?.resources ?? [];
  const link = resources.find((x) => x.uuid === href.slice(1))?.rlinks?.[0];
  const copy = resources.find((x) => x.base64?.value && (x.props ?? []).some((p) => p.name === "copy-of" && p.ns === NS && p.value === href.slice(1)));
  return {
    href: link?.href,
    sha256: link?.hashes?.find((h) => h.algorithm === "SHA-256")?.value ?? "",
    ...(copy && { bytes: Buffer.from(copy.base64.value, "base64") }),
  };
};

// Every run in a set of assessment results, as data: which check, when, and
// per requirement what it found and whether only in part (coverage=partial).
export const runsOf = (results) =>
  results.flatMap((ar) =>
    (ar.results ?? []).map((r) => ({
      check: (r.props ?? []).find((p) => p.name === "check")?.value || r.title,
      title: r.title,
      start: r.start,
      at: r.end || r.start,
      findings: (r.findings ?? [])
        .filter((fd) => fd.target?.["target-id"] && fd.target?.status?.state)
        .map((fd) => ({
          id: fd.target["target-id"],
          state: fd.target.status.state,
          description: fd.description,
          partial: (fd.props ?? []).some((p) => p.name === "coverage" && p.value === "partial"),
        })),
    })),
  );

// What was measured, per requirement: the latest finding of EACH check.
// Several checks may evidence one requirement; taking only the newest finding
// overall would let a later passing check hide an earlier failing one. So the
// requirement is satisfied only when every check's latest finding is, and it
// is partial unless one check evidences it in full.
export const measurements = (results) => {
  const perCheck = new Map(); // id -> Map(check -> latest)
  for (const run of runsOf(results)) {
    for (const f of run.findings) {
      if (!perCheck.has(f.id)) perCheck.set(f.id, new Map());
      const prev = perCheck.get(f.id).get(run.check);
      if (!prev || run.at > prev.at) perCheck.get(f.id).set(run.check, { ...f, at: run.at, title: run.title });
    }
  }
  const measured = new Map();
  for (const [id, checks] of perCheck) {
    const all = [...checks.entries()].sort(([a], [b]) => a.localeCompare(b));
    const failing = all.filter(([, m]) => m.state !== "satisfied");
    const shown = failing.length ? failing : all;
    measured.set(id, {
      state: failing.length ? "not-satisfied" : "satisfied",
      at: all.map(([, m]) => m.at).sort().at(-1),
      title: shown.map(([, m]) => m.title).join("; "),
      description: shown[0][1].description,
      check: all.map(([c]) => c).join(", "),
      partial: all.every(([, m]) => m.partial),
    });
  }
  return measured;
};
