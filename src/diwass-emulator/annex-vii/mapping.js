import { asArray, textOf } from '#/diwass-emulator/xml/parse.js'
import { escapeXml } from '#/diwass-emulator/xml/build.js'

export class Annex7ValidationError extends Error {
  constructor(message) {
    super(message)
    this.faultCode = 'soapenv:Client'
    this.httpStatus = 400
  }
}

const WASTE_CODE_LIST_IDS = {
  baselAnnexIX: 'BASEL',
  oecd: 'OECD',
  annexIIIA: 'ANNEX_IIIA',
  annexIIIB: 'ANNEX_IIIB',
  ecListOfWastes: 'EC_LIST',
  nationalCode: 'NATIONAL'
}

// --- outbound: alpha JSON -> DIWASS request XML -------------------------

function partyXml(tag, party, { includeTransport = false } = {}) {
  const transport =
    includeTransport && party.meansOfTransportCode
      ? `<v11:MeansOfTransportCode>${escapeXml(party.meansOfTransportCode)}</v11:MeansOfTransportCode>`
      : ''

  return `<v11:${tag}>
    <v11:PartyUUID>${escapeXml(party.uuid)}</v11:PartyUUID>
    <v11:Contact>
      <v11:Name>${escapeXml(party.contactDetails.contactPerson)}</v11:Name>
      <v11:TelephoneCompleteNumber>${escapeXml(party.contactDetails.phone)}</v11:TelephoneCompleteNumber>
      <v11:EmailURI>${escapeXml(party.contactDetails.email)}</v11:EmailURI>
    </v11:Contact>
    <v11:OperatorInternalID>${escapeXml(party.operatorId)}</v11:OperatorInternalID>
    ${transport}
  </v11:${tag}>`
}

function declarationPartyXml(tag, uuid, declaration) {
  const { authenticatedBy } = declaration
  return `<v1:${tag}>
    <v11:PartyUUID>${escapeXml(uuid)}</v11:PartyUUID>
    <v11:Signature>
      <v11:name>${escapeXml(authenticatedBy.name)}</v11:name>
      <v11:organizationRole>${escapeXml(authenticatedBy.roleInOrganisation)}</v11:organizationRole>
      <v11:timestamp>${new Date(authenticatedBy.authenticationTimestamp).toISOString()}</v11:timestamp>
    </v11:Signature>
  </v1:${tag}>`
}

function quantityXml(quantity) {
  const mass =
    quantity.tonnes != null
      ? `<v11:MassMeasure><v11:tonnes>${quantity.tonnes}</v11:tonnes></v11:MassMeasure>`
      : ''
  const volume =
    quantity.metersCubed != null
      ? `<v11:VolumeMeasure><v11:volume>${quantity.metersCubed}</v11:volume></v11:VolumeMeasure>`
      : ''
  return `<v11:actualQuantity>${mass}${volume}</v11:actualQuantity>`
}

function wasteClassificationXml(wasteIdentification) {
  return Object.entries(WASTE_CODE_LIST_IDS)
    .filter(([field]) => wasteIdentification[field])
    .map(
      ([field, listId]) =>
        `<v11:WasteTypeCode listID="${listId}">${escapeXml(wasteIdentification[field])}</v11:WasteTypeCode>`
    )
    .join('')
}

function shipmentOriginLocationXml(location) {
  const body = location.partyUuid
    ? `<v11:PartyUUID>${escapeXml(location.partyUuid)}</v11:PartyUUID>`
    : `<v11:AddressDetails>${escapeXml(location.addressDetails)}</v11:AddressDetails>`
  return `<v11:shipmentOriginLocation>${body}</v11:shipmentOriginLocation>`
}

function shipmentLocationResponsiblePersonXml(person) {
  return `<v11:shipmentLocationResponsiblePerson>
    <v11:Name>${escapeXml(person.name)}</v11:Name>
    <v11:TelephoneCompleteNumber>${escapeXml(person.phone)}</v11:TelephoneCompleteNumber>
    <v11:EmailURI>${escapeXml(person.email)}</v11:EmailURI>
  </v11:shipmentLocationResponsiblePerson>`
}

function commodityCodeXml(commodityCodes) {
  return (commodityCodes ?? [])
    .map((code) => `<v11:commodityCode>${escapeXml(code)}</v11:commodityCode>`)
    .join('')
}

export function buildCreateAnnex7RequestBody(payload) {
  const {
    shipment,
    shipmentArranger,
    importerConsignee,
    carriers,
    wasteProducer,
    recoveryFacility,
    recoveryOperation,
    usualDescriptionOfWaste,
    wasteIdentification,
    countriesStatesConcerned,
    declarationOfShipmentArranger
  } = payload

  const carrierXml = carriers
    .map((carrier) => partyXml('carrier', carrier, { includeTransport: true }))
    .join('')

  const producerXml = wasteProducer
    ? partyXml('wasteProducer', wasteProducer)
    : ''

  const facilityXml = `<v11:recoveryLaboratoryFacility>
    <v11:PartyUUID>${escapeXml(recoveryFacility.uuid)}</v11:PartyUUID>
    <v11:Contact>
      <v11:Name>${escapeXml(recoveryFacility.contactDetails.contactPerson)}</v11:Name>
      <v11:TelephoneCompleteNumber>${escapeXml(recoveryFacility.contactDetails.phone)}</v11:TelephoneCompleteNumber>
      <v11:EmailURI>${escapeXml(recoveryFacility.contactDetails.email)}</v11:EmailURI>
    </v11:Contact>
    <v11:OperatorInternalID>${escapeXml(recoveryFacility.operatorId)}</v11:OperatorInternalID>
    <v11:wasteFacilityNameConfidential>${Boolean(recoveryFacility.nameIsConfidential)}</v11:wasteFacilityNameConfidential>
  </v11:recoveryLaboratoryFacility>`

  const transitCountryXml = (countriesStatesConcerned.transitCountries ?? [])
    .map(
      (code) =>
        `<v11:transitCountry><v11:countryID>${escapeXml(code)}</v11:countryID></v11:transitCountry>`
    )
    .join('')

  const referenceXml = shipment.relatedToAnnexVIIDocumentNo
    ? `<v1:referenceAnnexVIIDocumentNo>${escapeXml(shipment.relatedToAnnexVIIDocumentNo)}</v1:referenceAnnexVIIDocumentNo>`
    : ''

  const producerDeclarationXml = wasteProducer?.declaration
    ? declarationPartyXml(
        'declarationProducer',
        wasteProducer.uuid,
        wasteProducer.declaration
      )
    : ''

  return `<v1:CreateAnnex7DocumentTypeRequest>
    <v1:takeBackIndication>${Boolean(shipment.createdDueToTakeBack)}</v1:takeBackIndication>
    <v1:illegalActivityIndication>${Boolean(shipment.createdDueToIllegalActivity)}</v1:illegalActivityIndication>
    ${referenceXml}
    <v1:shipmentArrangerIsAlsoProducerOrCollector>${Boolean(shipmentArranger.isAlsoWasteProducer)}</v1:shipmentArrangerIsAlsoProducerOrCollector>
    <v1:transportAnnouncement>
      ${partyXml('arranger', shipmentArranger)}
      ${partyXml('consignee', importerConsignee)}
      ${quantityXml(shipment.actualQuantity)}
      <v11:actualDateOfShipment>${new Date(shipment.actualDateOfShipment).toISOString().slice(0, 10)}</v11:actualDateOfShipment>
      ${shipment.containerIdentificationNo ? `<v11:containerIdentification>${escapeXml(shipment.containerIdentificationNo)}</v11:containerIdentification>` : ''}
      ${shipmentOriginLocationXml(shipment.shipmentOriginLocation)}
      ${shipmentLocationResponsiblePersonXml(shipment.shipmentLocationResponsiblePerson)}
      ${carrierXml}
      ${producerXml}
      ${facilityXml}
      <v11:recoveryDisposalTypeCode>${escapeXml(recoveryOperation.rCodeDCode)}</v11:recoveryDisposalTypeCode>
      <v11:usualDescriptionOfTheWaste>
        <v11:Description languageID="en">${escapeXml(usualDescriptionOfWaste)}</v11:Description>
      </v11:usualDescriptionOfTheWaste>
      <v11:wasteClassification>${wasteClassificationXml(wasteIdentification)}</v11:wasteClassification>
      ${commodityCodeXml(shipment.commodityCodes)}
      <v11:exportCountry><v11:countryID>${escapeXml(countriesStatesConcerned.exportDispatchCountry)}</v11:countryID></v11:exportCountry>
      <v11:importCountry><v11:countryID>${escapeXml(countriesStatesConcerned.importDestinationCountry)}</v11:countryID></v11:importCountry>
      ${transitCountryXml}
    </v1:transportAnnouncement>
    ${declarationPartyXml('declarationArranger', shipmentArranger.uuid, declarationOfShipmentArranger)}
    ${producerDeclarationXml}
  </v1:CreateAnnex7DocumentTypeRequest>`
}

export const ANNEX_VII_REQUEST_NAMESPACES = {
  v1: 'http://ec.europa.eu/tracesnt/waste/annex7/v1',
  v11: 'http://ec.europa.eu/tracesnt/waste/model/v1',
  v3: 'http://ec.europa.eu/tracesnt/body/v3',
  v4: 'http://ec.europa.eu/sanco/tracesnt/base/v4'
}

// --- inbound: DIWASS request XML -> stored record ------------------------

function requireField(value, fieldName) {
  if (value === undefined || value === null || value === '') {
    throw new Annex7ValidationError(`Missing required field: ${fieldName}`)
  }
  return value
}

export function annex7DocumentFromXml(requestXml) {
  const announcement = requestXml.transportAnnouncement ?? {}
  const carriers = asArray(announcement.carrier)
  const facilities = asArray(announcement.recoveryLaboratoryFacility)
  const wasteCodes = asArray(announcement.wasteClassification?.WasteTypeCode)
  const quantity = announcement.actualQuantity ?? {}

  if (!quantity.MassMeasure && !quantity.VolumeMeasure) {
    throw new Annex7ValidationError(
      'transportAnnouncement.actualQuantity must carry a MassMeasure or a VolumeMeasure'
    )
  }
  if (carriers.length === 0) {
    throw new Annex7ValidationError('At least one carrier is required')
  }
  if (facilities.length === 0) {
    throw new Annex7ValidationError(
      'At least one recoveryLaboratoryFacility is required'
    )
  }
  if (wasteCodes.length === 0) {
    throw new Annex7ValidationError(
      'At least one wasteClassification code is required'
    )
  }

  return {
    takeBackIndication: textOf(requestXml.takeBackIndication) === 'true',
    illegalActivityIndication:
      textOf(requestXml.illegalActivityIndication) === 'true',
    referenceAnnexVIIDocumentNo:
      textOf(requestXml.referenceAnnexVIIDocumentNo) ?? null,
    arrangerOperatorInternalId: textOf(
      announcement.arranger?.OperatorInternalID
    ),
    consigneeOperatorInternalId: textOf(
      announcement.consignee?.OperatorInternalID
    ),
    actualDateOfShipment: textOf(
      requireField(announcement.actualDateOfShipment, 'actualDateOfShipment')
    ),
    carrierOperatorInternalIds: carriers.map((carrier) =>
      textOf(carrier.OperatorInternalID)
    ),
    facilityOperatorInternalIds: facilities.map((facility) =>
      textOf(facility.OperatorInternalID)
    ),
    recoveryDisposalTypeCode: textOf(
      requireField(
        announcement.recoveryDisposalTypeCode,
        'recoveryDisposalTypeCode'
      )
    ),
    exportCountryId: textOf(
      requireField(
        announcement.exportCountry?.countryID,
        'exportCountry.countryID'
      )
    ),
    importCountryId: textOf(
      requireField(
        announcement.importCountry?.countryID,
        'importCountry.countryID'
      )
    ),
    statusCode: 'OK'
  }
}
