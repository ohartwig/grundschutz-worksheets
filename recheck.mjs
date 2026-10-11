#!/usr/bin/env node
// Re-check a component definition against another state of the catalog.
//
// A component definition names requirements by ID at one library commit. When
// the BSI publishes a new catalog, some of those IDs may be withdrawn, renamed
// or given a new meaning. This reports, for every requirement the definition
// claims, what happened to it:
//
//   unchanged     same ID, same alt-identifier UUID
//   renamed       the UUID is still there, under another ID
//   uuid-changed  the ID is still there, with another UUID -- the requirement
//                 behind the ID may no longer be the one that was described
//   withdrawn     neither the ID nor the UUID is in the catalog any more
//
// The catalog to compare against is either another commit of the same file
// (--commit), or a local file (--catalog), e.g. a copy edited to simulate a
// bump before a real one arrives.
//
//   node recheck.mjs component.json --commit <40-char sha>
//   node recheck.mjs component.json --catalog next-catalog.json
//
// Exit 0: nothing changed. Exit 1: at least one requirement needs review.
// Exit 2: usage or input error.
//
// No dependencies. Node 24 (LTS) or later.

import { readFileSync } from "node:fs";
import { REPO, everyControl } from "./lib/oscal.mjs";

const args = process.argv.slice(2);
const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : "");
const file = args.find((a, i) => !a.startsWith("--") && !["--commit", "--catalog"].includes(args[i - 1]));
const commit = opt("--commit");
const local = opt("--catalog");

const fail = (msg) => {
  console.error(`recheck: ${msg}`);
  process.exit(2);
};
if (!file || (!commit && !local) || (commit && local)) {
  console.error("usage: recheck.mjs <component-definition.json> (--commit <sha> | --catalog <file>)");
  process.exit(2);
}
if (commit && !/^[0-9a-f]{40}$/.test(commit)) fail("--commit must be a 40-character commit");

const cd = JSON.parse(readFileSync(file, "utf8"))["component-definition"];
if (!cd) fail(`${file} is not an OSCAL component definition`);

const claims = [];
const sources = new Set();
for (const comp of cd.components ?? []) {
  for (const ci of comp["control-implementations"] ?? []) {
    sources.add(ci.source);
    for (const r of ci["implemented-requirements"] ?? []) {
      const uuid = (r.props ?? []).find((p) => p.name === "alt-identifier")?.value ?? "";
      claims.push({ id: r["control-id"], uuid });
    }
  }
}
if (!claims.length) fail("no implemented requirements");

let catalog;
let from;
if (local) {
  catalog = JSON.parse(readFileSync(local, "utf8")).catalog;
  from = local;
} else {
  if (sources.size !== 1) fail(`expected one catalog source, found ${sources.size}`);
  const [source] = sources;
  // The definition's own source decides what is fetched, and the definition
  // may be someone else's. Only the library at a pinned commit is a catalog to
  // compare against: anything else could be a mirror made to say "unchanged".
  // Checked after normalisation: a ".." or "%2e%2e" behind the commit would
  // pass a prefix test and still leave the library when fetched.
  const pinned = new RegExp(`^${REPO.replace(/[.+]/g, "\\$&")}/[0-9a-f]{40}/`);
  let url = "";
  try { url = new URL(source).href; } catch {}
  if (!pinned.test(url)) fail(`source is not the library at a pinned commit: ${source}`);
  from = url.replace(pinned, `${REPO}/${commit}/`);
  const r = await fetch(from);
  if (!r.ok) fail(`${r.status} for ${from}`);
  catalog = (await r.json()).catalog;
}
if (!catalog) fail("not an OSCAL catalog");

// ID -> UUID and UUID -> ID, however deeply nested.
const byId = new Map();
const byUuid = new Map();
for (const c of everyControl(catalog)) {
  const uuid = (c.props ?? []).find((p) => p.name === "alt-identifier")?.value ?? "";
  byId.set(c.id, uuid);
  if (uuid) byUuid.set(uuid, c.id);
}

let changed = 0;
for (const { id, uuid } of claims) {
  let state;
  if (byId.has(id) && (!uuid || byId.get(id) === uuid)) state = "unchanged";
  else if (byId.has(id)) state = "uuid-changed";
  else if (uuid && byUuid.has(uuid)) state = `renamed to ${byUuid.get(uuid)}`;
  else state = "withdrawn";
  if (state !== "unchanged") changed++;
  console.log(`${state === "unchanged" ? "ok    " : "REVIEW"} ${id}: ${state}`);
}
console.log(`${claims.length} requirement(s), ${changed} to review, against ${from}`);
process.exit(changed ? 1 : 0);
