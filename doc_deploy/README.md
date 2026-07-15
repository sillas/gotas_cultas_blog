# Colocando o The Blog Base no ar

Este diretório contém o caminho mais curto para publicar o blog base, com as páginas e o visual padrão, sem personalização prévia.

## Ordem de leitura

1. [01-pre-requisitos.md](01-pre-requisitos.md) — contas, ferramentas e permissões.
2. [02-configuracao.md](02-configuracao.md) — o único arquivo local que precisa ser preenchido.
3. [03-primeiro-deploy.md](03-primeiro-deploy.md) — infraestrutura, admin e site.
4. [04-validacao.md](04-validacao.md) — como confirmar que tudo funciona.
5. [05-operacao-e-custos.md](05-operacao-e-custos.md) — rotina, custos e segurança.
6. [06-problemas-comuns.md](06-problemas-comuns.md) — diagnóstico rápido.

Se quiser auxílio automatizado, use [PROMPT_AGENTE_IA.md](PROMPT_AGENTE_IA.md).

## Resumo em sete comandos

Depois de preencher `project.config.json`:

```sh
npm run setup:check
npm run setup:bootstrap -- --yes
npm run setup:github -- --yes
npm run predeploy
npm run deploy:infra -- --yes
npm run setup:sync -- --yes
npm run setup:admin -- --yes
```

Espere o workflow de infraestrutura terminar antes de executar `setup:sync`. Depois publique e valide:

```sh
npm run deploy:site -- --yes
npm run verify:production
```

Também existe `npm run launch -- --yes`, mas no primeiro uso recomendamos executar as etapas separadamente. Assim fica claro qual recurso está sendo criado e onde uma eventual falha aconteceu.

Nenhum desses comandos registra ou transfere um domínio. Sem domínio configurado, o blog é publicado no endereço padrão do CloudFront.
