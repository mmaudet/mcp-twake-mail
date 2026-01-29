#!/usr/bin/env node
/**
 * MCP server entry point.
 * Starts the MCP server with JMAP validation.
 */
import { startServer } from './mcp/server.js';

startServer().catch((error) => {
  // Log to stderr (NEVER stdout - reserved for MCP JSON-RPC)
  process.stderr.write(`Fatal error: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
