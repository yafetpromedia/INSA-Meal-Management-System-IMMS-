import {
  BadRequestException,
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
import { AuditService } from '../audit/audit.service';
import { AuthUser } from './auth.types';
import { ForgotPasswordDto, LoginDto, ResetPasswordDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  async login(dto: LoginDto, meta: { ip?: string; userAgent?: string }) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      include: {
        roles: { include: { role: true } },
        organizationAssignments: true,
        campusAssignments: true,
        programAssignments: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.status === AccountStatus.LOCKED) {
      if (user.lockedUntil && user.lockedUntil > new Date()) {
        throw new UnauthorizedException('Account is locked. Try again later.');
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
      throw new UnauthorizedException('Account is not active');
    }

    const valid = await argon2.verify(user.passwordHash, dto.password);
    if (!valid) {
      await this.handleFailedLogin(user.id, user.failedLoginAttempts);
      throw new UnauthorizedException('Invalid email or password');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
    });

    const tokens = await this.issueTokens(user.id, user.email, meta);

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

    return this.issueTokens(session.userId, session.user.email, meta);
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
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    // Always return success to avoid email enumeration
    if (!user) {
      return { success: true, message: 'If the email exists, a reset link was sent.' };
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

    // Email delivery stub — token returned only in non-production for local testing
    const payload: Record<string, unknown> = {
      success: true,
      message: 'If the email exists, a reset link was sent.',
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
        data: { passwordHash, failedLoginAttempts: 0, lockedUntil: null, status: AccountStatus.ACTIVE },
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
    return user;
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
    email: string,
    meta: { ip?: string; userAgent?: string },
  ) {
    const payload = { sub: userId, email };
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
