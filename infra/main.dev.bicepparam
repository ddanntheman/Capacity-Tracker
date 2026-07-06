using './main.bicep'

param environment = 'dev'
param location = 'centralus'
param tenantId = 'f44ef0c2-9e0e-41ee-a9b8-6df585f60d31'
param entraAppId = 'f6f16c43-89aa-4e04-ae91-db1d7e650a08'

// Entra SQL administrator (set to a group or user that owns the database).
param sqlAdminLogin = 'drew.danner@bdemerson.com'
param sqlAdminObjectId = '94aa75d1-a836-433a-a6b3-c1190d683c3f'

// Entra security group object IDs -> application roles (filled in by Andersen IT).
param groupViewer = '868a8332-9063-4b99-b3e3-b110ba0dc94f'
param groupEditor = '019aea9f-0d64-455f-9769-b2a9932e9047'
param groupLeadership = '45576da9-f586-4fd2-909b-c1eb92a59455'

// Dev keeps public network access enabled; no VNet/private endpoints.
param deployPrivateEndpoints = false
