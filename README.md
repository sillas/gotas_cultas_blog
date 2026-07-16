# The Blog Base

Base serverless e de baixo custo para blogs pessoais independentes. Este repositório não é um criador de blogs: ele oferece site Astro, painel administrativo React, API, publicação e infraestrutura AWS comuns. Cada blog derivado deve ter seu próprio repositório, identidade visual, conteúdo e configuração.

O projeto trabalha com dois ambientes rigorosamente separados:

| Ambiente | Branch | Conta AWS | Pode ser removido integralmente? |
|---|---|---|---|
| Homologação | `homolog` | Conta exclusiva de testes | Sim |
| Produção | `main` | Conta exclusiva de produção | Não pela automação |

As contas AWS devem ser diferentes. O setup recusa a configuração se os dois ambientes apontarem para o mesmo ID de conta.

## 1. Clonar e adaptar o projeto

### Pré-requisitos

Instale Git, Node.js 22, npm, Docker, AWS CLI e GitHub CLI (`gh`). Você também precisa de duas contas AWS e de um repositório GitHub próprio.

Confirme as ferramentas:

```sh
git --version
node --version
npm --version
docker --version
docker compose version
aws --version
gh --version
```

### Criar seu repositório derivado

Clone a base, entre no diretório e aponte o remote para seu repositório:

```sh
git clone URL_DESTA_BASE meu-blog
cd meu-blog
git remote set-url origin git@github.com:SEU_USUARIO/SEU_REPOSITORIO.git
npm ci
npm run hooks:install
```

Crie a branch de homologação e publique as duas branches:

```sh
git switch -c homolog
git push -u origin homolog
git switch main
git push -u origin main
```

O pré-commit instalado executa validações antes de cada commit. Não remova o arquivo `package-lock.json` e prefira `npm ci` ao preparar uma instalação limpa.

### Configurar as contas

Copie o modelo local:

```sh
cp project.config.example.json project.config.json
```

Preencha:

- `github.repository` no formato `owner/repository`;
- conta, região, domínio opcional e e-mail administrativo de `homolog`;
- conta, região, domínio opcional e e-mail administrativo de `production`.

`project.config.json` é ignorado pelo Git e não deve conter senhas, tokens ou access keys. Consulte [Configuração dos ambientes](doc_deploy/02-configuracao.md) para um exemplo comentado.

Edite também [deploy-accounts.json](deploy-accounts.json), substituindo os IDs de exemplo pelas mesmas contas. Esse arquivo é versionado de propósito: os workflows o usam como fonte independente das variáveis dos GitHub Environments. Faça essa alteração por pull request e proteja `main` contra mudanças sem revisão.

Design, textos padrão, páginas e componentes ficam principalmente em `site/`. O painel fica em `admin/`. Faça essas adaptações normalmente em `homolog`; depois de validar, integre-as em `main` por pull request.

## 2. Testar localmente

O modo local não acessa AWS, Cognito ou GitHub Actions. Ele utiliza Docker, DynamoDB Local, uma API Node e Nginx.

Na raiz do projeto:

```sh
npm ci
npm run local:up
npm run local:check
```

Abra:

- site: http://localhost:8080
- posts: http://localhost:8080/blog/
- admin: http://localhost:8080/admin/login
- health: http://localhost:8080/api/health

No admin local, clique em **Entrar**; não há senha no modo local. Para acompanhar o build:

```sh
npm run local:logs
```

Para parar preservando os dados:

```sh
npm run local:down
```

Para apagar apenas os dados locais e recomeçar:

```sh
npm run local:reset
```

O guia completo está em [Executando a stack local](doc_deploy/07-stack-local.md).

## 3. Efetuar o deploy

Faça primeiro a homologação. Troque para a branch correta e autentique a AWS CLI na conta de homologação:

```sh
git switch homolog
aws sso login --profile meu-blog-homolog
export AWS_PROFILE=meu-blog-homolog
aws sts get-caller-identity
gh auth status
```

Confira se o ID retornado é exatamente o configurado em `environments.homolog.aws.accountId`. Depois execute, em ordem:

```sh
npm run setup:check -- --stage homolog
npm run setup:bootstrap -- --stage homolog --yes
npm run setup:github -- --stage homolog --yes
npm run predeploy -- --stage homolog
npm run deploy:infra -- --stage homolog --yes
```

Aguarde o workflow `deploy-infra.yml` terminar. Então continue:

```sh
npm run setup:sync -- --stage homolog --yes
export BLOG_GITHUB_DISPATCH_TOKEN=TOKEN_FINE_GRAINED_HOMOLOG
npm run setup:admin -- --stage homolog --yes
unset BLOG_GITHUB_DISPATCH_TOKEN
npm run deploy:site -- --stage homolog --yes
npm run verify:production -- --stage homolog
```

Após validar a homologação, abra um pull request de `homolog` para `main`. Para produção, autentique-se na outra conta e repita os mesmos passos substituindo `homolog` por `production`:

```sh
git switch main
aws sso login --profile meu-blog-production
export AWS_PROFILE=meu-blog-production
aws sts get-caller-identity

npm run setup:check -- --stage production
npm run setup:bootstrap -- --stage production --yes
npm run setup:github -- --stage production --yes
npm run predeploy -- --stage production
npm run deploy:infra -- --stage production --yes
# aguarde o workflow
npm run setup:sync -- --stage production --yes
export BLOG_GITHUB_DISPATCH_TOKEN=TOKEN_FINE_GRAINED_PRODUCTION
npm run setup:admin -- --stage production --yes
unset BLOG_GITHUB_DISPATCH_TOKEN
npm run deploy:site -- --stage production --yes
npm run verify:production -- --stage production
```

Cada GitHub Environment possui suas próprias variáveis e sua própria role OIDC. Não são armazenadas access keys permanentes no GitHub.

`BLOG_GITHUB_DISPATCH_TOKEN` deve ser um token fine-grained exclusivo daquele ambiente, limitado a este repositório e somente com **Contents: write**. Ele apenas envia eventos assinados. Não reutilize o token da sessão do `gh`: esse segundo token deve possuir **Actions: write** e permissão para administrar Secrets/Environments durante o setup; ele fica somente nos GitHub Secrets e encaminha o evento validado para a branch correta.

O domínio é opcional. Sem domínio, `setup:sync` obtém o endereço `cloudfront.net` gerado e configura automaticamente os callbacks de login/logout do Cognito para ele. Por isso, não pule `setup:sync`: depois dessa etapa, tanto o site público quanto o painel administrativo funcionam pelo CloudFront. Quando um domínio definitivo for adicionado, repita o deploy de infraestrutura e `setup:sync` para atualizar certificado, DNS, CORS e Cognito.

## 4. Remover tudo, se necessário

A remoção automática existe somente para homologação. Ela apaga os stacks da aplicação, inclusive tabela, User Pool e buckets versionados. Não remove a conta AWS, o domínio registrado, a hosted zone criada fora do CDK, o bootstrap `CDKToolkit`, o provedor OIDC ou a role de setup compartilhável.

Autentique a conta de homologação e esteja na branch `homolog`:

```sh
git switch homolog
export AWS_PROFILE=meu-blog-homolog
aws sts get-caller-identity
npm run setup:check -- --stage homolog
```

Revise o que será removido e dispare o workflow protegido:

```sh
npm run destroy:homolog -- \
  --stage homolog \
  --confirm DESTROY-HOMOLOG \
  --yes
```

Não existe `destroy:production`. O script e o workflow rejeitam `main`, `production`, conta divergente ou confirmação incorreta. Leia [Ambientes AWS e remoção completa da homologação](doc_deploy/08-ambientes-e-remocao.md) antes de executar.

## Documentação

O roteiro completo está em [doc_deploy/README.md](doc_deploy/README.md). Consulte também [PRE_DEPLOY.md](PRE_DEPLOY.md) e [PROJECT_SPEC.md](PROJECT_SPEC.md) para critérios técnicos e operacionais.
