# 6. Problemas comuns

## `project.config.json not found`

```sh
cp project.config.example.json project.config.json
```

Preencha conta, região e repositório.

## AWS está na conta errada

```sh
aws sts get-caller-identity
```

Troque o profile ou faça login novamente. O setup recusa operar quando a conta difere da configuração.

## `gh` retorna HTTP 401

```sh
gh auth login -h github.com
gh auth status
```

## Hosted zone não encontrada

Confirme que `hostedZoneName` contém a zona, e não necessariamente o domínio completo do blog. Exemplo:

```json
{
  "name": "blog.example.com",
  "hostedZoneName": "example.com"
}
```

## CDK bootstrap ausente

Execute:

```sh
npm run setup:bootstrap -- --stage homolog --yes
```

## Workflow de infraestrutura falhou ao assumir a role

Confira:

- `AWS_DEPLOY_ROLE_ARN` nas GitHub Variables;
- owner e nome exatos em `github.repository`;
- audience `sts.amazonaws.com`;
- conta AWS usada no bootstrap.

Rode novamente a configuração idempotente:

```sh
npm run setup:bootstrap -- --stage homolog --yes
npm run setup:github -- --stage homolog --yes
```

## Site retorna erro depois da infraestrutura

A infraestrutura não envia os arquivos do site. Execute, nesta ordem:

```sh
npm run setup:sync -- --stage homolog --yes
npm run deploy:site -- --stage homolog --yes
```

## `/sobre` ou outra rota amigável retorna 404

Confirme que a stack CDN foi atualizada e que a CloudFront Function de rotas públicas está associada ao comportamento padrão. Depois execute novamente o deploy de infraestrutura.

## Publicar post não reconstrói o site

Confira:

- valor do secret no Secrets Manager;
- validade e escopos do token GitHub;
- nome do repositório passado ao CDK;
- execução de `content-dispatch.yml`, validação da assinatura e posterior `workflow_dispatch` de `deploy-site.yml`;
- logs da Lambda de posts.

Você pode disparar o site manualmente:

```sh
npm run deploy:site -- --stage homolog --yes
```

## Como obter logs sem alterar recursos

```sh
gh run list --limit 10
gh run view ID --log-failed
aws cloudformation describe-stack-events --stack-name NOME_DA_STACK
```
