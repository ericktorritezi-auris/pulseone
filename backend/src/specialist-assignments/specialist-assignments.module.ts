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
import { AuditAction, UserRole } from '@prisma/client';
import { IsString, MinLength } from 'class-validator';

type AuthUser = { id: string; role: UserRole; areaId: string | null };

class CreateSpecialistAssignmentDto {
  @IsString()
  userId: string;

  @IsString()
  @MinLength(1)
  description: string;
}

class UpdateSpecialistAssignmentDto {
  @IsString()
  @MinLength(1)
  description: string;
}

@Injectable()
class SpecialistAssignmentsService {
  constructor(private prisma: PrismaService) {}

  private readonly include = {
    user: {
      select: {
        id: true,
        fullName: true,
        area: { select: { name: true } },
        position: { select: { name: true } },
      },
    },
  };

  // ADMIN/GESTOR veem tudo (ativo + inativo); COLABORADOR só ativo.
  async findAll(requester: AuthUser) {
    const canManage = requester.role === UserRole.ADMIN || requester.role === UserRole.GESTOR;
    return this.prisma.specialistAssignment.findMany({
      where: canManage ? undefined : { active: true },
      include: this.include,
      orderBy: { createdAt: 'desc' },
    });
  }

  // Todo mundo cadastrado, EXCETO admin (regra explícita do Erick — admin
  // é uma entidade à parte, nunca entra como "especialista" escalável).
  findEligibleUsers() {
    return this.prisma.user.findMany({
      where: { active: true, role: { not: UserRole.ADMIN } },
      select: { id: true, fullName: true },
      orderBy: { fullName: 'asc' },
    });
  }

  async create(dto: CreateSpecialistAssignmentDto) {
    const target = await this.prisma.user.findUniqueOrThrow({ where: { id: dto.userId } });
    if (target.role === UserRole.ADMIN) {
      throw new ForbiddenException('Administrador não pode ser cadastrado como especialista.');
    }
    return this.prisma.specialistAssignment.create({
      data: { userId: dto.userId, description: dto.description },
    });
  }

  update(id: string, dto: UpdateSpecialistAssignmentDto) {
    return this.prisma.specialistAssignment.update({
      where: { id },
      data: { description: dto.description },
    });
  }

  async toggleActive(id: string) {
    const current = await this.prisma.specialistAssignment.findUniqueOrThrow({ where: { id } });
    return this.prisma.specialistAssignment.update({
      where: { id },
      data: { active: !current.active },
    });
  }

  remove(id: string) {
    return this.prisma.specialistAssignment.delete({ where: { id } });
  }
}

@UseGuards(JwtAuthGuard)
@Controller('specialist-assignments')
class SpecialistAssignmentsController {
  constructor(private service: SpecialistAssignmentsService) {}

  @Get()
  findAll(@Req() req: { user: AuthUser }) {
    return this.service.findAll(req.user);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.GESTOR)
  @Get('eligible-users')
  findEligibleUsers() {
    return this.service.findEligibleUsers();
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.GESTOR)
  @Audit(AuditAction.CADASTRO)
  @Post()
  create(@Body() dto: CreateSpecialistAssignmentDto) {
    return this.service.create(dto);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.GESTOR)
  @Audit(AuditAction.EDICAO)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateSpecialistAssignmentDto) {
    return this.service.update(id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.GESTOR)
  @Audit(AuditAction.EDICAO)
  @Patch(':id/toggle-active')
  toggleActive(@Param('id') id: string) {
    return this.service.toggleActive(id);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.GESTOR)
  @Audit(AuditAction.EXCLUSAO)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}

@Module({
  controllers: [SpecialistAssignmentsController],
  providers: [SpecialistAssignmentsService],
})
export class SpecialistAssignmentsModule {}
