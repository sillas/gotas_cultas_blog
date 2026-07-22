# Prontidão para deploy em produção

Documento descartável, gerado em 20/07/2026. Escopo: primeiro deploy direto do
ambiente `production`, sem AWS WAF neste momento.

## Veredito

**Ainda não está pronto para produção.** O código compila, os testes passam e o
CDK sintetiza, mas há bloqueadores de configuração, workflow, segurança e
conteúdo que precisam ser resolvidos antes de qualquer escrita na conta AWS.

## Bloqueadores obrigatórios

- [x] **Corrigir a branch de produção nos workflows.** Produção foi padronizada
  na branch `production` e homologação na branch `homolog`, tanto nos workflows
  quanto na configuração, scripts e documentação. A branch temporária `main`
  dispara somente o CI e não participa de nenhum deploy ou acesso à AWS.
- [ ] **Substituir os Account IDs de exemplo.** `project.config.json` e
  `deploy-accounts.json` ainda usam `111111111111` e `222222222222`.
- [ ] **Completar `project.config.json`.** Informar pelo menos
  `blog.authorName`, a conta e região reais de produção e
  `environments.production.admin.email`.
- [ ] **Corrigir as vulnerabilidades de dependências e repetir a validação.**
  `npm audit --omit=dev` encontrou:
  - alta: `brace-expansion`, dependência de `aws-cdk-lib`;
  - moderada: Astro 7.0.9, aviso de XSS em View Transitions.
  Aplicar atualização compatível, revisar o lockfile e executar novamente
  `npm run build:all`, `npm test`, `npm audit --omit=dev` e `npm run synth`.
- [ ] **Substituir a Política de Privacidade provisória.** A página pública
  ainda mostra um TODO. Ela deve refletir exatamente cookies, métricas,
  anúncios e terceiros realmente habilitados. Se Analytics/AdSense não forem
  usados no lançamento, remover afirmações de que já são usados.
- [ ] **Completar a página Sobre.** Ainda informa que autoria, contato, fontes
  e política de correções serão completados antes do lançamento.
- [ ] **Commitar e revisar todas as alterações atuais.** O worktree contém a
  implementação ainda não commitada do índice administrativo, API, admin,
  migração e testes. Produção deve receber um commit identificado e revisado.
- [ ] **Restaurar autenticação GitHub.** `gh auth status` informa token inválido;
  por isso não foi possível verificar nem configurar o Environment
  `production`.
- [ ] **Autenticar a AWS CLI na conta correta.** Não há profile, região ou
  credenciais ativos. Confirmar `aws sts get-caller-identity` e comparar o
  Account ID antes de bootstrap ou deploy.

## Configuração externa necessária

- [ ] Criar/confirmar a conta AWS exclusiva de produção e escolher a região
  (o modelo usa `sa-east-1`).
- [ ] Executar o bootstrap CDK na conta de produção.
- [ ] Criar/configurar o GitHub Environment `production`, limitado à branch
  `production`, com role OIDC e variáveis geradas por `setup:github`.
- [ ] Escolher um prefixo Cognito globalmente único.
- [ ] Criar o administrador Cognito com e-mail real, concluir a senha inicial e
  cadastrar TOTP; MFA é obrigatório.
- [ ] Criar um token fine-grained exclusivo para dispatch de produção e
  configurar os segredos HMAC/workflow por `setup:admin`. Não reutilizar o
  token da sessão `gh`.
- [ ] Decidir o endereço público:
  - domínio próprio: hosted zone Route 53 existente, domínio, certificado e
    DNS configurados; ou
  - primeiro deploy pelo domínio `cloudfront.net`, que já é suportado.
- [ ] Executar `setup:sync` depois da infraestrutura para preencher URL do
  site/API, callbacks do Cognito, CORS, tabela, buckets e distribuição no
  GitHub Environment.

## Novo índice administrativo

- [ ] O deploy de infraestrutura deve criar `AdminPostsIndex` antes do deploy
  do admin que passa a consultá-lo.
- [ ] Se a tabela de produção já possuir posts, aguardar o GSI ficar `ACTIVE` e
  executar uma vez:

  ```sh
  export BLOG_TABLE_NAME=NOME_REAL_DA_TABELA
  npm run backfill:admin-index
  unset BLOG_TABLE_NAME
  ```

- [ ] A identidade usada no backfill precisa de `Scan`, `UpdateItem` e
  `DescribeTable` na tabela. Em uma tabela nova e vazia, o backfill não é
  necessário.
- [ ] Validar no admin as listas independentes de rascunhos, agendados e
  publicados por ano, incluindo transições entre os três estados.

## Operação e proteção sem WAF

Operar inicialmente sem WAF é aceitável para o tráfego esperado. Já existem
CloudFront, buckets privados com OAC, HTTPS, headers de segurança, autorização
Cognito, MFA, escopos administrativos e throttling específico da rota pública
de visualizações.

Antes de abrir produção:

- [ ] Preencher `operations.alarmEmail` e confirmar a assinatura SNS. É
  tecnicamente opcional, mas recomendado para produção; sem ele não são
  criados os alarmes principais nem o AWS Budget configurável.
- [ ] Revisar `monthlyBudgetUsd` e criar alertas de custo adequados.
- [ ] Confirmar PITR da tabela DynamoDB após o deploy; produção o habilita por
  CDK.
- [ ] Confirmar versionamento e bloqueio público dos buckets web/imagens.
- [ ] Revisar alarmes e DLQs do processador de imagens e do agendador.
- [ ] Manter o WAF como decisão registrada para revisão se houver abuso,
  tráfego anormal ou custos inesperados.

## Pendências editoriais não bloqueantes tecnicamente

- [ ] `ads.txt` ainda é um placeholder. Se não houver AdSense, pode continuar
  sem uma entrada de publisher, mas o comentário TODO não deveria ser
  publicado como configuração final.
- [ ] Remover a regra fictícia `/nao-visitar/` de `robots.txt` se ela não tiver
  finalidade real.
- [ ] Definir conteúdo inicial. Posts locais são ignorados pelo Git; o primeiro
  deploy de uma tabela vazia publicará o site sem artigos até que o admin crie
  e publique um.
- [ ] Fazer uma rodada manual de acessibilidade com teclado e NVDA/VoiceOver.

## Sequência recomendada para o primeiro deploy de produção

1. Corrigir branch dos workflows, dependências, textos legais e configuração.
2. Commitar; garantir CI verde no commit exato destinado à produção.
3. Reautenticar `gh` e AWS; confirmar repositório, branch `production`, conta e
   região.
4. Executar, nesta ordem e revisar cada resultado:

   ```sh
   npm run setup:check -- --stage production
   npm run setup:bootstrap -- --stage production --yes
   npm run setup:github -- --stage production --yes
   npm run predeploy -- --stage production
   npm run deploy:infra -- --stage production --yes
   ```

5. Aguardar todos os stacks e o `AdminPostsIndex` ficarem estáveis.
6. Executar o backfill somente se já houver posts na tabela.
7. Continuar:

   ```sh
   npm run setup:sync -- --stage production --yes
   export BLOG_GITHUB_DISPATCH_TOKEN=TOKEN_EXCLUSIVO_DE_PRODUCAO
   npm run setup:admin -- --stage production --yes
   unset BLOG_GITHUB_DISPATCH_TOKEN
   npm run deploy:site -- --stage production --yes
   npm run verify:production -- --stage production
   ```

8. Fazer smoke test manual: login/TOTP, upload de capa, rascunho, agendamento,
   publicação, edição, exclusão, rebuild, página pública, busca, RSS, sitemap,
   contador de views, métricas e restauração de navegação do admin.
9. Registrar commit, outputs, horário e operador do deploy.

## Evidências desta avaliação

- `npm run build:all`: aprovado.
- `npm test`: 4 suítes aprovadas.
- `cdk synth -c stage=production`: aprovado, incluindo o bundle Docker do
  processador de imagens. Há avisos não bloqueantes sobre `logRetention`
  depreciado e configuração explícita de força das referências cross-stack.
- Stack Docker local: seis serviços saudáveis.
- `npm audit --omit=dev`: reprovado por 2 vulnerabilidades.
- GitHub CLI: autenticação inválida; Environment de produção não verificável.
- AWS CLI: nenhuma sessão/profile ativo.
- WAF: deliberadamente fora do escopo deste primeiro deploy.
