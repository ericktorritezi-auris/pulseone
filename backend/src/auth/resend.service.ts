import { Injectable } from '@nestjs/common';
import { Resend } from 'resend';

@Injectable()
export class ResendService {
  private resend = new Resend(process.env.RESEND_API_KEY);
  private from = process.env.RESEND_FROM_EMAIL as string;

  async sendEmailVerification(to: string, token: string) {
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
