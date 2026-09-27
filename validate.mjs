#!/usr/bin/env node
// Validate OSCAL JSON files against the official NIST schema for the OSCAL
// version each file declares in metadata.oscal-version.
//
// Why: every OSCAL file this repository generates - and every BSI file it reads
// - should be checked before anyone relies on it. The BSI library itself mixes
// versions (catalogs and profiles 1.1.3, component definitions 1.2.2), so the
// schema is chosen per file, not once.
//
// The schemas are downloaded from the NIST release and checked against the
// SHA-256 recorded in schemas.json. An unknown version or a hash mismatch is an
// error, not a skip: a check that quietly validates nothing is worse than none.
//
//   node validate.mjs <file.json> [...]
//   node validate.mjs --bsi <path in the library> --commit <sha>   # a BSI file, pinned
//
// Exit 0 when every file is valid, 1 when one is not, 2 on usage or setup errors.
// Needs the dev dependencies (npm ci); worksheet.mjs itself needs none.

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";
import addFormats from "ajv-formats";

const here = dirname(fileURLToPath(import.meta.url));
const pins = JSON.parse(readFileSync(join(here, "schemas.json"), "utf8"));
const cacheDir = join(here, ".schema-cache");
const BSI = "https://raw.githubusercontent.com/BSI-Bund/Stand-der-Technik-Bibliothek";

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] ?? "" : "";
};

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

async function schemaFor(version) {
  const pin = pins[version];
  if (!pin) throw new Error(`no pinned schema for OSCAL ${version} (schemas.json knows ${Object.keys(pins).join(", ")})`);
  const file = join(cacheDir, `oscal_complete_schema-${version}.json`);
  let buf = existsSync(file) ? readFileSync(file) : null;
  if (!buf || sha256(buf) !== pin.sha256) {
    const r = await fetch(pin.url);
    if (!r.ok) throw new Error(`${r.status} for ${pin.url}`);
    buf = Buffer.from(await r.arrayBuffer());
    if (sha256(buf) !== pin.sha256) throw new Error(`hash mismatch for OSCAL ${version} schema: got ${sha256(buf)}`);
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(file, buf);
  }
  return JSON.parse(buf.toString("utf8"));
}

const validators = new Map();
async function validatorFor(version) {
  if (!validators.has(version)) {
    // unicodeRegExp: the schemas use \p{L} and \p{N}. strict off: they carry
    // keywords ajv does not know and would otherwise refuse to compile.
    const ajv = new Ajv({ allErrors: true, strict: false, unicodeRegExp: true });
    addFormats(ajv);
    validators.set(version, ajv.compile(await schemaFor(version)));
  }
  return validators.get(version);
}

async function loadInputs() {
  const bsiPath = opt("--bsi");
  if (bsiPath) {
    const commit = opt("--commit");
    if (!/^[0-9a-f]{40}$/.test(commit)) {
      console.error("--bsi needs --commit <40-char sha>");
      process.exit(2);
    }
    const url = `${BSI}/${commit}/${bsiPath.split("/").map(encodeURIComponent).join("/")}`;
    const r = await fetch(url);
    if (!r.ok) {
      console.error(`${r.status} for ${url}`);
      process.exit(2);
    }
    return [[bsiPath, await r.json()]];
  }
  const files = args.filter((a) => !a.startsWith("--"));
  if (!files.length) {
    console.error("usage: validate.mjs <file.json> [...] | --bsi <path> --commit <sha>");
    process.exit(2);
  }
  return files.map((f) => [f, JSON.parse(readFileSync(f, "utf8"))]);
}

let failed = 0;
for (const [name, doc] of await loadInputs()) {
  const model = Object.keys(doc)[0];
  const version = doc[model]?.metadata?.["oscal-version"];
  if (!version) {
    console.log(`FAIL ${name}: no metadata.oscal-version under top-level "${model}"`);
    failed += 1;
    continue;
  }
  let validate;
  try {
    validate = await validatorFor(version);
  } catch (e) {
    console.error(`ERROR ${name}: ${e.message}`);
    process.exit(2);
  }
  if (validate(doc)) {
    console.log(`ok   ${name} (${model}, OSCAL ${version})`);
  } else {
    failed += 1;
    console.log(`FAIL ${name} (${model}, OSCAL ${version}): ${validate.errors.length} error(s)`);
    for (const e of validate.errors.slice(0, 10)) console.log(`     ${e.instancePath || "/"} ${e.message}`);
  }
}
process.exit(failed ? 1 : 0);
