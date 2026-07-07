import { Controller, Get, Injectable, Module, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole } from '@prisma/client';

type AuthUser = { id: string; role: UserRole; areaId: string };

@Injectable()
class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getCollaboratorDashboard(userId: string) {
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
      this.prisma.pulseCycle.findFirst({ where: { status: 'ABERTO' }, orderBy: { openedAt: 'desc' } }),
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

    // Score, NPS do Pulse e evolução dependem da consolidação do ciclo
    // (relatório final, Sprint 4/5). Por enquanto retornam null explícito.
    return {
      score: null,
      scoreEvolution: [] as { ciclo: string; score: number }[],
      npsRecomendacao: null,
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
}

@UseGuards(JwtAuthGuard)
@Controller('dashboard')
class DashboardController {
  constructor(private dashboardService: DashboardService) {}

  @Get('collaborator')
  getCollaborator(@Req() req: { user: AuthUser }) {
    return this.dashboardService.getCollaboratorDashboard(req.user.id);
  }
}

@Module({
  controllers: [DashboardController],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}
