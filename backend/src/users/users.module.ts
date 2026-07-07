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

  /**
   * REGRA DE NEGÓCIO — AUTO-VISIBILIDADE:
   * - Cadastro de ADMIN: só a própria pessoa pode ver/editar — ninguém mais,
   *   nem sequer outro admin.
   * - Cadastro de GESTOR: só o próprio gestor OU o ADMIN podem ver/editar.
   *   Nenhum outro gestor, nem colaborador, tem acesso.
   * - Cadastro de COLABORADOR: ADMIN vê/edita qualquer um; GESTOR vê/edita
   *   só os da própria área.
   */
  private assertCanAccessTarget(target: { id: string; role: UserRole; areaId: string }, requester: AuthUser) {
    const isSelf = target.id === requester.id;

    if (target.role === UserRole.ADMIN) {
      if (!isSelf) {
        throw new ForbiddenException('O cadastro do administrador só pode ser acessado por ele mesmo.');
      }
      return;
    }

    if (target.role === UserRole.GESTOR) {
      if (!isSelf && requester.role !== UserRole.ADMIN) {
        throw new ForbiddenException('Este cadastro só pode ser acessado pelo próprio gestor ou pelo administrador.');
      }
      return;
    }

    // Target é COLABORADOR
    if (requester.role === UserRole.GESTOR && target.areaId !== requester.areaId) {
      throw new ForbiddenException('Você só pode acessar pessoas da sua própria área.');
    }
    // ADMIN acessa qualquer COLABORADOR livremente.
  }

  async findAll(requester: AuthUser) {
    // ADMIN: vê COLABORADOR + GESTOR de todas as áreas, e TAMBÉM o próprio
    // cadastro (mas nunca o de outro ADMIN, se existir mais de um).
    // GESTOR: vê COLABORADOR + o próprio cadastro de GESTOR, só da própria área.
    const where: any =
      requester.role === UserRole.ADMIN
        ? { OR: [{ role: { in: [UserRole.COLABORADOR, UserRole.GESTOR] } }, { id: requester.id }] }
        : { areaId: requester.areaId, role: { in: [UserRole.COLABORADOR, UserRole.GESTOR] } };

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

    this.assertCanAccessTarget(user, requester);

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

    this.assertCanAccessTarget(target, requester);

    if (requester.role === UserRole.GESTOR) {
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

    this.assertCanAccessTarget(target, requester);

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
