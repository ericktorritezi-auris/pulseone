/**
 * Orquestrador único de start para o serviço Railway consolidado.
 * Sobe a API NestJS (porta interna fixa) e o Next.js (porta pública do Railway)
 * dentro do MESMO container/processo pai. Se qualquer um dos dois cair,
 * o processo pai encerra para o Railway reiniciar o serviço inteiro.
 */
const { spawn } = require('child_process');
const path = require('path');

const INTERNAL_API_PORT = process.env.INTERNAL_API_PORT || '3333';
const PUBLIC_PORT = process.env.PORT || '3000';

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
