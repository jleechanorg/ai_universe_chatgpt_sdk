# AI Universe ChatGPT Apps SDK example

This directory contains the **AI Universe** Model Context Protocol (MCP) server and widget that you can wire into the ChatGPT Apps SDK. The server exposes a single tool called `ai_universe_greeting` that returns a cosmic greeting while the widget renders that greeting inline inside ChatGPT via the Apps SDK bridge (`window.openai`).

Compared to the original hello-world sample, the AI Universe variant is powered by the published `@ai-universe/mcp-server-utils` package. That helper spins up a FastMCP server and HTTP proxy (`startFastMcpHttpProxy`) so this project can focus purely on the tool implementation and widget.

## Prerequisites

- Node.js 18+
- pnpm, npm, or yarn for dependency management

## Install dependencies

```bash
pnpm install
```

(Use `npm install` or `yarn install` if you prefer a different package manager.)

## Run the MCP server

Start the server on the default port (`3030`):

```bash
pnpm start
```

The server exposes:

- Server-Sent Events stream: `GET http://localhost:3030/mcp`
- POST endpoint for bidirectional messaging: `POST http://localhost:3030/mcp/messages?sessionId=<id>`

These endpoints follow the [MCP transport contract](https://modelcontextprotocol.io) used by the Apps SDK and are proxied by `startFastMcpHttpProxy` from `@ai-universe/mcp-server-utils`.

## Create an app manifest

To connect the server to ChatGPT, create an app manifest in the [Apps SDK developer console](https://developers.openai.com/apps-sdk/deploy/connect-chatgpt). Point the manifest’s MCP server URL at the SSE endpoint above and include metadata that instructs the assistant when to call the `ai_universe_greeting` tool. The snippet below mirrors the configuration used while testing this example—update it to match your needs.

```jsonc
{
  "schema_version": "v1",
  "name": "AI Universe",
  "description": "Greets the user and renders a rich widget via the Apps SDK.",
  "instructions": "When a user asks to explore the AI Universe, call the ai_universe_greeting tool. If they provide a name, include it in the arguments.",
  "version": "0.1.0",
  "capabilities": {
    "tools": ["ai_universe_greeting"]
  },
  "server": {
    "type": "mcp",
    "sse_url": "http://localhost:3030/mcp",
    "message_url": "http://localhost:3030/mcp/messages"
  }
}
```

Consult the [Apps SDK reference](https://developers.openai.com/apps-sdk/reference) for the latest manifest fields and validation rules.

## Workflow summary

1. Install dependencies and start the MCP server.
2. Register an app in ChatGPT developer mode using the manifest above (or your variation).
3. Trigger the app by asking ChatGPT to “explore the AI Universe” or “greet Nova.”
4. ChatGPT will call the `ai_universe_greeting` tool, receive the greeting payload, and render the widget from `widgets/ai-universe.html`.

Feel free to expand on this foundation by adding more tools, persisting state, or swapping in your own frontend bundle.
