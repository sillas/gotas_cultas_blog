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

Alterações em `homolog` publicam no GitHub Environment de homologação; alterações em `main` publicam em produção quando afetam site, admin ou pacote compartilhado.

Ao publicar ou atualizar um post, a Lambda envia um `repository_dispatch` assinado. Um workflow sem acesso AWS valida assinatura, estágio e validade temporal; somente então dispara `workflow_dispatch` na branch correta. O workflow dessa branch exporta o DynamoDB e reconstrói o site.

## Atualização da infraestrutura

Depois de alterar `infra/`, execute:

```sh
npm run predeploy -- --stage homolog
npm run deploy:infra -- --stage homolog --yes
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

## Administrador do Cognito

O sistema admite um único administrador e não oferece cadastro, perfil nem recuperação de senha no painel. `npm run setup:admin -- --stage AMBIENTE --yes` cria esse usuário diretamente no Cognito; o User Pool mantém o cadastro público e a recuperação autônoma desabilitados.

Para criar novamente o usuário sem o script, obtenha `UserPoolId` nos outputs do stack de autenticação e execute na conta e região corretas:

```sh
aws cognito-idp admin-create-user \
  --user-pool-id ID_DO_USER_POOL \
  --username EMAIL_DO_ADMIN \
  --user-attributes Name=email,Value=EMAIL_DO_ADMIN Name=email_verified,Value=true \
  --region REGIAO
```

O Cognito envia uma senha temporária válida por três dias. Para um reset administrativo, prefira **Cognito > User pools > Users > Reset password** no console AWS. Se for necessário definir uma senha permanente pela CLI, leia-a sem exibi-la, execute o comando e apague imediatamente a variável:

```sh
read -s BLOG_ADMIN_NEW_PASSWORD
aws cognito-idp admin-set-user-password \
  --user-pool-id ID_DO_USER_POOL \
  --username EMAIL_DO_ADMIN \
  --password "$BLOG_ADMIN_NEW_PASSWORD" \
  --permanent \
  --region REGIAO
unset BLOG_ADMIN_NEW_PASSWORD
```

Em caso de perda do aplicativo autenticador, confirme primeiro a identidade do administrador por um canal externo e confiável. Então remova somente a associação TOTP no console Cognito ou pela CLI:

```sh
aws cognito-idp admin-set-user-mfa-preference \
  --user-pool-id ID_DO_USER_POOL \
  --username EMAIL_DO_ADMIN \
  --software-token-mfa-settings Enabled=false,PreferredMfa=false \
  --region REGIAO
```

No login seguinte, como TOTP continua obrigatório para o User Pool, o administrador deverá associar um novo autenticador. Não desabilite MFA no User Pool e registre a operação na trilha administrativa da conta AWS.

## Contenção do contador de visualizações

`POST /views/{slug}` possui throttle próprio de 2 requisições por segundo, burst 10. O limite do API Gateway é best-effort, agregado e não representa uma cota por IP; os alarmes de `4xx`, invocações da Lambda e escrita no DynamoDB devem ser avaliados em conjunto.

Ao receber um alarme, confirme no CloudWatch se o crescimento está restrito à rota de views. Para contenção imediata e reversível, defina a concorrência reservada da `ViewsFunction` como zero no console Lambda; isso interrompe somente o contador e preserva as rotas administrativas. Preserve logs e métricas antes da mudança, registre o valor anterior e restaure-o somente após estabilização. Para bloqueio prolongado, remova a rota por um deploy de infraestrutura.

Considere AWS WAF apenas se houver abuso recorrente, volume que justifique o custo ou exigência operacional. Nesse caso, valide novamente os preços, comece com uma regra rate-based limitada à rota em modo `COUNT`, observe falsos positivos e somente então avalie bloqueio. O WAF não faz parte da configuração padrão deste blog de baixo tráfego.
