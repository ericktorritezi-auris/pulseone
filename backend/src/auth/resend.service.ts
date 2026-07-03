import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';

@Injectable()
export class ResendService {
  private readonly logger = new Logger(ResendService.name);
  private resend: Resend | null = null;
  private from = process.env.RESEND_FROM_EMAIL as string;

  constructor() {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      // Não derruba a aplicação: e-mail é uma dependência externa, não deve
      // impedir o boot do sistema inteiro. Apenas loga e desativa o envio.
      this.logger.warn(
        'RESEND_API_KEY não configurada. Envio de e-mails (verificação/reset de senha) está desativado.',
      );
      return;
    }
    this.resend = new Resend(apiKey);
  }

  async sendEmailVerification(to: string, token: string) {
    if (!this.resend) {
      this.logger.warn(`Envio de e-mail de verificação ignorado (Resend não configurado). Destinatário: ${to}`);
      return null;
    }
    const link = `${process.env.APP_URL}/verify-email/${token}`;
    return this.resend.emails.send({
      from: this.from,
      to,
      subject: 'Confirme seu e-mail — PulseOne',
      html: `<p>Bem-vindo(a) ao PulseOne. Confirme seu e-mail clicando no link abaixo:</p>
             <p><a href="${link}">${link}</a></p>
             <p>Este link expira em ${process.env.EMAIL_VERIFICATION_TOKEN_TTL_HOURS ?? 24} horas.</p>`,
    });
  }

  async sendPasswordReset(to: string, token: string) {
    if (!this.resend) {
      this.logger.warn(`Envio de e-mail de reset ignorado (Resend não configurado). Destinatário: ${to}`);
      return null;
    }
    const link = `${process.env.APP_URL}/reset-password/${token}`;
    return this.resend.emails.send({
      from: this.from,
      to,
      subject: 'Redefinição de senha — PulseOne',
      html: `<p>Recebemos uma solicitação de redefinição de senha.</p>
             <p><a href="${link}">${link}</a></p>
             <p>Se você não solicitou, ignore este e-mail. Este link expira em ${process.env.PASSWORD_RESET_TOKEN_TTL_HOURS ?? 2} horas.</p>`,
    });
  }
}
