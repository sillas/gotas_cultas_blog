# Prompt para auxiliar o primeiro deploy

Copie o prompt abaixo para um agente de IA com acesso ao terminal do projeto. O prompt foi escrito para que o agente diagnostique e prepare tudo, mas peça confirmação antes de criar ou modificar recursos externos.

---

Você está auxiliando no primeiro deploy do projeto **The Blog Base**.

Objetivo: publicar as páginas padrão e o painel administrativo, sem alterar conteúdo, identidade visual ou layout.

Leia integralmente, nesta ordem:

1. `doc_deploy/README.md`
2. `doc_deploy/01-pre-requisitos.md`
3. `doc_deploy/02-configuracao.md`
4. `doc_deploy/03-primeiro-deploy.md`
5. `doc_deploy/04-validacao.md`
6. `README.md`
7. `PRE_DEPLOY.md`

Regras obrigatórias:

- Não registre, compre ou transfira domínio.
- Não altere conteúdo, design ou layout.
- Não faça deploy antes de mostrar ao usuário a conta AWS, região, repositório GitHub, domínio e recursos previstos.
- Comece apenas com comandos de leitura.
- Nunca exiba tokens, senhas, cookies ou valores do Secrets Manager.
- Nunca coloque segredos em arquivos, logs, GitHub Variables ou mensagens.
- Não use access keys permanentes; prefira AWS SSO/OIDC.
- Não use `--yes` até o usuário aprovar explicitamente a etapa correspondente.
- Não execute comandos destrutivos ou remova stacks existentes.
- Se encontrar infraestrutura existente, compare e explique antes de atualizar.
- Não habilite alarmes/budget quando `operations.alarmEmail` estiver vazio.
- Não crie AWS Backup adicional; mantenha apenas o PITR já definido.
- Pergunte qual estágio será operado e pare se conta ou branch diferirem do ambiente correspondente em `project.config.json`.
- Pare se o repositório GitHub autenticado não for o configurado.

Fluxo:

1. Verifique versões de Node, npm, Git, AWS CLI e `gh`.
2. Verifique `git status`; preserve qualquer alteração existente.
3. Se `project.config.json` não existir, peça ao usuário para criá-lo a partir do exemplo e preencher os campos — não invente conta, domínio ou e-mail.
4. Execute `npm run setup:check -- --stage homolog` primeiro; produção somente depois da aprovação explícita da homologação.
5. Apresente um resumo do estado e das mudanças previstas.
6. Peça autorização antes de `npm run setup:bootstrap -- --stage homolog --yes`.
7. Peça autorização antes de `npm run setup:github -- --stage homolog --yes`.
8. Execute `npm run predeploy`, que é somente leitura.
9. Peça autorização antes de `npm run deploy:infra -- --stage homolog --yes`.
10. Acompanhe o workflow e investigue qualquer falha sem ocultar erros.
11. Após sucesso, peça autorização para `npm run setup:sync -- --stage homolog --yes`.
12. Explique os dois tokens: `BLOG_GITHUB_DISPATCH_TOKEN` com Contents: write, exclusivo do estágio e armazenado na AWS; e o token diferente do `gh`, com Actions: write, armazenado como GitHub Secret. Nunca mostre seus valores.
13. Peça autorização antes de `npm run deploy:site -- --stage homolog --yes`.
14. Execute `npm run verify:production`.
15. Entregue um relatório contendo URLs, stacks criadas, resultado dos testes, pendências e custo/recursos opcionais habilitados.

Durante todo o processo, use comandos idempotentes. Se uma etapa já estiver concluída, valide-a e prossiga sem recriar recursos desnecessariamente.

---

## Versão curta do prompt

> Ajude-me a executar o primeiro deploy do The Blog Base usando `doc_deploy/`. Comece por homologação, na branch `homolog` e na conta AWS configurada para esse estágio. Faça somente consultas e `npm run setup:check -- --stage homolog` até apresentar conta, região, repo, domínio e plano. Peça confirmação separada antes de cada escrita. Nunca revele segredos, não registre domínio e só proponha produção, na branch `main` e em outra conta AWS, depois que eu aprovar homologação.
