# AI Universe ChatGPT SDK Examples

This repository contains the **AI Universe** sample app that demonstrates how to build a ChatGPT app with the Apps SDK. The example combines a TypeScript-based MCP server with a Skybridge-compatible widget so you can see the complete request/response flow end-to-end.

## Contents

- [`ai-universe-app/`](ai-universe-app/) – AI Universe Apps SDK example featuring the `ai_universe_greeting` tool, a Skybridge widget, and shared MCP server utilities.
- The sample server depends on the published `@ai-universe/mcp-server-utils` package for its HTTP + SSE wiring.

## Getting started

The `ai-universe-app` directory has its own README with detailed instructions. In short:

1. Install the dependencies (pnpm, npm, or yarn).
2. Start the MCP server (`pnpm start`).
3. Register a ChatGPT app via the [Apps SDK developer console](https://developers.openai.com/apps-sdk/deploy/connect-chatgpt) and point it at your local server.
4. Ask ChatGPT to explore the AI Universe—the assistant will invoke the tool and render the widget response inline.

Refer to the official [Apps SDK documentation](https://developers.openai.com/apps-sdk) for the latest platform capabilities and deployment guidance.

## Continuous integration

Every pull request automatically provisions a Google Cloud Run preview and executes Model Context Protocol smoke tests:

- `.github/workflows/pr-dev-preview.yml` deploys the application via `deploy.sh` and publishes a `/health` probe along with the `/mcp` endpoint.
- `scripts/mcp-ci-tests.mjs` drives the JSON-RPC endpoints to validate initialization, tool discovery, and greeting generation.

To reproduce the smoke tests locally against any accessible deployment, export `MCP_SERVER_URL` and run:

```bash
npm install
npm run test:mcp
```
