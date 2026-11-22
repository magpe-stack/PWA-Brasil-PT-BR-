/* =====================================================================
 * quiz.js — Quiz de fixação de cada módulo do PWA Brasil (PT-BR)
 *
 * Como funciona:
 *  - As perguntas ficam no objeto QUIZZES, logo abaixo, uma lista por módulo.
 *  - Em cada pergunta, a PRIMEIRA opção da lista "o" é a correta.
 *    Na tela, as opções são embaralhadas a cada tentativa.
 *  - O HTML só precisa de:  <div class="quiz" data-quiz="modulo-1"></div>
 *  - Tirando 70% ou mais, o módulo é marcado como concluído (evento 'quiz:aprovado').
 *  - A melhor nota de cada módulo é guardada no localStorage.
 * ===================================================================== */
(function () {
  'use strict';

  const NOTA_MINIMA = 70; // porcentagem para ser aprovado

  const QUIZZES = {
    'modulo-1': [
      { p: 'Qual é a diferença entre internet e web?',
        o: ['A internet é a rede que liga os aparelhos; a web é um serviço que circula nela (páginas e apps abertos no navegador).',
            'São exatamente a mesma coisa.',
            'A web é a rede de cabos; a internet são as páginas.',
            'A internet é apenas o Wi-Fi da sua casa.'],
        e: 'A internet são as "estradas" e a web são os "veículos" que circulam nelas. O WhatsApp e o e-mail também usam a internet, mas não são "a web".' },
      { p: 'Na analogia do restaurante, quem faz o papel do servidor?',
        o: ['A cozinha, que guarda e prepara o que será entregue.',
            'O cliente que faz o pedido.',
            'O garçom que leva o pedido.',
            'O cardápio.'],
        e: 'O cliente é o navegador, o garçom é a internet e a cozinha é o servidor, que guarda os arquivos do site e os entrega a quem pedir.' },
      { p: 'Qual das três linguagens define a ESTRUTURA e o conteúdo de uma página (títulos, parágrafos, botões)?',
        o: ['HTML', 'CSS', 'JavaScript', 'JSON'],
        e: 'O HTML marca o que cada pedaço do texto é. O CSS cuida da aparência e o JavaScript, do comportamento.' },
      { p: 'Por que o HTTPS é importante para quem quer criar um PWA?',
        o: ['Porque os recursos de PWA só funcionam em conexão segura (a exceção é o localhost, usado para testes).',
            'Porque deixa o site mais bonito.',
            'Porque faz o site abrir offline sozinho, sem precisar de mais nada.',
            'Porque só sites de loja precisam dele.'],
        e: 'Sem HTTPS (ou localhost), o navegador não libera o Service Worker, que é o coração do PWA.' },
      { p: 'Qual é o papel do JavaScript em um site?',
        o: ['Dar comportamento: reagir a cliques, guardar dados, conversar com outros recursos.',
            'Definir as cores e os tamanhos das letras.',
            'Guardar as imagens do site.',
            'Proteger a conversa com criptografia.'],
        e: 'Na analogia da casa, o JavaScript é a parte elétrica: faz a luz acender quando você aperta o interruptor.' }
    ],

    'modulo-2': [
      { p: 'O que significa a sigla PWA?',
        o: ['Progressive Web App (Aplicativo Web Progressivo).',
            'Powerful Web Application.',
            'Programa Web Autônomo.',
            'Private Web Access.'],
        e: '"Web App" porque é feito com tecnologias da web, e "Progressivo" porque funciona em qualquer navegador e ganha mais recursos nos aparelhos mais modernos.' },
      { p: 'Quais são as três peças de um PWA?',
        o: ['HTTPS, manifest e Service Worker.',
            'HTML, banco de dados e loja de aplicativos.',
            'Java, Swift e Kotlin.',
            'Servidor próprio, domínio pago e aplicativo nativo.'],
        e: 'HTTPS dá segurança, o manifest descreve o app e o Service Worker permite guardar arquivos para usar offline.' },
      { p: 'Qual é uma vantagem do PWA em relação ao aplicativo nativo?',
        o: ['Um único código serve para vários aparelhos, e dá para instalar sem passar por loja.',
            'Tem acesso total a todos os recursos do aparelho.',
            'Nunca precisa de internet para nada.',
            'É sempre mais rápido que um app nativo.'],
        e: 'Essa é a grande vantagem. Em compensação, o acesso ao hardware é mais limitado que o de um app nativo.' },
      { p: 'Na analogia da lojinha, o manifest é...',
        o: ['A placa e o cartão de visita: diz o nome e a cara da loja.',
            'A porta com fechadura.',
            'O gerente do estoque.',
            'O fornecedor de mercadorias.'],
        e: 'A porta é o HTTPS e o gerente do estoque é o Service Worker. O manifest é quem apresenta o app.' },
      { p: 'Qual destas afirmações sobre os limites dos PWAs é verdadeira?',
        o: ['Alguns recursos do aparelho ainda são exclusivos de apps nativos, e o iPhone oferece menos recursos que o Android.',
            'PWAs não funcionam em celulares.',
            'PWAs não podem ser instalados.',
            'PWAs só funcionam no Chrome do computador.'],
        e: 'PWAs funcionam em celulares e computadores e podem ser instalados, mas têm limites. Para cursos, listas, agendas e lojas, costumam ser suficientes.' }
    ],

    'modulo-3': [
      { p: 'Em que formato é escrito o manifest?',
        o: ['JSON', 'HTML', 'CSS', 'JavaScript'],
        e: 'JSON organiza informações em pares "nome: valor", como um formulário preenchido.' },
      { p: 'O que significa display: "standalone" no manifest?',
        o: ['O app abre sem a barra de endereços do navegador, com cara de aplicativo de verdade.',
            'O app abre em uma aba comum do navegador.',
            'O app é instalado sem ícone.',
            'O app só abre quando está offline.'],
        e: 'Outras opções são browser (aba comum), minimal-ui e fullscreen (tela cheia).' },
      { p: 'Para que serve um ícone "maskable"?',
        o: ['Ter uma margem de segurança, para o celular recortá-lo em círculo ou quadrado sem cortar o desenho.',
            'Deixar o ícone transparente.',
            'Criar um ícone animado.',
            'Fazer o ícone funcionar offline.'],
        e: 'O desenho importante fica no centro (cerca de 80% da imagem), e o resto é só fundo.' },
      { p: 'Qual destes erros deixa um arquivo JSON inválido?',
        o: ['Colocar uma vírgula depois do último item.',
            'Usar aspas duplas nos textos.',
            'Colocar listas entre colchetes.',
            'Abrir o arquivo com uma chave { e fechar com }.'],
        e: 'Vírgula depois do último item e comentários são os erros mais comuns. As outras opções são exatamente o jeito certo de escrever JSON.' },
      { p: 'O que é o evento beforeinstallprompt?',
        o: ['Um aviso que o navegador envia ao código quando o app pode ser instalado.',
            'O nome do arquivo do manifest.',
            'Uma função que apaga o cache.',
            'O nome do ícone principal.'],
        e: 'Guardando esse aviso, o app pode oferecer o seu próprio botão "Instalar". No iPhone esse evento não existe: use Compartilhar → Adicionar à Tela de Início.' }
    ],

    'modulo-4': [
      { p: 'O que é cache?',
        o: ['Uma cópia guardada de algo, para não precisar buscar de novo.',
            'Uma senha de acesso ao servidor.',
            'Um tipo de propaganda na internet.',
            'Um banco de dados na nuvem.'],
        e: 'Como a caixa de leite na geladeira: está ali, na hora, sem precisar ir ao mercado.' },
      { p: 'Qual é a ordem típica do ciclo de vida de um Service Worker?',
        o: ['register → install → waiting → activate → fetch',
            'fetch → register → activate → install',
            'install → fetch → register → activate',
            'activate → register → fetch → install'],
        e: 'Primeiro ele é registrado, depois instalado (guarda arquivos), fica esperando se já houver outro, é ativado e só então passa a atender os pedidos (fetch).' },
      { p: 'Qual estratégia olha primeiro no cache e só vai à internet se não achar o arquivo?',
        o: ['Cache First', 'Network First', 'Stale-While-Revalidate', 'Nenhuma: o Service Worker sempre vai à internet.'],
        e: 'É a mais rápida, e boa para arquivos que quase não mudam: estilos, scripts e ícones.' },
      { p: 'Para qual tipo de conteúdo a estratégia Network First é mais indicada?',
        o: ['Conteúdo que precisa estar sempre atualizado, como a página principal.',
            'Ícones que nunca mudam.',
            'Arquivos de fonte.',
            'Imagens muito pesadas.'],
        e: 'Ela tenta a internet primeiro e usa o cache apenas se a internet falhar.' },
      { p: 'O que faz a estratégia Stale-While-Revalidate?',
        o: ['Responde na hora com a cópia guardada e busca uma versão nova em segundo plano, para a próxima vez.',
            'Responde só com a internet.',
            'Apaga o cache a cada visita.',
            'Espera a internet responder e só depois olha o cache.'],
        e: '"Stale" é velho e "revalidate" é conferir de novo: usa o velho agora e renova para depois.' },
      { p: 'Em que condição o Service Worker funciona?',
        o: ['Em endereço HTTPS ou em localhost.',
            'Em qualquer endereço, inclusive file://.',
            'Só quando o aparelho está offline.',
            'Só em sites com domínio .com.br.'],
        e: 'Abrir o arquivo direto no computador (file://) não serve: use um servidor local.' }
    ],

    'modulo-5': [
      { p: 'O que é uma API do navegador?',
        o: ['Um conjunto de comandos prontos que o navegador oferece ao seu código.',
            'Um tipo de ícone.',
            'Um servidor que hospeda o site.',
            'Uma linguagem de programação.'],
        e: 'É uma "tomada": você só pede (por exemplo, "compartilhe isto"), e o aparelho faz o trabalho.' },
      { p: 'Onde é mais adequado guardar uma pequena preferência, como o tema escuro?',
        o: ['No localStorage.', 'No CacheStorage.', 'No manifest.', 'No Lighthouse.'],
        e: 'O localStorage é o "caderninho de bolso": poucas informações, em texto. O CacheStorage guarda cópias de arquivos para o Service Worker.' },
      { p: 'Como a Web Share API deve ser usada?',
        o: ['Abre a janela de compartilhar do aparelho e só deve ser acionada depois de um clique da pessoa.',
            'Envia e-mails automaticamente, sem perguntar.',
            'Copia o site para a loja de aplicativos.',
            'Só funciona quando o aparelho está offline.'],
        e: 'A pessoa sempre escolhe para onde compartilhar. Se o navegador não tiver esse recurso, uma boa alternativa é copiar o link.' },
      { p: 'Qual é a melhor hora para pedir permissão de notificações?',
        o: ['Depois de um clique da pessoa, explicando antes por que os avisos serão úteis.',
            'Assim que a página carrega, sem explicar nada.',
            'Nunca: o navegador pede sozinho.',
            'A cada 5 segundos, até a pessoa aceitar.'],
        e: 'Pedidos surpresa costumam ser negados, e depois é difícil reverter.' },
      { p: 'O que é preciso para enviar notificações com o app fechado?',
        o: ['A Push API e um servidor.',
            'Apenas o localStorage.',
            'Apenas o manifest.',
            'Nada além de um Service Worker.'],
        e: 'As notificações locais, criadas pelo próprio app, são o primeiro passo. Avisos com o app fechado dependem de um servidor enviando o push.' }
    ],

    'modulo-6': [
      { p: 'Qual ferramenta do Chrome analisa uma página e dá notas de 0 a 100 com sugestões de melhoria?',
        o: ['Lighthouse', 'Live Server', 'GitHub Pages', 'Manifest'],
        e: 'O Lighthouse fica no DevTools (tecla F12) e avalia desempenho, acessibilidade, boas práticas e SEO.' },
      { p: 'Por que dar dois cliques no index.html não basta para testar um PWA?',
        o: ['Porque o endereço começa com file://, que não é HTTPS nem localhost, e o navegador bloqueia o Service Worker.',
            'Porque o index.html não pode ser aberto no navegador.',
            'Porque o Service Worker só funciona em celulares.',
            'Porque o navegador apaga os arquivos.'],
        e: 'Use um servidor local, como python3 -m http.server 8080 ou a extensão Live Server do VS Code.' },
      { p: 'Em que estado fica um Service Worker novo quando já existe outro trabalhando?',
        o: ['waiting (esperando)', 'fetch', 'register', 'offline'],
        e: 'Ele espera na fila até o antigo sair, ou até receber a ordem de furar a fila (skipWaiting).' },
      { p: 'O que o comando skipWaiting faz?',
        o: ['Faz o Service Worker novo assumir o trabalho sem esperar na fila.',
            'Apaga o manifest.',
            'Desinstala o app do aparelho.',
            'Bloqueia as atualizações.'],
        e: 'Depois de assumir, a página é recarregada para usar os arquivos da versão nova.' },
      { p: 'Qual é a vantagem do GitHub Pages para um iniciante em PWA?',
        o: ['Publica de graça e já entrega com HTTPS.',
            'Dispensa o uso de Service Worker.',
            'Instala o app automaticamente nos celulares.',
            'Faz o app funcionar em qualquer navegador antigo.'],
        e: 'O HTTPS é exigido pelo Service Worker, e o GitHub Pages o oferece sem custo.' },
      { p: 'Por que este projeto usa caminhos relativos, como ./sw.js, em vez de /sw.js?',
        o: ['Para funcionar em qualquer pasta, inclusive na subpasta com o nome do repositório no GitHub Pages.',
            'Porque caminhos relativos são mais rápidos.',
            'Porque o navegador não aceita a barra no começo.',
            'Porque assim o app não precisa de manifest.'],
        e: 'O endereço do GitHub Pages tem o nome do repositório no meio, e o caminho "/sw.js" apontaria para a raiz do domínio, não para a sua pasta.' }
    ],

    'modulo-7': [
      { p: 'Quais são os arquivos mínimos do primeiro PWA deste curso?',
        o: ['index.html, manifest.webmanifest, sw.js e os ícones PNG.',
            'Somente o index.html.',
            'Um banco de dados e um servidor próprio.',
            'Apenas imagens e um arquivo de texto.'],
        e: 'São quatro tipos de arquivo: a página, o manifest, o Service Worker e os ícones.' },
      { p: 'Em qual aba do DevTools você confere o manifest, o Service Worker e o Cache Storage?',
        o: ['Application (Aplicativo)', 'Console', 'Elements', 'Network'],
        e: 'A aba Application é o "raio-x" do PWA.' },
      { p: 'Você mudou o código, mas o app continua mostrando a versão antiga. O que fazer?',
        o: ['Trocar a versão do cache (por exemplo, v1 para v2) ou usar "Clear site data" no DevTools.',
            'Apagar o ícone do app.',
            'Trocar de navegador sem mexer em nada.',
            'Desligar a internet.'],
        e: 'O cache antigo continua sendo servido até que o Service Worker mude de versão e apague as gavetas velhas.' },
      { p: 'Como simular o app offline no DevTools?',
        o: ['Em Application → Service Workers, marcar "Offline" e recarregar a página.',
            'Apagando o index.html.',
            'Mudando o idioma do navegador.',
            'Fechando o DevTools.'],
        e: 'Se o app continuar abrindo, o Service Worker está servindo os arquivos do cache.' },
      { p: 'O Service Worker não aparece no DevTools. Qual é a causa mais provável?',
        o: ['A página foi aberta como file://, em vez de localhost ou HTTPS.',
            'O ícone é muito grande.',
            'O manifest tem cores demais.',
            'O navegador está em modo escuro.'],
        e: 'Rode um servidor local e acesse http://localhost:8080.' }
    ]
  };

  /* ---------- utilitários ---------- */
  const embaralhar = (lista) => {
    const a = lista.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const LER = () => {
    try { return JSON.parse(localStorage.getItem('pwa-brasil:quiz-v1')) || {}; } catch (e) { return {}; }
  };
  const GRAVAR = (dados) => {
    try { localStorage.setItem('pwa-brasil:quiz-v1', JSON.stringify(dados)); } catch (e) { /* ignora */ }
  };

  const el = (tag, classe, texto) => {
    const n = document.createElement(tag);
    if (classe) n.className = classe;
    if (texto !== undefined) n.textContent = texto;
    return n;
  };

  /* ---------- montagem de um quiz ---------- */
  function montar(raiz) {
    const id = raiz.dataset.quiz;
    const perguntas = QUIZZES[id];
    if (!perguntas) return;
    desenhar(raiz, id, perguntas);
  }

  function desenhar(raiz, id, perguntas) {
    raiz.replaceChildren();
    const salvo = LER()[id];

    raiz.append(el('h3', null, '📝 Quiz do módulo'));
    const intro = el('p', null,
      `Responda as ${perguntas.length} perguntas e clique em "Corrigir". Com ${NOTA_MINIMA}% ou mais, o módulo é marcado como concluído. ` +
      'Pode errar à vontade: ao tentar de novo, as opções mudam de lugar.');
    raiz.append(intro);
    if (salvo) raiz.append(el('p', 'quiz__melhor', `Sua melhor nota neste quiz: ${salvo.melhor}% (${salvo.tentativas} ${salvo.tentativas === 1 ? 'tentativa' : 'tentativas'}).`));

    const form = el('form', 'quiz__form');
    form.noValidate = true;

    // A ordem das perguntas é mantida; só as opções são embaralhadas.
    const sorteadas = perguntas.map((q) => ({
      q,
      opcoes: embaralhar(q.o.map((texto, i) => ({ texto, correta: i === 0 })))
    }));

    sorteadas.forEach((item, n) => {
      const campo = el('fieldset', 'quiz__pergunta');
      campo.append(el('legend', null, `${n + 1}. ${item.q.p}`));
      item.opcoes.forEach((op, k) => {
        const rotulo = el('label', 'quiz__opcao');
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = `${id}-p${n}`;
        radio.value = String(k);
        rotulo.append(radio, el('span', null, op.texto));
        campo.append(rotulo);
      });
      const retorno = el('p', 'quiz__retorno');
      retorno.setAttribute('aria-live', 'polite');
      campo.append(retorno);
      form.append(campo);
    });

    const acoes = el('div', 'lab__acoes');
    const botaoCorrigir = el('button', 'btn btn--primario', 'Corrigir respostas');
    botaoCorrigir.type = 'submit';
    acoes.append(botaoCorrigir);
    const aviso = el('p', 'lab__saida');
    aviso.setAttribute('aria-live', 'polite');
    form.append(acoes, aviso);
    raiz.append(form);

    form.addEventListener('submit', (ev) => {
      ev.preventDefault();

      const marcadas = sorteadas.map((_, n) => form.querySelector(`input[name="${id}-p${n}"]:checked`));
      const faltam = marcadas.reduce((acc, m, n) => (m ? acc : acc.concat(n + 1)), []);
      if (faltam.length) {
        aviso.textContent = `Responda todas as perguntas antes de corrigir. Faltam: ${faltam.join(', ')}.`;
        aviso.className = 'lab__saida erro';
        return;
      }

      let acertos = 0;
      const campos = form.querySelectorAll('.quiz__pergunta');
      sorteadas.forEach((item, n) => {
        const escolhida = item.opcoes[Number(marcadas[n].value)];
        const certa = escolhida.correta;
        if (certa) acertos++;

        const campo = campos[n];
        campo.classList.add(certa ? 'quiz__pergunta--ok' : 'quiz__pergunta--erro');
        campo.querySelectorAll('input').forEach((r) => { r.disabled = true; });
        // Destaca a opção correta e a escolhida (errada), sem depender só de cor.
        campo.querySelectorAll('.quiz__opcao').forEach((rotulo, k) => {
          if (item.opcoes[k].correta) rotulo.classList.add('quiz__opcao--certa');
          else if (rotulo.querySelector('input').checked) rotulo.classList.add('quiz__opcao--errada');
        });
        const retorno = $retorno(campo);
        const certaTexto = item.opcoes.find((o) => o.correta).texto;
        retorno.textContent = (certa ? '✔ Correto! ' : '✘ Não foi dessa vez. Resposta certa: "' + certaTexto + '" ') + item.q.e;
      });

      const nota = Math.round((acertos / perguntas.length) * 100);
      const aprovado = nota >= NOTA_MINIMA;

      // Salva a melhor nota e o número de tentativas
      const todos = LER();
      const anterior = todos[id] || { melhor: 0, tentativas: 0 };
      todos[id] = { melhor: Math.max(anterior.melhor, nota), tentativas: anterior.tentativas + 1 };
      GRAVAR(todos);

      botaoCorrigir.remove();
      aviso.remove();

      const resultado = el('div', 'caixa ' + (aprovado ? 'caixa--dica' : 'caixa--atencao'));
      resultado.setAttribute('role', 'status');
      resultado.append(el('strong', null, `Você acertou ${acertos} de ${perguntas.length} (${nota}%).`));
      resultado.append(el('span', null, aprovado
        ? ' Parabéns, módulo aprovado! Ele foi marcado como concluído.'
        : ` Para concluir pelo quiz, é preciso ${NOTA_MINIMA}% ou mais. Releia as explicações acima e tente de novo.`));
      const novo = el('div', 'lab__acoes');
      const botaoNovo = el('button', 'btn btn--secundario', 'Tentar de novo');
      botaoNovo.type = 'button';
      botaoNovo.addEventListener('click', () => {
        desenhar(raiz, id, perguntas);
        raiz.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      novo.append(botaoNovo);
      form.append(resultado, novo);
      resultado.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

      if (aprovado) document.dispatchEvent(new CustomEvent('quiz:aprovado', { detail: { modulo: id } }));
    });
  }

  const $retorno = (campo) => campo.querySelector('.quiz__retorno');

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.quiz[data-quiz]').forEach(montar);
  });
})();
