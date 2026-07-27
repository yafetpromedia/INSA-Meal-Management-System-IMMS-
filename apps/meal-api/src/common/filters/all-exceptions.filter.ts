import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Something went wrong. Please try again.';
    let code = 'INTERNAL_ERROR';
    let errors: Array<{ field?: string; message: string }> | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
        code = HttpStatus[status] ?? 'HTTP_ERROR';
      } else if (typeof body === 'object' && body !== null) {
        const obj = body as Record<string, unknown>;
        const msg = obj.message;
        if (Array.isArray(msg)) {
          message = 'Validation failed';
          errors = msg.map((m) => {
            const text = String(m);
            const fieldMatch = text.match(/^(\w+)\s/);
            return { field: fieldMatch?.[1], message: text };
          });
          code = 'VALIDATION_ERROR';
        } else {
          message = String(msg ?? message);
          code = String(obj.error ?? obj.code ?? HttpStatus[status] ?? 'HTTP_ERROR');
        }
        if (Array.isArray(obj.errors)) {
          errors = obj.errors as Array<{ field?: string; message: string }>;
        }
      }
    } else if (exception instanceof Error) {
      const maybeStatus = (exception as Error & { status?: number }).status;
      if (maybeStatus === 401) {
        status = HttpStatus.UNAUTHORIZED;
        message = exception.message || 'Unauthorized';
        code = 'Unauthorized';
      } else {
        this.logger.error(exception.message, exception.stack);
      }
    }

    response.status(status).json({
      success: false,
      message,
      ...(errors ? { errors } : {}),
      statusCode: status,
      code,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}
