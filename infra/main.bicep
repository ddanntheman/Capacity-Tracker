targetScope = 'subscription'

@description('Environment short name; drives resource naming and tags.')
@allowed([
  'dev'
  'prod'
])
param environment string

@description('Azure region for all resources.')
param location string = 'eastus2'

@description('Tenant ID.')
param tenantId string

@description('User-facing Entra application (client) ID used by Static Web Apps SSO.')
param entraAppId string

@description('Display name (UPN or group name) of the Entra SQL administrator.')
param sqlAdminLogin string

@description('Object ID of the Entra user or group set as SQL administrator.')
param sqlAdminObjectId string

@description('Entra security group object IDs mapped to application roles.')
param groupViewer string = ''
param groupEditor string = ''
param groupLeadership string = ''

@description('Deploy private endpoints (requires VNet/subnet supplied by Andersen IT).')
param deployPrivateEndpoints bool = false

@description('Subnet resource ID hosting the private endpoints (when deployPrivateEndpoints is true).')
param privateEndpointSubnetId string = ''

@description('Optional private DNS zone resource IDs for private endpoint registration.')
param sqlPrivateDnsZoneId string = ''
param signalRPrivateDnsZoneId string = ''
param keyVaultPrivateDnsZoneId string = ''
param blobPrivateDnsZoneId string = ''

var namePrefix = 'cap-${environment}'
var uniquePart = uniqueString(subscription().id, namePrefix)
var tags = {
  application: 'capacity-tracker'
  environment: environment
  managedBy: 'bicep'
}

resource rg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: 'rg-capacity-${environment}'
  location: location
  tags: tags
}

module logging 'modules/logging.bicep' = {
  name: 'logging'
  scope: rg
  params: {
    location: location
    namePrefix: namePrefix
    tags: tags
  }
}

module storage 'modules/storage.bicep' = {
  name: 'storage'
  scope: rg
  params: {
    location: location
    storageAccountName: 'st${replace(namePrefix, '-', '')}${take(uniquePart, 6)}'
    tags: tags
    publicNetworkAccessDisabled: deployPrivateEndpoints
  }
}

module keyVault 'modules/keyvault.bicep' = {
  name: 'keyvault'
  scope: rg
  params: {
    location: location
    keyVaultName: 'kv-${namePrefix}-${take(uniquePart, 7)}'
    tags: tags
    tenantId: tenantId
    publicNetworkAccessDisabled: deployPrivateEndpoints
  }
}

module sql 'modules/sql.bicep' = {
  name: 'sql'
  scope: rg
  params: {
    location: location
    sqlServerName: 'sql-${namePrefix}-${take(uniquePart, 6)}'
    databaseName: 'capacity'
    tags: tags
    tenantId: tenantId
    adminLogin: sqlAdminLogin
    adminObjectId: sqlAdminObjectId
    publicNetworkAccessDisabled: deployPrivateEndpoints
  }
}

module signalR 'modules/signalr.bicep' = {
  name: 'signalr'
  scope: rg
  params: {
    location: location
    signalRName: 'sigr-${namePrefix}-${take(uniquePart, 6)}'
    tags: tags
    publicNetworkAccessDisabled: deployPrivateEndpoints
  }
}

module functions 'modules/functions.bicep' = {
  name: 'functions'
  scope: rg
  params: {
    location: location
    functionAppName: 'func-${namePrefix}-${take(uniquePart, 6)}'
    planName: 'plan-${namePrefix}'
    tags: tags
    storageAccountName: storage.outputs.storageAccountName
    appInsightsConnectionString: logging.outputs.appInsightsConnectionString
    signalRHostName: signalR.outputs.signalRHostName
    sqlServerFqdn: sql.outputs.sqlServerFqdn
    sqlDatabaseName: sql.outputs.databaseName
    entraAppId: entraAppId
    groupViewer: groupViewer
    groupEditor: groupEditor
    groupLeadership: groupLeadership
  }
}

module rbac 'modules/rbac.bicep' = {
  name: 'rbac'
  scope: rg
  params: {
    functionPrincipalId: functions.outputs.principalId
    storageAccountName: storage.outputs.storageAccountName
    signalRName: signalR.outputs.signalRName
  }
}

module staticWebApp 'modules/staticwebapp.bicep' = {
  name: 'staticwebapp'
  scope: rg
  params: {
    location: location
    staticWebAppName: 'swa-${namePrefix}-${take(uniquePart, 6)}'
    tags: tags
    functionAppId: functions.outputs.functionAppId
    functionAppRegion: location
    entraAppId: entraAppId
  }
}

module privateEndpoints 'modules/privateEndpoints.bicep' = if (deployPrivateEndpoints) {
  name: 'privateEndpoints'
  scope: rg
  params: {
    location: location
    namePrefix: namePrefix
    tags: tags
    subnetId: privateEndpointSubnetId
    sqlServerId: sql.outputs.sqlServerId
    signalRId: signalR.outputs.signalRId
    keyVaultId: keyVault.outputs.keyVaultId
    storageAccountId: storage.outputs.storageAccountId
    sqlPrivateDnsZoneId: sqlPrivateDnsZoneId
    signalRPrivateDnsZoneId: signalRPrivateDnsZoneId
    keyVaultPrivateDnsZoneId: keyVaultPrivateDnsZoneId
    blobPrivateDnsZoneId: blobPrivateDnsZoneId
  }
}

output resourceGroupName string = rg.name
output staticWebAppName string = staticWebApp.outputs.staticWebAppName
output staticWebAppHostName string = staticWebApp.outputs.defaultHostName
output functionAppName string = functions.outputs.functionAppName
output functionAppHostName string = functions.outputs.functionAppHostName
output sqlServerFqdn string = sql.outputs.sqlServerFqdn
output keyVaultUri string = keyVault.outputs.keyVaultUri
