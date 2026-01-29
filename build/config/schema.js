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
    else if (!data.JMAP_TOKEN) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['JMAP_TOKEN'],
            message: `JMAP_TOKEN is required when using ${data.JMAP_AUTH_METHOD} auth`,
        });
    }
});
export function loadConfig() {
    return envSchema.parse(process.env);
}
//# sourceMappingURL=schema.js.map