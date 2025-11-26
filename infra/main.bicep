param location string = resourceGroup().location
param namePrefix string = 'quizapp'
@description('App Service plan SKU, e.g. B1, S1')
param planSku string = 'B1'
@description('Optional explicit storage account name (3-24 lowercase, unique). Defaults to unique.')
param storageAccountName string = toLower('quiz${uniqueString(resourceGroup().id)}')
@description('Node version for backend.')
param nodeVersion string = '~18'

var planName = '${namePrefix}-plan'
var backendName = '${namePrefix}-api'

resource plan 'Microsoft.Web/serverfarms@2022-03-01' = {
  name: planName
  location: location
  sku: {
    name: planSku
    tier: planSku == 'B1' ? 'Basic' : 'Standard'
  }
  properties: {
    reserved: true
  }
}

resource backend 'Microsoft.Web/sites@2022-03-01' = {
  name: backendName
  location: location
  kind: 'app,linux'
  properties: {
    httpsOnly: true
    serverFarmId: plan.id
    siteConfig: {
      linuxFxVersion: 'NODE|${nodeVersion}'
      appCommandLine: 'npm run server'
      appSettings: [
        {
          name: 'WEBSITE_NODE_DEFAULT_VERSION'
          value: nodeVersion
        }
        {
          name: 'WEBSITES_WEBSOCKET_ENABLED'
          value: 'true'
        }
        {
          name: 'WEBSITES_PORT'
          value: '4000'
        }
        {
          name: 'NODE_ENV'
          value: 'production'
        }
        {
          name: 'CLIENT_ORIGIN'
          value: storage.properties.primaryEndpoints.web
        }
      ]
      cors: {
        allowedOrigins: [
          storage.properties.primaryEndpoints.web
        ]
      }
    }
  }
}

resource storage 'Microsoft.Storage/storageAccounts@2022-09-01' = {
  name: storageAccountName
  location: location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    accessTier: 'Hot'
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: true
    supportsHttpsTrafficOnly: true
    staticWebsite: {
      indexDocument: 'index.html'
      error404Document: 'index.html'
    }
  }
}

output backendUrl string = 'https://${backend.properties.defaultHostName}'
output backendNameOut string = backend.name
output planNameOut string = plan.name
output staticWebsiteUrl string = storage.properties.primaryEndpoints.web
output storageAccountOut string = storage.name
