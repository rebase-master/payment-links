import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Params } from 'nestjs-pino';

const CORRELATION_HEADER = 'x-request-id';

export function loggerConfig(): Params {
  const isProduction = process.env.NODE_ENV === 'production';

  return {
    pinoHttp: {
      level: isProduction ? 'info' : 'debug',

      genReqId(req: IncomingMessage, res: ServerResponse): string {
        const incoming =
          req.headers[CORRELATION_HEADER] ?? req.headers['x-correlation-id'];
        const id =
          (Array.isArray(incoming) ? incoming[0] : incoming) ?? randomUUID();
        res.setHeader(CORRELATION_HEADER, id);
        return id;
      },

      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers["x-api-key"]',
          'req.headers["x-webhook-signature"]',
          'req.headers.cookie',
        ],
        remove: true,
      },

      transport: isProduction
        ? undefined
        : { target: 'pino-pretty', options: { singleLine: true } },
    },
  };
}
