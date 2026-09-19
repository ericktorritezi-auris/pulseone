import { Controller, Get, Injectable, Module, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { PulseCycleStatus, PulseEvaluationStatus, PulseEvaluationType, PulseReportStatus, UserRole } from '@prisma/client';

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
        : this.prisma.pulseCycle.findFirst({
            // Ciclo por área (pedido do Erick): considera ciclos GERAIS
            // (areaId nulo) e ciclos da PRÓPRIA área da pessoa — nunca o
            // ciclo de uma área diferente, mesmo que esteja aberto ao
            // mesmo tempo. Construído explicitamente (não usar `?? undefined`
            // aqui dentro do OR — o Prisma trata `undefined` como "sem
            // filtro nesse campo", o que bateria com QUALQUER área).
            where: {
              status: 'ABERTO',
              OR: areaId ? [{ areaId: null }, { areaId }] : [{ areaId: null }],
            },
            orderBy: { openedAt: 'desc' },
          }),
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
  // médio da equipe (liderados diretos), quantidade de membros + listagem,
  // quebrado por área (managedAreas — seção 5.25: um gestor pode gerenciar
  // mais de uma área, e resolveManagerId já permite ser managerId direto de
  // pessoas em qualquer área que ele gerencie, não só a própria).
  // Mesmo cálculo de score por avaliação usado no fechamento oficial do
  // ciclo (PulseScoreService.scoreForFeedback) — reaproveitado aqui só pro
  // painel INFORMATIVO "como cada área me avalia" (nunca altera o score
  // oficial, que continua um número único por ciclo — decisão do Erick).
  private async behaviorScoreForFeedback(feedbackId: string): Promise<number | null> {
    const answers = await this.prisma.pulseAnswer.findMany({
      where: { pulseFeedbackId: feedbackId },
      include: { question: true },
    });
    const behavioral = answers.filter((a) => !a.question.isNps).map((a) => a.value);
    if (behavioral.length === 0) return null;
    return (behavioral.reduce((a, v) => a + v, 0) / behavioral.length) * 10;
  }

  async getManagerDashboard(requesterId: string) {
    // Áreas que este gestor gerencia (pode ser mais de uma — seção 5.25).
    const requesterWithAreas = await this.prisma.user.findUnique({
      where: { id: requesterId },
      select: { managedAreas: { select: { id: true, name: true } } },
    });
    const managedAreas = requesterWithAreas?.managedAreas ?? [];

    const team = await this.prisma.user.findMany({
      where: { managerId: requesterId, active: true },
      select: {
        id: true,
        fullName: true,
        areaId: true,
        area: { select: { name: true } },
        position: { select: { name: true } },
      },
      orderBy: { fullName: 'asc' },
    });

    // CORREÇÃO (pedido do Erick — seção 5.55): antes buscava só "o ciclo
    // finalizado/arquivado mais recente do SISTEMA TODO" (findFirst global,
    // sem filtro de área). Com ciclos agora escopados por área — podendo
    // existir vários simultâneos e cada um encerrando em datas diferentes
    // (seção 5.25/5.54) — esse único "mais recente" quase sempre acabava
    // sendo o ciclo de UMA área só. Score e "como cada área te avaliou"
    // eram calculados só em cima desse ciclo, então as outras áreas que
    // esse gestor também gerencia ficavam de fora silenciosamente (score
    // vazio, feedback recebido delas some) mesmo ele sendo gestor delas.
    // Agora cada área geridas busca o SEU PRÓPRIO ciclo mais recente
    // (Geral ou dela mesma) — igual ao padrão já usado em pulse-team.
    const latestCycleByArea = new Map<string, { id: string; label: string; openedAt: Date } | null>();
    for (const area of managedAreas) {
      const cycle = await this.prisma.pulseCycle.findFirst({
        where: {
          status: { in: [PulseCycleStatus.FINALIZADO, PulseCycleStatus.ARQUIVADO] },
          OR: [{ areaId: null }, { areaId: area.id }],
        },
        orderBy: { openedAt: 'desc' },
      });
      latestCycleByArea.set(area.id, cycle);
    }

    // Label exibida no topo do painel ("Último ciclo: X") — só informativo,
    // usa o ciclo mais recente entre todas as áreas geridas.
    const cycleLabel =
      Array.from(latestCycleByArea.values())
        .filter((c): c is { id: string; label: string; openedAt: Date } => !!c)
        .sort((a, b) => b.openedAt.getTime() - a.openedAt.getTime())[0]?.label ?? null;

    // Quebra por área (pedido do Erick): score/NPS médio de cada área
    // separadamente, não um número só misturando todo mundo.
    const porArea: {
      areaId: string;
      areaName: string;
      colaboradores: number;
      scoreMedio: number | null;
      npsMedio: number | null;
    }[] = [];

    for (const area of managedAreas) {
      const membrosDaArea = team.filter((t) => t.areaId === area.id);
      let scoreMedio: number | null = null;
      let npsMedio: number | null = null;
      const areaCycle = latestCycleByArea.get(area.id);

      if (areaCycle && membrosDaArea.length > 0) {
        const scores = await this.prisma.pulseScore.findMany({
          where: { cycleId: areaCycle.id, userId: { in: membrosDaArea.map((m) => m.id) } },
        });
        if (scores.length > 0) {
          scoreMedio = scores.reduce((a, s) => a + s.finalScore, 0) / scores.length;
          npsMedio = scores.reduce((a, s) => a + s.npsScore, 0) / scores.length;
        }
      }

      porArea.push({
        areaId: area.id,
        areaName: area.name,
        colaboradores: membrosDaArea.length,
        scoreMedio,
        npsMedio,
      });
    }

    // Painel informativo: como cada área avalia ESTE gestor (AVALIACAO_GESTOR
    // recebida, agrupada pela área de quem avaliou) — só informativo, nunca
    // substitui o score oficial dele (que continua um número único). Agora
    // percorre cada área gerida usando o ciclo PRÓPRIO dela (ver acima),
    // em vez de um único ciclo global que escondia as outras áreas.
    const avaliacaoRecebidaPorArea: { areaName: string; scoreMedio: number }[] = [];
    for (const area of managedAreas) {
      const areaCycle = latestCycleByArea.get(area.id);
      if (!areaCycle) continue;

      const recebidas = await this.prisma.pulseFeedback.findMany({
        where: {
          cycleId: areaCycle.id,
          targetId: requesterId,
          type: PulseEvaluationType.AVALIACAO_GESTOR,
          status: PulseEvaluationStatus.FINALIZADO,
          evaluator: { areaId: area.id },
        },
      });
      if (recebidas.length === 0) continue;

      const scores: number[] = [];
      for (const fb of recebidas) {
        const score = await this.behaviorScoreForFeedback(fb.id);
        if (score !== null) scores.push(score);
      }
      if (scores.length === 0) continue;

      avaliacaoRecebidaPorArea.push({
        areaName: area.name,
        scoreMedio: scores.reduce((a, v) => a + v, 0) / scores.length,
      });
    }

    return {
      teamSize: team.length,
      team: team.map((t) => ({
        id: t.id,
        fullName: t.fullName,
        positionName: t.position?.name ?? '—',
        areaName: t.area?.name ?? '—',
      })),
      cycleLabel,
      porArea,
      avaliacaoRecebidaPorArea,
    };
  }

  // Dashboard do ADMIN (escopo fechado com o Erick): só administração do
  // sistema — nunca NPS/score (isso é papel do gestor).
  async getAdminDashboard() {
    const [totalAreas, totalCargos, areas, totalPulsos, ciclosAbertosRaw] = await Promise.all([
      this.prisma.area.count(),
      this.prisma.position.count(),
      this.prisma.area.findMany({
        select: { name: true, _count: { select: { users: { where: { active: true, role: { not: UserRole.ADMIN } } } } } },
      }),
      this.prisma.pulseCycle.count(),
      // Ciclo por área (pedido do Erick): pode ter mais de um ciclo aberto
      // simultaneamente (um por área) — vira uma LISTA, não mais um único
      // "pulso vigente".
      this.prisma.pulseCycle.findMany({
        where: { status: 'ABERTO' },
        include: { area: { select: { name: true } } },
        orderBy: { openedAt: 'desc' },
      }),
    ]);

    const ciclosAbertos = await Promise.all(
      ciclosAbertosRaw.map(async (cycle) => {
        const [total, finalizadas] = await Promise.all([
          this.prisma.pulseFeedback.count({ where: { cycleId: cycle.id } }),
          this.prisma.pulseFeedback.count({
            where: { cycleId: cycle.id, status: PulseEvaluationStatus.FINALIZADO },
          }),
        ]);
        return {
          id: cycle.id,
          label: cycle.label,
          areaName: cycle.area?.name ?? 'Geral',
          deadline: cycle.deadline,
          participacaoPercentual: total > 0 ? Math.round((finalizadas / total) * 100) : 0,
          pendencias: total - finalizadas,
        };
      }),
    );

    return {
      totalAreas,
      totalCargos,
      pessoasPorArea: areas.map((a) => ({ areaName: a.name, total: a._count.users })),
      totalPulsos,
      ciclosAbertos,
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
