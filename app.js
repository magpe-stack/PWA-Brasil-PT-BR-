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

// Depois de abrir um arquivo de progresso a página recarrega; nesse caso voltamos à tela "Salvar/abrir".
const VEIO_DA_IMPORTACAO = (() => { try { return !!sessionStorage.getItem('pwa-brasil:msg-importacao'); } catch (e) { return false; } })();

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

// Igual a dizer(), mas também mostra um aviso (toast). Útil quando a ação parte do menu
// e a mensagem fixa fica em uma página que não está aberta.
function dizerEAvisar(el, texto, estado) {
  dizer(el, texto, estado);
  if (texto) toast(texto, 5000);
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
 * 3) MENU (abre pelo hambúrguer, no canto superior direito)
 * ------------------------------------------------------------------- */
function iniciarDrawer() {
  const drawer = $('#drawer');
  const overlay = $('#overlay');
  const abrir = $('#menu-btn');
  const fechar = $('#fechar-menu');

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
    drawer.setAttribute('aria-hidden', 'true');
    overlay.hidden = true;
    abrir.setAttribute('aria-expanded', 'false');
    if (devolverFoco) abrir.focus();
  }

  abrir.addEventListener('click', abrirMenu);
  fechar.addEventListener('click', () => fecharMenu());
  overlay.addEventListener('click', () => fecharMenu());
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && aberto()) fecharMenu(); });

  // Clicar em um link ou botão do menu fecha o menu (a ação do botão roda logo em seguida).
  $$('a, .menu__botao', drawer).forEach((el) => el.addEventListener('click', () => { if (aberto()) fecharMenu(false); }));
}

/* ---------------------------------------------------------------------
 * 4) NAVEGAÇÃO ENTRE MÓDULOS (roteamento por hash: #modulo-3, #lab-cache)
 * ------------------------------------------------------------------- */
let moduloAtual = 'inicio';

function mostrarPelaHash(primeiraVez = false) {
  const id = decodeURIComponent(location.hash.replace('#', '')) || 'inicio';
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
  if (modulo.id === 'inicio') desenharInicio();   // o painel é refeito a cada visita
}
mostrarPelaHash.padrao = () => { history.replaceState(null, '', '#inicio'); mostrarPelaHash(true); };

function iniciarNavegacao() {
  // Toda abertura do app cai no Início (depois do splash). As exceções:
  //  - atalhos do manifest e links de aulas compartilhadas, que abrem com ?modulo=modulo-3;
  //  - a volta de um arquivo de progresso aberto, que mostra a tela "Salvar e abrir".
  const parametro = new URLSearchParams(location.search).get('modulo');
  let destino = '#inicio';
  if (parametro && document.getElementById(parametro)) destino = '#' + parametro;
  else if (VEIO_DA_IMPORTACAO) destino = '#progresso';
  history.replaceState(null, '', location.pathname + destino);

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
    $('#menu-instalar-item').hidden = false;
    dizer(status, 'Pronto! O navegador liberou a instalação. Clique no botão.', 'ok');
  });

  botao.addEventListener('click', async () => {
    if (!eventoInstalacao) return;
    eventoInstalacao.prompt(); // mostra o diálogo nativo (só pode ser chamado uma vez)
    const { outcome } = await eventoInstalacao.userChoice;
    dizer(status, outcome === 'accepted' ? 'Instalação aceita! Procure o ícone na sua tela inicial.' : 'Instalação dispensada. Você pode tentar de novo depois.', outcome === 'accepted' ? 'ok' : undefined);
    eventoInstalacao = null;
    botao.disabled = true;
    $('#menu-instalar-item').hidden = true;
  });

  // Disparado depois que a instalação termina.
  window.addEventListener('appinstalled', () => {
    eventoInstalacao = null;
    botao.disabled = true;
    $('#menu-instalar-item').hidden = true;
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
        dizerEAvisar(statusShare, 'Compartilhado com sucesso!', 'ok');
      } catch (erro) {
        // AbortError = o usuário fechou a folha de compartilhamento (não é falha).
        if (erro.name === 'AbortError') dizerEAvisar(statusShare, 'Compartilhamento cancelado.');
        else dizerEAvisar(statusShare, 'Erro ao compartilhar: ' + erro.message, 'erro');
      }
    } else if (navigator.clipboard) {
      // Plano B honesto: o navegador não tem Web Share, então copiamos o link.
      try {
        await navigator.clipboard.writeText(dados.url);
        dizerEAvisar(statusShare, 'Este navegador não suporta a Web Share API. O link foi copiado para a área de transferência.', 'ok');
      } catch (e) { dizerEAvisar(statusShare, 'Web Share indisponível e a cópia foi bloqueada. Link: ' + dados.url, 'erro'); }
    } else {
      dizerEAvisar(statusShare, 'Web Share indisponível. Copie o link: ' + dados.url, 'erro');
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
    compartilhar({ title: titulo + ' — PWA Brasil (PT-BR)', text: 'Estou aprendendo: ' + titulo, url: base + '?modulo=' + moduloAtual });
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
const CHAVES_PROGRESSO = ['progresso-v2', 'quiz-v1', 'checklist', 'apelido', 'nome-certificado', 'tema', 'labs-v1', 'estudo-v1'];
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

  // Laboratórios feitos: só os ids conhecidos, com data válida
  const labsArq = lerJSON('labs-v1');
  if (labsArq && typeof labsArq === 'object' && !Array.isArray(labsArq)) {
    limpo.labs = {};
    LABS.forEach((l) => {
      const data = labsArq[l.id];
      if (typeof data === 'string' && !Number.isNaN(Date.parse(data))) limpo.labs[l.id] = new Date(data).toISOString();
    });
  }

  // Tempo de estudo: chaves simples, números plausíveis (até 1000 h por item) e datas no formato AAAA-MM-DD
  const estArq = lerJSON('estudo-v1');
  if (estArq && typeof estArq === 'object' && !Array.isArray(estArq)) {
    limpo.estudo = { iniciadoEm: null, segundos: {}, dias: [] };
    if (typeof estArq.iniciadoEm === 'string' && !Number.isNaN(Date.parse(estArq.iniciadoEm))) limpo.estudo.iniciadoEm = new Date(estArq.iniciadoEm).toISOString();
    if (estArq.segundos && typeof estArq.segundos === 'object' && !Array.isArray(estArq.segundos)) {
      Object.entries(estArq.segundos).slice(0, 30).forEach(([k, v]) => {
        if (/^[a-z0-9-]{1,30}$/.test(k) && Number.isFinite(v) && v >= 0 && v <= 3600000) limpo.estudo.segundos[k] = Math.round(v);
      });
    }
    if (Array.isArray(estArq.dias)) limpo.estudo.dias = [...new Set(estArq.dias.filter((d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)))].slice(-800);
  }

  const aproveitavel = (limpo.concluidos && limpo.concluidos.length) || (limpo.quiz && Object.keys(limpo.quiz).length)
    || (limpo.checklist && Object.keys(limpo.checklist).length) || limpo.apelido || limpo['nome-certificado']
    || (limpo.labs && Object.keys(limpo.labs).length)
    || (limpo.estudo && (limpo.estudo.iniciadoEm || Object.keys(limpo.estudo.segundos).length || limpo.estudo.dias.length));
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
      if (erro.name === 'AbortError') return dizerEAvisar(status, 'Salvamento cancelado.');
      // Qualquer outro problema (ex.: janela embutida): usa o download comum.
    }
  }
  if (!salvouComo) {
    baixarArquivo(conteudo, nome);
    salvouComo = `Arquivo "${nome}" baixado. Procure na pasta de downloads do seu aparelho e guarde onde quiser.`;
  }
  Armazenamento.gravar('salvo-em', new Date().toISOString());
  dizerEAvisar(status, salvouComo, 'ok');
  desenharResumoProgresso();
}

async function processarArquivoProgresso(arquivo) {
  const status = $('#prog-status');
  if (!arquivo) return;
  if (arquivo.size > TAMANHO_MAXIMO_ARQUIVO) return dizerEAvisar(status, 'O arquivo é grande demais para ser um progresso deste curso.', 'erro');

  let obj;
  try { obj = JSON.parse(await arquivo.text()); }
  catch (e) { return dizerEAvisar(status, 'Não consegui ler o arquivo: ele não é um JSON válido.', 'erro'); }

  const { limpo, erro } = validarProgresso(obj);
  if (erro) return dizerEAvisar(status, erro, 'erro');

  const somado = {
    concluidos: [...new Set([...concluidos, ...(limpo.concluidos || [])])],
    quiz: { ...lerNotasQuiz() }
  };
  Object.entries(limpo.quiz || {}).forEach(([id, n]) => {
    const atual = somado.quiz[id];
    somado.quiz[id] = atual ? { melhor: Math.max(atual.melhor, n.melhor), tentativas: Math.max(atual.tentativas, n.tentativas) } : n;
  });

  // Laboratórios: união (vale a data mais antiga). Tempo: vale o maior valor de cada módulo; dias: união.
  const labsSomados = { ...Armazenamento.ler('labs-v1', {}) };
  Object.entries(limpo.labs || {}).forEach(([id, data]) => { if (!labsSomados[id] || data < labsSomados[id]) labsSomados[id] = data; });
  const estAtual = normalizarEstudo(Armazenamento.ler('estudo-v1', null));
  const estSomado = { iniciadoEm: estAtual.iniciadoEm, segundos: { ...estAtual.segundos }, dias: [...estAtual.dias] };
  if (limpo.estudo) {
    if (limpo.estudo.iniciadoEm && (!estSomado.iniciadoEm || limpo.estudo.iniciadoEm < estSomado.iniciadoEm)) estSomado.iniciadoEm = limpo.estudo.iniciadoEm;
    Object.entries(limpo.estudo.segundos).forEach(([k, v]) => { estSomado.segundos[k] = Math.max(estSomado.segundos[k] || 0, v); });
    estSomado.dias = [...new Set([...estSomado.dias, ...limpo.estudo.dias])].sort().slice(-800);
  }

  const ok = confirm(
    `Arquivo de ${obj.salvoEm ? new Date(obj.salvoEm).toLocaleDateString('pt-BR') : 'data desconhecida'}.\n\n` +
    `No arquivo: ${resumoDoProgresso(limpo.concluidos, limpo.quiz)}.\n` +
    `Depois de somar com este aparelho: ${resumoDoProgresso(somado.concluidos, somado.quiz)}.\n\n` +
    'Nada será apagado. A página vai recarregar. Continuar?');
  if (!ok) return dizerEAvisar(status, 'Abertura cancelada. Nada foi alterado.');

  const gravarJSON = (chave, valor) => localStorage.setItem('pwa-brasil:' + chave, JSON.stringify(valor));
  try {
    gravarJSON('progresso-v2', somado.concluidos);
    gravarJSON('quiz-v1', somado.quiz);
    gravarJSON('labs-v1', labsSomados);
    gravarJSON('estudo-v1', estSomado);
    if (limpo.checklist) gravarJSON('checklist', { ...Armazenamento.ler('checklist', {}), ...limpo.checklist });
    if (limpo.apelido) gravarJSON('apelido', limpo.apelido);
    if (limpo['nome-certificado']) gravarJSON('nome-certificado', limpo['nome-certificado']);
    if (limpo.tema) localStorage.setItem('pwa-brasil:tema', limpo.tema);
    sessionStorage.setItem('pwa-brasil:pular-splash', '1');
    sessionStorage.setItem('pwa-brasil:msg-importacao', 'Progresso aberto com sucesso: ' + resumoDoProgresso(somado.concluidos, somado.quiz) + '.');
  } catch (e) {
    return dizerEAvisar(status, 'Não foi possível gravar o progresso neste navegador (armazenamento bloqueado ou cheio).', 'erro');
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
      if (erro.name === 'AbortError') return dizerEAvisar($('#prog-status'), 'Abertura cancelada.');
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
 * 11e) INÍCIO (boas-vindas e PAINEL), LABORATÓRIOS FEITOS E TEMPO DE ESTUDO
 * ------------------------------------------------------------------- */

// Tempo médio estimado de cada módulo, em minutos (leitura + laboratório + quiz).
const MIN_MODULO = { 'modulo-1': 30, 'modulo-2': 20, 'modulo-3': 25, 'modulo-4': 35, 'modulo-5': 25, 'modulo-6': 30, 'modulo-7': 35 };

// Os "exercícios" do curso: cada laboratório ao vivo, ligado ao módulo em que aparece.
const LABS = [
  { id: 'lab-html', modulo: 'modulo-1', titulo: 'Editor de HTML ao vivo' },
  { id: 'lab-fonte', modulo: 'modulo-1', titulo: 'Espie o código deste app' },
  { id: 'lab-checklist', modulo: 'modulo-2', titulo: 'Checklist de prontidão' },
  { id: 'lab-instalacao', modulo: 'modulo-3', titulo: 'Instalar e inspecionar o manifest' },
  { id: 'lab-cache', modulo: 'modulo-4', titulo: 'Inspetor de cache' },
  { id: 'lab-nativo', modulo: 'modulo-5', titulo: 'Compartilhar e notificações' },
  { id: 'lab-atualizacao', modulo: 'modulo-6', titulo: 'Ciclo de atualização' }
];

/* ----- Tempo de estudo ----- */
const dataLocal = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Garante que o que veio do localStorage tem o formato certo (ele pode ter sido editado à mão).
function normalizarEstudo(e) {
  const o = e && typeof e === 'object' && !Array.isArray(e) ? e : {};
  const segundos = {};
  if (o.segundos && typeof o.segundos === 'object') {
    Object.entries(o.segundos).forEach(([k, v]) => { if (Number.isFinite(v) && v >= 0) segundos[k] = v; });
  }
  return {
    iniciadoEm: typeof o.iniciadoEm === 'string' ? o.iniciadoEm : null,
    segundos,
    dias: Array.isArray(o.dias) ? o.dias.filter((d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)).slice(-800) : []
  };
}
let estudo = normalizarEstudo(Armazenamento.ler('estudo-v1', null));
const salvarEstudo = () => Armazenamento.gravar('estudo-v1', estudo);

// A cada 10 s, soma 10 s de estudo ao módulo aberto, mas só se a aba está visível
// e houve algum toque, tecla ou rolagem nos últimos 2 minutos (aba esquecida não conta).
let ultimaInteracao = Date.now();
function iniciarCronometro() {
  ['pointerdown', 'keydown', 'scroll', 'touchstart'].forEach((ev) =>
    window.addEventListener(ev, () => { ultimaInteracao = Date.now(); }, { passive: true }));
  setInterval(() => {
    if (document.visibilityState !== 'visible' || document.getElementById('splash')) return;
    if (Date.now() - ultimaInteracao > 120000) return;
    estudo.segundos[moduloAtual] = (estudo.segundos[moduloAtual] || 0) + 10;
    const hoje = dataLocal();
    if (!estudo.dias.includes(hoje)) estudo.dias.push(hoje);
    salvarEstudo();
  }, 10000);
}

/* ----- Laboratórios feitos ----- */
function marcarLab(id) {
  const labs = Armazenamento.ler('labs-v1', {});
  if (labs[id]) return;                       // já estava marcado
  labs[id] = new Date().toISOString();
  Armazenamento.gravar('labs-v1', labs);
  const lab = LABS.find((l) => l.id === id);
  toast('Laboratório concluído: ' + (lab ? lab.titulo : id) + ' ✔');
}

// Um laboratório conta como "feito" quando o aluno usa o seu controle principal.
function iniciarRegistroDeLabs() {
  [['lab-html', '#editor-html', 'input'], ['lab-fonte', '#btn-ver-fonte', 'click'],
   ['lab-checklist', '#btn-auto-checklist', 'click'], ['lab-instalacao', '#btn-carregar-manifest', 'click'],
   ['lab-cache', '#btn-lab-testar', 'click'], ['lab-atualizacao', '#btn-checar-atualizacao', 'click']
  ].forEach(([id, seletor, evento]) => {
    const el = $(seletor);
    if (el) el.addEventListener(evento, () => marcarLab(id));
  });
  $('#lab-nativo').addEventListener('click', (e) => { if (e.target.closest('button')) marcarLab('lab-nativo'); });
}

/* ----- Formatação ----- */
function fmtMin(min) {
  min = Math.round(min);
  if (min < 1) return 'menos de 1 min';
  if (min < 60) return min + ' min';
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h} h ${String(m).padStart(2, '0')} min` : `${h} h`;
}
const fmtSeg = (s) => (s <= 0 ? '—' : fmtMin(s / 60));

// Pequeno construtor de elementos (sem innerHTML: todo texto entra como texto puro).
function h(tag, props, ...filhos) {
  const el = document.createElement(tag);
  Object.entries(props || {}).forEach(([k, v]) => {
    if (v === null || v === undefined || v === false) return;
    if (k === 'class') el.className = v;
    else if (k === 'estilo') Object.entries(v).forEach(([p, val]) => el.style.setProperty(p, val));
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v);
  });
  filhos.flat(Infinity).forEach((f) => {
    if (f === null || f === undefined || f === false) return;
    el.append(f.nodeType ? f : document.createTextNode(String(f)));
  });
  return el;
}

/* ----- Cálculos do painel ----- */
function sequenciaAtual(dias) {
  const conjunto = new Set(dias);
  const d = new Date();
  if (!conjunto.has(dataLocal(d))) {          // se hoje ainda não estudou, a sequência pode terminar ontem
    d.setDate(d.getDate() - 1);
    if (!conjunto.has(dataLocal(d))) return 0;
  }
  let n = 0;
  while (conjunto.has(dataLocal(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

function cursoIniciado() {
  return !!estudo.iniciadoEm || concluidos.length > 0
    || Object.keys(lerNotasQuiz()).length > 0
    || Object.keys(Armazenamento.ler('labs-v1', {})).length > 0
    || Object.keys(estudo.segundos).some((k) => k.startsWith('modulo-'));
}

// Estima o tempo que falta. Depois do 1º módulo concluído, ajusta ao ritmo real do aluno
// (limitado entre 0,5x e 2x para um módulo muito rápido ou muito lento não distorcer tudo).
function estimarRestante(mods) {
  const concl = mods.filter((m) => m.concluido);
  const esperado = concl.reduce((t, m) => t + m.estimativa, 0);
  const gasto = concl.reduce((t, m) => t + m.seg / 60, 0);
  const personalizado = concl.length > 0 && gasto >= 5;
  const ritmo = personalizado ? Math.min(2, Math.max(0.5, gasto / esperado)) : 1;
  let minutos = 0;
  mods.filter((m) => !m.concluido).forEach((m) => {
    const previsto = m.estimativa * ritmo;
    minutos += Math.max(previsto * 0.15, previsto - m.seg / 60);   // o que já estudou desconta, mas sobra ao menos 15%
  });
  return { minutos: Math.round(minutos), personalizado, ritmo };
}

function calcularPainel() {
  const ids = $$('.btn-concluir').map((b) => b.dataset.modulo);
  const notas = lerNotasQuiz();
  const labs = Armazenamento.ler('labs-v1', {});
  const check = Armazenamento.ler('checklist', {});

  const mods = ids.map((id) => {
    const secao = document.getElementById(id);
    const seg = estudo.segundos[id] || 0;
    const nota = notas[id] || null;
    const doModulo = LABS.filter((l) => l.modulo === id);
    const labsFeitos = doModulo.filter((l) => labs[l.id]).length;
    const concluido = concluidos.includes(id);
    return {
      id, n: Number(id.split('-')[1]), titulo: secao.dataset.titulo.replace(/^Módulo \d+ — /, ''),
      seg, nota, labsTotal: doModulo.length, labsFeitos, concluido,
      status: concluido ? 'concluido' : (seg >= 30 || nota || labsFeitos ? 'andamento' : 'novo'),
      estimativa: MIN_MODULO[id] || 20
    };
  });

  const comNota = mods.filter((m) => m.nota);
  const segundosTotal = Object.values(estudo.segundos).reduce((t, v) => t + v, 0);
  const itensChecklist = $$('#checklist input[data-item]').length;
  return {
    mods, total: mods.length,
    concluidos: mods.filter((m) => m.concluido).length,
    quizAprovados: comNota.filter((m) => m.nota.melhor >= NOTA_CERTIFICADO).length,
    media: comNota.length ? Math.round(comNota.reduce((t, m) => t + m.nota.melhor, 0) / comNota.length) : null,
    tentativas: comNota.reduce((t, m) => t + m.nota.tentativas, 0),
    labsFeitos: LABS.filter((l) => labs[l.id]).length,
    checklistMarcados: Object.values(check).filter(Boolean).length, itensChecklist,
    segundosTotal, dias: estudo.dias.length, sequencia: sequenciaAtual(estudo.dias),
    proximo: mods.find((m) => !m.concluido) || null,
    algumProgresso: mods.some((m) => m.status !== 'novo'),
    estimativa: estimarRestante(mods), labs
  };
}

/* ----- Desenho da página inicial ----- */
function desenharInicio() {
  const iniciado = cursoIniciado();
  $('#inicio-boasvindas').hidden = iniciado;
  $('#painel').hidden = !iniciado;
  if (!iniciado) return;

  const d = calcularPainel();
  const pct = Math.round((d.concluidos / d.total) * 100);
  const apelido = Armazenamento.ler('apelido', '');
  const cert = situacaoCertificado();
  const salvoEm = Armazenamento.ler('salvo-em', null);

  const topo = h('div', { class: 'painel__topo' },
    h('div', null,
      h('p', { class: 'selo' }, 'Painel'),
      h('h2', null, apelido ? `Olá, ${apelido}!` : 'Seu painel de estudos'),
      h('p', null, d.concluidos === d.total ? 'Você concluiu todos os módulos. Parabéns! 🎉' : 'Veja como está o seu avanço no curso.')),
    d.proximo
      ? h('a', { class: 'btn btn--primario btn--grande', href: '#' + d.proximo.id }, `${d.algumProgresso ? 'Continuar' : 'Começar'}: Módulo ${d.proximo.n}`)
      : h('a', { class: 'btn btn--primario btn--grande', href: '#certificado' }, '🎓 Ver certificado'));

  const geral = h('div', { class: 'geral' },
    h('div', { class: 'geral__rotulo' }, h('span', null, 'Progresso do curso'), h('span', null, `${d.concluidos} de ${d.total} módulos (${pct}%)`)),
    h('div', { class: 'progresso__trilho', role: 'progressbar', 'aria-label': 'Progresso do curso', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': pct },
      h('div', { class: 'progresso__barra', estilo: { width: pct + '%' } })));

  const kpi = (rotulo, valor, sub) => h('div', { class: 'kpi' },
    h('span', { class: 'kpi__rotulo' }, rotulo), h('span', { class: 'kpi__valor' }, valor), h('span', { class: 'kpi__sub' }, sub));
  const kpis = h('div', { class: 'kpis' },
    kpi('Módulos concluídos', `${d.concluidos}/${d.total}`, `${pct}% do curso`),
    kpi('Quizzes aprovados', `${d.quizAprovados}/${d.total}`, `nota mínima: ${NOTA_CERTIFICADO}%`),
    kpi('Média nos quizzes', d.media === null ? '—' : d.media + '%', 'melhor nota de cada quiz'),
    kpi('Tentativas de quiz', String(d.tentativas), 'somando todos os módulos'),
    kpi('Laboratórios feitos', `${d.labsFeitos}/${LABS.length}`, 'exercícios práticos ao vivo'),
    kpi('Checklist de prontidão', `${d.checklistMarcados}/${d.itensChecklist}`, 'itens marcados (Módulo 2)'),
    kpi('Tempo de estudo', fmtSeg(d.segundosTotal), `${d.dias} ${d.dias === 1 ? 'dia' : 'dias'} de estudo`),
    kpi('Sequência', `${d.sequencia} ${d.sequencia === 1 ? 'dia' : 'dias'}`, 'dias seguidos estudando'));

  // Estimativa de tempo
  const e = d.estimativa;
  const faltam = d.total - d.concluidos;
  const mediaDia = d.dias ? d.segundosTotal / 60 / d.dias : 0;
  const estimativa = h('div', { class: 'estimativa' },
    h('div', null,
      h('span', { class: 'kpi__rotulo' }, 'Tempo restante estimado'),
      h('span', { class: 'estimativa__valor' }, faltam === 0 ? 'Curso concluído! 🎉' : '≈ ' + fmtMin(e.minutos))),
    h('p', { class: 'estimativa__texto' },
      faltam === 0 ? 'Você terminou todos os módulos.' : `Faltam ${faltam} ${faltam === 1 ? 'módulo' : 'módulos'}. ` +
        (e.personalizado ? 'A estimativa leva em conta o seu ritmo nos módulos que você já concluiu.' : 'A estimativa usa o tempo médio de cada módulo e passa a se ajustar ao seu ritmo depois que você concluir o primeiro.'),
      faltam === 0 ? null : h('small', null,
        `Estudando 30 minutos por dia, você termina em cerca de ${Math.max(1, Math.ceil(e.minutos / 30))} ${Math.ceil(e.minutos / 30) <= 1 ? 'dia' : 'dias'}.`,
        mediaDia >= 5 ? ` No seu ritmo atual (${Math.round(mediaDia)} min por dia de estudo): cerca de ${Math.max(1, Math.ceil(e.minutos / mediaDia))} ${Math.ceil(e.minutos / mediaDia) <= 1 ? 'dia' : 'dias'}.` : '',
        ' É só uma previsão: cada pessoa tem o seu ritmo.')));

  // Módulos
  const rotuloStatus = { concluido: ['badge--ok', 'Concluído'], andamento: ['badge--info', 'Em andamento'], novo: ['badge--neutro', 'Não iniciado'] };
  const linhas = h('ul', { class: 'linhas' }, d.mods.map((m) => h('li', { class: 'linha linha--' + m.status },
    h('span', { class: 'linha__num', 'aria-hidden': 'true' }, m.concluido ? '✓' : String(m.n)),
    h('div', { class: 'linha__titulo' },
      h('a', { href: '#' + m.id }, `Módulo ${m.n}: ${m.titulo}`),
      h('span', { class: 'badge ' + rotuloStatus[m.status][0] }, h('i', { class: 'ponto' }), rotuloStatus[m.status][1])),
    h('div', { class: 'linha__detalhes' },
      h('span', null, m.nota ? `Quiz: ${m.nota.melhor}% (${m.nota.tentativas} ${m.nota.tentativas === 1 ? 'tentativa' : 'tentativas'})` : 'Quiz: não feito'),
      h('span', null, m.labsTotal ? `Laboratórios: ${m.labsFeitos}/${m.labsTotal}` : 'Sem laboratório'),
      h('span', null, 'Tempo: ' + fmtSeg(m.seg)),
      h('span', null, `Previsto: ${m.estimativa} min`)))));

  // Gráfico: nota de cada quiz
  const colunas = h('div', { class: 'colunas', role: 'img', 'aria-label': 'Gráfico com a melhor nota de cada quiz: ' + d.mods.map((m) => `módulo ${m.n}, ${m.nota ? m.nota.melhor + '%' : 'sem nota'}`).join('; ') },
    d.mods.map((m) => h('div', { class: 'coluna' },
      h('span', { class: 'coluna__valor' }, m.nota ? m.nota.melhor + '%' : '—'),
      h('div', { class: 'coluna__trilho' },
        m.nota ? h('div', { class: 'coluna__barra' + (m.nota.melhor < NOTA_CERTIFICADO ? ' coluna__barra--baixa' : ''), estilo: { height: m.nota.melhor + '%' } }) : null),
      h('span', { class: 'coluna__rotulo' }, 'M' + m.n))));

  // Gráfico: tempo por módulo
  const maior = Math.max(1, ...d.mods.map((m) => m.seg));
  const barras = h('div', { class: 'barras' }, d.mods.map((m) => h('div', { class: 'barra-h' },
    h('span', null, 'Módulo ' + m.n),
    h('div', { class: 'barra-h__trilho' }, h('div', { class: 'barra-h__preench', estilo: { width: Math.round((m.seg / maior) * 100) + '%' } })),
    h('span', { class: 'barra-h__valor' }, fmtSeg(m.seg)))));

  // Laboratórios
  const labsLista = h('ul', { class: 'labs-lista' }, LABS.map((l) => {
    const quando = d.labs[l.id];
    return h('li', null,
      h('a', { href: '#' + l.id }, `🧪 ${l.titulo} (Módulo ${l.modulo.split('-')[1]})`),
      quando ? h('span', { class: 'feito-txt' }, '✔ feito em ' + new Date(quando).toLocaleDateString('pt-BR')) : h('span', { class: 'pendente-txt' }, 'pendente'));
  }));

  const secao = (titulo, ...conteudo) => h('section', { class: 'painel__secao' }, h('h3', null, titulo), ...conteudo);

  $('#painel').replaceChildren(
    topo, geral, kpis,
    secao('Quanto falta?', estimativa),
    secao('Seus módulos', linhas),
    secao('Notas dos quizzes', colunas,
      h('p', { class: 'legenda' }, `A linha tracejada marca a nota mínima (${NOTA_CERTIFICADO}%). Verde: aprovado. Laranja: abaixo do mínimo. Você pode refazer o quiz quantas vezes quiser.`)),
    secao('Tempo de estudo por módulo', barras,
      h('p', { class: 'legenda' }, 'Conta só o tempo com o app aberto e em uso: se você ficar mais de 2 minutos sem tocar na tela, o relógio para.')),
    secao('Laboratórios ao vivo', labsLista),
    secao('Certificado', h('div', { class: 'caixa ' + (cert.liberado ? 'caixa--dica' : 'caixa--objetivos') },
      cert.liberado
        ? [h('strong', null, 'Seu certificado está liberado! 🎓'), h('a', { class: 'btn btn--primario btn--pequeno', href: '#certificado' }, 'Emitir certificado')]
        : [h('strong', null, `${cert.itens.filter((i) => i.aprovado).length} de ${cert.itens.length} quizzes aprovados`),
           'Para liberar o certificado, seja aprovado nos 7 quizzes (nota de 70% ou mais em cada um). ',
           h('a', { href: '#certificado' }, 'Ver detalhes')])),
    secao('Guardar o progresso',
      h('p', null, salvoEm ? 'Último arquivo salvo em ' + new Date(salvoEm).toLocaleString('pt-BR', { dateStyle: 'long', timeStyle: 'short' }) + '.' : 'Você ainda não salvou o progresso em arquivo. Faça isso de vez em quando, para não perder nada se trocar de aparelho.'),
      h('div', { class: 'lab__acoes' },
        h('button', { class: 'btn btn--primario', type: 'button', onclick: salvarProgresso }, '💾 Salvar como…'),
        h('button', { class: 'btn btn--secundario', type: 'button', onclick: abrirProgresso }, '📂 Abrir arquivo…'))));
}

function iniciarInicio() {
  // Tempo total estimado, mostrado no texto de boas-vindas
  const totalMin = Object.values(MIN_MODULO).reduce((t, v) => t + v, 0);
  $('#inicio-tempo').textContent = 'cerca de ' + fmtMin(totalMin);

  $('#btn-iniciar').addEventListener('click', () => {
    if (!estudo.iniciadoEm) { estudo.iniciadoEm = new Date().toISOString(); salvarEstudo(); }
    location.hash = '#modulo-1';
  });
  $('#btn-inicio-abrir').addEventListener('click', abrirProgresso);

  // Ações do menu (hambúrguer). Cada botão reaproveita a função que já existe.
  $('#menu-salvar').addEventListener('click', salvarProgresso);
  $('#menu-abrir').addEventListener('click', abrirProgresso);
  $('#menu-compartilhar').addEventListener('click', () => $('#btn-compartilhar-app').click());
  $('#menu-instalar').addEventListener('click', () => $('#btn-instalar').click());
  $('#menu-tema').addEventListener('click', () => $('#tema-btn').click());

  document.addEventListener('quiz:aprovado', desenharInicio);
  desenharInicio();
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
  iniciarRegistroDeLabs();
  iniciarInicio();
  iniciarCronometro();
  iniciarNavegacao();
  iniciarServiceWorker();
});
