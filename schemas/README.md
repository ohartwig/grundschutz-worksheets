# OSCAL JSON schemas

Copies of `oscal_complete_schema.json` from the NIST OSCAL releases
([v1.1.3](https://github.com/usnistgov/OSCAL/releases/tag/v1.1.3),
[v1.2.2](https://github.com/usnistgov/OSCAL/releases/tag/v1.2.2)), unchanged.
`validate.mjs` checks each against the SHA-256 in `../schemas.json` before use.

They are kept here so that validation works where github.com and its release
downloads are unreachable - for example on IPv6-only CI runners, which can
fetch raw.githubusercontent.com but not github.com.

OSCAL is a work of the U.S. National Institute of Standards and Technology and
is not subject to copyright in the United States; see the
[NIST OSCAL license](https://github.com/usnistgov/OSCAL/blob/main/LICENSE.md).
