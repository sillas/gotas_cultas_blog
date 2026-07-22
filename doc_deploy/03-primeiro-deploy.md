# 3. Primeiro deploy

Faça primeiro em homologação e só depois repita em produção.

Antes de executar o deploy, confirme que `blog.newsletterSender` está preenchido e
que a identidade correspondente já está verificada no SES da conta e região do
estágio. A URL pública usada nos links de confirmação e cancelamento vem de
`domain.name` ou, após o primeiro deploy sem domínio, de `SITE_URL` sincronizada
por `setup:sync`.

## Homologação

Selecione branch e conta:

```sh
git switch homolog
export AWS_PROFILE=meu-blog-homolog
aws sso login --profile meu-blog-homolog
aws sts get-caller-identity
npm run setup:check -- --stage homolog
```

Não prossiga se o Account ID estiver incorreto. Depois execute uma etapa por vez:

```sh
npm run setup:bootstrap -- --stage homolog --yes
npm run setup:github -- --stage homolog --yes
npm run predeploy -- --stage homolog
npm run deploy:infra -- --stage homolog --yes
```

O bootstrap prepara CDK e OIDC sem access keys permanentes. `setup:github` cria o GitHub Environment isolado. Aguarde `deploy-infra.yml` terminar e continue:

```sh
npm run setup:sync -- --stage homolog --yes
gh auth status
export BLOG_GITHUB_DISPATCH_TOKEN=TOKEN_FINE_GRAINED_HOMOLOG
npm run setup:admin -- --stage homolog --yes
unset BLOG_GITHUB_DISPATCH_TOKEN
npm run deploy:site -- --stage homolog --yes
npm run verify:production -- --stage homolog
```

`setup:sync` copia outputs, atualiza as URLs do Cognito e restringe o CORS do bucket de imagens à origem real. `setup:admin` cria o usuário Cognito e configura o dispatch assinado.

Se o ambiente não tiver domínio próprio, o primeiro deploy ainda não conhecia o
hostname do CloudFront. Depois de `setup:sync`, execute novamente
`npm run deploy:infra -- --stage homolog --yes` (ou `production`) e aguarde o
workflow. Essa segunda execução aplica `SITE_URL` às Lambdas da newsletter, para
que os links de confirmação, artigo e cancelamento não apontem para o endereço
local usado apenas como fallback de síntese.

O token em `BLOG_GITHUB_DISPATCH_TOKEN` deve ser exclusivo do ambiente, fine-grained, limitado ao repositório e somente com **Contents: write**. O token autenticado no `gh` deve ser diferente, possuir **Actions: write** e permitir administrar Secrets/Environments durante o setup. Nenhum deles é passado como argumento na linha de comando.

Valide páginas, painel e publicação de posts antes de promover o código.

Valide também uma inscrição completa com um destinatário permitido pelo SES:
solicitação, recebimento da confirmação, confirmação, envio de uma publicação e
cancelamento. Enquanto homologação estiver no sandbox, o destinatário também
precisa ser uma identidade verificada.

## Produção

Integre `homolog` em `production` por pull request e autentique a outra conta:

```sh
git switch production
git pull --ff-only
export AWS_PROFILE=meu-blog-production
aws sso login --profile meu-blog-production
aws sts get-caller-identity
```

Repita usando `production`:

```sh
npm run setup:check -- --stage production
npm run setup:bootstrap -- --stage production --yes
npm run setup:github -- --stage production --yes
npm run predeploy -- --stage production
npm run deploy:infra -- --stage production --yes
# aguarde deploy-infra.yml
npm run setup:sync -- --stage production --yes
export BLOG_GITHUB_DISPATCH_TOKEN=TOKEN_FINE_GRAINED_PRODUCTION
npm run setup:admin -- --stage production --yes
unset BLOG_GITHUB_DISPATCH_TOKEN
npm run deploy:site -- --stage production --yes
npm run verify:production -- --stage production
```

Produção retém os recursos com dados e não possui automação destrutiva.

Depois de conhecer cada etapa, o fluxo agregado também aceita estágio:

```sh
npm run launch -- --stage homolog --yes
```

No primeiro uso prefira os passos separados, pois facilitam o diagnóstico e a revisão de permissões.
