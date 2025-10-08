import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";

import { createMCPServer, startFastMcpHttpProxy } from "@ai-universe/mcp-server-utils";
import type {
  ContentResult,
  Resource,
  ResourceTemplate,
  Tool
} from "fastmcp";
import { z } from "zod";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const widgetUri = "ui://widget/ai-universe.html";
let widgetHtml: string | null = null;
const getWidgetHtml = (): string => {
  if (widgetHtml === null) {
    widgetHtml = readFileSync(resolve(__dirname, "../widgets/ai-universe.html"), "utf-8");
  }
  return widgetHtml;
};

const greetingArgsSchema = z
  .object({
    name: z.string().min(1).optional()
  })
  .strict();

type GreetingArgs = z.infer<typeof greetingArgsSchema>;

const greetingResource: Resource<Record<string, unknown> | undefined> = {
  uri: widgetUri,
  name: "AI Universe widget",
  description: "Skybridge widget that renders the AI Universe greeting.",
  mimeType: "text/html+skybridge",
  load: async () => ({
    uri: widgetUri,
    mimeType: "text/html+skybridge",
    text: getWidgetHtml()
  })
};

const greetingTemplate: ResourceTemplate<Record<string, unknown> | undefined> = {
  uriTemplate: widgetUri,
  name: "AI Universe widget template",
  description: "Template binding for the AI Universe widget.",
  mimeType: "text/html+skybridge",
  arguments: [] as const,
  load: async () => ({
    uri: widgetUri,
    mimeType: "text/html+skybridge",
    text: getWidgetHtml()
  })
};

async function createGreetingServer() {
  const server = await createMCPServer({
    name: "ai-universe",
    version: "0.1.0",
    instructions: "Greets explorers with an AI Universe widget."
  });

  server.addResource(greetingResource);
  server.addResourceTemplate(greetingTemplate);

  const greetingTool: Tool<Record<string, unknown> | undefined, typeof greetingArgsSchema> = {
    name: "ai_universe_greeting",
    description: "Greets the user with a cosmic message.",
    annotations: {
      title: "Share an AI Universe greeting",
      openWorldHint: false,
      readOnlyHint: true
    },
    parameters: greetingArgsSchema,
    execute: async ({ name }: GreetingArgs): Promise<ContentResult> => {
      const greetingName = name?.trim() || "explorer";
      const greeting = `Hello, ${greetingName}! Welcome to the AI Universe.`;

      return {
        content: [
          {
            type: "text",
            text: greeting
          },
          {
            type: "resource",
            resource: {
              uri: widgetUri,
              mimeType: "text/html+skybridge",
              text: getWidgetHtml()
            }
          }
        ]
      };
    }
  };

  server.addTool(greetingTool);

  return server;
}

async function main() {
  const defaultPort = 3030;
  const portEnvRaw = process.env.PORT;
  const parsedPort = portEnvRaw !== undefined ? Number.parseInt(portEnvRaw, 10) : defaultPort;
  const listenPort =
    Number.isInteger(parsedPort) && parsedPort >= 1 && parsedPort <= 65535 ? parsedPort : defaultPort;
  const proxyPath = "/mcp";

  const server = await createGreetingServer();
  const { expressServer, mcpPort } = await startFastMcpHttpProxy({
    server,
    listenPort,
    proxyPath,
    configureApp: (app) => {
      app.get("/health", (_req, res) => {
        res.json({
          status: "healthy",
          service: "ai-universe",
          updatedAt: new Date().toISOString()
        });
      });
    }
  });

  expressServer.on("listening", () => {
    const address = expressServer.address() as AddressInfo | string | null;
    const addressPort = typeof address === "object" && address !== null ? address.port : listenPort;
    console.log(`AI Universe MCP server listening on http://localhost:${addressPort}`);
    console.log(`  Proxy path (SSE + messages): http://localhost:${addressPort}${proxyPath}`);
    console.log(`  Internal FastMCP transport: http://localhost:${mcpPort}`);
  });
}

void main().catch((error) => {
  console.error("Failed to start AI Universe MCP server:", error);
  process.exit(1);
});
