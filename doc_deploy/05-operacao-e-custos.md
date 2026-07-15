# 5. Operação, custos e segurança

## Recursos de baixo custo

A base prioriza cobrança por uso:

- site estático em S3 e CloudFront;
- Lambdas sem servidor permanente;
- DynamoDB on-demand;
- HTTP API;
- Scheduler somente para posts agendados;
- PITR no DynamoDB;
- DLQ praticamente sem custo quando vazia.

Não há AWS Backup diário, servidor EC2, banco relacional ou WAF obrigatório.

Alarmes CloudWatch, SNS e AWS Budget só são provisionados quando `operations.alarmEmail` é preenchido.

## Publicação normal

Alterações de código na branch `main` disparam o workflow do site quando afetam site, admin ou pacote compartilhado.

Ao publicar ou atualizar um post, a Lambda envia `repository_dispatch` ao GitHub. O workflow exporta o conteúdo atual do DynamoDB e reconstrói o site estático.

## Atualização da infraestrutura

Depois de alterar `infra/`, execute:

```sh
npm run predeploy
npm run deploy:infra -- --yes
```

O workflow de infraestrutura é manual; mudanças comuns de conteúdo não o executam.

## Segredos

- Nunca versione `project.config.json`.
- Nunca coloque token GitHub em `.env`, código ou GitHub Variable.
- O token de rebuild fica no AWS Secrets Manager.
- Prefira token fine-grained limitado ao repositório.
- Revogue e substitua o token quando houver suspeita de exposição.

## Recuperação

O DynamoDB tem Point-in-Time Recovery. Não existe backup diário adicional. Se uma restauração for necessária, o administrador deve realizá-la diretamente na AWS como evento operacional pontual.

Os buckets têm versionamento para ajudar a recuperar arquivos sobrescritos ou um deploy estático ruim.
