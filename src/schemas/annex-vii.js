import Joi from 'joi'

/*
[Contact Person] 
personal details of a contact person
is used within the annexvii schema
in shipmentArranger, importerConsignee, carriers, wasteProducer and recoveryFacility
*/
const contactDetailsSchema = Joi.object({
  contactPerson: Joi.string().required(),
  phone: Joi.string().required(),
  email: Joi.string().email().required(),
  fax: Joi.string(),
  websiteUrl: Joi.string().uri()
})

/*
[Quantity]
quantity of an item in a shipment
is used within the annexvii schema
in shipment.actualQuantity, facilityReceptionConfirmation (accepted/rejectedQuantity), facilityCompletionCertificate
(quantityPreparedForReuseOrRecycled/quantityRecoveredInOtherManner),
and takeBackRequest.quantityForTakeBack
*/
const quantitySchema = Joi.object({
  tonnes: Joi.number().allow(null),
  metersCubed: Joi.number().allow(null)
})

/*
[Authenticated By]
authenticating person for various declarations in the annexvii schema
is used in [Declaration]
*/
const authenticatedBySchema = Joi.object({
  name: Joi.string().required(),
  email: Joi.string().email().required(),
  roleInOrganisation: Joi.string().required(),
  authenticationTimestamp: Joi.date().iso().required(),
  additionalAuthenticationString: Joi.string().allow(null),
  uuid: Joi.string().guid().required()
})

/*
[Declaration]
section to be signed by an authenticated person
is used in various parts of the annexvii schema wherever a signed declaration is required.
in carriers, wasteProducer, declarationOfShipmentArranger, carrierTransferConfirmations,
consigneeReceptionConfirmation, facilityReceptionConfirmation, facilityCompletionCertificate
*/
const declarationSchema = Joi.object({
  description: Joi.string(),
  authenticatedBy: authenticatedBySchema.required()
})

/*
[Party]
a party involved in the shipment, such as a shipment arranger, importer/consignee, carrier, waste producer or recovery facility
is used in various parts of the annexvii schema wherever a party is required.
*/
const partySchema = Joi.object({
  description: Joi.string(),
  operatorId: Joi.string().required(),
  uuid: Joi.string().guid().required(),
  contactDetails: contactDetailsSchema.required()
})

/* 
[Language Value]
a value for a field in a specific language
is used within the annexvii schema
*/
const languageValueSchema = Joi.object({
  languageCode: Joi.string(),
  value: Joi.string().allow(null)
})

/*
[Waste Identification]
codes identifying the waste being shipped, matching box 10 of the paper Annex VII form -
a shipment fills in whichever of the six classification codes are relevant, not just one
is used within the annexvii schema
*/
const wasteIdentificationSchema = Joi.object({
  baselAnnexIX: Joi.string(),
  oecd: Joi.string(),
  annexIIIA: Joi.string(),
  annexIIIB: Joi.string(),
  ecListOfWastes: Joi.string(),
  nationalCode: Joi.string(),
  commodityCodes: Joi.array().items(Joi.string())
}).or(
  'baselAnnexIX',
  'oecd',
  'annexIIIA',
  'annexIIIB',
  'ecListOfWastes',
  'nationalCode'
)

/*
[Facility]
a facility involved in the shipment, such as a recovery facility
is used within the annexvii schema
*/
const facilitySchema = Joi.object({
  operatorId: Joi.string().required(),
  uuid: Joi.string().guid().required(),
  facilityType: Joi.string().required(),
  isInterimFacility: Joi.boolean().required(),
  contactDetails: contactDetailsSchema.required(),
  nameIsConfidential: Joi.boolean(),
  confidentialityExplanation: Joi.string().allow(null)
})

/*
[Attachments]
an array of attachments associated with the annexvii document
is used within the annexvii schema
*/
const attachmentsSchema = Joi.array().items(Joi.any()).default([])

/*
[Annex VII Schema]
The main schema for the Annex VII document, which includes all the required fields and nested objects for a complete shipment record.
*/
export const annexViiSchema = Joi.object({
  annexVIIDocumentNo: Joi.string().required(),

  shipmentArranger: partySchema
    .keys({ isAlsoWasteProducer: Joi.boolean().required() })
    .required(),

  importerConsignee: partySchema.required(),

  shipment: Joi.object({
    actualQuantity: quantitySchema.required(),
    actualDateOfShipment: Joi.date().iso().required(),
    containerIdentificationNo: Joi.string().allow(null, ''),
    createdDueToTakeBack: Joi.boolean().required(),
    createdDueToIllegalActivity: Joi.boolean().required(),
    relatedToNotificationNo: Joi.string().allow(null),
    relatedToMovementDocumentNo: Joi.string().allow(null),
    relatedToAnnexVIIDocumentNo: Joi.string().allow(null),
    commodityCodes: Joi.array().items(Joi.string()),

    /*
    [Shipment Origin Location]
    Where the shipment actually starts - DIWASS's own parameter mapping
    marks this mandatory on every Annex VII, as either a known party
    (partyUuid) or a free-text address, independent of who the waste
    producer is. Previously only captured (optionally) under
    wasteProducer.shipmentStartLocation, which meant it was silently
    dropped whenever the arranger was also the producer - see
    green-list-waste-alpha-api test-payloads/annex-vii/ASSUMPTIONS.md A6.
    */
    shipmentOriginLocation: Joi.object({
      partyUuid: Joi.string().guid(),
      addressDetails: Joi.string()
    })
      .or('partyUuid', 'addressDetails')
      .required(),

    shipmentLocationResponsiblePerson: Joi.object({
      name: Joi.string().required(),
      phone: Joi.string().required(),
      email: Joi.string().email().required()
    }).required()
  }).required(),

  carriers: Joi.array()
    .items(
      partySchema.keys({
        meansOfTransportCode: Joi.string().required(),
        transferDate: Joi.date().iso().required(),
        declaration: declarationSchema.required()
      })
    )
    .min(1)
    .required(),

  wasteProducer: partySchema.keys({
    shipmentStartLocation: Joi.object({
      description: Joi.string(),
      operatorId: Joi.string().required(),
      countryCode: Joi.string().required(),
      postalCode: Joi.string().required(),
      cityName: Joi.string().required(),
      addressDetails: Joi.string().required(),
      longitude: Joi.number(),
      latitude: Joi.number(),
      responsiblePerson: Joi.object({
        name: Joi.string().required(),
        phone: Joi.string().required(),
        email: Joi.string().email().required()
      }).required()
    }).required(),
    declaration: declarationSchema.required()
  }),

  recoveryFacility: facilitySchema.required(),

  recoveryOperation: Joi.object({
    description: Joi.string(),
    rCodeDCode: Joi.string().required()
  }).required(),

  usualDescriptionOfWaste: Joi.string().required(),

  wasteIdentification: wasteIdentificationSchema.required(),

  countriesStatesConcerned: Joi.object({
    exportDispatchCountry: Joi.string().required(),
    importDestinationCountry: Joi.string().required(),
    transitCountries: Joi.array().items(Joi.string())
  }).required(),

  declarationOfShipmentArranger: declarationSchema.required(),

  attachments: attachmentsSchema,

  carrierTransferConfirmations: Joi.array().items(
    Joi.object({
      confirmationId: Joi.string().required(),
      carrierOperatorId: Joi.string().required(),
      carrierUuid: Joi.string().guid().required(),
      meansOfTransport: Joi.string().required(),
      transferDate: Joi.date().iso().required(),
      declaration: declarationSchema.required(),
      attachments: attachmentsSchema
    })
  ),

  consigneeReceptionConfirmation: Joi.object({
    confirmationId: Joi.string().required(),
    importerConsignee: partySchema.required(),
    receptionDate: Joi.date().iso().required(),
    declaration: declarationSchema.required(),
    attachments: attachmentsSchema
  }),

  facilityReceptionConfirmation: Joi.object({
    confirmationId: Joi.string().required(),
    facility: facilitySchema.required(),
    receptionDate: Joi.date().iso().required(),
    acceptedQuantity: quantitySchema.required(),
    rejectedQuantity: quantitySchema.required(),
    rejectionDescription: languageValueSchema,
    wasteIdentification: wasteIdentificationSchema.required(),
    designationAndCompositionOfWasteReceived: Joi.string().required(),
    declaration: declarationSchema.required(),
    attachments: attachmentsSchema
  }),

  facilityCompletionCertificate: Joi.object({
    certificateId: Joi.string().required(),
    facility: facilitySchema.required(),
    certificateDate: Joi.date().iso().required(),
    quantityPreparedForReuseOrRecycled: quantitySchema.required(),
    quantityRecoveredInOtherManner: quantitySchema.required(),
    wasteIdentification: wasteIdentificationSchema.required(),
    designationAndCompositionOfWasteReceived: Joi.string().required(),
    declaration: declarationSchema.required(),
    attachments: attachmentsSchema
  }),

  takeBackRequest: Joi.object({
    requestId: Joi.string().allow(null),
    quantityForTakeBack: quantitySchema,
    reasonsForRequestingTakeBack: languageValueSchema,
    dateOfTakeBackRequest: Joi.date().iso().allow(null),
    attachments: attachmentsSchema
  }),

  cancellation: Joi.object({
    actionId: Joi.string().allow(null),
    actionCode: Joi.string().allow(null),
    cancellationReasonsOrDetails: Joi.string().allow(null),
    attachments: attachmentsSchema
  })
})
