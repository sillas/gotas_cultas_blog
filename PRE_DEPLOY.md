# Preparação e validações

## Pré-commit

Ative uma vez após clonar o repositório:

```sh
npm run hooks:install
```

O hook executa typecheck, testes rápidos e `git diff --cached --check`. Ele não acessa AWS ou GitHub.

## Pré-deploy

Copie `project.config.example.json` para `project.config.json`, preencha a configuração e execute:

```sh
npm run predeploy -- --stage homolog
```

O comando faz build, testes, audit de produção, `cdk synth` e consultas de identidade em AWS/GitHub. Ele é deliberadamente somente leitura.

O fluxo completo e os comandos idempotentes estão descritos no README.
