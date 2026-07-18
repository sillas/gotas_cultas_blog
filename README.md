# The Blog Base

Base serverless e de baixo custo para blogs pessoais independentes. Este repositório não é um criador de blogs: ele oferece site Astro, painel administrativo React, API, publicação e infraestrutura AWS comuns. Cada blog derivado deve ter seu próprio repositório, identidade visual, conteúdo e configuração.

O projeto trabalha com dois ambientes rigorosamente separados:

| Ambiente | Branch | Conta AWS | Pode ser removido integralmente? |
|---|---|---|---|
| Homologação | `homolog` | Conta exclusiva de testes | Sim |
| Produção | `main` | Conta exclusiva de produção | Não pela automação |

As contas AWS devem ser diferentes. O setup recusa a configuração se os dois ambientes apontarem para o mesmo ID de conta.

## 1. Clonar e adaptar o projeto

### Pré-requisitos

Instale Git, Node.js 22, npm, Docker, AWS CLI e GitHub CLI (`gh`). Você também precisa de duas contas AWS e de um repositório GitHub próprio.

Se o repositório for privado, sua conta ou organização GitHub deve oferecer suporte a **Environments**, variáveis de ambiente e regras de branch para repositórios privados. Verifique isso antes de iniciar o setup; esses recursos são usados para separar homologação e produção.

Confirme as ferramentas:

```sh
git --version
node --version
npm --version
docker --version
docker compose version
aws --version
gh --version
```

### Criar seu repositório derivado

Crie primeiro um repositório GitHub vazio, sem README ou `.gitignore` gerados pela interface. Depois clone a base, entre no diretório e aponte o remote para o novo repositório:

```sh
git clone git@github.com:sillas/the-blog-base.git meu-blog
cd meu-blog
git remote set-url origin git@github.com:SEU_USUARIO/SEU_REPOSITORIO.git
npm ci
npm run hooks:install
```

O pré-commit instalado executa validações antes de cada commit. Não remova o arquivo `package-lock.json` e prefira `npm ci` ao preparar uma instalação limpa.

### Configurar as contas

Copie o modelo local:

```sh
cp project.config.example.json project.config.json
```

Preencha:

- `github.repository` no formato `owner/repository`;
- conta, região, domínio opcional e e-mail administrativo de `homolog`;
- conta, região, domínio opcional e e-mail administrativo de `production`.

`project.config.json` é ignorado pelo Git e não deve conter senhas, tokens ou access keys. Consulte [Configuração dos ambientes](doc_deploy/02-configuracao.md) para um exemplo comentado.

Edite também [deploy-accounts.json](deploy-accounts.json), substituindo os IDs de exemplo pelas mesmas contas. Esse arquivo é versionado de propósito: os workflows o usam como fonte independente das variáveis dos GitHub Environments.

Antes do primeiro push, valide e versione somente a configuração que deve ser compartilhada:

```sh
npm run check:fast
git add deploy-accounts.json
git commit -m "chore: configure deployment accounts"
git push -u origin main
git switch -c homolog
git push -u origin homolog
```

O arquivo `project.config.json` continuará apenas na sua máquina porque contém a configuração operacional local. Confirme com `git status --short` que ele não foi adicionado ao commit.

A partir desse ponto, faça alterações em `homolog`, valide-as e abra pull requests para `main`. Proteja `main` contra mudanças sem revisão. Se a branch `homolog` já existir no repositório derivado, use `git switch homolog` em vez de `git switch -c homolog`.

Design, textos padrão, páginas e componentes ficam principalmente em `site/`. O painel fica em `admin/`. Faça essas adaptações normalmente em `homolog`; depois de validar, integre-as em `main` por pull request.

## 2. Testar localmente

O modo local não acessa AWS, Cognito ou GitHub Actions. Ele utiliza Docker, DynamoDB Local, uma API Node e Nginx.

Há dois fluxos locais complementares:

- `local:dev`, para desenvolver o site e o admin com atualização automática de CSS, Astro e React;
- `local:up`, para validar os builds estáticos em uma arquitetura próxima à publicação.

### Desenvolvimento com atualização automática

Pare primeiro a stack estática, caso ela esteja usando a porta `8080`, e inicie o modo de desenvolvimento:

```sh
npm run local:down
npm run local:dev
```

Abra os mesmos endereços:

- site: http://localhost:8080
- admin: http://localhost:8080/admin/login
- API: http://localhost:8080/api/health

Astro e Vite leem o workspace por bind mounts. Alterações em `site/src` e `admin/src`, inclusive CSS, aparecem automaticamente no navegador sem executar `down`, reconstruir imagens ou copiar bundles estáticos. O sincronizador local atualiza os arquivos de conteúdo quando uma publicação muda no DynamoDB Local.

O comando permanece em primeiro plano para exibir os logs. Use `Ctrl+C` para interromper e, se necessário, encerre os serviços com:

```sh
npm run local:dev:down
```

Esse modo define a autenticação local somente nos containers de desenvolvimento. Ele não altera builds, variáveis, infraestrutura ou deploys de homologação e produção.

### Validação com builds estáticos

Na raiz do projeto:

```sh
npm ci
npm run local:up
npm run local:check
```

Abra:

- site: http://localhost:8080
- posts: http://localhost:8080/blog/
- admin: http://localhost:8080/admin/login
- health: http://localhost:8080/api/health

No admin local, clique em **Entrar**; não há senha no modo local. Para acompanhar o build:

```sh
npm run local:logs
```

Para parar preservando os dados:

```sh
npm run local:down
```

Para apagar apenas os dados locais e recomeçar:

```sh
npm run local:reset
```

Não execute `local:dev` e `local:up` ao mesmo tempo: ambos utilizam a porta `8080`. Antes de alternar de modo, encerre o modo atual com `local:dev:down` ou `local:down`.

O guia completo está em [Executando a stack local](doc_deploy/07-stack-local.md).

## 3. Efetuar o deploy

### Preparar as credenciais

O setup usa tokens com responsabilidades distintas:

- a sessão atual do `gh`, usada para configurar GitHub Environments, Secrets e executar workflows; ela precisa de acesso administrativo ao repositório e **Actions: write**;
- um token fine-grained de dispatch para homologação, limitado ao repositório e somente com **Contents: write**;
- outro token fine-grained de dispatch, com a mesma restrição, para produção.

Os tokens de dispatch devem ser diferentes do token usado pela sessão do `gh`. Não salve nenhum deles em arquivos do projeto. Eles serão lidos temporariamente de uma variável de ambiente e armazenados nos serviços apropriados pelo setup.

Antes de continuar, confirme que as alterações estão commitadas e publicadas, que você está autenticado no repositório correto e que o remote aponta para ele:

```sh
git status --short
git remote -v
gh auth status
gh repo view --json nameWithOwner,defaultBranchRef
```

### Implantar homologação

Faça primeiro a homologação. Troque para a branch correta e autentique a AWS CLI na conta de homologação:

```sh
git switch homolog
aws sso login --profile meu-blog-homolog
export AWS_PROFILE=meu-blog-homolog
aws sts get-caller-identity
```

Confira se o ID retornado é exatamente o configurado em `environments.homolog.aws.accountId`. Depois execute, em ordem:

```sh
npm run setup:check -- --stage homolog
npm run setup:bootstrap -- --stage homolog --yes
npm run setup:github -- --stage homolog --yes
npm run predeploy -- --stage homolog
npm run deploy:infra -- --stage homolog --yes
```

Aguarde o workflow `deploy-infra.yml` terminar. Acompanhe a execução pela aba **Actions** do GitHub ou pela CLI:

```sh
gh run list --workflow deploy-infra.yml --limit 1
gh run watch ID_DA_EXECUCAO
```

Quando ele terminar com sucesso, continue:

```sh
npm run setup:sync -- --stage homolog --yes
export BLOG_GITHUB_DISPATCH_TOKEN=TOKEN_FINE_GRAINED_HOMOLOG
npm run setup:admin -- --stage homolog --yes
unset BLOG_GITHUB_DISPATCH_TOKEN
npm run deploy:site -- --stage homolog --yes
npm run verify:production -- --stage homolog
```

`setup:sync` é obrigatório após a infraestrutura: ele lê o endereço criado pelo CloudFront e restringe CORS, callbacks e logout do Cognito à origem correta. `setup:admin` cria o usuário administrador e instala os segredos necessários à publicação. O comando `verify:production`, apesar do nome histórico, verifica também homologação quando recebe `--stage homolog`.

O painel possui somente login: não há cadastro público, perfil ou recuperação de senha. A criação, o reset administrativo e a recuperação após perda do autenticador TOTP são operações do Cognito; consulte [Operação e custos](doc_deploy/05-operacao-e-custos.md#administrador-do-cognito).

### Implantar produção

Após validar a homologação, abra um pull request de `homolog` para `main`. Para produção, autentique-se na outra conta e repita os mesmos passos substituindo `homolog` por `production`:

```sh
git switch main
aws sso login --profile meu-blog-production
export AWS_PROFILE=meu-blog-production
aws sts get-caller-identity

npm run setup:check -- --stage production
npm run setup:bootstrap -- --stage production --yes
npm run setup:github -- --stage production --yes
npm run predeploy -- --stage production
npm run deploy:infra -- --stage production --yes
# aguarde o workflow
npm run setup:sync -- --stage production --yes
export BLOG_GITHUB_DISPATCH_TOKEN=TOKEN_FINE_GRAINED_PRODUCTION
npm run setup:admin -- --stage production --yes
unset BLOG_GITHUB_DISPATCH_TOKEN
npm run deploy:site -- --stage production --yes
npm run verify:production -- --stage production
```

Cada GitHub Environment possui suas próprias variáveis e sua própria role OIDC. Não são armazenadas access keys permanentes no GitHub.

`BLOG_GITHUB_DISPATCH_TOKEN` deve ser um token fine-grained exclusivo daquele ambiente, limitado a este repositório e somente com **Contents: write**. Ele apenas envia eventos assinados. Não reutilize o token da sessão do `gh`: esse segundo token deve possuir **Actions: write** e permissão para administrar Secrets/Environments durante o setup; ele fica somente nos GitHub Secrets e encaminha o evento validado para a branch correta.

O domínio é opcional. Sem domínio, `setup:sync` obtém o endereço `cloudfront.net` gerado e configura automaticamente os callbacks de login/logout do Cognito para ele. Por isso, não pule `setup:sync`: depois dessa etapa, tanto o site público quanto o painel administrativo funcionam pelo CloudFront. Quando um domínio definitivo for adicionado, repita o deploy de infraestrutura e `setup:sync` para atualizar certificado, DNS, CORS e Cognito.

## 4. Remover tudo, se necessário

A remoção automática existe somente para homologação. Ela apaga os stacks da aplicação, inclusive tabela, User Pool e buckets versionados. Não remove a conta AWS, o domínio registrado, a hosted zone criada fora do CDK, o bootstrap `CDKToolkit`, o provedor OIDC ou a role de setup compartilhável.

Autentique a conta de homologação e esteja na branch `homolog`:

```sh
git switch homolog
export AWS_PROFILE=meu-blog-homolog
aws sts get-caller-identity
npm run setup:check -- --stage homolog
```

Revise o que será removido e dispare o workflow protegido:

```sh
npm run destroy:homolog -- \
  --stage homolog \
  --confirm DESTROY-HOMOLOG \
  --yes
```

Não existe `destroy:production`. O script e o workflow rejeitam `main`, `production`, conta divergente ou confirmação incorreta. Leia [Ambientes AWS e remoção completa da homologação](doc_deploy/08-ambientes-e-remocao.md) antes de executar.

## Documentação

O roteiro completo está em [doc_deploy/README.md](doc_deploy/README.md). Consulte também [PRE_DEPLOY.md](PRE_DEPLOY.md) e [PROJECT_SPEC.md](PROJECT_SPEC.md) para critérios técnicos e operacionais.
