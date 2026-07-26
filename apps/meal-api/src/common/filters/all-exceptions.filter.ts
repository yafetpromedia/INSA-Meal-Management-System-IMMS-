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

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
        code = HttpStatus[status] ?? 'HTTP_ERROR';
      } else if (typeof body === 'object' && body !== null) {
        const obj = body as Record<string, unknown>;
        const msg = obj.message;
        message = Array.isArray(msg) ? msg.join(', ') : String(msg ?? message);
        code = String(obj.error ?? HttpStatus[status] ?? 'HTTP_ERROR');
      }
    } else if (exception instanceof Error) {
      // Passport sometimes throws plain Error with status attached
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
      statusCode: status,
      code,
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}
