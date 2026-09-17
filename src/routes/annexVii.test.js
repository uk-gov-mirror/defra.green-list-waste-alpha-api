const validPayload = {
  annexVIIDocumentNo: 'AX-2024-000001',
  shipmentArranger: {
    operatorId: 'OP-12345',
    uuid: '550e8400-e29b-41d4-a716-446655440000',
    contactDetails: {
      contactPerson: 'John Doe',
      phone: '+1234567890',
      email: 'john.doe@somecompany.co.uk'
    },
    isAlsoWasteProducer: true
  },
  importerConsignee: {
    operatorId: 'OP-67890',
    uuid: '550e8400-e29b-41d4-a716-446655440001',
    contactDetails: {
      contactPerson: 'Jane Smith',
      phone: '+0987654321',
      email: 'jane.smith@somecompany.co.uk'
    }
  },
  shipment: {
    actualQuantity: { tonnes: 100, metersCubed: 10 },
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
      operatorId: 'OP-11111',
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
    operatorId: 'OP-44444',
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
  usualDescriptionOfWaste: 'Description of the waste being shipped',
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

describe('#annexVii', () => {
  let server

  beforeAll(async () => {
    const { createServer } = await import('#/server.js')
    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop({ timeout: 1000 })
  })

  test('POST /annexvii creates a document and returns 201', async () => {
    const { statusCode, result } = await server.inject({
      method: 'POST',
      url: '/annexvii',
      payload: validPayload
    })

    expect(statusCode).toBe(201)
    expect(result.annexVIIDocumentNo).toBe(validPayload.annexVIIDocumentNo)
  })

  test('POST /annexvii rejects an invalid payload with 400', async () => {
    const { statusCode } = await server.inject({
      method: 'POST',
      url: '/annexvii',
      payload: { annexVIIDocumentNo: 'AX-2024-000002' }
    })

    expect(statusCode).toBe(400)
  })

  test('POST /annexvii rejects an unrecognised waste code with 400', async () => {
    const { statusCode } = await server.inject({
      method: 'POST',
      url: '/annexvii',
      payload: {
        ...validPayload,
        annexVIIDocumentNo: 'AX-2024-000003',
        wasteIdentification: { ecListOfWastes: '999999' }
      }
    })

    expect(statusCode).toBe(400)
  })

  test('POST /annexvii rejects a duplicate annexVIIDocumentNo with 409', async () => {
    const { statusCode } = await server.inject({
      method: 'POST',
      url: '/annexvii',
      payload: validPayload
    })

    expect(statusCode).toBe(409)
  })
})
