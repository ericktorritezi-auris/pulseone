/**
 * MIGRAÇÃO PONTUAL — vincula todos os cargos existentes à área Marketing.
 *
 * Contexto: Position.areaId virou obrigatório (cargo agora pertence a uma
 * área — pedido do Erick). Como já existem cargos cadastrados sem esse
 * vínculo, rodar "prisma db push" direto quebraria (coluna NOT NULL sem
 * valor pra popular). Esse script roda ANTES do db push, adiciona a
 * coluna como opcional via SQL bruto, preenche com o id da área
 * "Marketing" (que o Erick confirmou ser aceitável pra todos os cargos
 * atuais, já que a base de teste inteira vai ser resetada em seguida) e
 * só depois o db push consegue promover a coluna pra NOT NULL sem erro.
 *
 * ⚠️ IMPORTANTE: assim como os scripts pontuais anteriores, a chamada
 * deste script no start.js deve ser REMOVIDA assim que o Erick confirmar
 * que os cargos aparecem certos (vinculados a Marketing) na tela de
 * Cargos — não precisa rodar de novo em deploys futuros.
 */
const { Client } = require('pg');

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });

  try {
    await client.connect();

    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'Position'
      );
    `);
    if (!tableCheck.rows[0].exists) {
      console.log('Migração de cargo→área: tabela Position ainda não existe — nada a fazer.');
      return;
    }

    const columnCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.columns
        WHERE table_name = 'Position' AND column_name = 'areaId'
      );
    `);

    if (!columnCheck.rows[0].exists) {
      // Coluna ainda não existe — adiciona como opcional por enquanto,
      // o "db push" logo depois é que vai promover pra NOT NULL + FK.
      await client.query(`ALTER TABLE "Position" ADD COLUMN "areaId" TEXT;`);
      console.log('Migração de cargo→área: coluna "areaId" criada (opcional, por enquanto).');
    }

    const marketing = await client.query(`SELECT id FROM "Area" WHERE name = 'Marketing' LIMIT 1;`);
    if (marketing.rows.length === 0) {
      console.log('Migração de cargo→área: área "Marketing" não encontrada — nada a popular ainda.');
      return;
    }
    const marketingId = marketing.rows[0].id;

    const result = await client.query(
      `UPDATE "Position" SET "areaId" = $1 WHERE "areaId" IS NULL;`,
      [marketingId],
    );

    console.log(`Migração de cargo→área: ${result.rowCount} cargo(s) vinculado(s) a Marketing.`);
  } catch (err) {
    console.log('Migração de cargo→área: nada a fazer ou já corrigido antes.', err.message);
  } finally {
    await client.end();
  }
}

main();
