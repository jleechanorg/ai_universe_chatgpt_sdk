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
const widgetHtml = readFileSync(resolve(__dirname, "../widgets/ai-universe.html"), "utf-8");

const greetingArgsSchema = z
  .object({
    name: z.string().optional()
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
    text: widgetHtml
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
    text: widgetHtml
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

      const result = {
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
              text: widgetHtml
            }
          }
        ],
        structuredContent: {
          greeting,
          name: greetingName
        }
      } satisfies ContentResult & {
        structuredContent: {
          greeting: string;
          name: string;
        };
      };

      return result;
    }
  };

  server.addTool(greetingTool);

  return server;
}

async function main() {
  const defaultPort = 3030;
  const rawPort = process.env.PORT;
  const parsedPort = rawPort === undefined ? undefined : Number.parseInt(rawPort, 10);
  const listenPort =
    parsedPort !== undefined && Number.isFinite(parsedPort) && parsedPort > 0 && parsedPort <= 65535
      ? parsedPort
      : defaultPort;

  if (rawPort !== undefined && listenPort === defaultPort) {
    console.warn(
      `Ignoring invalid PORT value "${rawPort}". Falling back to default port ${defaultPort}.`
    );
  }
  const proxyPath = "/mcp";

  const server = await createGreetingServer();
  const { expressServer, mcpPort } = await startFastMcpHttpProxy({
    server,
    listenPort,
    proxyPath
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
  process.exitCode = 1;
});
