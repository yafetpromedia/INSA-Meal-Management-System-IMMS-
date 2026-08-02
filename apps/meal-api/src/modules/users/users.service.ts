import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AccountStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../../prisma/prisma.service';
import { isStrongPassword, PASSWORD_POLICY_MESSAGE } from '../../common/utils/password.util';
import {
  isValidUsername,
  normalizeUsername,
  USERNAME_POLICY_MESSAGE,
} from '../../common/utils/username.util';
import { AuditService } from '../audit/audit.service';
import {
  AuthUser,
  PLATFORM_SCOPE,
  assertCampusAccess,
  assertOrgAccess,
} from '../auth/auth.types';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(user: AuthUser) {
    return this.prisma.user.findMany({
      where: user.isSuperAdmin
        ? { deletedAt: null }
        : {
            deletedAt: null,
            organizationAssignments: {
              some: { organizationId: { in: user.organizationIds } },
            },
            ...(user.campusIds.length
              ? {
                  OR: [
                    { campusAssignments: { some: { campusId: { in: user.campusIds } } } },
                    { mentorProfile: { campusId: { in: user.campusIds } } },
                  ],
                }
              : {}),
          },
      select: {
        id: true,
        username: true,
        email: true,
        fullName: true,
        phone: true,
        status: true,
        lastLoginAt: true,
        roles: { include: { role: true } },
        organizationAssignments: true,
        campusAssignments: true,
        programAssignments: true,
        mentorProfile: {
          include: {
            campus: { select: { id: true, name: true, shortName: true } },
            program: { select: { id: true, name: true } },
            academicYear: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { fullName: 'asc' },
    });
  }

  async create(
    actor: AuthUser,
    data: {
      username: string;
      email?: string;
      fullName: string;
      password: string;
      phone?: string;
      roleNames: string[];
      organizationIds?: string[];
      campusIds?: string[];
      programIds?: string[];
      /** Mentor-only: single campus binding */
      campusId?: string;
      programId?: string | null;
      academicYearId?: string;
      /** Meal staff (Mentor / FoodStaff) must have at least one campus to scan. */
      requireCampus?: boolean;
    },
  ) {
    if (!isStrongPassword(data.password)) {
      throw new BadRequestException(PASSWORD_POLICY_MESSAGE);
    }
    if (!isValidUsername(data.username)) {
      throw new BadRequestException(USERNAME_POLICY_MESSAGE);
    }
    if (data.roleNames.includes('SuperAdmin') && !actor.isSuperAdmin) {
      throw new ForbiddenException('Cannot assign Super Admin role');
    }

    const isMentor = data.roleNames.includes('Mentor');
    let campusIds = [...(data.campusIds ?? [])];
    let programIds = [...(data.programIds ?? [])];
    let academicYearId = data.academicYearId;

    if (isMentor) {
      const campusId = data.campusId ?? campusIds[0];
      if (!campusId) {
        throw new BadRequestException(
          'Mentors must be assigned to exactly one campus.',
        );
      }
      campusIds = [campusId];
      if (data.programId) programIds = [data.programId];
      else programIds = [];
      if (!academicYearId) {
        throw new BadRequestException('Mentors must be assigned to an academic year.');
      }
    } else if (data.requireCampus && !campusIds.length) {
      throw new BadRequestException(
        'Assign at least one campus so this staff member can scan students.',
      );
    }

    for (const orgId of data.organizationIds ?? []) {
      if (!assertOrgAccess(actor, orgId)) {
        throw new ForbiddenException('Cannot assign organization outside your scope');
      }
    }

    await this.assertAssignableCampuses(actor, campusIds, data.organizationIds ?? []);
    if (isMentor && academicYearId) {
      await this.assertMentorBindings({
        campusId: campusIds[0]!,
        programId: programIds[0] ?? null,
        academicYearId,
        organizationIds: data.organizationIds ?? [],
      });
    }

    const username = normalizeUsername(data.username);
    const email = data.email?.trim() ? data.email.trim().toLowerCase() : null;

    const [byUsername, byEmail] = await Promise.all([
      this.prisma.user.findUnique({ where: { username } }),
      email ? this.prisma.user.findUnique({ where: { email } }) : Promise.resolve(null),
    ]);

    if (byUsername && !byUsername.deletedAt) {
      throw new ConflictException('Username is already taken');
    }
    if (byEmail && !byEmail.deletedAt && byEmail.id !== byUsername?.id) {
      throw new ConflictException('Email is already in use');
    }

    const roles = await this.prisma.role.findMany({
      where: {
        name: { in: data.roleNames },
        OR: [
          { scopeKey: PLATFORM_SCOPE },
          ...(data.organizationIds?.length
            ? [{ scopeKey: { in: data.organizationIds } }]
            : []),
        ],
      },
    });
    const foundNames = new Set(roles.map((r) => r.name));
    if (data.roleNames.some((n) => !foundNames.has(n))) {
      throw new BadRequestException('One or more roles are invalid');
    }

    const passwordHash = await argon2.hash(data.password);
    const orgIds = data.organizationIds ?? [];

    // Soft-deleted staff still occupy unique username/email — restore instead of failing.
    const restoreTarget =
      byUsername?.deletedAt
        ? byUsername
        : byEmail?.deletedAt
          ? byEmail
          : null;

    if (restoreTarget) {
      if (
        byEmail?.deletedAt &&
        byEmail.id !== restoreTarget.id
      ) {
        await this.prisma.user.update({
          where: { id: byEmail.id },
          data: { email: null },
        });
      }

      const restored = await this.restoreSoftDeletedUser(restoreTarget.id, {
        username,
        email,
        fullName: data.fullName,
        phone: data.phone,
        passwordHash,
        roleIds: roles.map((r) => r.id),
        organizationIds: orgIds,
        campusIds,
        programIds,
        isMentor,
        academicYearId,
      });

      await this.audit.log({
        userId: actor.id,
        action: 'User.Restore',
        resource: 'User',
        resourceId: restored.id,
        newValue: {
          username: restored.username,
          email: restored.email,
          roles: data.roleNames,
          organizationIds: orgIds,
          campusIds,
          mentorCampusId: isMentor ? campusIds[0] : undefined,
        },
      });

      const { passwordHash: _omitRestored, ...safeRestored } = restored as typeof restored & {
        passwordHash?: string;
      };
      return safeRestored;
    }

    const created = await this.prisma.user.create({
      data: {
        username,
        email,
        fullName: data.fullName,
        phone: data.phone,
        passwordHash,
        status: AccountStatus.ACTIVE,
        roles: { create: roles.map((r) => ({ roleId: r.id })) },
        organizationAssignments: {
          create: orgIds.map((organizationId, index) => ({
            organizationId,
            isDefault: index === 0,
          })),
        },
        campusAssignments: {
          create: campusIds.map((campusId) => ({ campusId })),
        },
        programAssignments: {
          create: programIds.map((programId) => ({ programId })),
        },
        ...(isMentor && academicYearId
          ? {
              mentorProfile: {
                create: {
                  campusId: campusIds[0]!,
                  programId: programIds[0] ?? null,
                  academicYearId,
                  status: AccountStatus.ACTIVE,
                },
              },
            }
          : {}),
      },
      include: {
        roles: { include: { role: true } },
        organizationAssignments: true,
        campusAssignments: true,
        mentorProfile: {
          include: {
            campus: { select: { id: true, name: true, shortName: true } },
            program: { select: { id: true, name: true } },
            academicYear: { select: { id: true, name: true } },
          },
        },
      },
    });

    await this.audit.log({
      userId: actor.id,
      action: 'User.Create',
      resource: 'User',
      resourceId: created.id,
      newValue: {
        username: created.username,
        email: created.email,
        roles: data.roleNames,
        organizationIds: orgIds,
        campusIds,
        mentorCampusId: isMentor ? campusIds[0] : undefined,
      },
    });

    const { passwordHash: _omit, ...safe } = created as typeof created & { passwordHash?: string };
    return safe;
  }

  private async restoreSoftDeletedUser(
    userId: string,
    data: {
      username: string;
      email: string | null;
      fullName: string;
      phone?: string;
      passwordHash: string;
      roleIds: string[];
      organizationIds: string[];
      campusIds: string[];
      programIds: string[];
      isMentor: boolean;
      academicYearId?: string;
    },
  ) {
    await this.prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { userId } });
      await tx.userOrganizationAssignment.deleteMany({ where: { userId } });
      await tx.userCampusAssignment.deleteMany({ where: { userId } });
      await tx.userProgramAssignment.deleteMany({ where: { userId } });
      await tx.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      await tx.user.update({
        where: { id: userId },
        data: {
          username: data.username,
          email: data.email,
          fullName: data.fullName,
          phone: data.phone ?? null,
          passwordHash: data.passwordHash,
          status: AccountStatus.ACTIVE,
          deletedAt: null,
          failedLoginAttempts: 0,
          lockedUntil: null,
          roles: { create: data.roleIds.map((roleId) => ({ roleId })) },
          organizationAssignments: {
            create: data.organizationIds.map((organizationId, index) => ({
              organizationId,
              isDefault: index === 0,
            })),
          },
          campusAssignments: {
            create: data.campusIds.map((campusId) => ({ campusId })),
          },
          programAssignments: {
            create: data.programIds.map((programId) => ({ programId })),
          },
        },
      });

      if (data.isMentor && data.academicYearId && data.campusIds[0]) {
        await tx.mentor.upsert({
          where: { userId },
          create: {
            userId,
            campusId: data.campusIds[0],
            programId: data.programIds[0] ?? null,
            academicYearId: data.academicYearId,
            status: AccountStatus.ACTIVE,
          },
          update: {
            campusId: data.campusIds[0],
            programId: data.programIds[0] ?? null,
            academicYearId: data.academicYearId,
            status: AccountStatus.ACTIVE,
          },
        });
      } else {
        await tx.mentor.updateMany({
          where: { userId },
          data: { status: AccountStatus.INACTIVE },
        });
      }
    });

    return this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        roles: { include: { role: true } },
        organizationAssignments: true,
        campusAssignments: true,
        mentorProfile: {
          include: {
            campus: { select: { id: true, name: true, shortName: true } },
            program: { select: { id: true, name: true } },
            academicYear: { select: { id: true, name: true } },
          },
        },
      },
    });
  }

  async assignRole(actor: AuthUser, userId: string, roleName: string, organizationId?: string) {
    if (roleName === 'SuperAdmin' && !actor.isSuperAdmin) {
      throw new ForbiddenException('Cannot assign Super Admin role');
    }
    const role = await this.prisma.role.findFirst({
      where: {
        name: roleName,
        OR: [
          { scopeKey: PLATFORM_SCOPE },
          ...(organizationId ? [{ scopeKey: organizationId }] : []),
        ],
      },
    });
    if (!role) throw new NotFoundException('Role not found');
    await this.prisma.userRole.upsert({
      where: { userId_roleId: { userId, roleId: role.id } },
      create: { userId, roleId: role.id, organizationId },
      update: { organizationId },
    });
    await this.audit.log({
      userId: actor.id,
      action: 'User.RoleAssign',
      resource: 'User',
      resourceId: userId,
      organizationId,
      newValue: { roleName },
    });
    return { success: true };
  }

  private async assertCanManageUser(actor: AuthUser, userId: string) {
    const target = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      include: {
        roles: { include: { role: true } },
        organizationAssignments: true,
        campusAssignments: true,
        mentorProfile: true,
      },
    });
    if (!target) throw new NotFoundException('User not found');
    if (target.roles.some((r) => r.role.name === 'SuperAdmin') && !actor.isSuperAdmin) {
      throw new ForbiddenException('Cannot modify Super Admin');
    }
    if (!actor.isSuperAdmin) {
      const overlap = target.organizationAssignments.some((a) =>
        actor.organizationIds.includes(a.organizationId),
      );
      if (!overlap) throw new NotFoundException('User not found');
      if (actor.campusIds.length) {
        const targetCampuses = new Set([
          ...target.campusAssignments.map((c) => c.campusId),
          ...(target.mentorProfile ? [target.mentorProfile.campusId] : []),
        ]);
        const inScope = [...targetCampuses].some((id) => actor.campusIds.includes(id));
        if (targetCampuses.size > 0 && !inScope) {
          throw new ForbiddenException('Staff member is outside your campus scope');
        }
      }
    }
    return target;
  }

  async setStatus(actor: AuthUser, userId: string, status: AccountStatus) {
    await this.assertCanManageUser(actor, userId);
    return this.prisma.user.update({
      where: { id: userId },
      data: { status },
      select: {
        id: true,
        username: true,
        email: true,
        fullName: true,
        status: true,
      },
    });
  }

  async updateProfile(
    actor: AuthUser,
    userId: string,
    data: Partial<{ fullName: string; phone: string }>,
  ) {
    await this.assertCanManageUser(actor, userId);
    return this.prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        username: true,
        email: true,
        fullName: true,
        phone: true,
        status: true,
      },
    });
  }

  /** Update mentor / food staff profile and campus assignments. */
  async updateStaff(
    actor: AuthUser,
    userId: string,
    data: Partial<{
      username: string;
      email: string | null;
      fullName: string;
      phone: string;
      campusIds: string[];
      campusId: string;
      programId: string | null;
      academicYearId: string;
    }>,
  ) {
    const target = await this.assertCanManageUser(actor, userId);
    const isMentor = target.roles.some((r) => r.role.name === 'Mentor');
    const orgIds = target.organizationAssignments.map((o) => o.organizationId);

    let nextUsername: string | undefined;
    let nextEmail: string | null | undefined;

    if (data.username !== undefined) {
      if (!isValidUsername(data.username)) {
        throw new BadRequestException(USERNAME_POLICY_MESSAGE);
      }
      nextUsername = normalizeUsername(data.username);
      if (nextUsername !== target.username) {
        const taken = await this.prisma.user.findFirst({
          where: { username: nextUsername, deletedAt: null },
        });
        if (taken && taken.id !== userId) {
          throw new ConflictException('Username is already taken');
        }
      }
    }

    if (data.email !== undefined) {
      nextEmail = data.email?.trim() ? data.email.trim().toLowerCase() : null;
      if (nextEmail && nextEmail !== (target.email ?? null)) {
        const taken = await this.prisma.user.findFirst({
          where: { email: nextEmail, deletedAt: null },
        });
        if (taken && taken.id !== userId) {
          throw new ConflictException('Email is already in use');
        }
      }
    }

    let campusIds = data.campusIds;
    if (isMentor) {
      const campusId = data.campusId ?? data.campusIds?.[0];
      if (campusId) campusIds = [campusId];
      if (campusIds && campusIds.length !== 1) {
        throw new BadRequestException('Mentors must be assigned to exactly one campus.');
      }
    } else if (data.campusIds !== undefined && data.campusIds.length === 0) {
      throw new BadRequestException(
        'Assign at least one campus so this staff member can scan students.',
      );
    }

    if (campusIds?.length) {
      await this.assertAssignableCampuses(actor, campusIds, orgIds);
    }

    if (isMentor) {
      const nextCampusId = campusIds?.[0] ?? target.mentorProfile?.campusId;
      const nextYearId = data.academicYearId ?? target.mentorProfile?.academicYearId;
      const nextProgramId =
        data.programId !== undefined
          ? data.programId
          : (target.mentorProfile?.programId ?? null);
      if (!nextCampusId || !nextYearId) {
        throw new BadRequestException(
          'Mentors require a campus and academic year assignment.',
        );
      }
      await this.assertMentorBindings({
        campusId: nextCampusId,
        programId: nextProgramId,
        academicYearId: nextYearId,
        organizationIds: orgIds,
      });

      await this.prisma.$transaction([
        this.prisma.userCampusAssignment.deleteMany({ where: { userId } }),
        this.prisma.userCampusAssignment.createMany({
          data: [{ userId, campusId: nextCampusId }],
        }),
        this.prisma.userProgramAssignment.deleteMany({ where: { userId } }),
        ...(nextProgramId
          ? [
              this.prisma.userProgramAssignment.createMany({
                data: [{ userId, programId: nextProgramId }],
              }),
            ]
          : []),
        this.prisma.mentor.upsert({
          where: { userId },
          create: {
            userId,
            campusId: nextCampusId,
            programId: nextProgramId,
            academicYearId: nextYearId,
            status: AccountStatus.ACTIVE,
          },
          update: {
            campusId: nextCampusId,
            programId: nextProgramId,
            academicYearId: nextYearId,
          },
        }),
      ]);
    } else if (campusIds) {
      await this.prisma.$transaction([
        this.prisma.userCampusAssignment.deleteMany({ where: { userId } }),
        this.prisma.userCampusAssignment.createMany({
          data: campusIds.map((campusId) => ({ userId, campusId })),
        }),
      ]);
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(nextUsername !== undefined ? { username: nextUsername } : {}),
        ...(nextEmail !== undefined ? { email: nextEmail } : {}),
        ...(data.fullName !== undefined ? { fullName: data.fullName } : {}),
        ...(data.phone !== undefined ? { phone: data.phone || null } : {}),
      },
      select: {
        id: true,
        username: true,
        email: true,
        fullName: true,
        phone: true,
        status: true,
        campusAssignments: true,
        mentorProfile: {
          include: {
            campus: { select: { id: true, name: true, shortName: true } },
            program: { select: { id: true, name: true } },
            academicYear: { select: { id: true, name: true } },
          },
        },
      },
    });

    await this.audit.log({
      userId: actor.id,
      action: 'User.Update',
      resource: 'User',
      resourceId: userId,
      previousValue: {
        username: target.username,
        email: target.email,
        fullName: target.fullName,
        phone: target.phone,
      },
      newValue: {
        username: nextUsername,
        email: nextEmail,
        fullName: data.fullName,
        phone: data.phone,
        campusIds,
        campusId: data.campusId,
        programId: data.programId,
        academicYearId: data.academicYearId,
      },
    });

    return updated;
  }

  async softDelete(actor: AuthUser, userId: string) {
    const target = await this.assertCanManageUser(actor, userId);
    await this.prisma.user.update({
      where: { id: userId },
      data: { deletedAt: new Date(), status: AccountStatus.INACTIVE },
    });
    await this.prisma.mentor.updateMany({
      where: { userId },
      data: { status: AccountStatus.INACTIVE },
    });
    await this.audit.log({
      userId: actor.id,
      action: 'User.Delete',
      resource: 'User',
      resourceId: userId,
      previousValue: { username: target.username, email: target.email },
    });
    return { success: true };
  }

  private async assertAssignableCampuses(
    actor: AuthUser,
    campusIds: string[],
    organizationIds: string[],
  ) {
    if (!campusIds.length) return;
    const campuses = await this.prisma.campus.findMany({
      where: { id: { in: campusIds }, deletedAt: null },
      select: { id: true, organizationId: true },
    });
    if (campuses.length !== campusIds.length) {
      throw new BadRequestException('One or more campuses are invalid');
    }
    for (const campus of campuses) {
      if (!assertCampusAccess(actor, campus.id)) {
        throw new ForbiddenException('Cannot assign a campus outside your scope');
      }
      if (
        organizationIds.length &&
        !organizationIds.includes(campus.organizationId) &&
        !actor.isSuperAdmin
      ) {
        throw new BadRequestException('Campus does not belong to the selected organization');
      }
    }
  }

  private async assertMentorBindings(input: {
    campusId: string;
    programId: string | null;
    academicYearId: string;
    organizationIds: string[];
  }) {
    const campus = await this.prisma.campus.findFirst({
      where: { id: input.campusId, deletedAt: null },
    });
    if (!campus) throw new BadRequestException('Campus not found');
    if (
      input.organizationIds.length &&
      !input.organizationIds.includes(campus.organizationId)
    ) {
      throw new BadRequestException('Campus does not belong to the selected organization');
    }

    const year = await this.prisma.academicYear.findFirst({
      where: {
        id: input.academicYearId,
        organizationId: campus.organizationId,
        deletedAt: null,
      },
    });
    if (!year) {
      throw new BadRequestException('Academic year not found for this campus organization');
    }

    if (input.programId) {
      const program = await this.prisma.program.findFirst({
        where: {
          id: input.programId,
          campusId: input.campusId,
          deletedAt: null,
        },
      });
      if (!program) {
        throw new BadRequestException('Program must belong to the mentor’s campus');
      }
    }
  }
}
