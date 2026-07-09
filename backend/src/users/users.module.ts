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
import { UserRole, AuditAction } from '@prisma/client';
import { Audit } from '../common/decorators/audit.decorator';
import { IsArray, IsBoolean, IsEmail, IsOptional, IsString, Matches, MinLength } from 'class-validator';

// Mesmo padrão de senha forte usado em todo o sistema (auth.dto.ts).
const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*[!@#$&*])(?=.*[0-9])(?=.*[a-z]).{8,}$/;

type AuthUser = { id: string; role: UserRole; areaId: string | null };

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

  // Obrigatório em todo cadastro, EXCETO quando asAdmin=true (admin não
  // tem cargo). Validado no service, não dá pra expressar isso só com
  // decorators do class-validator.
  @IsOptional()
  @IsString()
  positionId?: string;

  // Só tem efeito se quem está criando for ADMIN. GESTOR nunca pode criar admin.
  @IsOptional()
  @IsBoolean()
  asAdmin?: boolean;

  // Gestor direto (hierarquia — seção 5.7). Opcional: null/ausente = topo
  // da hierarquia, ninguém acima dentro do sistema.
  @IsOptional()
  @IsString()
  managerId?: string;

  // Áreas ADICIONAIS de atuação, além da área principal (`areaId`) — só
  // faz sentido quando o cargo escolhido é de gestão (pedido do Erick: um
  // gestor pode atuar em mais de uma área). Ignorado se o cargo não for
  // de gestão.
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  managedAreaIds?: string[];

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
  // Áreas adicionais de atuação (pedido do Erick) — só tem efeito se a
  // pessoa for/virar GESTOR. Se enviado, SUBSTITUI a lista inteira (não
  // acumula) — inclui a área principal automaticamente.
  @IsOptional() @IsArray() @IsString({ each: true }) managedAreaIds?: string[];
}

// Redefinição de senha por terceiros (seção 5.19): só o ADMIN pode fazer
// isso, pra qualquer pessoa. Ninguém mais tem essa ação — nem o gestor,
// mesmo podendo editar outros campos da pessoa.
class SetPasswordDto {
  @IsString()
  @MinLength(8)
  @Matches(PASSWORD_REGEX, {
    message: 'A senha deve ter no mínimo 8 caracteres, 1 maiúscula, 1 especial, letras e números.',
  })
  newPassword: string;
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
  /**
   * Deriva o role a partir do cargo, e valida que o cargo escolhido
   * pertence de fato à área escolhida (pedido do Erick — cargo agora é
   * vinculado a uma área). O caminho de "asAdmin" nunca passa por aqui —
   * é tratado como um branch totalmente separado em create(), já que
   * admin não tem área nem cargo.
   */
  private async resolveRoleAndValidateArea(positionId: string, areaId: string): Promise<UserRole> {
    const position = await this.prisma.position.findUniqueOrThrow({ where: { id: positionId } });
    if (position.areaId !== areaId) {
      throw new ForbiddenException('O cargo selecionado não pertence à área escolhida.');
    }
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
      // Gestor sempre tem área (só admin não tem) — guarda defensiva pro TS.
      if (!creator.areaId) {
        throw new ForbiddenException('Seu usuário não está vinculado a nenhuma área.');
      }
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
    areaId: string | null,
    selfId?: string,
  ): Promise<string | null> {
    if (!managerId) return null;

    if (!areaId) {
      throw new ForbiddenException('Só é possível indicar gestor direto para pessoas vinculadas a uma área.');
    }

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
  private assertCanAccessTarget(target: { id: string; role: UserRole; areaId: string | null }, requester: AuthUser) {
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
    // ADMIN vê TODO MUNDO — colaborador, gestor e qualquer outro admin
    // (regra explícita do Erick: admin sempre vê todos os cadastros).
    // GESTOR vê COLABORADOR + o próprio cadastro de GESTOR, só da própria área.
    const where: any =
      requester.role === UserRole.ADMIN
        ? {}
        : { areaId: requester.areaId, role: { in: [UserRole.COLABORADOR, UserRole.GESTOR] } };

    return this.prisma.user.findMany({
      where,
      include: {
        area: true,
        position: true,
        manager: { select: { id: true, fullName: true } },
        managedAreas: { select: { id: true } },
      },
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
        // Gestor pode atuar em mais de uma área (pedido do Erick) — o
        // vínculo que importa aqui é managedAreas, não o areaId único.
        managedAreas: { some: { id: areaId } },
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

    // ADMIN NUNCA É PROMOVIDO, SEMPRE É CRIADO (regra explícita do Erick):
    // esse branch é o ÚNICO jeito de alguém virar admin no sistema — não
    // existe caminho de promoção via update(). Admin não pertence a
    // nenhuma área/cargo, então nem tenta resolver isso aqui.
    if (dto.asAdmin) {
      if (creator.role !== UserRole.ADMIN) {
        throw new ForbiddenException('Apenas o administrador pode criar outro administrador.');
      }
      const passwordHash = await bcrypt.hash(dto.password, 10);
      return this.prisma.user.create({
        data: {
          fullName: dto.fullName,
          email: dto.email,
          phone: dto.phone,
          role: UserRole.ADMIN,
          passwordHash,
        },
      });
    }

    const areaId = this.resolveAreaId(dto.areaId, creator);

    if (!dto.positionId) {
      throw new ForbiddenException('Cargo é obrigatório pra cadastro que não seja de administrador.');
    }
    const role = await this.resolveRoleAndValidateArea(dto.positionId, areaId);
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
        // Gestor sempre atua PELO MENOS na própria área principal — mais
        // as áreas adicionais escolhidas, se houver (pedido do Erick: um
        // gestor pode gerenciar mais de uma área). Colaborador nunca tem
        // managedAreas (não faz sentido pra quem não é gestor).
        ...(role === UserRole.GESTOR
          ? {
              managedAreas: {
                connect: [areaId, ...(dto.managedAreaIds ?? [])]
                  .filter((id, i, arr) => arr.indexOf(id) === i) // remove duplicata
                  .map((id) => ({ id })),
              },
            }
          : {}),
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
    const role = await this.resolveRoleAndValidateArea(dto.positionId, dto.areaId);
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
        // Autocadastro não oferece multi-seleção de área (fica só a área
        // principal escolhida) — se precisar atuar em mais áreas depois,
        // um admin ajusta na edição.
        ...(role === UserRole.GESTOR ? { managedAreas: { connect: [{ id: dto.areaId }] } } : {}),
      },
    });
  }

  // Listas públicas (sem autenticação) pro formulário de autocadastro poder
  // popular os selects de área/cargo/gestor antes da pessoa ter conta.
  findPublicAreas() {
    return this.prisma.area.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } });
  }

  findPublicPositions(areaId: string) {
    return this.prisma.position.findMany({
      where: { areaId },
      select: { id: true, name: true, isManager: true },
      orderBy: { name: 'asc' },
    });
  }

  findPublicManagers(areaId: string) {
    return this.prisma.user.findMany({
      where: { managedAreas: { some: { id: areaId } }, role: UserRole.GESTOR, active: true },
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

    // Trocou a ÁREA mas não mandou um cargo novo junto? Precisa garantir
    // que o cargo ATUAL da pessoa ainda pertence à área nova — senão fica
    // um cargo "órfão" de outra área. Exige escolher um cargo novo junto
    // nesse caso (pedido do Erick).
    if (dto.areaId && dto.areaId !== target.areaId && !dto.positionId) {
      const currentPosition = target.positionId
        ? await this.prisma.position.findUnique({ where: { id: target.positionId } })
        : null;
      if (!currentPosition || currentPosition.areaId !== dto.areaId) {
        throw new ForbiddenException(
          'Ao trocar a área, é preciso escolher um cargo que pertença à área nova.',
        );
      }
    }

    // Se o cargo mudou, o role é recalculado automaticamente (fonte única
    // de verdade) — e valida que o cargo pertence à área EFETIVA da
    // pessoa (a nova, se mudou; senão a que ela já tinha).
    if (dto.positionId) {
      const effectiveAreaId = dto.areaId ?? target.areaId;
      if (!effectiveAreaId) {
        throw new ForbiddenException('Não é possível definir cargo sem uma área vinculada.');
      }
      data.role = await this.resolveRoleAndValidateArea(dto.positionId, effectiveAreaId);
    }

    if ('managerId' in dto) {
      const areaId = dto.areaId ?? target.areaId;
      data.managerId = await this.resolveManagerId(dto.managerId, areaId, id);
    }

    // Áreas adicionais de atuação (pedido do Erick) — só se aplica a quem
    // é/vira GESTOR. "set" substitui a lista inteira, sempre garantindo
    // que a área principal (nova ou atual) está incluída.
    delete data.managedAreaIds;
    const effectiveRole = data.role ?? target.role;
    if (dto.managedAreaIds && effectiveRole === UserRole.GESTOR) {
      const effectiveAreaId = dto.areaId ?? target.areaId;
      const allAreaIds = [effectiveAreaId, ...dto.managedAreaIds].filter(
        (areaId, i, arr): areaId is string => !!areaId && arr.indexOf(areaId) === i,
      );
      data.managedAreas = { set: allAreaIds.map((areaId) => ({ id: areaId })) };
    }

    return this.prisma.user.update({ where: { id }, data });
  }

  async remove(id: string, requester: AuthUser) {
    const target = await this.prisma.user.findUniqueOrThrow({ where: { id } });

    this.assertCanAccessTarget(target, requester);

    // Soft delete — mantém histórico de feedbacks/pulses íntegro
    return this.prisma.user.update({ where: { id }, data: { active: false } });
  }

  /**
   * REGRA DE NEGÓCIO (seção 5.19, pedido do Erick): só o ADMIN pode
   * redefinir a senha de QUALQUER pessoa (inclusive de outro gestor ou de
   * si mesmo). Todo mundo mais só troca a própria senha (fluxo já existente
   * em auth.service.ts changePassword, que exige a senha atual). Aqui não
   * exige senha atual — é uma ação administrativa, autorizada pelo papel,
   * não pelo conhecimento da senha antiga. Força troca no próximo login,
   * já que foi o admin quem escolheu a senha, não o dono da conta.
   */
  async setPasswordByAdmin(id: string, newPassword: string, requester: AuthUser) {
    if (requester.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Só o administrador pode redefinir a senha de outra pessoa.');
    }

    await this.prisma.user.findUniqueOrThrow({ where: { id } });

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({
      where: { id },
      data: { passwordHash, mustChangePwd: true },
    });

    return { changed: true };
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
  @Audit(AuditAction.CADASTRO)
  @Post()
  create(@Body() dto: CreateUserDto, @Req() req: { user: AuthUser }) {
    return this.usersService.create(dto, req.user);
  }

  @Roles(UserRole.ADMIN, UserRole.GESTOR)
  @Audit(AuditAction.EDICAO)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto, @Req() req: { user: AuthUser }) {
    return this.usersService.update(id, dto, req.user);
  }

  @Roles(UserRole.ADMIN, UserRole.GESTOR)
  @Audit(AuditAction.EXCLUSAO)
  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: { user: AuthUser }) {
    return this.usersService.remove(id, req.user);
  }

  // Só ADMIN — nem o gestor tem essa ação, mesmo podendo editar outros
  // campos da pessoa (regra explícita do Erick, seção 5.19).
  @Roles(UserRole.ADMIN)
  @Audit(AuditAction.EDICAO)
  @Patch(':id/password')
  setPassword(@Param('id') id: string, @Body() dto: SetPasswordDto, @Req() req: { user: AuthUser }) {
    return this.usersService.setPasswordByAdmin(id, dto.newPassword, req.user);
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
  findPositions(@Query('areaId') areaId: string) {
    return this.usersService.findPublicPositions(areaId);
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
