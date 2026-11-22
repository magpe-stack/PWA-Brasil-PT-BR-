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
  conferir('quiz com 100% conclui o módulo 1', (await pagina.locator('#progresso-texto').textContent()).startsWith('1 de 7'));

  // Certificado: bloqueado sem notas, liberado com os 7 quizzes aprovados
  await pagina.goto(URL_BASE + '#certificado');
  await pagina.evaluate(() => localStorage.setItem('pwa-brasil:quiz-v1', JSON.stringify({ 'modulo-1': { melhor: 100, tentativas: 1 } })));
  await pagina.reload();
  await pagina.evaluate(() => { location.hash = '#certificado'; });
  conferir('certificado bloqueado com só 1 quiz aprovado', await pagina.locator('#btn-cert-gerar').isDisabled());
  await pagina.evaluate(() => {
    const n = {}; for (let i = 1; i <= 7; i++) n['modulo-' + i] = { melhor: i === 3 ? 80 : 100, tentativas: 1 };
    localStorage.setItem('pwa-brasil:quiz-v1', JSON.stringify(n));
  });
  await pagina.reload();
  await pagina.evaluate(() => { location.hash = '#certificado'; });
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
    await pg.goto(URL_BASE);
    await pg.waitForFunction(() => !document.getElementById('splash'), null, { timeout: 8000 });
    await pg.evaluate(() => { location.hash = '#progresso'; });
    return { ctx, pg };
  };
  const semSeletores = 'delete window.showSaveFilePicker; delete window.showOpenFilePicker;';

  // (a) Navegador sem seletor: Salvar baixa um arquivo .json
  let A = await novaPagina(semSeletores);
  await A.pg.evaluate(() => {
    localStorage.setItem('pwa-brasil:progresso-v2', JSON.stringify(['modulo-1', 'modulo-2']));
    localStorage.setItem('pwa-brasil:quiz-v1', JSON.stringify({ 'modulo-1': { melhor: 100, tentativas: 2 }, 'modulo-2': { melhor: 60, tentativas: 1 } }));
    localStorage.setItem('pwa-brasil:nome-certificado', JSON.stringify('Ana Souza'));
    localStorage.setItem('pwa-brasil:labs-v1', JSON.stringify({ 'lab-html': '2026-11-20T10:00:00.000Z' }));
    localStorage.setItem('pwa-brasil:estudo-v1', JSON.stringify({ iniciadoEm: '2026-11-20T09:00:00.000Z', segundos: { 'modulo-1': 600 }, dias: ['2026-11-20'] }));
  });
  await A.pg.reload();
  await A.pg.evaluate(() => { location.hash = '#progresso'; });
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
  await B.pg.evaluate(() => { location.hash = '#progresso'; });
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
  await C.pg.evaluate(() => { location.hash = '#progresso'; });
  await C.pg.locator('#prog-arquivo').setInputFiles(caminhoArquivo);
  await C.pg.waitForFunction(() => document.getElementById('progresso-texto').textContent.startsWith('3 de 7'), null, { timeout: 8000 });
  conferir('Abrir soma módulos (5 + 1 + 2 = 3 distintos)', true);
  const apos = await C.pg.evaluate(() => JSON.parse(localStorage.getItem('pwa-brasil:quiz-v1')));
  conferir('Abrir mantém a MELHOR nota de cada quiz', apos['modulo-1'].melhor === 100 && apos['modulo-2'].melhor === 60);
  conferir('Abrir restaura o nome do certificado', await C.pg.evaluate(() => JSON.parse(localStorage.getItem('pwa-brasil:nome-certificado'))) === 'Ana Souza');
  const depois = await C.pg.evaluate(() => ({ labs: JSON.parse(localStorage.getItem('pwa-brasil:labs-v1')), est: JSON.parse(localStorage.getItem('pwa-brasil:estudo-v1')) }));
  conferir('Abrir restaura laboratórios feitos e tempo de estudo', !!depois.labs['lab-html'] && depois.est.segundos['modulo-1'] >= 600 && depois.est.dias.includes('2026-11-20'), JSON.stringify(depois));
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
    'nome-certificado': '"<img src=x onerror=alert(1)>Maria"',
    'labs-v1': '{"lab-html":"2026-11-20T10:00:00.000Z","lab-x":"2026-11-20T10:00:00.000Z","lab-cache":"não é data"}',
    'estudo-v1': '{"iniciadoEm":"ontem","segundos":{"modulo-1":50,"__proto__":9,"Modulo 2":9,"modulo-3":-5,"modulo-4":99999999},"dias":["2026-11-20","hoje","2026-13-99x"]}' } }));
  let E = await novaPagina(semSeletores);
  await E.pg.locator('#prog-arquivo').setInputFiles(f2);
  await E.pg.waitForFunction(() => document.getElementById('progresso-texto').textContent.startsWith('1 de 7'), null, { timeout: 8000 });
  const guardado = await E.pg.evaluate(() => ({
    chaves: Object.keys(localStorage).filter((k) => k.startsWith('pwa-brasil:')),
    feitos: JSON.parse(localStorage.getItem('pwa-brasil:progresso-v2')),
    nome: JSON.parse(localStorage.getItem('pwa-brasil:nome-certificado')) }));
  conferir('chaves desconhecidas e módulos inexistentes são ignorados',
    !guardado.chaves.some((k) => /estranha|proto/.test(k)) && guardado.feitos.length === 1 && guardado.feitos[0] === 'modulo-1', JSON.stringify(guardado));
  const limpoLabs = await E.pg.evaluate(() => ({ labs: Object.keys(JSON.parse(localStorage.getItem('pwa-brasil:labs-v1'))), est: JSON.parse(localStorage.getItem('pwa-brasil:estudo-v1')) }));
  conferir('laboratórios desconhecidos ou com data inválida são descartados', limpoLabs.labs.length === 1 && limpoLabs.labs[0] === 'lab-html', JSON.stringify(limpoLabs.labs));
  conferir('tempo de estudo inválido é descartado (chave estranha, negativo, absurdo, data ruim)',
    Object.keys(limpoLabs.est.segundos).join() === 'modulo-1' && limpoLabs.est.iniciadoEm === null && limpoLabs.est.dias.join() === '2026-11-20', JSON.stringify(limpoLabs.est));
  conferir('sinais < e > são removidos do nome', !/[<>]/.test(guardado.nome), guardado.nome);
  await E.ctx.close();

  // ---- Página inicial, painel, menu à direita, laboratórios e tempo de estudo ----
  const ctxF = await navegador.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 900 } });
  await ctxF.addInitScript(semSeletores);
  const pf = await ctxF.newPage();
  pf.on('pageerror', (e) => erros.push(e.message));
  pf.on('dialog', (d) => d.accept());
  await pf.goto(URL_BASE + '#modulo-3');
  await pf.waitForFunction(() => !document.getElementById('splash'), null, { timeout: 8000 });
  conferir('abrir com #modulo-3 na URL cai no Início', (await pf.evaluate(() => location.hash)) === '#inicio' && await pf.locator('#inicio').isVisible());
  conferir('Início mostra boas-vindas e o botão Iniciar (painel escondido)', await pf.locator('#btn-iniciar').isVisible() && !(await pf.locator('#painel').isVisible()));
  conferir('texto de boas-vindas traz o tempo estimado (3 h 20 min)', (await pf.locator('#inicio-tempo').innerText()).includes('3 h 20 min'));

  const caixaBotao = await pf.locator('#menu-btn').boundingBox();
  conferir('hambúrguer fica no canto superior direito', caixaBotao.x > 1100 && caixaBotao.y < 80, JSON.stringify(caixaBotao));
  await pf.locator('#menu-btn').click();
  await pf.waitForTimeout(450);
  const caixaMenu = await pf.locator('#drawer').boundingBox();
  conferir('menu abre pelo lado direito', caixaMenu.x > 800, JSON.stringify(caixaMenu));
  conferir('menu tem Painel, Salvar como… e Abrir arquivo…',
    await pf.locator('#drawer a[href="#inicio"]').isVisible() && await pf.locator('#menu-salvar').isVisible() && await pf.locator('#menu-abrir').isVisible());
  await pf.keyboard.press('Escape');
  await pf.waitForTimeout(450);

  await pf.locator('#btn-iniciar').click();
  await pf.waitForFunction(() => location.hash === '#modulo-1' && !document.getElementById('modulo-1').hidden);
  conferir('Iniciar leva ao Módulo 1', (await pf.evaluate(() => location.hash)) === '#modulo-1' && await pf.locator('#modulo-1').isVisible());
  conferir('Iniciar grava a data de início', !!(await pf.evaluate(() => JSON.parse(localStorage.getItem('pwa-brasil:estudo-v1')).iniciadoEm)));
  await pf.evaluate(() => { location.hash = '#inicio'; });
  conferir('depois de iniciar, o Início vira painel', await pf.locator('#painel').isVisible() && !(await pf.locator('#inicio-boasvindas').isVisible()));
  conferir('painel começa com 0/7 módulos', (await pf.locator('.kpi__valor').first().innerText()) === '0/7');

  // Laboratório conta como feito ao ser usado
  await pf.evaluate(() => { location.hash = '#modulo-1'; });
  await pf.fill('#editor-html', '<p>teste</p>');
  const labsGravados = await pf.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('pwa-brasil:labs-v1') || '{}')));
  conferir('usar o editor de HTML marca o laboratório como feito', labsGravados.join() === 'lab-html', labsGravados.join());

  // Tempo de estudo: 11 s com a aba em uso soma pelo menos 10 s ao módulo aberto
  await pf.evaluate(() => { location.hash = '#modulo-2'; });
  await pf.mouse.click(20, 200);
  await pf.waitForTimeout(11500);
  const seg2 = await pf.evaluate(() => JSON.parse(localStorage.getItem('pwa-brasil:estudo-v1')).segundos['modulo-2'] || 0);
  conferir('tempo de estudo é contado no módulo aberto', seg2 >= 10, 'segundos no módulo 2: ' + seg2);

  // Painel completo com dados
  await pf.evaluate(() => {
    localStorage.setItem('pwa-brasil:progresso-v2', JSON.stringify(['modulo-1', 'modulo-2']));
    localStorage.setItem('pwa-brasil:quiz-v1', JSON.stringify({ 'modulo-1': { melhor: 100, tentativas: 1 }, 'modulo-2': { melhor: 60, tentativas: 3 } }));
    localStorage.setItem('pwa-brasil:apelido', JSON.stringify('Ana'));
    const e = JSON.parse(localStorage.getItem('pwa-brasil:estudo-v1'));
    e.segundos['modulo-1'] = 1800; e.segundos['modulo-2'] = 1200; e.dias = [...new Set([...e.dias, '2026-11-20'])];
    localStorage.setItem('pwa-brasil:estudo-v1', JSON.stringify(e));
  });
  await pf.reload();
  await pf.waitForFunction(() => !document.getElementById('splash'), null, { timeout: 8000 });
  const kpis = await pf.locator('.kpi').allInnerTexts();
  conferir('painel mostra 2/7 módulos e 1/7 quizzes aprovados', /2\/7/.test(kpis[0]) && /1\/7/.test(kpis[1]), kpis.slice(0, 2).join(' | '));
  conferir('painel mostra a média dos quizzes (80%)', /80%/.test(kpis[2]), kpis[2]);
  conferir('painel mostra as 4 tentativas de quiz', /\n4\n/.test(kpis[3]) || /4/.test(kpis[3]), kpis[3]);
  conferir('saudação usa o apelido', (await pf.locator('#painel h2').innerText()) === 'Olá, Ana!');
  conferir('estimativa de tempo restante aparece e é personalizada', /≈/.test(await pf.locator('.estimativa__valor').innerText()) && /seu ritmo/.test(await pf.locator('.estimativa__texto').innerText()));
  conferir('2 módulos marcados como concluídos na lista', (await pf.locator('.linha--concluido').count()) === 2);
  conferir('gráfico de notas tem 2 colunas com barra', (await pf.locator('.coluna__barra').count()) === 2 && (await pf.locator('.coluna__barra--baixa').count()) === 1);
  conferir('botão Continuar aponta para o Módulo 3', (await pf.locator('.painel__topo a').getAttribute('href')) === '#modulo-3');
  await pf.screenshot({ path: process.env.PAINEL_PNG || '/tmp/painel-e2e.png', fullPage: true });

  // Ações do menu
  await pf.locator('#menu-btn').click(); await pf.waitForTimeout(450);
  const [dlMenu] = await Promise.all([pf.waitForEvent('download'), pf.locator('#menu-salvar').click()]);
  conferir('Salvar como… do menu baixa o arquivo de progresso', /^progresso-pwa-brasil-.*\.json$/.test(dlMenu.suggestedFilename()));
  await pf.evaluate(() => { location.hash = '#modulo-5'; });
  await pf.locator('#menu-btn').click(); await pf.waitForTimeout(450);
  await pf.locator('#drawer a[href="#inicio"]').click();
  await pf.waitForFunction(() => location.hash === '#inicio' && !document.getElementById('inicio').hidden);
  const estadoPainel = await pf.evaluate(() => { const el = document.getElementById('painel'); const r = el.getBoundingClientRect();
    return { hash: location.hash, hidden: el.hidden, w: Math.round(r.width), h: Math.round(r.height), secaoHidden: document.getElementById('inicio').hidden, filhos: el.children.length }; });
  conferir('botão Painel do menu leva ao Início', estadoPainel.hash === '#inicio' && await pf.locator('#painel').isVisible(), JSON.stringify(estadoPainel));
  await ctxF.close();

  // Atalho do manifest / aula compartilhada
  const ctxG = await navegador.newContext();
  const pg2 = await ctxG.newPage();
  await pg2.goto(URL_BASE + '?modulo=modulo-4');
  await pg2.waitForFunction(() => !document.getElementById('splash'), null, { timeout: 8000 });
  conferir('?modulo=modulo-4 abre direto o Módulo 4 (atalhos e aulas compartilhadas)', await pg2.locator('#modulo-4').isVisible());
  await ctxG.close();

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
