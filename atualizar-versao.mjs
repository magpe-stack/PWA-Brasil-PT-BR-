// atualizar-versao.mjs
// Troca a constante VERSAO do sw.js por "<base>-<hash>", onde o hash é calculado
// a partir do conteúdo de TODOS os arquivos do App Shell. Se qualquer arquivo
// mudar, a versão muda; e o navegador dos alunos percebe e mostra o banner
// "Nova versão disponível". Assim ninguém precisa lembrar de incrementar à mão.
//
// Uso:  node atualizar-versao.mjs [pasta]     (padrão: pasta atual)
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const pasta = process.argv[2] || '.';
const caminhoSw = join(pasta, 'sw.js');
const sw = readFileSync(caminhoSw, 'utf8');

// Lê a lista APP_SHELL do próprio sw.js (só os caminhos entre aspas simples).
const bloco = sw.match(/const APP_SHELL = \[([\s\S]*?)\];/);
if (!bloco) throw new Error('APP_SHELL não encontrado em sw.js');
const arquivos = [...bloco[1].matchAll(/'\.\/([^']*)'/g)].map((m) => m[1]).filter(Boolean);

const hash = createHash('sha1');
for (const f of arquivos.sort()) {
  // O próprio sw.js não está na lista; o hash cobre o que o SW guarda no cache.
  hash.update(f).update(readFileSync(join(pasta, f)));
}
const curto = hash.digest('hex').slice(0, 8);

const atual = sw.match(/const VERSAO = '([^']+)';/);
if (!atual) throw new Error('Constante VERSAO não encontrada em sw.js');
const base = atual[1].split('-')[0];            // "v1.2.0-abc123" -> "v1.2.0"
const nova = `${base}-${curto}`;

writeFileSync(caminhoSw, sw.replace(/const VERSAO = '[^']+';/, `const VERSAO = '${nova}';`));
console.log(`VERSAO: ${atual[1]} -> ${nova}  (${arquivos.length} arquivos no hash)`);
