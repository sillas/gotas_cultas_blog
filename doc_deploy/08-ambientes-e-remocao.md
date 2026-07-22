# 8. Ambientes AWS e remoção completa da homologação

Este guia explica a separação entre homologação e produção e o procedimento seguro para apagar a homologação.

## Resultado esperado

O mesmo repositório usa dois ambientes independentes:

```text
branch homolog ── GitHub Environment homolog ── role OIDC homolog ── conta AWS de homologação

branch production ─ GitHub Environment production ── role OIDC production ── conta AWS de produção
```

Nunca configure os dois ambientes com o mesmo ID de conta. Registre ambos também em `deploy-accounts.json`; os workflows usam esse arquivo versionado como fonte independente dos GitHub Environments. A separação por conta reduz o risco de um erro de permissão ou de nome atingir produção.

## Recursos e nomes

Homologação cria stacks com prefixo `BlogHomolog`, por exemplo:

```text
BlogHomologDataStack
BlogHomologAuthStack
BlogHomologApiStack
BlogHomologCdnStack
```

Produção usa `BlogProduction`. Buckets de imagens também incluem o estágio e a conta.

Na homologação, DynamoDB, Cognito e S3 usam política de remoção `DESTROY`; buckets usam `autoDeleteObjects`. Em produção, os recursos com dados usam `RETAIN`. Essa decisão é feita pelo contexto CDK `stage` e não pode ser escolhida livremente por uma variável booleana.

## Preparar as branches

Crie `homolog` a partir de uma versão conhecida da base:

```sh
git switch production
git pull --ff-only
git switch -c homolog
git push -u origin homolog
```

Use `homolog` para integração e testes. Quando estiver aprovado, abra um pull request para `production`. Proteja `production` contra push direto e exija CI, quando seu plano do GitHub permitir. A branch temporária `main` executa apenas o CI e não está autorizada a acessar ambientes AWS.

## Preparar perfis AWS

Exemplo com AWS SSO:

```sh
aws configure sso --profile meu-blog-homolog
aws configure sso --profile meu-blog-production
```

Antes de qualquer operação, selecione o perfil e confira a identidade:

```sh
export AWS_PROFILE=meu-blog-homolog
aws sso login --profile meu-blog-homolog
aws sts get-caller-identity
```

Compare manualmente o campo `Account` com `environments.homolog.aws.accountId`.

## Configurar GitHub e OIDC

Na branch `homolog`, autenticado na conta de homologação:

```sh
npm run setup:bootstrap -- --stage homolog --yes
npm run setup:github -- --stage homolog --yes
```

Na branch `production`, autenticado na conta de produção:

```sh
npm run setup:bootstrap -- --stage production --yes
npm run setup:github -- --stage production --yes
```

Esses comandos criam GitHub Environments separados. A relação de confiança OIDC usa o nome do environment; uma execução de `production` não consegue assumir a role de `homolog`, nem o inverso.

## Barreiras contra remoção de produção

A remoção exige todas estas condições:

1. comando local `destroy:homolog`;
2. opção `--stage homolog`;
3. branch local `homolog`;
4. AWS CLI autenticada na conta configurada para homologação;
5. confirmação literal `DESTROY-HOMOLOG`;
6. workflow executado a partir da branch `homolog`;
7. GitHub Environment `homolog`;
8. role OIDC da conta de homologação;
9. nova conferência do Account ID dentro do runner.

Não há comando nem workflow para destruir produção.

## O que a remoção apaga

O `cdk destroy --all` de homologação remove os recursos pertencentes aos stacks `BlogHomolog*`, incluindo:

- distribuição e funções CloudFront;
- buckets do site e das imagens, incluindo versões de objetos;
- tabela DynamoDB;
- User Pool, client e domínio Cognito;
- API Gateway e Lambdas;
- schedules, grupo do Scheduler, filas e roles da aplicação;
- secret usado para o dispatch do GitHub;
- alarmes, SNS e budget opcionais;
- certificado ACM e registro DNS criados pelos stacks, quando configurados.

## O que permanece

Alguns elementos são preparação da conta ou existem fora da aplicação:

- stack `CDKToolkit`;
- assets de bootstrap gerenciados pelo CDK;
- provedor OIDC do GitHub;
- role `TheBlogBaseGitHubActionsHomologRole`;
- conta AWS;
- domínio registrado;
- hosted zone fornecida ao projeto;
- repositório e GitHub Environment.

Esses itens não mantêm o blog publicado. `CDKToolkit`, OIDC e role podem ser reutilizados em um novo teste. Não exclua hosted zone ou domínio automaticamente: eles podem atender outros sistemas e a exclusão do registro de domínio pode causar perda de propriedade.

## Executar a remoção

Primeiro confirme branch e conta:

```sh
git switch homolog
export AWS_PROFILE=meu-blog-homolog
aws sts get-caller-identity
npm run setup:check -- --stage homolog
```

Se houver conteúdo de teste que precise ser guardado, exporte-o antes. A remoção da homologação é irreversível e não cria backup.

Dispare:

```sh
npm run destroy:homolog -- \
  --stage homolog \
  --confirm DESTROY-HOMOLOG \
  --yes
```

Acompanhe pelo GitHub Actions ou execute:

```sh
gh run list --workflow destroy-homolog.yml --limit 1
gh run watch ID_DA_EXECUCAO
```

CloudFront pode levar vários minutos para ser excluído. Não interrompa o workflow apenas porque ele parece parado nessa etapa.

## Conferência posterior

O workflow já falha se encontrar stacks ativos com prefixo `BlogHomolog`. Para conferir manualmente:

```sh
aws cloudformation list-stacks \
  --region sa-east-1 \
  --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE UPDATE_ROLLBACK_COMPLETE \
  --query "StackSummaries[?starts_with(StackName, 'BlogHomolog')].StackName"
```

O resultado esperado é uma lista vazia. Confira também o console de cobrança da conta nos dias seguintes. Pequenos valores podem aparecer depois da remoção porque a cobrança da AWS não é atualizada em tempo real.

## Criar a homologação novamente

Depois da remoção, a preparação da conta continua válida. Para recriar:

```sh
git switch homolog
export AWS_PROFILE=meu-blog-homolog
npm run predeploy -- --stage homolog
npm run deploy:infra -- --stage homolog --yes
# aguarde o workflow
npm run setup:sync -- --stage homolog --yes
export BLOG_GITHUB_DISPATCH_TOKEN=TOKEN_FINE_GRAINED_HOMOLOG
npm run setup:admin -- --stage homolog --yes
unset BLOG_GITHUB_DISPATCH_TOKEN
npm run deploy:site -- --stage homolog --yes
```
