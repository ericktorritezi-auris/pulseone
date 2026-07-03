import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole } from '@prisma/client';
import { IsString, MinLength } from 'class-validator';
import { Module } from '@nestjs/common';

class AreaDto {
  @IsString()
  @MinLength(2)
  name: string;
}

@Injectable()
class AreasService {
  constructor(private prisma: PrismaService) {}
  findAll() {
    return this.prisma.area.findMany({ orderBy: { name: 'asc' } });
  }
  create(dto: AreaDto) {
    return this.prisma.area.create({ data: dto });
  }
  update(id: string, dto: AreaDto) {
    return this.prisma.area.update({ where: { id }, data: dto });
  }
  remove(id: string) {
    return this.prisma.area.delete({ where: { id } });
  }
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('areas')
class AreasController {
  constructor(private areasService: AreasService) {}

  @Get()
  findAll() {
    return this.areasService.findAll();
  }

  @Post()
  create(@Body() dto: AreaDto) {
    return this.areasService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: AreaDto) {
    return this.areasService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.areasService.remove(id);
  }
}

@Module({
  controllers: [AreasController],
  providers: [AreasService],
  exports: [AreasService],
})
export class AreasModule {}
