// e2e.mjs — teste de ponta a ponta do PWA Brasil, em um Chromium de verdade.
// Uso:  node e2e.mjs      (precisa do pacote "playwright" instalado)
import http from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { createRequire } from 'node:module';
// require() enxerga tanto o node_modules do projeto quanto instalações globais (NODE_PATH).
const { chromium } = createRequire(import.meta.url)('playwright');

const RAIZ = resolve(process.argv[2] || '.');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml' };

// Servidor estático mínimo (localhost conta como contexto seguro para o Service Worker).
const servidor = http.createServer((req, res) => {
  let caminho = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (caminho.endsWith('/')) caminho += 'index.html';
  const arquivo = resolve(join(RAIZ, caminho));
  if (!arquivo.startsWith(RAIZ) || !existsSync(arquivo) || !statSync(arquivo).isFile()) {
    res.writeHead(404); return res.end('não encontrado');
  }
  res.writeHead(200, { 'Content-Type': TIPOS[extname(arquivo)] || 'application/octet-stream' });
  res.end(readFileSync(arquivo));
});
await new Promise((ok) => servidor.listen(0, ok));
const URL_BASE = `http://localhost:${servidor.address().port}/`;

let falhas = 0;
const conferir = (descricao, condicao, detalhe = '') => {
  console.log(`${condicao ? '✔' : '✘'} ${descricao}${!condicao && detalhe ? '  → ' + detalhe : ''}`);
  if (!condicao) falhas++;
};

const navegador = await chromium.launch();
const contexto = await navegador.newContext({ viewport: { width: 1280, height: 900 } });
const pagina = await contexto.newPage();
const erros = [];
pagina.on('pageerror', (e) => erros.push(e.message));
pagina.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });

try {
  await pagina.goto(URL_BASE);
  await pagina.waitForFunction(() => !document.getElementById('splash'), null, { timeout: 8000 });
  conferir('splash some depois de alguns segundos', true);

  // Manifest e ícones
  const manifest = await pagina.evaluate(async () => (await fetch('manifest.webmanifest')).json());
  conferir('manifest tem nome e nome curto corretos', manifest.name === 'PWA Brasil (PT-BR)' && manifest.short_name === 'PWA Brasil');
  const iconesOk = await pagina.evaluate(async (icones) => {
    const r = await Promise.all(icones.map((i) => fetch(i.src)));
    return r.every((x) => x.ok);
  }, manifest.icons);
  conferir('todos os ícones do manifest existem', iconesOk);

  // Service Worker assume o controle depois de um reload
  await pagina.evaluate(() => navigator.serviceWorker.ready);
  await pagina.reload();
  await pagina.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 8000 });
  conferir('Service Worker controla a página', true);

  // Todo o App Shell está no cache?
  const faltando = await pagina.evaluate(async () => {
    const alvo = ['./', './index.html', './styles.css', './app.js', './quiz.js', './manifest.webmanifest', './offline.html'];
    const f = [];
    for (const a of alvo) if (!(await caches.match(a))) f.push(a);
    return f;
  });
  conferir('App Shell completo no cache', faltando.length === 0, 'faltam: ' + faltando.join(', '));

  // Navegação e quizzes
  conferir('7 quizzes montados', (await pagina.locator('.quiz').count()) === 7);
  await pagina.goto(URL_BASE + '#modulo-4');
  conferir('hash #modulo-4 mostra o módulo 4', await pagina.locator('#modulo-4').isVisible() && !(await pagina.locator('#modulo-1').isVisible()));

  // Fluxo do quiz: aprova o módulo 1 e confere o progresso
  await pagina.goto(URL_BASE + '#modulo-1');
  const quiz = pagina.locator('.quiz[data-quiz="modulo-1"]');
  const fonteQuiz = readFileSync(join(RAIZ, 'quiz.js'), 'utf8');
  const bloco = fonteQuiz.slice(fonteQuiz.indexOf("'modulo-1': ["), fonteQuiz.indexOf("'modulo-2': ["));
  const certas = [...bloco.matchAll(/o: \['((?:[^'\\]|\\.)*)'/g)].map((m) => m[1].replace(/\\'/g, "'"));
  for (let i = 0; i < certas.length; i++) {
    await quiz.locator('.quiz__pergunta').nth(i).locator('label', { hasText: certas[i].slice(0, 40) }).first().locator('input').check();
  }
  await quiz.locator('button[type=submit]').click();
  conferir('quiz com 100% conclui o módulo 1', (await pagina.locator('#progresso-texto').innerText()).startsWith('1 de 7'));

  // Offline de verdade
  await contexto.setOffline(true);
  await pagina.goto(URL_BASE);
  await pagina.waitForSelector('main#conteudo');
  conferir('abre offline pelo cache', (await pagina.title()).includes('PWA Brasil'));
  conferir('badge de rede mostra Offline', (await pagina.locator('#badge-rede').innerText()).includes('Offline'));
  await pagina.goto(URL_BASE + 'pagina-que-nao-existe-no-cache.html').catch(() => {});
  await contexto.setOffline(false);

  // Estratégias do laboratório do módulo 3 (cache first duas vezes)
  const origens = await pagina.evaluate(async () => {
    const u = './__lab__/cache-first/teste-e2e';
    const a = await fetch(u); const b = await fetch(u);
    return [a.headers.get('X-SW-Origem'), b.headers.get('X-SW-Origem')];
  });
  conferir('Cache First: 1ª vez na rede, 2ª vez no cache', /rede/.test(origens[0]) && origens[1] === 'cache', JSON.stringify(origens));

  conferir('nenhum erro de JavaScript/console', erros.length === 0, erros.join(' | '));
} catch (e) {
  console.log('✘ o teste quebrou:', e.message);
  falhas++;
} finally {
  await navegador.close();
  servidor.close();
}
console.log(falhas ? `\n${falhas} verificação(ões) falharam.` : '\nTodas as verificações passaram.');
process.exit(falhas ? 1 : 0);
