import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Injectable,
  Module,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Audit } from '../common/decorators/audit.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { ResendService } from '../auth/resend.service';
import { EmailModule } from '../email/email.module';
import { AuditAction, UserRole } from '@prisma/client';
import { IsString, MinLength } from 'class-validator';

type AuthUser = { id: string; role: UserRole; areaId: string | null };

class AnnouncementDto {
  @IsString()
  @MinLength(1)
  text: string;
}

@Injectable()
class AnnouncementsService {
  constructor(
    private prisma: PrismaService,
    private resend: ResendService,
  ) {}

  // Gerenciamento (ADMIN/GESTOR): todos, ativos e inativos — "inativo" fica
  // guardado pra consulta futura, não é apagado (pedido do Erick).
  findAll() {
    return this.prisma.announcement.findMany({
      include: { createdBy: { select: { fullName: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Faixa do Dashboard: todo mundo vê, só os ATIVOS, sem precisar de dados
  // extras (é só o texto).
  findActive() {
    return this.prisma.announcement.findMany({
      where: { active: true },
      select: { id: true, text: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(dto: AnnouncementDto, creator: AuthUser) {
    const created = await this.prisma.announcement.create({
      data: { text: dto.text, createdById: creator.id },
    });

    // E-mail só pra COLABORADOR — nunca admin, nunca gestor (regra
    // explícita do Erick: quem cria não precisa ser avisado do que criou).
    // Best-effort: uma falha de e-mail nunca impede o comunicado de ser
    // publicado, já que ele já foi salvo com sucesso.
    try {
      const colaboradores = await this.prisma.user.findMany({
        where: { active: true, role: UserRole.COLABORADOR },
        select: { email: true, fullName: true },
      });
      for (const colaborador of colaboradores) {
        await this.resend.sendAnnouncementPublished(colaborador.email, colaborador.fullName);
      }
    } catch (err) {
      console.error('Falha ao enviar e-mails de comunicado publicado:', err);
    }

    return created;
  }

  update(id: string, dto: AnnouncementDto) {
    return this.prisma.announcement.update({ where: { id }, data: { text: dto.text } });
  }

  async toggleActive(id: string) {
    const current = await this.prisma.announcement.findUniqueOrThrow({ where: { id } });
    return this.prisma.announcement.update({ where: { id }, data: { active: !current.active } });
  }

  remove(id: string) {
    return this.prisma.announcement.delete({ where: { id } });
  }
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.GESTOR)
@Controller('announcements')
class AnnouncementsController {
  constructor(private service: AnnouncementsService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Audit(AuditAction.CADASTRO)
  @Post()
  create(@Body() dto: AnnouncementDto, @Req() req: { user: AuthUser }) {
    return this.service.create(dto, req.user);
  }

  @Audit(AuditAction.EDICAO)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: AnnouncementDto) {
    return this.service.update(id, dto);
  }

  @Audit(AuditAction.EDICAO)
  @Patch(':id/toggle-active')
  toggleActive(@Param('id') id: string) {
    return this.service.toggleActive(id);
  }

  @Audit(AuditAction.EXCLUSAO)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}

// Rota separada, sem restrição de role — a FAIXA do dashboard é vista por
// todo mundo (colaborador, gestor, admin), só o gerenciamento é restrito.
@UseGuards(JwtAuthGuard)
@Controller('announcements-active')
class AnnouncementsActiveController {
  constructor(private service: AnnouncementsService) {}

  @Get()
  findActive() {
    return this.service.findActive();
  }
}

@Module({
  imports: [EmailModule],
  controllers: [AnnouncementsController, AnnouncementsActiveController],
  providers: [AnnouncementsService],
})
export class AnnouncementsModule {}
