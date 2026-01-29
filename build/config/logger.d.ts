import pino from 'pino';
export type Logger = pino.Logger;
export declare function createLogger(level?: string): Logger;
