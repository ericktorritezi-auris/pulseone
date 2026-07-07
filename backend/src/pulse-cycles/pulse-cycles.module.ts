import {
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
import { PrismaService } from '../prisma/prisma.service';
import { PulseCycleStatus, PulseEvaluationType, PulseEvaluationStatus, UserRole } from '@prisma/client';
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
 * REGRA DE NEGÓCIO — Feedback Pulse fechado por área (seção 5.1 do
 * mapeamento técnico). Gera automaticamente, para um ciclo recém-aberto:
 * - Autoavaliação: sempre, individual.
 * - Avaliação do Gestor: o gestor da área avalia cada membro (menos ele mesmo).
 * - Avaliação de Colegas: todos-contra-todos, SOMENTE dentro da mesma área.
 *   Área com 1 pessoa só não gera avaliação de colega (não há com quem comparar).
 * Também cria o PulseReport (status inicial EM_ANDAMENTO) de cada colaborador.
 */
@Injectable()
class PulseAssignmentService {
  constructor(private prisma: PrismaService) {}

  async generateForCycle(cycleId: string) {
    const areas = await this.prisma.area.findMany({
      include: { users: { where: { active: true } } },
    });

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

      const gestor = members.find((m) => m.role === UserRole.GESTOR);

      for (const member of members) {
        // Autoavaliação — sempre, individual (informativa, não pondera o score final)
        feedbacksToCreate.push({
          cycleId,
          evaluatorId: member.id,
          targetId: member.id,
          type: PulseEvaluationType.AUTOAVALIACAO,
        });

        reportsToCreate.push({ cycleId, ownerId: member.id });
      }

      // Avaliação do Gestor — o gestor avalia cada membro, exceto ele mesmo
      if (gestor) {
        for (const member of members) {
          if (member.id === gestor.id) continue;
          feedbacksToCreate.push({
            cycleId,
            evaluatorId: gestor.id,
            targetId: member.id,
            type: PulseEvaluationType.GESTOR,
          });
        }
      }

      // Avaliação de Colegas — todos-contra-todos, só dentro da mesma área
      if (members.length >= 2) {
        for (const evaluator of members) {
          for (const target of members) {
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
        } else if (fb.type === PulseEvaluationType.GESTOR) {
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
      const finalScore = teamScore * 0.6 + managerScore * 0.4;
      const npsScore = this.average(npsValues);

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

      // Avança o status do relatório individual para AGUARDANDO_IA (Sprint 4
      // cuida da geração da análise e do parecer final do gestor).
      await this.prisma.pulseReport.updateMany({
        where: { cycleId, ownerId: targetId },
        data: { status: 'AGUARDANDO_IA' },
      });
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

  async archive(id: string) {
    const cycle = await this.prisma.pulseCycle.findUniqueOrThrow({ where: { id } });
    if (cycle.status !== PulseCycleStatus.FINALIZADO) {
      throw new ForbiddenException('Só é possível arquivar um ciclo FINALIZADO.');
    }
    return this.prisma.pulseCycle.update({ where: { id }, data: { status: PulseCycleStatus.ARQUIVADO } });
  }

  // Monitoramento em tempo real (pedido do Erick): percentual de conclusão
  // por área do ciclo, pra o admin decidir quando faz sentido encerrar.
  // É só informativo — o sistema nunca bloqueia o encerramento.
  async getProgressByArea(cycleId: string) {
    await this.prisma.pulseCycle.findUniqueOrThrow({ where: { id: cycleId } });

    const areas = await this.prisma.area.findMany({
      include: { users: { where: { active: true }, select: { id: true } } },
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

  @Post()
  create(@Body() dto: CreateCycleDto) {
    return this.pulseCyclesService.create(dto);
  }

  @Patch(':id/open')
  open(@Param('id') id: string, @Body() dto: OpenCycleDto) {
    return this.pulseCyclesService.open(id, dto);
  }

  @Patch(':id/close')
  close(@Param('id') id: string) {
    return this.pulseCyclesService.close(id);
  }

  @Patch(':id/consolidate')
  consolidate(@Param('id') id: string) {
    return this.pulseCyclesService.consolidate(id);
  }

  @Patch(':id/archive')
  archive(@Param('id') id: string) {
    return this.pulseCyclesService.archive(id);
  }

  @Get(':id/progress')
  getProgress(@Param('id') id: string) {
    return this.pulseCyclesService.getProgressByArea(id);
  }
}

@Module({
  controllers: [PulseCyclesController],
  providers: [PulseCyclesService, PulseAssignmentService, PulseScoreService],
  exports: [PulseAssignmentService, PulseScoreService],
})
export class PulseCyclesModule {}
