import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ZodError } from 'zod';
import {
  EntityNotFoundError,
  CrossPortfolioIntegrityError,
  DuplicateExternalTransactionError,
  PersistenceError,
} from '@atlas/database';
import { DomainError } from '@atlas/domain';

const HTTP_STATUS_NAMES: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  422: 'Unprocessable Entity',
  500: 'Internal Server Error',
  503: 'Service Unavailable',
};

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const requestId =
      (request.headers['x-request-id'] as string) ||
      (response.getHeader('x-request-id') as string) ||
      'unknown';

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let errorCode = 'INTERNAL_SERVER_ERROR';
    let message = 'An unexpected internal error occurred';
    let details: unknown = undefined;

    if (exception instanceof ZodError) {
      statusCode = HttpStatus.BAD_REQUEST;
      errorCode = 'VALIDATION.INVALID_INPUT';
      message = 'Request validation failed';
      details = exception.errors.map((err) => ({
        path: err.path.join('.'),
        message: err.message,
        code: err.code,
      }));
    } else if (exception instanceof EntityNotFoundError) {
      statusCode = HttpStatus.NOT_FOUND;
      errorCode = exception.code ?? 'COMMON.NOT_FOUND';
      message = exception.message;
    } else if (exception instanceof CrossPortfolioIntegrityError) {
      statusCode = HttpStatus.CONFLICT;
      errorCode = 'PORTFOLIO.CROSS_PORTFOLIO_VIOLATION';
      message = exception.message;
    } else if (exception instanceof DuplicateExternalTransactionError) {
      statusCode = HttpStatus.CONFLICT;
      errorCode = 'TRANSACTION.DUPLICATE_EXTERNAL_ID';
      message = exception.message;
    } else if (exception instanceof DomainError) {
      statusCode = HttpStatus.BAD_REQUEST;
      errorCode = exception.code;
      message = exception.message;
    } else if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const resBody = exception.getResponse();
      if (typeof resBody === 'string') {
        message = resBody;
      } else if (typeof resBody === 'object' && resBody !== null) {
        const obj = resBody as Record<string, unknown>;
        message = (obj['message'] as string) || exception.message;
        if (obj['code']) {
          errorCode = String(obj['code']);
        }
      }
      errorCode = errorCode === 'INTERNAL_SERVER_ERROR' ? this.getDefaultCodeForStatus(statusCode) : errorCode;
    } else if (exception instanceof PersistenceError) {
      statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
      errorCode = exception.code ?? 'PERSISTENCE.ERROR';
      message = 'A persistence error occurred';
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    const errorName = HTTP_STATUS_NAMES[statusCode] ?? 'Error';

    // Safe logging: log metadata only, avoiding sensitive payload dumps
    console.error(
      `[${new Date().toISOString()}] [${requestId}] ${request.method} ${request.url} -> ${statusCode} (${errorCode}): ${message}`,
    );

    response.status(statusCode).json({
      statusCode,
      error: errorName,
      code: errorCode,
      message,
      ...(details ? { details } : {}),
      timestamp: new Date().toISOString(),
      path: request.url,
      requestId,
    });
  }

  private getDefaultCodeForStatus(status: number): string {
    switch (status) {
      case 400:
        return 'BAD_REQUEST';
      case 401:
        return 'UNAUTHORIZED';
      case 403:
        return 'FORBIDDEN';
      case 404:
        return 'NOT_FOUND';
      case 409:
        return 'CONFLICT';
      default:
        return 'INTERNAL_SERVER_ERROR';
    }
  }
}
