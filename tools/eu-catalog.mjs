#!/usr/bin/env node
// Turn articles of an EU legal act into an OSCAL catalog, from the text in the
// Official Journal: a group per article, a control per paragraph and a
// sub-control per lettered point, each with the authentic wording as its
// statement. An article has no words of its own beyond its title, and OSCAL
// wants a statement in every control, so the article is the group.
//
// The text comes from the Publications Office's Cellar, the repository behind
// EUR-Lex that is meant to be read by programs (EUR-Lex itself answers scripts
// with a challenge page). The source file pins the document by address and
// SHA-256; other bytes are refused, so the catalog is the text of that
// document and nothing else.
//
// Input (JSON), a source file under standards/src/:
//   {
//     "title": "NIS2 (Richtlinie (EU) 2022/2555): ...",
//     "act": "Richtlinie (EU) 2022/2555 des Europäischen Parlaments ...",
//     "version": "ABl. L 333 vom 27.12.2022",
//     "last-modified": "2026-10-12T00:00:00Z",
//     "eli": "http://data.europa.eu/eli/dir/2022/2555/oj",
//     "language": "de",
//     "document": { "href": "https://publications.europa.eu/resource/cellar/.../DOC_1",
//                   "sha256": "<64 hex>" },
//     "articles": { "20": "all", "21": [1, 2, 3, 4] },
//     "left-out": { "Art.21.5": "why this paragraph is not in the catalog" }
//   }
//
// IDs follow the act: Art.21 is the article, Art.21.2 its paragraph 2,
// Art.21.2.a point (a) of it. OSCAL wants an ID to begin with a letter, hence
// "Art."; the label prop carries the form a lawyer writes ("Art. 21 Abs. 2
// Buchst. a").
//
// Checked, and an error otherwise -- nothing is dropped silently:
//   - the document has exactly the pinned SHA-256
//   - every article and paragraph asked for is in it
//   - every paragraph of a chosen article is either in the catalog or listed
//     in "left-out" with a reason, and "left-out" names nothing else
//   - no text of a paragraph is lost: a subparagraph after its points becomes
//     a labelled part of the statement, and anything else the catalog has no
//     place for is an error
//
// Output: an OSCAL 1.2.3 catalog on stdout. Deterministic: same input, same
// bytes. Whitespace is normalised (the Journal's non-breaking spaces become
// spaces); the words are not touched.
//
//   node tools/eu-catalog.mjs standards/src/nis2.json > standards/nis2.json
//   node tools/eu-catalog.mjs standards/src/nis2.json --file nis2.xhtml   # offline
//
// No dependencies. Node 24 (LTS) or later.

import { readFileSync } from "node:fs";
import { NS, sha256, uuid5 as uuid5From } from "../lib/oscal.mjs";

const UUID_NS = "3d7a9e52-6c1b-4f08-a2e4-8b5f0c9d1e63";

const args = process.argv.slice(2);
const local = args.includes("--file") ? args[args.indexOf("--file") + 1] : "";
const file = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--file");
if (!file) {
  console.error("usage: eu-catalog.mjs <source.json> [--file <document.xhtml>]");
  process.exit(2);
}
const fail = (msg) => {
  console.error(msg);
  process.exit(1);
};
const src = JSON.parse(readFileSync(file, "utf8"));
for (const k of ["title", "act", "version", "last-modified", "eli", "language", "articles"]) if (!src[k]) fail(`missing "${k}"`);
if (!src.document?.href || !/^[0-9a-f]{64}$/.test(src.document?.sha256 ?? "")) fail("document needs href and a 64-hex sha256");

let bytes;
if (local) bytes = readFileSync(local);
else {
  const res = await fetch(src.document.href, { headers: { accept: "application/xhtml+xml" } });
  if (!res.ok) fail(`${res.status} for ${src.document.href}`);
  bytes = Buffer.from(await res.arrayBuffer());
}
if (sha256(bytes) !== src.document.sha256) fail(`the document is not the pinned one: sha256 ${sha256(bytes)}, expected ${src.document.sha256}`);

// The Journal's XHTML is well-formed and plain: elements, attributes in
// double quotes, text, comments, a doctype. That is all this reads.
const parse = (xml) => {
  const root = { tag: "#root", attrs: {}, children: [] };
  const stack = [root];
  const re = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<\/([\w:-]+)\s*>|<([\w:-]+)((?:\s+[\w:-]+="[^"]*")*)\s*(\/?)>|([^<]+)/g;
  for (const m of xml.matchAll(re)) {
    const top = stack.at(-1);
    if (m[1]) {
      if (top.tag !== m[1]) fail(`malformed document: </${m[1]}> closes <${top.tag}>`);
      stack.pop();
    } else if (m[2]) {
      const attrs = Object.fromEntries([...m[3].matchAll(/([\w:-]+)="([^"]*)"/g)].map((a) => [a[1], a[2]]));
      const el = { tag: m[2], attrs, children: [] };
      top.children.push(el);
      if (!m[4]) stack.push(el);
    } else if (m[5]) top.children.push(m[5]);
  }
  if (stack.length !== 1) fail("malformed document: unclosed elements");
  return root;
};
const els = (e) => e.children.filter((c) => typeof c !== "string");
const text = (e) => (typeof e === "string" ? e : e.children.map(text).join(""));
const clean = (s) => s.replace(/[\s ]+/g, " ").trim();
const find = (e, pred) => {
  if (typeof e === "string") return null;
  if (pred(e)) return e;
  for (const c of e.children) {
    const hit = find(c, pred);
    if (hit) return hit;
  }
  return null;
};
const doc = parse(bytes.toString("utf8"));

// A point is a one-row table: its letter in the first cell, its words in the
// second. Points of a point (i, ii, ...) are tables inside that cell.
const point = (table) => {
  const row = find(table, (e) => e.tag === "tr");
  const [mark, body] = els(row ?? { children: [] }).filter((c) => c.tag === "td");
  if (!mark || !body) fail("a point without its two cells");
  const letter = clean(text(mark)).replace(/\)$/, "");
  const lines = els(body).map((c) => (c.tag === "table" ? (({ letter: l, prose }) => `${l}) ${prose}`)(point(c)) : clean(text(c))));
  return { letter, prose: lines.join("\n\n") };
};

const uuid5 = uuid5From(UUID_NS);
const left = new Map(Object.entries(src["left-out"] ?? {}));
const errors = [];
const label = (art, par, letter) => `Art. ${art}${par ? ` Abs. ${par}` : ""}${letter ? ` Buchst. ${letter}` : ""}`;
const prop = (value) => ({ name: "label", value });

const groups = Object.entries(src.articles)
  .sort(([a], [b]) => Number(a) - Number(b))
  .map(([art, wanted]) => {
    const div = find(doc, (e) => e.attrs.id === `art_${art}`);
    if (!div) return errors.push(`Art. ${art}: not in the document`), null;
    const title = clean(text(find(div, (e) => e.attrs.class === "eli-title") ?? ""));
    const pars = els(div).filter((e) => /^\d{3}\.\d{3}$/.test(e.attrs.id ?? ""));
    if (!pars.length) errors.push(`Art. ${art}: no numbered paragraphs`);
    const take = wanted === "all" ? pars.map((p) => Number(p.attrs.id.slice(4))) : wanted;
    for (const n of take) if (!pars.some((p) => Number(p.attrs.id.slice(4)) === n)) errors.push(`Art. ${art}: no paragraph ${n}`);
    const sub = [];
    for (const p of pars) {
      const n = Number(p.attrs.id.slice(4));
      const id = `Art.${art}.${n}`;
      if (!take.includes(n)) {
        if (!left.has(id)) errors.push(`${id}: neither taken nor listed in "left-out" with a reason`);
        continue;
      }
      if (left.has(id)) errors.push(`${id}: taken and also listed in "left-out"`);
      // Subparagraphs before the points are the statement; one after them
      // (an exception to a point, say) is a part of its own, labelled with
      // its number, so it keeps its place after the points.
      const prose = [];
      const points = [];
      const after = [];
      for (const c of els(p)) {
        if (c.tag === "p") (points.length ? after : prose).push(clean(text(c)));
        else if (c.tag === "table" && !after.length) points.push(point(c));
        else errors.push(`${id}: <${c.tag}> where the catalog has no place for it`);
      }
      // "(2)   Die in Absatz 1 ..." -- the number is the ID, not the text.
      prose[0] = prose[0]?.replace(new RegExp(`^\\(${n}\\)\\s*`), "");
      if (!prose[0]) errors.push(`${id}: no text`);
      sub.push({
        id,
        class: "paragraph",
        title: label(art, n),
        props: [prop(label(art, n))],
        parts: [
          {
            id: `${id}_smt`,
            name: "statement",
            prose: prose.join("\n\n"),
            ...(after.length && {
              parts: after.map((x, i) => ({
                id: `${id}_smt.${prose.length + 1 + i}`,
                name: "item",
                props: [prop(`Unterabsatz ${prose.length + 1 + i}`)],
                prose: x,
              })),
            }),
          },
        ],
        ...(points.length && {
          controls: points.map((x) => ({
            id: `${id}.${x.letter}`,
            class: "point",
            title: label(art, n, x.letter),
            props: [prop(label(art, n, x.letter))],
            parts: [{ id: `${id}.${x.letter}_smt`, name: "statement", prose: x.prose }],
          })),
        }),
      });
    }
    return { id: `Art.${art}`, class: "article", title: title || label(art), props: [prop(label(art))], controls: sub };
  })
  .filter(Boolean);
for (const id of left.keys()) {
  const [, art, n] = id.match(/^Art\.(\d+)\.(\d+)$/) ?? [];
  if (!art || !(art in src.articles)) errors.push(`left-out ${id}: not a paragraph of a chosen article`);
  else if (!left.get(id)) errors.push(`left-out ${id}: no reason`);
  else if (!find(doc, (e) => e.attrs.id === `${art.padStart(3, "0")}.${n.padStart(3, "0")}`)) errors.push(`left-out ${id}: not in the document`);
}
if (errors.length) fail(`${errors.length} error(s):\n  ${errors.join("\n  ")}`);

const docUuid = uuid5(`document:${src.document.href}`);
const out = {
  catalog: {
    uuid: uuid5(`catalog:${src.eli}:${src.language}`),
    metadata: {
      title: src.title,
      "last-modified": src["last-modified"],
      version: src.version,
      "oscal-version": "1.2.3",
      props: [
        { name: "source-language", ns: NS, value: src.language },
        { name: "left-out", ns: NS, value: String(left.size) },
      ],
      links: [{ href: src.eli, rel: "canonical", text: src.act }],
      remarks:
        `Generated by grundschutz-worksheets tools/eu-catalog.mjs from the text of ${src.act} in the Official Journal (${src.version}), ` +
        "the document in the back-matter. Do not edit by hand. Only the text published in the Official Journal of the European Union " +
        "is authentic. Reuse of EU legal texts is authorised provided the source is acknowledged (Commission Decision 2011/833/EU)." +
        (left.size ? `\n\nNot in this catalog:\n\n${[...left].map(([id, why]) => `- ${id}: ${why}`).join("\n")}` : ""),
    },
    groups,
    "back-matter": {
      resources: [
        {
          uuid: docUuid,
          title: `${src.act}, ${src.version}`,
          citation: { text: `${src.act}, ${src.version}`, links: [{ href: src.eli, rel: "canonical" }] },
          rlinks: [{ href: src.document.href, "media-type": "application/xhtml+xml", hashes: [{ algorithm: "SHA-256", value: src.document.sha256 }] }],
        },
      ],
    },
  },
};
process.stdout.write(JSON.stringify(out, null, 2) + "\n");
