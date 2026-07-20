# Preparação e validações

## Pré-commit

Ative uma vez após clonar o repositório:

```sh
npm run hooks:install
```

O hook executa typecheck, testes rápidos e `git diff --cached --check`. Ele não acessa AWS ou GitHub.

## Pré-deploy

Copie `project.config.example.json` para `project.config.json`, preencha a configuração, substitua os Account IDs de exemplo em `deploy-accounts.json` e execute:

```sh
npm run predeploy -- --stage homolog
```

O comando faz build, testes, audit de produção, `cdk synth` e consultas de identidade em AWS/GitHub. Ele é deliberadamente somente leitura.

O fluxo completo e os comandos idempotentes estão descritos no README.

## Migração do índice administrativo

Ambientes que já possuam posts precisam preencher as chaves do
`AdminPostsIndex` uma vez, depois que o deploy da infraestrutura terminar e o
novo índice estiver ativo:

```sh
export BLOG_TABLE_NAME=NOME_DA_TABELA_DO_OUTPUT_TableName
npm run backfill:admin-index
unset BLOG_TABLE_NAME
```

O comando lê somente itens `POST#`, preserva o conteúdo e pode ser executado
novamente com segurança. Instalações novas e a stack local já criam essas
chaves automaticamente.
