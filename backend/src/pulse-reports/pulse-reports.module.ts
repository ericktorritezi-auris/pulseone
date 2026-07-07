import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { PulseEvaluationStatus, PulseEvaluationType, PulseReportStatus, UserRole } from '@prisma/client';
import { IsOptional, IsString, MinLength } from 'class-validator';
import { AnthropicModule } from '../anthropic/anthropic.module';
import { AnthropicService } from '../anthropic/anthropic.service';

type AuthUser = { id: string; role: UserRole; areaId: string };

class SetOpinionDto {
  @IsString()
  @MinLength(1)
  opinion: string;
}

class FinalizeDto {
  @IsOptional()
  @IsString()
  opinion?: string;
}

@Injectable()
class PulseReportsService {
  constructor(
    private prisma: PrismaService,
    private anthropic: AnthropicService,
  ) {}

  /**
   * REGRA DE VISIBILIDADE (seção 5.6): colaborador só vê o PRÓPRIO relatório,
   * e só depois de FINALIZADO. Gestor vê os relatórios dos seus liderados
   * DIRETOS (managerId aponta pra ele — seção 5.7), em qualquer status,
   * porque precisa consolidar antes de finalizar. Admin vê tudo, sempre.
   */
  private async assertCanAccessReport(
    report: { ownerId: string; status: PulseReportStatus; owner: { managerId: string | null } },
    requester: AuthUser,
  ) {
    if (requester.role === UserRole.ADMIN) return;

    const isOwner = report.ownerId === requester.id;

    if (requester.role === UserRole.GESTOR) {
      const isDirectReport = report.owner.managerId === requester.id;
      if (isOwner || isDirectReport) return;
      throw new ForbiddenException('Você só pode acessar relatórios dos seus liderados diretos.');
    }

    // COLABORADOR
    if (isOwner && report.status === PulseReportStatus.FINALIZADO) return;
    throw new ForbiddenException(
      isOwner
        ? 'Seu relatório ainda não foi finalizado pelo gestor.'
        : 'Você só pode acessar o próprio relatório.',
    );
  }

  // Relatórios dos liderados diretos do gestor logado — é a tela de consolidação.
  async findForManager(requesterId: string) {
    return this.prisma.pulseReport.findMany({
      where: { owner: { managerId: requesterId } },
      include: {
        owner: { select: { id: true, fullName: true } },
        cycle: { select: { label: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findAllForAdmin() {
    return this.prisma.pulseReport.findMany({
      include: {
        owner: { select: { id: true, fullName: true } },
        cycle: { select: { label: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Meus próprios relatórios, de qualquer papel — usado pela tela de
  // Histórico. Mostra também os ainda não finalizados (com status visível),
  // mas o detalhe completo (findOne) só libera de verdade quando FINALIZADO.
  async findMine(requesterId: string) {
    return this.prisma.pulseReport.findMany({
      where: { ownerId: requesterId },
      include: { cycle: { select: { label: true, status: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, requester: AuthUser) {
    const report = await this.prisma.pulseReport.findUnique({
      where: { id },
      include: {
        owner: { select: { id: true, fullName: true, managerId: true, areaId: true, area: true, position: true } },
        cycle: { select: { label: true, status: true } },
        aiAnalysis: true,
      },
    });

    if (!report) throw new NotFoundException('Relatório não encontrado.');
    await this.assertCanAccessReport(report, requester);

    const score = await this.prisma.pulseScore.findUnique({
      where: { cycleId_userId: { cycleId: report.cycleId, userId: report.ownerId } },
    });

    const feedbacks = await this.prisma.pulseFeedback.findMany({
      where: { cycleId: report.cycleId, targetId: report.ownerId, status: PulseEvaluationStatus.FINALIZADO },
      include: { evaluator: { select: { fullName: true } } },
      orderBy: { createdAt: 'asc' },
    });

    // REGRA DE ANONIMATO (PRD seção 19): quem está vendo o PRÓPRIO relatório
    // (o dono) vê colegas como "Colega 1/2/3" e liderados como "Liderado 1/2/3"
    // — só o gestor direto aparece com nome real. Gestor/Admin veem todo
    // mundo com nome real (precisam pra consolidar de verdade).
    const viewingAsOwner = requester.id === report.ownerId && requester.role !== UserRole.ADMIN;

    let colegaCount = 0;
    let liderdadoCount = 0;

    const comentarios = feedbacks.map((fb) => {
      let autor: string;

      if (fb.type === PulseEvaluationType.AUTOAVALIACAO) {
        autor = 'Autoavaliação';
      } else if (fb.type === PulseEvaluationType.AVALIACAO_EQUIPE) {
        // Alguém acima avaliando o dono — sempre nome real (é o gestor direto)
        autor = fb.evaluator.fullName;
      } else if (fb.type === PulseEvaluationType.AVALIACAO_GESTOR) {
        // Um liderado avaliando o dono (que é gestor) — anonimizado pro próprio dono
        autor = viewingAsOwner ? `Liderado ${++liderdadoCount}` : fb.evaluator.fullName;
      } else {
        // COLEGA
        autor = viewingAsOwner ? `Colega ${++colegaCount}` : fb.evaluator.fullName;
      }

      return { tipo: fb.type, autor, texto: fb.comment };
    });

    return {
      id: report.id,
      status: report.status,
      managerFinalOpinion: report.managerFinalOpinion,
      finalizedAt: report.finalizedAt,
      owner: {
        id: report.owner.id,
        fullName: report.owner.fullName,
        areaName: report.owner.area.name,
        positionName: report.owner.position.name,
      },
      cycle: report.cycle,
      score,
      aiAnalysis: report.aiAnalysis,
      comentarios,
    };
  }

  async generateAiAnalysis(id: string, requester: AuthUser) {
    const report = await this.getReportForAction(id, requester);

    const score = await this.prisma.pulseScore.findUnique({
      where: { cycleId_userId: { cycleId: report.cycleId, userId: report.ownerId } },
    });
    if (!score) {
      throw new BadRequestException('O ciclo ainda não foi consolidado — não há score calculado pra essa pessoa.');
    }

    const feedbacks = await this.prisma.pulseFeedback.findMany({
      where: { cycleId: report.cycleId, targetId: report.ownerId, status: PulseEvaluationStatus.FINALIZADO },
    });

    const selfFeedback = feedbacks.find((f) => f.type === PulseEvaluationType.AUTOAVALIACAO);
    const receivedComments = feedbacks
      .filter((f) => f.type !== PulseEvaluationType.AUTOAVALIACAO && f.comment)
      .map((f) => f.comment as string);

    const result = await this.anthropic.generateAnalysis({
      personName: report.owner.fullName,
      areaName: report.owner.area.name,
      positionName: report.owner.position.name,
      finalScore: score.finalScore,
      teamScore: score.teamScore,
      managerScore: score.managerScore,
      selfScore: score.selfScore,
      npsScore: score.npsScore,
      scoreBand: score.scoreBand,
      receivedComments,
      selfComment: selfFeedback?.comment ?? null,
    });

    const existing = await this.prisma.pulseAiAnalysis.findUnique({ where: { reportId: id } });

    const aiAnalysis = await this.prisma.pulseAiAnalysis.upsert({
      where: { reportId: id },
      create: {
        reportId: id,
        strengths: result.strengths,
        improvements: result.improvements,
        trends: result.trends,
        summary: result.summary,
        suggestedOpinion: result.suggestedOpinion,
        model: process.env.ANTHROPIC_MODEL ?? 'não configurado',
      },
      update: {
        strengths: result.strengths,
        improvements: result.improvements,
        trends: result.trends,
        summary: result.summary,
        suggestedOpinion: result.suggestedOpinion,
        model: process.env.ANTHROPIC_MODEL ?? 'não configurado',
        regenCount: (existing?.regenCount ?? 0) + 1,
      },
    });

    if (report.status === PulseReportStatus.AGUARDANDO_IA) {
      await this.prisma.pulseReport.update({
        where: { id },
        data: { status: PulseReportStatus.AGUARDANDO_PARECER },
      });
    }

    return aiAnalysis;
  }

  async setOpinion(id: string, opinion: string, requester: AuthUser) {
    const report = await this.getReportForAction(id, requester);

    if (report.status === PulseReportStatus.FINALIZADO) {
      throw new ForbiddenException('Este relatório já foi finalizado e não pode mais ser editado.');
    }

    return this.prisma.pulseReport.update({
      where: { id },
      data: { managerFinalOpinion: opinion },
    });
  }

  async finalize(id: string, opinion: string | undefined, requester: AuthUser) {
    let report = await this.getReportForAction(id, requester);

    // Segunda camada de segurança: se o parecer vier junto nesta chamada
    // (ex: o frontend salva e finaliza em sequência), grava antes de checar
    // — assim não depende só de um clique anterior em "Salvar rascunho".
    if (opinion && opinion.trim()) {
      await this.prisma.pulseReport.update({ where: { id }, data: { managerFinalOpinion: opinion } });
      report = await this.getReportForAction(id, requester);
    }

    if (!report.managerFinalOpinion) {
      throw new BadRequestException('É preciso escrever o parecer final antes de finalizar.');
    }
    if (report.status === PulseReportStatus.FINALIZADO) {
      throw new ForbiddenException('Este relatório já está finalizado.');
    }

    return this.prisma.pulseReport.update({
      where: { id },
      data: {
        status: PulseReportStatus.FINALIZADO,
        finalizedById: requester.id,
        finalizedAt: new Date(),
      },
    });
  }

  // Helper: busca o relatório e garante que quem está agindo (gerar IA,
  // escrever parecer, finalizar) é o gestor direto do dono ou o admin —
  // nunca o próprio dono, mesmo que ele tecnicamente "acesse" via assertCanAccessReport.
  private async getReportForAction(id: string, requester: AuthUser) {
    const report = await this.prisma.pulseReport.findUnique({
      where: { id },
      include: { owner: { select: { id: true, fullName: true, managerId: true, areaId: true, area: true, position: true } } },
    });

    if (!report) throw new NotFoundException('Relatório não encontrado.');

    if (requester.role === UserRole.ADMIN) return report;

    if (requester.role === UserRole.GESTOR && report.owner.managerId === requester.id) {
      return report;
    }

    throw new ForbiddenException('Só o gestor direto desta pessoa (ou o admin) pode consolidar este relatório.');
  }
}

@UseGuards(JwtAuthGuard)
@Controller('pulse-reports')
class PulseReportsController {
  constructor(private pulseReportsService: PulseReportsService) {}

  @UseGuards(RolesGuard)
  @Roles(UserRole.GESTOR)
  @Get()
  findForManager(@Req() req: { user: AuthUser }) {
    return this.pulseReportsService.findForManager(req.user.id);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('all')
  findAllForAdmin() {
    return this.pulseReportsService.findAllForAdmin();
  }

  @Get('mine')
  findMine(@Req() req: { user: AuthUser }) {
    return this.pulseReportsService.findMine(req.user.id);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: { user: AuthUser }) {
    return this.pulseReportsService.findOne(id, req.user);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.GESTOR)
  @Patch(':id/ai-analysis')
  generateAiAnalysis(@Param('id') id: string, @Req() req: { user: AuthUser }) {
    return this.pulseReportsService.generateAiAnalysis(id, req.user);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.GESTOR)
  @Patch(':id/opinion')
  setOpinion(@Param('id') id: string, @Body() dto: SetOpinionDto, @Req() req: { user: AuthUser }) {
    return this.pulseReportsService.setOpinion(id, dto.opinion, req.user);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.GESTOR)
  @Patch(':id/finalize')
  finalize(@Param('id') id: string, @Body() dto: FinalizeDto, @Req() req: { user: AuthUser }) {
    return this.pulseReportsService.finalize(id, dto?.opinion, req.user);
  }
}

@Module({
  imports: [AnthropicModule],
  controllers: [PulseReportsController],
  providers: [PulseReportsService],
})
export class PulseReportsModule {}
