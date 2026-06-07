@description('Azure region for all resources.')
param location string

@description('Function App name (globally unique).')
param functionAppName string

@description('App Service (Consumption) plan name.')
param planName string

@description('Tags applied to every resource.')
param tags object

@description('Storage account name used by the Functions runtime (identity-based).')
param storageAccountName string

@description('Application Insights connection string.')
param appInsightsConnectionString string

@description('SignalR service host name, e.g. cap-prod.service.signalr.net.')
param signalRHostName string

@description('Fully-qualified SQL server name.')
param sqlServerFqdn string

@description('SQL database name.')
param sqlDatabaseName string

@description('User-facing Entra application (client) ID used by Static Web Apps SSO.')
param entraAppId string

@description('Entra security group object IDs mapped to application roles.')
param groupViewer string = ''
param groupEditor string = ''
param groupLeadership string = ''

resource plan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: planName
  location: location
  tags: tags
  sku: {
    name: 'Y1'
    tier: 'Dynamic'
  }
  properties: {}
}

resource functionApp 'Microsoft.Web/sites@2023-12-01' = {
  name: functionAppName
  location: location
  tags: tags
  kind: 'functionapp'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    siteConfig: {
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      netFrameworkVersion: 'v8.0'
      use32BitWorkerProcess: false
      cors: {
        allowedOrigins: [
          'https://portal.azure.com'
        ]
      }
      appSettings: [
        {
          name: 'FUNCTIONS_EXTENSION_VERSION'
          value: '~4'
        }
        {
          name: 'FUNCTIONS_WORKER_RUNTIME'
          value: 'dotnet-isolated'
        }
        {
          name: 'AzureWebJobsStorage__accountName'
          value: storageAccountName
        }
        {
          name: 'AzureWebJobsStorage__credential'
          value: 'managedidentity'
        }
        {
          name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
          value: appInsightsConnectionString
        }
        {
          name: 'AzureSignalRConnectionString__serviceUri'
          value: 'https://${signalRHostName}'
        }
        {
          name: 'AzureSignalRConnectionString__credential'
          value: 'managedidentity'
        }
        {
          name: 'SqlConnectionString'
          value: 'Server=tcp:${sqlServerFqdn},1433;Database=${sqlDatabaseName};Authentication=Active Directory Managed Identity;Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;'
        }
        {
          name: 'ALLOW_DEV_AUTH'
          value: 'false'
        }
        {
          name: 'ENTRA_APP_ID'
          value: entraAppId
        }
        {
          name: 'GROUP_VIEWER'
          value: groupViewer
        }
        {
          name: 'GROUP_EDITOR'
          value: groupEditor
        }
        {
          name: 'GROUP_LEADERSHIP'
          value: groupLeadership
        }
      ]
    }
  }
}

output functionAppId string = functionApp.id
output functionAppName string = functionApp.name
output functionAppHostName string = functionApp.properties.defaultHostName
output principalId string = functionApp.identity.principalId
