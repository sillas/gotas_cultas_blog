# 7. Executando a stack local

A stack local permite testar o blog, o painel administrativo, posts, imagens, métricas e agendamentos sem acessar AWS, Cognito ou GitHub Actions.

Tudo fica disponível em uma única origem:

```text
http://localhost:8080
```

## Pré-requisitos

Você precisa de:

- Node.js 22 e npm;
- Docker Engine ou Docker Desktop;
- Docker Compose;
- porta `8080` livre.

Confirme:

```sh
node --version
npm --version
docker --version
docker compose version
docker ps
```

Se `docker ps` retornar erro de permissão ou conexão, inicie o Docker ou ajuste o acesso ao daemon antes de continuar.

## Primeira execução

Na raiz do repositório:

```sh
npm ci
npm run local:up
```

`local:up` executa `docker compose up --build -d`. Na primeira vez, o Docker precisa baixar as imagens base e instalar as dependências; por isso, essa execução demora mais.

Acompanhe a preparação:

```sh
npm run local:logs
```

O ambiente está pronto quando aparecer:

```text
[local-api] Listening on 3000
[local-publisher] Published 1 post(s)
```

Saia da visualização dos logs com `Ctrl+C`. Isso não encerra os containers.

## Endereços

| Área | Endereço |
|---|---|
| Site público | http://localhost:8080 |
| Posts | http://localhost:8080/blog/ |
| Admin | http://localhost:8080/admin/login |
| Health da API | http://localhost:8080/api/health |

No admin local, clique em **Entrar**. Não existe senha local: o frontend grava um token exclusivo do modo de desenvolvimento e abre o painel.

Esse modo não é usado no build normal de produção, que continua dependendo do Cognito.

## Dados iniciais

Na primeira inicialização de um volume vazio, a API cria:

- um post publicado chamado `bem-vindo`;
- um rascunho chamado `rascunho-local`.

O post publicado aparece no site. O rascunho aparece apenas no painel.

## Validar automaticamente

Depois que o publisher concluir o primeiro build:

```sh
npm run local:check
```

O comando verifica, sem alterar dados:

- página inicial;
- post de boas-vindas;
- login do admin;
- health da API;
- autenticação local;
- dados iniciais.

## Fluxo sugerido de teste

1. Abra `/admin/login` e clique em **Entrar**.
2. Crie um post como rascunho e confirme que ele não aparece no site.
3. Altere o status para publicado e informe uma data válida.
4. Aguarde alguns segundos.
5. Atualize `/blog/` e abra o post.
6. Faça upload de uma imagem de capa.
7. Abra a tela de métricas.
8. Crie um post agendado para alguns minutos à frente e confirme sua publicação automática.

O scheduler verifica posts vencidos a cada cinco segundos. O publisher verifica alterações a cada três segundos e reconstrói o site estático. Durante o build, acompanhe:

```sh
npm run local:logs
```

## Comandos cotidianos

### Iniciar ou reconstruir

```sh
npm run local:up
```

O comando pode ser executado novamente após mudanças no código. Ele reconstrói as imagens quando necessário e preserva posts e imagens locais.

### Verificar estado

```sh
docker compose -f local-stack/docker-compose.yml ps
```

Os serviços esperados são:

```text
dynamodb
api
publisher
web
```

### Acompanhar logs

```sh
npm run local:logs
```

Para um serviço específico:

```sh
docker compose -f local-stack/docker-compose.yml logs -f api
docker compose -f local-stack/docker-compose.yml logs -f publisher
docker compose -f local-stack/docker-compose.yml logs -f web
```

### Parar preservando dados

```sh
npm run local:down
```

Posts e imagens permanecem nos volumes Docker e voltam no próximo `local:up`.

### Apagar todos os dados locais

```sh
npm run local:reset
```

O reset remove os volumes de posts e imagens e também limpa os JSONs exportados para `site/src/content/posts`, preservando apenas o `.gitkeep` versionado.

Esse comando executa `docker compose down -v` e remove somente os volumes da stack local:

- banco DynamoDB Local;
- imagens locais;
- site/admin compilados.

Na próxima inicialização, as fixtures padrão serão recriadas.

## Estrutura

```text
Navegador
    │
    ▼
Nginx :8080
    ├── / e páginas públicas ──▶ volume web-data
    ├── /admin/*              ──▶ SPA React em web-data
    ├── /api/*                ──▶ API Node
    └── /images/*             ──▶ API Node / images-data
                                      │
                                      ▼
                                DynamoDB Local

Publisher ── consulta DynamoDB ── build Astro/admin ──▶ web-data
```

Os containers estão definidos em `local-stack/docker-compose.yml`:

| Container | Responsabilidade |
|---|---|
| `dynamodb` | Banco compatível com o modelo DynamoDB da produção. |
| `api` | CRUD, autenticação local, views, métricas, uploads e scheduler. |
| `publisher` | Exportação de posts e builds do site/admin. |
| `web` | Nginx, porta 8080, rotas estáticas e proxy da API. |

## Persistência

A stack usa volumes Docker nomeados:

| Volume | Conteúdo |
|---|---|
| `dynamodb-data` | Posts, status e views. |
| `images-data` | Imagens enviadas pelo painel. |
| `web-data` | Site e painel compilados. |

Nenhum conteúdo desses volumes é adicionado ao Git.

## Problemas comuns

### Porta 8080 ocupada

Identifique o processo ou container:

```sh
docker ps --format 'table {{.Names}}\t{{.Ports}}'
```

Pare o serviço conflitante ou altere temporariamente o mapeamento `8080:80` em `local-stack/docker-compose.yml`.

### Admin branco ou arquivos antigos

Reconstrua e faça uma atualização forçada no navegador:

```sh
npm run local:up
```

Depois use `Ctrl+Shift+R`. Confira também o console do navegador e os logs do `publisher`.

Se uma versão antiga redirecionou links para `http://localhost/...` sem a porta, limpe os dados do site `localhost` no navegador uma vez. Redirects HTTP 301 podem permanecer no cache mesmo depois de o servidor ser corrigido. A configuração atual serve rotas limpas diretamente, sem esse redirect.

### Site abre antes do primeiro build

O Nginx pode iniciar antes de o publisher terminar. Aguarde:

```text
[local-publisher] Published ... post(s)
```

### API indisponível depois de recriar containers

Execute novamente:

```sh
npm run local:up
npm run local:check
```

### DynamoDB sem permissão para gravar

Confira se o Compose atual está sendo usado e recrie os volumes locais:

```sh
npm run local:reset
npm run local:up
```

### Ver todos os erros recentes

```sh
docker compose -f local-stack/docker-compose.yml logs --tail=200
```

## O que a stack não simula

Ela não valida:

- IAM e OIDC;
- Cognito real;
- CloudFront Functions;
- certificado ACM e DNS;
- URLs presigned reais do S3;
- EventBridge Scheduler real;
- GitHub Actions.

Esses componentes continuam sendo validados por builds, `cdk synth`, workflows e smoke tests após o deploy AWS.
