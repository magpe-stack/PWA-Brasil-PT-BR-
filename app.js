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
  iniciarNavegacao();
  iniciarServiceWorker();
});
