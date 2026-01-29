#!/usr/bin/env node
/**
 * Entry point for mcp-twake-mail.
 * Routes to CLI commands or MCP server based on arguments.
 */
import { runCLI } from './cli/index.js';

runCLI().catch((error) => {
  // Log to stderr (NEVER stdout - may be reserved for MCP JSON-RPC)
  process.stderr.write(`Fatal error: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
