import { describe, it, expect, beforeEach } from 'vitest';
import { loadConfig } from '../schema.js';
import { ZodError } from 'zod';

describe('loadConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  it('should return Config type with valid env vars', () => {
    process.env.JMAP_SESSION_URL = 'https://jmap.example.com/session';
    process.env.JMAP_AUTH_METHOD = 'basic';
    process.env.JMAP_USERNAME = 'test@example.com';
    process.env.JMAP_PASSWORD = 'testpass';

    const config = loadConfig();

    expect(config).toHaveProperty('JMAP_SESSION_URL');
    expect(config.JMAP_SESSION_URL).toBe('https://jmap.example.com/session');
    expect(config.JMAP_USERNAME).toBe('test@example.com');
    expect(config.JMAP_PASSWORD).toBe('testpass');
    expect(config.LOG_LEVEL).toBe('info'); // default
  });

  it('should allow localhost with HTTP', () => {
    process.env.JMAP_SESSION_URL = 'http://localhost:8080/session';
    process.env.JMAP_USERNAME = 'test';
    process.env.JMAP_PASSWORD = 'test';

    const config = loadConfig();
    expect(config.JMAP_SESSION_URL).toBe('http://localhost:8080/session');
  });

  it('should throw ZodError when JMAP_SESSION_URL is missing', () => {
    delete process.env.JMAP_SESSION_URL;
    process.env.JMAP_USERNAME = 'test';
    process.env.JMAP_PASSWORD = 'test';

    expect(() => loadConfig()).toThrow(ZodError);
  });

  it('should throw ZodError when using HTTP with non-localhost', () => {
    process.env.JMAP_SESSION_URL = 'http://insecure.example.com/session';
    process.env.JMAP_USERNAME = 'test';
    process.env.JMAP_PASSWORD = 'test';

    expect(() => loadConfig()).toThrow(ZodError);
  });

  it('should throw ZodError when basic auth missing username', () => {
    process.env.JMAP_SESSION_URL = 'https://jmap.example.com/session';
    process.env.JMAP_AUTH_METHOD = 'basic';
    delete process.env.JMAP_USERNAME;
    process.env.JMAP_PASSWORD = 'test';

    expect(() => loadConfig()).toThrow(ZodError);
  });

  it('should throw ZodError when bearer auth missing token', () => {
    process.env.JMAP_SESSION_URL = 'https://jmap.example.com/session';
    process.env.JMAP_AUTH_METHOD = 'bearer';
    delete process.env.JMAP_TOKEN;

    expect(() => loadConfig()).toThrow(ZodError);
  });
});
