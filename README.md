# PWA Brasil (PT-BR)

PWA educacional em português que ensina a criar e publicar PWAs, implementando ao vivo tudo o que ensina.
HTML + CSS + JavaScript puros, sem frameworks e sem Workbox.

## Estrutura de pastas

```
.
├── index.html              # Estrutura: splash, drawer, 5 módulos e laboratórios
├── styles.css              # Temas claro/escuro, responsividade, badges, código
├── app.js                  # Navegação, SW, instalação, inspetor de cache, progresso
├── sw.js                   # Service Worker manual (pré-cache + 3 estratégias)
├── manifest.webmanifest    # Web App Manifest
├── offline.html            # Fallback offline de último recurso
└── icons/
    ├── icon-192.png
    ├── icon-512.png
    ├── icon-maskable-512.png
    ├── apple-touch-icon.png
    └── favicon.svg
```

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
