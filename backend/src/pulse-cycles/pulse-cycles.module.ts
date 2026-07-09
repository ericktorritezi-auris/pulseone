import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Injectable,
  Module,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Audit } from '../common/decorators/audit.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { ResendService } from '../auth/resend.service';
import { EmailModule } from '../email/email.module';
import { PulseReportsService } from '../pulse-reports/pulse-reports.module';
import { PulseReportPdfService } from '../pulse-reports/pulse-report-pdf.service';
import { PulseReportsModule } from '../pulse-reports/pulse-reports.module';
import {
  PulseCycleStatus,
  PulseEvaluationType,
  PulseEvaluationStatus,
  PulseReportStatus,
  UserRole,
  AuditAction,
} from '@prisma/client';
import { IsOptional, IsString, MinLength } from 'class-validator';

class CreateCycleDto {
  @IsString()
  @MinLength(3)
  label: string; // ex: "Pulse Junho/2025"
}

class OpenCycleDto {
  @IsOptional()
  @IsString()
  deadline?: string; // ISO date opcional
}

/**
 * REGRA DE NEGÓCIO — Feedback Pulse fechado por área E por hierarquia direta
 * (seção 5.1 + 5.7 do mapeamento técnico). Gera automaticamente, para um
 * ciclo recém-aberto:
 * - Autoavaliação: sempre, individual, pra todo mundo (exceto ADMIN).
 * - Avaliação do Gestor: cada pessoa é avaliada pelo seu `managerId` direto,
 *   se houver um. Um gestor NUNCA avalia quem não é seu liderado direto —
 *   mesmo estando na mesma área (ex: um Diretor não avalia os liderados do
 *   Gerente abaixo dele, só o próprio Gerente).
 * - Avaliação de Colegas: todos-contra-todos, mas SOMENTE entre pessoas que
 *   compartilham o mesmo `managerId` (mesmo time imediato) — não a área
 *   inteira. Quem não tem ninguém com o mesmo gestor direto não recebe
 *   avaliação de colega nenhuma (ex: um gestor sozinho no topo, sem pares).
 * ADMIN nunca avalia nem é avaliado — filtrado direto na consulta.
 * Também cria o PulseReport (status inicial EM_ANDAMENTO) de cada colaborador.
 */
@Injectable()
class PulseAssignmentService {
  constructor(
    private prisma: PrismaService,
    private resend: ResendService,
  ) {}

  async generateForCycle(cycleId: string) {
    const areas = await this.prisma.area.findMany({
      include: { users: { where: { active: true, role: { not: UserRole.ADMIN } } } },
    });

    // Busca GLOBAL (todas as áreas de uma vez), pra resolver o gestor de
    // qualquer pessoa mesmo quando esse gestor atua em outra área (pedido
    // do Erick: gestor pode gerenciar mais de uma área). Sem isso, a busca
    // ficava presa à lista de membros da MESMA área da pessoa, e o gestor
    // "de fora" nunca era encontrado — a avaliação hierárquica simplesmente
    // não era gerada, silenciosamente.
    const allActiveUsers = await this.prisma.user.findMany({
      where: { active: true, role: { not: UserRole.ADMIN } },
    });
    const usersById = new Map(allActiveUsers.map((u) => [u.id, u]));

    const feedbacksToCreate: {
      cycleId: string;
      evaluatorId: string;
      targetId: string;
      type: PulseEvaluationType;
    }[] = [];
    const reportsToCreate: { cycleId: string; ownerId: string }[] = [];

    for (const area of areas) {
      const members = area.users;
      if (members.length === 0) continue;

      // Autoavaliação — sempre, individual (informativa, não pondera o score final)
      for (const member of members) {
        feedbacksToCreate.push({
          cycleId,
          evaluatorId: member.id,
          targetId: member.id,
          type: PulseEvaluationType.AUTOAVALIACAO,
        });
        reportsToCreate.push({ cycleId, ownerId: member.id });
      }

      // Avaliação hierárquica em mão dupla, agora com tipos distintos e
      // labels próprios (pedido do Erick): o gestor avalia cada liderado
      // direto (AVALIACAO_EQUIPE — "Avaliação da Equipe") e cada liderado
      // avalia de volta o próprio gestor direto (AVALIACAO_GESTOR —
      // "Avaliação do Gestor Direto"). O PulseScoreService soma as duas no
      // mesmo balde de managerScore de quem é avaliado. Busca o gestor na
      // lista GLOBAL (usersById), não só nos membros desta área — um
      // gestor pode ter a área principal em outro lugar e ainda assim
      // gerenciar gente aqui (managedAreas).
      for (const member of members) {
        if (!member.managerId) continue;
        const manager = usersById.get(member.managerId);
        if (!manager) continue; // gestor inativo/inexistente — não gera

        feedbacksToCreate.push({
          cycleId,
          evaluatorId: manager.id,
          targetId: member.id,
          type: PulseEvaluationType.AVALIACAO_EQUIPE,
        });
        feedbacksToCreate.push({
          cycleId,
          evaluatorId: member.id,
          targetId: manager.id,
          type: PulseEvaluationType.AVALIACAO_GESTOR,
        });
      }

      // Avaliação de Colegas — todos-contra-todos, só dentro do MESMO TIME
      // IMEDIATO (mesmo managerId) E DENTRO DESTA MESMA ÁREA. Isso já é
      // garantido pela própria estrutura do laço (percorremos área por
      // área, e "members" só contém gente cuja área PRINCIPAL é esta) —
      // mesmo que o gestor compartilhado atue em várias áreas, colegas de
      // áreas diferentes nunca caem no mesmo grupo aqui, porque cada um
      // só aparece na lista da própria área principal.
      const teams = new Map<string, typeof members>();
      for (const member of members) {
        const key = member.managerId ?? `__sem-gestor-${member.id}`; // sem gestor = time só dele, não forma par
        const group = teams.get(key) ?? [];
        group.push(member);
        teams.set(key, group);
      }

      for (const team of teams.values()) {
        if (team.length < 2) continue;
        for (const evaluator of team) {
          for (const target of team) {
            if (evaluator.id === target.id) continue;
            feedbacksToCreate.push({
              cycleId,
              evaluatorId: evaluator.id,
              targetId: target.id,
              type: PulseEvaluationType.COLEGA,
            });
          }
        }
      }
    }

    await this.prisma.pulseFeedback.createMany({ data: feedbacksToCreate, skipDuplicates: true });
    await this.prisma.pulseReport.createMany({ data: reportsToCreate, skipDuplicates: true });

    // Notificação real de abertura do ciclo (PRD seção 26), com a contagem
    // de avaliações pendentes de cada pessoa.
    const pendingByUser = new Map<string, number>();
    for (const f of feedbacksToCreate) {
      pendingByUser.set(f.evaluatorId, (pendingByUser.get(f.evaluatorId) ?? 0) + 1);
    }

    const cycle = await this.prisma.pulseCycle.findUniqueOrThrow({ where: { id: cycleId } });
    const deadlineStr = cycle.deadline
      ? new Date(cycle.deadline).toLocaleDateString('pt-BR')
      : 'a definir';

    await this.prisma.notification.createMany({
      data: Array.from(pendingByUser.entries()).map(([userId, count]) => ({
        userId,
        title: `${cycle.label} aberto`,
        message: `Você possui ${count} avaliação(ões) pendente(s). Prazo: ${deadlineStr}.`,
      })),
    });

    // E-mail de abertura do ciclo (pedido do Erick) — só pra quem tem
    // avaliação pendente, o que já exclui o admin naturalmente (ele nunca
    // entra em feedbacksToCreate — seção 5.7). Best-effort: uma falha de
    // e-mail isolada não pode derrubar a abertura do ciclo inteiro.
    const recipients = await this.prisma.user.findMany({
      where: { id: { in: Array.from(pendingByUser.keys()) } },
      select: { id: true, email: true, fullName: true },
    });

    for (const recipient of recipients) {
      const count = pendingByUser.get(recipient.id) ?? 0;
      try {
        await this.resend.sendPulseCycleOpened(recipient.email, recipient.fullName, cycle.label, count, deadlineStr);
      } catch (err) {
        // Loga e segue — e-mail é dependência externa, não pode travar a abertura do ciclo.
        console.error(`Falha ao enviar e-mail de abertura de ciclo para ${recipient.email}:`, err);
      }
    }

    return { feedbacksGerados: feedbacksToCreate.length, reportsGerados: reportsToCreate.length };
  }
}

const SCORE_BANDS: [number, string][] = [
  [90, 'Excepcional'],
  [80, 'Excelente'],
  [70, 'Muito Bom'],
  [60, 'Adequado'],
  [50, 'Atenção'],
  [0, 'Crítico'],
];

function resolveScoreBand(score: number): string {
  for (const [min, label] of SCORE_BANDS) {
    if (score >= min) return label;
  }
  return 'Crítico';
}

/**
 * REGRA DE NEGÓCIO — cálculo de score (PRD seção 18 + correção obrigatória):
 * finalScore = teamScore*0.6 + managerScore*0.4. Autoavaliação (selfScore) é
 * só informativa, NUNCA pondera o score final.
 */
@Injectable()
class PulseScoreService {
  constructor(private prisma: PrismaService) {}

  private average(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  // Calcula, para um PulseFeedback finalizado, a média das respostas que
  // NÃO são a pergunta de NPS (as 4 perguntas comportamentais, 0-10),
  // convertida para escala 0-100.
  private async scoreForFeedback(feedbackId: string): Promise<{ behaviorScore: number; npsValue: number | null }> {
    const answers = await this.prisma.pulseAnswer.findMany({
      where: { pulseFeedbackId: feedbackId },
      include: { question: true },
    });

    const behavioral = answers.filter((a) => !a.question.isNps).map((a) => a.value);
    const npsAnswer = answers.find((a) => a.question.isNps);

    return {
      behaviorScore: this.average(behavioral) * 10,
      npsValue: npsAnswer ? npsAnswer.value : null,
    };
  }

  async computeForCycle(cycleId: string) {
    const targets = await this.prisma.pulseFeedback.findMany({
      where: { cycleId, status: PulseEvaluationStatus.FINALIZADO },
      select: { targetId: true },
      distinct: ['targetId'],
    });

    for (const { targetId } of targets) {
      const finished = await this.prisma.pulseFeedback.findMany({
        where: { cycleId, targetId, status: PulseEvaluationStatus.FINALIZADO },
      });

      const colegaScores: number[] = [];
      const gestorScores: number[] = [];
      const selfScores: number[] = [];
      const npsValues: number[] = [];

      for (const fb of finished) {
        const { behaviorScore, npsValue } = await this.scoreForFeedback(fb.id);

        if (fb.type === PulseEvaluationType.COLEGA) {
          colegaScores.push(behaviorScore);
          if (npsValue !== null) npsValues.push(npsValue);
        } else if (fb.type === PulseEvaluationType.AVALIACAO_EQUIPE || fb.type === PulseEvaluationType.AVALIACAO_GESTOR) {
          // As duas pontas da avaliação hierárquica (gestor→liderado e
          // liderado→gestor) contam pro mesmo balde de managerScore de
          // quem está sendo avaliado — é o "score recebido na linha
          // hierárquica direta", venha ela de cima ou de baixo.
          gestorScores.push(behaviorScore);
          if (npsValue !== null) npsValues.push(npsValue);
        } else if (fb.type === PulseEvaluationType.AUTOAVALIACAO) {
          selfScores.push(behaviorScore);
          // Autoavaliação não entra no NPS consolidado — é autopercepção, não recomendação de terceiros.
        }
      }

      const teamScore = this.average(colegaScores);
      const managerScore = this.average(gestorScores);
      const selfScore = this.average(selfScores);
      const npsScore = this.average(npsValues);

      // REGRA DE NEGÓCIO (pedido do Erick): se uma vertical não tem NENHUMA
      // avaliação (ex: gestor sem par pra receber avaliação de colega),
      // ela precisa ser EXCLUÍDA do cálculo — não contar como nota 0, que
      // derrubaria o score injustamente por falta de dado, não por
      // desempenho ruim. O peso da vertical ausente é redistribuído pra
      // quem tem dado; se as duas tiverem dado, mantém o 60/40 normal.
      let finalScore: number;
      if (colegaScores.length > 0 && gestorScores.length > 0) {
        finalScore = teamScore * 0.6 + managerScore * 0.4;
      } else if (colegaScores.length > 0) {
        finalScore = teamScore; // só equipe tem dado — 100% do peso pra ela
      } else if (gestorScores.length > 0) {
        finalScore = managerScore; // só gestor tem dado — 100% do peso pra ele
      } else {
        finalScore = 0; // nenhuma das duas verticais tem dado (caso extremo)
      }

      await this.prisma.pulseScore.upsert({
        where: { cycleId_userId: { cycleId, userId: targetId } },
        create: {
          cycleId,
          userId: targetId,
          teamScore,
          managerScore,
          selfScore,
          finalScore,
          npsScore,
          scoreBand: resolveScoreBand(finalScore),
        },
        update: {
          teamScore,
          managerScore,
          selfScore,
          finalScore,
          npsScore,
          scoreBand: resolveScoreBand(finalScore),
        },
      });

      // Quem está no TOPO da hierarquia (sem gestor direto) não precisa de
      // parecer final — ninguém está acima dele pra escrever isso. Ele só
      // precisa ver as avaliações que o time deu, então o relatório dele
      // já sai direto como FINALIZADO (pedido do Erick), sem depender de
      // ação manual do admin nem passar por AGUARDANDO_FECHAMENTO.
      const target = await this.prisma.user.findUniqueOrThrow({ where: { id: targetId } });

      if (target.managerId === null) {
        await this.prisma.pulseReport.updateMany({
          where: { cycleId, ownerId: targetId },
          data: { status: PulseReportStatus.FINALIZADO, finalizedAt: new Date() },
        });
      } else {
        // Único status de espera enquanto o gestor não finaliza a
        // consolidação (análise de IA é opcional dentro dele) — pedido do Erick.
        await this.prisma.pulseReport.updateMany({
          where: { cycleId, ownerId: targetId },
          data: { status: PulseReportStatus.AGUARDANDO_FECHAMENTO },
        });
      }
    }

    return { usuariosProcessados: targets.length };
  }
}

@Injectable()
class PulseCyclesService {
  constructor(
    private prisma: PrismaService,
    private assignmentService: PulseAssignmentService,
    private scoreService: PulseScoreService,
    private pulseReportsService: PulseReportsService,
    private pdfService: PulseReportPdfService,
    private resend: ResendService,
  ) {}

  findAll() {
    return this.prisma.pulseCycle.findMany({ orderBy: { createdAt: 'desc' } });
  }

  create(dto: CreateCycleDto) {
    return this.prisma.pulseCycle.create({ data: { label: dto.label } });
  }

  async open(id: string, dto: OpenCycleDto) {
    const cycle = await this.prisma.pulseCycle.findUniqueOrThrow({ where: { id } });
    if (cycle.status !== PulseCycleStatus.RASCUNHO) {
      throw new ForbiddenException('Só é possível abrir um ciclo que esteja em RASCUNHO.');
    }

    await this.prisma.pulseCycle.update({
      where: { id },
      data: {
        status: PulseCycleStatus.ABERTO,
        openedAt: new Date(),
        deadline: dto.deadline ? new Date(dto.deadline) : undefined,
      },
    });

    const result = await this.assignmentService.generateForCycle(id);
    return { cycle: await this.prisma.pulseCycle.findUniqueOrThrow({ where: { id } }), ...result };
  }

  async close(id: string) {
    const cycle = await this.prisma.pulseCycle.findUniqueOrThrow({ where: { id } });
    if (cycle.status !== PulseCycleStatus.ABERTO) {
      throw new ForbiddenException('Só é possível encerrar um ciclo que esteja ABERTO.');
    }
    return this.prisma.pulseCycle.update({
      where: { id },
      data: { status: PulseCycleStatus.ENCERRADO, closedAt: new Date() },
    });
  }

  async consolidate(id: string) {
    const cycle = await this.prisma.pulseCycle.findUniqueOrThrow({ where: { id } });
    if (cycle.status !== PulseCycleStatus.ENCERRADO) {
      throw new ForbiddenException('Só é possível consolidar um ciclo que esteja ENCERRADO.');
    }

    await this.prisma.pulseCycle.update({
      where: { id },
      data: { status: PulseCycleStatus.EM_CONSOLIDACAO },
    });

    const result = await this.scoreService.computeForCycle(id);
    return { cycle: await this.prisma.pulseCycle.findUniqueOrThrow({ where: { id } }), ...result };
  }

  /**
   * Arquivar (pedido do Erick, seção "ciclos arquivados"): grava
   * `archivedAt` e, pra transformar isso num encerramento de verdade,
   * gera e manda por e-mail o PDF final de cada pessoa com relatório
   * FINALIZADO nesse ciclo — o registro que ela leva pra casa.
   *
   * Best-effort por pessoa: se o PDF de uma pessoa falhar (raro, mas
   * possível), loga e segue pras próximas — uma falha isolada não pode
   * impedir o arquivamento do ciclo inteiro.
   */
  async archive(id: string) {
    const cycle = await this.prisma.pulseCycle.findUniqueOrThrow({ where: { id } });
    if (cycle.status !== PulseCycleStatus.FINALIZADO) {
      throw new ForbiddenException('Só é possível arquivar um ciclo FINALIZADO.');
    }

    const updated = await this.prisma.pulseCycle.update({
      where: { id },
      data: { status: PulseCycleStatus.ARQUIVADO, archivedAt: new Date() },
    });

    const reports = await this.prisma.pulseReport.findMany({
      where: { cycleId: id, status: PulseReportStatus.FINALIZADO },
      include: { owner: { select: { email: true, fullName: true } } },
    });

    for (const report of reports) {
      try {
        const reportData = await this.pulseReportsService.getReportForArchiveEmail(report.id);
        if (!reportData) continue;
        const html = this.pdfService.buildHtml(reportData as any);
        const pdfBuffer = await this.pdfService.generatePdf(html);
        await this.resend.sendPulseReportArchived(report.owner.email, report.owner.fullName, cycle.label, pdfBuffer);
      } catch (err) {
        console.error(`Falha ao gerar/enviar PDF de arquivamento para ${report.owner.email}:`, err);
      }
    }

    return updated;
  }

  /**
   * REGRA DE NEGÓCIO (pedido do Erick): diferente do encerramento das
   * avaliações (que é só informativo), finalizar o CICLO exige 100% dos
   * relatórios de TODAS as áreas com status FINALIZADO — senão o ciclo
   * ficaria travado em EM_CONSOLIDACAO pra sempre. Aqui o bloqueio é real.
   */
  async finalize(id: string) {
    const cycle = await this.prisma.pulseCycle.findUniqueOrThrow({ where: { id } });
    if (cycle.status !== PulseCycleStatus.EM_CONSOLIDACAO) {
      throw new ForbiddenException('Só é possível finalizar um ciclo que esteja EM_CONSOLIDACAO.');
    }

    const pendentes = await this.prisma.pulseReport.findMany({
      where: { cycleId: id, status: { not: PulseReportStatus.FINALIZADO } },
      include: { owner: { select: { fullName: true, role: true } } },
    });

    if (pendentes.length > 0) {
      const nomes = pendentes.map((p) => `${p.owner.fullName} (${p.owner.role})`).join(', ');
      throw new BadRequestException(
        `Ainda faltam ${pendentes.length} relatório(s) finalizar antes de poder finalizar o ciclo: ${nomes}.`,
      );
    }

    return this.prisma.pulseCycle.update({ where: { id }, data: { status: PulseCycleStatus.FINALIZADO } });
  }

  // Monitoramento em tempo real (pedido do Erick): percentual de conclusão
  // por área do ciclo, pra o admin decidir quando faz sentido encerrar.
  // É só informativo — o sistema nunca bloqueia o encerramento.
  async getProgressByArea(cycleId: string) {
    await this.prisma.pulseCycle.findUniqueOrThrow({ where: { id: cycleId } });

    const areas = await this.prisma.area.findMany({
      include: { users: { where: { active: true, role: { not: UserRole.ADMIN } }, select: { id: true } } },
    });

    const result: { areaId: string; areaName: string; total: number; finalizados: number; percentual: number }[] = [];
    let totalGeral = 0;
    let finalizadosGeral = 0;

    for (const area of areas) {
      const userIds = area.users.map((u) => u.id);
      if (userIds.length === 0) continue;

      const [total, finalizados] = await Promise.all([
        this.prisma.pulseFeedback.count({ where: { cycleId, evaluatorId: { in: userIds } } }),
        this.prisma.pulseFeedback.count({
          where: { cycleId, evaluatorId: { in: userIds }, status: PulseEvaluationStatus.FINALIZADO },
        }),
      ]);

      if (total === 0) continue;

      totalGeral += total;
      finalizadosGeral += finalizados;

      result.push({
        areaId: area.id,
        areaName: area.name,
        total,
        finalizados,
        percentual: Math.round((finalizados / total) * 100),
      });
    }

    return {
      areas: result.sort((a, b) => a.areaName.localeCompare(b.areaName)),
      percentualGeral: totalGeral > 0 ? Math.round((finalizadosGeral / totalGeral) * 100) : 0,
    };
  }

  // Mesma ideia do getProgressByArea, mas medindo PulseReport.status ao
  // invés de PulseFeedback — é o progresso da fase de CONSOLIDAÇÃO
  // (parecer do gestor), não da fase de avaliação. Inclui os nomes de quem
  // ainda está pendente, pra dar visibilidade real de quem falta fechar
  // (e não deixar dúvida se o Admin está sendo contabilizado à toa).
  async getConsolidationProgressByArea(cycleId: string) {
    await this.prisma.pulseCycle.findUniqueOrThrow({ where: { id: cycleId } });

    const areas = await this.prisma.area.findMany();

    const result: {
      areaId: string;
      areaName: string;
      total: number;
      finalizados: number;
      percentual: number;
      pendentes: { id: string; fullName: string; role: string }[];
    }[] = [];
    let totalGeral = 0;
    let finalizadosGeral = 0;

    for (const area of areas) {
      const reports = await this.prisma.pulseReport.findMany({
        where: { cycleId, owner: { areaId: area.id } },
        include: { owner: { select: { id: true, fullName: true, role: true } } },
      });

      if (reports.length === 0) continue;

      const finalizados = reports.filter((r) => r.status === PulseReportStatus.FINALIZADO).length;
      const pendentes = reports
        .filter((r) => r.status !== PulseReportStatus.FINALIZADO)
        .map((r) => ({ id: r.owner.id, fullName: r.owner.fullName, role: r.owner.role }));

      totalGeral += reports.length;
      finalizadosGeral += finalizados;

      result.push({
        areaId: area.id,
        areaName: area.name,
        total: reports.length,
        finalizados,
        percentual: Math.round((finalizados / reports.length) * 100),
        pendentes,
      });
    }

    return {
      areas: result.sort((a, b) => a.areaName.localeCompare(b.areaName)),
      percentualGeral: totalGeral > 0 ? Math.round((finalizadosGeral / totalGeral) * 100) : 0,
    };
  }
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('pulse-cycles')
class PulseCyclesController {
  constructor(private pulseCyclesService: PulseCyclesService) {}

  @Get()
  findAll() {
    return this.pulseCyclesService.findAll();
  }

  @Audit(AuditAction.CADASTRO)
  @Post()
  create(@Body() dto: CreateCycleDto) {
    return this.pulseCyclesService.create(dto);
  }

  @Audit(AuditAction.EDICAO)
  @Patch(':id/open')
  open(@Param('id') id: string, @Body() dto: OpenCycleDto) {
    return this.pulseCyclesService.open(id, dto);
  }

  @Audit(AuditAction.FECHAMENTO)
  @Patch(':id/close')
  close(@Param('id') id: string) {
    return this.pulseCyclesService.close(id);
  }

  @Audit(AuditAction.FECHAMENTO)
  @Patch(':id/consolidate')
  consolidate(@Param('id') id: string) {
    return this.pulseCyclesService.consolidate(id);
  }

  @Audit(AuditAction.FECHAMENTO)
  @Patch(':id/finalize')
  finalize(@Param('id') id: string) {
    return this.pulseCyclesService.finalize(id);
  }

  @Audit(AuditAction.FECHAMENTO)
  @Patch(':id/archive')
  archive(@Param('id') id: string) {
    return this.pulseCyclesService.archive(id);
  }

  @Get(':id/progress')
  getProgress(@Param('id') id: string) {
    return this.pulseCyclesService.getProgressByArea(id);
  }

  @Get(':id/consolidation-progress')
  getConsolidationProgress(@Param('id') id: string) {
    return this.pulseCyclesService.getConsolidationProgressByArea(id);
  }
}

@Module({
  imports: [EmailModule, PulseReportsModule],
  controllers: [PulseCyclesController],
  providers: [PulseCyclesService, PulseAssignmentService, PulseScoreService],
  exports: [PulseAssignmentService, PulseScoreService],
})
export class PulseCyclesModule {}
