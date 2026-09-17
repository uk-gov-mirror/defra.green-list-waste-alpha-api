# Annex VII test payload pack

Supports outcome **OR-01**: a complete set of happy-path and error-case
Annex VII payloads, pre-validated against this repo's own DIWASS emulator,
so the DIWASS integration test can run immediately once GB gets real test
credentials - no payload-writing left to do at that point.

Every payload here is built against the data contracts documented on the
alpha site's [data contracts](../../../green-list-waste-alpha/diwass-data-contracts.html)
and [emulator deep dive](../../../green-list-waste-alpha/diwass-emulator-deep-dive.html)
pages, and against this repo's actual `src/schemas/annex-vii.js` and
`src/diwass-emulator/` code - not re-derived from scratch.

## Contents

```
manifest.json          One entry per payload: file, target endpoint, description, expected result
operators/
  seed-operators.json    Seven operators (exporter, consignee, 2 carriers, waste producer, 2 facilities)
  seeded-operators.json  Generated - the actual OperatorInternalIDs/UUIDs a run assigned (gitignored-worthy per environment; regenerate per database)
happy-path/             7 successful Annex VII submission scenarios (see manifest.json for what each covers)
error-cases/            14 error/edge-case payloads - 6 caught by the alpha's own JSON schema, 8 sent as raw SOAP
                        directly at the emulator to exercise structure/business rules the JSON layer can't reach
scripts/
  seed-operators.mjs      Registers + approves the seed operators against a running emulator
  run-validation.mjs      Submits every payload in manifest.json and records actual vs expected results
results/
  validation-results.md   Generated evidence from the last validation run (see below)
ASSUMPTIONS.md          Every known gap between this build and DIWASS's documented contract, priority-ordered
```

## Running it

Start the API against any Mongo instance (see the main README's "Running
it locally"), then from this directory:

```bash
BASE_URL=http://127.0.0.1:3055 node scripts/seed-operators.mjs
BASE_URL=http://127.0.0.1:3055 node scripts/run-validation.mjs
```

`seed-operators.mjs` must run first and against a **fresh** database - it
registers the seven operators every payload in this pack references by
UUID/OperatorInternalID, and DIWASS (and this emulator) rejects a second
registration with the same EORI/VAT outright. Re-running it against a
database that already has these operators will fail on the first entry.

`run-validation.mjs` submits the happy-path payloads and JSON-level error
cases through `POST /annexvii` (the same route a real submission will use
once `DIWASS_BASE_URL` points at the real gateway), and the SOAP-level
error cases directly against `/diwass/annex-vii` / `/diwass/operators` -
see the comment at the top of that script for why. It writes
`results/validation-results.md`.

## What's in the pack

### Happy path (7 payloads)

| ID    | Scenario                                                                   |
| ----- | -------------------------------------------------------------------------- |
| hp-01 | Baseline: arranger is also producer, single road carrier, mass only        |
| hp-02 | Two-leg journey (road + barge), two carriers, mass and volume both given   |
| hp-03 | Arranger is NOT the producer - `wasteProducer` + its declaration populated |
| hp-04 | Volume-only quantity                                                       |
| hp-05 | Classified under Basel Annex IX instead of the EC list of wastes           |
| hp-06 | Classified under the OECD green list                                       |
| hp-07 | Interim, name-confidential facility, with a transit country                |

### Error / edge cases (14 payloads)

JSON-level (rejected by `/annexvii`'s own Joi schema or business logic,
before a SOAP request is ever built):

| ID          | What it tests                                                                                        |
| ----------- | ---------------------------------------------------------------------------------------------------- |
| err-json-01 | Missing required field (`actualDateOfShipment`)                                                      |
| err-json-02 | Unrecognised EWC waste classification code                                                           |
| err-json-03 | Empty `carriers` array                                                                               |
| err-json-04 | Malformed email address                                                                              |
| err-json-05 | Neither mass nor volume given - **passes local validation, fails at DIWASS** (see ASSUMPTIONS.md A1) |
| err-json-06 | Duplicate `annexVIIDocumentNo` (run after hp-01)                                                     |

SOAP-level (sent directly to the emulator's `/diwass/*` routes, since a
malformed or conditionally-invalid SOAP body never reaches DIWASS through
the JSON layer - the schema would reject it first):

| ID          | What it tests                                                   |
| ----------- | --------------------------------------------------------------- |
| err-soap-01 | Structurally malformed XML (unclosed tag)                       |
| err-soap-02 | `actualQuantity` present but empty (no mass or volume)          |
| err-soap-03 | No `carrier` element at all                                     |
| err-soap-04 | No `wasteClassification` element at all                         |
| err-soap-05 | Alpha-2 country code (`GB`) instead of UN M49 numeric           |
| err-soap-06 | Duplicate operator registration (EORI already in use)           |
| err-soap-07 | Annex VII referencing an unregistered `OperatorInternalID`      |
| err-soap-08 | Arranger-is-producer flag false, but no producer block supplied |

## Before this goes anywhere near real DIWASS

Read **ASSUMPTIONS.md** first. The two P0 gaps this pack originally found
(`shipmentOriginLocation`/`shipmentLocationResponsiblePerson` and
`commodityCode` never being sent) are already fixed in
`src/diwass-emulator/annex-vii/mapping.js` and `src/schemas/annex-vii.js` -
confirmed present in the generated SOAP body and covered by every payload
in this pack. What's left (A1-A5, A8-A14) are either genuine behavioural
questions only a real DIWASS call can answer, or smaller implementation
gaps (facility type code, interim-facility indicators, confidentiality
explanation) worth fixing the same way before relying on those specific
scenarios.
