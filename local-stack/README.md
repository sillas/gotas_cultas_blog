# Stack local

Ambiente funcional do blog sem AWS, Cognito, GitHub Actions ou outros serviços externos em runtime.

O guia detalhado de instalação, execução, testes e diagnóstico está em [doc_deploy/07-stack-local.md](../doc_deploy/07-stack-local.md).

## Iniciar

Para desenvolver layout, componentes e CSS com atualização automática:

```sh
npm run local:down
npm run local:dev
```

Esse modo executa Astro e Vite como servidores de desenvolvimento, monta o workspace nos containers e mantém site, admin e API sob `http://localhost:8080`. Encerre-o com `Ctrl+C` e `npm run local:dev:down`.

Para validar os bundles estáticos, use a stack original:

```sh
npm run local:up
```

Na primeira execução, o Docker baixa as imagens e constrói site/admin. Aguarde o log:

```text
[local-publisher] Published 1 post(s)
```

Acesse:

- Site: http://localhost:8080
- Admin: http://localhost:8080/admin/login
- Health: http://localhost:8080/api/health

No modo local, o botão **Entrar** autentica automaticamente. Não há senha local nem integração com Cognito.

## Comandos

```sh
npm run local:logs   # acompanha logs
npm run local:check  # smoke tests sem alterar dados
npm run local:down   # para, preservando dados
npm run local:reset  # para e apaga posts/imagens locais
npm run local:dev       # desenvolvimento com hot reload
npm run local:dev:logs  # logs do modo de desenvolvimento
npm run local:dev:down  # encerra o modo de desenvolvimento
```

Depois de criar, editar, publicar ou agendar um post, o container `publisher` detecta a alteração e reconstrói o site em poucos segundos. O scheduler verifica posts vencidos a cada cinco segundos.

## Serviços

| Serviço | Função |
|---|---|
| `dynamodb` | DynamoDB Local persistente. |
| `api` | CRUD, métricas, views, uploads, autenticação e scheduler locais. |
| `publisher` | Exporta posts publicados e reconstrói Astro/admin. |
| `web` | Nginx em `localhost:8080`, reunindo site, admin, API e imagens. |

Os dados vivem em volumes Docker nomeados. Nenhum arquivo de conteúdo local é versionado.

## Limites

Esta stack testa o comportamento do produto, não a implementação interna da AWS. Ela não reproduz IAM, CloudFront Functions, Cognito, URLs presigned reais, Route 53, ACM ou OIDC. Esses itens continuam cobertos por `cdk synth` e pelos testes pós-deploy.

`VITE_AUTH_MODE=local` é definido exclusivamente durante o build do admin no container local. Builds normais continuam usando Cognito.
