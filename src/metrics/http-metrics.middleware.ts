import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { MetricsService } from './metrics.service';

function routePath(req: Request): string {
  const route: unknown = req.route;
  if (route !== null && typeof route === 'object' && 'path' in route) {
    const { path } = route;
    if (typeof path === 'string') return path;
  }
  // Apollo mounts /graphql as middleware, so it has no req.route. Label it
  // explicitly rather than hiding the app's main endpoint under "unmatched";
  // keep everything else "unmatched" to bound label cardinality (e.g. 404
  // scans of arbitrary paths).
  if (req.path === '/graphql') {
    return '/graphql';
  }
  return 'unmatched';
}

@Injectable()
export class HttpMetricsMiddleware implements NestMiddleware {
  constructor(private readonly metrics: MetricsService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const start = process.hrtime.bigint();

    res.on('finish', () => {
      const durationSeconds = Number(process.hrtime.bigint() - start) / 1e9;
      this.metrics.observeHttpRequest(
        req.method,
        routePath(req),
        res.statusCode,
        durationSeconds,
      );
    });

    next();
  }
}
