# grundschutz-worksheets

Turn the BSI's machine-readable **Grundschutz++** catalog into review
worksheets — for a check of your ISMS against the running system, not against
its own documentation.

The BSI publishes Grundschutz++ and related catalogs as
[OSCAL](https://pages.nist.gov/OSCAL/) in the
[Stand-der-Technik-Bibliothek](https://github.com/BSI-Bund/Stand-der-Technik-Bibliothek).
Every requirement is a JSON object with a fixed grammar: a subject ("Konfiguration
für IT-Systeme"), a modal verb (MUSS / SOLLTE / KANN), an action word
(aktivieren, einschränken, verschlüsseln, überprüfen, verankern …) and the kind of
documentation the evidence belongs in. This script flattens that into one row per
requirement, so you can work through it — and sort it by what kind of evidence
it needs.

Background and method: [Grundschutz++ against my own documentation](https://ole-hartwig.eu/en/blog/grundschutz-plus-plus-check-own-documentation).

## Usage

Node 24 (the current LTS) or later. `worksheet.mjs` has no dependencies and needs no install. The catalog is fetched from the
library at the commit you name.

```bash
C=367d775010abee641b258926bb482fcd05270059   # a commit of the BSI library
CAT=control_layer/Grundschutz++/Grundschutz++-resolved_catalog.json
MAP=control_layer/Mappings/ISO-27001-zu-GSpp/ISO27001-AnnexA-to-GS++-mapping_collection.json

# The requirements your ISO 27001 Annex A controls lead to, as a Markdown checklist
node worksheet.mjs $CAT --mapping $MAP --commit $C > worksheet.md

# Only the controls you apply (from your Statement of Applicability), as CSV
node worksheet.mjs $CAT --mapping $MAP --sources @applicable-controls.txt --format csv --commit $C > worksheet.csv

# One practice at a time
node worksheet.mjs $CAT --mapping $MAP --practices DET,KONF --commit $C

# Where does the work lie? Counts by practice, level, modal verb, action word, subject, documentation
node worksheet.mjs $CAT --mapping $MAP --summary --commit $C

# Any other catalog of the library, without a mapping
node worksheet.mjs control_layer/Mindeststandard-TLS/Entwurf-Mindeststandard-TLS-catalog.json --commit $C
```

| Option | Meaning |
|---|---|
| `--commit <sha>` | Required. A full 40-character commit of the library. Branch names are refused. |
| `--mapping <path>` | Only requirements a mapping collection points at, each with the source controls that lead to it. |
| `--sources <list\|@file>` | With `--mapping`: only these source controls, comma-separated or one per line in a file. |
| `--practices <list>` | Only these practices, e.g. `DET,KONF`. |
| `--format md\|csv` | Markdown checklist (default) or CSV with empty `evidence`, `status` and `note` columns. |
| `--summary` | Counts instead of rows. |

A Markdown row looks like this:

```text
- [ ] **KONF.2.1** Grundkonfiguration für Systeme · normal-SdT · SOLLTE · dokumentieren · subject Konfiguration für IT-Systeme · doc Konfigurationshistorie · effort 3 · from 8.9
      Konfiguration für IT-Systeme SOLLTE eine Grundkonfiguration dokumentieren.
```

## Your tailoring as an OSCAL profile

`profile.mjs` turns a small tailoring file — which requirements apply, which do
not and why — into an OSCAL profile that imports the BSI catalog at a pinned
commit. It is the Statement of Applicability as data.

```json
{
  "title": "Grundschutz++ tailoring of Example GmbH",
  "version": "2026-09-27",
  "last-modified": "2026-09-27T00:00:00Z",
  "catalog": { "path": "control_layer/Grundschutz++/Grundschutz++-resolved_catalog.json",
               "commit": "367d775010abee641b258926bb482fcd05270059" },
  "applicable": ["DET.2.1", "KONF.3.2"],
  "not-applicable": [{ "id": "ARCH.6.1", "reason": "no own WAN links" }]
}
```

```bash
node profile.mjs tailoring.json > profile.json
node validate.mjs profile.json
node worksheet.mjs $CAT --profile profile.json --commit $C   # the worksheet for exactly your scope
```

- **Nothing is dropped:** every ID is checked against the catalog at the pinned
  commit; unknown, duplicate or contradictory IDs are errors.
- **Deterministic:** UUIDs are derived from the content and `last-modified`
  comes from the input, so the same tailoring gives the same bytes and a change
  shows up as a small diff.
- **Why not applicable:** OSCAL profiles have no field for an exclusion reason.
  The not-applicable requirements are listed as back-matter resources with the
  reason, under this repository's namespace. A system security plan is where
  OSCAL expects that statement; until you have one, it lives here.

## Self-describing images: a component definition per build

`component.mjs` turns a small source file — which requirements a product or
pipeline supports, in your own words, with evidence links — into an OSCAL
component definition (1.2.2, the version the BSI library's own components use).
With `--subject image@sha256:…` it describes one specific image, so a build
pipeline can generate it per image and attach it next to the SBOM, for example
with `cosign attest --type <predicate URI> --predicate component.json`.

```bash
node component.mjs source.json --subject registry.example.org/app@sha256:... \
  --prop pipeline=https://ci.example.org/p/123 > component.json
node validate.mjs component.json
```

- Every requirement carries both identifiers: the Grundschutz++ ID as
  `control-id` and the catalog's `alt-identifier` UUID as a prop, because the
  BSI's own component definitions refer by UUID.
- Every ID is checked against the catalog at the pinned commit; unknown or
  duplicate IDs and requirements without a description are errors.
- It describes what a component supports, not that a system is compliant.
  Whether a control is actually in effect is a measurement, not a claim.

### Claim only what has evidence

A component definition built from a pipeline's *settings* says what the
pipeline is configured to do, not what happened to the image in front of you.
If the signing job failed, or the SBOM was never attached, a settings-based
definition still lists both. Build the source file from evidence instead: after
signing and scanning, check the pushed digest, then list a requirement only
where its evidence is there.

```bash
REF=registry.example.org/app@sha256:...
cosign verify --key cosign.pub "$REF"                                # signature
cosign verify-attestation --key cosign.pub --type cyclonedx "$REF"   # SBOM
# plus the scan verdict of the same pipeline, for this digest
```

Put the result into the source file's `evidence` links, leave out whatever did
not verify, and say so in the job log. In a CI system where the consumer picks
the stage of the signing jobs, run this after all stages (GitLab: `.post`), or
the pipeline is refused as invalid wherever signing comes later than you
assumed.

Verify an attached definition from outside the pipeline that made it:

```bash
cosign verify-attestation --key cosign.pub \
  --type https://github.com/ohartwig/grundschutz-worksheets/predicate/oscal-component-definition/v1 \
  "$REF" | jq -r .payload | base64 -d | jq .predicate > component.json
node validate.mjs component.json
```

The predicate type is the one this repository uses; any URI you own works.

## A security plan assembled, not written

`ssp.mjs` puts the other outputs together into an OSCAL system security plan
(1.2.2). For every requirement the profile includes, it states one of
*implemented*, *partial* or *planned*, and on what that rests:

| Basis | Source | Wins over |
|---|---|---|
| measured | the latest assessment result for the requirement | everything |
| claimed | a component definition, with its evidence links | a review |
| reviewed | a dated manual check (optional `reviews` file) | nothing |
| none | nothing speaks for it: *planned*, and the plan says so | – |

One exception to "measured wins" and "claimed wins": a measurement or a
claim can lower a review, never raise it. Both cover part of a requirement: a
check sees what it checks, a component definition says what one build had. If a
person reviewed the requirement as *partial* for a reason neither sees, a
passing check or a claim confirms *partial*, not *implemented*; a failing check
makes an *implemented* review *partial*. The entry names both. A manual spot
check of the first real plan found the claim case: two requirements an image
claimed came out *implemented* although the review said *partial*.

```bash
node ssp.mjs system.json > ssp.json
node validate.mjs ssp.json
```

A small `system.json` names the system, its boundary and the input files; see
the header of `ssp.mjs`. A requirement that a component or measurement names
but the profile does not include is reported: either the profile lacks it, or
the claim is out of scope. On its first real run that found three requirements
the image pipeline implements but our Statement of Applicability did not list.

Why not compliance-trestle, which assembles plans too: at 5.1.0 its
`ssp-assemble` rejects version-5 UUIDs, drops the links of implemented
requirements, flattens nested catalog groups and has no way to take status from
assessment results. The CI still reads every generated plan with trestle, as an
advisory cross-check.

## Measurements as assessment results

`results.mjs` turns one run of an automated check into OSCAL assessment results
(1.2.2): which requirements the check evidences, what it looked at, what it saw
for each subject, and whether each requirement was satisfied in this run. The
check writes a small run file; the generator does the OSCAL.

```bash
node results.mjs run.json > results.json
node validate.mjs results.json
```

- **One run, one file.** Start and end come from the run; the date is part of
  the evidence. The same run gives the same bytes.
- **One failed subject fails the requirement.** Its finding names the
  observations that were not as required.
- **Nothing examined is an error, not a pass.** A check that looked at no
  subject has shown nothing.
- **IDs checked** against the catalog at the pinned commit, as in the other
  generators.
- **Not a verdict on the system.** It states what this run observed. Whether a
  system meets the requirements is an assessment by a person.

Signed and stored next to the thing it measures, for example as an OCI artefact
with `oras push` and `cosign sign`, a result becomes evidence a third party can
verify without trusting the pipeline that wrote it.

## When the catalog moves

`recheck.mjs` compares the requirements a component definition claims with
another state of the catalog, by ID and by `alt-identifier` UUID:

```bash
node recheck.mjs component.json --commit <newer library commit>
node recheck.mjs component.json --catalog edited-catalog.json   # simulate a bump
```

| Result | Meaning |
|---|---|
| `unchanged` | same ID, same UUID |
| `renamed to X` | the UUID is still there, under another ID |
| `uuid-changed` | the ID is still there, but the requirement behind it may not be |
| `withdrawn` | neither is in the catalog any more |

Exit 1 when anything needs review, so it can run as a scheduled job against the
library's main branch. Checking by UUID as well as by ID is why every
requirement carries both.

## Validating OSCAL files

`validate.mjs` checks OSCAL JSON against the official NIST schema for the
version each file declares (`metadata.oscal-version`). The BSI library mixes
versions — at commit `367d775` catalogs and profiles 1.1.3, the mapping and the
newer component definitions 1.2.2, older component definitions still 1.1.2 — so
the schema is chosen per file. The schemas ship in `schemas/` (NIST releases, unchanged) and are
checked against the SHA-256 in `schemas.json`; an unknown version is an error,
not a skip.

```bash
npm ci                                   # dev dependencies for the validator only
node validate.mjs my-component.json      # local files
node validate.mjs --bsi $CAT --commit $C # a file from the BSI library, pinned
npm test                                 # valid fixtures pass, broken ones fail
```

Not every file in the library passes. At commit `367d775` the component
definitions for Lieferkettensicherheit and GA-Lotse and the ISO 27001 mapping
collection fail the NIST schema of the version they declare (`links` as a single
object instead of an array, extra properties in `import-component-definitions`
and in `provenance`). The catalogs, the Grundschutz++ profile and the other
component definitions validate.

CI runs the self-test, validates BSI files at the pinned commit and checks that
the ISO 27001 mapping still yields the expected number of requirements.


The CI runs a second, independent validator as well: NIST's
[oscal-cli](https://github.com/usnistgov/oscal-cli). It checks the Metaschema
constraints, which the JSON schema cannot express. A back-matter resource
without content, for example, passes the JSON schema and fails here. It is
advisory: its job reports every warning but does not fail the build, and
`validate.mjs` stays the gate. oscal-cli 1.0.3 bundles OSCAL 1.1.2, so files
declaring 1.2.2 are checked against the older model.
## Two rules built in

**Pinned.** The library republishes continuously. A check against "the current
version" cannot be repeated, so the script only accepts a commit and prints it
in the header. Re-running against a newer commit and diffing the output shows
exactly which requirements are new or changed.

**Nothing is dropped silently.** Nested requirements are resolved to any depth.
Mapping targets that the catalog does not contain — the mapping lags the catalog —
are listed on stderr at the end instead of disappearing from the checklist.

## From action word to evidence

The action word tells you what kind of evidence fits. A grouping that worked
for an estate run as Infrastructure as Code and GitOps:

| Action words | Evidence |
|---|---|
| aktivieren, deaktivieren, einschränken, installieren, blockieren, verschlüsseln, protokollieren, zuweisen, autorisieren, authentifizieren, platzieren, untersagen, löschen | Configuration: a place in the IaC or GitOps repository at a named commit, plus a measurement that it is in effect |
| überprüfen, testen, überwachen, ausführen | A dated run: CI job, alert that fired, restore record |
| verankern, dokumentieren, festlegen, vereinbaren | A document, contract or approval |
| sensibilisieren, anweisen, informieren | A dated record of who was told what, and when |

Code shows what *should* exist. A complete check also asks the running system
what *does* exist — cloud inventory against state, an external port scan against
intended services, certificate transparency logs against known hostnames — to
find what no repository knows about.

## What this is not

It does not assess anything. It makes sure no requirement is missed; answering
them is your work. It is not affiliated with the BSI, and Grundschutz++ is still
evolving — nothing here claims conformance.

## Licence

The script is MIT-licensed, see [LICENSE](LICENSE).

The catalogs it reads are © Bundesamt für Sicherheit in der Informationstechnik
(BSI), published under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
The script fetches them at run time; this repository contains none of their
content. If you publish worksheets it produces, they contain BSI text and carry
that licence — or cite requirement IDs and write your assessment in your own words.
