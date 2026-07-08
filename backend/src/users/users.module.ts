import {
  Body,
  Controller,
  ConflictException,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
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

  // Gestor direto (hierarquia — seção 5.7). Opcional: null/ausente = topo
  // da hierarquia, ninguém acima dentro do sistema.
  @IsOptional()
  @IsString()
  managerId?: string;

  // Liberação de e-mail duplicado (seção 5.17) — só usado quando o backend
  // já avisou que esse e-mail existe e a pessoa confirmou a senha MASTER.
  @IsOptional()
  @IsString()
  masterPasswordOverride?: string;

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
  @IsOptional() @IsString() managerId?: string | null;
  @IsOptional() @IsString() masterPasswordOverride?: string;
}

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  /**
   * REGRA DE NEGÓCIO CENTRAL (fonte única de verdade para hierarquia de acesso):
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
   * REGRA DE NEGÓCIO — HIERARQUIA (seção 5.7 do mapeamento técnico):
   * managerId é o gestor direto explícito. Validações:
   * - o gestor indicado precisa existir, estar ativo, ter role=GESTOR e
   *   estar na MESMA área da pessoa sendo cadastrada/editada (a avaliação
   *   é fechada por área — um gestor direto de outra área quebraria isso);
   * - ninguém pode ser gestor direto de si mesmo;
   * - bloqueia o ciclo mais simples (A é gestor de B e B é gestor de A).
   */
  private async resolveManagerId(
    managerId: string | undefined | null,
    areaId: string,
    selfId?: string,
  ): Promise<string | null> {
    if (!managerId) return null;

    if (managerId === selfId) {
      throw new ForbiddenException('Uma pessoa não pode ser gestora direta de si mesma.');
    }

    const manager = await this.prisma.user.findUnique({ where: { id: managerId } });
    if (!manager || !manager.active || manager.role !== UserRole.GESTOR) {
      throw new ForbiddenException('O gestor direto indicado precisa ser uma pessoa ativa com cargo de gestão.');
    }
    if (manager.areaId !== areaId) {
      throw new ForbiddenException('O gestor direto precisa ser da mesma área.');
    }
    if (selfId && manager.managerId === selfId) {
      throw new ForbiddenException('Isso criaria um ciclo de hierarquia (vocês seriam gestores um do outro).');
    }

    return managerId;
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
      include: { area: true, position: true, manager: { select: { id: true, fullName: true } } },
      orderBy: { fullName: 'asc' },
    });
  }

  async findOne(id: string, requester: AuthUser) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { area: true, position: true, manager: { select: { id: true, fullName: true } } },
    });

    if (!user) throw new NotFoundException('Usuário não encontrado.');

    this.assertCanAccessTarget(user, requester);

    return user;
  }

  // Lista de possíveis gestores diretos para o dropdown do formulário —
  // sempre pessoas com role=GESTOR ATIVAS na área informada, excluindo a
  // própria pessoa (quando estiver editando).
  async findPotentialManagers(areaId: string, excludeUserId?: string) {
    return this.prisma.user.findMany({
      where: {
        areaId,
        role: UserRole.GESTOR,
        active: true,
        ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
      },
      select: { id: true, fullName: true },
      orderBy: { fullName: 'asc' },
    });
  }

  /**
   * REGRA DE NEGÓCIO — E-MAIL DUPLICADO COM LIBERAÇÃO POR SENHA MASTER
   * (seção 5.17, pedido do Erick): a mesma pessoa pode legitimamente ter
   * mais de uma conta com o mesmo e-mail (ex: é admin e também gestor de
   * uma área). Por padrão, um e-mail já cadastrado bloqueia o cadastro
   * novo — mas se quem está cadastrando confirmar a senha MASTER do
   * sistema (variável de ambiente MASTER_PASSWORD), o cadastro prossegue
   * normalmente, sem nenhuma inconsistência de arquitetura (e-mail não é
   * mais @unique no banco — seção 5.17 do schema — e o login já sabe
   * escolher a conta certa pela senha).
   */
  private async assertEmailAvailable(email: string, masterPasswordOverride?: string) {
    const existing = await this.prisma.user.findFirst({ where: { email } });
    if (!existing) return;

    const masterPassword = process.env.MASTER_PASSWORD;
    if (!masterPassword) {
      throw new ConflictException(
        'EMAIL_JA_EXISTE: já existe uma conta com esse e-mail, e a senha MASTER não está configurada no servidor.',
      );
    }
    if (masterPasswordOverride !== masterPassword) {
      throw new ConflictException('EMAIL_JA_EXISTE');
    }
    // Senha MASTER confere — segue o cadastro normalmente, mesmo e-mail duplicado.
  }

  async create(dto: CreateUserDto, creator: AuthUser) {
    await this.assertEmailAvailable(dto.email, dto.masterPasswordOverride);

    const areaId = this.resolveAreaId(dto.areaId, creator);
    const role = await this.resolveRole(dto.positionId, creator, dto.asAdmin);
    const managerId = await this.resolveManagerId(dto.managerId, areaId);
    const passwordHash = await bcrypt.hash(dto.password, 10);

    return this.prisma.user.create({
      data: {
        fullName: dto.fullName,
        email: dto.email,
        phone: dto.phone,
        areaId,
        positionId: dto.positionId,
        role,
        managerId,
        passwordHash,
      },
    });
  }

  /**
   * AUTOCADASTRO PÚBLICO (Sprint 6, pedido do Erick): o funcionário se
   * cadastra sozinho, sem precisar de admin/gestor. Ele escolhe livremente
   * a própria área e cargo (que já existem, criados pelo admin) — o "role"
   * continua sendo derivado do cargo (nunca escolhido livremente, e nunca
   * pode virar ADMIN por essa via). O gestor direto é opcional, igual ao
   * cadastro normal.
   */
  async registerSelf(dto: {
    fullName: string;
    email: string;
    phone: string;
    areaId: string;
    positionId: string;
    managerId?: string;
    password: string;
  }) {
    const position = await this.prisma.position.findUniqueOrThrow({ where: { id: dto.positionId } });
    const role = position.isManager ? UserRole.GESTOR : UserRole.COLABORADOR;
    const managerId = await this.resolveManagerId(dto.managerId, dto.areaId);
    const passwordHash = await bcrypt.hash(dto.password, 10);

    return this.prisma.user.create({
      data: {
        fullName: dto.fullName,
        email: dto.email,
        phone: dto.phone,
        areaId: dto.areaId,
        positionId: dto.positionId,
        role,
        managerId,
        passwordHash,
        emailVerified: false,
      },
    });
  }

  // Listas públicas (sem autenticação) pro formulário de autocadastro poder
  // popular os selects de área/cargo/gestor antes da pessoa ter conta.
  findPublicAreas() {
    return this.prisma.area.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } });
  }

  findPublicPositions() {
    return this.prisma.position.findMany({
      select: { id: true, name: true, isManager: true },
      orderBy: { name: 'asc' },
    });
  }

  findPublicManagers(areaId: string) {
    return this.prisma.user.findMany({
      where: { areaId, role: UserRole.GESTOR, active: true },
      select: { id: true, fullName: true },
      orderBy: { fullName: 'asc' },
    });
  }

  async update(id: string, dto: UpdateUserDto, requester: AuthUser) {
    const target = await this.prisma.user.findUniqueOrThrow({ where: { id } });

    this.assertCanAccessTarget(target, requester);

    if (dto.email && dto.email !== target.email) {
      await this.assertEmailAvailable(dto.email, dto.masterPasswordOverride);
    }
    delete dto.masterPasswordOverride;

    if (requester.role === UserRole.GESTOR) {
      // Gestor nunca move alguém para outra área nem promove a admin por aqui.
      delete dto.areaId;
    }

    const data: any = { ...dto };

    // Se o cargo mudou, o role é recalculado automaticamente (fonte única de verdade).
    if (dto.positionId) {
      data.role = await this.resolveRole(dto.positionId, requester, false);
    }

    if ('managerId' in dto) {
      const areaId = dto.areaId ?? target.areaId;
      data.managerId = await this.resolveManagerId(dto.managerId, areaId, id);
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

  // Precisa vir ANTES de ':id' — senão o Nest trataria "managers" como um id.
  @Roles(UserRole.ADMIN, UserRole.GESTOR)
  @Get('managers')
  findPotentialManagers(@Query('areaId') areaId: string, @Query('excludeUserId') excludeUserId?: string) {
    return this.usersService.findPotentialManagers(areaId, excludeUserId);
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

// Rotas públicas (sem autenticação) — só leitura, só o necessário pro
// formulário de autocadastro popular área/cargo/gestor antes de logar.
@Controller('public')
class PublicUsersController {
  constructor(private usersService: UsersService) {}

  @Get('areas')
  findAreas() {
    return this.usersService.findPublicAreas();
  }

  @Get('positions')
  findPositions() {
    return this.usersService.findPublicPositions();
  }

  @Get('managers')
  findManagers(@Query('areaId') areaId: string) {
    return this.usersService.findPublicManagers(areaId);
  }
}

@Module({
  controllers: [UsersController, PublicUsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
