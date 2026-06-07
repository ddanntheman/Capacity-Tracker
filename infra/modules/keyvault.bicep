@description('Azure region for all resources.')
param location string

@description('Key Vault name (3-24 alphanumeric and dashes, globally unique).')
param keyVaultName string

@description('Tags applied to every resource.')
param tags object

@description('Tenant ID for RBAC / access.')
param tenantId string

@description('Disable public network access (used when private endpoints are deployed).')
param publicNetworkAccessDisabled bool = false

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: keyVaultName
  location: location
  tags: tags
  properties: {
    tenantId: tenantId
    sku: {
      family: 'A'
      name: 'standard'
    }
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 90
    enablePurgeProtection: true
    publicNetworkAccess: publicNetworkAccessDisabled ? 'Disabled' : 'Enabled'
    networkAcls: {
      defaultAction: publicNetworkAccessDisabled ? 'Deny' : 'Allow'
      bypass: 'AzureServices'
    }
  }
}

output keyVaultId string = keyVault.id
output keyVaultName string = keyVault.name
output keyVaultUri string = keyVault.properties.vaultUri
