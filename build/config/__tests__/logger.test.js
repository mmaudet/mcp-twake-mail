import { describe, it, expect } from 'vitest';
import { createLogger } from '../logger.js';
describe('createLogger', () => {
    it('should create a pino logger instance', () => {
        const logger = createLogger('info');
        // Verify it's a valid logger with expected methods
        expect(logger).toHaveProperty('info');
        expect(logger).toHaveProperty('error');
        expect(logger).toHaveProperty('warn');
        expect(logger).toHaveProperty('debug');
        expect(logger).toHaveProperty('trace');
        expect(logger).toHaveProperty('fatal');
    });
    it('should use the provided log level', () => {
        const logger = createLogger('debug');
        expect(logger.level).toBe('debug');
    });
    it('should default to info level', () => {
        const logger = createLogger();
        expect(logger.level).toBe('info');
    });
    it('should have mcp-twake-mail as name', () => {
        const logger = createLogger();
        // Pino logger has bindings for the name
        expect(logger.bindings()).toHaveProperty('name', 'mcp-twake-mail');
    });
});
//# sourceMappingURL=logger.test.js.map