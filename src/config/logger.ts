import pino from 'pino';

export type Logger = pino.Logger;

export function createLogger(level: string = 'info'): Logger {
  return pino(
    {
      name: 'mcp-twake-mail',
      level,
    },
    pino.destination(2) // CRITICAL: fd 2 = stderr. NEVER use stdout.
  );
}
