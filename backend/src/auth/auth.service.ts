import { Injectable, UnauthorizedException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ResendService } from './resend.service';
import { UsersService } from '../users/users.module';
import { SystemNpsService } from '../system-nps/system-nps.module';
import { AuditAction } from '@prisma/client';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private resend: ResendService,
    private usersService: UsersService,
    private systemNps: SystemNpsService,
  ) {}

  /**
   * AUTOCADASTRO PÚBLICO (Sprint 6, pedido do Erick): o funcionário cria a
   * própria conta, sem precisar de admin/gestor. Dispara a verificação de
   * e-mail automaticamente (fluxo que já existia desde a Sprint 0, mas
   * nunca tinha sido conectado a um cadastro de verdade até agora).
   */
  async register(dto: {
    fullName: string;
    email: string;
    phone: string;
    areaId: string;
    positionId: string;
    managerId?: string;
    password: string;
  }) {
    const existing = await this.prisma.user.findFirst({ where: { email: dto.email } });
    if (existing) {
      throw new BadRequestException('Já existe uma conta cadastrada com esse e-mail.');
    }

    const user = await this.usersService.registerSelf(dto);

    await this.prisma.auditLog.create({
      data: { userId: user.id, action: AuditAction.CADASTRO },
    });

    // Não deixa o autocadastro falhar por causa do e-mail (ex: Resend ainda
    // sem configurar) — a conta já foi criada, o envio é best-effort.
    try {
      await this.sendEmailVerification(user.id);
    } catch {
      // ResendService já loga o problema internamente; aqui só evitamos
      // que a resposta do cadastro quebre por causa disso.
    }

    return { registered: true, userId: user.id };
  }

  async login(email: string, password: string) {
    // E-mail não é mais único (seção 5.17) — a mesma pessoa pode ter mais de
    // uma conta com o mesmo e-mail (ex: admin e gestor). A senha é quem
    // desempata: cada conta pode ter uma senha diferente, então a senha
    // digitada já indica pra qual conta a pessoa quer entrar.
    const candidates = await this.prisma.user.findMany({
      where: { email, active: true },
      include: { area: true, position: true },
    });

    let user: (typeof candidates)[number] | null = null;
    for (const candidate of candidates) {
      if (await bcrypt.compare(password, candidate.passwordHash)) {
        user = candidate;
        break;
      }
    }

    if (!user) {
      throw new UnauthorizedException('Credenciais inválidas.');
    }

    await this.prisma.auditLog.create({
      data: { userId: user.id, action: AuditAction.LOGIN },
    });

    const accessToken = this.jwt.sign({ sub: user.id, role: user.role });

    // NPS do sistema (pedido do Erick): checa se existe campanha ativa que
    // essa pessoa ainda não respondeu — admin nunca participa (já tratado
    // dentro do próprio service).
    const pendingSystemNps = await this.systemNps.hasPendingSurvey(user.id, user.role);

    return {
      accessToken,
      mustChangePwd: user.mustChangePwd,
      pendingSystemNps,
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        areaId: user.areaId,
        areaName: user.area?.name ?? null,
        positionName: user.position?.name ?? null,
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
    // Limitação conhecida: se existir mais de uma conta com o mesmo e-mail
    // (seção 5.17), este fluxo reseta a senha da primeira encontrada. Caso
    // real pra revisar no futuro se o cenário de contas duplicadas virar
    // mais comum do que a exceção pontual que é hoje.
    const user = await this.prisma.user.findFirst({ where: { email } });
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
