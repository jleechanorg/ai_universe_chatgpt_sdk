#!/usr/bin/env node
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';

const DEFAULT_TIMEOUT_MS = Number(process.env.MCP_TEST_TIMEOUT_MS ?? 30000);
const DEFAULT_ATTEMPTS = Number(process.env.MCP_TEST_MAX_ATTEMPTS ?? 4);
const DEFAULT_RETRY_DELAY_MS = Number(process.env.MCP_TEST_RETRY_DELAY_MS ?? 1000);
const HEALTH_MAX_ATTEMPTS = Number(
  process.env.MCP_HEALTH_MAX_ATTEMPTS ?? process.env.HEALTH_CHECK_MAX_ATTEMPTS ?? 12
);
const HEALTH_INTERVAL_SECONDS = Number(
  process.env.MCP_HEALTH_INTERVAL_SECONDS ?? process.env.HEALTH_CHECK_INTERVAL_SECONDS ?? 5
);
const EXPECTED_TOOLS = (process.env.MCP_EXPECTED_TOOLS ?? 'ai_universe_greeting')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const EXPECTED_PRIMARY_COUNT = Number(process.env.MCP_EXPECTED_PRIMARY_COUNT ?? 0);
const EXPECTED_SECONDARY_COUNT = Number(process.env.MCP_EXPECTED_SECONDARY_COUNT ?? 0);
const SECOND_OPINION_TOOL = process.env.MCP_SECOND_OPINION_TOOL ?? 'agent.second_opinion';

const baseUrlRaw = process.env.MCP_SERVER_URL ?? process.env.PREVIEW_URL ?? '';
if (!baseUrlRaw) {
  console.error('❌ MCP_SERVER_URL (or PREVIEW_URL) must be set.');
  process.exitCode = 1;
  process.exit();
}

const baseUrl = baseUrlRaw.replace(/\/$/, '');
const healthUrl = `${baseUrl}/health`;
const mcpUrl = `${baseUrl}/mcp`;

console.log(`ℹ️ Running MCP smoke tests against ${baseUrl}`);

async function fetchWithRetries(url, { timeout = DEFAULT_TIMEOUT_MS, attemptLabel, ...options } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= DEFAULT_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(timer);
      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }
      return response;
    } catch (error) {
      clearTimeout(timer);
      lastError = error;
      const delayMs = DEFAULT_RETRY_DELAY_MS * attempt;
      const label = attemptLabel ?? url;
      console.warn(`⚠️ Attempt ${attempt}/${DEFAULT_ATTEMPTS} for ${label} failed: ${error}`);
      if (attempt === DEFAULT_ATTEMPTS) {
        throw lastError;
      }
      await delay(delayMs);
    }
  }
  throw new Error(`Failed to fetch ${url}`);
}

async function waitForHealth() {
  console.log('ℹ️ Waiting for /health to report healthy...');
  for (let attempt = 1; attempt <= HEALTH_MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(healthUrl, { headers: { Accept: 'application/json' } });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const payload = await response.json();
      if (payload && typeof payload === 'object') {
        if (payload.status === 'healthy' || payload.status === 'ok') {
          console.log('✅ Health endpoint reports healthy state.');
          return payload;
        }
      }
      console.log(`ℹ️ Health response attempt ${attempt}:`, payload);
    } catch (error) {
      console.log(`ℹ️ Health probe ${attempt}/${HEALTH_MAX_ATTEMPTS} failed: ${error}`);
    }
    await delay(HEALTH_INTERVAL_SECONDS * 1000);
  }
  throw new Error('/health endpoint did not report healthy state within the allotted retries');
}

async function jsonRpcRequest(method, params = {}) {
  const id = randomUUID();
  const response = await fetchWithRetries(mcpUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream'
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id,
      method,
      params
    }),
    attemptLabel: method
  });

  const data = await response.json();
  if ('error' in data) {
    throw new Error(`RPC ${method} failed: ${JSON.stringify(data.error)}`);
  }
  if (data.id !== id) {
    throw new Error(`RPC ${method} returned mismatched id ${data.id}, expected ${id}`);
  }
  return data.result;
}

async function runSmokeTests() {
  await waitForHealth();

  console.log('ℹ️ Initializing MCP server...');
  const initializeResult = await jsonRpcRequest('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: {
      name: 'ai-universe-ci',
      version: '0.1.0'
    }
  });
  assert.equal(initializeResult.protocolVersion, '2024-11-05');
  assert.ok(initializeResult.serverInfo?.name, 'Server must return serverInfo.name');
  console.log(`✅ Server identified as ${initializeResult.serverInfo.name} v${initializeResult.serverInfo.version}`);

  console.log('ℹ️ Fetching tools list...');
  const toolsResult = await jsonRpcRequest('tools/list', {});
  const toolNames = (toolsResult.tools ?? []).map((tool) => tool.name);
  console.log('ℹ️ Tools available:', toolNames.join(', ') || '(none)');
  for (const toolName of EXPECTED_TOOLS) {
    assert.ok(toolNames.includes(toolName), `Expected tool ${toolName} to be registered`);
  }
  console.log('✅ Expected tools are available.');

  if (EXPECTED_TOOLS.length > 0) {
    const sampleTool = EXPECTED_TOOLS[0];
    console.log(`ℹ️ Invoking ${sampleTool} for sanity check...`);
    const toolResult = await jsonRpcRequest('tools/call', {
      name: sampleTool,
      arguments: { name: 'Smoke Test' }
    });
    const content = toolResult?.content ?? [];
    assert.ok(Array.isArray(content) && content.length > 0, 'Tool result must include content');
    const textBlock = content.find((item) => item.type === 'text');
    assert.ok(textBlock, 'Tool result must include a text block');
    assert.match(textBlock.text, /Hello/i, 'Greeting text should be returned');
    console.log('✅ Tool invocation returned expected content.');
  }

  if (EXPECTED_PRIMARY_COUNT > 0 || EXPECTED_SECONDARY_COUNT > 0) {
    if (toolNames.includes(SECOND_OPINION_TOOL)) {
      console.log(`ℹ️ Invoking ${SECOND_OPINION_TOOL} for multi-response validation...`);
      const result = await jsonRpcRequest('tools/call', {
        name: SECOND_OPINION_TOOL,
        arguments: {
          question: 'Is the AI Universe preview healthy?',
          context: 'Automated smoke test'
        }
      });
      const primary = result?.primary?.filter((entry) => !entry.isError) ?? [];
      const secondary = result?.secondary?.filter((entry) => !entry.isError) ?? [];
      assert.equal(
        primary.length,
        EXPECTED_PRIMARY_COUNT,
        `Expected ${EXPECTED_PRIMARY_COUNT} primary responses but received ${primary.length}`
      );
      assert.equal(
        secondary.length,
        EXPECTED_SECONDARY_COUNT,
        `Expected ${EXPECTED_SECONDARY_COUNT} secondary responses but received ${secondary.length}`
      );
      console.log('✅ agent.second_opinion responses matched expectations.');
    } else {
      throw new Error(
        `Expected to validate ${SECOND_OPINION_TOOL}, but it is not registered. Available tools: ${toolNames.join(', ')}`
      );
    }
  } else {
    console.log('ℹ️ Skipping agent.second_opinion checks (not required by configuration).');
  }

  console.log('🎉 MCP smoke tests completed successfully.');
}

runSmokeTests().catch((error) => {
  console.error('❌ MCP smoke tests failed:', error);
  process.exitCode = 1;
});
