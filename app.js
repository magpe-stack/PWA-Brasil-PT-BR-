/* =====================================================================
 * app.js — Lógica do PWA Brasil (PT-BR)
 * JavaScript puro (ES6+), sem frameworks. Cada seção é independente e
 * usa APIs reais do navegador: Service Worker, CacheStorage, Web Share,
 * Notification, localStorage, beforeinstallprompt, navigator.onLine.
 * ===================================================================== */
'use strict';

/* ---------------------------------------------------------------------
 * 0) UTILITÁRIOS
 * ------------------------------------------------------------------- */
const $ = (seletor, raiz = document) => raiz.querySelector(seletor);
const $$ = (seletor, raiz = document) => Array.from(raiz.querySelectorAll(seletor));

// localStorage pode lançar erro (modo privado, cota cheia, bloqueado).
// Estes helpers evitam que o app quebre nesses casos.
const Armazenamento = {
  ler(chave, padrao) {
    try {
      const bruto = localStorage.getItem('pwa-brasil:' + chave);
      return bruto === null ? padrao : JSON.parse(bruto);
    } catch (e) { return padrao; }
  },
  gravar(chave, valor) {
    try { localStorage.setItem('pwa-brasil:' + chave, JSON.stringify(valor)); return true; }
    catch (e) { return false; }
  }
};

let temporizadorToast = null;
function toast(mensagem, ms = 3000) {
  const el = $('#toast');
  el.textContent = mensagem;
  el.hidden = false;
  clearTimeout(temporizadorToast);
  temporizadorToast = setTimeout(() => { el.hidden = true; }, ms);
}

// Troca o texto de um elemento e (opcionalmente) a classe de estado.
function dizer(el, texto, estado) {
  el.textContent = texto;
  el.classList.remove('ok', 'erro');
  if (estado) el.classList.add(estado);
}

/* ---------------------------------------------------------------------
 * 1) TEMA CLARO / ESCURO (persistido no localStorage)
 * O <script> inline do <head> já aplicou o tema salvo antes da pintura.
 * ------------------------------------------------------------------- */
function iniciarTema() {
  const raiz = document.documentElement;
  const botao = $('#tema-btn');
  const icone = $('#tema-icone');
  const metaCor = $('meta[name="theme-color"]');

  const aplicar = (tema) => {
    raiz.setAttribute('data-tema', tema);
    const escuro = tema === 'escuro';
    icone.textContent = escuro ? '☀️' : '🌙';
    botao.setAttribute('aria-pressed', String(escuro));
    botao.setAttribute('aria-label', escuro ? 'Mudar para tema claro' : 'Mudar para tema escuro');
    if (metaCor) metaCor.setAttribute('content', escuro ? '#111418' : '#0b57d0');
  };

  aplicar(raiz.getAttribute('data-tema') || 'claro');

  botao.addEventListener('click', () => {
    const novo = raiz.getAttribute('data-tema') === 'escuro' ? 'claro' : 'escuro';
    aplicar(novo);
    try { localStorage.setItem('pwa-brasil:tema', novo); } catch (e) { /* ignora */ }
    // Mesmo padrão do <head>: a chave guarda texto simples (sem JSON).
  });
}

/* ---------------------------------------------------------------------
 * 2) SPLASH SCREEN (~2,8 s)
 * ------------------------------------------------------------------- */
function iniciarSplash() {
  const splash = $('#splash');
  // Depois de abrir um arquivo de progresso a página recarrega; não faz sentido repetir a abertura.
  try {
    if (sessionStorage.getItem('pwa-brasil:pular-splash')) {
      sessionStorage.removeItem('pwa-brasil:pular-splash');
      splash.remove();
      return;
    }
  } catch (e) { /* ignora */ }
  setTimeout(() => {
    splash.classList.add('splash--saindo');
    // Remove do DOM depois da animação de saída.
    setTimeout(() => splash.remove(), 600);
  }, 2800);
}

/* ---------------------------------------------------------------------
 * 3) DRAWER (menu lateral)
 * ------------------------------------------------------------------- */
function iniciarDrawer() {
  const drawer = $('#drawer');
  const overlay = $('#overlay');
  const abrir = $('#menu-btn');
  const fechar = $('#fechar-menu');
  const desktop = window.matchMedia('(min-width: 1100px)');

  const aberto = () => drawer.classList.contains('drawer--aberto');

  function abrirMenu() {
    drawer.classList.add('drawer--aberto');
    drawer.setAttribute('aria-hidden', 'false');
    overlay.hidden = false;
    abrir.setAttribute('aria-expanded', 'true');
    fechar.focus();
  }
  function fecharMenu(devolverFoco = true) {
    drawer.classList.remove('drawer--aberto');
    drawer.setAttribute('aria-hidden', String(!desktop.matches));
    overlay.hidden = true;
    abrir.setAttribute('aria-expanded', 'false');
    if (devolverFoco && !desktop.matches) abrir.focus();
  }

  abrir.addEventListener('click', abrirMenu);
  fechar.addEventListener('click', () => fecharMenu());
  overlay.addEventListener('click', () => fecharMenu());
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && aberto()) fecharMenu(); });

  // Clicar num link do menu fecha o drawer no mobile.
  $$('a', drawer).forEach((a) => a.addEventListener('click', () => { if (aberto()) fecharMenu(false); }));

  // Em telas grandes o menu é fixo (ver CSS) e deve ser lido por leitores de tela.
  const ajustar = () => {
    if (desktop.matches) { overlay.hidden = true; drawer.setAttribute('aria-hidden', 'false'); }
    else if (!aberto()) drawer.setAttribute('aria-hidden', 'true');
  };
  desktop.addEventListener('change', ajustar);
  ajustar();
}

/* ---------------------------------------------------------------------
 * 4) NAVEGAÇÃO ENTRE MÓDULOS (roteamento por hash: #modulo-3, #lab-cache)
 * ------------------------------------------------------------------- */
let moduloAtual = 'modulo-1';

function mostrarPelaHash(primeiraVez = false) {
  const id = decodeURIComponent(location.hash.replace('#', '')) || 'modulo-1';
  const alvo = document.getElementById(id);
  if (!alvo) return mostrarPelaHash.padrao();

  // O alvo pode ser o próprio módulo ou um laboratório dentro dele.
  const modulo = alvo.classList.contains('modulo') ? alvo : alvo.closest('.modulo');
  if (!modulo) return mostrarPelaHash.padrao();

  $$('.modulo').forEach((m) => { m.hidden = m !== modulo; });
  moduloAtual = modulo.id;
  document.title = modulo.dataset.titulo + ' — PWA Brasil (PT-BR)';

  // Marca o item ativo no menu.
  $$('.menu a').forEach((a) => {
    const ativo = a.getAttribute('href') === '#' + id;
    if (ativo) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });

  if (alvo === modulo) window.scrollTo({ top: 0, behavior: 'auto' });
  else alvo.scrollIntoView({ behavior: 'smooth', block: 'start' });

  if (!primeiraVez && alvo === modulo) $('#conteudo').focus({ preventScroll: true });

  // Ao abrir um módulo que tem laboratório com dados ao vivo, atualiza esses dados.
  // (Procuramos pelo laboratório, e não pelo número do módulo, para não quebrar se a ordem mudar.)
  if (modulo.querySelector('#lab-cache')) { atualizarInfoSW(); listarCache(); }
  if (modulo.querySelector('#lab-atualizacao')) pedirVersaoAoSW();
}
mostrarPelaHash.padrao = () => { history.replaceState(null, '', '#modulo-1'); mostrarPelaHash(true); };

function iniciarNavegacao() {
  // Atalhos do manifest abrem com ?modulo=modulo-3: converte em hash.
  const parametro = new URLSearchParams(location.search).get('modulo');
  if (parametro && document.getElementById(parametro)) {
    history.replaceState(null, '', location.pathname + '#' + parametro);
  }
  window.addEventListener('hashchange', () => mostrarPelaHash());
  mostrarPelaHash(true);
}

/* ---------------------------------------------------------------------
 * 5) PROGRESSO DO ALUNO (localStorage)
 * ------------------------------------------------------------------- */
// O total vem do HTML: cada módulo tem um botão "concluir". Assim, ao criar
// um módulo novo, basta copiar o botão; não é preciso mexer neste número.
const TOTAL_MODULOS = $$('.btn-concluir').length;
// Chave "progresso-v2": o curso foi reorganizado em 7 módulos e a numeração antiga não vale mais.
let concluidos = Armazenamento.ler('progresso-v2', []).filter((id) => document.getElementById(id));

function desenharProgresso() {
  const n = concluidos.length;
  $('#progresso-barra').style.width = (n / TOTAL_MODULOS) * 100 + '%';
  $('#progresso-texto').textContent = `${n} de ${TOTAL_MODULOS} módulos concluídos`;

  $$('.menu a[data-modulo]').forEach((a) => {
    const marca = $('.menu__ok', a);
    if (marca && a.closest('.menu--labs') === null) marca.classList.toggle('feito', concluidos.includes(a.dataset.modulo));
  });

  $$('.btn-concluir').forEach((b) => {
    const feito = concluidos.includes(b.dataset.modulo);
    b.setAttribute('aria-pressed', String(feito));
    b.textContent = feito ? '✓ Concluído (clique para desfazer)' : 'Marcar módulo como concluído';
  });

  $('#parabens').hidden = n < TOTAL_MODULOS;
}

function iniciarProgresso() {
  $$('.btn-concluir').forEach((b) => {
    b.addEventListener('click', () => {
      const id = b.dataset.modulo;
      concluidos = concluidos.includes(id) ? concluidos.filter((m) => m !== id) : [...concluidos, id];
      Armazenamento.gravar('progresso-v2', concluidos);
      desenharProgresso();
      if (concluidos.includes(id)) toast('Módulo concluído! 🎉');
    });
  });
  // O quiz (quiz.js) avisa por um evento quando o aluno é aprovado.
  // Aqui marcamos o módulo como concluído, sem desmarcar se já estava.
  document.addEventListener('quiz:aprovado', (e) => {
    const id = e.detail.modulo;
    if (!concluidos.includes(id)) {
      concluidos = [...concluidos, id];
      Armazenamento.gravar('progresso-v2', concluidos);
      desenharProgresso();
      toast('Quiz aprovado! Módulo concluído. 🎉');
    }
  });

  desenharProgresso();
}

/* ---------------------------------------------------------------------
 * 6) STATUS DA REDE (navigator.onLine + eventos online/offline)
 * ------------------------------------------------------------------- */
function iniciarRede() {
  const badge = $('#badge-rede');
  const texto = $('span', badge);

  const atualizar = () => {
    const online = navigator.onLine;
    badge.className = 'badge ' + (online ? 'badge--ok' : 'badge--erro');
    texto.textContent = online ? 'Online' : 'Offline';
  };

  window.addEventListener('online', () => { atualizar(); toast('Conexão restabelecida.'); });
  window.addEventListener('offline', () => { atualizar(); toast('Você está offline. O app continua funcionando!'); });
  atualizar();
}

/* ---------------------------------------------------------------------
 * 7) SERVICE WORKER: registro, monitoramento e atualização
 * ------------------------------------------------------------------- */
let swReg = null;                 // registro do Service Worker
let atualizacaoSolicitada = false; // true só quando o aluno clicou em "Atualizar agora"

function definirBadgeSW(texto, tipo, pulsando = false) {
  const badge = $('#badge-sw');
  badge.className = `badge badge--${tipo}` + (pulsando ? ' badge--pulsando' : '');
  $('span:last-child', badge).textContent = 'SW: ' + texto;
}

function mostrarBannerAtualizacao() {
  $('#banner-atualizacao').hidden = false;
  definirBadgeSW('Atualização disponível', 'aviso');
  atualizarInfoSW();
}

function acompanharWorker(worker) {
  worker.addEventListener('statechange', () => {
    atualizarInfoSW();
    if (worker.state === 'installing') definirBadgeSW('Instalando…', 'info', true);
    if (worker.state === 'installed') {
      // "installed" COM controller = havia um SW antigo: temos uma versão nova esperando.
      if (navigator.serviceWorker.controller) mostrarBannerAtualizacao();
      else definirBadgeSW('Instalado', 'info');
    }
    if (worker.state === 'activated' && $('#banner-atualizacao').hidden) {
      definirBadgeSW('Ativo', 'ok');
      pedirVersaoAoSW();
    }
  });
}

async function iniciarServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    definirBadgeSW('sem suporte', 'erro');
    atualizarInfoSW();
    return;
  }
  if (!window.isSecureContext) {
    definirBadgeSW('exige HTTPS', 'erro');
    atualizarInfoSW();
    return;
  }

  // Quando um novo SW assume o controle (após skipWaiting), recarregamos
  // — mas só se o aluno pediu, para não recarregar na primeira instalação.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    atualizarInfoSW();
    if (atualizacaoSolicitada) location.reload();
  });

  // Respostas do SW (ex.: versão do cache).
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data && e.data.tipo === 'VERSAO') {
      $$('[data-sw="versao"]').forEach((el) => { el.textContent = e.data.versao; });
      $('#versao-sw').textContent = e.data.versao;
    }
  });

  try {
    // Caminho relativo: o escopo padrão é a pasta onde está o sw.js.
    swReg = await navigator.serviceWorker.register('./sw.js');
  } catch (erro) {
    console.error('Falha ao registrar o Service Worker:', erro);
    definirBadgeSW('erro no registro', 'erro');
    atualizarInfoSW();
    return;
  }

  // Estado inicial no momento do registro:
  if (swReg.installing) { definirBadgeSW('Instalando…', 'info', true); acompanharWorker(swReg.installing); }
  else if (swReg.waiting && navigator.serviceWorker.controller) mostrarBannerAtualizacao();
  else if (swReg.active) { definirBadgeSW('Ativo', 'ok'); pedirVersaoAoSW(); }

  // Um novo sw.js foi encontrado no servidor:
  swReg.addEventListener('updatefound', () => {
    definirBadgeSW('Instalando…', 'info', true);
    acompanharWorker(swReg.installing);
    atualizarInfoSW();
  });

  atualizarInfoSW();
}

// Pergunta ao SW qual é a versão do cache dele (comunicação via postMessage).
function pedirVersaoAoSW() {
  const alvo = navigator.serviceWorker && (navigator.serviceWorker.controller || (swReg && swReg.active));
  if (alvo) alvo.postMessage({ tipo: 'PEDIR_VERSAO' });
}

function atualizarInfoSW() {
  const campo = (nome, valor) => { const el = $(`[data-sw="${nome}"]`); if (el) el.textContent = valor; };
  const suporta = 'serviceWorker' in navigator;
  campo('suporte', suporta ? 'Sim' : 'Não');
  if (!suporta) return;
  campo('controle', navigator.serviceWorker.controller ? 'Sim' : 'Não (recarregue a página)');
  if (swReg) {
    campo('escopo', swReg.scope);
    const w = swReg.installing || swReg.waiting || swReg.active;
    const rotulo = swReg.installing ? 'installing' : swReg.waiting ? 'waiting (nova versão aguardando)' : 'active';
    campo('estado', w ? `${rotulo} / ${w.state}` : 'nenhum');
  } else {
    campo('estado', 'não registrado');
  }
}

function iniciarBanner() {
  $('#btn-atualizar').addEventListener('click', () => {
    if (swReg && swReg.waiting) {
      atualizacaoSolicitada = true;
      // Pede ao SW em espera para assumir; o 'controllerchange' recarrega a página.
      swReg.waiting.postMessage({ tipo: 'PULAR_ESPERA' });
    } else {
      location.reload();
    }
  });
  $('#btn-dispensar').addEventListener('click', () => { $('#banner-atualizacao').hidden = true; });

  // Laboratório do módulo 5: força a busca por um novo sw.js.
  $('#btn-checar-atualizacao').addEventListener('click', async () => {
    const saida = $('#atualizacao-status');
    if (!swReg) return dizer(saida, 'Service Worker não registrado neste navegador.', 'erro');
    dizer(saida, 'Consultando o servidor por um novo sw.js…');
    try {
      await swReg.update(); // compara o sw.js do servidor, byte a byte, com o atual
      if (swReg.waiting || swReg.installing) dizer(saida, 'Nova versão encontrada! Veja o banner no topo.', 'ok');
      else dizer(saida, 'Você já está na versão mais recente.', 'ok');
    } catch (erro) {
      dizer(saida, 'Não foi possível verificar (você está offline?): ' + erro.message, 'erro');
    }
  });
}

/* ---------------------------------------------------------------------
 * 8) MÓDULO 1 — CHECKLIST DE PRONTIDÃO
 * ------------------------------------------------------------------- */
function iniciarChecklist() {
  const caixas = $$('#checklist input[data-item]');
  const saida = $('#checklist-resultado');
  const salvos = Armazenamento.ler('checklist', {});

  const contar = () => {
    const n = caixas.filter((c) => c.checked).length;
    dizer(saida, `${n} de ${caixas.length} itens concluídos.` + (n === caixas.length ? ' Seu PWA está pronto! 🚀' : ''), n === caixas.length ? 'ok' : undefined);
    const estado = {};
    caixas.forEach((c) => { estado[c.dataset.item] = c.checked; });
    Armazenamento.gravar('checklist', estado);
  };

  caixas.forEach((c) => {
    c.checked = !!salvos[c.dataset.item];
    c.addEventListener('change', contar);
  });
  contar();

  // Auto-verificação: o app inspeciona a si mesmo com APIs reais.
  $('#btn-auto-checklist').addEventListener('click', async (ev) => {
    const botao = ev.currentTarget;
    botao.disabled = true;
    const resultados = await verificarApp();
    Object.entries(resultados).forEach(([item, r]) => {
      const marca = $(`[data-auto="${item}"]`);
      marca.textContent = r.ok ? '✔ verificado' : '✘ ' + r.dica;
      marca.className = 'auto ' + (r.ok ? 'ok' : 'falha');
      const caixa = $(`#checklist input[data-item="${item}"]`);
      if (caixa && r.ok) caixa.checked = true;
    });
    contar();
    botao.disabled = false;
  });

  $('#btn-limpar-checklist').addEventListener('click', () => {
    caixas.forEach((c) => { c.checked = false; });
    $$('.auto').forEach((a) => { a.textContent = ''; a.className = 'auto'; });
    contar();
  });
}

async function verificarApp() {
  const r = {};
  r.https = { ok: window.isSecureContext, dica: 'abra via https:// ou localhost' };

  // Manifest: existe o <link>, o arquivo carrega e é JSON com nome?
  let manifest = null;
  const link = $('link[rel="manifest"]');
  try {
    const resp = await fetch(link.href);
    manifest = await resp.json();
    r.manifest = { ok: resp.ok && !!manifest.name, dica: 'manifest inválido' };
  } catch (e) { r.manifest = { ok: false, dica: 'não foi possível ler o manifest' }; }

  r.sw = { ok: !!(navigator.serviceWorker && navigator.serviceWorker.controller), dica: 'recarregue a página após o 1º registro' };

  const icones = (manifest && manifest.icons) || [];
  const tem = (tam) => icones.some((i) => (i.sizes || '').includes(tam));
  const maskable = icones.some((i) => (i.purpose || '').includes('maskable'));
  r.icones = { ok: tem('192x192') && tem('512x512') && maskable, dica: 'faltam 192, 512 ou maskable' };

  let emCache = false;
  try { emCache = 'caches' in window && !!(await caches.match('./index.html')); } catch (e) { /* ignora */ }
  r.offline = { ok: emCache, dica: 'App Shell ainda não está no cache' };

  r.viewport = { ok: !!$('meta[name="viewport"]'), dica: 'adicione a meta viewport' };
  r.tema = { ok: !!$('meta[name="theme-color"]'), dica: 'adicione a meta theme-color' };
  return r;
}

/* ---------------------------------------------------------------------
 * 9) MÓDULO 2 — INSTALAÇÃO E INSPETOR DE MANIFEST
 * ------------------------------------------------------------------- */
let eventoInstalacao = null;

function iniciarInstalacao() {
  const botao = $('#btn-instalar');
  const status = $('#instalar-status');

  const jaInstalado = () =>
    window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

  if (jaInstalado()) {
    dizer(status, 'Você já está usando o PWA Brasil instalado. 🎉', 'ok');
  } else {
    dizer(status, 'Aguardando o navegador avisar que o app pode ser instalado…');
    // Se o aviso não chegar, explicamos os motivos mais comuns em linguagem simples.
    setTimeout(() => {
      if (eventoInstalacao || jaInstalado()) return;
      const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
      dizer(status, ios
        ? 'No iPhone/iPad não existe botão automático. Toque em Compartilhar e depois em "Adicionar à Tela de Início".'
        : 'O botão não foi liberado. Os motivos mais comuns: o app já está instalado; o "porteiro" (Service Worker) ainda está começando, então recarregue a página; ou o seu navegador não oferece esse recurso (por exemplo, o Firefox no computador). Você ainda pode instalar pelo menu do navegador.');
    }, 4000);
  }

  // O navegador avisa que o app É instalável. Guardamos o evento.
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    eventoInstalacao = e;
    botao.disabled = false;
    dizer(status, 'Pronto! O navegador liberou a instalação. Clique no botão.', 'ok');
  });

  botao.addEventListener('click', async () => {
    if (!eventoInstalacao) return;
    eventoInstalacao.prompt(); // mostra o diálogo nativo (só pode ser chamado uma vez)
    const { outcome } = await eventoInstalacao.userChoice;
    dizer(status, outcome === 'accepted' ? 'Instalação aceita! Procure o ícone na sua tela inicial.' : 'Instalação dispensada. Você pode tentar de novo depois.', outcome === 'accepted' ? 'ok' : undefined);
    eventoInstalacao = null;
    botao.disabled = true;
  });

  // Disparado depois que a instalação termina.
  window.addEventListener('appinstalled', () => {
    eventoInstalacao = null;
    botao.disabled = true;
    dizer(status, 'PWA Brasil instalado com sucesso! 🎉', 'ok');
    toast('App instalado!');
  });

  // Inspetor do manifest
  $('#btn-carregar-manifest').addEventListener('click', carregarManifest);
}

async function carregarManifest() {
  const saida = $('#manifest-saida');
  const resumo = $('#manifest-resumo');
  const link = $('link[rel="manifest"]');
  saida.textContent = 'Buscando ' + link.href + ' …';
  resumo.replaceChildren();

  try {
    const resp = await fetch(link.href);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const manifest = await resp.json();
    saida.textContent = JSON.stringify(manifest, null, 2);

    // Cartões de resumo (montados com DOM seguro, sem innerHTML)
    const campos = [['Nome', manifest.name], ['Nome curto', manifest.short_name], ['Display', manifest.display],
      ['start_url', manifest.start_url], ['Scope', manifest.scope], ['theme_color', manifest.theme_color]];
    campos.forEach(([rotulo, valor]) => {
      const caixa = document.createElement('div');
      const r = document.createElement('span'); r.textContent = rotulo;
      const v = document.createElement('strong'); v.textContent = valor || '—';
      caixa.append(r, v);
      resumo.append(caixa);
    });

    const caixaIcones = document.createElement('div');
    const r = document.createElement('span'); r.textContent = 'Ícones';
    caixaIcones.append(r);
    (manifest.icons || []).forEach((ic) => {
      const img = document.createElement('img');
      img.src = new URL(ic.src, link.href).href;
      img.alt = `Ícone ${ic.sizes} (${ic.purpose || 'any'})`;
      img.title = img.alt;
      caixaIcones.append(img);
    });
    resumo.append(caixaIcones);
  } catch (erro) {
    saida.textContent = 'Erro ao ler o manifest: ' + erro.message;
  }
}

/* ---------------------------------------------------------------------
 * 10) MÓDULO 3 — INSPETOR DE CACHE (CacheStorage) E TESTE DE ESTRATÉGIAS
 * ------------------------------------------------------------------- */
async function listarCache() {
  const area = $('#cache-lista');
  if (!('caches' in window)) {
    area.textContent = 'CacheStorage não é suportado neste contexto (use HTTPS ou localhost).';
    return;
  }
  try {
    const nomes = await caches.keys();
    area.replaceChildren();
    if (!nomes.length) {
      const p = document.createElement('p');
      p.className = 'nota';
      p.textContent = 'Nenhum cache encontrado. Aguarde o Service Worker instalar e atualize a lista.';
      area.append(p);
      return;
    }
    for (const nome of nomes) {
      const cache = await caches.open(nome);
      const pedidos = await cache.keys();

      const grupo = document.createElement('section');
      grupo.className = 'cache-grupo';
      const cab = document.createElement('header');
      const titulo = document.createElement('span'); titulo.textContent = nome;
      const qtd = document.createElement('span'); qtd.textContent = pedidos.length + (pedidos.length === 1 ? ' arquivo' : ' arquivos');
      cab.append(titulo, qtd);
      const ul = document.createElement('ul');
      pedidos.forEach((p) => {
        const li = document.createElement('li');
        li.textContent = new URL(p.url).pathname; // textContent = seguro contra XSS
        ul.append(li);
      });
      grupo.append(cab, ul);
      area.append(grupo);
    }
  } catch (erro) {
    area.textContent = 'Erro ao ler o cache: ' + erro.message;
  }
}

async function limparCache() {
  if (!('caches' in window)) return;
  if (!confirm('Apagar TODOS os caches deste app? Para voltar a funcionar offline, recarregue a página com internet.')) return;
  const nomes = await caches.keys();
  await Promise.all(nomes.map((n) => caches.delete(n)));
  toast(`${nomes.length} cache(s) apagado(s).`);
  listarCache();
}

async function testarEstrategia() {
  const saida = $('#lab-resultado');
  if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) {
    saida.textContent = 'O Service Worker (o "porteiro") ainda não está controlando esta página. Isso é normal na primeira visita: recarregue a página uma vez e tente de novo.';
    return;
  }
  const estrategia = $('#lab-estrategia').value;
  // Mantém apenas caracteres seguros no nome do recurso.
  const recurso = ($('#lab-recurso').value.trim().replace(/[^\w-]/g, '') || 'aula-1').slice(0, 40);
  const falhar = $('#lab-falhar').checked;
  const url = new URL(`__lab__/${estrategia}/${recurso}${falhar ? '?falhar=1' : ''}`, location.href);

  saida.textContent = `GET ${url.pathname}${url.search}\nAguardando resposta do Service Worker…`;
  const inicio = performance.now();
  try {
    const resp = await fetch(url);
    const corpo = await resp.text();
    const ms = Math.round(performance.now() - inicio);
    saida.textContent =
      `GET ${url.pathname}${url.search}\n` +
      `Status ........... ${resp.status}\n` +
      `Estratégia ....... ${resp.headers.get('X-SW-Strategy')}\n` +
      `Respondeu de ..... ${resp.headers.get('X-SW-Origem')}\n` +
      `Tempo ............ ${ms} ms\n` +
      `Corpo ............ ${corpo}`;
    listarCache(); // mostra o novo item guardado no cache
  } catch (erro) {
    saida.textContent = 'Falha na requisição: ' + erro.message;
  }
}

function iniciarInspetorCache() {
  $('#btn-cache-atualizar').addEventListener('click', listarCache);
  $('#btn-cache-limpar').addEventListener('click', limparCache);
  $('#btn-lab-testar').addEventListener('click', testarEstrategia);
}

/* ---------------------------------------------------------------------
 * 11) MÓDULO 4 — ARMAZENAMENTO, WEB SHARE E NOTIFICAÇÕES
 * ------------------------------------------------------------------- */
function iniciarRecursosNativos() {
  // --- Armazenamento local ---
  const campo = $('#storage-input');
  const saidaStorage = $('#storage-saida');
  const apelido = Armazenamento.ler('apelido', '');
  if (apelido) { campo.value = apelido; dizer(saidaStorage, `Olá, ${apelido}! Seu apelido foi lido do localStorage.`, 'ok'); }
  $('#btn-storage-salvar').addEventListener('click', () => {
    const valor = campo.value.trim();
    const ok = Armazenamento.gravar('apelido', valor);
    dizer(saidaStorage, ok ? (valor ? `Salvo! Feche e reabra o app: "${valor}" continuará aqui.` : 'Apelido removido.') : 'Não foi possível gravar (armazenamento bloqueado).', ok ? 'ok' : 'erro');
  });

  // --- Web Share API ---
  const statusShare = $('#share-status');
  const compartilhar = async (dados) => {
    if (navigator.share && (!navigator.canShare || navigator.canShare(dados))) {
      try {
        await navigator.share(dados);
        dizer(statusShare, 'Compartilhado com sucesso!', 'ok');
      } catch (erro) {
        // AbortError = o usuário fechou a folha de compartilhamento (não é falha).
        if (erro.name === 'AbortError') dizer(statusShare, 'Compartilhamento cancelado.');
        else dizer(statusShare, 'Erro ao compartilhar: ' + erro.message, 'erro');
      }
    } else if (navigator.clipboard) {
      // Plano B honesto: o navegador não tem Web Share, então copiamos o link.
      try {
        await navigator.clipboard.writeText(dados.url);
        dizer(statusShare, 'Este navegador não suporta a Web Share API. O link foi copiado para a área de transferência.', 'ok');
      } catch (e) { dizer(statusShare, 'Web Share indisponível e a cópia foi bloqueada. Link: ' + dados.url, 'erro'); }
    } else {
      dizer(statusShare, 'Web Share indisponível. Copie o link: ' + dados.url, 'erro');
    }
  };

  const base = location.origin + location.pathname;
  $('#btn-compartilhar-app').addEventListener('click', () => compartilhar({
    title: 'PWA Brasil (PT-BR)',
    text: 'Aprenda a criar e publicar PWAs na prática, em português!',
    url: base
  }));
  $('#btn-compartilhar-aula').addEventListener('click', () => {
    const titulo = document.getElementById(moduloAtual).dataset.titulo;
    compartilhar({ title: titulo + ' — PWA Brasil (PT-BR)', text: 'Estou aprendendo: ' + titulo, url: base + '#' + moduloAtual });
  });

  // --- Notificações ---
  const botaoPedir = $('#btn-notif');
  const botaoTeste = $('#btn-notif-teste');
  const statusNotif = $('#notif-status');

  const mostrarPermissao = () => {
    if (!('Notification' in window)) {
      botaoPedir.disabled = true;
      return dizer(statusNotif, 'Este navegador não suporta a Notification API.', 'erro');
    }
    const p = Notification.permission; // 'default' | 'granted' | 'denied'
    const texto = {
      default: 'Permissão: ainda não solicitada.',
      granted: 'Permissão: concedida ✔',
      denied: 'Permissão: negada. Para reverter, altere nas configurações do site no navegador.'
    }[p];
    dizer(statusNotif, texto, p === 'granted' ? 'ok' : p === 'denied' ? 'erro' : undefined);
    botaoTeste.disabled = p !== 'granted';
    botaoPedir.disabled = p !== 'default';
  };
  mostrarPermissao();

  // A permissão só deve ser pedida em resposta a um clique (gesto do usuário).
  botaoPedir.addEventListener('click', async () => {
    await Notification.requestPermission();
    mostrarPermissao();
  });

  botaoTeste.addEventListener('click', async () => {
    const opcoes = { body: 'Notificação local enviada pelo Service Worker.', icon: 'icon-192.png', badge: 'icon-192.png', tag: 'teste-pwa-brasil' };
    try {
      const reg = swReg || (await navigator.serviceWorker.getRegistration());
      if (reg) await reg.showNotification('PWA Brasil (PT-BR)', opcoes);
      else new Notification('PWA Brasil (PT-BR)', opcoes); // fallback sem SW
      toast('Notificação enviada.');
    } catch (erro) {
      dizer(statusNotif, 'Não foi possível exibir: ' + erro.message, 'erro');
    }
  });
}

/* ---------------------------------------------------------------------
 * 11b) MÓDULO 1 — EDITOR DE HTML AO VIVO E "ESPIAR O CÓDIGO"
 * ------------------------------------------------------------------- */
function iniciarLaboratoriosHTML() {
  const editor = $('#editor-html');
  const previa = $('#preview-html');

  const EXEMPLO = [
    '<h1 style="color: #0b57d0;">Olá, mundo!</h1>',
    '<p>Edite este texto e veja o resultado ao lado.</p>',
    '<button>Um botão</button>',
    '<ul>',
    '  <li>Item 1</li>',
    '  <li>Item 2</li>',
    '</ul>'
  ].join('\n');

  // O resultado aparece dentro de um <iframe> com sandbox="" (sem permissões):
  // ele mostra HTML e CSS, mas não executa scripts. Assim é seguro experimentar.
  const desenhar = () => {
    previa.srcdoc =
      '<!doctype html><html lang="pt-BR"><meta charset="utf-8">' +
      '<style>body{font-family:system-ui,sans-serif;padding:12px;background:#fff;color:#111}</style>' +
      '<body>' + editor.value + '</body></html>';
  };

  editor.value = EXEMPLO;
  desenhar();
  editor.addEventListener('input', desenhar);
  $('#btn-resetar-html').addEventListener('click', () => { editor.value = EXEMPLO; desenhar(); });

  // Mostra o começo do index.html real, buscado com fetch().
  $('#btn-ver-fonte').addEventListener('click', async () => {
    const saida = $('#fonte-saida');
    saida.textContent = 'Buscando o arquivo index.html…';
    try {
      const resp = await fetch('./index.html');
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const linhas = (await resp.text()).split('\n');
      const limite = 45;
      saida.textContent = linhas.slice(0, limite).join('\n') +
        `\n\n… (mostrando ${limite} de ${linhas.length} linhas)`;
    } catch (erro) {
      saida.textContent = 'Não foi possível buscar o arquivo: ' + erro.message;
    }
  });
}

/* Coloca um botão "Copiar" em cada bloco de código de exemplo. */
function iniciarBotoesCopiar() {
  $$('pre.codigo:not(.codigo--saida)').forEach((pre) => {
    pre.classList.add('codigo--copiavel');
    const botao = document.createElement('button');
    botao.type = 'button';
    botao.className = 'copiar';
    botao.textContent = 'Copiar';
    botao.setAttribute('aria-label', 'Copiar este código');
    botao.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText($('code', pre).textContent);
        botao.textContent = 'Copiado ✔';
      } catch (e) {
        botao.textContent = 'Selecione e use Ctrl+C';
      }
      setTimeout(() => { botao.textContent = 'Copiar'; }, 2000);
    });
    pre.append(botao);
  });
}

/* ---------------------------------------------------------------------
 * 11c) CERTIFICADO DE CONCLUSÃO (desenhado em <canvas>, 100% no aparelho)
 * Liberado quando os 7 quizzes têm a melhor nota >= 70%.
 * ------------------------------------------------------------------- */
const NOTA_CERTIFICADO = 70;

function lerNotasQuiz() {
  try { return JSON.parse(localStorage.getItem('pwa-brasil:quiz-v1')) || {}; } catch (e) { return {}; }
}

// Devolve a situação de cada quiz e se o certificado está liberado.
function situacaoCertificado() {
  const notas = lerNotasQuiz();
  const itens = $$('.quiz[data-quiz]').map((q) => {
    const id = q.dataset.quiz;
    const secao = document.getElementById(id);
    const melhor = notas[id] ? notas[id].melhor : null;
    return { id, titulo: secao ? secao.dataset.titulo : id, melhor, aprovado: melhor !== null && melhor >= NOTA_CERTIFICADO };
  });
  const aprovados = itens.filter((i) => i.aprovado);
  const media = aprovados.length ? Math.round(aprovados.reduce((t, i) => t + i.melhor, 0) / aprovados.length) : 0;
  return { itens, liberado: itens.length > 0 && aprovados.length === itens.length, media };
}

function desenharListaCertificado() {
  const lista = $('#cert-lista');
  const { itens, liberado } = situacaoCertificado();
  lista.replaceChildren();
  itens.forEach((i) => {
    const li = document.createElement('li');
    li.className = 'cert-item';
    const nome = document.createElement('span'); nome.textContent = i.titulo;
    const marca = document.createElement('strong');
    marca.className = i.aprovado ? 'ok' : 'pendente';
    marca.textContent = i.aprovado ? `✔ ${i.melhor}%` : (i.melhor === null ? 'ainda não feito' : `✘ ${i.melhor}% (precisa de ${NOTA_CERTIFICADO}%)`);
    li.append(nome, marca);
    lista.append(li);
  });
  const feitos = itens.filter((i) => i.aprovado).length;
  const status = $('#cert-status');
  dizer(status, liberado ? 'Tudo certo! Seu certificado está liberado. 🎓' : `${feitos} de ${itens.length} quizzes aprovados. Faltam ${itens.length - feitos}.`, liberado ? 'ok' : undefined);
  $('#btn-cert-gerar').disabled = !liberado;
}

// Reduz a fonte até o texto caber na largura máxima.
function ajustarFonte(ctx, texto, familia, tamanho, larguraMax) {
  let t = tamanho;
  do { ctx.font = `bold ${t}px ${familia}`; t -= 2; } while (ctx.measureText(texto).width > larguraMax && t > 24);
}

async function desenharCertificado(nome, media) {
  const canvas = $('#cert-canvas');
  const ctx = canvas.getContext('2d');
  const L = canvas.width, A = canvas.height, cx = L / 2;
  const serifa = 'Georgia, "Times New Roman", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  // Fundo e molduras (azul, verde e amarelo: as cores do app)
  ctx.fillStyle = '#fffdf7'; ctx.fillRect(0, 0, L, A);
  ctx.strokeStyle = '#0b57d0'; ctx.lineWidth = 16; ctx.strokeRect(40, 40, L - 80, A - 80);
  ctx.strokeStyle = '#009c3b'; ctx.lineWidth = 5; ctx.strokeRect(70, 70, L - 140, A - 140);
  ctx.strokeStyle = '#e6b800'; ctx.lineWidth = 3; ctx.strokeRect(84, 84, L - 168, A - 168);

  // Logotipo do app (o ícone já está no cache; se falhar, segue sem ele)
  try {
    const img = new Image();
    img.src = 'icon-512.png';
    await img.decode();
    ctx.drawImage(img, cx - 80, 130, 160, 160);
  } catch (e) { /* sem logotipo */ }

  ctx.fillStyle = '#0b57d0';
  ctx.font = `bold 34px ${serifa}`;
  ctx.fillText('PWA BRASIL (PT-BR)', cx, 345);

  ctx.fillStyle = '#1a1c1e';
  ctx.font = `bold 84px ${serifa}`;
  ctx.fillText('CERTIFICADO DE CONCLUSÃO', cx, 460);

  ctx.font = `italic 36px ${serifa}`;
  ctx.fillStyle = '#44474e';
  ctx.fillText('Certificamos que', cx, 560);

  // Nome (encolhe se for longo) com uma linha embaixo
  ctx.fillStyle = '#0b57d0';
  ajustarFonte(ctx, nome, serifa, 110, L - 360);
  ctx.fillText(nome, cx, 690);
  ctx.strokeStyle = '#c4c7d0'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(300, 725); ctx.lineTo(L - 300, 725); ctx.stroke();

  ctx.fillStyle = '#1a1c1e';
  ctx.font = `36px ${serifa}`;
  ctx.fillText('concluiu com aproveitamento o curso', cx, 805);
  ctx.font = `bold 52px ${serifa}`;
  ctx.fillText('PWA Brasil (PT-BR): alfabetização em PWA', cx, 880);
  ctx.font = `32px ${serifa}`;
  ctx.fillStyle = '#44474e';
  const n = $$('.quiz[data-quiz]').length;
  ctx.fillText(`${n} módulos concluídos, com aprovação em ${n} quizzes (média de ${media}%).`, cx, 945);

  const data = new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
  ctx.fillStyle = '#1a1c1e';
  ctx.font = `34px ${serifa}`;
  ctx.fillText(`Emitido em ${data}`, cx, 1040);

  ctx.fillStyle = '#6b6f78';
  ctx.font = `24px ${serifa}`;
  ctx.fillText('Certificado de participação emitido automaticamente pelo aplicativo, sem validade oficial.', cx, 1130);
}

function iniciarCertificado() {
  const campoNome = $('#cert-nome');
  const botao = $('#btn-cert-gerar');
  const erro = $('#cert-erro');
  campoNome.value = Armazenamento.ler('nome-certificado', '');

  desenharListaCertificado();
  document.addEventListener('quiz:aprovado', desenharListaCertificado);
  window.addEventListener('hashchange', () => { if (location.hash === '#certificado') desenharListaCertificado(); });

  botao.addEventListener('click', async () => {
    dizer(erro, '');
    const nome = campoNome.value.trim().replace(/\s+/g, ' ');
    const situacao = situacaoCertificado();
    if (!situacao.liberado) return dizer(erro, 'Aprovação nos 7 quizzes ainda pendente.', 'erro');
    if (nome.length < 3) return dizer(erro, 'Digite o seu nome (pelo menos 3 letras).', 'erro');
    Armazenamento.gravar('nome-certificado', nome);

    botao.disabled = true;
    await desenharCertificado(nome, situacao.media);
    botao.disabled = false;
    $('#cert-resultado').hidden = false;
    $('#cert-canvas').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    toast('Certificado gerado! 🎓');
  });

  $('#btn-cert-baixar').addEventListener('click', () => {
    $('#cert-canvas').toBlob((blob) => {
      if (!blob) return dizer(erro, 'Não foi possível criar a imagem.', 'erro');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'certificado-pwa-brasil.png';
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }, 'image/png');
  });
}

/* ---------------------------------------------------------------------
 * 11d) SALVAR E ABRIR O PROGRESSO EM ARQUIVO
 * Usa a File System Access API (showSaveFilePicker / showOpenFilePicker) quando
 * existe (Chrome e Edge no computador). Nos outros navegadores, usa o download
 * comum e o seletor de arquivo <input type="file">, que funcionam em qualquer lugar.
 * ------------------------------------------------------------------- */
const NOME_APP = 'PWA Brasil (PT-BR)';
const FORMATO_ARQUIVO = 1;
const TAMANHO_MAXIMO_ARQUIVO = 200 * 1024; // 200 KB: o arquivo real tem poucos KB
const CHAVES_PROGRESSO = ['progresso-v2', 'quiz-v1', 'checklist', 'apelido', 'nome-certificado', 'tema'];
const TIPOS_ARQUIVO = [{ description: 'Progresso do PWA Brasil', accept: { 'application/json': ['.json'] } }];

// Junta o que está salvo neste navegador (textos exatamente como estão no localStorage).
function coletarProgresso() {
  const dados = {};
  CHAVES_PROGRESSO.forEach((chave) => {
    try {
      const valor = localStorage.getItem('pwa-brasil:' + chave);
      if (valor !== null) dados[chave] = valor;
    } catch (e) { /* ignora */ }
  });
  return { app: NOME_APP, formato: FORMATO_ARQUIVO, salvoEm: new Date().toISOString(), dados };
}

// Nunca confiamos no conteúdo do arquivo: cada campo é conferido e só o que for válido é aproveitado.
function validarProgresso(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { erro: 'O arquivo não tem o formato esperado.' };
  if (obj.app !== NOME_APP) return { erro: 'Este arquivo não é do ' + NOME_APP + '.' };
  if (obj.formato !== FORMATO_ARQUIVO) return { erro: 'Este arquivo foi salvo por uma versão diferente do curso.' };
  if (!obj.dados || typeof obj.dados !== 'object' || Array.isArray(obj.dados)) return { erro: 'O arquivo está sem dados de progresso.' };

  const modulos = $$('.btn-concluir').map((b) => b.dataset.modulo);
  const itensChecklist = $$('#checklist input[data-item]').map((c) => c.dataset.item);
  const lerJSON = (chave) => { try { return JSON.parse(obj.dados[chave]); } catch (e) { return undefined; } };
  const limpo = {};

  const feitos = lerJSON('progresso-v2');
  if (Array.isArray(feitos)) limpo.concluidos = [...new Set(feitos.filter((id) => modulos.includes(id)))];

  const notas = lerJSON('quiz-v1');
  if (notas && typeof notas === 'object' && !Array.isArray(notas)) {
    limpo.quiz = {};
    modulos.forEach((id) => {
      const n = notas[id];
      if (n && Number.isFinite(n.melhor) && n.melhor >= 0 && n.melhor <= 100) {
        const tent = Number.isFinite(n.tentativas) ? Math.min(Math.max(Math.round(n.tentativas), 1), 9999) : 1;
        limpo.quiz[id] = { melhor: Math.round(n.melhor), tentativas: tent };
      }
    });
  }

  const check = lerJSON('checklist');
  if (check && typeof check === 'object' && !Array.isArray(check)) {
    limpo.checklist = {};
    itensChecklist.forEach((item) => { if (typeof check[item] === 'boolean') limpo.checklist[item] = check[item]; });
  }

  const semControle = (t, max) => t.replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, max);
  const apelido = lerJSON('apelido');
  if (typeof apelido === 'string') limpo.apelido = semControle(apelido, 30);
  const nome = lerJSON('nome-certificado');
  if (typeof nome === 'string') limpo['nome-certificado'] = semControle(nome, 60);
  if (obj.dados.tema === 'claro' || obj.dados.tema === 'escuro') limpo.tema = obj.dados.tema;

  const aproveitavel = (limpo.concluidos && limpo.concluidos.length) || (limpo.quiz && Object.keys(limpo.quiz).length)
    || (limpo.checklist && Object.keys(limpo.checklist).length) || limpo.apelido || limpo['nome-certificado'];
  if (!aproveitavel) return { erro: 'O arquivo não contém nenhum progresso aproveitável.' };
  return { limpo };
}

function resumoDoProgresso(concluidos, quiz) {
  const aprovados = Object.values(quiz || {}).filter((n) => n.melhor >= NOTA_CERTIFICADO).length;
  return `${(concluidos || []).length} módulo(s) concluído(s) e ${aprovados} quiz(zes) aprovado(s)`;
}

function desenharResumoProgresso() {
  const salvoEm = Armazenamento.ler('salvo-em', null);
  const quando = salvoEm ? new Date(salvoEm).toLocaleString('pt-BR', { dateStyle: 'long', timeStyle: 'short' }) : null;
  $('#prog-resumo').textContent = 'Neste aparelho: ' + resumoDoProgresso(concluidos, lerNotasQuiz()) + '. ' +
    (quando ? 'Último arquivo salvo em ' + quando + '.' : 'Você ainda não salvou nenhum arquivo.');
}

function baixarArquivo(conteudo, nome) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url; a.download = nome;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function salvarProgresso() {
  const status = $('#prog-status');
  const conteudo = JSON.stringify(coletarProgresso(), null, 2);
  const nome = `progresso-pwa-brasil-${new Date().toISOString().slice(0, 10)}.json`;
  let salvouComo = null;

  if ('showSaveFilePicker' in window) {
    try {
      const alvo = await window.showSaveFilePicker({ suggestedName: nome, types: TIPOS_ARQUIVO });
      const escrita = await alvo.createWritable();
      await escrita.write(conteudo);
      await escrita.close();
      salvouComo = `Arquivo "${alvo.name}" salvo no local que você escolheu.`;
    } catch (erro) {
      if (erro.name === 'AbortError') return dizer(status, 'Salvamento cancelado.');
      // Qualquer outro problema (ex.: janela embutida): usa o download comum.
    }
  }
  if (!salvouComo) {
    baixarArquivo(conteudo, nome);
    salvouComo = `Arquivo "${nome}" baixado. Procure na pasta de downloads do seu aparelho e guarde onde quiser.`;
  }
  Armazenamento.gravar('salvo-em', new Date().toISOString());
  dizer(status, salvouComo, 'ok');
  desenharResumoProgresso();
}

async function processarArquivoProgresso(arquivo) {
  const status = $('#prog-status');
  if (!arquivo) return;
  if (arquivo.size > TAMANHO_MAXIMO_ARQUIVO) return dizer(status, 'O arquivo é grande demais para ser um progresso deste curso.', 'erro');

  let obj;
  try { obj = JSON.parse(await arquivo.text()); }
  catch (e) { return dizer(status, 'Não consegui ler o arquivo: ele não é um JSON válido.', 'erro'); }

  const { limpo, erro } = validarProgresso(obj);
  if (erro) return dizer(status, erro, 'erro');

  const somado = {
    concluidos: [...new Set([...concluidos, ...(limpo.concluidos || [])])],
    quiz: { ...lerNotasQuiz() }
  };
  Object.entries(limpo.quiz || {}).forEach(([id, n]) => {
    const atual = somado.quiz[id];
    somado.quiz[id] = atual ? { melhor: Math.max(atual.melhor, n.melhor), tentativas: Math.max(atual.tentativas, n.tentativas) } : n;
  });

  const ok = confirm(
    `Arquivo de ${obj.salvoEm ? new Date(obj.salvoEm).toLocaleDateString('pt-BR') : 'data desconhecida'}.\n\n` +
    `No arquivo: ${resumoDoProgresso(limpo.concluidos, limpo.quiz)}.\n` +
    `Depois de somar com este aparelho: ${resumoDoProgresso(somado.concluidos, somado.quiz)}.\n\n` +
    'Nada será apagado. A página vai recarregar. Continuar?');
  if (!ok) return dizer(status, 'Abertura cancelada. Nada foi alterado.');

  const gravarJSON = (chave, valor) => localStorage.setItem('pwa-brasil:' + chave, JSON.stringify(valor));
  try {
    gravarJSON('progresso-v2', somado.concluidos);
    gravarJSON('quiz-v1', somado.quiz);
    if (limpo.checklist) gravarJSON('checklist', { ...Armazenamento.ler('checklist', {}), ...limpo.checklist });
    if (limpo.apelido) gravarJSON('apelido', limpo.apelido);
    if (limpo['nome-certificado']) gravarJSON('nome-certificado', limpo['nome-certificado']);
    if (limpo.tema) localStorage.setItem('pwa-brasil:tema', limpo.tema);
    sessionStorage.setItem('pwa-brasil:pular-splash', '1');
    sessionStorage.setItem('pwa-brasil:msg-importacao', 'Progresso aberto com sucesso: ' + resumoDoProgresso(somado.concluidos, somado.quiz) + '.');
  } catch (e) {
    return dizer(status, 'Não foi possível gravar o progresso neste navegador (armazenamento bloqueado ou cheio).', 'erro');
  }
  location.hash = '#progresso';
  location.reload();
}

async function abrirProgresso() {
  if ('showOpenFilePicker' in window) {
    try {
      const [alvo] = await window.showOpenFilePicker({ types: TIPOS_ARQUIVO, multiple: false });
      return processarArquivoProgresso(await alvo.getFile());
    } catch (erro) {
      if (erro.name === 'AbortError') return dizer($('#prog-status'), 'Abertura cancelada.');
      // Outro problema: cai para o seletor comum.
    }
  }
  $('#prog-arquivo').click();
}

function iniciarProgressoEmArquivo() {
  const metodo = $('#prog-metodo');
  metodo.textContent = ('showSaveFilePicker' in window)
    ? 'Seu navegador permite escolher a pasta e o nome do arquivo ao salvar.'
    : 'Seu navegador não deixa o site escolher a pasta: o arquivo será baixado para a pasta de downloads (você pode movê-lo depois). Para abrir, escolha o arquivo na janela que aparecer.';

  $('#btn-prog-salvar').addEventListener('click', salvarProgresso);
  $('#btn-prog-abrir').addEventListener('click', abrirProgresso);
  $('#prog-arquivo').addEventListener('change', (e) => {
    const arquivo = e.target.files && e.target.files[0];
    e.target.value = ''; // permite escolher o mesmo arquivo de novo
    processarArquivoProgresso(arquivo);
  });

  desenharResumoProgresso();
  document.addEventListener('quiz:aprovado', desenharResumoProgresso);
  $$('.btn-concluir').forEach((b) => b.addEventListener('click', desenharResumoProgresso));

  // Mensagem deixada pela abertura anterior (a página recarregou)
  try {
    const msg = sessionStorage.getItem('pwa-brasil:msg-importacao');
    if (msg) {
      sessionStorage.removeItem('pwa-brasil:msg-importacao');
      dizer($('#prog-status'), msg, 'ok');
      toast('Progresso aberto! 🎉');
    }
  } catch (e) { /* ignora */ }
}

/* ---------------------------------------------------------------------
 * 12) INICIALIZAÇÃO
 * ------------------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', () => {
  iniciarTema();
  iniciarSplash();
  iniciarDrawer();
  iniciarProgresso();
  iniciarRede();
  iniciarBanner();
  iniciarChecklist();
  iniciarInstalacao();
  iniciarInspetorCache();
  iniciarRecursosNativos();
  iniciarLaboratoriosHTML();
  iniciarBotoesCopiar();
  iniciarCertificado();
  iniciarProgressoEmArquivo();
  iniciarNavegacao();
  iniciarServiceWorker();
});
