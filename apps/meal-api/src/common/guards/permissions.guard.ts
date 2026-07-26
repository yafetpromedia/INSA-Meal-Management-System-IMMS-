import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { AuthUser, hasPermission } from '../../modules/auth/auth.types';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user: AuthUser }>();
    const user = request.user;
    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    const allowed = required.every((permission) => hasPermission(user, permission));
    if (!allowed) {
      throw new ForbiddenException('You do not have permission to perform this action');
    }
    return true;
  }
}
