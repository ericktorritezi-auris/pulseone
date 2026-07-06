/**
 * Orquestrador único de start para o serviço Railway consolidado.
 * Sobe a API NestJS (porta interna fixa) e o Next.js (porta pública do Railway)
 * dentro do MESMO container/processo pai. Se qualquer um dos dois cair,
 * o processo pai encerra para o Railway reiniciar o serviço inteiro.
 */
const { spawn, execSync } = require('child_process');
const path = require('path');

const INTERNAL_API_PORT = process.env.INTERNAL_API_PORT || '3333';
const PUBLIC_PORT = process.env.PORT || '3000';
const backendDir = path.join(__dirname, 'backend');

// Aplica o schema do Prisma no banco a cada deploy (idempotente — não faz
// nada se o schema já estiver sincronizado). Isso substitui a etapa que
// faltava: até agora só rodávamos "prisma generate" (gera o client),
// nunca "db push" (cria/atualiza as tabelas de fato no Postgres).
// Quando o projeto tiver dados reais em produção, trocar por
// "prisma migrate deploy" com migrations versionadas.
console.log('Sincronizando schema do banco de dados (prisma db push)...');
try {
  execSync('npx prisma db push --accept-data-loss --skip-generate', {
    cwd: backendDir,
    stdio: 'inherit',
  });
  console.log('Schema sincronizado com sucesso.');
} catch (err) {
  console.error('Falha ao sincronizar o schema do banco. Encerrando o serviço.');
  process.exit(1);
}

// Seed é idempotente (usa upsert em tudo), então é seguro rodar em todo boot.
// Garante que o admin, as perguntas oficiais e os dados de exemplo sempre existam.
console.log('Rodando seed (admin, perguntas oficiais, área/cargo de exemplo)...');
try {
  execSync('npx ts-node prisma/seed.ts', { cwd: backendDir, stdio: 'inherit' });
  console.log('Seed concluído.');
} catch (err) {
  console.error('Falha ao rodar o seed. Encerrando o serviço.');
  process.exit(1);
}

function run(name, command, args, cwd, env) {
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: 'inherit',
    shell: true,
  });

  child.on('exit', (code) => {
    console.error(`[${name}] encerrou com código ${code}. Finalizando o serviço.`);
    process.exit(code ?? 1);
  });

  return child;
}

console.log(`Subindo backend (interno :${INTERNAL_API_PORT}) e frontend (público :${PUBLIC_PORT})...`);

run('backend', 'node', ['dist/main.js'], path.join(__dirname, 'backend'), {
  INTERNAL_API_PORT,
});

run('frontend', 'npx', ['next', 'start', '-p', PUBLIC_PORT], path.join(__dirname, 'frontend'), {
  INTERNAL_API_PORT,
});
