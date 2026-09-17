#!/usr/bin/env node
/*
 * Registers every operator in operators/seed-operators.json against a
 * running DIWASS emulator (CreateOperatorRequest), then approves each one
 * (ApproveOperatorRequest, emulator-only - see CLAUDE.md "Phase 1.5") so
 * they're usable as a party on an Annex VII submission straight away.
 *
 * Writes operators/seeded-operators.json: role -> { operatorInternalId,
 * uuid, name, identifier }. The happy-path and error-case payloads in this
 * pack reference these UUIDs/IDs directly, so run this before
 * run-validation.mjs against a fresh database.
 *
 * Usage: BASE_URL=http://127.0.0.1:3055 node scripts/seed-operators.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'

const BASE_URL = process.env.BASE_URL ?? 'http://127.0.0.1:3055'
const packRoot = new URL('../', import.meta.url)

const seedFile = fileURLToPath(
  new URL('operators/seed-operators.json', packRoot)
)
const outFile = fileURLToPath(
  new URL('operators/seeded-operators.json', packRoot)
)

const seeds = JSON.parse(readFileSync(seedFile, 'utf8'))

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function createOperatorRequestXml(seed) {
  return `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:v4="http://ec.europa.eu/sanco/tracesnt/base/v4" xmlns:v2="http://ec.europa.eu/tracesnt/directory/operator/v2" xmlns:v1="http://ec.europa.eu/tracesnt/directory/operator/base/v1">
  <soapenv:Header>
    <v4:LanguageCode>en</v4:LanguageCode>
    <v4:WebServiceClientId>wsr-system</v4:WebServiceClientId>
  </soapenv:Header>
  <soapenv:Body>
    <v2:CreateOperatorRequest>
      <v2:Operator>
        <v1:Name>${escapeXml(seed.name)}</v1:Name>
        <v1:OperatorAddress main="true">
          <v1:Address>
            <v1:Street>${escapeXml(seed.street)}</v1:Street>
            <v1:City>
              <v1:Name>${escapeXml(seed.city)}</v1:Name>
              <v1:PostalCode>${escapeXml(seed.postalCode)}</v1:PostalCode>
              <v1:CountryID>${escapeXml(seed.countryId)}</v1:CountryID>
            </v1:City>
          </v1:Address>
        </v1:OperatorAddress>
        <v1:OperatorContactDetail>
          <v1:ContactDetail type="phone">${escapeXml(seed.phone)}</v1:ContactDetail>
        </v1:OperatorContactDetail>
        <v1:OperatorContactDetail>
          <v1:ContactDetail type="contact_person_name">${escapeXml(seed.contactPerson)}</v1:ContactDetail>
        </v1:OperatorContactDetail>
        <v1:OperatorContactDetail>
          <v1:ContactDetail type="email">${escapeXml(seed.email)}</v1:ContactDetail>
        </v1:OperatorContactDetail>
        <v1:Identifier type="${escapeXml(seed.identifierType)}" name="${escapeXml(seed.identifierName)}" main="true">${escapeXml(seed.identifierValue)}</v1:Identifier>
        <v1:Activity>
          <v1:ActivityType>
            <v1:Chapter name="Waste Shipment Regulation">wsr</v1:Chapter>
            <v1:Section name="Waste Shipment Regulation">WSR</v1:Section>
            <v1:Type name="WSR Operator">waste_operator</v1:Type>
          </v1:ActivityType>
          <v1:ResponsibleAuthorityActivityCode>${escapeXml(seed.responsibleAuthorityActivityCode)}</v1:ResponsibleAuthorityActivityCode>
        </v1:Activity>
      </v2:Operator>
    </v2:CreateOperatorRequest>
  </soapenv:Body>
</soapenv:Envelope>`
}

function approveOperatorRequestXml(operatorInternalId) {
  return `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:v2="http://ec.europa.eu/tracesnt/directory/operator/v2">
  <soapenv:Body>
    <v2:ApproveOperatorRequest>
      <v2:OperatorInternalID>${operatorInternalId}</v2:OperatorInternalID>
    </v2:ApproveOperatorRequest>
  </soapenv:Body>
</soapenv:Envelope>`
}

async function postSoap(path, xml) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml' },
    body: xml
  })
  const text = await response.text()
  return { status: response.status, text }
}

function extractTag(xml, tag) {
  const match = xml.match(new RegExp(`<[\\w:]*${tag}>([^<]*)</[\\w:]*${tag}>`))
  return match ? match[1] : null
}

async function main() {
  const results = {}

  for (const seed of seeds) {
    const createXml = createOperatorRequestXml(seed)
    const { status, text } = await postSoap('/diwass/operators', createXml)

    if (status >= 400) {
      const reason = extractTag(text, 'faultstring')
      throw new Error(
        `CreateOperatorRequest failed for role "${seed.role}" (${seed.name}): HTTP ${status} - ${reason ?? text}`
      )
    }

    const operatorInternalId = extractTag(text, 'OperatorInternalID')
    if (!operatorInternalId) {
      throw new Error(
        `CreateOperatorRequest for role "${seed.role}" returned no OperatorInternalID:\n${text}`
      )
    }

    const approveResult = await postSoap(
      '/diwass/operators',
      approveOperatorRequestXml(operatorInternalId)
    )
    if (approveResult.status >= 400) {
      throw new Error(
        `ApproveOperatorRequest failed for role "${seed.role}" (ID ${operatorInternalId}): HTTP ${approveResult.status}`
      )
    }

    results[seed.role] = {
      operatorInternalId,
      uuid: randomUUID(),
      name: seed.name,
      identifierType: seed.identifierType,
      identifierValue: seed.identifierValue,
      activityStatus: 'Valid'
    }

    console.log(
      `Seeded + approved ${seed.role}: "${seed.name}" -> OperatorInternalID ${operatorInternalId}`
    )
  }

  writeFileSync(outFile, JSON.stringify(results, null, 2) + '\n')
  console.log(`\nWrote ${outFile}`)
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
