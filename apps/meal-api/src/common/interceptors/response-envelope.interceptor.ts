import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, map } from 'rxjs';
import { SKIP_ENVELOPE_KEY } from '../decorators/skip-envelope.decorator';
import { paginatedMeta } from '../utils/pagination.util';

@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_ENVELOPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return next.handle();

    const req = context.switchToHttp().getRequest<{ query?: Record<string, string> }>();

    return next.handle().pipe(
      map((payload) => {
        if (
          payload &&
          typeof payload === 'object' &&
          'success' in (payload as object) &&
          typeof (payload as { success: unknown }).success === 'boolean'
        ) {
          return payload;
        }

        if (
          payload &&
          typeof payload === 'object' &&
          'items' in (payload as object) &&
          'total' in (payload as object)
        ) {
          const page = Number(
            (payload as { page?: number }).page ??
              req.query?.page ??
              1,
          );
          const limit = Number(
            (payload as { limit?: number }).limit ??
              req.query?.limit ??
              req.query?.take ??
              20,
          );
          const total = Number((payload as { total: number }).total);
          return {
            success: true,
            message: 'OK',
            data: (payload as { items: unknown }).items,
            meta: paginatedMeta(total, page, limit),
          };
        }

        return {
          success: true,
          message: 'OK',
          data: payload ?? null,
          meta: {},
        };
      }),
    );
  }
}
