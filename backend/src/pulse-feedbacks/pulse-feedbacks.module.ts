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
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { PulseCycleStatus, PulseEvaluationStatus, UserRole } from '@prisma/client';
import { ArrayMinSize, IsArray, IsInt, IsString, Max, Min, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

type AuthUser = { id: string; role: UserRole; areaId: string | null };

class AnswerDto {
  @IsString()
  questionId: string;

  @IsInt()
  @Min(0)
  @Max(10)
  value: number;
}

class SubmitAnswersDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AnswerDto)
  answers: AnswerDto[];

  // PRD seção 17: feedback textual obrigatório, mínimo 200 caracteres.
  @IsString()
  @MinLength(200, { message: 'O comentário precisa ter no mínimo 200 caracteres.' })
  comment: string;
}

@Injectable()
class PulseFeedbacksService {
  constructor(private prisma: PrismaService) {}

  findPending(userId: string) {
    return this.prisma.pulseFeedback.findMany({
      where: { evaluatorId: userId, status: PulseEvaluationStatus.PENDENTE },
      include: {
        target: { select: { fullName: true } },
        cycle: { select: { label: true, status: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  findFinished(userId: string) {
    return this.prisma.pulseFeedback.findMany({
      where: { evaluatorId: userId, status: PulseEvaluationStatus.FINALIZADO },
      include: {
        target: { select: { fullName: true } },
        cycle: { select: { label: true, status: true } },
      },
      orderBy: { finishedAt: 'desc' },
    });
  }

  // Lista unificada (pendentes + finalizadas) para a tela "Minhas Avaliações":
  // enquanto o ciclo estiver ABERTO, tudo que já foi respondido pode ser
  // reaberto e editado. Depois de ENCERRADO, vira somente leitura.
  async findMine(userId: string) {
    const items = await this.prisma.pulseFeedback.findMany({
      where: { evaluatorId: userId },
      include: {
        target: { select: { fullName: true } },
        cycle: { select: { label: true, status: true } },
      },
      orderBy: [{ createdAt: 'asc' }],
    });

    return items.map((f) => ({
      id: f.id,
      cycleId: f.cycleId,
      type: f.type,
      status: f.status,
      target: f.target,
      cycle: f.cycle,
      editable: f.cycle.status === PulseCycleStatus.ABERTO,
    }));
  }

  async findOne(id: string, requester: AuthUser) {
    const feedback = await this.prisma.pulseFeedback.findUnique({
      where: { id },
      include: {
        target: { select: { fullName: true } },
        cycle: { select: { label: true, status: true } },
        answers: true,
      },
    });

    if (!feedback) throw new NotFoundException('Avaliação não encontrada.');
    if (feedback.evaluatorId !== requester.id) {
      throw new ForbiddenException('Você só pode acessar as próprias avaliações a fazer.');
    }

    const questions = await this.prisma.pulseQuestion.findMany({
      where: { active: true },
      orderBy: { order: 'asc' },
    });

    return { ...feedback, questions, editable: feedback.cycle.status === PulseCycleStatus.ABERTO };
  }

  async submitAnswers(id: string, dto: SubmitAnswersDto, requester: AuthUser) {
    const feedback = await this.prisma.pulseFeedback.findUnique({ where: { id } });
    if (!feedback) throw new NotFoundException('Avaliação não encontrada.');

    if (feedback.evaluatorId !== requester.id) {
      throw new ForbiddenException('Você só pode responder as próprias avaliações.');
    }

    // Trava de segurança independente da geração automática (seção 5.1):
    // nunca permite uma avaliação entre pessoas de áreas diferentes.
    const [evaluator, target] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: feedback.evaluatorId } }),
      this.prisma.user.findUniqueOrThrow({ where: { id: feedback.targetId } }),
    ]);
    if (evaluator.areaId !== target.areaId) {
      throw new ForbiddenException('Avaliações só podem ocorrer entre pessoas da mesma área.');
    }

    const cycle = await this.prisma.pulseCycle.findUniqueOrThrow({ where: { id: feedback.cycleId } });
    if (cycle.status !== PulseCycleStatus.ABERTO) {
      throw new BadRequestException('Este ciclo não está mais aberto para respostas.');
    }

    const questionIds = new Set((await this.prisma.pulseQuestion.findMany({ where: { active: true } })).map((q) => q.id));
    for (const answer of dto.answers) {
      if (!questionIds.has(answer.questionId)) {
        throw new BadRequestException('Pergunta inválida no envio.');
      }
    }

    await this.prisma.$transaction([
      ...dto.answers.map((a) =>
        this.prisma.pulseAnswer.upsert({
          where: { pulseFeedbackId_questionId: { pulseFeedbackId: id, questionId: a.questionId } },
          create: { pulseFeedbackId: id, questionId: a.questionId, value: a.value },
          update: { value: a.value },
        }),
      ),
      this.prisma.pulseFeedback.update({
        where: { id },
        data: { comment: dto.comment, status: PulseEvaluationStatus.FINALIZADO, finishedAt: new Date() },
      }),
    ]);

    return { finalizado: true };
  }
}

@UseGuards(JwtAuthGuard)
@Controller('pulse-feedbacks')
class PulseFeedbacksController {
  constructor(private pulseFeedbacksService: PulseFeedbacksService) {}

  @Get('pending')
  findPending(@Req() req: { user: AuthUser }) {
    return this.pulseFeedbacksService.findPending(req.user.id);
  }

  @Get('finished')
  findFinished(@Req() req: { user: AuthUser }) {
    return this.pulseFeedbacksService.findFinished(req.user.id);
  }

  @Get('mine')
  findMine(@Req() req: { user: AuthUser }) {
    return this.pulseFeedbacksService.findMine(req.user.id);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: { user: AuthUser }) {
    return this.pulseFeedbacksService.findOne(id, req.user);
  }

  @Post(':id/answers')
  submitAnswers(@Param('id') id: string, @Body() dto: SubmitAnswersDto, @Req() req: { user: AuthUser }) {
    return this.pulseFeedbacksService.submitAnswers(id, dto, req.user);
  }
}

@Module({
  controllers: [PulseFeedbacksController],
  providers: [PulseFeedbacksService],
})
export class PulseFeedbacksModule {}
