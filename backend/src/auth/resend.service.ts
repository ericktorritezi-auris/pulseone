import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';

@Injectable()
export class ResendService {
  private readonly logger = new Logger(ResendService.name);
  private resend: Resend | null = null;
  private from = '';

  constructor() {
    const apiKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL;

    if (!apiKey) {
      // Não derruba a aplicação: e-mail é uma dependência externa, não deve
      // impedir o boot do sistema inteiro. Apenas loga e desativa o envio.
      this.logger.warn(
        'RESEND_API_KEY não configurada. Envio de e-mails (verificação/reset de senha) está desativado.',
      );
      return;
    }

    if (!fromEmail) {
      // Mesmo com a API key certa, sem remetente o Resend rejeita o envio
      // (from vazio) — e isso ficava silencioso antes, só aparecendo como
      // erro genérico no catch de quem chamou. Agora fica claro na hora do boot.
      this.logger.warn(
        'RESEND_FROM_EMAIL não configurada. Envio de e-mails está desativado mesmo com a API key presente — o Resend exige um remetente de domínio verificado.',
      );
      return;
    }

    this.from = fromEmail;
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

  /**
   * E-mail de abertura de ciclo Pulse (pedido do Erick): disparado pra
   * todo mundo que tem avaliação pendente no ciclo recém-aberto (o admin
   * nunca recebe, já que nunca participa do Pulse — seção 5.7).
   */
  async sendPulseCycleOpened(
    to: string,
    fullName: string,
    cycleLabel: string,
    pendingCount: number,
    deadlineStr: string,
  ) {
    if (!this.resend) {
      this.logger.warn(`Envio de e-mail de abertura de ciclo ignorado (Resend não configurado). Destinatário: ${to}`);
      return null;
    }
    return this.resend.emails.send({
      from: this.from,
      to,
      subject: `${cycleLabel} está aberto — precisamos do seu feedback`,
      html: `<p>Olá, ${fullName.split(' ')[0]}!</p>
             <p>O ciclo <b>${cycleLabel}</b> de feedback 360° foi aberto, e você possui
             <b>${pendingCount} avaliação(ões) pendente(s)</b>.</p>
             <p>Prazo: ${deadlineStr}.</p>
             <p><a href="${process.env.APP_URL}/pulse">Acesse o PulseOne pra responder</a></p>`,
    });
  }

  /**
   * E-mail de encerramento definitivo do ciclo (pedido do Erick, seção
   * "ciclos arquivados"): dispara quando o admin arquiva o ciclo, com o
   * PDF final do relatório de cada pessoa anexado — o registro que ela
   * leva pra casa.
   */
  async sendPulseReportArchived(to: string, fullName: string, cycleLabel: string, pdfBuffer: Buffer) {
    if (!this.resend) {
      this.logger.warn(`Envio de e-mail de arquivamento ignorado (Resend não configurado). Destinatário: ${to}`);
      return null;
    }
    return this.resend.emails.send({
      from: this.from,
      to,
      subject: `${cycleLabel} — seu relatório final`,
      html: `<p>Olá, ${fullName.split(' ')[0]}!</p>
             <p>O ciclo <b>${cycleLabel}</b> foi encerrado e arquivado. Segue em anexo o seu
             relatório final em PDF.</p>`,
      attachments: [
        {
          filename: `relatorio-${cycleLabel.replace(/\s+/g, '-')}.pdf`,
          content: pdfBuffer,
        },
      ],
    });
  }
}
