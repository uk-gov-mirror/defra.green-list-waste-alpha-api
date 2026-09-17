// An ephemeral port so this file's server can really listen - the outbound
// DIWASS client self-references request.server.info.uri, which only
// resolves to a reachable address once the server has actually started.
process.env.PORT = '0'

const validPayload = {
  annexVIIDocumentNo: 'AX-2024-DIWASS-001',
  shipmentArranger: {
    operatorId: '237674',
    uuid: '550e8400-e29b-41d4-a716-446655440000',
    contactDetails: {
      contactPerson: 'Smith & Sons',
      phone: '+1234567890',
      email: 'john.doe@somecompany.co.uk'
    },
    isAlsoWasteProducer: false
  },
  importerConsignee: {
    operatorId: '237238',
    uuid: '550e8400-e29b-41d4-a716-446655440001',
    contactDetails: {
      contactPerson: 'Jane Smith',
      phone: '+0987654321',
      email: 'jane.smith@somecompany.co.uk'
    }
  },
  shipment: {
    actualQuantity: { tonnes: 100, metersCubed: null },
    actualDateOfShipment: '2024-06-01',
    createdDueToTakeBack: false,
    createdDueToIllegalActivity: false,
    commodityCodes: ['4707 10 00'],
    shipmentOriginLocation: { addressDetails: '1 Mill Lane, Leeds, LS1 1AA' },
    shipmentLocationResponsiblePerson: {
      name: 'John Doe',
      phone: '+1234567890',
      email: 'john.doe@somecompany.co.uk'
    }
  },
  carriers: [
    {
      operatorId: '235939',
      uuid: '550e8400-e29b-41d4-a716-446655440002',
      contactDetails: {
        contactPerson: 'Alice Johnson',
        phone: '+1122334455',
        email: 'alice.johnson@carrierone.co.uk'
      },
      meansOfTransportCode: 'R',
      transferDate: '2024-06-02',
      declaration: {
        authenticatedBy: {
          name: 'Alice Johnson',
          email: 'alice.johnson@carrierone.co.uk',
          roleInOrganisation: 'Logistics Manager',
          authenticationTimestamp: '2024-06-02T08:00:00Z',
          uuid: '550e8400-e29b-41d4-a716-446655440010'
        }
      }
    }
  ],
  recoveryFacility: {
    operatorId: '235977',
    uuid: '550e8400-e29b-41d4-a716-446655440005',
    facilityType: 'recoveryFacility',
    isInterimFacility: false,
    contactDetails: {
      contactPerson: 'Michael Brown',
      phone: '+0987654323',
      email: 'michael.brown@recoveryfacility.co.uk'
    }
  },
  recoveryOperation: { rCodeDCode: 'R1' },
  usualDescriptionOfWaste: 'Mixed paper <and> "board" offcuts',
  wasteIdentification: { baselAnnexIX: 'B1010', ecListOfWastes: '150101' },
  countriesStatesConcerned: {
    exportDispatchCountry: 'GB',
    importDestinationCountry: 'DE',
    transitCountries: ['FR', 'BE']
  },
  declarationOfShipmentArranger: {
    authenticatedBy: {
      name: 'John Doe',
      email: 'john.doe@somecompany.co.uk',
      roleInOrganisation: 'Director',
      authenticationTimestamp: '2024-06-01T11:00:00Z',
      uuid: '550e8400-e29b-41d4-a716-446655440013'
    }
  }
}

describe('#DiwassAnnexViiClient (end-to-end via the bundled emulator)', () => {
  let server

  beforeAll(async () => {
    // The repo's global test setup (.vite/setup-files.js) replaces fetch
    // with vitest-fetch-mock for every test file, which would swallow both
    // this test's own request and the DIWASS client's inner one. This file
    // is specifically testing that a real HTTP round trip works end to end,
    // so it opts back out of the mock.
    global.fetchMock.disableMocks()

    const { createServer } = await import('#/server.js')
    server = await createServer()
    await server.start()
  })

  afterAll(async () => {
    await server.stop({ timeout: 1000 })
    global.fetchMock.enableMocks()
  })

  test('POST /annexvii submits a real SOAP payload to the emulator and gets a DIWASS document number back', async () => {
    // server.info.uri reflects the 0.0.0.0 bind address, not a connectable
    // destination - loop back over localhost instead, same as the route does.
    const response = await fetch(
      `http://127.0.0.1:${server.info.port}/annexvii`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validPayload)
      }
    )
    const result = await response.json()

    expect(response.status).toBe(201)
    expect(result.annexVIIDocumentNo).toBe(validPayload.annexVIIDocumentNo)
    expect(result.diwass.status).toBe('OK')
    expect(result.diwass.annexViiDocumentNo).toMatch(/^GLW\.GB\d+i$/)
  })
})
