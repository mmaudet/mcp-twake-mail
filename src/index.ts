#!/usr/bin/env node
import { loadConfig } from './config/schema.js';
import { createLogger } from './config/logger.js';
import { JMAPClient } from './jmap/client.js';
import { formatStartupError } from './errors.js';

async function main() {
  let sessionUrl: string | undefined;

  try {
    // Step 1: Load and validate configuration (fail-fast)
    const config = loadConfig();
    sessionUrl = config.JMAP_SESSION_URL;

    // Step 2: Initialize logger (uses config.LOG_LEVEL)
    const logger = createLogger(config.LOG_LEVEL);
    logger.info({ version: '0.1.0' }, 'Starting mcp-twake-mail server');

    // Step 3: Create and initialize JMAP client
    const client = new JMAPClient(config, logger);
    const session = await client.fetchSession();
    logger.info({ accountId: session.accountId }, 'JMAP client ready');

    // MCP server initialization will be added in Phase 3
  } catch (error) {
    // Format error with AI-friendly message and exit
    const errorMessage = formatStartupError(
      error instanceof Error ? error : new Error(String(error)),
      sessionUrl
    );
    console.error(`\n${errorMessage}\n`);
    process.exit(1);
  }
}

main();
