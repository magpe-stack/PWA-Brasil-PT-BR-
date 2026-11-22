# PWA Brasil (PT-BR)

PWA educacional em português que ensina a criar e publicar PWAs, implementando ao vivo tudo o que ensina.
HTML + CSS + JavaScript puros, sem frameworks e sem Workbox.

## Conteúdo do curso (para quem nunca programou)

1. Como a web funciona (internet, servidor, URL, HTTPS, HTML/CSS/JS) + editor de HTML ao vivo
2. O que é um PWA + checklist de prontidão
3. Manifest e instalação (inclui introdução a JSON)
4. Service Worker e cache (analogias, ciclo de vida, 3 estratégias)
5. Recursos do aparelho (armazenamento, Web Share, notificações)
6. Testar, atualizar e publicar (DevTools, Lighthouse, GitHub Pages)
7. Mão na massa: criar o seu primeiro PWA, passo a passo
+ Glossário

Cada módulo termina com um **quiz** (5 a 6 perguntas, correção com explicação, melhor nota salva
no navegador; 70% ou mais conclui o módulo). As perguntas ficam em `quiz.js`, no objeto `QUIZZES`:
a primeira opção de cada pergunta é a correta, e a ordem é embaralhada na tela.

Para adicionar um módulo novo: copie uma `<section class="modulo">` do `index.html`,
inclua o botão `.btn-concluir` e um link no menu. O progresso se ajusta sozinho.

## Arquivos (todos soltos na raiz, sem subpastas)

```
index.html              # Estrutura: splash, menu, 7 módulos, laboratórios, glossário
styles.css              # Temas claro/escuro, responsividade, quiz, caixas didáticas
app.js                  # Navegação, SW, instalação, inspetor de cache, progresso
quiz.js                 # Perguntas e lógica dos quizzes
sw.js                   # Service Worker manual (pré-cache + 3 estratégias)
manifest.webmanifest    # Web App Manifest
offline.html            # Fallback offline de último recurso
icon-192.png  icon-512.png  icon-maskable-512.png  apple-touch-icon.png  favicon.svg
```

Sem pastas, dá para arrastar tudo de uma vez na tela de upload do GitHub
(**Add file → Upload files**).

## Rodar localmente

Service Workers não funcionam via `file://`. Use um servidor local:

```bash
python3 -m http.server 8080
# abra http://localhost:8080
```

## Publicar no GitHub Pages

1. Envie todos os arquivos para a raiz de um repositório.
2. Settings → Pages → Branch `main`, pasta `/ (root)`.
3. Acesse `https://usuario.github.io/repositorio/`.

Todos os caminhos são relativos, então funciona em subpasta.

## Atualizando o app

Altere `VERSAO` em `sw.js` a cada publicação. O navegador detecta a mudança,
instala o novo SW em segundo plano e o app mostra o banner "Nova versão disponível".
Se você alterar qualquer arquivo do App Shell, lembre-se de mudar a `VERSAO` também.
