import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { AccountStatus } from '@prisma/client';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from './auth.types';

type JwtPayload = { sub: string; username?: string; email?: string };

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
        organizationAssignments: true,
        campusAssignments: true,
        programAssignments: true,
      },
    });

    if (!user || user.status !== AccountStatus.ACTIVE || user.deletedAt) {
      throw new UnauthorizedException('Account is not active');
    }

    const roles = user.roles.map((r) => r.role.name);
    const isSuperAdmin = roles.includes('SuperAdmin');
    const permissions = isSuperAdmin
      ? ['*']
      : [
          ...new Set(
            user.roles.flatMap((r) => r.role.permissions.map((p) => p.permission.key)),
          ),
        ];

    const defaultOrg =
      user.organizationAssignments.find((o) => o.isDefault)?.organizationId ??
      user.organizationAssignments[0]?.organizationId ??
      null;

    return {
      id: user.id,
      username: user.username,
      email: user.email,
      fullName: user.fullName,
      roles,
      permissions,
      organizationIds: user.organizationAssignments.map((o) => o.organizationId),
      defaultOrganizationId: defaultOrg,
      campusIds: user.campusAssignments.map((c) => c.campusId),
      programIds: user.programAssignments.map((p) => p.programId),
      isSuperAdmin,
    };
  }
}
