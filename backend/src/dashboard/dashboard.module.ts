import { Controller, Get, Injectable, Module, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole } from '@prisma/client';

type AuthUser = { id: string; role: UserRole; areaId: string };

@Injectable()
class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getCollaboratorDashboard(userId: string) {
    const [ultimosRecebidos, ultimosEnviados] = await Promise.all([
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
    ]);

    // Score, NPS do Pulse e evolução dependem do motor de ciclos (Sprint 3-5).
    // Por enquanto retornam null/vazio de forma explícita — o frontend já
    // sabe renderizar esse estado ("Disponível após o primeiro ciclo Pulse").
    return {
      score: null,
      scoreEvolution: [] as { ciclo: string; score: number }[],
      npsRecomendacao: null,
      pulseAtual: null,
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
