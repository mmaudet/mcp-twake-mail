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

  it('should throw ZodError when basic auth missing password', () => {
    process.env.JMAP_SESSION_URL = 'https://jmap.example.com/session';
    process.env.JMAP_AUTH_METHOD = 'basic';
    process.env.JMAP_USERNAME = 'test@example.com';
    delete process.env.JMAP_PASSWORD;

    expect(() => loadConfig()).toThrow(ZodError);
  });

  it('should throw ZodError when oidc auth missing issuer', () => {
    process.env.JMAP_SESSION_URL = 'https://jmap.example.com/session';
    process.env.JMAP_AUTH_METHOD = 'oidc';
    delete process.env.JMAP_OIDC_ISSUER;
    process.env.JMAP_OIDC_CLIENT_ID = 'client-123';

    expect(() => loadConfig()).toThrow(ZodError);
  });

  it('should throw ZodError when oidc auth missing client ID', () => {
    process.env.JMAP_SESSION_URL = 'https://jmap.example.com/session';
    process.env.JMAP_AUTH_METHOD = 'oidc';
    process.env.JMAP_OIDC_ISSUER = 'https://auth.example.com';
    delete process.env.JMAP_OIDC_CLIENT_ID;

    expect(() => loadConfig()).toThrow(ZodError);
  });

  it('should allow valid oidc auth configuration', () => {
    process.env.JMAP_SESSION_URL = 'https://jmap.example.com/session';
    process.env.JMAP_AUTH_METHOD = 'oidc';
    process.env.JMAP_OIDC_ISSUER = 'https://auth.example.com';
    process.env.JMAP_OIDC_CLIENT_ID = 'client-123';

    const config = loadConfig();

    expect(config.JMAP_AUTH_METHOD).toBe('oidc');
    expect(config.JMAP_OIDC_ISSUER).toBe('https://auth.example.com');
    expect(config.JMAP_OIDC_CLIENT_ID).toBe('client-123');
    expect(config.JMAP_OIDC_SCOPE).toBe('openid email offline_access'); // default
  });

  it('should allow bearer auth with valid token', () => {
    process.env.JMAP_SESSION_URL = 'https://jmap.example.com/session';
    process.env.JMAP_AUTH_METHOD = 'bearer';
    process.env.JMAP_TOKEN = 'valid-bearer-token';

    const config = loadConfig();

    expect(config.JMAP_AUTH_METHOD).toBe('bearer');
    expect(config.JMAP_TOKEN).toBe('valid-bearer-token');
  });

  it('should allow 127.0.0.1 with HTTP', () => {
    process.env.JMAP_SESSION_URL = 'http://127.0.0.1:8080/session';
    process.env.JMAP_USERNAME = 'test';
    process.env.JMAP_PASSWORD = 'test';

    const config = loadConfig();
    expect(config.JMAP_SESSION_URL).toBe('http://127.0.0.1:8080/session');
  });
});
