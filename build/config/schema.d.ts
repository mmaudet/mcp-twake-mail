import { z } from 'zod';
export declare const envSchema: z.ZodObject<{
    JMAP_SESSION_URL: z.ZodString;
    JMAP_AUTH_METHOD: z.ZodDefault<z.ZodEnum<{
        basic: "basic";
        bearer: "bearer";
        oidc: "oidc";
    }>>;
    JMAP_USERNAME: z.ZodOptional<z.ZodString>;
    JMAP_PASSWORD: z.ZodOptional<z.ZodString>;
    JMAP_TOKEN: z.ZodOptional<z.ZodString>;
    JMAP_REQUEST_TIMEOUT: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    LOG_LEVEL: z.ZodDefault<z.ZodEnum<{
        error: "error";
        fatal: "fatal";
        warn: "warn";
        info: "info";
        debug: "debug";
        trace: "trace";
    }>>;
}, z.core.$strip>;
export type Config = z.infer<typeof envSchema>;
export declare function loadConfig(): Config;
