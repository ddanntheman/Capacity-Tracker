@description('Azure region that supports Static Web Apps (e.g. eastus2).')
param location string

@description('Static Web App name.')
param staticWebAppName string

@description('Tags applied to every resource.')
param tags object

@description('Resource ID of the Function App linked as the managed API backend.')
param functionAppId string

@description('Region of the linked Function App backend.')
param functionAppRegion string

@description('User-facing Entra application (client) ID used for SSO.')
param entraAppId string

resource staticWebApp 'Microsoft.Web/staticSites@2023-12-01' = {
  name: staticWebAppName
  location: location
  tags: tags
  sku: {
    name: 'Standard'
    tier: 'Standard'
  }
  properties: {
    allowConfigFileUpdates: true
    stagingEnvironmentPolicy: 'Enabled'
  }
}

@description('Link the Azure Functions app as the Static Web App managed backend.')
resource linkedBackend 'Microsoft.Web/staticSites/linkedBackends@2023-12-01' = {
  parent: staticWebApp
  name: 'api'
  properties: {
    backendResourceId: functionAppId
    region: functionAppRegion
  }
}

@description('App settings consumed by the built-in Entra ID auth (clientIdSettingName).')
resource appSettings 'Microsoft.Web/staticSites/config@2023-12-01' = {
  parent: staticWebApp
  name: 'appsettings'
  properties: {
    ENTRA_APP_ID: entraAppId
  }
}

output staticWebAppId string = staticWebApp.id
output staticWebAppName string = staticWebApp.name
output defaultHostName string = staticWebApp.properties.defaultHostname
