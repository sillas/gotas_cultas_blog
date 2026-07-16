# 3. Primeiro deploy

Faça primeiro em homologação e só depois repita em produção.

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
npm run setup:admin -- --stage homolog --yes
npm run deploy:site -- --stage homolog --yes
npm run verify:production -- --stage homolog
```

`setup:sync` copia outputs do CloudFormation para o environment. `setup:admin` cria o usuário Cognito e armazena no Secrets Manager o token atual do `gh`; prefira um token fine-grained limitado ao repositório.

Valide páginas, painel e publicação de posts antes de promover o código.

## Produção

Integre `homolog` em `main` por pull request e autentique a outra conta:

```sh
git switch main
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
npm run setup:admin -- --stage production --yes
npm run deploy:site -- --stage production --yes
npm run verify:production -- --stage production
```

Produção retém os recursos com dados e não possui automação destrutiva.

Depois de conhecer cada etapa, o fluxo agregado também aceita estágio:

```sh
npm run launch -- --stage homolog --yes
```

No primeiro uso prefira os passos separados, pois facilitam o diagnóstico e a revisão de permissões.
