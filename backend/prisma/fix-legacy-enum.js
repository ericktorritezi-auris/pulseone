/**
 * Correção pontual, rodada uma única vez antes do "prisma db push".
 *
 * Motivo: a Sprint 3 dividiu o enum PulseEvaluationType.GESTOR em dois
 * valores novos (AVALIACAO_EQUIPE / AVALIACAO_GESTOR). Se já existirem
 * linhas de teste em PulseFeedback com o valor antigo "GESTOR", o Postgres
 * não consegue migrar o enum sozinho (não sabe pra qual dos dois valores
 * novos cada linha antiga deveria ir) e o "db push" trava em loop de crash.
 *
 * Como esses dados são só de teste (ainda não estamos em produção real),
 * a correção é remover essas linhas antigas antes do push — os próximos
 * ciclos já nascem com os tipos novos, sem esse problema.
 *
 * Usa SQL bruto via "pg" propositalmente: o Prisma Client já foi gerado
 * com o schema NOVO (sem "GESTOR" no enum), então não teria como nem
 * expressar essa consulta via Prisma Client normal.
 */
const { Client } = require('pg');

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });

  try {
    await client.connect();

    // Se a tabela ainda não existir (banco totalmente novo), não há nada a corrigir.
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'PulseFeedback'
      );
    `);

    if (!tableCheck.rows[0].exists) {
      console.log('Tabela PulseFeedback ainda não existe — nada a corrigir.');
      return;
    }

    const result = await client.query(`
      DELETE FROM "PulseAnswer"
      WHERE "pulseFeedbackId" IN (
        SELECT id FROM "PulseFeedback" WHERE type::text = 'GESTOR'
      );
    `);
    const result2 = await client.query(`DELETE FROM "PulseFeedback" WHERE type::text = 'GESTOR';`);

    console.log(
      `Correção do enum: ${result.rowCount} resposta(s) e ${result2.rowCount} avaliação(ões) de teste removidas (tipo "GESTOR" antigo).`,
    );
  } catch (err) {
    // Se o erro for "coluna/tipo não existe", é um banco já limpo ou muito
    // antigo — não é motivo pra derrubar o deploy.
    console.log('Correção do enum: nada a fazer ou já corrigido antes.', err.message);
  } finally {
    await client.end();
  }
}

main();
