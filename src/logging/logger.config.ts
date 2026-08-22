import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Params } from 'nestjs-pino';

const CORRELATION_HEADER = 'x-request-id';
const CORRELATION_ID = /^[A-Za-z0-9_.:-]{1,128}$/;

function readCorrelationId(req: IncomingMessage): string | undefined {
  const raw =
    req.headers[CORRELATION_HEADER] ?? req.headers['x-correlation-id'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value && CORRELATION_ID.test(value) ? value : undefined;
}

export function loggerConfig(): Params {
  const nodeEnv = process.env.NODE_ENV;
  const isTest = nodeEnv === 'test';
  const isDevelopment = nodeEnv === 'development';

  return {
    pinoHttp: {
      level: isTest ? 'silent' : isDevelopment ? 'debug' : 'info',

      genReqId(req: IncomingMessage, res: ServerResponse): string {
        const id = readCorrelationId(req) ?? randomUUID();
        res.setHeader(CORRELATION_HEADER, id);
        return id;
      },

      autoLogging: {
        ignore: (req: IncomingMessage): boolean => {
          const url = req.url ?? '';
          return url.startsWith('/health') || url === '/metrics';
        },
      },

      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers["x-api-key"]',
          'req.headers["x-webhook-signature"]',
          'req.headers.cookie',
          'res.headers["set-cookie"]',
        ],
        remove: true,
      },

      transport: isDevelopment
        ? { target: 'pino-pretty', options: { singleLine: true } }
        : undefined,
    },
  };
}
