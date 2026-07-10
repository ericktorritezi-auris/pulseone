import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Audit } from '../common/decorators/audit.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { ResendService } from '../auth/resend.service';
import { EmailModule } from '../email/email.module';
import { UserRole, AuditAction } from '@prisma/client';
import { IsInt, IsString, Max, Min, MinLength } from 'class-validator';

type AuthUser = { id: string; role: UserRole; areaId: string | null };

class CreateFeedbackDto {
  @IsString()
  receiverId: string;

  @IsString()
  @MinLength(1)
  text: string;

  @IsInt()
  @Min(0)
  @Max(10)
  npsScore: number;
}

@Injectable()
class FeedbacksService {
  constructor(
    private prisma: PrismaService,
    private resend: ResendService,
  ) {}

  // Feedback Contínuo (PRD seção 13): pode ser enviado a qualquer momento,
  // para qualquer pessoa ativa da organização — sem trava de área (diferente
  // do Feedback Pulse, que é fechado por área). Decisão confirmada com Erick.
  async create(dto: CreateFeedbackDto, sender: AuthUser) {
    if (dto.receiverId === sender.id) {
      throw new BadRequestException('Não é possível enviar feedback para si mesmo.');
    }

    const receiver = await this.prisma.user.findUnique({ where: { id: dto.receiverId } });
    if (!receiver || !receiver.active) {
      throw new NotFoundException('Destinatário não encontrado ou inativo.');
    }

    const created = await this.prisma.feedback.create({
      data: {
        senderId: sender.id,
        receiverId: dto.receiverId,
        text: dto.text,
        npsScore: dto.npsScore,
      },
    });

    // Notificação real (PRD seção 26) — dispara sempre que alguém recebe feedback.
    await this.prisma.notification.create({
      data: {
        userId: dto.receiverId,
        title: 'Novo feedback recebido',
        message: 'Você recebeu um novo feedback. Acesse "Feedbacks Recebidos" para ver.',
      },
    });

    // E-mail (pedido do Erick, além da notificação in-app acima) —
    // best-effort: uma falha de e-mail nunca pode impedir o feedback de
    // ser registrado, já que o dado principal já foi salvo com sucesso.
    try {
      const senderUser = await this.prisma.user.findUnique({
        where: { id: sender.id },
        select: { fullName: true },
      });
      await this.resend.sendContinuousFeedbackReceived(
        receiver.email,
        receiver.fullName,
        senderUser?.fullName ?? 'um colega',
      );
    } catch (err) {
      console.error(`Falha ao enviar e-mail de feedback recebido para ${receiver.email}:`, err);
    }

    return created;
  }

  async findReceived(userId: string) {
    const items = await this.prisma.feedback.findMany({
      where: { receiverId: userId },
      include: { sender: { select: { fullName: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return items.map((f) => ({
      id: f.id,
      texto: f.text,
      criadoEm: f.createdAt,
      remetente: f.sender.fullName,
    }));
  }

  async findSent(userId: string) {
    const items = await this.prisma.feedback.findMany({
      where: { senderId: userId },
      include: { receiver: { select: { fullName: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return items.map((f) => ({
      id: f.id,
      texto: f.text,
      criadoEm: f.createdAt,
      destinatario: f.receiver.fullName,
    }));
  }

  // Feedback Contínuo é livre entre qualquer pessoa da organização (sem
  // trava de área), então qualquer usuário autenticado precisa enxergar a
  // lista básica de possíveis destinatários — diferente de /users, que é
  // restrito a ADMIN/GESTOR.
  findRecipients(excludeUserId: string) {
    return this.prisma.user.findMany({
      where: { active: true, id: { not: excludeUserId } },
      select: { id: true, fullName: true, area: { select: { name: true } } },
      orderBy: { fullName: 'asc' },
    });
  }
}

@UseGuards(JwtAuthGuard)
@Controller('feedbacks')
class FeedbacksController {
  constructor(private feedbacksService: FeedbacksService) {}

  @Audit(AuditAction.FEEDBACK)
  @Post()
  create(@Body() dto: CreateFeedbackDto, @Req() req: { user: AuthUser }) {
    return this.feedbacksService.create(dto, req.user);
  }

  @Get('received')
  findReceived(@Req() req: { user: AuthUser }) {
    return this.feedbacksService.findReceived(req.user.id);
  }

  @Get('sent')
  findSent(@Req() req: { user: AuthUser }) {
    return this.feedbacksService.findSent(req.user.id);
  }

  @Get('recipients')
  findRecipients(@Req() req: { user: AuthUser }) {
    return this.feedbacksService.findRecipients(req.user.id);
  }
}

@Module({
  imports: [EmailModule],
  controllers: [FeedbacksController],
  providers: [FeedbacksService],
  exports: [FeedbacksService],
})
export class FeedbacksModule {}
