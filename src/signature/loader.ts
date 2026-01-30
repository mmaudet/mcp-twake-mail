import { readFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { homedir } from 'node:os';
import type { Logger } from '../config/logger.js';
import { markdownToHtml, markdownToPlainText } from './converter.js';

export interface SignatureContent {
  text: string;
  html: string;
}

export async function loadSignature(
  signaturePath: string | undefined,
  logger: Logger
): Promise<SignatureContent | undefined> {
  if (!signaturePath) {
    logger.debug('No signature path configured');
    return undefined;
  }

  // Expand ~ to home directory
  const expandedPath = signaturePath.replace(/^~/, homedir());

  try {
    // Check file exists and is readable
    await access(expandedPath, constants.R_OK);

    // Read file content
    const markdown = await readFile(expandedPath, 'utf-8');

    // Convert to both formats
    const result: SignatureContent = {
      text: markdownToPlainText(markdown),
      html: markdownToHtml(markdown),
    };

    logger.info({ path: expandedPath }, 'Signature loaded successfully');
    return result;
  } catch (error) {
    // Don't crash if file missing - just log warning
    logger.warn(
      { error, path: expandedPath },
      'Failed to load signature file - emails will be sent without signature'
    );
    return undefined;
  }
}
