# 2. Configuração do projeto

Copie o exemplo com `cp project.config.example.json project.config.json`. O arquivo é local e ignorado pelo Git; não coloque nele senhas, tokens ou access keys.

## Contas versionadas

Substitua também os exemplos em `deploy-accounts.json` pelos IDs reais. Os valores devem coincidir com `project.config.json`, mas este arquivo deve ser commitado. Os workflows comparam a identidade AWS com essa fonte versionada, em vez de confiar apenas no `AWS_ACCOUNT_ID` do próprio GitHub Environment.

## Estrutura obrigatória

```json
{
  "github": { "repository": "usuario/meu-blog" },
  "environments": {
    "homolog": {
      "branch": "homolog",
      "aws": { "accountId": "111111111111", "region": "sa-east-1" },
      "domain": { "name": "", "hostedZoneName": "" },
      "admin": { "email": "autor@example.com" },
      "operations": { "alarmEmail": "", "monthlyBudgetUsd": 5 }
    },
    "production": {
      "branch": "main",
      "aws": { "accountId": "222222222222", "region": "sa-east-1" },
      "domain": { "name": "", "hostedZoneName": "" },
      "admin": { "email": "autor@example.com" },
      "operations": { "alarmEmail": "", "monthlyBudgetUsd": 10 }
    }
  }
}
```

Use IDs reais e diferentes. Os IDs acima são apenas exemplos.

## Campos

| Campo | Obrigatório | Finalidade |
|---|---:|---|
| `github.repository` | Sim | Repositório no formato `owner/repo`. |
| `environments.homolog.branch` | Sim | Deve ser `homolog`. |
| `environments.production.branch` | Sim | Deve ser `main`. |
| `aws.accountId` | Sim | Conta exclusiva daquele ambiente. |
| `aws.region` | Sim | Região de DynamoDB, Lambda e API. |
| `domain.name` | Não | Domínio completo do ambiente. |
| `domain.hostedZoneName` | Com domínio | Hosted zone existente na mesma conta. |
| `admin.email` | Para o painel | Primeiro usuário Cognito. |
| `operations.alarmEmail` | Não | Habilita alarmes e budget. |
| `operations.monthlyBudgetUsd` | Com alarmes | Referência mensal do budget. |

Use domínios diferentes, como `homolog.blog.example.com` e `blog.example.com`. Se a hosted zone não estiver na conta daquele ambiente, deixe o domínio vazio e valide pelo endereço CloudFront.

Sem domínio configurado, não é necessário inventar uma URL antecipadamente. O primeiro deploy cria a distribuição; em seguida, `setup:sync` descobre o hostname e configura Cognito e GitHub Environment. O endereço continuará válido até a distribuição ser removida.

Todos os comandos AWS recebem `--stage`:

```sh
npm run setup:check -- --stage homolog
npm run setup:check -- --stage production
```

O primeiro usa branch e conta de homologação; o segundo usa `main` e a conta de produção. `setup:check` é somente leitura. Pare se conta, região, branch ou repositório estiverem incorretos.
