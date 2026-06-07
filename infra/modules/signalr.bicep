@description('Azure region for all resources.')
param location string

@description('SignalR Service name (globally unique).')
param signalRName string

@description('Tags applied to every resource.')
param tags object

@description('Disable public network access (used when private endpoints are deployed).')
param publicNetworkAccessDisabled bool = false

resource signalR 'Microsoft.SignalRService/signalR@2024-03-01' = {
  name: signalRName
  location: location
  tags: tags
  sku: {
    name: 'Standard_S1'
    tier: 'Standard'
    capacity: 1
  }
  kind: 'SignalR'
  properties: {
    features: [
      {
        flag: 'ServiceMode'
        value: 'Serverless'
      }
      {
        flag: 'EnableConnectivityLogs'
        value: 'True'
      }
    ]
    publicNetworkAccess: publicNetworkAccessDisabled ? 'Disabled' : 'Enabled'
    cors: {
      allowedOrigins: [
        '*'
      ]
    }
  }
}

output signalRId string = signalR.id
output signalRName string = signalR.name
output signalRHostName string = signalR.properties.hostName
