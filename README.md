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
C=$(node tools/bsi-library.mjs)   # the commit this repository is tested at; any 40-character commit works
CAT=control_layer/Grundschutz++/Grundschutz++-resolved_catalog.json
MAP=control_layer/Mappings/ISO-27001-zu-GSpp/ISO27001-AnnexA-to-GS++-mapping_collection.json

# The requirements your ISO 27001 Annex A controls lead to, as a Markdown checklist
node worksheet.mjs $CAT --mapping $MAP --commit $C > worksheet.md

# Only the controls you apply (from your Statement of Applicability), as CSV
node worksheet.mjs $CAT --mapping $MAP --sources @applicable-controls.txt --format csv --commit $C > worksheet.csv

# One practice at a time
node worksheet.mjs $CAT --mapping $MAP --practices DET,KONF --commit $C

# Where does the work lie? Counts by practice, level, modal verb, action word, subject, documentation, threat
node worksheet.mjs $CAT --mapping $MAP --summary --commit $C

# Any other catalog of the library, without a mapping
node worksheet.mjs control_layer/Mindeststandard-TLS/Entwurf-Mindeststandard-TLS-catalog.json --commit $C
```

| Option | Meaning |
|---|---|
| `--commit <sha>` | Required unless a preset names it. A full 40-character commit of the library. Branch names are refused. |
| `--mapping <path>` | Only requirements a mapping collection of the library points at, each with the source controls that lead to it. |
| `--mapping-file <file>` | The same with a mapping collection on disk, such as one written by `mapping.mjs`. It must target the catalog at `--commit`. |
| `--sources <list\|@file>` | With `--mapping`: only these source controls, comma-separated or one per line in a file. |
| `--practices <list>` | Only these practices, e.g. `DET,KONF`. |
| `--format md\|csv` | Markdown checklist (default) or CSV with empty `evidence`, `status` and `note` columns. |
| `--summary` | Counts instead of rows, including one per elementary threat (G 0.x). |
| `--levels <list>` | Only these security levels, e.g. `normal-SdT` or `erhöht`. |
| `--modal <list>` | Only these modal verbs, e.g. `MUSS`. |
| `--preset <id>` | A named audit scope, see below. |
| `--catalog-file <file>` | A catalog that is not in the library, read from disk and pinned by its SHA-256 instead of a commit. |

With `--sources`, an entry ending in `*` matches a prefix: `APP.1.1*` is every
source control that starts with it.

A Markdown row looks like this:

```text
- [ ] **KONF.2.1** Grundkonfiguration für Systeme · normal-SdT · SOLLTE · dokumentieren · subject Konfiguration für IT-Systeme · doc Konfigurationshistorie · effort 3 · threats G 0.18 · from 8.9 (subset-of)
      Konfiguration für IT-Systeme SOLLTE eine Grundkonfiguration dokumentieren.
```

## Presets: one name per audit scope

> **Check the scope yourself.** A preset is a starting point, not an audit
> scope anyone has approved for you. It only selects requirements: which
> catalog, which mapping, which commit. Whether that selection fits your
> audit, and whether the mapping behind it says what your auditor will accept,
> is for you to check against the original texts -- the regulation, the
> standard, your Statement of Applicability. The BSI mappings (`iso27001`,
> `itgs2023`) are the BSI's and carry their own status; the mappings of this
> repository (`nis2`, `nis2-ir`, `dora`, `c5`, `soc2`) are unreviewed drafts, and `a5` reads a
> catalog that is itself a Community Draft. None of it is legal
> advice, and a worksheet that comes out of a preset proves nothing until a
> person has reviewed it. Every worksheet made from a preset repeats this in a
> note under its header.

A preset names the catalog and the mapping if there is one, and runs at the
library commit this repository is tested at (`tools/bsi-library.mjs`), so
`--preset iso27001` replaces three arguments. Options on the command line win,
`--commit` included; the header then says the preset was tested at another
commit. An own mapping (`nis2`, `nis2-ir`, `dora`, `c5`, `soc2`) is the
exception: it is derived from the catalog at one commit and refuses any other
until it is regenerated there.

```bash
node worksheet.mjs --presets                                   # what there is
node worksheet.mjs --preset iso27001 --sources @soa.txt --format csv
node worksheet.mjs --preset gspp --levels normal-SdT --summary
node worksheet.mjs --preset itgs2023 --sources 'APP.1.1*,OPS.1.1.3*'
```

| Preset | Scope | Requirements at `160c177` |
|---|---|---|
| `gspp` | Grundschutz++, the whole catalog | 1000 (773 normal-SdT) |
| `iso27001` | ISO/IEC 27001:2022 Annex A through the BSI mapping | 280, 19 targets not in the catalog |
| `itgs2023` | IT-Grundschutz-Kompendium 2023 through the BSI mapping | 322, 17 targets not in the catalog |
| `lieferkette` | Lieferkettensicherheit profile, resolved | 146 |
| `wlan` | WLAN profile, resolved | 48 |
| `nis2` | NIS2 Art. 21(2), own draft mapping (below) | 187 |
| `nis2-ir` | NIS2 Implementing Regulation (EU) 2024/2690, Annex, step to ISO by ENISA, draft (below) | 223 |
| `dora` | DORA Art. 5 to 30, own draft mapping (below) | 176 |
| `c5` | BSI C5:2026, own draft mapping (below) | 384 |
| `soc2` | SOC 2 common criteria, availability and confidentiality, own draft mapping (below) | 231 |
| `a5` | BSI A5 KI-Prüfkatalog, Basismodul, file supplied by you (below) | 57 |

The profile presets read the resolved catalog the BSI publishes next to each
profile: the profiles themselves import several catalogs through back-matter,
which `--profile` does not follow.

With a mapping, every source control carries its relationship, for example
`from 5.15 (subset-of)`; in the CSV it is the `relationship` column, one entry
per `from` entry. `intersects-with` means the requirement covers only part of
the source control.

Each preset file states the counts it yields (`expect`), and CI checks them
(`npm run test:presets`) at the pinned commit. Raising the commit means raising
those counts in the same change, so the diff shows what the new catalog moved
(see [Raising the library commit](#raising-the-library-commit)).

### A5: a catalog from outside the library

The BSI's A5 catalog for AI systems (Community Draft, Basismodul of
2026-06-30) is OSCAL in the Grundschutz++ schema, but not in the library, and
its files state no licence. So it is not in this repository: download the
"Basismodul – JSON (zip)" from the BSI's A5 page, unpack it and pass the file.
The preset knows its SHA-256 and refuses any other file.

```bash
node worksheet.mjs --preset a5 --catalog-file A5-Basismodul-2026-06-30.json
PRESET_FILES=path/to/dir npm run test:presets   # checks a5 too, where the file is
```

Without the file, `test:presets` reports a5 as skipped; CI does not have it.
The Cloudmodul of the same date only repeats GCS.2.5 and has no preset.

### Own mappings: NIS2, DORA, C5 and SOC 2, as drafts

The library has no mappings for NIS2, DORA, C5:2026 or SOC 2. `mapping.mjs` writes one
from a small source file in `mappings/src/` into an OSCAL mapping collection
in `mappings/`, which the presets name as `mapping-file` and `--mapping-file`
reads from disk:

| Preset | Source, one entry per | Requirements at `160c177` |
|---|---|---|
| `nis2` | Art. 21(2) (a) to (j) NIS2 = § 30 Abs. 2 Nr. 1 to 10 BSIG, `Art.21.2.a` to `Art.21.2.j` | 187 |
| `nis2-ir` | numbered heading of the Annex of Implementing Regulation (EU) 2024/2690, `Nr.1.1` to `Nr.13.3` (49, as in ENISA's table), each for all its points | 223 |
| `dora` | DORA article, Art. 5 to 30 | 176 |
| `c5` | C5:2026 criterion (168; the 6 report conditions GC are left out) | 384 |
| `soc2` | Trust Services criterion: common criteria `CC1.1` to `CC9.2` (33), availability `A1.1` to `A1.3`, confidentiality `C1.1`, `C1.2` | 231 |

Most targets are **derived**: each source names the ISO/IEC 27001:2022 Annex A
controls it corresponds to, and the Grundschutz++ targets come from the BSI's
own ISO mapping at the same commit. The only judgement made here is the step
to ISO, which a reviewer can check against a list they know. Derived targets
are `intersects-with`; direct targets cover what Annex A lacks (risk analysis,
MFA, vulnerability disclosure, exit strategies) and carry their own
relationship -- but while a mapping is a draft, `mapping.mjs` refuses the ones
that claim full coverage (`subset-of`, `equal-to`, `equivalent-to`). That the
targets cover all of a source is exactly what a reviewer has to confirm. Sources without any target are listed with a reason, for example
reports to the supervisor (DORA Art. 19), which Grundschutz++ does not ask for.

C5:2026 has no references to ISO 27001, and its machine-readable release is
licensed CC BY-ND 4.0: the mapping uses criterion IDs only, every remark is our
own wording. INQ-01 to INQ-04 (requests from authorities for customer data)
have no target.

The SOC 2 Trust Services Criteria are the AICPA's and are not reproduced either:
the mapping names criterion IDs, and its source is a catalog of IDs only
(below). It maps the 33 common criteria every SOC 2 report covers, and availability
and confidentiality, which most reports add; PI1 and P1 to P8 are in the
catalog and not mapped yet. Governance, risk
assessment and monitoring (CC1 to CC5) are mostly ISMS clauses rather than
Annex A, so they lean on direct targets.

**NIS2 Implementing Regulation: the step to ISO by ENISA.** For DNS and TLD
providers, cloud, data centre and CDN providers, managed (security) service
providers, marketplaces, search engines, social networks and trust services,
Art. 21(2) is made concrete by the Annex of Implementing Regulation (EU)
2024/2690: 13 sections, 161 numbered requirements. `nis2-ir` maps that Annex,
and here the step to ISO is not this repository's judgement. ENISA's
[NIS2 Technical Implementation Guidance](https://www.enisa.europa.eu/publications/nis2-technical-implementation-guidance)
comes with a mapping table that names, for each of its 49 headings, the
ISO/IEC 27001:2022 clauses and Annex A controls; the source file takes ENISA's
Annex A controls as they are, and `tools/enisa-iso.mjs` holds it to the table,
pinned by SHA-256. ENISA's column is typed by hand, so the tool reads it by
stated rules -- a Greek alpha that looks like an A is an A, `A5.7` is `A.5.7`,
a bare number is a management-system clause -- and refuses an entry that is no
Annex A control of the 2022 edition. Clauses have no Annex A control and give
no target; the remarks name them. Where ENISA names only clauses for the core of
a heading (risk management, effectiveness assessment), the direct targets of the
`nis2` draft are taken over and say so. ENISA's table is advisory, and the
mapping is a draft like the others until a person has reviewed it.

```bash
node tools/enisa-iso.mjs mappings/src/nis2-ir.json           # check against the table
node tools/enisa-iso.mjs mappings/src/nis2-ir.json --write   # take the table's step to ISO
```

All five are **drafts**, written with AI assistance and not yet reviewed by a
person (in `nis2-ir`, the step to ISO is ENISA's, the rest is ours). The worksheet says so in its header (`mapping draft`) and in a note
above the rows; the CSV, which has no room for one, says it on stderr.

The review has a sheet: `mapping.mjs --review` writes, per source, its remark,
the step to ISO, every target with its title and the boxes a reviewer ticks.
The sheets for the drafts are in `mappings/review/` and regenerated
with the mappings. A mapping whose sheet is ticked through changes `status` to
`complete` in its source file -- and only then may it say `subset-of`.

```bash
node mapping.mjs mappings/src/nis2.json > mappings/nis2-to-gspp.json
node validate.mjs mappings/nis2-to-gspp.json
node mapping.mjs mappings/src/nis2.json --review > mappings/review/nis2.md
```

CI regenerates every mapping and fails if the committed file differs.

### NIS2 and DORA in their own words: catalogs of the acts

`standards/` holds OSCAL catalogs of the acts themselves, in the German text of
the Official Journal (L 333, 27.12.2022):

| Catalog | Articles | Requirements |
|---|---|---|
| `nis2.json` | Art. 20 (governance), 21 (1) to (4) (risk-management measures), 23 (1) to (4) and (7) (reporting) | 28 |
| `dora.json` | Art. 5 to 30 without 15 and 20 to 22: ICT risk management, incidents, testing, third-party risk | 216 |
| `nis2-ir.json` | Implementing Regulation (EU) 2024/2690, the Annex (ABl. L, 2024/2690, 18.10.2024) | 161 |

An article is a group, a paragraph a control, a lettered point a control of
its paragraph: `Art.21.2.b` is "Bewältigung von Sicherheitsvorfällen". An
article without numbered paragraphs (DORA Art. 7 and 23) is a single control.
A subparagraph after a list of points is a labelled part of its paragraph's
statement. An annex has numbered headings instead of articles: they become
groups `Nr.6` and `Nr.6.6`, the points controls `Anh.6.6.1`, their lettered
points controls `Anh.6.6.1.a`. A subsection with words of its own instead of
points (5.2 and 12.5 of 2024/2690) is one control under its own number,
`Anh.5.2`. A mapping can name a heading at any depth and means every point
beneath it; `--sources Anh.11` selects them. Paragraphs and articles that bind only authorities, the ESAs or the
Commission are left out, each with its reason in the catalog's remarks.

`tools/eu-catalog.mjs` writes them from `standards/src/`, which pins
each document in the Publications Office's Cellar by address and SHA-256. Other
bytes are refused, every paragraph of a chosen article is either taken or left
out with a reason, and the words are not touched beyond whitespace. CI
regenerates the catalogs from the live documents and fails if a committed file
differs; oscal-cli checks them with the other documents. Reuse of EU legal texts
is authorised with the source acknowledged (Commission Decision 2011/833/EU);
only the text in the Official Journal is authentic.

The NIS2 and DORA mappings take these catalogs as their source: the
`source-resource` imports the catalog through a back-matter resource with its
SHA-256, every source ID must be one of its controls or articles, and the
review sheet quotes the text next to the targets. DORA is mapped by article;
an article is a group in the catalog, and a mapping names controls, so
`mapping.mjs` writes the article's paragraphs as the source, all together and
under the article's relationship -- no judgement is added. `--sources Art.9`
selects them all. The NIS2 IDs are those of the catalog now, `Art.21.2.b`
where 1.0 had `21.2.b`; `--sources 21.2.b` still works until 2.0 and says so
on stderr.

### SOC 2: the IDs, not the text

`standards/soc2.json` is a catalog of the 61 Trust Services Criteria (2017,
revised points of focus 2022): security (the common criteria CC1 to CC9),
availability, confidentiality, processing integrity and privacy, a group per
category and series, a control per criterion. Each has its ID, a title in this
repository's words, and a statement that only says where the text is -- the
AICPA's document, free with registration. That is enough for what the chain
does with a standard: a mapping, an assessment plan and results point at IDs.

`tools/id-catalog.mjs` writes it from `standards/src/soc2.json` and refuses an
ID twice, a criterion outside its series and a count other than the source's.
A SOC 2 report is a CPA firm's opinion; nothing here is one. What the chain
can give the firm is the evidence of Type II: dated results of the same checks
over the period (`period.mjs`, below), per criterion through `coverage.mjs
--preset soc2`.

## BSI-Standard 300-1: the method behind the catalog

Since 2026-10-26 the BSI publishes the method of Grundschutz++ as
[BSI-Standard 300-1](https://www.bsi.bund.de/SharedDocs/Downloads/DE/BSI/Grundschutz/BSI_Standards/standard_300-1.pdf)
(version 1.0 of 2026-10-20, for early adopters). The catalog says *what* is
required; the standard says how a package of requirements is put together and
what follows when one is not met. Where the tools here touch that, they follow
the standard:

| The standard | Here |
|---|---|
| The method practices (GC, STM, UMS, VRB, PERF) apply to every information domain; every other requirement without a target-object category belongs in the package too (3.4.1) | `profile.mjs` names each one a tailoring of the Anwenderkatalog leaves out, and each method requirement it calls not applicable; `--strict` makes that an error |
| Three states: *erfüllt*, *nicht erfüllt*, *nicht anwendbar* with a reason (4.1.1) | *implemented* is erfüllt; *partial* and *planned* are both nicht erfüllt; not applicable is the profile's, with its reason |
| An unfulfilled SOLLTE is temporary or permanent; permanent needs a risk analysis and the leadership's approval of the residual risk; a MUSS allows neither exception nor risk acceptance (4.1.2) | a review in `ssp.mjs` says `nonfulfilment`; a permanent MUSS is refused, a permanent SOLLTE needs `risk` and `approved`; `poam.mjs` makes the approved ones deviations |
| For a permanently unfulfilled SOLLTE the risk analysis takes in its elementary threats (Annex 3, criterion 17) | the worksheet names them per requirement (`threats G 0.x`, the last CSV column) and counts them in `--summary` |
| *erhöht* requirements are KANN, optional (3.4.2) | `--levels normal-SdT` is the baseline |
| Blueprints (*Blaupausen*): catalogs cut to a scenario, with parameters set (3.3) | the profile presets `lieferkette` and `wlan` |
| Evidence names the tool, the time and the result of an automated check, and who documented or checked it (4.3) | `results.mjs`: start and end of the run, the check, `measured_by`, the evidence links, `performed_by`; a review's `date` and `by`, for the file or per requirement, become the plan's `reviewed` and `reviewed-by` |
| Every measure has a responsible person and a deadline (4.4) | an action's `owner` and `due` in `poam.mjs`; the owner becomes the remediation's `responsible` |

Catalog and standard do not agree everywhere yet. At `160c177` the catalog
gives the implementation status two values, not three (UMS.1.1), asks the
approval of the residual risk only with SOLLTE (UMS.1.2), and three *erhöht*
requirements carry SOLLTE instead of KANN (BES.1.4, DET.4.12.1, REA.2.5); the
community lists more in
[issue #116](https://github.com/BSI-Bund/Stand-der-Technik-Bibliothek/issues/116)
of the library. Where they disagree, the tools follow the standard; a later
catalog that settles it arrives as a raised library commit.

Choosing the business processes, their protection needs and the assets behind
them (chapter 2 and 3.1, 3.2) is the institution's work, and so is the risk
analysis itself. Nothing here does it.

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
  "not-applicable": [{ "id": "ARCH.6.1", "reason": "no own WAN links" }],
  "parameters": { "rea.1.2-prm1": "jährlich", "rea.1.1.2-prm1": ["CISO", "SOC"] }
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
  reason, under this repository's namespace. `ssp.mjs` carries them into the
  security plan, so the plan states the whole applicability.
- **Which catalog, exactly:** the profile imports the catalog through a
  back-matter resource whose link carries the SHA-256 of the catalog at the
  pinned commit. `worksheet.mjs --profile` refuses a profile whose catalog
  bytes differ from what it reads, not only one with another address.
- **Your values for the blanks:** the catalog leaves some words to you, such as
  how often (*regelmäßig*) and who (*zuständigen Personen oder Rollen*).
  `parameters` sets them by parameter ID; they become the profile's
  `set-parameters`, and the worksheet prints `[jährlich]` instead of
  `[regelmäßig]`. A parameter of a requirement that is not applicable, or one
  the catalog does not have, is an error.
- **What the standard does not leave to you:** for the Anwenderkatalog
  (`control_layer/Grundschutz++/`), every requirement of the method and every
  one without a target-object category that the tailoring neither applies nor
  calls not applicable is named on stderr, and so is a method requirement
  called not applicable (BSI-Standard 300-1, 3.4.1). A warning, since a
  tailoring may be a benchmark against Annex A rather than a package by the
  standard; `profile.mjs tailoring.json --strict` refuses it.

## Self-describing images: a component definition per build

`component.mjs` turns a small source file — which requirements a product or
pipeline supports, in your own words, with evidence links — into an OSCAL
component definition (1.2.2, the version the BSI library's own components use;
the plan, assessment plan, results and POA&M are written as 1.2.3).
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

`ssp.mjs` writes an OSCAL system security plan (1.2.3): the owner's
statement of how the system implements each requirement the profile
includes. In OSCAL's chain the plan is the claim; whether the claim is true is
what assessment results record. So the plan states *implemented*, *partial*
or *planned* from the owner's side only, and says what that rests on:

| Basis | Source |
|---|---|
| reviewed | the owner's dated verdict (optional `reviews` file) |
| claimed | no review, but a component definition claims it with evidence |
| none | nothing speaks for it: *planned*, and the plan says so |

Component definitions add their implementation statements and evidence links
to every requirement they claim, but never change a reviewed state: one image's
definition says what that build had, not what the whole system does.

An optional `inventory` file -- what the infrastructure code declares, for
example the DNS records of an OpenTofu state -- becomes the plan's
`inventory-items`, so the plan lists what exists by code, not by memory.

Assessment results are **referenced, not merged**. Each requirement names its
latest assessment (`assessed`, `assessment-state`, `assessment-check`); one
claimed as implemented whose latest assessment was not satisfied gets a remark,
and the metadata counts them. The claim stays until the owner changes it. An
earlier version let a measurement set the state; a manual spot check of the
first real plan showed why that mixes the claim with the verdict.

```bash
node ssp.mjs system.json > ssp.json
node validate.mjs ssp.json
```

A small `system.json` names the system, its boundary and the input files; see
the header of `ssp.mjs`. A requirement that a component or measurement names
but the profile does not include is reported: either the profile lacks it, or
the claim is out of scope. On its first real run that found three requirements
the image pipeline implements but our Statement of Applicability did not list.

**For now or for good.** BSI-Standard 300-1 counts *partial* and *planned* as
not fulfilled and asks of each whether it is so temporarily -- in the
implementation plan, with a reason -- or permanently. A review says which:

```json
{ "id": "DET.5.3", "state": "partial", "note": "rollout under way", "nonfulfilment": "temporary" }
{ "id": "TEST.4.1", "state": "planned", "note": "no licence for approvals",
  "nonfulfilment": "permanent", "risk": "R-021",
  "approved": { "by": "Management", "date": "2026-10-27" } }
```

A temporary one needs its note, and takes `approved` as well: the risk of what
is still in the plan is the leadership's to bear (4.1.1), and stderr counts the
temporary ones without it. A permanent one is refused for a MUSS, which
allows neither exception nor risk acceptance, and needs for a SOLLTE the risk
analysis it rests on and the leadership's approval of the residual risk; a KANN
is optional. To know the modal verb, `ssp.mjs` reads the catalog the profile
imports, checked against its SHA-256 -- only then, and with `--catalog <file>`
from disk. The plan carries `nonfulfilment`, `risk-analysis` and
`residual-risk-approved(-by)` as props, and stderr counts the unfulfilled
requirements no review classifies yet.

**Who checked, and when.** The standard asks of every check its date and the
person who documented or checked it (4.3). A reviews file names them once
(`"date"`, `"by"`), a requirement where it differs (`"date"`, `"by"` on its
entry); the plan carries them as `reviewed` and `reviewed-by`, and stderr
counts the reviews that name no one.

Why not compliance-trestle, which assembles plans too: at 5.1.0 its
`ssp-assemble` rejects version-5 UUIDs, drops the links of implemented
requirements and flattens nested catalog groups. The CI still reads every generated plan with trestle, as an
advisory cross-check.

## How the claims are checked: an assessment plan

OSCAL's chain has four links: the security plan says how the system
implements each requirement, the **assessment plan** how that is checked, the
assessment results what was found, the POA&M what will be fixed.
`assessment-plan.mjs` writes the second from a short description of your
checks: what each examines, by which method, how often, and which
requirements it gives evidence for.

```bash
node assessment-plan.mjs checks.json > assessment-plan.json
node validate.mjs assessment-plan.json
```

One activity and one recurring task per check, every requirement ID checked
against the catalog at the pinned commit. The check name is the join: the same
name is the `check` prop of every result `results.mjs` writes, and every run
file names the plan it follows (`"plan": { "href": ..., "file": ... }`), which
becomes the result's `import-ap`.

## Imports name what they were made from

Every document here imports its predecessor the way OSCAL provides for: the
`import-*` names `#<uuid>` of a back-matter resource, and the resource's link
carries the SHA-256 of the file the generator read -- the catalog in the
profile, the profile in the security plan, the plan in the assessment plan
and the POA&M, the assessment plan in the results. Where an input gives only
an `href` and no local `file`, the link has no hash. A reader can check that
what it fetches is what the document was made against, not merely something
at the same address.

## Measurements as assessment results

`results.mjs` turns one run of an automated check into OSCAL assessment results
(1.2.3): which requirements the check evidences, what it looked at, what it saw
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
- **Part of a requirement is part.** A check that shows only part of a
  requirement -- a protected branch says nothing about the criteria for
  authorising a change -- lists it in `"partial"`. Its finding carries
  `coverage=partial`, satisfied or not, and the security plan marks the
  requirement `assessment-coverage=partial` unless another check shows it in
  full. OSCAL's findings know only satisfied and not-satisfied; the prop keeps a
  partial pass from reading as a full one.
- **No plan, no results.** A run file names the assessment plan it follows
  (`"plan": { "href": ... }`, with `"file"` for its SHA-256); OSCAL's results
  import it, so without one the run is refused. Up to 0.2 the check's own
  description stood in for the plan, which no OSCAL tool accepts.
- **IDs checked** against the catalog at the pinned commit, as in the other
  generators.
- **Who ran it.** `performed_by`, optional, names the person or the account a
  schedule runs as; it becomes the result's prop `performed-by`
  (BSI-Standard 300-1, 4.3).
- **Not a verdict on the system.** It states what this run observed. Whether a
  system meets the requirements is an assessment by a person.

Signed and stored next to the thing it measures, for example as an OCI artefact
with `oras push` and `cosign sign`, a result becomes evidence a third party can
verify without trusting the pipeline that wrote it.

## How far the measurements reach: coverage per standard

Checks evidence Grundschutz++ requirements. `coverage.mjs` follows a preset's
mapping and says per requirement of the other standard what the results show
about it -- no more than the mapping allows:

```bash
node coverage.mjs --preset nis2 results/*.json > nis2-coverage.md
node coverage.mjs --mapping-file my-mapping.json results/*.json --format csv
```

| State | When |
|---|---|
| satisfied | every target measured and satisfied in full, through `equivalent-to`, `equal-to` or `subset-of` |
| partial | satisfied, but through `intersects-with`/`superset-of`, with a target unmeasured, or by a check that shows its target only in part |
| not satisfied | a measured target was not satisfied |
| not measured | nothing measured any target -- never read as satisfied |
| no mapping | the mapping's gap summary: no Grundschutz++ requirement fits it |

The report leads with the gaps, not a percentage: how many requirements
nothing measures, how many no measurement can reach, and whether the mapping
is still a draft. A preset without a mapping (`gspp`, `lieferkette`, `wlan`)
is Grundschutz++ itself.

## Over a period: did the controls keep working?

A nightly run proves a night. `period.mjs` reads the results of many runs and
says, per check and per requirement, how many runs a period had, how many found
something not as required, and the longest stretch without any run -- from the
start of the period to the first run and from the last to its end included.
With `--every`, the cadence the assessment plan promises, a longer gap is named:
for that stretch nothing shows the control working. That is the question of a
SOC 2 Type II report, and of an ISO or NIS2 audit too.

```bash
node period.mjs results/*.json --from 2026-10-13 --to 2027-01-13 --every 24h
```

## What will be fixed: a POA&M

The last link of the chain. `poam.mjs` turns two things into items: a
requirement the security plan itself claims as *partial* or *planned*, and one
the latest assessment did not find satisfied, whatever the plan claims. Each
item gets a risk that stays open until an action closes it. Actions come from
your own register (ID, title, requirements, due date, status); an item without
one gets no invented date, says that it has none, and is counted. A
requirement the plan calls permanently unfulfilled with an approved residual
risk is a decision, not a missing action: its risk is `deviation-approved`, and
the metadata counts it as `items-deviation-approved`. An action's `owner`, the
person who answers for it (BSI-Standard 300-1, 4.4), becomes the remediation's
prop `responsible`; stderr counts the actions without one.

```bash
node poam.mjs poam.json > poam-out.json
node validate.mjs poam-out.json
```

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

### Raising the library commit

The commit this repository is tested at is in one place, `tools/bsi-library.mjs`.
A dependency bot watches the library and proposes a newer commit as a merge
request; it never merges one. In that merge request CI is red wherever the new
catalog moved something, and the change is completed by hand:

1. `npm run test:presets` names the presets whose counts moved; read why, then
   update `expect` in `presets/<id>.json`.
2. Set `catalog.commit` in each `mappings/src/*.json` to the new commit and
   regenerate the mappings and their review sheets (`node mapping.mjs …`,
   `node mapping.mjs … --review`); a target the catalog dropped is an error
   there, not a silent loss.
3. Run `recheck.mjs` against your own component definitions.

The pin moves together with those changes, never on its own.

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
every preset still yields its expected counts.

Two independent implementations read what the generators write, from one
document per model chained so that every import resolves -- catalog, profile,
security plan, assessment plan, results, POA&M (`test/conformance.mjs`):

- NIST's [oscal-cli](https://github.com/metaschema-framework/oscal-cli) 3.2
  checks the Metaschema constraints the JSON schema cannot express and follows
  every import to its target, through the back-matter resources to the BSI
  catalog. Any warning fails the build. Its model is OSCAL 1.2.1 without
  mapping collections; those are checked by `validate.mjs` alone.
- [compliance-trestle](https://github.com/oscal-compass/compliance-trestle)
  5.1 imports and validates every document, advisory: it cannot follow a
  plan's `#uuid` import of a profile, so it reads a copy of the plan that
  names the profile directly.

## Two rules built in

**Pinned.** The library republishes continuously. A check against "the current
version" cannot be repeated, so the script only accepts a commit and prints it
in the header. Re-running against a newer commit and diffing the output shows
exactly which requirements are new or changed. The pin holds for every path
too: a catalog path is plain segments (no `..`, no leading or trailing `/`),
`recheck` follows a component's source only into the library at a commit, and
`--profile` accepts a profile whose import is exactly this run's catalog URL —
the form `profile.mjs` writes. Anything else is refused, not quietly fetched.

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
them is your work. It is not affiliated with the BSI. The method is published as BSI-Standard
300-1, but catalog and standard are still settling, and a tool cannot
establish conformance anyway — nothing here claims it.

## Development

Development happens in a GitLab project; this GitHub repository is its public
mirror, rewritten and pushed on every change to `main` together with the
release tags (`vX.Y.Z`, see [CHANGELOG.md](CHANGELOG.md)). The CI
configuration stays there; what it checks is described under the validation
above. Issues are welcome
here; a pull request cannot be merged on GitHub, but a change in it will be
carried over by hand.

## Licence

The script is MIT-licensed, see [LICENSE](LICENSE).

The catalogs it reads are © Bundesamt für Sicherheit in der Informationstechnik
(BSI), published under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
The script fetches them at run time; this repository contains none of their
content. If you publish worksheets it produces, they contain BSI text and carry
that licence — or cite requirement IDs and write your assessment in your own words.

The step to ISO of the `nis2-ir` mapping is taken from the mapping table of
ENISA's NIS2 Technical Implementation Guidance, version 1.2,
© European Union Agency for Cybersecurity (ENISA), 2025, licensed
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Changes: only the
Annex A entries of its ISO 27001 column are used, normalised as described in
`tools/enisa-iso.mjs`; the clauses are named in the remarks. The table is
advisory and not legally binding.
