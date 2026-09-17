# Assumptions to verify against real DIWASS

This pack was built and validated against this repo's own DIWASS emulator
(`src/diwass-emulator/`), which is itself built to DIWASS's published spec
pack rather than a reachable test system - see the alpha site's
[data contracts](../../../green-list-waste-alpha/diwass-data-contracts.html)
page for the full field-level contract and its own "unconfirmed" notes.

Two different kinds of gap are mixed together below, and it matters which
is which:

- **Behavioural assumptions (A1-A5)**: the emulator accepts something real
  DIWASS's documented business rules suggest it might reject, or the
  emulator's error shape may not match DIWASS's real one. These need a real
  call against DIWASS to resolve either way - the payload pack already
  exercises them, so re-running this pack once credentials exist is most of
  the work.
- **Known implementation gaps (A6-A10)**: fields the DIWASS spec pack
  documents as mandatory that `src/diwass-emulator/annex-vii/mapping.js`
  (the function that builds the _outbound_ SOAP request the alpha actually
  sends) never emits at all, regardless of what the caller's JSON payload
  contains. These are not things to "test" - they're missing code. **No
  payload in this pack, however correct, can route around them.** They
  should be fixed in `buildCreateAnnex7RequestBody` before this pack (or
  any real shipment) is submitted to an actual DIWASS test environment,
  or every happy-path submission here risks a real rejection for reasons
  that have nothing to do with the payload.

Priority order below is "fix/verify this first," not severity for its own
sake.

## Fixed (previously P0)

### A6. `shipmentOriginLocation` and `shipmentLocationResponsiblePerson` - FIXED

~~Never sent~~ - **fixed** in the same change that built this pack. Both
are now top-level required fields on `shipment` in `src/schemas/annex-vii.js`
(either `partyUuid` or `addressDetails` for the origin, plus a required
responsible-person contact), independent of `wasteProducer`, and
`buildCreateAnnex7RequestBody` (`src/diwass-emulator/annex-vii/mapping.js`)
now emits both as `<v11:shipmentOriginLocation>` /
`<v11:shipmentLocationResponsiblePerson>` right after
`actualDateOfShipment`, matching the field order in DIWASS's own
`Submit_annex7_request.xml` sample (also now used verbatim as this repo's
own emulator regression test - see
`src/diwass-emulator/annex-vii/route.test.js`, which already exercised
these exact elements on the _inbound_ parsing side). Every payload in this
pack sets `shipment.shipmentOriginLocation` /
`shipment.shipmentLocationResponsiblePerson`, and
`scripts/run-validation.mjs` confirms `buildCreateAnnex7RequestBody` now
includes both elements in the generated XML.

### A7. `commodityCode` - FIXED

~~Accepted in the JSON but never sent~~ - **fixed** alongside A6.
`buildCreateAnnex7RequestBody` now emits one `<v11:commodityCode>` element
per entry in `shipment.commodityCodes`, placed after `wasteClassification`
and before `exportCountry` (matching the spec sample's field order).

## P1 - High: likely to cause a real rejection, not yet testable via the emulator

### A1. "Mass or volume, not neither" isn't enforced by the JSON schema

`quantitySchema` (`src/schemas/annex-vii.js:25-28`) allows `tonnes` and
`metersCubed` to both be `null`. The contract requires exactly one.
**Confirmed by this pack**: `error-cases/json-05-neither-mass-nor-volume.json`
passes Joi and is persisted locally (`201`), then fails downstream once the
SOAP body reaches the emulator's `annex7DocumentFromXml` check
(`diwass.status: "ERROR"`, message `"transportAnnouncement.actualQuantity
must carry a MassMeasure or a VolumeMeasure"`) - see
`results/validation-results.md`, `err-json-05`. **Action:** add a
schema-level `.xor('tonnes', 'metersCubed')`-equivalent check so this fails
fast at `/annexvii` instead of round-tripping to DIWASS first.

### A4. The arranger-is-producer conditional isn't enforced anywhere

`shipmentArrangerIsAlsoProducerOrCollector: false` should make
`wasteProducer` and `declarationProducer` mandatory (the parameter
mapping's own "Yes, unless..." rule). Neither the JSON schema
(`wasteProducer` is an optional key at `src/schemas/annex-vii.js:159`) nor
the emulator's inbound validation (`annex7DocumentFromXml`,
`src/diwass-emulator/annex-vii/mapping.js:172-239`) checks this.
**Confirmed by this pack**: `error-cases/soap-08-missing-producer-block.xml`
sets the flag `false` with no producer block and still gets `200 OK` from
the emulator - see `err-soap-08`. Real DIWASS's actual behaviour here is
unconfirmed and worth testing early, since it's the most likely single
cause of a rejected first submission once GB gets access.

### A8. `facilityLaboratoryTypeCode` (R/L) doesn't exist anywhere in this build

Mandatory per the spec on every `recoveryLaboratoryFacility`. Not present
in the JSON schema's `facilitySchema` (`src/schemas/annex-vii.js:106-114`)
or in the outbound XML. **Action:** add the field and a fixed `R` value for
Green List Waste's recovery-only flow (Laboratory facilities are out of
scope per the data contracts page's own scope note).

### A9. Interim-facility indicators are captured but silently dropped

`facilitySchema.isInterimFacility` is required by the JSON schema and every
happy-path payload sets it, but `mapping.js`'s `facilityXml` never emits
`operationalIndicators.InterimFacility` (or either
`NextSubsequentInterim...` flag) in the outbound XML - see
`src/diwass-emulator/annex-vii/mapping.js:98-107`. `happy-path/07` sets
`isInterimFacility: true` specifically to exercise this and would currently
submit as if it were `false`. **Action:** wire `isInterimFacility` (plus
the two "next facility" booleans, not modelled in the JSON schema at all
yet) into the outbound XML.

## P2 - Medium

### A2. Country code format (alpha-2 vs UN M49 numeric) isn't validated

The data contracts page documents that `exportCountry` / `importCountry` /
`transitCountry` use UN M49 numeric codes (e.g. `826` for GB), distinct
from the alpha-2 codes (`GB`) used on operator addresses - but the
emulator applies no format check to either. **Confirmed by this pack**:
`error-cases/soap-05-alpha2-country-code-instead-of-numeric.xml` sends
`exportCountry.countryID = "GB"` and gets `200 OK` - see `err-soap-05`.
Every happy-path payload in this pack also uses alpha-2
(`countriesStatesConcerned.exportDispatchCountry: "GB"` etc., matching the
alpha's own JSON schema and the worked transform example in
`examples/annexvii-create-request.json`) rather than numeric codes, so this
whole pack is affected, not just the one error case built to demonstrate
it. **Action:** confirm with real DIWASS whether alpha-2 or numeric is
actually required before go-live - if numeric, both the schema and the
outbound mapping need a country-code translation step this build doesn't
have today.

### A10. `confidentialityLegalExplanation` is optional and unmapped

Contract requires an explanation whenever `wasteFacilityNameConfidential`
is `true`. The JSON schema's `confidentialityExplanation`
(`src/schemas/annex-vii.js:113`) is optional with no conditional
requirement, and it's never emitted in the outbound XML regardless.
`happy-path/07` sets it anyway (for forward compatibility) but it would not
currently reach DIWASS. **Action:** make it conditionally required in the
schema and wire it into the XML builder alongside A9.

### A3. No cross-referencing of party `OperatorInternalID`s

Documented as a deliberate Phase 1 simplification in this repo's own
CLAUDE.md ("No cross-referencing between operators and Annex VII documents
yet"). **Confirmed by this pack**: `error-cases/soap-07-unresolved-operator-id.xml`
references `OperatorInternalID = 999999`, never registered, and gets
`200 OK` - see `err-soap-07`. Real DIWASS's actual behaviour for an
unresolved or not-yet-`Valid` operator ID is unconfirmed - test this early,
since it's a very plausible first-submission failure mode for a UK
exporter whose counterpart hasn't been found/registered correctly.

### A11. Only one recovery/disposal code per shipment

The contract allows "one or more repetitions" of `recoveryDisposalTypeCode`;
`recoveryOperation.rCodeDCode` (`src/schemas/annex-vii.js:180-183`) and the
outbound mapping both support only a single value. Not exercised by this
pack (every scenario here only needs one R-code) - flagged for whenever a
multi-operation shipment needs representing.

## P3 - Low

### A5. Malformed XML isn't reliably rejected as malformed

`parseSoapMessage` (`src/diwass-emulator/xml/parse.js:21`) calls
`fast-xml-parser`'s `.parse(rawXml)` with no validation flag set.
**Confirmed by this pack**: `error-cases/soap-01-malformed-xml.xml` (an
unclosed `<illegalActivityIndication>` tag) doesn't produce a parse-level
SOAP fault - the parser silently mis-nests the rest of the document, and
the request fails later on an unrelated business rule (missing
`actualQuantity`) instead - see `err-soap-01`. The `400` in
`validation-results.md` is correct by coincidence, not because the
malformed structure was caught as such. A real SOAP toolkit (which is
almost certainly what DIWASS itself runs on) would very likely reject
non-well-formed XML outright, probably before the message even reaches
business validation - this emulator can't currently rehearse that failure
mode faithfully. Low priority only because it doesn't affect any payload
this pack expects to be accepted.

### A12. Waste code list IDs (`listID` on `WasteTypeCode`) are the emulator's own invention

`WASTE_CODE_LIST_IDS` (`src/diwass-emulator/annex-vii/mapping.js:12-19`)
maps `ecListOfWastes` -> `EC_LIST`, `baselAnnexIX` -> `BASEL`, etc. Only
`BASEL` appears in the one spec pack sample the data contracts page found;
the rest are inferred by analogy, not confirmed.

### A13. `createOperator`'s response shape is inferred, not sampled

No `CreateOperatorResponse` sample exists in the spec pack. The emulator
(and this pack's `scripts/seed-operators.mjs`) assumes it returns
`OperatorInternalID` alone, by analogy with `updateOperator`'s documented
response - see the data contracts page's own callout on this. Every
happy-path payload's `operatorId` ultimately depends on this assumption
holding.

### A14. No WS-Security / SOAP-fault path is exercised at all

The emulator has no authentication layer - it accepts any request
regardless of the `WS-Security` header, or its absence. This pack
therefore cannot rehearse a credential/timestamp failure (the "SOAP-level
fault, not a business error" class the data contracts page calls out) -
that whole failure mode is genuinely new territory once real DIWASS
credentials exist, not something re-running this pack will cover.

---

## Suggested order of operations once DIWASS test credentials land

1. A6/A7 are already fixed (see above) - `shipmentOriginLocation`,
   `shipmentLocationResponsiblePerson` and `commodityCode` are wired
   through end to end and confirmed present in the generated SOAP body.
   A8/A9/A10 (facility type code, interim-facility indicators,
   confidentiality explanation) are still open - worth fixing next, same
   pattern as A6/A7, before this pack's facility-related scenarios
   (`happy-path/07`) can be trusted against a real environment.
2. Point `DIWASS_BASE_URL` at the real test gateway and re-run
   `scripts/run-validation.mjs` unchanged - the happy-path results
   immediately show which remaining assumptions (A1, A2, A3, A4, A8, A9,
   A10) hold in practice.
3. Diff the real `annexVIIDocumentNo` and fault shapes against
   `results/validation-results.md` and the emulator's own generated values
   (`GLW.GB<year><sequence>i` - see `src/diwass-emulator/annex-vii/store.js`)
   to confirm or correct A12/A13.
4. A14 needs its own dedicated test (a deliberately wrong or expired
   `WS-Security` header) - not covered by re-running this pack as-is.
