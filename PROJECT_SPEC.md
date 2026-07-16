# Especificação Inicial — Blog Pessoal na AWS

Versão 0.1 — 2026-07-15

## 1. Objetivo

Blog de autor único, com foco em custo mínimo, simplicidade operacional e boa performance de leitura (páginas estáticas cacheadas). Inclui área de admin (SPA) para publicação de posts em Markdown (imediata ou agendada), upload de imagem de capa, e uma página de métricas de visualizações.

## 2. Stack escolhida

| Camada | Tecnologia | Por quê |
|---|---|---|
| Site público (front) | **Astro** (SSG, static output) | Feito para sites de conteúdo: HTML estático por padrão, quase zero JS no cliente ("islands"), Markdown/MDX nativo, geração de RSS/sitemap prontas. Mais leve que Next.js para este caso de uso. |
| Busca por título | **Pagefind** (ou Fuse.js sobre um JSON de índice gerado no build) | Busca 100% client-side, sem backend, sem custo. |
| Admin (front) | **React + Vite** (SPA) | Simples, não precisa ser estático nem SSR. Editor Markdown com preview (`@uiw/react-md-editor` ou similar). |
| Autenticação admin | **Amazon Cognito** (User Pool com 1 único usuário) | Autor único; Cognito é grátis até 50 MAUs. Evita reinventar auth. |
| API (back) | **API Gateway (HTTP API)** + **AWS Lambda** (Node.js/TypeScript) | Serverless, paga por uso, sempre-grátis cobre praticamente todo o tráfego de um blog pessoal. |
| Banco de dados | **DynamoDB** (single-table design, on-demand) | Sem servidor, 25GB e capacidade sempre grátis, latência baixa para o volume esperado. |
| Imagens (capa dos posts) | **S3** + servidas via **CloudFront** | Upload direto do browser via presigned URL, sem passar pela Lambda. |
| CDN / cache | **CloudFront** (única distribuição, múltiplos "behaviors") | `/` → S3 (site público) · `/admin/*` → S3 (SPA) · `/api/*` → API Gateway. Um único domínio, um único certificado. |
| DNS | **Route 53** | Conforme solicitado. Zona hospedada + registro ALIAS apontando pro CloudFront. |
| Certificado | **AWS Certificate Manager** em us-east-1, quando houver domínio personalizado | Grátis. O domínio padrão `cloudfront.net` já usa certificado gerenciado pela AWS. |
| Publicação agendada | **EventBridge Scheduler** (agendamento único por post) → Lambda → dispara rebuild | Ver seção 5. |
| IaC | **AWS CDK (TypeScript)** | Mesma linguagem do resto da stack; um único repositório/mental model. |
| CI/CD | **GitHub Actions** | Build do Astro, deploy do CDK, deploy da SPA admin, invalidação de cache CloudFront. Runners do GitHub (grátis/baratos) evitam precisar de CodeBuild. |

### Por que estático + serverless, e não um servidor (EC2/ECS) tradicional?

Um blog de autor único tem carga de leitura alta e carga de escrita quase nula (poucos posts por semana). Gerar o HTML no build e servir via CDN é a forma mais barata e simples de escalar leitura: não há servidor para manter, patchear, ou pagar 24/7. A única parte "dinâmica" real é: (a) o admin, (b) contagem de views, (c) busca — todas resolvidas com Lambda sob demanda ou 100% client-side.

## 3. Páginas públicas necessárias

1. **Landing page** (`/`) — destaques, últimos posts, categorias em evidência.
2. **Listagem de posts** (`/blog` ou `/posts`) — paginada, com filtro por categoria e por data.
3. **Página de categoria** (`/categoria/[slug]`) — posts filtrados.
4. **Arquivo por data** (`/2026/07/`) — opcional, mas comum em blogs.
5. **Post individual** (`/post/[slug]`) — conteúdo renderizado do Markdown, imagem de capa, data, categoria, contador de views (opcional exibir ao público).
6. **Busca** — pode ser uma página própria (`/busca`) ou um campo embutido na listagem, usando índice client-side.
7. **Sobre o autor** (`/sobre`).
8. **Contato** (opcional — formulário simples via Lambda+SES, ou apenas mailto).
9. **Política de Privacidade** e **Termos de Uso** — **obrigatórios se for usar AdSense/Analytics**.
10. **404** customizada.
11. Artefatos técnicos (não são "páginas" mas fazem parte do requisito de blog padrão): `sitemap.xml`, `rss.xml`, `robots.txt`.

Área de admin (SPA, atrás de login Cognito):
- Login
- Lista de posts (com status: rascunho / agendado / publicado)
- Editor de post (Markdown + preview + upload de imagem de capa + data/hora de publicação)
- Página de métricas (ver seção 4)

## 4. Métricas / contagem de views

- Cada página de post estática dispara, no carregamento, uma chamada assíncrona `POST /api/views/{slug}` (Lambda) que incrementa um contador atômico no DynamoDB. Isso mantém o HTML 100% cacheável no CDN — a contagem acontece "por fora" do cache.
- Modelo de dados sugerido (DynamoDB single-table):
  - `PK=POST#<slug>` `SK=METADATA` → título, categoria, status, publishAt, viewCount
  - GSI por `viewCount` para consultar "mais visualizados" sem scan completo.
- Endpoint de métricas (`GET /api/metrics`, protegido por Cognito) retorna: total de views (soma), views por post, top N mais visualizados. Para o volume esperado (dezenas/centenas de posts), uma query simples com GSI é suficiente — não é necessário pipeline de analytics (Athena/QuickSight seria over-engineering aqui).
- Ponto de atenção para v2: deduplicar views por IP/dia (ex.: registro com TTL no DynamoDB) para reduzir inflação por bots/reload. Não é essencial no v1.

## 5. Publicação imediata ou agendada

- Ao salvar um post no admin com status "agendado", grava-se `publishAt` no DynamoDB e cria-se um **EventBridge Scheduler** de disparo único para aquele horário.
- No horário agendado, o Scheduler invoca uma Lambda que: (1) marca o post como `published` no DynamoDB, (2) envia um `repository_dispatch` assinado. Um workflow sem acesso AWS valida assinatura, estágio e validade temporal antes de disparar o workflow de deploy na branch correspondente.
- O workflow do GitHub Actions reconstrói o Astro (puxando os posts publicados do DynamoDB ou de um export JSON), sincroniza com S3 e invalida o cache do CloudFront para as rotas afetadas.
- Publicação imediata: o próprio salvar do admin já dispara o mesmo workflow de rebuild+deploy, sem passar pelo Scheduler.

## 6. Sistema de comentários (não necessário agora, mas caso venha a ser)

Duas opções, da mais simples para a mais completa:

1. **Giscus** (baseado em GitHub Discussions) ou **Utterances** — zero backend, zero custo, basta embutir um script no template do post. Melhor opção para manter a simplicidade da stack. Limitação: exige conta GitHub do comentarista.
2. **Solução própria**: tabela `COMMENT#<slug>` no DynamoDB + Lambda de CRUD + fila de moderação simples no admin (aprovar/rejeitar antes de aparecer publicamente). Como a página do post é estática, os comentários seriam carregados via fetch client-side (mesmo padrão do contador de views), preservando o cache do HTML.

Recomendação: começar com Giscus se/quando for necessário; migrar para solução própria só se precisar de controle total de moderação/dados.

## 7. Marketing e AdSense

- Como as páginas são estáticas, basta inserir os blocos/scripts (AdSense, tags de marketing, pixels) diretamente nos componentes Astro (ex.: um componente `<AdSlot />` reutilizável), carregados com `async`/`defer` para não bloquear renderização.
- Necessário publicar `ads.txt` na raiz do site (S3/CloudFront) — requisito do Google AdSense.
- Banner de consentimento de cookies (LGPD/GDPR) como um "island" isolado (pouco JS), condicionando o carregamento de scripts de terceiros (Analytics, AdSense, pixels) ao consentimento.
- Seções promocionais/newsletter podem ser blocos estáticos na landing page; um formulário de inscrição pode chamar uma Lambda simples que grava o e-mail no DynamoDB e dispara confirmação via **SES** (ficando dentro da mesma stack, sem precisar de Mailchimp) — ou, se preferir menos operação própria, plugar um serviço de terceiros (Buttondown/Mailchimp) via formulário client-side.
- Google Analytics/Tag Manager: mesmo padrão, script incluído condicionalmente após consentimento.

## 8. Route 53

- Uma hosted zone para o domínio raiz.
- Um registro **ALIAS** (A) apontando para a distribuição CloudFront (sem custo extra de query para ALIAS quando é para recursos AWS).
- Certificado emitido no ACM em `us-east-1`, validado via DNS (registro CNAME automático no Route 53).
- Um único domínio para tudo (`blog.com`), com `/admin` servido pela mesma distribuição (behavior diferente), evitando um segundo certificado/subdomínio.

## 9. Estimativa de custos (AWS)

Baseado nos preços/free tier vigentes em 2026 (Lambda: 1M requisições + 400.000 GB-s sempre grátis; DynamoDB: 25GB + capacidade sempre grátis; CloudFront: 1TB + 10M requisições sempre grátis; Route 53: US$ 0,50/zona/mês).

| Item | Custo fixo mensal | Observação |
|---|---|---|
| Route 53 (hosted zone) | ~US$ 0,50 | + ~US$ 0,40/milhão de queries DNS |
| ACM (certificado) | US$ 0 | Grátis |
| Cognito (1 usuário) | US$ 0 | Free tier cobre até 50 MAUs |
| S3 (armazenamento site + imagens, poucos GB) | ~US$ 0,10–0,50 | Pennies por GB |
| **Subtotal fixo, sem tráfego** | **~US$ 1–2/mês** | |

| Cenário de tráfego | CloudFront (egress) | Lambda + API Gateway + DynamoDB | Total estimado/mês |
|---|---|---|---|
| Baixo (até ~50k pageviews) | US$ 0 (dentro do 1TB/10M reqs sempre grátis) | US$ 0 (dentro do sempre-grátis) | **~US$ 1–3** |
| Médio/"relevante" (~300k–500k pageviews) | US$ 0–5 (provável ainda dentro do free tier se as páginas forem leves, <300KB) | US$ 0–2 | **~US$ 3–10** |
| Alto (1–2M pageviews/mês, pico/viral) | ~US$ 20–40 (acima de 1TB de saída) | ~US$ 2–5 | **~US$ 25–50** |

Observações importantes:
- O maior "risco" de custo é o **egress do CloudFront** caso as páginas fiquem pesadas (imagens não otimizadas). Recomenda-se usar o pipeline de otimização de imagens do Astro (`astro:assets`) e servir WebP/AVIF.
- GitHub Actions: grátis para repositório público; para privado, 2.000 minutos/mês grátis, mais que suficiente para builds de um blog.
- Não há custo de "servidor ocioso" — tudo escala a zero quando não há tráfego.
- Recomenda-se configurar **AWS Budgets** com alerta em, por exemplo, US$ 10/mês para detectar qualquer anomalia cedo.

## 10. Proteção contra bots de IA / scraping agressivo

Dois problemas distintos, que pedem respostas diferentes:

**(a) Bots que consomem banda/custo real** (scrapers agressivos, treinamento de LLMs, agregadores) — este é o foco principal.
**(b) "AI answer engines"** (ChatGPT, Perplexity, Gemini, etc.) que respondem à pergunta do usuário usando seu conteúdo, sem gerar clique/visita — problema mais estratégico do que técnico; bloqueio total elimina também a chance de aparecer citado/linkado nessas respostas.

### Defesa em camadas (do mais simples/barato ao mais robusto)

1. **`robots.txt` com diretivas por bot** (grátis, primeira linha de defesa, mas só vale para bots que respeitam o arquivo):
   - Bloquear crawlers de **treinamento**: `GPTBot`, `CCBot` (Common Crawl), `Google-Extended`, `Bytespider`, `Diffbot`, `cohere-ai`.
   - Permitir (ou não bloquear) crawlers de **busca/resposta com atribuição**: `OAI-SearchBot`, `ChatGPT-User`, `PerplexityBot`, `ClaudeBot` (quando usado para buscas, não treino) — eles podem trazer referral traffic e citação, ao contrário dos de treino.
   - **Atenção**: `Bytespider` (ByteDance) é conhecido por ignorar `robots.txt` — o arquivo sozinho não resolve para esse e outros bots mal-comportados; é só a camada de "opt-out educado".

2. **AWS WAF na distribuição CloudFront** (enforcement real, para quem ignora o `robots.txt`) — pode ser adicionado de forma incremental, sem redesenhar nada:
   - **Regra de rate-based** (nativa do WAF, sem custo de "managed rule group"): bloqueia/desafia IPs que excedem X requisições em 5 minutos — captura a maioria dos scrapers, que batem muito mais rápido que um leitor humano. É o item de melhor custo-benefício.
   - **AWS Managed Rules — "Anonymous IP List"**: identifica tráfego de VPNs, proxies e provedores de hosting (de onde vem a maior parte do scraping em massa, incluindo muitos crawlers de IA). Baixo custo adicional.
   - **AWS Managed Rules — Core Rule Set**: proteção genérica de baixo custo, não é focada em bots de IA mas fecha superfícies óbvias.
   - **AWS WAF Bot Control (camada "Common", ~US$10/mês + tarifa por milhão de requisições)**: tem assinaturas específicas para categorias como "bulk data collection"/scrapers, incluindo diversos bots de IA conhecidos. Só vale a pena ativar se o volume de scraping realmente se mostrar um problema (custo ou distorção de métricas) — não recomendo ativar de cara num blog novo.
   - **Novidade (jun/2026): Web Bot Authentication + "AI traffic monetization"** no AWS WAF — permite verificar criptograficamente a identidade de bots/agentes de IA e, em vez de só bloquear, **definir um preço de acesso** para bots verificados. É uma alternativa interessante a médio prazo caso o objetivo evolua de "bloquear" para "monetizar o acesso de IAs" ao conteúdo — vale reavaliar quando o blog tiver tráfego relevante.

3. **A arquitetura já ajuda por padrão**: como a contagem de views é feita via `fetch()` disparado no client-side (não no carregamento do HTML), bots que não executam JavaScript — a maioria dos scrapers simples — **não inflam as métricas de visualização**. Isso já protege a integridade dos números do painel de métricas sem esforço extra.

4. **Honeypot simples (opcional, v2)**: uma rota desabilitada no `robots.txt` (ex.: `/nao-visitar/`) que nenhum crawler "de boa-fé" acessa; qualquer IP que bater nela é candidato a entrar num IP-set bloqueado no WAF automaticamente (via uma Lambda que lê os logs).

### Recomendação de rollout (mantendo custo baixo)

- **Fase 0 (lançamento)**: apenas `robots.txt` configurado + AWS Shield Standard (incluso de graça no CloudFront, protege contra DDoS volumétrico) + alerta no AWS Budgets. Custo adicional: **US$ 0**.
- **Fase 1 (se aparecer scraping real nos logs/custo)**: WAF com regra de rate-based + Anonymous IP List + Core Rule Set. Custo adicional estimado: **~US$ 8–12/mês** (US$5 do Web ACL + ~US$1/regra + tarifa por milhão de requisições).
- **Fase 2 (se scraping de IA especificamente virar problema de custo/conteúdo)**: adicionar Bot Control (Common). Custo adicional: **+US$10/mês** + tarifa por milhão.

Ou seja: **não recomendo pagar por WAF/Bot Control desde o dia 1** — comece observando os logs do CloudFront/WAF (modo "count", sem bloquear) por algumas semanas, confirme que o problema é real, e só então avance de fase.

## 11. SEO

### O que a arquitetura já garante "de graça"

- **Astro gera HTML estático** — o conteúdo já chega pronto pro crawler, sem depender de execução de JS/hidratação. Isso é o ideal para indexação e para Core Web Vitals (LCP/CLS baixos).
- **CloudFront** reduz latência (edge), o que também é fator de ranking.
- `sitemap.xml`, `rss.xml` e `robots.txt` já previstos como artefatos (seção 3).
- URLs por categoria/data (seção 3) já dão uma arquitetura de informação e internal linking razoável.

### O que falta especificar

1. **Meta tags por página**: `<title>` único e `meta description` por post — gerados a partir do frontmatter Markdown (campo `description` no editor do admin, com fallback para as primeiras N palavras do texto).
2. **Canonical URL** em toda página — decide uma forma canônica (com/sem `www`, com/sem trailing slash) e redireciona a outra via CloudFront Function (roda no edge, sem custo de Lambda@Edge completo). Evita penalização por conteúdo duplicado.
3. **Open Graph + Twitter Card**: usar a imagem de capa do post (já prevista no admin) + título + descrição — necessário para preview decente ao compartilhar em redes sociais.
4. **Dados estruturados (JSON-LD)**: schema.org `BlogPosting`/`Article` com autor, data de publicação e imagem. Além de habilitar rich snippets no Google, isso ajuda na "Generative Engine Optimization" (GEO) — aumenta a chance de ser citado corretamente pelos AI answer engines que você decidiu **não** bloquear (ver seção 10-b).
5. **Integrações nativas do Astro**: `@astrojs/sitemap` e um endpoint de RSS via `@astrojs/rss` — geram sitemap/feed automaticamente no build, sem manutenção manual.
6. **Paginação da listagem**: canonical apontando para a própria página paginada (evita que Google trate `/blog?page=2` como conteúdo fraco duplicado da página 1).
7. **Estratégia de slugs**: definir o slug a partir do título e tratá-lo como **imutável** após publicação (o site é reconstruído estaticamente — mudar slug depois quebra links já indexados/compartilhados). Se precisar mudar mesmo assim, prever redirect 301 via CloudFront Function.
8. **Alt text obrigatório** para a imagem de capa no editor do admin — campo obrigatório, ajuda acessibilidade e SEO de imagem.
9. **Google Search Console + Bing Webmaster Tools**: verificação de propriedade por registro **TXT no Route 53** (mais simples que subir arquivo), com submissão do `sitemap.xml` após o primeiro deploy.
10. **Checklist de lançamento**: rodar Lighthouse/PageSpeed Insights antes de ir ao ar — a stack já deve pontuar bem por ser estática, mas vale confirmar (imagens otimizadas via `astro:assets`, sem JS bloqueante).
11. **Posts despublicados/excluídos**: retornar 410 (Gone) em vez de 404 puro quando fizer sentido, e considerar redirect 301 se o conteúdo foi movido/renomeado, para não perder o "link equity" acumulado.

## 13. Decisões e preparação antes de implementar

Revisão do documento como um todo, buscando o que fica **caro de mudar depois** se começar a codar sem decidir agora.

### 13.1 [DECIDIDO] Fonte da verdade do conteúdo = DynamoDB; GitHub é só repositório de código

A seção 5 deixou isso ambíguo ("...puxando os posts publicados do DynamoDB **ou** de um export JSON"). Decisão confirmada: **DynamoDB é a fonte única da verdade do conteúdo** (posts, status, agendamento, views). O repositório GitHub contém **apenas código** — templates Astro, SPA admin, Lambdas, infra CDK — nunca Markdown de post. Isso é o que garante o que a próxima seção (13.7) explica sobre correções de bug/redesign não arriscarem o conteúdo.

Implementação, por ser mais simples e 100% dentro da stack já escolhida:
- O texto Markdown do post fica salvo como atributo do item no DynamoDB (não em arquivos no repositório).
- O job do GitHub Actions, antes de rodar `astro build`, executa um passo de **"exportação de conteúdo"**: lê os posts com status `published` do DynamoDB (via AWS SDK, usando uma IAM role com permissão só de leitura) e materializa os arquivos `.md`/`.json` que o Astro consome no build. Esse passo precisa existir e ser explicitado no workflow.
- **Backup/histórico**: manter **DynamoDB Point-in-Time Recovery (PITR)** em produção como proteção contra edição ou exclusão acidental. A homologação descartável não habilita PITR. Não provisionar AWS Backup nem exportação periódica na base, preservando custo e complexidade mínimos. Se algum projeto precisar de uma cópia adicional, o administrador fará uma exportação pontual diretamente na conta AWS.
- **Preview de rascunho/agendado**: como o site público só contém posts publicados, o preview de um rascunho deve acontecer **dentro da própria SPA de admin** (renderizando o Markdown com o mesmo parser usado no Astro), sem precisar de um deploy real. Evita ter que manter um ambiente de "staging" completo só para preview.

Alternativa descartada (mas registrada para referência): guardar o Markdown em arquivos no próprio repositório Git, com o admin commitando via API do GitHub (padrão usado por CMSs como o Decap CMS). Daria histórico de edição "de graça" via `git log`, mas adiciona uma dependência (token do GitHub dentro de uma Lambda) e complexidade de tratar conflitos — não compensa para um único autor com o PITR já cobrindo o caso de recuperação de desastre.

### 13.2 Segurança operacional

- **GitHub Actions → AWS via OIDC**, não access keys de longa duração: configurar um IAM Role com trust policy para o provedor OIDC do GitHub, evitando secret fixo para rotacionar/vazar.
- **IAM com least privilege por função**: cada Lambda com sua própria role (ex.: a Lambda de views só tem `UpdateItem` no item de contagem; a de export de conteúdo só tem `Query`/`Scan` de leitura) — evita uma única role "todo-poderosa".
- **Sanitização do Markdown renderizado**: usar um pipeline que não permita HTML bruto por padrão (ex.: `rehype-sanitize`) tanto no Astro quanto no preview do admin — mitigação simples caso a conta do autor seja comprometida.
- **S3 versioning** no bucket de imagens de capa — protege contra sobrescrita/exclusão acidental de um upload.

### 13.3 Observabilidade (hoje só existe alerta de custo)

- O documento já prevê AWS Budgets (seção 9), mas nada cobre falha silenciosa em runtime. Recomenda-se **CloudWatch Alarms** para: taxa de erro das Lambdas, 4xx/5xx do API Gateway/CloudFront, falha do Scheduler → notificando por **SNS + e-mail**. Sem isso, se a publicação agendada falhar silenciosamente, o autor só descobre olhando o site.

### 13.4 Estratégia de invalidação do CloudFront

- Invalidar **apenas os paths afetados** por um deploy (home, listagem, categoria correspondente, sitemap, o post específico) em vez de `/*` a cada publicação — controla o custo (1.000 paths grátis/mês, US$0,005 por path adicional) e evita derrubar cache de páginas não relacionadas.
- Assets com hash de conteúdo no nome (JS/CSS gerados pelo Astro) **não precisam** ser invalidados — já mudam de URL a cada build. Isso reduz bastante a lista de paths a invalidar.

### 13.5 Detalhes de implementação que evitam bugs clássicos

- **Fuso horário do agendamento**: gravar `publishAt` sempre em **UTC** no DynamoDB; converter para o fuso do autor só na UI do admin. Evita o clássico bug de post saindo horas antes/depois do esperado.
- **Consentimento de e-mail (newsletter, seção 7)**: se implementada, precisa de checkbox de opt-in explícito + link de descadastro — a política de privacidade sozinha não é suficiente para LGPD/CAN-SPAM.

### 13.6 Organização e escopo

- **Monorepo único** (site Astro, SPA admin, Lambdas, infra CDK no mesmo repositório) — mais simples de manter e deployar para um único autor; múltiplos repositórios só adicionariam overhead de sincronização de pipelines.
- **Corte explícito de MVP**: vale documentar formalmente o que entra na v1 — páginas públicas + admin CRUD + agendamento + views + SEO básico (seção 11) + `robots.txt` de bots de IA (seção 10) — versus o que fica para depois (comentários, WAF/Bot Control, monetização de IA, newsletter). Isso evita scope creep na hora de codar.
- **Primeiro passo prático**: registrar (ou transferir) o domínio no Route 53 antes de tudo — pode levar horas para propagar, especialmente se for transferência. Decidir também se haverá um ambiente de teste antes do corte de DNS (ex.: acessar via domínio padrão do CloudFront `*.cloudfront.net` durante o desenvolvimento, promovendo para o domínio final só no lançamento).

### 13.7 Risco de perda ao corrigir bugs ou mudar layout/design?

**Resposta curta: não há risco de perda de conteúdo nem de métricas.** É uma consequência direta da decisão da seção 13.1: o código (templates, CSS, componentes) e o conteúdo (posts, views) vivem em sistemas totalmente separados.

- Um bug de página ou uma reforma completa de layout/design é só uma mudança no repositório GitHub (templates Astro). O deploy correspondente roda o mesmo pipeline de sempre: exporta o estado **atual** do DynamoDB → gera o HTML novo com o layout novo → sincroniza com o S3 → invalida o CloudFront. Os posts, o histórico de views e o status de agendamento no DynamoDB **não são tocados** nesse processo — o pipeline só lê de lá, nunca escreve.
- Isso significa que uma correção de bug ou um redesign completo pode ser feito, revertido e refeito quantas vezes for preciso, sem qualquer efeito colateral sobre o conteúdo.

Isso não elimina todo risco — os riscos reais são operacionais, e as mitigações já estão previstas ou é fácil de prever:

1. **Um deploy ruim ir ao ar** (ex.: CSS quebrado, uma página em branco): a correção mais rápida é `git revert` do commit problemático + reexecutar o workflow — como o conteúdo não está no Git, reverter o código não afeta os posts. Para um rollback ainda mais rápido sem esperar novo build, vale ativar **S3 versioning também no bucket do site** (não só no de imagens, seção 13.2) — permite restaurar a versão anterior de um objeto específico direto no S3, e depois investigar com calma.
2. **Mudança de layout que exige campo novo no modelo de dados** (ex.: adicionar "subtítulo" ou "tempo de leitura" a um post): posts antigos no DynamoDB não terão esse atributo. O template precisa ser escrito de forma defensiva (valor padrão/fallback quando o campo não existir) para não quebrar a renderização de posts antigos; se o campo for obrigatório para o novo design, rodar um script de backfill (uma execução única de Lambda/script) que atualiza os itens existentes — não é automático, mas é previsível e não decidido às pressas.
3. **Mudança de estrutura de URL/slug durante um redesign**: não é "perda de dado", mas pode gerar 404 e perda de posicionamento em buscadores — já coberto pela estratégia de redirects da seção 11.
4. **Pegar o bug antes de ir ao ar**: o workflow já deve falhar (não sincronizar/invalidar) se `astro build` quebrar. Como melhoria opcional (não essencial para o MVP dado o volume de um autor único), é possível fazer deploy de PRs para um path de preview no mesmo bucket (ex.: `/_preview/<pr>/`) atrás de um behavior do CloudFront restrito, para revisar visualmente antes do merge — mas para v1, "testar localmente com `astro dev` antes de commitar" já cobre a maior parte do risco.

## 14. Próximos passos sugeridos

1. Provisionar a infraestrutura base via CDK (Route 53 zone, ACM, S3 buckets, CloudFront, Cognito User Pool).
2. Modelar a tabela única do DynamoDB (posts, views, futuros comentários/newsletter).
3. Criar o esqueleto Astro (layout, listagem, post individual, categorias, busca via Pagefind).
4. Criar a SPA de admin (login Cognito, CRUD de posts, upload de imagem, agendamento).
5. Implementar as Lambdas: CRUD de posts, presigned upload, incremento/consulta de views, trigger de publicação agendada.
6. Configurar os workflows do GitHub Actions (build+deploy site, deploy SPA admin, deploy CDK, rebuild disparado por agendamento).
7. Adicionar `ads.txt`, política de privacidade, banner de consentimento antes de ativar AdSense/Analytics.
8. Publicar `robots.txt` com as diretivas de bots de IA (seção 10) desde o lançamento; avaliar WAF só se o monitoramento indicar necessidade.
9. Implementar meta tags, canonical, Open Graph e JSON-LD (seção 11) desde o primeiro deploy — muito mais barato que adicionar depois que o site já está indexado.
10. Registrar/transferir o domínio no Route 53 (pode demorar a propagar) e decidir o fluxo de ambiente de teste antes do corte de DNS.
11. Configurar OIDC do GitHub Actions para AWS, PITR no DynamoDB, versioning no bucket S3 de imagens e alarmes básicos no CloudWatch (seção 13) antes de escrever a primeira Lambda.
