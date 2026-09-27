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

Node 18 or later, no dependencies, no install. The catalog is fetched from the
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
| aktivieren, deaktivieren, einschränken, installieren, blockieren, verschlüsseln, protokollieren, zuweisen, autorisieren | Configuration: a place in the IaC or GitOps repository at a named commit, plus a measurement that it is in effect |
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
