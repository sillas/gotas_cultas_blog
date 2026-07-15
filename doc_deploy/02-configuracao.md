# 2. Configuração do projeto

Copie o exemplo:

```sh
cp project.config.example.json project.config.json
```

`project.config.json` é ignorado pelo Git. Não coloque senhas ou tokens nele.

## Configuração mínima sem domínio

```json
{
  "aws": {
    "accountId": "123456789012",
    "region": "sa-east-1"
  },
  "github": {
    "repository": "usuario/meu-blog"
  },
  "domain": {
    "name": "",
    "hostedZoneName": ""
  },
  "admin": {
    "email": "autor@example.com"
  },
  "operations": {
    "alarmEmail": "",
    "monthlyBudgetUsd": 10
  }
}
```

## Configuração com domínio

```json
"domain": {
  "name": "blog.example.com",
  "hostedZoneName": "example.com"
}
```

O script localizará o ID da hosted zone. O certificado ACM e o registro DNS são criados pelo CDK.

## Campos

| Campo | Obrigatório | Finalidade |
|---|---:|---|
| `aws.accountId` | Sim | Conta que receberá os recursos. |
| `aws.region` | Sim | Região principal das Lambdas, DynamoDB e API. |
| `github.repository` | Sim | Repositório no formato `owner/repo`. |
| `domain.name` | Não | Domínio público completo do blog. |
| `domain.hostedZoneName` | Com domínio | Zona já existente no Route 53. |
| `admin.email` | Para o admin | Primeiro usuário do Cognito. |
| `operations.alarmEmail` | Não | Se preenchido, habilita alarmes, SNS e budget. |
| `operations.monthlyBudgetUsd` | Com alarmes | Limite mensal usado pelo AWS Budget. |

Para manter o menor custo inicial, deixe `alarmEmail` vazio. PITR do DynamoDB permanece ativo como proteção mínima dos posts.

## Verificação somente leitura

Execute:

```sh
npm run setup:check
```

O comando não cria recursos. Ele verifica:

- conta AWS;
- região;
- autenticação GitHub;
- existência do repositório;
- hosted zone, quando configurada;
- estado do CDK bootstrap.
