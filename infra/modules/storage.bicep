@description('Azure region for all resources.')
param location string

@description('Globally-unique storage account name (3-24 lowercase alphanumeric).')
param storageAccountName string

@description('Tags applied to every resource.')
param tags object

@description('Disable public network access (used when private endpoints are deployed).')
param publicNetworkAccessDisabled bool = false

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageAccountName
  location: location
  tags: tags
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
    allowSharedKeyAccess: true
    supportsHttpsTrafficOnly: true
    publicNetworkAccess: publicNetworkAccessDisabled ? 'Disabled' : 'Enabled'
    networkAcls: {
      defaultAction: publicNetworkAccessDisabled ? 'Deny' : 'Allow'
      bypass: 'AzureServices'
    }
  }
}

output storageAccountId string = storage.id
output storageAccountName string = storage.name
