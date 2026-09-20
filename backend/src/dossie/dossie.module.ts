import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Injectable,
  Module,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Audit } from '../common/decorators/audit.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.module';
import { UsersModule } from '../users/users.module';
import { PulseReportPdfService } from '../pulse-reports/pulse-report-pdf.service';
import { PulseReportsModule } from '../pulse-reports/pulse-reports.module';
import {
  AuditAction,
  ModalidadeTrabalho,
  PulseEvaluationStatus,
  PulseEvaluationType,
  RegimeContratacao,
  UserRole,
} from '@prisma/client';
import type { Response } from 'express';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

type AuthUser = { id: string; role: UserRole; areaId: string | null };

class UpdateConfidentialDto {
  @IsOptional() @IsNumber() salario?: number;
  @IsOptional() @IsEnum(RegimeContratacao) regimeContratacao?: RegimeContratacao;
  @IsOptional() @IsEnum(ModalidadeTrabalho) modalidadeTrabalho?: ModalidadeTrabalho;
  @IsOptional() @IsInt() @Min(0) hibridoDiasPresencial?: number;
  @IsOptional() @IsArray() @IsString({ each: true }) hibridoDiasSemana?: string[];
  @IsOptional() @IsDateString() dataInicioEmpresa?: string;
}

class BenefitDto {
  @IsString()
  @MinLength(1)
  nome: string;

  @IsNumber()
  valor: number;
}

class VacationPeriodDto {
  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;
}

// v1.5.0 — Formação e Certificações: só "o que é" + data de conclusão,
// sem instituição nem período, exatamente como pedido pelo Erick.
class FormacaoDto {
  @IsString()
  @MinLength(1)
  nome: string;

  @IsDateString()
  dataConclusao: string;
}

class CertificacaoDto {
  @IsString()
  @MinLength(1)
  nome: string;

  @IsDateString()
  dataConclusao: string;
}

@Injectable()
class DossieService {
  constructor(
    private prisma: PrismaService,
    private usersService: UsersService,
    private pdfService: PulseReportPdfService,
  ) {}

  private async assertAccessAndGetTarget(id: string, requester: AuthUser) {
    const target = await this.prisma.user.findUniqueOrThrow({ where: { id } });
    // Reaproveita EXATAMENTE a mesma regra de acesso já usada em Pessoas —
    // quem já pode ver/editar essa pessoa lá, pode ver o dossiê dela aqui.
    await this.usersService.assertCanAccessTarget(target, requester);
    return target;
  }

  async updateConfidential(id: string, dto: UpdateConfidentialDto, requester: AuthUser) {
    await this.assertAccessAndGetTarget(id, requester);
    return this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.salario !== undefined ? { salario: dto.salario } : {}),
        ...(dto.regimeContratacao !== undefined ? { regimeContratacao: dto.regimeContratacao } : {}),
        ...(dto.modalidadeTrabalho !== undefined ? { modalidadeTrabalho: dto.modalidadeTrabalho } : {}),
        ...(dto.hibridoDiasPresencial !== undefined ? { hibridoDiasPresencial: dto.hibridoDiasPresencial } : {}),
        ...(dto.hibridoDiasSemana !== undefined ? { hibridoDiasSemana: dto.hibridoDiasSemana } : {}),
        ...(dto.dataInicioEmpresa !== undefined ? { dataInicioEmpresa: new Date(dto.dataInicioEmpresa) } : {}),
      },
    });
  }

  async addBenefit(id: string, dto: BenefitDto, requester: AuthUser) {
    await this.assertAccessAndGetTarget(id, requester);
    return this.prisma.benefit.create({ data: { userId: id, nome: dto.nome, valor: dto.valor } });
  }

  async updateBenefit(benefitId: string, dto: BenefitDto, requester: AuthUser) {
    const benefit = await this.prisma.benefit.findUniqueOrThrow({ where: { id: benefitId } });
    await this.assertAccessAndGetTarget(benefit.userId, requester);
    return this.prisma.benefit.update({ where: { id: benefitId }, data: { nome: dto.nome, valor: dto.valor } });
  }

  async removeBenefit(benefitId: string, requester: AuthUser) {
    const benefit = await this.prisma.benefit.findUniqueOrThrow({ where: { id: benefitId } });
    await this.assertAccessAndGetTarget(benefit.userId, requester);
    return this.prisma.benefit.delete({ where: { id: benefitId } });
  }

  async addVacationPeriod(id: string, dto: VacationPeriodDto, requester: AuthUser) {
    await this.assertAccessAndGetTarget(id, requester);
    return this.prisma.vacationPeriod.create({
      data: { userId: id, startDate: new Date(dto.startDate), endDate: new Date(dto.endDate) },
    });
  }

  async removeVacationPeriod(periodId: string, requester: AuthUser) {
    const period = await this.prisma.vacationPeriod.findUniqueOrThrow({ where: { id: periodId } });
    await this.assertAccessAndGetTarget(period.userId, requester);
    return this.prisma.vacationPeriod.delete({ where: { id: periodId } });
  }

  // Formação e Certificações (v1.5.0) — diferente das Informações
  // Confidenciais, essas DUAS categorias podem ser editadas tanto por
  // admin/gestor (via Pessoas, checando acesso normalmente) quanto pela
  // própria pessoa (via Meu Perfil, sem checagem — é sempre ela mesma).
  //
  // "requester" fica opcional de propósito: quando vem preenchido, checa
  // acesso normal (chamada feita a partir de Pessoas); quando vem nulo,
  // é a própria pessoa mexendo em si mesma (chamada feita a partir de
  // Meu Perfil) — nesse caso não tem o que checar, ela sempre pode.
  async addFormacao(userId: string, dto: FormacaoDto, requester: AuthUser | null) {
    if (requester) await this.assertAccessAndGetTarget(userId, requester);
    return this.prisma.formacao.create({
      data: { userId, nome: dto.nome, dataConclusao: new Date(dto.dataConclusao) },
    });
  }

  async removeFormacao(formacaoId: string, requester: AuthUser | null, selfId?: string) {
    const formacao = await this.prisma.formacao.findUniqueOrThrow({ where: { id: formacaoId } });
    if (requester) {
      await this.assertAccessAndGetTarget(formacao.userId, requester);
    } else if (formacao.userId !== selfId) {
      // Defesa em profundidade: mesmo sem checagem de acesso normal (é a
      // própria pessoa mexendo), nunca deixa excluir um registro que não
      // é dela — evita adivinhar um ID de formação de outra pessoa.
      throw new ForbiddenException('Você só pode excluir suas próprias formações.');
    }
    return this.prisma.formacao.delete({ where: { id: formacaoId } });
  }

  async addCertificacao(userId: string, dto: CertificacaoDto, requester: AuthUser | null) {
    if (requester) await this.assertAccessAndGetTarget(userId, requester);
    return this.prisma.certificacao.create({
      data: { userId, nome: dto.nome, dataConclusao: new Date(dto.dataConclusao) },
    });
  }

  async removeCertificacao(certificacaoId: string, requester: AuthUser | null, selfId?: string) {
    const certificacao = await this.prisma.certificacao.findUniqueOrThrow({ where: { id: certificacaoId } });
    if (requester) {
      await this.assertAccessAndGetTarget(certificacao.userId, requester);
    } else if (certificacao.userId !== selfId) {
      throw new ForbiddenException('Você só pode excluir suas próprias certificações.');
    }
    return this.prisma.certificacao.delete({ where: { id: certificacaoId } });
  }

  // Monta o dossiê completo — dados cadastrais + confidenciais + resumo
  // do Pulse. Nada é gerado/calculado por IA: tudo vem direto do banco.
  // `viewingAsOwner: false` — quem pede é gestor/admin vendo o dossiê de
  // OUTRA pessoa (uso interno de gestão/RH), então os avaliadores do
  // Pulse aparecem com nome real (precisam pra consolidar de verdade,
  // mesma regra do relatório individual — ver `buildReportDetail` em
  // `pulse-reports.module.ts`).
  async getDossie(id: string, requester: AuthUser) {
    await this.assertAccessAndGetTarget(id, requester);
    return this.assembleDossie(id, false);
  }

  // Visão de si mesmo (v1.5.0, pedido do Erick) — NUNCA aceita um id de
  // outra pessoa, sempre usa o próprio id de quem está logado. Por isso
  // não precisa (nem deve) passar pela checagem de acesso — ver o próprio
  // dossiê é sempre permitido, pra qualquer perfil, sem exceção.
  //
  // CORREÇÃO (pedido do Erick, v1.8.4): `viewingAsOwner: true` — é a
  // PRÓPRIA pessoa vendo seus dados ("Meu Perfil" → "Dados Completos"),
  // então os feedbacks do Pulse precisam seguir a MESMA regra de
  // anonimato do PRD (seção 19) já aplicada no relatório individual:
  // colega e liderado aparecem anonimizados, só o gestor direto com nome
  // real. Antes, `assembleDossie` não recebia esse contexto nenhuma vez e
  // sempre montava com nome real — vazando pro próprio colaborador quem
  // deu cada feedback de colega no ciclo Pulse, quebrando o anonimato que
  // o resto do sistema garante.
  async getMyDossie(requesterId: string) {
    return this.assembleDossie(requesterId, true);
  }

  // Montagem do dossiê em si — sem nenhuma checagem de acesso aqui de
  // propósito; quem chama (getDossie ou getMyDossie) já decidiu se pode e
  // já decidiu o `viewingAsOwner` correto pro caso.
  private async assembleDossie(id: string, viewingAsOwner: boolean) {
    const [
      fullUser,
      beneficios,
      periodosFerias,
      scores,
      latestReport,
      atribuicoesEspecialistas,
      feedbacksAvulsosRaw,
      formacoes,
      certificacoes,
    ] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({
        where: { id },
        include: {
          area: { select: { name: true } },
          position: { select: { name: true } },
          manager: { select: { fullName: true } },
        },
      }),
      this.prisma.benefit.findMany({ where: { userId: id }, orderBy: { createdAt: 'asc' } }),
      this.prisma.vacationPeriod.findMany({ where: { userId: id }, orderBy: { startDate: 'asc' } }),
      this.prisma.pulseScore.findMany({
        where: { userId: id },
        include: { cycle: { select: { label: true, openedAt: true } } },
        orderBy: { cycle: { openedAt: 'asc' } },
      }),
      this.prisma.pulseReport.findFirst({
        where: { ownerId: id, status: 'FINALIZADO' },
        orderBy: { finalizedAt: 'desc' },
        include: { cycle: { select: { label: true } } },
      }),
      // Atribuições Especialistas (v1.1.0) — só as ativas, mesmo critério
      // já usado na tela de consulta pública dessa funcionalidade.
      this.prisma.specialistAssignment.findMany({
        where: { userId: id, active: true },
        orderBy: { createdAt: 'asc' },
      }),
      // Feedback Contínuo (avulso) recebido — os 3 últimos, pedido do Erick.
      this.prisma.feedback.findMany({
        where: { receiverId: id },
        orderBy: { createdAt: 'desc' },
        take: 3,
        include: { sender: { select: { fullName: true } } },
      }),
      // Formação e Certificações (v1.5.0) — editável pela própria pessoa
      // OU por admin/gestor, os dois mexendo nos mesmos registros.
      this.prisma.formacao.findMany({ where: { userId: id }, orderBy: { dataConclusao: 'desc' } }),
      this.prisma.certificacao.findMany({ where: { userId: id }, orderBy: { dataConclusao: 'desc' } }),
    ]);

    // Feedbacks do ÚLTIMO relatório finalizado. REGRA DE ANONIMATO (PRD
    // seção 19, mesma regra do relatório individual em
    // `pulse-reports.module.ts`/`buildReportDetail`): quando é a PRÓPRIA
    // pessoa vendo (`viewingAsOwner: true` — "Meu Dossiê"), colega e
    // liderado aparecem anonimizados como "Colega N"/"Liderado N" — só o
    // gestor direto (AVALIACAO_EQUIPE) aparece com nome real. Quando é
    // gestor/admin vendo o dossiê de OUTRA pessoa (`viewingAsOwner:
    // false`), todo mundo aparece com nome real (uso interno de gestão).
    let ultimosFeedbacks: { tipo: string; autor: string; texto: string }[] = [];
    if (latestReport) {
      const feedbacks = await this.prisma.pulseFeedback.findMany({
        where: {
          cycleId: latestReport.cycleId,
          targetId: id,
          status: PulseEvaluationStatus.FINALIZADO,
        },
        include: { evaluator: { select: { fullName: true } } },
        orderBy: { createdAt: 'asc' },
      });
      let colegaCount = 0;
      let liderdadoCount = 0;
      ultimosFeedbacks = feedbacks.map((fb) => {
        let autor: string;
        if (fb.type === PulseEvaluationType.AUTOAVALIACAO) {
          autor = 'Autoavaliação';
        } else if (fb.type === PulseEvaluationType.AVALIACAO_EQUIPE) {
          // Gestor avaliando um liderado (o dono deste dossiê) — sempre nome real.
          autor = fb.evaluator.fullName;
        } else if (fb.type === PulseEvaluationType.AVALIACAO_GESTOR) {
          // Um liderado avaliando o dono (que é gestor) — anonimizado pro próprio dono.
          autor = viewingAsOwner ? `Liderado ${++liderdadoCount}` : fb.evaluator.fullName;
        } else {
          // COLEGA
          autor = viewingAsOwner ? `Colega ${++colegaCount}` : fb.evaluator.fullName;
        }
        return { tipo: fb.type, autor, texto: fb.comment ?? '(sem comentário)' };
      });
    }

    return {
      pessoa: {
        id: fullUser.id,
        fullName: fullUser.fullName,
        email: fullUser.email,
        phone: fullUser.phone,
        role: fullUser.role,
        active: fullUser.active,
        areaName: fullUser.area?.name ?? null,
        positionName: fullUser.position?.name ?? null,
        managerName: fullUser.manager?.fullName ?? null,
      },
      confidencial: {
        salario: fullUser.salario ? Number(fullUser.salario) : null,
        regimeContratacao: fullUser.regimeContratacao,
        modalidadeTrabalho: fullUser.modalidadeTrabalho,
        hibridoDiasPresencial: fullUser.hibridoDiasPresencial,
        hibridoDiasSemana: fullUser.hibridoDiasSemana,
        dataInicioEmpresa: fullUser.dataInicioEmpresa,
        beneficios: beneficios.map((b) => ({ id: b.id, nome: b.nome, valor: Number(b.valor) })),
        periodosFerias: periodosFerias.map((p) => ({ id: p.id, startDate: p.startDate, endDate: p.endDate })),
      },
      formacaoECertificacoes: {
        formacoes: formacoes.map((f) => ({ id: f.id, nome: f.nome, dataConclusao: f.dataConclusao })),
        certificacoes: certificacoes.map((c) => ({ id: c.id, nome: c.nome, dataConclusao: c.dataConclusao })),
      },
      pulse: {
        ciclosParticipados: scores.length,
        scoreAtual: scores.length > 0 ? scores[scores.length - 1].finalScore : null,
        evolucao: scores.map((s) => ({ cicloLabel: s.cycle.label, finalScore: s.finalScore, npsScore: s.npsScore })),
        ultimoCicloLabel: latestReport?.cycle.label ?? null,
        ultimoParecer: latestReport?.managerFinalOpinion ?? null,
        ultimosFeedbacks,
      },
      atribuicoesEspecialistas: atribuicoesEspecialistas.map((a) => a.description),
      feedbacksAvulsos: feedbacksAvulsosRaw.map((f) => ({
        autor: f.sender.fullName,
        texto: f.text,
        data: f.createdAt,
      })),
    };
  }

  async getDossiePdf(id: string, requester: AuthUser): Promise<Buffer> {
    const dossie = await this.getDossie(id, requester);
    const html = this.buildDossieHtml(dossie);
    return this.pdfService.generatePdf(html, { top: '2.5cm', bottom: '1.8cm', left: '1.8cm', right: '1.8cm' });
  }

  private tempoDeEmpresa(dataInicio: Date | null): string {
    if (!dataInicio) return '—';
    const now = new Date();
    let years = now.getFullYear() - dataInicio.getFullYear();
    let months = now.getMonth() - dataInicio.getMonth();
    if (now.getDate() < dataInicio.getDate()) months -= 1;
    if (months < 0) {
      years -= 1;
      months += 12;
    }
    const partes: string[] = [];
    if (years > 0) partes.push(`${years} ano${years > 1 ? 's' : ''}`);
    if (months > 0) partes.push(`${months} ${months > 1 ? 'meses' : 'mês'}`);
    return partes.length > 0 ? partes.join(' e ') : 'menos de um mês';
  }

  private buildDossieHtml(d: Awaited<ReturnType<DossieService['getDossie']>>): string {
    const fmtMoney = (v: number | null) =>
      v === null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    // Datas "puras" (sem hora — início na empresa, férias, formação,
    // certificação): o valor já representa o dia certo em UTC; aplicar o
    // fuso de Brasília em cima "recua" um dia (meia-noite UTC vira 21h do
    // dia anterior em Brasília). Por isso usa UTC aqui, não Brasília.
    const fmtDateOnly = (v: Date | string | null) =>
      v ? new Date(v).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—';
    // Timestamps DE VERDADE (com hora, ex: quando um feedback avulso foi
    // recebido) continuam no fuso de Brasília normalmente.
    const fmtDate = (v: Date | string | null) =>
      v ? new Date(v).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—';
    // "Concluído em" vs "A concluir em" (pedido do Erick) — mesmo cuidado
    // de fuso do fmtDateOnly acima: os dois lados da comparação (data
    // salva e "hoje") precisam estar no mesmo referencial de dia.
    const statusFormacao = (dataConclusao: Date | string): string => {
      const conclusao = new Date(dataConclusao);
      const conclusaoDia = Date.UTC(conclusao.getUTCFullYear(), conclusao.getUTCMonth(), conclusao.getUTCDate());
      const hojeBrasil = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
      const [ano, mes, dia] = hojeBrasil.split('-').map(Number);
      const hojeDia = Date.UTC(ano, mes - 1, dia);
      return conclusaoDia <= hojeDia ? 'Concluído em' : 'A concluir em';
    };
    const regimeLabel: Record<string, string> = { CLT: 'CLT', COOPERADO: 'Cooperado', PJ: 'Pessoa Jurídica (PJ)' };
    const modalidadeLabel: Record<string, string> = { PRESENCIAL: 'Presencial', REMOTO: 'Remoto', HIBRIDO: 'Híbrido' };
    const diaLabel: Record<string, string> = {
      SEGUNDA: 'Segunda',
      TERCA: 'Terça',
      QUARTA: 'Quarta',
      QUINTA: 'Quinta',
      SEXTA: 'Sexta',
    };

    return `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          /* Margem real controlada na chamada do Puppeteer (generatePdf),
             não aqui — @page margin seria sobrescrito por ela mesmo assim. */
          * { box-sizing: border-box; }
          body { font-family: Arial, Helvetica, sans-serif; color: #0F172A; margin: 0; }

          .capa {
            width: 100%; min-height: 23cm; padding: 50px 45px;
            background: linear-gradient(135deg, #0F172A 0%, #2563EB 100%);
            border-radius: 18px;
            color: white; page-break-after: always;
            display: flex; flex-direction: column; justify-content: space-between;
          }
          .capa .marca { font-size: 22px; font-weight: 800; }
          .capa .marca span { color: #7DD3FC; }
          .capa .titulo-doc { font-size: 13px; letter-spacing: 0.15em; text-transform: uppercase; color: #93C5FD; margin-top: 60px; }
          .capa h1 { font-size: 40px; margin: 8px 0 24px; }
          .capa .linha { font-size: 14px; color: #CBD5E1; margin: 4px 0; }
          .capa .linha b { color: white; }
          .capa .tempo-empresa {
            margin-top: 32px; display: inline-block; background: rgba(255,255,255,0.12);
            padding: 10px 18px; border-radius: 10px; font-size: 14px;
          }
          .capa .rodape { font-size: 11px; color: #93C5FD; }

          .pagina { padding: 0 0 20px 0; }
          .secao { margin-bottom: 28px; page-break-inside: avoid; }
          .secao h2 {
            font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em; color: #2563EB;
            border-bottom: 2px solid #DBEAFE; padding-bottom: 6px; margin-bottom: 14px;
          }
          .grid { display: flex; flex-wrap: wrap; gap: 16px; }
          .campo { flex: 1 1 220px; }
          .campo .l { font-size: 10px; text-transform: uppercase; color: #64748B; margin-bottom: 2px; }
          .campo .v { font-size: 13px; font-weight: 600; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th { text-align: left; background: #F8FAFC; padding: 6px 10px; color: #64748B; font-size: 10px; text-transform: uppercase; }
          td { padding: 6px 10px; border-bottom: 1px solid #F1F5F9; }
          .feedback { border-left: 3px solid #DBEAFE; background: #F8FAFC; padding: 8px 12px; margin-bottom: 8px; border-radius: 0 6px 6px 0; }
          .feedback .autor { font-size: 11px; font-weight: 700; color: #2563EB; margin-bottom: 2px; }
          .feedback .texto { font-size: 12px; }
          .parecer-box { background: #F8FAFC; border-radius: 8px; padding: 14px; font-size: 12px; white-space: pre-wrap; }
          .confidencial-tag {
            display: inline-block; font-size: 9px; font-weight: 700; text-transform: uppercase;
            background: #FEF3C7; color: #B45309; padding: 2px 8px; border-radius: 999px; margin-left: 8px;
          }
        </style>
      </head>
      <body>
        <div class="capa">
          <div>
            <div class="marca">Pulse<span>One</span></div>
            <p class="titulo-doc">Dossiê do Colaborador</p>
            <h1>${d.pessoa.fullName}</h1>
            <p class="linha"><b>${d.pessoa.positionName ?? '—'}</b> · ${d.pessoa.areaName ?? '—'}</p>
            ${d.pessoa.managerName ? `<p class="linha">Gestor direto: <b>${d.pessoa.managerName}</b></p>` : ''}
            ${
              d.confidencial.dataInicioEmpresa
                ? `<div class="tempo-empresa">Na empresa desde <b>${fmtDateOnly(d.confidencial.dataInicioEmpresa)}</b> — ${this.tempoDeEmpresa(new Date(d.confidencial.dataInicioEmpresa))} de casa</div>`
                : ''
            }
          </div>
          <p class="rodape">Documento confidencial — gerado em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} · PulseOne</p>
        </div>

        <div class="pagina">
          <div class="secao">
            <h2>Dados Cadastrais</h2>
            <div class="grid">
              <div class="campo"><p class="l">E-mail</p><p class="v">${d.pessoa.email}</p></div>
              <div class="campo"><p class="l">Telefone</p><p class="v">${d.pessoa.phone}</p></div>
              <div class="campo"><p class="l">Cargo</p><p class="v">${d.pessoa.positionName ?? '—'}</p></div>
              <div class="campo"><p class="l">Área</p><p class="v">${d.pessoa.areaName ?? '—'}</p></div>
              <div class="campo"><p class="l">Gestor Direto</p><p class="v">${d.pessoa.managerName ?? '—'}</p></div>
              <div class="campo"><p class="l">Status</p><p class="v">${d.pessoa.active ? 'Ativo' : 'Inativo'}</p></div>
            </div>
          </div>

          <div class="secao">
            <h2>Informações Confidenciais <span class="confidencial-tag">Uso interno</span></h2>
            <div class="grid">
              <div class="campo"><p class="l">Salário</p><p class="v">${fmtMoney(d.confidencial.salario)}</p></div>
              <div class="campo"><p class="l">Regime de Contratação</p><p class="v">${d.confidencial.regimeContratacao ? regimeLabel[d.confidencial.regimeContratacao] : '—'}</p></div>
              <div class="campo"><p class="l">Modalidade de Trabalho</p><p class="v">${
                d.confidencial.modalidadeTrabalho ? modalidadeLabel[d.confidencial.modalidadeTrabalho] : '—'
              }${
                d.confidencial.modalidadeTrabalho === 'HIBRIDO' && d.confidencial.hibridoDiasPresencial
                  ? ` (${d.confidencial.hibridoDiasPresencial}x/semana${d.confidencial.hibridoDiasSemana.length ? ': ' + d.confidencial.hibridoDiasSemana.map((x) => diaLabel[x] ?? x).join(', ') : ''})`
                  : ''
              }</p></div>
              <div class="campo"><p class="l">Data de Início na Empresa</p><p class="v">${fmtDateOnly(d.confidencial.dataInicioEmpresa)}</p></div>
            </div>

            <table style="margin-top:14px"><thead><tr><th>Benefício</th><th>Valor</th></tr></thead><tbody>
              ${
                d.confidencial.beneficios.length > 0
                  ? d.confidencial.beneficios.map((b) => `<tr><td>${b.nome}</td><td>${fmtMoney(b.valor)}</td></tr>`).join('')
                  : `<tr><td colspan="2" style="color:#94A3B8;">Nenhum benefício cadastrado.</td></tr>`
              }
            </tbody></table>

            <table style="margin-top:14px"><thead><tr><th>Período de Férias</th></tr></thead><tbody>
              ${
                d.confidencial.periodosFerias.length > 0
                  ? d.confidencial.periodosFerias.map((p) => `<tr><td>${fmtDateOnly(p.startDate)} a ${fmtDateOnly(p.endDate)}</td></tr>`).join('')
                  : `<tr><td style="color:#94A3B8;">Nenhum período de férias cadastrado.</td></tr>`
              }
            </tbody></table>
          </div>

          <div class="secao">
            <h2>Formação e Certificações</h2>
            <table><thead><tr><th>Formação</th><th>Situação</th></tr></thead><tbody>
              ${
                d.formacaoECertificacoes.formacoes.length > 0
                  ? d.formacaoECertificacoes.formacoes
                      .map((f) => `<tr><td>${f.nome}</td><td>${statusFormacao(f.dataConclusao)} ${fmtDateOnly(f.dataConclusao)}</td></tr>`)
                      .join('')
                  : `<tr><td colspan="2" style="color:#94A3B8;">Nenhuma formação cadastrada.</td></tr>`
              }
            </tbody></table>
            <table style="margin-top:14px"><thead><tr><th>Certificação</th><th>Situação</th></tr></thead><tbody>
              ${
                d.formacaoECertificacoes.certificacoes.length > 0
                  ? d.formacaoECertificacoes.certificacoes
                      .map((c) => `<tr><td>${c.nome}</td><td>${statusFormacao(c.dataConclusao)} ${fmtDateOnly(c.dataConclusao)}</td></tr>`)
                      .join('')
                  : `<tr><td colspan="2" style="color:#94A3B8;">Nenhuma certificação cadastrada.</td></tr>`
              }
            </tbody></table>
          </div>

          ${
            d.atribuicoesEspecialistas.length > 0
              ? `<div class="secao">
                  <h2>Atribuições Especialistas</h2>
                  ${d.atribuicoesEspecialistas
                    .map((texto) => `<div class="parecer-box" style="margin-bottom:8px;">${texto}</div>`)
                    .join('')}
                </div>`
              : ''
          }

          <div class="secao">
            <h2>Resumo Pulse</h2>
            <div class="grid" style="margin-bottom:14px">
              <div class="campo"><p class="l">Ciclos Participados</p><p class="v">${d.pulse.ciclosParticipados}</p></div>
              <div class="campo"><p class="l">Score Atual</p><p class="v">${d.pulse.scoreAtual !== null ? d.pulse.scoreAtual.toFixed(1) : '—'}</p></div>
              <div class="campo"><p class="l">Último Ciclo</p><p class="v">${d.pulse.ultimoCicloLabel ?? '—'}</p></div>
            </div>

            ${
              d.pulse.evolucao.length > 0
                ? `<table><thead><tr><th>Ciclo</th><th>Score</th><th>NPS</th></tr></thead><tbody>
                    ${d.pulse.evolucao.map((e) => `<tr><td>${e.cicloLabel}</td><td>${e.finalScore.toFixed(1)}</td><td>${e.npsScore.toFixed(1)}</td></tr>`).join('')}
                  </tbody></table>`
                : '<p style="font-size:12px;color:#64748B;">Ainda não participou de nenhum ciclo finalizado.</p>'
            }

            ${
              d.pulse.ultimoParecer
                ? `<p style="font-size:11px;color:#64748B;margin-top:16px;margin-bottom:6px;">Parecer final do gestor — ${d.pulse.ultimoCicloLabel}</p>
                   <div class="parecer-box">${d.pulse.ultimoParecer}</div>`
                : ''
            }

            ${
              d.pulse.ultimosFeedbacks.length > 0
                ? `<p style="font-size:11px;color:#64748B;margin-top:16px;margin-bottom:6px;">Feedbacks recebidos — ${d.pulse.ultimoCicloLabel}</p>
                   ${d.pulse.ultimosFeedbacks
                     .map((f) => `<div class="feedback"><p class="autor">${f.autor}</p><p class="texto">${f.texto}</p></div>`)
                     .join('')}`
                : ''
            }
          </div>

          <div class="secao">
            <h2>Últimos Feedbacks Recebidos (Avulsos)</h2>
            ${
              d.feedbacksAvulsos.length > 0
                ? d.feedbacksAvulsos
                    .map(
                      (f) =>
                        `<div class="feedback"><p class="autor">${f.autor} — ${fmtDate(f.data)}</p><p class="texto">${f.texto}</p></div>`,
                    )
                    .join('')
                : '<p style="font-size:12px;color:#64748B;">Ainda não recebeu nenhum feedback avulso.</p>'
            }
          </div>
        </div>
      </body>
    </html>`;
  }
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.GESTOR)
@Controller('dossie')
class DossieController {
  constructor(private service: DossieService) {}

  @Get(':id')
  getDossie(@Param('id') id: string, @Req() req: { user: AuthUser }) {
    return this.service.getDossie(id, req.user);
  }

  @Get(':id/pdf')
  async getDossiePdf(@Param('id') id: string, @Req() req: { user: AuthUser }, @Res() res: Response) {
    const dossie = await this.service.getDossie(id, req.user);
    const buffer = await this.service.getDossiePdf(id, req.user);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="dossie-${dossie.pessoa.fullName.replace(/\s+/g, '-')}.pdf"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  @Audit(AuditAction.EDICAO)
  @Patch(':id/confidencial')
  updateConfidential(@Param('id') id: string, @Body() dto: UpdateConfidentialDto, @Req() req: { user: AuthUser }) {
    return this.service.updateConfidential(id, dto, req.user);
  }

  @Audit(AuditAction.CADASTRO)
  @Post(':id/beneficios')
  addBenefit(@Param('id') id: string, @Body() dto: BenefitDto, @Req() req: { user: AuthUser }) {
    return this.service.addBenefit(id, dto, req.user);
  }

  @Audit(AuditAction.EDICAO)
  @Patch('beneficios/:benefitId')
  updateBenefit(@Param('benefitId') benefitId: string, @Body() dto: BenefitDto, @Req() req: { user: AuthUser }) {
    return this.service.updateBenefit(benefitId, dto, req.user);
  }

  @Audit(AuditAction.EXCLUSAO)
  @Delete('beneficios/:benefitId')
  removeBenefit(@Param('benefitId') benefitId: string, @Req() req: { user: AuthUser }) {
    return this.service.removeBenefit(benefitId, req.user);
  }

  @Audit(AuditAction.CADASTRO)
  @Post(':id/ferias')
  addVacationPeriod(@Param('id') id: string, @Body() dto: VacationPeriodDto, @Req() req: { user: AuthUser }) {
    return this.service.addVacationPeriod(id, dto, req.user);
  }

  @Audit(AuditAction.EXCLUSAO)
  @Delete('ferias/:periodId')
  removeVacationPeriod(@Param('periodId') periodId: string, @Req() req: { user: AuthUser }) {
    return this.service.removeVacationPeriod(periodId, req.user);
  }

  @Audit(AuditAction.CADASTRO)
  @Post(':id/formacao')
  addFormacao(@Param('id') id: string, @Body() dto: FormacaoDto, @Req() req: { user: AuthUser }) {
    return this.service.addFormacao(id, dto, req.user);
  }

  @Audit(AuditAction.EXCLUSAO)
  @Delete('formacao/:formacaoId')
  removeFormacao(@Param('formacaoId') formacaoId: string, @Req() req: { user: AuthUser }) {
    return this.service.removeFormacao(formacaoId, req.user);
  }

  @Audit(AuditAction.CADASTRO)
  @Post(':id/certificacao')
  addCertificacao(@Param('id') id: string, @Body() dto: CertificacaoDto, @Req() req: { user: AuthUser }) {
    return this.service.addCertificacao(id, dto, req.user);
  }

  @Audit(AuditAction.EXCLUSAO)
  @Delete('certificacao/:certificacaoId')
  removeCertificacao(@Param('certificacaoId') certificacaoId: string, @Req() req: { user: AuthUser }) {
    return this.service.removeCertificacao(certificacaoId, req.user);
  }
}

// "Meu Dossiê" (v1.5.0, pedido do Erick) — rota SEPARADA de propósito
// (não é "/dossie/me", é "/meu-dossie") pra nunca colidir com a rota
// ":id" do controller acima, que é restrita a ADMIN/GESTOR. Aberta pra
// QUALQUER perfil (inclusive colaborador e admin) — mas SEMPRE limitada
// a ver/editar os PRÓPRIOS dados (nunca aceita um id de outra pessoa).
@UseGuards(JwtAuthGuard)
@Controller('meu-dossie')
class MeuDossieController {
  constructor(private service: DossieService) {}

  @Get()
  getMyDossie(@Req() req: { user: AuthUser }) {
    return this.service.getMyDossie(req.user.id);
  }

  @Audit(AuditAction.CADASTRO)
  @Post('formacao')
  addFormacao(@Body() dto: FormacaoDto, @Req() req: { user: AuthUser }) {
    return this.service.addFormacao(req.user.id, dto, null);
  }

  @Audit(AuditAction.EXCLUSAO)
  @Delete('formacao/:formacaoId')
  removeFormacao(@Param('formacaoId') formacaoId: string, @Req() req: { user: AuthUser }) {
    return this.service.removeFormacao(formacaoId, null, req.user.id);
  }

  @Audit(AuditAction.CADASTRO)
  @Post('certificacao')
  addCertificacao(@Body() dto: CertificacaoDto, @Req() req: { user: AuthUser }) {
    return this.service.addCertificacao(req.user.id, dto, null);
  }

  @Audit(AuditAction.EXCLUSAO)
  @Delete('certificacao/:certificacaoId')
  removeCertificacao(@Param('certificacaoId') certificacaoId: string, @Req() req: { user: AuthUser }) {
    return this.service.removeCertificacao(certificacaoId, null, req.user.id);
  }
}

@Module({
  imports: [UsersModule, PulseReportsModule],
  controllers: [DossieController, MeuDossieController],
  providers: [DossieService],
})
export class DossieModule {}
