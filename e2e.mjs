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

  // Certificado: bloqueado sem notas, liberado com os 7 quizzes aprovados
  await pagina.goto(URL_BASE + '#certificado');
  await pagina.evaluate(() => localStorage.setItem('pwa-brasil:quiz-v1', JSON.stringify({ 'modulo-1': { melhor: 100, tentativas: 1 } })));
  await pagina.reload();
  conferir('certificado bloqueado com só 1 quiz aprovado', await pagina.locator('#btn-cert-gerar').isDisabled());
  await pagina.evaluate(() => {
    const n = {}; for (let i = 1; i <= 7; i++) n['modulo-' + i] = { melhor: i === 3 ? 80 : 100, tentativas: 1 };
    localStorage.setItem('pwa-brasil:quiz-v1', JSON.stringify(n));
  });
  await pagina.reload();
  conferir('certificado liberado com os 7 quizzes aprovados', await pagina.locator('#btn-cert-gerar').isEnabled());
  await pagina.locator('#btn-cert-gerar').click();
  await pagina.waitForTimeout(300);
  conferir('nome curto demais é recusado', (await pagina.locator('#cert-erro').innerText()).includes('nome'));
  await pagina.fill('#cert-nome', 'Maria da Conceição Albuquerque');
  await pagina.locator('#btn-cert-gerar').click();
  await pagina.waitForSelector('#cert-resultado:not([hidden])');
  const pintou = await pagina.evaluate(() => {
    const c = document.getElementById('cert-canvas'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let azul = 0; for (let i = 0; i < d.length; i += 4 * 400) if (d[i + 2] > 200 && d[i] < 40) azul++;
    return azul > 20;
  });
  conferir('certificado foi desenhado no canvas', pintou);
  const [download] = await Promise.all([pagina.waitForEvent('download'), pagina.locator('#btn-cert-baixar').click()]);
  conferir('download do PNG funciona', download.suggestedFilename() === 'certificado-pwa-brasil.png');
  if (process.env.CERT_PNG) await pagina.locator('#cert-canvas').screenshot({ path: process.env.CERT_PNG });

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

  // ---- Salvar e abrir progresso ----
  const { readFileSync: ler, writeFileSync: gravar } = await import('node:fs');
  const TMP = process.env.TMPDIR_E2E || '/tmp';
  const novaPagina = async (script) => {
    const ctx = await navegador.newContext({ acceptDownloads: true });
    if (script) await ctx.addInitScript(script);
    const pg = await ctx.newPage();
    pg.on('pageerror', (e) => erros.push(e.message));
    pg.on('dialog', (d) => d.accept());
    await pg.goto(URL_BASE + '#progresso');
    await pg.waitForFunction(() => !document.getElementById('splash'), null, { timeout: 8000 });
    return { ctx, pg };
  };
  const semSeletores = 'delete window.showSaveFilePicker; delete window.showOpenFilePicker;';

  // (a) Navegador sem seletor: Salvar baixa um arquivo .json
  let A = await novaPagina(semSeletores);
  await A.pg.evaluate(() => {
    localStorage.setItem('pwa-brasil:progresso-v2', JSON.stringify(['modulo-1', 'modulo-2']));
    localStorage.setItem('pwa-brasil:quiz-v1', JSON.stringify({ 'modulo-1': { melhor: 100, tentativas: 2 }, 'modulo-2': { melhor: 60, tentativas: 1 } }));
    localStorage.setItem('pwa-brasil:nome-certificado', JSON.stringify('Ana Souza'));
  });
  await A.pg.reload();
  const [dl] = await Promise.all([A.pg.waitForEvent('download'), A.pg.locator('#btn-prog-salvar').click()]);
  const caminhoArquivo = TMP + '/progresso-e2e.json';
  await dl.saveAs(caminhoArquivo);
  const salvo = JSON.parse(ler(caminhoArquivo, 'utf8'));
  conferir('Salvar (sem seletor) baixa .json com nome datado', /^progresso-pwa-brasil-\d{4}-\d{2}-\d{2}\.json$/.test(dl.suggestedFilename()));
  conferir('arquivo salvo tem app, formato e dados', salvo.app === 'PWA Brasil (PT-BR)' && salvo.formato === 1 && JSON.parse(salvo.dados['progresso-v2']).length === 2);
  await A.ctx.close();

  // (b) Navegador com seletor (Chrome/Edge): o app escreve no arquivo escolhido
  let B = await novaPagina(`
    window.__escrito = null;
    window.showSaveFilePicker = async (opc) => ({ name: opc.suggestedName,
      createWritable: async () => ({ write: async (t) => { window.__escrito = t; }, close: async () => {} }) });`);
  await B.pg.evaluate(() => localStorage.setItem('pwa-brasil:progresso-v2', JSON.stringify(['modulo-3'])));
  await B.pg.reload();
  await B.pg.locator('#btn-prog-salvar').click();
  await B.pg.waitForFunction(() => window.__escrito !== null);
  conferir('Salvar (com seletor) escreve no arquivo escolhido', JSON.parse(await B.pg.evaluate(() => window.__escrito)).dados['progresso-v2'].includes('modulo-3'));
  conferir('mensagem confirma o local escolhido', (await B.pg.locator('#prog-status').innerText()).includes('local que você escolheu'));
  await B.ctx.close();

  // (c) Abrir em um aparelho "novo": soma ao que existe e recarrega
  let C = await novaPagina(semSeletores);
  await C.pg.evaluate(() => {
    localStorage.setItem('pwa-brasil:progresso-v2', JSON.stringify(['modulo-5']));
    localStorage.setItem('pwa-brasil:quiz-v1', JSON.stringify({ 'modulo-1': { melhor: 80, tentativas: 1 } }));
  });
  await C.pg.reload();
  await C.pg.locator('#prog-arquivo').setInputFiles(caminhoArquivo);
  await C.pg.waitForFunction(() => document.getElementById('progresso-texto').textContent.startsWith('3 de 7'), null, { timeout: 8000 });
  conferir('Abrir soma módulos (5 + 1 + 2 = 3 distintos)', true);
  const apos = await C.pg.evaluate(() => JSON.parse(localStorage.getItem('pwa-brasil:quiz-v1')));
  conferir('Abrir mantém a MELHOR nota de cada quiz', apos['modulo-1'].melhor === 100 && apos['modulo-2'].melhor === 60);
  conferir('Abrir restaura o nome do certificado', await C.pg.evaluate(() => JSON.parse(localStorage.getItem('pwa-brasil:nome-certificado'))) === 'Ana Souza');
  conferir('mensagem de sucesso aparece depois do recarregamento', (await C.pg.locator('#prog-status').innerText()).includes('aberto com sucesso'));
  await C.ctx.close();

  // (d) Arquivos inválidos ou maliciosos são recusados / limpos
  const invalido = async (nome, conteudo, trecho) => {
    const f = TMP + '/' + nome; gravar(f, conteudo);
    const D = await novaPagina(semSeletores);
    await D.pg.locator('#prog-arquivo').setInputFiles(f);
    await D.pg.waitForFunction(() => document.getElementById('prog-status').textContent.length > 0);
    const msg = await D.pg.locator('#prog-status').innerText();
    const intacto = (await D.pg.evaluate(() => localStorage.getItem('pwa-brasil:progresso-v2'))) === null;
    conferir(`recusa: ${nome}`, msg.includes(trecho) && intacto, msg);
    await D.ctx.close();
  };
  await invalido('lixo.json', 'isto não é json {{{', 'JSON válido');
  await invalido('outro-app.json', JSON.stringify({ app: 'Outro App', formato: 1, dados: {} }), 'não é do');
  await invalido('vazio.json', JSON.stringify({ app: 'PWA Brasil (PT-BR)', formato: 1, dados: { 'progresso-v2': '["modulo-99"]' } }), 'nenhum progresso');
  await invalido('enorme.json', JSON.stringify({ app: 'PWA Brasil (PT-BR)', formato: 1, dados: { apelido: 'x'.repeat(300000) } }), 'grande demais');

  // Chaves desconhecidas e HTML no nome são descartados/limpos
  const f2 = TMP + '/malicioso.json';
  gravar(f2, JSON.stringify({ app: 'PWA Brasil (PT-BR)', formato: 1, dados: {
    'progresso-v2': '["modulo-1","modulo-99","__proto__"]', 'chave-estranha': 'x', '__proto__': 'x',
    'nome-certificado': '"<img src=x onerror=alert(1)>Maria"' } }));
  let E = await novaPagina(semSeletores);
  await E.pg.locator('#prog-arquivo').setInputFiles(f2);
  await E.pg.waitForFunction(() => document.getElementById('progresso-texto').textContent.startsWith('1 de 7'), null, { timeout: 8000 });
  const guardado = await E.pg.evaluate(() => ({
    chaves: Object.keys(localStorage).filter((k) => k.startsWith('pwa-brasil:')),
    feitos: JSON.parse(localStorage.getItem('pwa-brasil:progresso-v2')),
    nome: JSON.parse(localStorage.getItem('pwa-brasil:nome-certificado')) }));
  conferir('chaves desconhecidas e módulos inexistentes são ignorados',
    !guardado.chaves.some((k) => /estranha|proto/.test(k)) && guardado.feitos.length === 1 && guardado.feitos[0] === 'modulo-1', JSON.stringify(guardado));
  conferir('sinais < e > são removidos do nome', !/[<>]/.test(guardado.nome), guardado.nome);
  await E.ctx.close();

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
