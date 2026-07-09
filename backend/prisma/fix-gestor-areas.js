/**
 * MIGRAÇÃO PONTUAL — vincula todo gestor existente a TODAS as áreas do
 * sistema (pedido do Erick, seção "gestor em várias áreas").
 *
 * Diferente dos scripts fix-legacy-enum.js e fix-position-area.js, este
 * roda DEPOIS do "prisma db push" (não antes) — a relação N:N
 * (User.managedAreas) é uma tabela de junção nova, sem dados legados nem
 * risco de NOT NULL sem valor; não precisa da mesma proteção via SQL bruto,
 * dá pra usar o Prisma Client normal.
 *
 * ⚠️ IMPORTANTE: assim como os scripts pontuais anteriores, a chamada deste
 * script no start.js deve ser REMOVIDA assim que o Erick confirmar que os
 * gestores aparecem vinculados a todas as áreas — é um "grant" amplo de
 * uma vez, não precisa rodar de novo em todo deploy futuro.
 */
const { PrismaClient, UserRole } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const areas = await prisma.area.findMany({ select: { id: true } });
  if (areas.length === 0) {
    console.log('Vínculo gestor↔área: nenhuma área cadastrada ainda — nada a fazer.');
    return;
  }

  const gestores = await prisma.user.findMany({ where: { role: UserRole.GESTOR } });
  if (gestores.length === 0) {
    console.log('Vínculo gestor↔área: nenhum gestor cadastrado ainda — nada a fazer.');
    return;
  }

  for (const gestor of gestores) {
    await prisma.user.update({
      where: { id: gestor.id },
      data: { managedAreas: { set: areas.map((a) => ({ id: a.id })) } },
    });
  }

  console.log(`Vínculo gestor↔área: ${gestores.length} gestor(es) vinculado(s) a ${areas.length} área(s).`);
}

main()
  .catch((err) => {
    console.error('Falha no vínculo gestor↔área:', err.message);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
