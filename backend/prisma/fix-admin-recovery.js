/**
 * RECUPERAÇÃO PONTUAL DO ADMIN — rodada uma única vez.
 *
 * Contexto: ao editar o cadastro do admin (trocando o e-mail pra igual ao
 * do gestor, de propósito, pra testar contas com e-mail duplicado), o campo
 * de "Redefinir Senha" não foi de fato submetido — só o formulário
 * principal (que muda nome/e-mail/cargo, não senha) foi salvo. Resultado:
 * o e-mail do admin mudou, mas a senha continuou a antiga, e o Erick ficou
 * sem saber com qual credencial entrar.
 *
 * Este script força o e-mail e a senha do admin de volta pros valores
 * corretos, direto no banco — não depende de saber a senha atual.
 *
 * ⚠️ IMPORTANTE: isso é chamado do start.js só nesta rodada. Depois que o
 * Erick confirmar que voltou a conseguir logar, a chamada deve ser removida
 * do start.js (numa próxima entrega) — senão isso ficaria resetando o
 * e-mail/senha do admin em TODO deploy futuro, mesmo que ele troque essas
 * credenciais de propósito mais pra frente.
 */
const { PrismaClient, UserRole } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

const TARGET_EMAIL = 'erick.torritezi@gmail.com';
const TARGET_PASSWORD = 'Admin@96694884';

async function main() {
  const admin = await prisma.user.findFirst({ where: { role: UserRole.ADMIN } });

  if (!admin) {
    console.log('Recuperação do admin: nenhum usuário ADMIN encontrado — nada a corrigir.');
    return;
  }

  const passwordHash = await bcrypt.hash(TARGET_PASSWORD, 10);

  await prisma.user.update({
    where: { id: admin.id },
    data: {
      email: TARGET_EMAIL,
      passwordHash,
      mustChangePwd: false,
      active: true,
    },
  });

  console.log(`Recuperação do admin concluída: e-mail redefinido para ${TARGET_EMAIL}.`);
}

main()
  .catch((e) => {
    console.error('Falha na recuperação do admin:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
