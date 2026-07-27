import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AccountStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { isStrongPassword, PASSWORD_POLICY_MESSAGE } from '../../common/utils/password.util';
import {
  isValidUsername,
  normalizeUsername,
  USERNAME_POLICY_MESSAGE,
} from '../../common/utils/username.util';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from './auth.types';
import {
  ForgotPasswordDto,
  LoginDto,
  ResetPasswordDto,
  UpdateMyProfileDto,
} from './dto/auth.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  async login(dto: LoginDto, meta: { ip?: string; userAgent?: string }) {
    const loginId = (dto.username ?? dto.email ?? '').trim().toLowerCase();
    if (!loginId) {
      throw new UnauthorizedException('Invalid username or password');
    }

    const user = await this.prisma.user.findFirst({
      where: {
        deletedAt: null,
        OR: [{ username: loginId }, { email: loginId }],
      },
      include: {
        roles: { include: { role: true } },
        organizationAssignments: true,
        campusAssignments: true,
        programAssignments: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid username or password');
    }

    if (user.status === AccountStatus.LOCKED) {
      if (user.lockedUntil && user.lockedUntil > new Date()) {
        throw new UnauthorizedException('Invalid username or password');
      }
      await this.prisma.user.update({
        where: { id: user.id },
        data: { status: AccountStatus.ACTIVE, failedLoginAttempts: 0, lockedUntil: null },
      });
    }

    if (
      user.status === AccountStatus.INACTIVE ||
      user.status === AccountStatus.SUSPENDED ||
      user.status === AccountStatus.PENDING_ACTIVATION
    ) {
      throw new UnauthorizedException('Invalid username or password');
    }

    const valid = await argon2.verify(user.passwordHash, dto.password);
    if (!valid) {
      await this.handleFailedLogin(user.id, user.failedLoginAttempts);
      throw new UnauthorizedException('Invalid username or password');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
    });

    const tokens = await this.issueTokens(user.id, user.username, meta);

    await this.audit.log({
      userId: user.id,
      roleName: user.roles.map((r) => r.role.name).join(','),
      action: 'AUTH.LOGIN',
      resource: 'User',
      resourceId: user.id,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });

    const defaultOrganizationId =
      user.organizationAssignments.find((o) => o.isDefault)?.organizationId ??
      user.organizationAssignments[0]?.organizationId ??
      null;

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        fullName: user.fullName,
        roles: user.roles.map((r) => r.role.name),
        organizationIds: user.organizationAssignments.map((o) => o.organizationId),
        defaultOrganizationId,
        campusIds: user.campusAssignments.map((c) => c.campusId),
        programIds: user.programAssignments.map((p) => p.programId),
      },
    };
  }

  async refresh(refreshToken: string, meta: { ip?: string; userAgent?: string }) {
    const hash = this.hashToken(refreshToken);
    const session = await this.prisma.session.findFirst({
      where: { refreshTokenHash: hash, revokedAt: null, expiresAt: { gt: new Date() } },
      include: { user: true },
    });
    if (!session || session.user.status !== AccountStatus.ACTIVE) {
      throw new UnauthorizedException('Session expired. Please log in again.');
    }

    await this.prisma.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });

    return this.issueTokens(session.userId, session.user.username, meta);
  }

  async logout(user: AuthUser, refreshToken?: string, meta?: { ip?: string; userAgent?: string }) {
    if (refreshToken) {
      const hash = this.hashToken(refreshToken);
      await this.prisma.session.updateMany({
        where: { userId: user.id, refreshTokenHash: hash, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    await this.audit.log({
      userId: user.id,
      action: 'AUTH.LOGOUT',
      resource: 'User',
      resourceId: user.id,
      ipAddress: meta?.ip,
      userAgent: meta?.userAgent,
    });
    return { success: true };
  }

  async logoutAll(user: AuthUser, meta?: { ip?: string; userAgent?: string }) {
    await this.prisma.session.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.audit.log({
      userId: user.id,
      action: 'AUTH.LOGOUT_ALL',
      resource: 'User',
      resourceId: user.id,
      ipAddress: meta?.ip,
      userAgent: meta?.userAgent,
    });
    return { success: true };
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const account = dto.account.trim().toLowerCase();
    const user = await this.prisma.user.findFirst({
      where: {
        deletedAt: null,
        OR: [{ username: account }, { email: account }],
      },
    });
    if (!user) {
      return { success: true, message: 'If the account exists, a reset link was sent.' };
    }

    const token = randomBytes(32).toString('hex');
    const minutes = Number(this.config.get('PASSWORD_RESET_EXPIRES_MINUTES') ?? 60);
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(token),
        expiresAt: new Date(Date.now() + minutes * 60_000),
      },
    });

    const payload: Record<string, unknown> = {
      success: true,
      message: 'If the account exists, a reset link was sent.',
    };
    if (process.env.NODE_ENV !== 'production') {
      payload.resetToken = token;
    }
    return payload;
  }

  async resetPassword(dto: ResetPasswordDto) {
    if (!isStrongPassword(dto.newPassword)) {
      throw new BadRequestException(PASSWORD_POLICY_MESSAGE);
    }
    const hash = this.hashToken(dto.token);
    const record = await this.prisma.passwordResetToken.findFirst({
      where: { tokenHash: hash, usedAt: null, expiresAt: { gt: new Date() } },
    });
    if (!record) {
      throw new BadRequestException('Reset token is invalid or expired');
    }

    const passwordHash = await argon2.hash(dto.newPassword);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: {
          passwordHash,
          failedLoginAttempts: 0,
          lockedUntil: null,
          status: AccountStatus.ACTIVE,
        },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.session.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    await this.audit.log({
      userId: record.userId,
      action: 'AUTH.PASSWORD_RESET',
      resource: 'User',
      resourceId: record.userId,
    });

    return { success: true };
  }

  async me(user: AuthUser) {
    const row = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        username: true,
        email: true,
        fullName: true,
        phone: true,
        status: true,
        lastLoginAt: true,
      },
    });
    if (!row) throw new UnauthorizedException('Account not found');
    return {
      ...user,
      username: row.username,
      email: row.email,
      fullName: row.fullName,
      phone: row.phone,
      status: row.status,
      lastLoginAt: row.lastLoginAt,
    };
  }

  async updateMyProfile(user: AuthUser, dto: UpdateMyProfileDto) {
    const changingPassword = Boolean(dto.newPassword);
    if (changingPassword) {
      if (!dto.currentPassword) {
        throw new BadRequestException('Current password is required to set a new password');
      }
      if (!isStrongPassword(dto.newPassword!)) {
        throw new BadRequestException(PASSWORD_POLICY_MESSAGE);
      }
    }

    const current = await this.prisma.user.findUnique({ where: { id: user.id } });
    if (!current || current.deletedAt) throw new UnauthorizedException('Account not found');

    if (changingPassword) {
      const ok = await argon2.verify(current.passwordHash, dto.currentPassword!);
      if (!ok) throw new BadRequestException('Current password is incorrect');
    }

    const data: {
      username?: string;
      fullName?: string;
      email?: string | null;
      phone?: string | null;
      passwordHash?: string;
    } = {};

    if (dto.username != null) {
      if (!isValidUsername(dto.username)) {
        throw new BadRequestException(USERNAME_POLICY_MESSAGE);
      }
      const username = normalizeUsername(dto.username);
      if (username !== current.username) {
        const taken = await this.prisma.user.findFirst({
          where: { username, NOT: { id: user.id } },
        });
        if (taken) throw new ConflictException('Username is already taken');
        data.username = username;
      }
    }

    if (dto.fullName != null && dto.fullName.trim()) {
      data.fullName = dto.fullName.trim();
    }

    if (dto.email !== undefined) {
      const email = dto.email?.trim() ? dto.email.trim().toLowerCase() : null;
      if (email) {
        const taken = await this.prisma.user.findFirst({
          where: { email, NOT: { id: user.id } },
        });
        if (taken) throw new ConflictException('Email is already in use');
      }
      data.email = email;
    }

    if (dto.phone !== undefined) {
      data.phone = dto.phone.trim() || null;
    }

    if (changingPassword) {
      data.passwordHash = await argon2.hash(dto.newPassword!);
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('No changes provided');
    }

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data,
      select: {
        id: true,
        username: true,
        email: true,
        fullName: true,
        phone: true,
        status: true,
        lastLoginAt: true,
      },
    });

    if (changingPassword) {
      await this.prisma.session.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    await this.audit.log({
      userId: user.id,
      action: changingPassword ? 'AUTH.PASSWORD_CHANGE' : 'AUTH.PROFILE_UPDATE',
      resource: 'User',
      resourceId: user.id,
      newValue: {
        username: updated.username,
        email: updated.email,
        fullName: updated.fullName,
        passwordChanged: changingPassword,
      },
    });

    return {
      ...updated,
      roles: user.roles,
      organizationIds: user.organizationIds,
      defaultOrganizationId: user.defaultOrganizationId,
      campusIds: user.campusIds,
      programIds: user.programIds,
      passwordChanged: changingPassword,
      message: changingPassword
        ? 'Password updated. Please sign in again.'
        : 'Profile updated.',
    };
  }

  private async handleFailedLogin(userId: string, current: number) {
    const max = Number(this.config.get('MAX_FAILED_LOGINS') ?? 5);
    const lockMinutes = Number(this.config.get('LOCKOUT_MINUTES') ?? 30);
    const attempts = current + 1;
    if (attempts >= max) {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          failedLoginAttempts: attempts,
          status: AccountStatus.LOCKED,
          lockedUntil: new Date(Date.now() + lockMinutes * 60_000),
        },
      });
    } else {
      await this.prisma.user.update({
        where: { id: userId },
        data: { failedLoginAttempts: attempts },
      });
    }
  }

  private async issueTokens(
    userId: string,
    username: string,
    meta: { ip?: string; userAgent?: string },
  ) {
    const payload = { sub: userId, username };
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get('JWT_ACCESS_EXPIRES_IN') ?? '15m',
    });
    const refreshToken = randomBytes(48).toString('hex');
    const days = 7;
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60_000);

    await this.prisma.session.create({
      data: {
        userId,
        refreshTokenHash: this.hashToken(refreshToken),
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
        expiresAt,
      },
    });

    return { accessToken, refreshToken };
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
}
