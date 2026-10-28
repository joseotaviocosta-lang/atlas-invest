import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { logger, telemetry } from '@atlas/logger';

@Injectable()
export class HttpLoggingMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const startTime = Date.now();

    res.on('finish', () => {
      const duration = Date.now() - startTime;
      const requestId =
        (req.headers['x-request-id'] as string) ||
        (res.getHeader('x-request-id') as string) ||
        'unknown';

      const route = req.baseUrl ? `${req.baseUrl}${req.path}` : req.path || req.url;

      // Telemetry recording with strict failure isolation
      try {
        telemetry.recordRequest(req.method, route, res.statusCode, duration);
      } catch {
        // Silently isolate telemetry failures from affecting request response
      }

      const logContext = {
        requestId,
        method: req.method,
        route,
        status: res.statusCode,
        duration,
      };

      const message = `${req.method} ${req.originalUrl || req.url} ${res.statusCode} - ${duration}ms`;

      if (res.statusCode >= 500) {
        logger.error(message, logContext);
      } else if (res.statusCode >= 400) {
        logger.warn(message, logContext);
      } else {
        logger.info(message, logContext);
      }
    });

    next();
  }
}
