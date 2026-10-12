# Changelog

What changed for someone who uses the scripts, newest first. Releases are
tagged `vX.Y.Z` and written here by the release tool from the commit messages;
`main` may be ahead of the latest one. Hand-written entries mark what is
**breaking**: what can change an existing call or a spreadsheet built on the
output.

## [1.2.0](https://github.com/ohartwig/grundschutz-worksheets/compare/v1.1.0...v1.2.0) (2026-10-12)

### :sparkles: Features

* **standards:** DORA as a catalog of its own; mappings by article

## [1.1.0](https://github.com/ohartwig/grundschutz-worksheets/compare/v1.0.0...v1.1.0) (2026-10-12)

### :sparkles: Features

* **standards:** NIS2 as a catalog of its own, from the Official Journal

## [1.0.0](https://github.com/ohartwig/grundschutz-worksheets/compare/v0.2.1...v1.0.0) (2026-10-11)

### :boom: BREAKING CHANGES

* results.mjs refuses a run file without "plan": { "href": ... }. Add the assessment plan the check belongs to (written by assessment-plan.mjs), with "file" for its SHA-256.

### :sparkles: Features

* **results:** a run names the assessment plan it follows

## [0.2.1](https://github.com/ohartwig/grundschutz-worksheets/compare/v0.2.0...v0.2.1) (2026-10-11)

### :repeat: Continuous Integrations

* **mirror:** leave the CI configuration out of the mirror
* **mirror:** the changelog on GitHub links to GitHub

### :repeat: Chores

* drop test output committed by accident

## [0.2.0](https://github.com/ohartwig/grundschutz-worksheets/compare/v0.1.0...v0.2.0) (2026-10-11)

### :sparkles: Features

* imports through back-matter with SHA-256; the plan states what does not apply

### :repeat: Continuous Integrations

* GitLab is home now -- yasrt releases, pinup watches the library, GitHub is the mirror

## 0.1.0 (2026-10-11)

The first release: everything up to the review sheets for the draft
mappings. Below is what changed since 2026-10-07; before that, the scripts
had no version.

### Breaking

- **CSV:** a new column `relationship` stands between `from` and `statement`,
  one entry per `from` entry. A sheet that reads columns by position needs
  updating; one that reads them by header name does not. (#6)
- **`--mapping` reads only the library.** A mapping on disk is named with
  `--mapping-file`; nothing is guessed from what exists in the working
  directory. (#6)
- **An own mapping is pinned to its commit.** A `--mapping-file` must target
  exactly the catalog and commit the run reads, otherwise the worksheet stops
  with exit 2: regenerate the mapping with `mapping.mjs` at that commit. (#6)
- **Paths stay in the library.** A catalog path with an empty segment, `.` or
  `..` is refused by every script; `recheck` follows a component's source only
  into the library at a commit; `--profile` accepts only a profile that imports
  this run's catalog URL. (#4)
- **CSV cells** that start with `=`, `+`, `-`, `@`, a tab or CR get a leading
  `'`, so a spreadsheet shows them as text instead of running them. (#4)
- **OSCAL 1.2.3:** the system security plan, assessment plan, assessment
  results and POA&M are written as 1.2.3 (component definitions and mappings
  stay 1.2.2, the library's version). `validate.mjs` ships the 1.2.3 schema. (#5)

### New

- **Presets** (`--preset`, `--presets`): one name per audit scope -- `gspp`,
  `iso27001`, `itgs2023`, `lieferkette`, `wlan`, `nis2`, `dora`, `c5`, `a5`.
  Each is a starting point, not an approved scope; worksheets made from one
  say so under their header. (#6)
- **Own mappings** for NIS2, DORA and C5:2026 (`mapping.mjs`, `mappings/`),
  as unreviewed drafts. A draft may not claim full coverage (`subset-of`,
  `equal-to`, `equivalent-to`). (#6)
- `--catalog-file` for a catalog outside the library, pinned by its SHA-256
  (A5). `--levels`, `--modal`, and `*` prefixes in `--sources`. (#6)
- **Parameters** in a tailoring file become the profile's `set-parameters`,
  and the worksheet prints your value in place of the catalog's blank. (#7)
- **Review sheets** for the draft mappings: `mapping.mjs --review`, committed
  in `mappings/review/`. (#9)
