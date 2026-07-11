import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Injectable,
  Module,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Audit } from '../common/decorators/audit.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { AuditAction, UserRole } from '@prisma/client';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

type AuthUser = { id: string; role: UserRole; areaId: string | null };

class RespondSystemNpsDto {
  @IsInt()
  @Min(0)
  @Max(10)
  score: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

@Injectable()
export class SystemNpsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Regra de negócio (pedido do Erick): admin nunca participa da pesquisa
   * de NPS do sistema — nem dispara pra si mesmo, nem entra na contagem de
   * "quem falta responder". Só COLABORADOR/GESTOR.
   */
  private async getLatestCampaign() {
    return this.prisma.systemNpsCampaign.findFirst({ orderBy: { createdAt: 'desc' } });
  }

  // Chamado no login (auth.service.ts) — decide se mostra o modal.
  async hasPendingSurvey(userId: string, role: UserRole): Promise<boolean> {
    if (role === UserRole.ADMIN) return false;

    const campaign = await this.getLatestCampaign();
    if (!campaign) return false;

    const participation = await this.prisma.systemNpsParticipation.findUnique({
      where: { userId_campaignId: { userId, campaignId: campaign.id } },
    });
    return !participation;
  }

  async trigger() {
    return this.prisma.systemNpsCampaign.create({ data: {} });
  }

  /**
   * Só "Enviar" chega aqui — "Agora não" nunca chama o backend (pedido do
   * Erick, sem rastro nenhum). Grava a PARTICIPAÇÃO (com o usuário, só pra
   * não perguntar de novo) e a RESPOSTA (sem nenhum vínculo de usuário) em
   * inserções completamente separadas — de propósito, pra nunca dar pra
   * cruzar quem respondeu o quê.
   */
  async respond(userId: string, role: UserRole, dto: RespondSystemNpsDto) {
    if (role === UserRole.ADMIN) {
      throw new ForbiddenException('Administrador não participa da pesquisa de NPS do sistema.');
    }

    const campaign = await this.getLatestCampaign();
    if (!campaign) {
      throw new ForbiddenException('Não há nenhuma pesquisa de NPS ativa no momento.');
    }

    await this.prisma.systemNpsResponse.create({
      data: {
        score: dto.score,
        comment: dto.comment?.trim() || null,
        campaignId: campaign.id,
      },
    });

    await this.prisma.systemNpsParticipation.upsert({
      where: { userId_campaignId: { userId, campaignId: campaign.id } },
      update: {},
      create: { userId, campaignId: campaign.id },
    });

    return { registered: true };
  }

  async getCampaignStatus() {
    const campaign = await this.getLatestCampaign();
    if (!campaign) {
      return { active: false, createdAt: null, totalElegiveis: 0, totalResponderam: 0 };
    }

    const [totalElegiveis, totalResponderam] = await Promise.all([
      this.prisma.user.count({ where: { active: true, role: { not: UserRole.ADMIN } } }),
      this.prisma.systemNpsParticipation.count({ where: { campaignId: campaign.id } }),
    ]);

    return {
      active: true,
      createdAt: campaign.createdAt,
      totalElegiveis,
      totalResponderam,
    };
  }

  async getSummary() {
    const responses = await this.prisma.systemNpsResponse.findMany({
      orderBy: { createdAt: 'desc' },
      select: { id: true, score: true, comment: true, createdAt: true },
    });

    const total = responses.length;
    const promoters = responses.filter((r) => r.score >= 9).length;
    const passives = responses.filter((r) => r.score >= 7 && r.score <= 8).length;
    const detractors = responses.filter((r) => r.score <= 6).length;
    const npsScore = total > 0 ? Math.round(((promoters - detractors) / total) * 100) : 0;

    return {
      total,
      promoters,
      passives,
      detractors,
      npsScore,
      comments: responses
        .filter((r) => r.comment)
        .map((r) => ({ id: r.id, score: r.score, comment: r.comment, createdAt: r.createdAt })),
    };
  }
}

@UseGuards(JwtAuthGuard)
@Controller('system-nps')
class SystemNpsController {
  constructor(private systemNpsService: SystemNpsService) {}

  @Post('respond')
  respond(@Body() dto: RespondSystemNpsDto, @Req() req: { user: AuthUser }) {
    return this.systemNpsService.respond(req.user.id, req.user.role, dto);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Audit(AuditAction.CADASTRO)
  @Post('trigger')
  trigger() {
    return this.systemNpsService.trigger();
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('campaign-status')
  getCampaignStatus() {
    return this.systemNpsService.getCampaignStatus();
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('summary')
  getSummary() {
    return this.systemNpsService.getSummary();
  }
}

@Module({
  controllers: [SystemNpsController],
  providers: [SystemNpsService],
  exports: [SystemNpsService],
})
export class SystemNpsModule {}
