# 4. Validação do ambiente publicado

Execute:

```sh
npm run verify:production
```

O teste é somente leitura e verifica:

- `/` retorna 200;
- `/sobre` retorna 200;
- `/sitemap-index.xml` retorna 200;
- `/rss.xml` retorna 200;
- uma página inexistente retorna 404;
- `/admin/login` retorna 200.

## Validação manual

Abra o domínio ou endereço CloudFront e confira:

1. página inicial;
2. listagem vazia de posts;
3. busca;
4. página Sobre padrão;
5. política de privacidade padrão;
6. login em `/admin/login`;
7. callback do Cognito depois do primeiro login.
8. formulário da newsletter e mensagem neutra após a solicitação;
9. confirmação e cancelamento por links que retornam ao endereço correto do site;
10. ausência de mensagens na DLQ de entrega após um envio de teste.

O projeto base contém textos provisórios em Sobre e Privacidade. Isso é esperado no deploy sem personalização.

## Diagnóstico AWS somente leitura

```sh
aws cloudformation describe-stacks --stack-name BlogHomologDataStack
aws cloudformation describe-stacks --stack-name BlogHomologAuthStack
aws cloudformation describe-stacks --stack-name BlogHomologApiStack
aws cloudformation describe-stacks --stack-name BlogHomologCdnStack
```

## Diagnóstico GitHub

```sh
gh run list --limit 10
gh run view ID_DA_EXECUCAO --log-failed
gh variable list
```

Não publique conteúdo de teste apenas para validar infraestrutura, a menos que queira testar explicitamente o ciclo completo de publicação.
