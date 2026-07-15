# 3. Primeiro deploy

Execute o primeiro deploy em etapas. Comandos que alteram AWS ou GitHub exigem `--yes`.

## Etapa 1 — Bootstrap e OIDC

```sh
npm run setup:bootstrap -- --yes
```

Esse comando:

- prepara a conta/região para o AWS CDK;
- configura o provedor OIDC do GitHub, quando ainda não existe;
- cria ou atualiza a role `TheBlogBaseGitHubActionsRole`;
- permite que os workflows usem credenciais temporárias.

Não são criadas access keys permanentes no GitHub.

## Etapa 2 — Variáveis iniciais do GitHub

```sh
npm run setup:github -- --yes
```

São configurados conta, região, role OIDC, domínio, hosted zone e opções operacionais.

## Etapa 3 — Checagem pré-deploy

```sh
npm run predeploy
```

Esse comando é somente leitura e executa:

- builds;
- typechecks;
- testes;
- audit de dependências;
- `cdk synth`;
- validação AWS/GitHub/Git.

## Etapa 4 — Infraestrutura

```sh
npm run deploy:infra -- --yes
```

O comando dispara o workflow `deploy-infra.yml`. Acompanhe pelo GitHub Actions ou por:

```sh
gh run watch --repo owner/repo
```

Espere a conclusão antes de continuar. Serão criados, conforme a configuração:

- DynamoDB;
- Cognito;
- Lambdas;
- API Gateway;
- EventBridge Scheduler;
- buckets S3 privados;
- CloudFront;
- certificado e DNS, quando houver domínio;
- secret vazio para o token de rebuild.

## Etapa 5 — Sincronizar outputs

```sh
npm run setup:sync -- --yes
```

O script lê os outputs do CloudFormation e configura automaticamente no GitHub:

- tabela;
- bucket web;
- distribuição CloudFront;
- URLs do site e API;
- Cognito Client ID e domínio;
- callbacks do painel.

## Etapa 6 — Administrador e rebuild

```sh
npm run setup:admin -- --yes
```

O comando:

- cria o primeiro usuário Cognito, se ainda não existir;
- grava no Secrets Manager o token da sessão atual do `gh`, usado para disparar rebuilds.

Antes de executar, confira os escopos do token:

```sh
gh auth status
```

Para menor privilégio, prefira autenticar o `gh` com um token fine-grained dedicado ao repositório.

O Cognito enviará instruções de primeiro acesso conforme sua configuração de entrega de e-mail.

## Etapa 7 — Site e painel

```sh
npm run deploy:site -- --yes
```

O workflow exporta posts publicados — nenhum no primeiro uso —, constrói as páginas padrão, publica o painel em `/admin` e invalida apenas os caminhos necessários no CloudFront.

## Alternativa automatizada

Após compreender e revisar as etapas, é possível executar tudo com:

```sh
npm run launch -- --yes
```

O comando acompanha os workflows e executa os testes finais. Não use essa alternativa enquanto ainda estiver conhecendo a conta AWS ou revisando permissões.
