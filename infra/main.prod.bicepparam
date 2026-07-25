using './main.bicep'

param environment = 'prod'
param location = 'eastus2'
param tenantId = '396a5f5f-4bee-4dd0-aea6-809ef5dc4ac7'
param entraAppId = 'b1faa118-3bb5-4c21-8903-cbaf6c1d81ff'

// Entra SQL administrator (set to a group or user that owns the database).
param sqlAdminLogin = 'capacity-sql-admins'
param sqlAdminObjectId = '00000000-0000-0000-0000-000000000000'

// Entra security group object IDs -> application roles (filled in by your IT team).
param groupViewer = ''
param groupEditor = ''
param groupLeadership = ''

// Prod deploys private endpoints into the VNet/subnet supplied by your IT team.
param deployPrivateEndpoints = true
param privateEndpointSubnetId = ''
param sqlPrivateDnsZoneId = ''
param signalRPrivateDnsZoneId = ''
param keyVaultPrivateDnsZoneId = ''
param blobPrivateDnsZoneId = ''
