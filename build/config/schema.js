import { z } from 'zod';
export const envSchema = z
    .object({
    JMAP_SESSION_URL: z
        .string()
        .url('JMAP_SESSION_URL must be a valid URL')
        .refine((url) => {
        const parsed = new URL(url);
        return (parsed.protocol === 'https:' ||
            parsed.hostname === 'localhost' ||
            parsed.hostname === '127.0.0.1');
    }, { message: 'URL must use HTTPS. Only localhost allowed over HTTP for development.' }),
    JMAP_AUTH_METHOD: z.enum(['basic', 'bearer', 'oidc']).default('basic'),
    JMAP_USERNAME: z.string().optional(),
    JMAP_PASSWORD: z.string().optional(),
    JMAP_TOKEN: z.string().optional(),
    // OIDC configuration fields
    JMAP_OIDC_ISSUER: z
        .string()
        .url('JMAP_OIDC_ISSUER must be a valid URL')
        .optional(),
    JMAP_OIDC_CLIENT_ID: z.string().optional(),
    JMAP_OIDC_SCOPE: z.string().default('openid email offline_access'),
    JMAP_OIDC_REDIRECT_PORT: z.coerce.number().default(3000),
    JMAP_REQUEST_TIMEOUT: z.coerce.number().default(30000),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
})
    .superRefine((data, ctx) => {
    // Conditional validation: basic auth requires username+password
    if (data.JMAP_AUTH_METHOD === 'basic') {
        if (!data.JMAP_USERNAME) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['JMAP_USERNAME'],
                message: 'JMAP_USERNAME is required when using basic auth',
            });
        }
        if (!data.JMAP_PASSWORD) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['JMAP_PASSWORD'],
                message: 'JMAP_PASSWORD is required when using basic auth',
            });
        }
    }
    else if (data.JMAP_AUTH_METHOD === 'bearer') {
        // Bearer auth requires a token
        if (!data.JMAP_TOKEN) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['JMAP_TOKEN'],
                message: 'JMAP_TOKEN is required when using bearer auth',
            });
        }
    }
    else if (data.JMAP_AUTH_METHOD === 'oidc') {
        // OIDC requires issuer and client ID
        if (!data.JMAP_OIDC_ISSUER) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['JMAP_OIDC_ISSUER'],
                message: 'JMAP_OIDC_ISSUER is required when using oidc auth',
            });
        }
        if (!data.JMAP_OIDC_CLIENT_ID) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['JMAP_OIDC_CLIENT_ID'],
                message: 'JMAP_OIDC_CLIENT_ID is required when using oidc auth',
            });
        }
        // Note: JMAP_TOKEN is NOT required for OIDC - tokens come from the OAuth flow
    }
});
export function loadConfig() {
    return envSchema.parse(process.env);
}
//# sourceMappingURL=schema.js.map