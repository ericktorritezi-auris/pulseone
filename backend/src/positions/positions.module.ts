import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards, Injectable, Module } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Audit } from '../common/decorators/audit.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole, AuditAction } from '@prisma/client';
import { IsBoolean, IsString, MinLength } from 'class-validator';

class PositionDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsBoolean()
  isManager: boolean;

  // Cargo agora pertence a uma área (pedido do Erick) — obrigatório em
  // toda criação/edição, igual já acontece com User.areaId.
  @IsString()
  areaId: string;
}

@Injectable()
class PositionsService {
  constructor(private prisma: PrismaService) {}

  findAll(areaId?: string) {
    return this.prisma.position.findMany({
      where: areaId ? { areaId } : undefined,
      include: { area: { select: { name: true } } },
      orderBy: { name: 'asc' },
    });
  }

  create(dto: PositionDto) {
    return this.prisma.position.create({ data: dto });
  }

  update(id: string, dto: PositionDto) {
    return this.prisma.position.update({ where: { id }, data: dto });
  }

  remove(id: string) {
    return this.prisma.position.delete({ where: { id } });
  }
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('positions')
class PositionsController {
  constructor(private positionsService: PositionsService) {}

  // ?areaId=X filtra os cargos por área — usado pelo dropdown de Cargo na
  // tela de Pessoas, reativo à Área escolhida (mesmo padrão que já existe
  // pro dropdown de Gestor Direto).
  @Roles(UserRole.ADMIN, UserRole.GESTOR)
  @Get()
  findAll(@Query('areaId') areaId?: string) {
    return this.positionsService.findAll(areaId);
  }

  @Roles(UserRole.ADMIN)
  @Audit(AuditAction.CADASTRO)
  @Post()
  create(@Body() dto: PositionDto) {
    return this.positionsService.create(dto);
  }

  @Roles(UserRole.ADMIN)
  @Audit(AuditAction.EDICAO)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: PositionDto) {
    return this.positionsService.update(id, dto);
  }

  @Roles(UserRole.ADMIN)
  @Audit(AuditAction.EXCLUSAO)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.positionsService.remove(id);
  }
}

@Module({
  controllers: [PositionsController],
  providers: [PositionsService],
  exports: [PositionsService],
})
export class PositionsModule {}
