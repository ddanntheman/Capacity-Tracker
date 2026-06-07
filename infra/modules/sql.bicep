@description('Azure region for all resources.')
param location string

@description('Logical SQL server name (globally unique).')
param sqlServerName string

@description('SQL database name.')
param databaseName string

@description('Tags applied to every resource.')
param tags object

@description('Tenant ID for the Entra administrator.')
param tenantId string

@description('Display name (UPN or group name) of the Entra SQL administrator.')
param adminLogin string

@description('Object ID of the Entra user or group set as SQL administrator.')
param adminObjectId string

@description('Disable public network access (used when private endpoints are deployed).')
param publicNetworkAccessDisabled bool = false

resource sqlServer 'Microsoft.Sql/servers@2023-08-01-preview' = {
  name: sqlServerName
  location: location
  tags: tags
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    version: '12.0'
    minimalTlsVersion: '1.2'
    publicNetworkAccess: publicNetworkAccessDisabled ? 'Disabled' : 'Enabled'
    administrators: {
      administratorType: 'ActiveDirectory'
      principalType: 'User'
      login: adminLogin
      sid: adminObjectId
      tenantId: tenantId
      azureADOnlyAuthentication: true
    }
  }
}

resource database 'Microsoft.Sql/servers/databases@2023-08-01-preview' = {
  parent: sqlServer
  name: databaseName
  location: location
  tags: tags
  sku: {
    name: 'GP_S_Gen5_1'
    tier: 'GeneralPurpose'
    family: 'Gen5'
    capacity: 1
  }
  properties: {
    autoPauseDelay: 60
    minCapacity: json('0.5')
    zoneRedundant: false
  }
}

@description('Allow other Azure services to reach the server when public access is enabled (dev only).')
resource allowAzure 'Microsoft.Sql/servers/firewallRules@2023-08-01-preview' = if (!publicNetworkAccessDisabled) {
  parent: sqlServer
  name: 'AllowAllWindowsAzureIps'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

output sqlServerId string = sqlServer.id
output sqlServerName string = sqlServer.name
output sqlServerFqdn string = sqlServer.properties.fullyQualifiedDomainName
output databaseName string = database.name
