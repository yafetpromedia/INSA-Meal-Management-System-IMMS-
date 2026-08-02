import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { AccountStatus } from '@prisma/client';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser, isCampusBoundRole } from './auth.types';

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
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: JwtPayload): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        roles: {
          include: {
            role: { include: { permissions: { include: { permission: true } } } },
          },
        },
        organizationAssignments: true,
        campusAssignments: true,
        programAssignments: true,
        mentorProfile: true,
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

    // Mentors are strictly camp-bound: prefer Mentor profile campus over free assignments.
    let campusIds = user.campusAssignments.map((c) => c.campusId);
    let programIds = user.programAssignments.map((p) => p.programId);
    const mentorProfile = user.mentorProfile
      ? {
          id: user.mentorProfile.id,
          campusId: user.mentorProfile.campusId,
          programId: user.mentorProfile.programId,
          academicYearId: user.mentorProfile.academicYearId,
        }
      : null;

    if (mentorProfile && roles.includes('Mentor')) {
      campusIds = [mentorProfile.campusId];
      programIds = mentorProfile.programId ? [mentorProfile.programId] : [];
    }

    const authUser: AuthUser = {
      id: user.id,
      username: user.username,
      email: user.email,
      fullName: user.fullName,
      roles,
      permissions,
      organizationIds: user.organizationAssignments.map((o) => o.organizationId),
      defaultOrganizationId: defaultOrg,
      campusIds,
      programIds,
      isSuperAdmin,
      activeCampusId: null,
      mentorProfile,
    };

    if (isCampusBoundRole(authUser) && campusIds.length === 0) {
      throw new UnauthorizedException(
        'No campus assignment. Contact your Campus Coordinator.',
      );
    }

    // Super Admin / Admin campus switcher (header), or Coordinator multi-campus filter.
    const headerCampus = String(req.headers['x-active-campus-id'] ?? '').trim();
    if (headerCampus) {
      if (isSuperAdmin || campusIds.includes(headerCampus)) {
        authUser.activeCampusId = headerCampus;
        if (!isSuperAdmin) {
          authUser.campusIds = [headerCampus];
        }
      }
    }

    return authUser;
  }
}
