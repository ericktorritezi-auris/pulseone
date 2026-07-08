import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  // Áreas
  const marketing = await prisma.area.upsert({
    where: { name: 'Marketing' },
    update: {},
    create: { name: 'Marketing' },
  });

  // Cargos — ao menos um isManager=true por área para validar a
  // resolução dinâmica de gestor (Area + Position.isManager)
  const gerenteMarketing = await prisma.position.upsert({
    where: { name: 'Gerente de Marketing' },
    update: {},
    create: { name: 'Gerente de Marketing', isManager: true },
  });

  const analistaMarketing = await prisma.position.upsert({
    where: { name: 'Analista de Marketing' },
    update: {},
    create: { name: 'Analista de Marketing', isManager: false },
  });

  // Admin — seed obrigatório com troca de senha no 1º login. O admin NÃO
  // pertence a nenhuma área/cargo (é uma entidade do sistema, não um
  // colaborador da organização) — pedido explícito do Erick.
  //
  // Não dá mais pra usar upsert({ where: { email } }) — o e-mail deixou de
  // ser único no banco (seção 5.17: mesma pessoa pode ter mais de uma conta
  // com o mesmo e-mail, ex: admin e gestor). Por isso o Prisma exige "id"
  // (ou outro campo @unique) pra upsert. Aqui fazemos manualmente: procura
  // por e-mail + role=ADMIN (combinação que identifica bem o admin seed) e
  // decide entre criar ou atualizar.
  const passwordHash = await bcrypt.hash('Acesso@123', 10);

  const existingAdmin = await prisma.user.findFirst({
    where: { email: 'admin@pulseone.app.br', role: UserRole.ADMIN },
  });

  if (existingAdmin) {
    await prisma.user.update({
      where: { id: existingAdmin.id },
      data: { areaId: null, positionId: null },
    });
  } else {
    await prisma.user.create({
      data: {
        fullName: 'Administrador PulseOne',
        email: 'admin@pulseone.app.br',
        emailVerified: true,
        phone: '(00) 00000-0000',
        passwordHash,
        mustChangePwd: true,
        role: UserRole.ADMIN,
      },
    });
  }

  // 5 perguntas oficiais do PRD (seção 17)
  const questions = [
    {
      order: 1,
      dimension: 'Colaboração',
      text: 'Esta pessoa contribui positivamente para o trabalho em equipe e para o sucesso coletivo?',
      isNps: false,
    },
    {
      order: 2,
      dimension: 'Confiabilidade',
      text: 'Esta pessoa demonstra responsabilidade, consistência e confiança nas entregas assumidas?',
      isNps: false,
    },
    {
      order: 3,
      dimension: 'Comunicação',
      text: 'Esta pessoa se comunica de forma clara, respeitosa e eficiente no ambiente de trabalho?',
      isNps: false,
    },
    {
      order: 4,
      dimension: 'Desenvolvimento',
      text: 'Esta pessoa demonstra aprendizado contínuo, adaptabilidade e evolução profissional?',
      isNps: false,
    },
    {
      order: 5,
      dimension: 'Recomendação',
      text: 'De 0 a 10, o quanto você recomendaria esta pessoa para trabalhar em outro projeto ou equipe?',
      isNps: true,
    },
  ];

  for (const q of questions) {
    const existing = await prisma.pulseQuestion.findFirst({ where: { order: q.order } });
    if (!existing) {
      await prisma.pulseQuestion.create({ data: q });
    }
  }

  console.log('Seed concluído: admin, áreas, cargos e perguntas oficiais.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
