@description('Azure region for the private endpoints.')
param location string

@description('Resource name prefix, e.g. cap-prod.')
param namePrefix string

@description('Tags applied to every resource.')
param tags object

@description('Resource ID of the subnet (supplied by your IT team) that hosts the private endpoints.')
param subnetId string

@description('Target resource IDs to expose privately.')
param sqlServerId string
param signalRId string
param keyVaultId string
param storageAccountId string

@description('Optional private DNS zone resource IDs for automatic A-record registration.')
param sqlPrivateDnsZoneId string = ''
param signalRPrivateDnsZoneId string = ''
param keyVaultPrivateDnsZoneId string = ''
param blobPrivateDnsZoneId string = ''

var endpoints = [
  {
    name: 'pe-sql-${namePrefix}'
    serviceId: sqlServerId
    groupId: 'sqlServer'
    dnsZoneId: sqlPrivateDnsZoneId
  }
  {
    name: 'pe-signalr-${namePrefix}'
    serviceId: signalRId
    groupId: 'signalr'
    dnsZoneId: signalRPrivateDnsZoneId
  }
  {
    name: 'pe-kv-${namePrefix}'
    serviceId: keyVaultId
    groupId: 'vault'
    dnsZoneId: keyVaultPrivateDnsZoneId
  }
  {
    name: 'pe-blob-${namePrefix}'
    serviceId: storageAccountId
    groupId: 'blob'
    dnsZoneId: blobPrivateDnsZoneId
  }
]

resource privateEndpoints 'Microsoft.Network/privateEndpoints@2023-11-01' = [
  for ep in endpoints: {
    name: ep.name
    location: location
    tags: tags
    properties: {
      subnet: {
        id: subnetId
      }
      privateLinkServiceConnections: [
        {
          name: ep.name
          properties: {
            privateLinkServiceId: ep.serviceId
            groupIds: [
              ep.groupId
            ]
          }
        }
      ]
    }
  }
]

resource dnsZoneGroups 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2023-11-01' = [
  for (ep, i) in endpoints: if (!empty(ep.dnsZoneId)) {
    name: '${privateEndpoints[i].name}/default'
    properties: {
      privateDnsZoneConfigs: [
        {
          name: 'config'
          properties: {
            privateDnsZoneId: ep.dnsZoneId
          }
        }
      ]
    }
  }
]
