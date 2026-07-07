import { Controller, Get, Injectable, Module, Param, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { PulseEvaluationStatus, UserRole } from '@prisma/client';

type AuthUser = { id: string; role: UserRole; areaId: string };

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
    await this.prisma.pulseCycle.findUniqueOrThrow({ where: { id: cycleId } });
    return this.computeProgress(cycleId, requester);
  }

  async getCurrentTeamProgress(requester: AuthUser) {
    const activeCycle = await this.prisma.pulseCycle.findFirst({
      where: { status: 'ABERTO' },
      orderBy: { openedAt: 'desc' },
    });

    if (!activeCycle) return { cycle: null, team: [] };

    return { cycle: { id: activeCycle.id, label: activeCycle.label }, team: await this.computeProgress(activeCycle.id, requester) };
  }

  private async computeProgress(cycleId: string, requester: AuthUser) {
    const members = await this.prisma.user.findMany({
      where: { areaId: requester.areaId, active: true, role: { not: UserRole.ADMIN } },
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
