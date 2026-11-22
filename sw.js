/* =====================================================================
 * sw.js — Service Worker do PWA Brasil (PT-BR)
 * Escrito à mão (sem Workbox) para ser lido e estudado.
 *
 * Estratégias usadas aqui:
 *  - App Shell (HTML/CSS/JS/ícones) ........ Cache First  (rápido e offline)
 *  - Navegações (páginas HTML) ............. Network First (com fallback offline)
 *  - Demais GET do mesmo domínio ........... Stale-While-Revalidate
 *  - /__lab__/... (Laboratório do módulo 3)  responde com cabeçalho X-SW-Strategy
 * ===================================================================== */

// Versão do cache. Mudou o app? Incremente aqui: o navegador detecta que o
// sw.js mudou byte a byte e dispara um novo ciclo install -> waiting -> activate.
const VERSAO = 'v1.2.0';
const CACHE_SHELL = `pwa-brasil-shell-${VERSAO}`;     // arquivos do App Shell (pré-cache)
const CACHE_RUNTIME = `pwa-brasil-runtime-${VERSAO}`; // arquivos adicionados durante o uso

// Lista do App Shell: tudo o que é necessário para o app abrir offline.
// Caminhos relativos ao sw.js, então funciona em subpastas (ex.: GitHub Pages).
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './quiz.js',
  './manifest.webmanifest',
  './offline.html',
  './icons/favicon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

// ---------------------------------------------------------------------
// 1) INSTALL — roda uma vez por versão do sw.js. Ideal para o pré-cache.
// ---------------------------------------------------------------------
self.addEventListener('install', (evento) => {
  // waitUntil mantém o SW "instalando" até a Promise terminar.
  evento.waitUntil(
    caches.open(CACHE_SHELL).then((cache) => cache.addAll(APP_SHELL))
  );
  // IMPORTANTE: NÃO chamamos skipWaiting() aqui de propósito.
  // Assim o aluno vê o banner "Nova versão disponível" e decide quando
  // atualizar. O skipWaiting é disparado pela mensagem 'PULAR_ESPERA' abaixo.
});

// ---------------------------------------------------------------------
// 2) ACTIVATE — roda quando esta versão assume o controle.
//    Momento certo para apagar caches de versões antigas.
// ---------------------------------------------------------------------
self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    (async () => {
      const nomes = await caches.keys();
      await Promise.all(
        nomes
          .filter((nome) => nome.startsWith('pwa-brasil-') && nome !== CACHE_SHELL && nome !== CACHE_RUNTIME)
          .map((nome) => caches.delete(nome))
      );
      // Assume as abas já abertas sem precisar recarregar.
      await self.clients.claim();
    })()
  );
});

// ---------------------------------------------------------------------
// 3) MESSAGE — canal de comunicação página -> Service Worker.
// ---------------------------------------------------------------------
self.addEventListener('message', (evento) => {
  if (evento.data && evento.data.tipo === 'PULAR_ESPERA') {
    // Faz o SW em espera virar o ativo imediatamente.
    self.skipWaiting();
  }
  if (evento.data && evento.data.tipo === 'PEDIR_VERSAO' && evento.source) {
    evento.source.postMessage({ tipo: 'VERSAO', versao: VERSAO });
  }
});

// ---------------------------------------------------------------------
// 4) FETCH — intercepta TODA requisição feita pelas páginas controladas.
// ---------------------------------------------------------------------
self.addEventListener('fetch', (evento) => {
  const requisicao = evento.request;

  // Só tratamos GET; POST/PUT etc. seguem direto para a rede.
  if (requisicao.method !== 'GET') return;

  const url = new URL(requisicao.url);

  // Ignora outras origens (CDNs, analytics...) e esquemas não-http.
  if (url.origin !== self.location.origin) return;

  // Rota especial do laboratório (módulo 3): simula as 3 estratégias.
  if (url.pathname.includes('/__lab__/')) {
    evento.respondWith(responderLaboratorio(requisicao, url));
    return;
  }

  // Navegação (o usuário abriu/atualizou uma página): Network First.
  if (requisicao.mode === 'navigate') {
    evento.respondWith(redePrimeiroComFallback(requisicao));
    return;
  }

  // App Shell conhecido: Cache First. Resto: Stale-While-Revalidate.
  const caminho = url.pathname.replace(/\/+$/, '');
  const ehShell = APP_SHELL.some((item) => {
    const abs = new URL(item, self.location).pathname.replace(/\/+$/, '');
    return abs === caminho;
  });

  evento.respondWith(
    ehShell ? cachePrimeiro(requisicao, CACHE_SHELL) : staleWhileRevalidate(requisicao, CACHE_RUNTIME)
  );
});

// =====================================================================
// ESTRATÉGIAS DE CACHE
// =====================================================================

// CACHE FIRST: procura no cache; só vai à rede se não achar.
// Melhor para arquivos que mudam pouco (o App Shell).
async function cachePrimeiro(requisicao, nomeCache) {
  const emCache = await caches.match(requisicao, { ignoreSearch: true });
  if (emCache) return emCache;
  const resposta = await fetch(requisicao);
  if (resposta.ok) {
    const cache = await caches.open(nomeCache);
    cache.put(requisicao, resposta.clone()); // clone(): o corpo só pode ser lido uma vez
  }
  return resposta;
}

// NETWORK FIRST: tenta a rede; se falhar (offline), usa o cache.
// Melhor para conteúdo que precisa estar sempre fresco, como o HTML.
async function redePrimeiroComFallback(requisicao) {
  try {
    const resposta = await fetch(requisicao);
    if (resposta.ok) {
      const cache = await caches.open(CACHE_SHELL);
      cache.put('./index.html', resposta.clone()); // mantém o shell atualizado
    }
    return resposta;
  } catch (erro) {
    // Sem rede: devolve a versão salva da página, ou a tela offline.
    const emCache =
      (await caches.match(requisicao, { ignoreSearch: true })) ||
      (await caches.match('./index.html')) ||
      (await caches.match('./offline.html'));
    return emCache || new Response('Você está offline.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
}

// STALE-WHILE-REVALIDATE: responde na hora com o cache (se houver) e,
// em paralelo, busca a versão nova para a PRÓXIMA visita.
async function staleWhileRevalidate(requisicao, nomeCache) {
  const cache = await caches.open(nomeCache);
  const emCache = await cache.match(requisicao);
  const buscaNaRede = fetch(requisicao)
    .then((resposta) => {
      if (resposta.ok) cache.put(requisicao, resposta.clone());
      return resposta;
    })
    .catch(() => null);
  return emCache || (await buscaNaRede) || new Response('', { status: 504 });
}

// =====================================================================
// LABORATÓRIO DO MÓDULO 3
// Requisições para /__lab__/<estrategia>/<recurso> são respondidas pelas
// estratégias reais acima, mas o "recurso" é fabricado localmente.
// O cabeçalho X-SW-Strategy diz ao aluno qual estratégia respondeu e
// X-SW-Origem informa se veio do cache ou da "rede".
// =====================================================================
async function responderLaboratorio(requisicao, url) {
  const partes = url.pathname.split('/__lab__/')[1].split('/');
  const estrategia = partes[0]; // cache-first | network-first | swr
  const cache = await caches.open(CACHE_RUNTIME);
  const chave = new Request(url.origin + url.pathname); // ignora a query string

  // Simula uma "rede": gera uma resposta nova com a hora atual.
  const simularRede = async () => {
    if (url.searchParams.get('falhar') === '1') throw new Error('Rede simulada indisponível');
    await new Promise((r) => setTimeout(r, 400)); // latência de mentira para o efeito ficar visível
    return new Response(JSON.stringify({ geradoEm: new Date().toLocaleTimeString('pt-BR'), recurso: partes.slice(1).join('/') }), {
      headers: { 'Content-Type': 'application/json' }
    });
  };

  // Devolve a resposta marcando estratégia e origem.
  const marcar = (resposta, origem) => {
    const cabecalhos = new Headers(resposta.headers);
    cabecalhos.set('X-SW-Strategy', estrategia);
    cabecalhos.set('X-SW-Origem', origem);
    return new Response(resposta.body, { status: resposta.status, headers: cabecalhos });
  };

  if (estrategia === 'cache-first') {
    const guardada = await cache.match(chave);
    if (guardada) return marcar(guardada, 'cache');
    const nova = await simularRede();
    await cache.put(chave, nova.clone());
    return marcar(nova, 'rede (salvou no cache)');
  }

  if (estrategia === 'network-first') {
    try {
      const nova = await simularRede();
      await cache.put(chave, nova.clone());
      return marcar(nova, 'rede');
    } catch (e) {
      const guardada = await cache.match(chave);
      if (guardada) return marcar(guardada, 'cache (rede falhou)');
      return new Response(JSON.stringify({ erro: 'Sem rede e sem cache' }), { status: 504, headers: { 'Content-Type': 'application/json', 'X-SW-Strategy': estrategia, 'X-SW-Origem': 'nenhuma' } });
    }
  }

  // swr (padrão): devolve o cache e atualiza em segundo plano.
  const guardada = await cache.match(chave);
  const atualizacao = simularRede().then((nova) => cache.put(chave, nova.clone())).catch(() => {});
  if (guardada) return marcar(guardada, 'cache (revalidando em segundo plano)');
  await atualizacao;
  const recemSalva = await cache.match(chave);
  return recemSalva
    ? marcar(recemSalva, 'rede (primeira vez)')
    : new Response('{}', { status: 504, headers: { 'X-SW-Strategy': estrategia, 'X-SW-Origem': 'nenhuma' } });
}
