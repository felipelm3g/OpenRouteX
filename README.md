# OpenRouteX

OpenRouteX é um API Gateway self-hosted, open source e Docker-first para centralizar integrações com APIs externas.

Ele substitui integrações diretas criando uma camada intermediária inteligente com:

- Roteamento dinâmico por API + Path
- Autenticação centralizada por integração (reutilizável entre APIs)
- Contexto multi-tenant por API Key (bindings de variáveis)
- Proxy pass-through (o body nunca é modificado)
- Logs completos por request/response (raw)
- Rate limit básico por API Key

Fluxo:

CLIENTE → OpenRouteX → APIs externas

O cliente nunca acessa a API externa diretamente.

---

## Como Funciona (Conceito Central)

O endpoint público segue o padrão:

`{URL}/{api}/{path}`

Exemplo:

`{URL}/conta/dados`

Header obrigatório:

`API-KEY: <key>`

Quando uma requisição chega, o OpenRouteX:

1. Resolve a API pelo slug (`/{api}`)
2. Resolve o Path pelo `publicPath + method`
3. Valida API Key (multi-tenant context)
4. Carrega a Auth vinculada ao Path (se existir)
5. Resolve variáveis `{VAR_NAME}` usando exclusivamente `variableBindings` da API Key
6. Monta a URL final do sistema externo
7. Faz a chamada upstream replicando method, query, headers e body (sem alterar payload)
8. Retorna a resposta upstream sem alterar o body
9. Registra logs completos do request e response

Importante:

- Apenas URLs válidas (slug + path cadastrados) são controladas e registradas.
- Requisições para URLs inválidas (ex.: `/favicon.ico`, `/robots.txt`, slug inexistente ou path não cadastrado) retornam 404 e não entram no log.

### Regra Mais Importante (Pass-through)

- O BODY NUNCA é modificado.
- O gateway é 100% pass-through no payload.
- Somente URL, headers e query params podem ser transformados.

---

## Arquitetura

### Backend (NestJS) — `/app`

Módulos principais:

- `auth`: autenticações reutilizáveis (Bearer, Basic, API Key header, Custom Header, OAuth2 client credentials)
- `apis`: cadastro de APIs (slug)
- `paths`: rotas públicas por API + method, com target URL template e auth
- `apikeys`: API Keys (multi-tenant), com bindings de variáveis e rate limit
- `variables`: detecção e resolução de `{VAR_NAME}`
- `proxy`: engine de proxy pass-through
- `logging`: logs completos (request/response raw)
- `rate-limit`: rate limit por API Key usando Redis

Core:

- `http-client`: cliente HTTP upstream
- `auth-engine`: construção de headers de auth para upstream (inclui OAuth2 client credentials com cache em Redis)
- `variable-resolver`: resolução de templates com `{VAR_NAME}`

Endpoints administrativos (para o dashboard):

- `GET /admin/metrics`
- CRUD: `/admin/apis`, `/admin/paths`, `/admin/auth`, `/admin/apikeys`
- Logs: `GET /admin/logs`, `GET /admin/logs/:id`
- Health: `GET /health`

### Frontend (Next.js) — `/web`

Dashboard com foco em SaaS enterprise (dark default + light opcional), responsivo (desktop/tablet/mobile), com:

- Sidebar fixa (desktop) + drawer (mobile)
- Tabelas responsivas (desktop) e cards (mobile)
- Filtro + ordenação + paginação em tabelas
- Modais de criação/edição
- Toasts e loading skeletons
- Logs no Dashboard com atualização periódica e detalhe (headers/body raw)

---

## Instalação (Docker)

Pré-requisitos:

- Docker + Docker Compose

Subir tudo:

```bash
docker compose up -d --build
```

### Configurar HOST, URL_PORTAL e URL_BACKEND (fonte única)

O OpenRouteX é “Docker-first”: todas as URLs/IPs usadas pelo sistema vêm do [docker-compose.yml](docker-compose.yml).

No [docker-compose.yml](docker-compose.yml), edite os valores no topo do arquivo (apenas texto):

- `x-host` (HOST): IP/host da máquina (ou `localhost` quando rodar local)
- `x-url-portal` (URL_PORTAL): URL pública do Portal (ou `localhost`)
- `x-url-backend` (URL_BACKEND): URL pública do Gateway/Backend (ou `localhost`)
- `x-admin-user` / `x-admin-password`: credenciais iniciais do portal

Regras:

- Se `URL_PORTAL == localhost`, o sistema usa `http://HOST:3100` como Portal.
- Se `URL_BACKEND == localhost`, o sistema usa `http://HOST:3994` como Gateway/Backend.
- Se `URL_*` vier com uma URL completa (ex.: `https://...`), o sistema usa essa URL.

Importante:

- O backend usa `URL_BACKEND` para compor `originalUrl` nos logs e validar CORS.
- O portal usa `HOST/URL_BACKEND` (em runtime) para chamadas ao backend.
- Sempre que alterar `HOST`, `URL_PORTAL` ou `URL_BACKEND`, rode `docker compose up -d --build` para reconstruir as imagens.

Serviços:

- Portal (Next.js): `http://HOST:3100`
- Gateway/Backend (NestJS): `http://HOST:3994`
- Postgres: `localhost:15432` (com volume persistente)
- Redis: interno (na rede do Docker, não exposto no host)

### HTTPS / SSL (opcional, em Docker)

Por padrão o OpenRouteX roda em HTTP.

Opções suportadas:

1) Reverse proxy em Docker (recomendado): subir o serviço `edge` (Nginx) via profile:

```bash
docker compose --profile edge up -d --build
```

O `edge` publica o Portal em `80/443` e lê certificados de `./certs` (montado no container).

2) HTTPS direto no backend: o backend suporta `SSL_KEY_PATH`, `SSL_CERT_PATH` e `SSL_PASSPHRASE` via `docker-compose.yml` (se você montar os arquivos no container).

---

## Exemplo de Uso (Proxy)

1) Criar uma API (slug `conta`), um Path e uma API Key pelo Portal (`http://HOST:3100`).

2) Exemplo de Path:

- API: `conta`
- Public Path: `/dados`
- Method: `GET`
- Target URL Template: `https://sistemafinal.com/conta/{CONTA}/dados`

3) Exemplo de API Key:

```json
{
  "CONTA": "55555",
  "STORE": "abc123"
}
```

4) Chamada do cliente:

```bash
curl --location \
  '{URL_BACKEND}/conta/dados' \
  --header 'API-KEY: abcdef'
```

Resultado interno (URL final):

`https://sistemafinal.com/conta/55555/dados`

---

## Variáveis por API Key (Multi-tenant)

Variáveis seguem o formato:

`{VAR_NAME}`

Regras:

- Variáveis são resolvidas SOMENTE via API Key (`variableBindings`).
- Variáveis nunca vêm do cliente.
- Variáveis nunca vêm do body.

Onde podem existir templates com variáveis:

- `targetUrlTemplate` do Path
- `addHeaders` do Path
- `addQuery` do Path

Exemplo:

Template:

`https://api.com/conta/{CONTA}/dados`

API Key A:

- `CONTA = 55555`

API Key B:

- `CONTA = 66666`

O mesmo Path gera URLs finais diferentes, dependendo da API Key.

---

## Logging (Obrigatório)

Cada request gera log com:

- `requestId` (UUID)
- `apiKey`, `apiSlug`, `publicPath`, `method`
- `originalUrl`, `finalUrl`
- `requestHeaders`, `requestBody` (raw)
- `responseHeaders`, `responseBody` (raw)
- `statusCode`, `durationMs`, `createdAt`

No Dashboard:

- Dashboard com filtros e detalhe estilo observabilidade

Importante:

- Apenas URLs válidas (slug + path cadastrados) entram no log.

---

## Rate Limit (Básico)

O rate limit é por API Key:

- `requestsPerMinute` (configurável por API Key)
- Resposta 429 quando excede
- Headers:
  - `X-RateLimit-Limit`
  - `X-RateLimit-Remaining`
  - `X-RateLimit-Reset`

---

## Idiomas (i18n) e Portal

O idioma do Portal é selecionado em **Configurações** e persistido globalmente.

Para adicionar um novo idioma sem rebuild, basta colocar um arquivo JSON em `web/public/i18n/*.json` (no host). O container do `web` lê esses arquivos em runtime.

---

## Licença

Veja [LICENSE](LICENSE).
