import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Injectable,
  Module,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole } from '@prisma/client';
import { IsString } from 'class-validator';

// Frase fixa de confirmação — pedido explícito do Erick: o reset NUNCA
// roda sozinho, nem automaticamente no deploy. Só executa se o admin
// digitar essa frase exata (reforçada também pela tela de Configurações,
// que exige digitar de novo antes de habilitar o botão).
const CONFIRMATION_PHRASE = 'CONFIRMO-APAGAR-TODOS-OS-DADOS-DE-TESTE';

class ResetTestDataDto {
  @IsString()
  confirmationPhrase: string;
}

@Injectable()
class AdminToolsService {
  constructor(private prisma: PrismaService) {}

  /**
   * RESET PRÉ-LANÇAMENTO (Sprint 6, pedido do Erick): apaga TODOS os dados
   * de teste, deixando só o(s) cadastro(s) de ADMIN — sem área/cargo,
   * já que admin não pertence a nenhum departamento — e as 5 perguntas
   * oficiais do PRD (essas não são teste, são fixas do sistema).
   *
   * Ordem de exclusão respeita as dependências de chave estrangeira:
   * sempre filhos antes dos pais. Nunca é chamado automaticamente por
   * nenhum outro fluxo do sistema — só por essa rota, protegida por
   * ADMIN + frase de confirmação exata.
   */
  async resetTestData(confirmationPhrase: string) {
    if (confirmationPhrase !== CONFIRMATION_PHRASE) {
      throw new ForbiddenException('Frase de confirmação incorreta. Nada foi apagado.');
    }

    const counts = {
      pulseAnswer: await this.prisma.pulseAnswer.count(),
      pulseAiAnalysis: await this.prisma.pulseAiAnalysis.count(),
      pulseFeedback: await this.prisma.pulseFeedback.count(),
      pulseScore: await this.prisma.pulseScore.count(),
      pulseReport: await this.prisma.pulseReport.count(),
      pulseCycle: await this.prisma.pulseCycle.count(),
      feedback: await this.prisma.feedback.count(),
      notification: await this.prisma.notification.count(),
      usersRemoved: await this.prisma.user.count({ where: { role: { not: UserRole.ADMIN } } }),
      area: await this.prisma.area.count(),
      position: await this.prisma.position.count(),
    };

    await this.prisma.pulseAnswer.deleteMany({});
    await this.prisma.pulseAiAnalysis.deleteMany({});
    await this.prisma.pulseFeedback.deleteMany({});
    await this.prisma.pulseScore.deleteMany({});
    await this.prisma.pulseReport.deleteMany({});
    await this.prisma.pulseCycle.deleteMany({});
    await this.prisma.feedback.deleteMany({});
    await this.prisma.notification.deleteMany({});
    await this.prisma.emailVerificationToken.deleteMany({});
    await this.prisma.passwordResetToken.deleteMany({});
    await this.prisma.auditLog.deleteMany({});

    // Zera managerId antes de excluir — evita qualquer problema de FK
    // auto-referenciada (gestor apontando pra outro usuário sendo excluído).
    await this.prisma.user.updateMany({ where: { role: { not: UserRole.ADMIN } }, data: { managerId: null } });
    await this.prisma.user.deleteMany({ where: { role: { not: UserRole.ADMIN } } });

    // Reforça a regra: admin nunca pertence a nenhuma área/cargo.
    await this.prisma.user.updateMany({
      where: { role: UserRole.ADMIN },
      data: { areaId: null, positionId: null },
    });

    await this.prisma.area.deleteMany({});
    await this.prisma.position.deleteMany({});

    // PulseQuestion (as 5 perguntas oficiais) NUNCA é apagada aqui — não é
    // dado de teste, é configuração fixa do sistema.

    return {
      reset: true,
      removido: counts,
      mensagem: 'Todos os dados de teste foram removidos. Restam apenas o(s) admin(s) e as perguntas oficiais.',
    };
  }
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin-tools')
class AdminToolsController {
  constructor(private adminToolsService: AdminToolsService) {}

  @Post('reset-test-data')
  resetTestData(@Body() dto: ResetTestDataDto) {
    return this.adminToolsService.resetTestData(dto.confirmationPhrase);
  }
}

@Module({
  controllers: [AdminToolsController],
  providers: [AdminToolsService],
})
export class AdminToolsModule {}
