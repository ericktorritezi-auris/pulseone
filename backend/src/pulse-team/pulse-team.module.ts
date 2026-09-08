import { Controller, Get, Injectable, Module, Param, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { PulseEvaluationStatus, UserRole } from '@prisma/client';

type AuthUser = { id: string; role: UserRole; areaId: string | null };

/**
 * Monitoramento em tempo real do ciclo, por pessoa — pedido do Erick.
 * O gestor não precisa saber O QUE está faltando, só o percentual de cada
 * pessoa da própria área, pra poder cobrar individualmente se necessário.
 * Sempre escopado pela área do gestor logado — nunca de outra área.
 */
@Injectable()
class PulseTeamService {
  constructor(private prisma: PrismaService) {}

  async getTeamProgress(cycleId: string, requester: AuthUser) {
    const cycle = await this.prisma.pulseCycle.findUniqueOrThrow({ where: { id: cycleId } });
    return this.computeProgress(cycleId, requester, cycle.areaId);
  }

  async getCurrentTeamProgress(requester: AuthUser) {
    const managedAreaIds =
      requester.role === UserRole.GESTOR
        ? (
            await this.prisma.user.findUnique({
              where: { id: requester.id },
              select: { managedAreas: { select: { id: true } } },
            })
          )?.managedAreas.map((a) => a.id) ?? []
        : requester.areaId
          ? [requester.areaId]
          : [];

    // CORREÇÃO (pedido urgente do Erick): antes, buscava só "o ciclo
    // aberto mais recente do sistema todo" — com vários ciclos abertos ao
    // mesmo tempo (um por área), isso escondia silenciosamente o time das
    // outras áreas que o gestor também gerencia (apareciam como "0 de 0",
    // como se não tivessem nada, quando na verdade o ciclo consultado
    // simplesmente não era o delas). Agora considera TODOS os ciclos
    // abertos relevantes pro gestor — Geral ou de qualquer área que ele
    // gerencie — cada um com o time da PRÓPRIA área daquele ciclo.
    const activeCycles = await this.prisma.pulseCycle.findMany({
      where: {
        status: 'ABERTO',
        OR: [{ areaId: null }, { areaId: { in: managedAreaIds } }],
      },
      include: { area: { select: { name: true } } },
      orderBy: { openedAt: 'desc' },
    });

    if (activeCycles.length === 0) return [];

    return Promise.all(
      activeCycles.map(async (cycle) => ({
        cycle: { id: cycle.id, label: cycle.label, areaName: cycle.area?.name ?? 'Geral' },
        team: await this.computeProgress(cycle.id, requester, cycle.areaId),
      })),
    );
  }

  private async computeProgress(cycleId: string, requester: AuthUser, cycleAreaId?: string | null) {
    // Gestor pode atuar em mais de uma área (seção 5.25) — o progresso do
    // time precisa considerar TODAS as áreas que ele gerencia, não só a
    // área principal dele. Mas se o CICLO em si é de uma área específica
    // (não Geral), o time mostrado tem que ser só dessa área — senão
    // mistura gente que nem faz parte desse ciclo.
    const managedAreaIds =
      requester.role === UserRole.GESTOR
        ? (
            await this.prisma.user.findUnique({
              where: { id: requester.id },
              select: { managedAreas: { select: { id: true } } },
            })
          )?.managedAreas.map((a) => a.id) ?? []
        : requester.areaId
          ? [requester.areaId]
          : [];

    const areaIds = cycleAreaId ? managedAreaIds.filter((id) => id === cycleAreaId) : managedAreaIds;

    const members = await this.prisma.user.findMany({
      where: { areaId: { in: areaIds }, active: true, role: { not: UserRole.ADMIN } },
      select: { id: true, fullName: true, role: true },
      orderBy: { fullName: 'asc' },
    });

    const result: { userId: string; fullName: string; role: UserRole; total: number; finalizados: number; percentual: number }[] = [];
    for (const member of members) {
      const [total, finalizados] = await Promise.all([
        this.prisma.pulseFeedback.count({ where: { cycleId, evaluatorId: member.id } }),
        this.prisma.pulseFeedback.count({
          where: { cycleId, evaluatorId: member.id, status: PulseEvaluationStatus.FINALIZADO },
        }),
      ]);

      result.push({
        userId: member.id,
        fullName: member.fullName,
        role: member.role,
        total,
        finalizados,
        percentual: total > 0 ? Math.round((finalizados / total) * 100) : 0,
      });
    }

    return result;
  }
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.GESTOR)
@Controller('pulse-team')
class PulseTeamController {
  constructor(private pulseTeamService: PulseTeamService) {}

  // Precisa vir ANTES de ':cycleId' — senão o Nest trataria "current" como um cycleId.
  @Get('current')
  getCurrent(@Req() req: { user: AuthUser }) {
    return this.pulseTeamService.getCurrentTeamProgress(req.user);
  }

  @Get(':cycleId')
  getProgress(@Param('cycleId') cycleId: string, @Req() req: { user: AuthUser }) {
    return this.pulseTeamService.getTeamProgress(cycleId, req.user);
  }
}

@Module({
  controllers: [PulseTeamController],
  providers: [PulseTeamService],
})
export class PulseTeamModule {}
