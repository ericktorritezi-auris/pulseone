import { Controller, Get, Injectable, Module, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { PulseCycleStatus, PulseEvaluationStatus, PulseReportStatus, UserRole } from '@prisma/client';

type AuthUser = { id: string; role: UserRole; areaId: string | null };

@Injectable()
class DashboardService {
  constructor(private prisma: PrismaService) {}

  // Mesma trava de liberação em lote por área usada nos relatórios (seção
  // 5.12) — o score no dashboard não pode vazar antes da área inteira
  // estar consolidada, mesma regra do relatório completo.
  private async isAreaFullyConsolidated(cycleId: string, areaId: string): Promise<boolean> {
    const [total, finalizados] = await Promise.all([
      this.prisma.pulseReport.count({ where: { cycleId, owner: { areaId } } }),
      this.prisma.pulseReport.count({
        where: { cycleId, owner: { areaId }, status: PulseReportStatus.FINALIZADO },
      }),
    ]);
    return total > 0 && total === finalizados;
  }

  async getCollaboratorDashboard(userId: string, role: UserRole, areaId: string | null) {
    const [ultimosRecebidos, ultimosEnviados, activeCycle] = await Promise.all([
      this.prisma.feedback.findMany({
        where: { receiverId: userId },
        include: { sender: { select: { fullName: true } } },
        orderBy: { createdAt: 'desc' },
        take: 3,
      }),
      this.prisma.feedback.findMany({
        where: { senderId: userId },
        include: { receiver: { select: { fullName: true } } },
        orderBy: { createdAt: 'desc' },
        take: 3,
      }),
      // Admin nunca avalia nem é avaliado — nem vale a pena consultar o
      // ciclo ativo pra ele, o card de Pulse Atual não se aplica.
      role === UserRole.ADMIN
        ? null
        : this.prisma.pulseCycle.findFirst({ where: { status: 'ABERTO' }, orderBy: { openedAt: 'desc' } }),
    ]);

    let pulseAtual: { label: string; deadline: Date | null; pendentes: number; total: number } | null = null;
    if (activeCycle) {
      const [pendentes, total] = await Promise.all([
        this.prisma.pulseFeedback.count({
          where: { cycleId: activeCycle.id, evaluatorId: userId, status: 'PENDENTE' },
        }),
        this.prisma.pulseFeedback.count({ where: { cycleId: activeCycle.id, evaluatorId: userId } }),
      ]);
      pulseAtual = {
        label: activeCycle.label,
        deadline: activeCycle.deadline,
        pendentes,
        total,
      };
    }

    // Score/NPS/evolução: só considera ciclos onde o relatório da pessoa
    // JÁ está FINALIZADO **e** a área inteira dela já foi consolidada —
    // mesma trava de visibilidade usada no relatório completo (seção 5.12).
    let score: number | null = null;
    let npsRecomendacao: number | null = null;
    const scoreEvolution: { ciclo: string; score: number }[] = [];
    let lastReleasedScore: { finalScore: number; npsScore: number } | null = null;

    if (role !== UserRole.ADMIN && areaId) {
      const myScores = await this.prisma.pulseScore.findMany({
        where: { userId },
        include: { cycle: { select: { label: true, openedAt: true } } },
        orderBy: { cycle: { openedAt: 'asc' } },
      });

      for (const s of myScores) {
        const reportFinalizado = await this.prisma.pulseReport.findFirst({
          where: { cycleId: s.cycleId, ownerId: userId, status: PulseReportStatus.FINALIZADO },
        });

        if (!reportFinalizado) continue;
        const areaReady = await this.isAreaFullyConsolidated(s.cycleId, areaId);
        if (!areaReady) continue;

        scoreEvolution.push({ ciclo: s.cycle.label, score: s.finalScore });
        lastReleasedScore = s;
      }

      if (lastReleasedScore) {
        score = lastReleasedScore.finalScore;
        npsRecomendacao = lastReleasedScore.npsScore;
      }
    }

    return {
      score,
      scoreEvolution,
      npsRecomendacao,
      pulseAtual,
      ultimosRecebidos: ultimosRecebidos.map((f) => ({
        id: f.id,
        remetente: f.sender.fullName,
        texto: f.text,
        criadoEm: f.createdAt,
      })),
      ultimosEnviados: ultimosEnviados.map((f) => ({
        id: f.id,
        destinatario: f.receiver.fullName,
        texto: f.text,
        criadoEm: f.createdAt,
      })),
    };
  }

  // Dashboard do GESTOR (escopo fechado com o Erick): NPS médio e score
  // médio da equipe (liderados diretos), quantidade de membros + listagem.
  // Como managerId exige mesma área (seção 5.7), um gestor nunca gerencia
  // mais de uma área no modelo atual — por isso não existe "por área" aqui.
  async getManagerDashboard(requesterId: string) {
    const team = await this.prisma.user.findMany({
      where: { managerId: requesterId, active: true },
      select: { id: true, fullName: true, position: { select: { name: true } } },
      orderBy: { fullName: 'asc' },
    });

    const teamIds = team.map((t) => t.id);
    let scoreMedio: number | null = null;
    let npsMedio: number | null = null;
    let cycleLabel: string | null = null;

    if (teamIds.length > 0) {
      const latestCycle = await this.prisma.pulseCycle.findFirst({
        where: { status: { in: [PulseCycleStatus.FINALIZADO, PulseCycleStatus.ARQUIVADO] } },
        orderBy: { openedAt: 'desc' },
      });

      if (latestCycle) {
        const scores = await this.prisma.pulseScore.findMany({
          where: { cycleId: latestCycle.id, userId: { in: teamIds } },
        });

        if (scores.length > 0) {
          scoreMedio = scores.reduce((a, s) => a + s.finalScore, 0) / scores.length;
          npsMedio = scores.reduce((a, s) => a + s.npsScore, 0) / scores.length;
          cycleLabel = latestCycle.label;
        }
      }
    }

    return {
      teamSize: team.length,
      team: team.map((t) => ({ id: t.id, fullName: t.fullName, positionName: t.position?.name ?? '—' })),
      scoreMedio,
      npsMedio,
      cycleLabel,
    };
  }

  // Dashboard do ADMIN (escopo fechado com o Erick): só administração do
  // sistema — nunca NPS/score (isso é papel do gestor).
  async getAdminDashboard() {
    const [totalAreas, totalCargos, areas, totalPulsos, pulsoVigente] = await Promise.all([
      this.prisma.area.count(),
      this.prisma.position.count(),
      this.prisma.area.findMany({
        select: { name: true, _count: { select: { users: { where: { active: true, role: { not: UserRole.ADMIN } } } } } },
      }),
      this.prisma.pulseCycle.count(),
      this.prisma.pulseCycle.findFirst({ where: { status: 'ABERTO' }, orderBy: { openedAt: 'desc' } }),
    ]);

    let participacaoPercentual: number | null = null;
    let pendencias = 0;

    if (pulsoVigente) {
      const [total, finalizadas, pendentes] = await Promise.all([
        this.prisma.pulseFeedback.count({ where: { cycleId: pulsoVigente.id } }),
        this.prisma.pulseFeedback.count({
          where: { cycleId: pulsoVigente.id, status: PulseEvaluationStatus.FINALIZADO },
        }),
        this.prisma.pulseFeedback.count({
          where: { cycleId: pulsoVigente.id, status: PulseEvaluationStatus.PENDENTE },
        }),
      ]);
      participacaoPercentual = total > 0 ? Math.round((finalizadas / total) * 100) : 0;
      pendencias = pendentes;
    }

    return {
      totalAreas,
      totalCargos,
      pessoasPorArea: areas.map((a) => ({ areaName: a.name, total: a._count.users })),
      totalPulsos,
      pulsoVigente: pulsoVigente ? { label: pulsoVigente.label, deadline: pulsoVigente.deadline } : null,
      participacaoPercentual,
      pendencias,
    };
  }
}

@UseGuards(JwtAuthGuard)
@Controller('dashboard')
class DashboardController {
  constructor(private dashboardService: DashboardService) {}

  @Get('collaborator')
  getCollaborator(@Req() req: { user: AuthUser }) {
    return this.dashboardService.getCollaboratorDashboard(req.user.id, req.user.role, req.user.areaId);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.GESTOR)
  @Get('manager')
  getManager(@Req() req: { user: AuthUser }) {
    return this.dashboardService.getManagerDashboard(req.user.id);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('admin')
  getAdmin() {
    return this.dashboardService.getAdminDashboard();
  }
}

@Module({
  controllers: [DashboardController],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}
