import pino from 'pino';
export function createLogger(level = 'info') {
    return pino({
        name: 'mcp-twake-mail',
        level,
    }, pino.destination(2) // CRITICAL: fd 2 = stderr. NEVER use stdout.
    );
}
//# sourceMappingURL=logger.js.map