# 1. Pré-requisitos

## Contas

Você precisa de:

- duas contas AWS: uma exclusiva para homologação e outra para produção, ambas com permissão para criar infraestrutura;
- uma conta GitHub;
- um repositório GitHub para o projeto, inicialmente privado ou público conforme sua preferência.

O repositório base `The Blog Base` é privado inicialmente. Cada blog derivado deve ter seu próprio repositório.

## Ferramentas locais

Instale:

- Git;
- Node.js 22;
- npm;
- AWS CLI;
- GitHub CLI (`gh`).

Confirme:

```sh
node --version
npm --version
aws --version
gh --version
git --version
```

## Autenticação

Autentique a AWS pelo método usado na sua conta, por exemplo AWS SSO:

```sh
aws sso login --profile meu-perfil
export AWS_PROFILE=meu-perfil
```

Confirme a conta ativa:

```sh
aws sts get-caller-identity
```

Autentique o GitHub:

```sh
gh auth login -h github.com
gh auth status
```

Para configurar a publicação automática, prepare dois tokens por ambiente:

- token de dispatch fine-grained, limitado ao repositório e com somente **Contents: write**;
- token usado pelo `gh`, diferente do anterior e com **Actions: write** para encaminhar o evento validado.

Homologação e produção devem usar tokens de dispatch diferentes. Não grave esses valores em arquivos do projeto.

Não prossiga se a conta AWS ativa não corresponder ao estágio que será operado. Homologação e produção nunca devem compartilhar o mesmo Account ID.

## Preparação do projeto

Clone o repositório do novo blog e instale exatamente as dependências do lockfile:

```sh
git clone URL_DO_REPOSITORIO
cd NOME_DO_REPOSITORIO
npm ci
npm run hooks:install
```

O último comando ativa o pré-commit local. Ele executa testes e typechecks antes de cada commit.

## Domínio

O domínio é opcional no primeiro deploy.

- Com domínio: ele deve estar em uma hosted zone do Route 53 já existente.
- Sem domínio: deixe os campos vazios. Após o deploy, `setup:sync` configura site, admin e Cognito para o endereço `cloudfront.net` gerado.

O setup não compra, registra ou transfere domínios automaticamente.
