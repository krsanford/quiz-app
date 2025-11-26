# Azure deployment (App Service + Static Website)

This repo can be deployed with Bicep. It provisions:
- Linux App Service Plan and a Web App for the backend (websockets enabled, runs `npm run server`)
- Storage Account with Static Website for the React build

## One-click deploy
[![Deploy to Azure](https://aka.ms/deploytoazurebutton)](https://portal.azure.com/#create/Microsoft.Template/uri/https%3A%2F%2Fraw.githubusercontent.com%2Fkarlsanford%2Fquiz-app%2Fmain%2Finfra%2Fmain.bicep)

Click the button and the Azure Portal will:
- Let you pick a resource group & region
- Ask for `namePrefix` (used for Web App and storage account naming)
- Default the plan SKU to B1 (you can change to S1/S2, etc.)

Deployment outputs include `backendUrl` and `staticWebsiteUrl`.

## One-click via GitHub Actions
[![Run Deploy Workflow](https://img.shields.io/badge/Deploy%20via-GitHub%20Actions-blue?logo=githubactions)](../../actions/workflows/deploy-azure.yml)

Click “Run workflow” and the action will:
- Deploy infra (Bicep)
- Build frontend with the backend URL
- Zip-deploy backend
- Upload the static build

Prereq (once): add repo secret `AZURE_CREDENTIALS` (service principal JSON with rights to your subscription).

## Deploy backend to the Web App
```bash
# From repo root
zip -r ../quizapp-backend.zip . -x node_modules/\* build/\*
APP_NAME=${PREFIX}-api

az webapp deploy \
  --resource-group $RESOURCE_GROUP \
  --name $APP_NAME \
  --src-path ../quizapp-backend.zip \
  --type zip
```
The Web App already has env vars set:
- `CLIENT_ORIGIN` to the static site endpoint (from the Bicep output)
- `WEBSITES_PORT=4000`, `WEBSITES_WEBSOCKET_ENABLED=true`, `NODE_ENV=production`

## 3) Build and upload frontend to static website
```bash
BACKEND_URL=$(az deployment group show -g $RESOURCE_GROUP --name main --query "properties.outputs.backendUrl.value" -o tsv)
REACT_APP_SOCKET_URL=$BACKEND_URL npm run build

STORAGE_NAME=$(az deployment group show -g $RESOURCE_GROUP --name main --query "properties.outputs.storageAccountOut.value" -o tsv)
az storage blob upload-batch -s build -d '$web' --account-name $STORAGE_NAME --overwrite
```

## Optional: GitHub Actions sketch (not added to repo)
```yaml
# .github/workflows/deploy.yml
name: Deploy
on:
  push:
    branches: [main]

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '18' }
      - run: npm ci
      - run: npm run build
        env:
          REACT_APP_SOCKET_URL: ${{ secrets.BACKEND_URL }}
      - run: az bicep install
      - run: |
          az login --service-principal -u ${{ secrets.AZURE_CLIENT_ID }} -p ${{ secrets.AZURE_CLIENT_SECRET }} --tenant ${{ secrets.AZURE_TENANT_ID }}
          az deployment group create -g ${{ secrets.AZ_RG }} --template-file infra/main.bicep --parameters namePrefix=${{ secrets.NAME_PREFIX }}
      - run: zip -r ../backend.zip . -x node_modules/\* build/\*
      - run: az webapp deploy --resource-group ${{ secrets.AZ_RG }} --name ${{ secrets.NAME_PREFIX }}-api --src-path ../backend.zip --type zip
      - run: |
          az storage blob upload-batch -s build -d '$web' --account-name ${{ secrets.STORAGE_ACCOUNT }} --overwrite
```
Set secrets: `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_TENANT_ID`, `AZ_RG`, `NAME_PREFIX`, `BACKEND_URL`, `STORAGE_ACCOUNT`.

## Frontend config
The frontend reads `REACT_APP_SOCKET_URL` at build time. Set it to the `backendUrl` output so sockets point to the deployed backend.
