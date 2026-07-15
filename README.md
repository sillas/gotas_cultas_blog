# The Blog Base

Base comum, serverless e de baixo custo para blogs pessoais independentes. Cada projeto derivado mantém seu próprio repositório, conta/configuração AWS, domínio, conteúdo e identidade visual.

Este projeto não é um criador de blogs. Ele fornece infraestrutura, painel administrativo, publicação e deploy comuns para que cada derivação concentre suas mudanças em design, layout e conteúdo.

## Início rápido

Requisitos: Node.js 22, AWS CLI, AWS CDK e GitHub CLI autenticados.

```sh
npm ci
cp project.config.example.json project.config.json
# preencha conta, região, repositório e, opcionalmente, domínio/admin
npm run hooks:install
npm run setup:check
```

Operações que alteram AWS ou GitHub exigem `-- --yes`:

```sh
npm run setup:bootstrap -- --yes
npm run setup:github -- --yes
npm run predeploy
npm run deploy:infra -- --yes
# após a conclusão do workflow de infraestrutura
npm run setup:sync -- --yes
npm run setup:admin -- --yes
npm run deploy:site -- --yes
npm run verify:production
```

Depois de revisar cada etapa separadamente, todo o fluxo pode ser conduzido por:

```sh
npm run launch -- --yes
```

O comando acompanha os workflows, sincroniza outputs, configura o admin e executa os smoke tests. Ele não registra nem transfere domínios.

O bootstrap configura CDK e uma role OIDC limitada ao repositório. Os workflows usam credenciais temporárias; não são armazenadas access keys da AWS no GitHub.

## Configuração

`project.config.json` é local e ignorado pelo Git. Use [project.config.example.json](project.config.example.json) como referência. Segredos nunca devem ser adicionados a esse arquivo.

O domínio é opcional. Sem ele, o primeiro projeto pode ser validado pelo endereço padrão do CloudFront. Alarmes e budget só são criados quando `operations.alarmEmail` é informado.

## Segurança operacional

- `npm run setup:check`, `npm run predeploy` e `npm run verify:production` são somente leitura.
- Comandos de escrita falham sem `--yes`.
- Nenhum comando agregado registra ou transfere domínios.
- Revise a role, conta e repositório mostrados pelo check antes do bootstrap.

Detalhes adicionais estão em [PRE_DEPLOY.md](PRE_DEPLOY.md) e [PROJECT_SPEC.md](PROJECT_SPEC.md).
