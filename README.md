<h1 align="center">
  <a href="https://krsanford.github.io/quiz-app/">
    QuizApp
  </a>
</h1>

<p align="center">
  <a href="https://github.com/krsanford/quiz-app/actions?query=workflow%3A%22Node.js+CI%22">
    <img src="https://github.com/krsanford/quiz-app/workflows/Node.js%20CI/badge.svg" alt="Node.js CI" />
  </a>
  <a href="https://github.com/krsanford/quiz-app/releases">
    <img src="https://img.shields.io/github/v/release/krsanford/quiz-app" alt="GitHub Release (latest by date)" />
  </a>
  <a href="https://github.com/krsanford/quiz-app/blob/master/LICENSE">
    <img src="https://img.shields.io/github/license/krsanford/quiz-app" alt="License" />
  </a>
</p>

<p align="center">
  QuizApp is a free and open-source quiz application that lets you play fully customized quizzes right in the browser.
</p>

![QuizApp](https://github.com/SafdarJamal/quiz-app/assets/48409548/22e9696d-bab4-4aa5-a028-4a4f9ce71777)

## Built with

- [React](http://react.dev)
- [Semantic UI](https://semantic-ui.com)
- [Open Trivia Database API](https://opentdb.com/api_config.php)

## Development

To get a local copy of the code, clone it using git:

```
git clone https://github.com/SafdarJamal/quiz-app.git
cd quiz-app
```

Install dependencies:

```
npm install
```

## One-click deploy to Azure

[![Deploy to Azure](https://aka.ms/deploytoazurebutton)](https://portal.azure.com/#create/Microsoft.Template/uri/https%3A%2F%2Fraw.githubusercontent.com%2Fkarlsanford%2Fquiz-app%2Fmain%2Finfra%2Fmain.bicep)

Click the button and the Azure Portal will prompt for:
- Resource group & region
- `namePrefix` (used for the Web App and storage account)
- Optional plan SKU (default Basic B1)

After the portal completes:
1) Copy the `backendUrl` and `staticWebsiteUrl` from the deployment outputs.
2) Build with `REACT_APP_SOCKET_URL=<backendUrl> npm run build`.
3) Upload the `build/` contents to the static website container of the created storage account (you can use the portal’s “Static website” blade or `az storage blob upload-batch`).
4) Zip deploy backend if you make changes (`zip -r ../backend.zip . -x node_modules/\* build/\*` then use the Web App “Deployment Center” to upload).

### Deploy via GitHub Actions (one-click run)
[![Run Deploy Workflow](https://img.shields.io/badge/Deploy%20via-GitHub%20Actions-blue?logo=githubactions)](../../actions/workflows/deploy-azure.yml)

- Click the badge → “Run workflow”. It will:
  - Deploy infra (Bicep)
  - Build frontend with the backend URL
  - Zip-deploy backend
  - Upload static build
- Requires one-time secret `AZURE_CREDENTIALS` (service principal JSON with access to your subscription). After that, it’s a button click.

## Local development

Start the backend (Express + Socket.IO) and the web app in two terminals:

```
npm run server
```

and

```
npm start
```

Then open http://localhost:3000.

> Multiplayer uses websockets. By default the frontend points to `http://localhost:4000`. If you deploy the backend elsewhere, set `REACT_APP_SOCKET_URL` to that URL before running `npm start` or building.

#### Available Scripts

In this project, you can run the following scripts:

| Script        | Description                                                             |
| ------------- | ----------------------------------------------------------------------- |
| npm start     | Runs the app in the development mode.                                   |
| npm test      | Launches the test runner in the interactive watch mode.                 |
| npm run build | Builds the app for production to the `build` folder.                    |
| npm run eject | This command will remove the single build dependency from your project. |

## Credits

QuizApp is built and maintained by [Safdar Jamal](https://safdarjamal.github.io).

## License

Code released under the [MIT license](https://github.com/SafdarJamal/quiz-app/blob/master/LICENSE).
