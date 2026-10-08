import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

/**
 * Phase 4J.1/4J.2 — unconditional no-store policy for the unified annual IRPF
 * routes (unified state + review package + package export).
 *
 * The unified annual state and its review package reflect a subject's fiscal
 * posture, so they must never be cached by shared caches. Setting the directive
 * in a route-scoped middleware (rather than only inside the successful handler)
 * guarantees the header is present on EVERY response for these routes —
 * including the 400 param-validation failure, the 401 authentication failure,
 * 404 anti-enumeration, the outer-fence 422, and a 500 — all of which flow
 * through the global exception filter AFTER this middleware has already written
 * the header to the response object.
 *
 * Scope is strictly the three unified annual GET routes (wired via `forRoutes`
 * in AppModule), so no other route's cache behavior changes.
 */
@Injectable()
export class UnifiedAnnualNoStoreMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    // The single-segment `annual/:calendarYear` pattern also matches the literal
    // `annual/opening-positions` route; skip it so only the unified annual route
    // gains the directive and no sibling route's cache behavior changes.
    const lastSegment = req.path.split('/').filter(Boolean).pop();
    if (lastSegment !== 'opening-positions') {
      res.setHeader('Cache-Control', 'private, no-store');
    }
    next();
  }
}
