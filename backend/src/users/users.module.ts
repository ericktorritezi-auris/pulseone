import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
  Injectable,
  Module,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole } from '@prisma/client';
import { IsBoolean, IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

type AuthUser = { id: string; role: UserRole; areaId: string };

class CreateUserDto {
  @IsString()
  fullName: string;

  @IsEmail()
  email: string;

  @IsString()
  phone: string;

  // Obrigatório apenas quando quem cria é ADMIN. Se for GESTOR, este campo
  // é IGNORADO pelo service — a área é sempre a do próprio gestor logado.
  @IsOptional()
  @IsString()
  areaId?: string;

  @IsString()
  positionId: string;

  // Só tem efeito se quem está criando for ADMIN. GESTOR nunca pode criar admin.
  @IsOptional()
  @IsBoolean()
  asAdmin?: boolean;

  @IsString()
  @MinLength(8)
  password: string;
}

class UpdateUserDto {
  @IsOptional() @IsString() fullName?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() areaId?: string;
  @IsOptional() @IsString() positionId?: string;
}

@Injectable()
class UsersService {
  constructor(private prisma: PrismaService) {}

  /**
   * REGRA DE NEGÓCIO CENTRAL (fonte única de verdade para hierarquia):
   * o "role" de um usuário nunca é escolhido livremente no formulário.
   * - ADMIN: só existe se quem está criando já é ADMIN e marcou asAdmin=true.
   * - GESTOR: automático quando o cargo (Position.isManager) é true.
   * - COLABORADOR: automático quando o cargo não é de gestão.
   * Isso elimina a possibilidade de inconsistência entre "cargo de gestor"
   * e o papel de acesso da pessoa no sistema.
   */
  private async resolveRole(positionId: string, creator: AuthUser, asAdmin?: boolean): Promise<UserRole> {
    if (asAdmin) {
      if (creator.role !== UserRole.ADMIN) {
        throw new ForbiddenException('Apenas o administrador pode criar outro administrador.');
      }
      return UserRole.ADMIN;
    }

    const position = await this.prisma.position.findUniqueOrThrow({ where: { id: positionId } });
    return position.isManager ? UserRole.GESTOR : UserRole.COLABORADOR;
  }

  /**
   * REGRA DE NEGÓCIO: feedback e cadastro são fechados por área.
   * Um GESTOR só enxerga e só cadastra pessoas da própria área — mesmo que
   * tente forçar outro areaId via requisição direta, o backend ignora e
   * substitui pela área do próprio gestor logado.
   */
  private resolveAreaId(dtoAreaId: string | undefined, creator: AuthUser): string {
    if (creator.role === UserRole.GESTOR) {
      return creator.areaId;
    }
    if (!dtoAreaId) {
      throw new ForbiddenException('Área é obrigatória para cadastro feito pelo administrador.');
    }
    return dtoAreaId;
  }

  async findAll(requester: AuthUser) {
    const where = requester.role === UserRole.GESTOR ? { areaId: requester.areaId } : {};
    return this.prisma.user.findMany({
      where,
      include: { area: true, position: true },
      orderBy: { fullName: 'asc' },
    });
  }

  async findOne(id: string, requester: AuthUser) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { area: true, position: true },
    });

    if (!user) throw new NotFoundException('Usuário não encontrado.');

    if (requester.role === UserRole.GESTOR && user.areaId !== requester.areaId) {
      throw new ForbiddenException('Você só pode visualizar pessoas da sua própria área.');
    }

    return user;
  }

  async create(dto: CreateUserDto, creator: AuthUser) {
    const areaId = this.resolveAreaId(dto.areaId, creator);
    const role = await this.resolveRole(dto.positionId, creator, dto.asAdmin);
    const passwordHash = await bcrypt.hash(dto.password, 10);

    return this.prisma.user.create({
      data: {
        fullName: dto.fullName,
        email: dto.email,
        phone: dto.phone,
        areaId,
        positionId: dto.positionId,
        role,
        passwordHash,
      },
    });
  }

  async update(id: string, dto: UpdateUserDto, requester: AuthUser) {
    const target = await this.prisma.user.findUniqueOrThrow({ where: { id } });

    if (requester.role === UserRole.GESTOR) {
      if (target.areaId !== requester.areaId) {
        throw new ForbiddenException('Você só pode editar pessoas da sua própria área.');
      }
      // Gestor nunca move alguém para outra área nem promove a admin por aqui.
      delete dto.areaId;
    }

    // Se o cargo mudou, o role é recalculado automaticamente (fonte única de verdade).
    const data: any = { ...dto };
    if (dto.positionId) {
      data.role = await this.resolveRole(dto.positionId, requester, false);
    }

    return this.prisma.user.update({ where: { id }, data });
  }

  async remove(id: string, requester: AuthUser) {
    const target = await this.prisma.user.findUniqueOrThrow({ where: { id } });

    if (requester.role === UserRole.GESTOR && target.areaId !== requester.areaId) {
      throw new ForbiddenException('Você só pode inativar pessoas da sua própria área.');
    }

    // Soft delete — mantém histórico de feedbacks/pulses íntegro
    return this.prisma.user.update({ where: { id }, data: { active: false } });
  }
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
class UsersController {
  constructor(private usersService: UsersService) {}

  @Roles(UserRole.ADMIN, UserRole.GESTOR)
  @Get()
  findAll(@Req() req: { user: AuthUser }) {
    return this.usersService.findAll(req.user);
  }

  @Roles(UserRole.ADMIN, UserRole.GESTOR)
  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: { user: AuthUser }) {
    return this.usersService.findOne(id, req.user);
  }

  @Roles(UserRole.ADMIN, UserRole.GESTOR)
  @Post()
  create(@Body() dto: CreateUserDto, @Req() req: { user: AuthUser }) {
    return this.usersService.create(dto, req.user);
  }

  @Roles(UserRole.ADMIN, UserRole.GESTOR)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto, @Req() req: { user: AuthUser }) {
    return this.usersService.update(id, dto, req.user);
  }

  @Roles(UserRole.ADMIN, UserRole.GESTOR)
  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: { user: AuthUser }) {
    return this.usersService.remove(id, req.user);
  }
}

@Module({
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
