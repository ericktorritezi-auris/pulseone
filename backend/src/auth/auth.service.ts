import { Injectable, UnauthorizedException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ResendService } from './resend.service';
import { AuditAction } from '@prisma/client';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private resend: ResendService,
  ) {}

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { area: true, position: true },
    });
    if (!user || !user.active) {
      throw new UnauthorizedException('Credenciais inválidas.');
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Credenciais inválidas.');
    }

    await this.prisma.auditLog.create({
      data: { userId: user.id, action: AuditAction.LOGIN },
    });

    const accessToken = this.jwt.sign({ sub: user.id, role: user.role });

    return {
      accessToken,
      mustChangePwd: user.mustChangePwd,
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        areaId: user.areaId,
        areaName: user.area.name,
        positionName: user.position.name,
      },
    };
  }

  async sendEmailVerification(userId: string) {
    const token = randomBytes(32).toString('hex');
    const ttlHours = Number(process.env.EMAIL_VERIFICATION_TOKEN_TTL_HOURS ?? 24);

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    await this.prisma.emailVerificationToken.create({
      data: {
        userId,
        token,
        expiresAt: new Date(Date.now() + ttlHours * 60 * 60 * 1000),
      },
    });

    await this.resend.sendEmailVerification(user.email, token);
    return { sent: true };
  }

  async verifyEmail(token: string) {
    const record = await this.prisma.emailVerificationToken.findUnique({ where: { token } });

    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new BadRequestException('Token de verificação inválido ou expirado.');
    }

    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: record.userId }, data: { emailVerified: true } }),
      this.prisma.emailVerificationToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    ]);

    return { verified: true };
  }

  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    // Não revela se o e-mail existe ou não, por segurança.
    if (!user) return { sent: true };

    const token = randomBytes(32).toString('hex');
    const ttlHours = Number(process.env.PASSWORD_RESET_TOKEN_TTL_HOURS ?? 2);

    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        token,
        expiresAt: new Date(Date.now() + ttlHours * 60 * 60 * 1000),
      },
    });

    await this.resend.sendPasswordReset(user.email, token);
    return { sent: true };
  }

  async resetPassword(token: string, newPassword: string) {
    const record = await this.prisma.passwordResetToken.findUnique({ where: { token } });

    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new BadRequestException('Token de redefinição inválido ou expirado.');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash, mustChangePwd: false },
      }),
      this.prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    ]);

    return { reset: true };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    const matches = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!matches) {
      throw new ForbiddenException('Senha atual incorreta.');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash, mustChangePwd: false },
    });

    return { changed: true };
  }
}
