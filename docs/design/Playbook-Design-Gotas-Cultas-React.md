# Gotas Cultas

## Playbook de design e implementação em React.js

**Versão:** 1.0
**Finalidade:** orientar o design, a redação visual e a implementação do blog Gotas Cultas.
**Escopo:** página inicial, listagens, artigos, busca, páginas institucionais e componentes compartilhados.

---

## 1. Visão da marca

O **Gotas Cultas** publica textos breves sobre temas teológicos e filosóficos. A experiência deve comunicar que o conteúdo é intelectualmente cuidadoso, mas acessível; contemplativo, mas não lento; cristão em sua orientação, sem recorrer a clichês visuais religiosos.

### 1.1 Conceito central

> Pequenas reflexões sobre as grandes questões.

A gota representa uma porção breve de conhecimento. O livro aberto representa leitura, tradição, investigação e transmissão. O design deve preservar essa síntese: **brevidade na forma, profundidade no conteúdo**.

### 1.2 Atributos da experiência

1. **Clara:** o leitor identifica rapidamente tema, título e sequência de leitura.
2. **Contemplativa:** o espaço visual convida à atenção, sem excesso de estímulos.
3. **Editorial:** tipografia e ritmo têm mais importância do que cartões, efeitos ou ilustrações decorativas.
4. **Acolhedora:** a linguagem visual não deve parecer reservada a especialistas.
5. **Durável:** evitar tendências que envelheçam rapidamente.

### 1.3 O que o design não deve parecer

- portal de notícias;
- plataforma acadêmica;
- site institucional de igreja;
- blog genérico baseado em cartões;
- biblioteca antiga ou estética medieval;
- página de marketing com muitos botões e chamadas.

---

## 2. Princípios de design

### 2.1 O texto é o elemento principal

Imagens, cores e ornamentos devem apoiar a leitura. Nenhum componente visual deve competir com o título ou com o argumento do artigo.

### 2.2 Profundidade por meio do ritmo

A sensação de refinamento virá de margens generosas, hierarquia tipográfica, alinhamentos consistentes e pausas entre blocos — não de sombras, gradientes ou animações complexas.

### 2.3 Uma gota de dourado

O dourado-ocre é uma cor de acento. Deve representar aproximadamente 5% da composição visual. Serve para indicar categoria, foco, seleção ou um pequeno detalhe da marca.

### 2.4 Poucos padrões, usados sempre

O mesmo padrão de título, metadados, resumo e separador deve aparecer em todas as listagens. Variações arbitrárias enfraquecem a identidade editorial.

### 2.5 A brevidade não deve produzir pressa

Mesmo textos curtos precisam de uma página calma, com largura confortável e entrelinha generosa. “Curto” descreve o conteúdo; não significa “compactado”.

---

## 3. Identidade visual

### 3.1 Uso da assinatura

A assinatura principal será composta pelo símbolo e pelo nome **Gotas Cultas**.

- **Cabeçalho:** assinatura horizontal.
- **Rodapé:** assinatura horizontal ou apenas o nome.
- **Favicon e ícone de aplicativo:** versão simplificada do símbolo.
- **Compartilhamento social:** símbolo, nome e título do artigo em composição própria.

Manter ao redor da assinatura uma área livre mínima equivalente à largura de um quarto do símbolo. Não aplicar sombra, contorno, rotação ou efeitos tridimensionais.

### 3.2 Tamanho mínimo

- Assinatura completa: `144px` de largura na web.
- Símbolo isolado: `24px` em interfaces.
- Favicon: versões próprias em `16px`, `32px` e `48px`.

O símbolo final deve ser disponibilizado preferencialmente em SVG, acompanhado de uma versão monocromática.

---

## 4. Sistema de cores

### 4.1 Paleta principal

| Token | Valor | Uso |
|---|---:|---|
| `brand-700` | `#164450` | Marca, cabeçalho, links e títulos auxiliares |
| `brand-800` | `#103640` | Hover e áreas escuras |
| `brand-900` | `#0B2B33` | Fundo escuro e rodapé |
| `gold-500` | `#E7AA26` | Acentos, categorias e foco visual |
| `gold-600` | `#C98E12` | Texto dourado sobre fundos claros |
| `paper-50` | `#FCFAF5` | Superfície de artigos |
| `paper-100` | `#F7F3E9` | Fundo principal |
| `paper-200` | `#EEE8DC` | Superfícies secundárias |
| `ink-900` | `#20292C` | Texto principal |
| `ink-700` | `#455256` | Texto secundário |
| `ink-500` | `#667276` | Metadados |
| `line-300` | `#D9D3C7` | Bordas e divisores |
| `white` | `#FFFFFF` | Contraste e superfícies pontuais |

### 4.2 Regras de aplicação

- Usar `paper-100` no fundo geral e `paper-50` quando for necessário distinguir a área do artigo.
- Usar `ink-900` no corpo do texto; nunca dourado em parágrafos.
- Usar `gold-600`, e não `gold-500`, para pequenos textos sobre fundo claro, garantindo melhor contraste.
- Links dentro de artigos devem ser azul-petróleo, sublinhados e reconhecíveis sem depender apenas da cor.
- Não usar gradientes na interface principal.
- Não usar preto puro (`#000000`) ou branco puro como fundo dominante.

### 4.3 Tokens CSS

```css
:root {
  --color-brand-700: #164450;
  --color-brand-800: #103640;
  --color-brand-900: #0b2b33;
  --color-gold-500: #e7aa26;
  --color-gold-600: #c98e12;
  --color-paper-50: #fcfaf5;
  --color-paper-100: #f7f3e9;
  --color-paper-200: #eee8dc;
  --color-ink-900: #20292c;
  --color-ink-700: #455256;
  --color-ink-500: #667276;
  --color-line-300: #d9d3c7;
  --color-white: #fff;
}
```

---

## 5. Tipografia

### 5.1 Famílias

- **Literata:** títulos, subtítulos, resumos editoriais e corpo dos artigos.
- **Source Sans 3:** navegação, botões, categorias, datas, etiquetas e formulários.

Usar fontes variáveis quando possível. Em produção, preferir arquivos hospedados no próprio projeto em `woff2`, reduzindo dependência externa e variações de carregamento.

### 5.2 Escala tipográfica

| Papel | Desktop | Mobile | Entrelinha | Peso |
|---|---:|---:|---:|---:|
| Destaque principal | `56px` | `40px` | `1.08` | 600 |
| Título do artigo | `52px` | `36px` | `1.12` | 600 |
| Título de seção | `36px` | `30px` | `1.2` | 600 |
| Título de item | `27px` | `24px` | `1.25` | 600 |
| Subtítulo do artigo | `22px` | `20px` | `1.5` | 400 |
| Corpo do artigo | `19px` | `18px` | `1.75` | 400 |
| Corpo de interface | `16px` | `16px` | `1.5` | 400 |
| Metadado | `14px` | `14px` | `1.4` | 600 |

### 5.3 Regras editoriais

- Não justificar parágrafos.
- Limitar a coluna do artigo a aproximadamente `68ch`.
- Usar entre `0.6em` e `0.9em` entre parágrafos; não indentar a primeira linha.
- Limitar títulos a uma largura de aproximadamente `20ch`.
- Usar caixa alta apenas em categorias curtas, com espaçamento entre letras.
- Evitar mais de três pesos tipográficos em uma mesma página.
- Usar itálico com moderação para títulos de obras, termos e ênfase semântica.

### 5.4 Implementação CSS

```css
@font-face {
  font-family: "Literata";
  src: url("/fonts/literata-variable.woff2") format("woff2");
  font-style: normal;
  font-weight: 400 700;
  font-display: swap;
}

@font-face {
  font-family: "Source Sans 3";
  src: url("/fonts/source-sans-3-variable.woff2") format("woff2");
  font-style: normal;
  font-weight: 400 700;
  font-display: swap;
}

:root {
  --font-editorial: "Literata", Georgia, serif;
  --font-interface: "Source Sans 3", Arial, sans-serif;
}

body {
  font-family: var(--font-interface);
  color: var(--color-ink-900);
  background: var(--color-paper-100);
  text-rendering: optimizeLegibility;
}
```

---

## 6. Espaçamento, grade e superfícies

### 6.1 Escala de espaçamento

Usar uma base de 4 pixels, com os seguintes tokens:

```css
:root {
  --space-1: 0.25rem; /* 4px */
  --space-2: 0.5rem;  /* 8px */
  --space-3: 0.75rem; /* 12px */
  --space-4: 1rem;    /* 16px */
  --space-5: 1.5rem;  /* 24px */
  --space-6: 2rem;    /* 32px */
  --space-7: 3rem;    /* 48px */
  --space-8: 4rem;    /* 64px */
  --space-9: 6rem;    /* 96px */
}
```

### 6.2 Contêineres

| Contêiner | Largura máxima | Uso |
|---|---:|---|
| Página | `1180px` | Cabeçalho, rodapé e página inicial |
| Editorial | `880px` | Introduções e cabeçalho de artigo |
| Leitura | `720px` ou `68ch` | Corpo do artigo |
| Estreito | `560px` | Busca, formulários e mensagens |

Margem lateral mínima: `24px` no celular, `32px` em tablets e `48px` em telas grandes.

### 6.3 Bordas e profundidade

- Raio padrão: `4px`.
- Raio de campos e botões: `6px`.
- Evitar cartões com grandes raios arredondados.
- Usar divisores de `1px` em `line-300`.
- Sombras devem ser raras e reservadas a elementos temporariamente elevados, como o menu móvel.

---

## 7. Arquitetura da informação

### 7.1 Navegação principal

1. **Início**
2. **Teologia**
3. **Filosofia**
4. **Sobre**
5. **Busca**

Se surgirem séries, autores ou assuntos específicos, apresentá-los como filtros dentro das listagens, sem aumentar imediatamente o menu principal.

### 7.2 Rotas sugeridas

```text
/
/teologia
/filosofia
/artigos/:slug
/series/:slug
/busca?q=:termo
/sobre
/privacidade
/404
```

### 7.3 Modelo mínimo de conteúdo

```ts
export type Article = {
  id: string;
  slug: string;
  title: string;
  subtitle?: string;
  excerpt: string;
  category: "teologia" | "filosofia";
  tags: string[];
  publishedAt: string;
  updatedAt?: string;
  readingMinutes: number;
  cover?: {
    src: string;
    alt: string;
    caption?: string;
    credit?: string;
  };
  content: React.ReactNode;
  featured?: boolean;
};
```

---

## 8. Templates de página

### 8.1 Página inicial

Ordem recomendada:

1. cabeçalho;
2. breve apresentação editorial;
3. artigo em destaque;
4. publicações recentes;
5. acesso às duas categorias;
6. inscrição por e-mail, se adotada;
7. rodapé.

O destaque pode usar duas colunas em telas grandes: texto à esquerda e imagem à direita. Quando não houver imagem editorial relevante, usar apenas texto em uma composição ampla; não inserir imagem decorativa genérica.

### 8.2 Listagem por categoria

- nome da categoria;
- descrição de uma ou duas frases;
- lista cronológica de artigos;
- filtros por tema apenas quando existirem artigos suficientes;
- paginação tradicional ou botão “Carregar mais”.

Evitar rolagem infinita: ela dificulta orientação, retorno e acesso ao rodapé.

### 8.3 Artigo

Ordem recomendada:

1. breadcrumb discreto;
2. categoria;
3. título;
4. subtítulo opcional;
5. data e tempo de leitura;
6. imagem de capa opcional;
7. corpo;
8. referências ou notas;
9. compartilhamento;
10. próximo artigo relacionado;
11. rodapé.

### 8.4 Busca

Exibir campo de busca, quantidade de resultados e lista no mesmo padrão editorial da página inicial. O termo buscado deve ser preservado no endereço para permitir compartilhamento e navegação pelo histórico.

### 8.5 Página “Sobre”

Explicar:

- propósito do Gotas Cultas;
- natureza e extensão dos textos;
- perspectiva editorial;
- autoria;
- critérios de fontes e correções;
- forma de contato.

---

## 9. Componentes React

### 9.1 Estrutura sugerida

```text
src/
├── app/
│   ├── App.tsx
│   ├── routes.tsx
│   └── providers.tsx
├── assets/
│   ├── brand/
│   └── fonts/
├── components/
│   ├── ArticleCard/
│   ├── ArticleMeta/
│   ├── Brand/
│   ├── Button/
│   ├── Container/
│   ├── Divider/
│   ├── Footer/
│   ├── Header/
│   ├── Quote/
│   ├── SearchField/
│   └── SkipLink/
├── content/
├── layouts/
│   ├── ArticleLayout.tsx
│   └── SiteLayout.tsx
├── pages/
├── styles/
│   ├── globals.css
│   ├── reset.css
│   └── tokens.css
└── types/
```

### 9.2 Componentes essenciais

#### `Brand`

Responsável por renderizar símbolo e nome. Deve aceitar versões clara, escura, horizontal e símbolo isolado.

```tsx
type BrandProps = {
  variant?: "horizontal" | "symbol";
  tone?: "default" | "inverse";
};

export function Brand({
  variant = "horizontal",
  tone = "default",
}: BrandProps) {
  return (
    <span className={`brand brand--${variant} brand--${tone}`}>
      <img src="/brand/gotas-cultas-symbol.svg" alt="" />
      {variant === "horizontal" && <span>Gotas Cultas</span>}
    </span>
  );
}
```

Quando estiver dentro de um link para a página inicial, o texto acessível do link deve identificar “Gotas Cultas — página inicial”. O `alt` do símbolo pode ficar vazio porque o nome já comunica a marca.

#### `Container`

```tsx
type ContainerProps = React.PropsWithChildren<{
  size?: "page" | "editorial" | "reading" | "narrow";
  as?: "div" | "section" | "main";
}>;

export function Container({
  size = "page",
  as: Element = "div",
  children,
}: ContainerProps) {
  return (
    <Element className={`container container--${size}`}>
      {children}
    </Element>
  );
}
```

#### `ArticleMeta`

Centraliza categoria, data e tempo de leitura, evitando formatos diferentes entre telas.

```tsx
type ArticleMetaProps = Pick<
  Article,
  "category" | "publishedAt" | "readingMinutes"
>;

export function ArticleMeta(props: ArticleMetaProps) {
  const date = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(props.publishedAt));

  return (
    <div className="articleMeta">
      <span className="articleMeta__category">{props.category}</span>
      <span aria-hidden="true">·</span>
      <time dateTime={props.publishedAt}>{date}</time>
      <span aria-hidden="true">·</span>
      <span>{props.readingMinutes} min de leitura</span>
    </div>
  );
}
```

#### `ArticleCard`

Apesar do nome, não deve parecer um cartão elevado. É um item editorial com título, resumo e metadados, separado por espaço ou linha fina.

Variantes permitidas:

- `featured`: destaque da página inicial;
- `list`: padrão para publicações recentes;
- `compact`: artigos relacionados.

#### `Quote`

```tsx
type QuoteProps = React.PropsWithChildren<{
  source?: string;
  cite?: string;
}>;

export function Quote({ children, source, cite }: QuoteProps) {
  return (
    <figure className="quote">
      <blockquote>{children}</blockquote>
      {source && <figcaption>— {source}</figcaption>}
      {cite && <cite className="srOnly">{cite}</cite>}
    </figure>
  );
}
```

#### `Divider`

Pode usar uma pequena gota no centro, desde que o SVG seja decorativo e tenha `aria-hidden="true"`. Usar a versão ornamental apenas entre grandes seções; dentro de listas, usar linha simples.

---

## 10. Exemplo do layout de artigo

```tsx
export function ArticlePage({ article }: { article: Article }) {
  return (
    <article>
      <Container size="editorial" as="section">
        <header className="articleHeader">
          <ArticleMeta
            category={article.category}
            publishedAt={article.publishedAt}
            readingMinutes={article.readingMinutes}
          />
          <h1>{article.title}</h1>
          {article.subtitle && <p>{article.subtitle}</p>}
        </header>
      </Container>

      {article.cover && (
        <Container size="editorial">
          <figure className="articleCover">
            <img src={article.cover.src} alt={article.cover.alt} />
            {article.cover.caption && (
              <figcaption>{article.cover.caption}</figcaption>
            )}
          </figure>
        </Container>
      )}

      <Container size="reading" as="section">
        <div className="articleBody">{article.content}</div>
      </Container>
    </article>
  );
}
```

```css
.articleHeader {
  padding-block: clamp(3rem, 7vw, 6rem) clamp(2rem, 5vw, 4rem);
  text-align: center;
}

.articleHeader h1 {
  max-width: 20ch;
  margin: 1rem auto 0;
  font-family: var(--font-editorial);
  font-size: clamp(2.25rem, 5vw, 3.25rem);
  font-weight: 600;
  line-height: 1.12;
  text-wrap: balance;
}

.articleBody {
  font-family: var(--font-editorial);
  font-size: clamp(1.125rem, 1rem + 0.25vw, 1.1875rem);
  line-height: 1.75;
}

.articleBody p + p {
  margin-top: 0.85em;
}

.articleBody h2 {
  margin-block: 2.25em 0.75em;
  font-size: 1.65em;
  line-height: 1.25;
}

.articleBody a {
  color: var(--color-brand-700);
  text-decoration-thickness: 0.08em;
  text-underline-offset: 0.16em;
}
```

---

## 11. Responsividade

Projetar primeiro para telas pequenas. Os pontos de quebra devem responder ao conteúdo, não a modelos específicos de aparelhos.

```css
/* Base: mobile */

@media (min-width: 48rem) {
  /* Tablet e pequenas telas */
}

@media (min-width: 64rem) {
  /* Desktop */
}

@media (min-width: 80rem) {
  /* Telas amplas; não aumentar indefinidamente o texto */
}
```

### Comportamentos obrigatórios

- O menu principal se transforma em menu móvel abaixo de `48rem`.
- O corpo do artigo permanece em uma coluna em todos os tamanhos.
- O destaque da página inicial usa uma coluna no celular e duas no desktop, caso tenha imagem.
- Metadados podem quebrar em duas linhas sem truncamento.
- Alvos de toque devem ter pelo menos `44 × 44px`.
- Não reduzir o corpo do artigo para menos de `18px`.

---

## 12. Imagens e ilustrações

### 12.1 Direção

Priorizar:

- obras de arte e gravuras em domínio público;
- manuscritos, livros, arquitetura e arte sacra contextualizada;
- diagramas próprios;
- ilustrações abstratas coerentes com o tema.

Evitar:

- bancos de imagens corporativas;
- fotografias genéricas de pessoas lendo;
- imagens religiosas sem relação direta com o argumento;
- capas meramente decorativas em todos os artigos.

### 12.2 Implementação

- Informar `width` e `height` para evitar deslocamento de layout.
- Usar `loading="lazy"` fora da primeira dobra.
- Disponibilizar formatos modernos, preferencialmente AVIF e WebP, com fallback quando necessário.
- Escrever `alt` conforme a função da imagem. Imagens decorativas devem ter `alt=""`.
- Mostrar crédito e legenda quando relevantes.

---

## 13. Interações e movimento

- Transições entre `120ms` e `200ms`.
- Animar apenas cor, opacidade e pequenas transformações.
- Links não devem “pular” ou mover o conteúdo no hover.
- Não animar parágrafos durante a entrada na página.
- Respeitar `prefers-reduced-motion`.

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
  }
}
```

---

## 14. Acessibilidade

Meta mínima: **WCAG 2.2 nível AA**.

### Checklist obrigatório

- HTML semântico: `header`, `nav`, `main`, `article`, `section`, `aside` e `footer`.
- Um único `h1` descritivo por página.
- Hierarquia de títulos sem saltos arbitrários.
- Link “Pular para o conteúdo” como primeiro elemento focável.
- Foco de teclado visível com contorno de pelo menos `2px`.
- Contraste mínimo de `4.5:1` para texto normal.
- Menus, busca e diálogos totalmente operáveis pelo teclado.
- Campo de busca com `label`, mesmo que visualmente oculto.
- Estado atual da navegação com `aria-current="page"`.
- Mensagens de erro claras e associadas ao campo correto.
- O dourado nunca deve ser o único indicador de estado.

```css
:focus-visible {
  outline: 3px solid var(--color-gold-500);
  outline-offset: 3px;
}
```

---

## 15. SEO, compartilhamento e confiança editorial

Cada artigo deve fornecer:

- título único;
- descrição entre aproximadamente 140 e 160 caracteres;
- URL canônica;
- metadados Open Graph;
- imagem social em proporção `1200 × 630`;
- data de publicação e, quando pertinente, atualização;
- autor;
- dados estruturados do tipo `Article` ou `BlogPosting`;
- referências e créditos verificáveis.

O título exibido no artigo pode ser mais literário; o título de SEO pode acrescentar contexto, sem recorrer a sensacionalismo.

### Exemplo de título

- Página: **A realidade é aquilo que percebemos?**
- SEO: **A realidade é aquilo que percebemos? Limites dos sentidos e da percepção**

---

## 16. Tema escuro

O tema escuro é opcional e deve entrar apenas depois que a experiência clara estiver consolidada. Não inverter mecanicamente as cores.

Direção recomendada:

| Elemento | Valor aproximado |
|---|---:|
| Fundo | `#0F292F` |
| Superfície | `#14343B` |
| Texto | `#EEE9DE` |
| Texto secundário | `#B9C2C2` |
| Dourado | `#F0B83F` |
| Borda | `#345059` |

Salvar a escolha do usuário e, na primeira visita, respeitar `prefers-color-scheme`.

---

## 17. Estados de interface

Todo componente interativo deve documentar:

- padrão;
- hover;
- foco;
- pressionado;
- desabilitado;
- carregando;
- vazio;
- erro.

Na página de resultados vazios, oferecer orientação: verificar a grafia, tentar um termo mais amplo ou navegar por Teologia e Filosofia.

Skeletons devem ser usados apenas quando houver carregamento perceptível. Para conteúdo estático ou pré-renderizado, não são necessários.

---

## 18. Ordem de implementação

### Fase 1 — Fundação

1. adicionar arquivos da marca e fontes;
2. criar `reset.css`, `tokens.css` e `globals.css`;
3. implementar `Container`, `Brand`, `Header`, `Footer` e `SkipLink`;
4. configurar rotas e layout geral;
5. validar contraste, teclado e responsividade.

### Fase 2 — Conteúdo

1. implementar `ArticleMeta`, `ArticleCard` e `ArticleLayout`;
2. criar página inicial e listagens;
3. implementar corpo editorial, citações, notas e figuras;
4. construir busca e estados vazios;
5. adicionar artigos relacionados.

### Fase 3 — Publicação

1. configurar metadados e dados estruturados;
2. gerar imagens sociais;
3. otimizar fontes e imagens;
4. medir desempenho e estabilidade visual;
5. testar com leitores e corrigir dificuldades reais.

### Fase 4 — Extensões

- séries;
- inscrição por e-mail;
- tema escuro;
- índice de assuntos;
- notas de rodapé interativas;
- áudio dos artigos, se houver demanda.

---

## 19. Critérios de aceite

Uma página está visualmente pronta quando:

- corresponde aos tokens, sem cores e espaçamentos arbitrários;
- mantém hierarquia clara em desktop e celular;
- apresenta boa leitura entre `320px` e telas amplas;
- não depende de imagem para parecer completa;
- não produz rolagem horizontal;
- funciona integralmente por teclado;
- mantém o foco visível;
- preserva estabilidade durante o carregamento de fontes e imagens;
- exibe corretamente títulos longos e metadados ausentes;
- alcança contraste AA;
- não contém efeitos visuais sem função.

### Metas técnicas recomendadas

- Lighthouse Performance: `90+` em condições controladas.
- Accessibility: `100` como meta, complementada por teste manual.
- Cumulative Layout Shift: inferior a `0.1`.
- Largest Contentful Paint: inferior a `2.5s` no percentil 75.
- Interaction to Next Paint: inferior a `200ms` no percentil 75.

---

## 20. Decisões que exigem consistência

Antes de introduzir um novo padrão, perguntar:

1. Ele melhora a compreensão ou apenas decora?
2. Já existe um componente que cumpre a mesma função?
3. Funciona sem mouse e em tela pequena?
4. Mantém o texto como protagonista?
5. Poderá ser aplicado de forma consistente em todo o blog?

Se a resposta a qualquer uma dessas perguntas for negativa, o padrão deve ser revisto antes de entrar no sistema.

---

## Resumo executivo

O Gotas Cultas deve adotar uma linguagem de **publicação editorial contemporânea**: fundo de papel, texto em carvão, azul-petróleo como cor institucional e dourado usado em pequenas doses. A Literata conduz a experiência de leitura; a Source Sans 3 organiza a interface. As páginas devem ser espaçosas, silenciosas e baseadas em poucos componentes React reutilizáveis. A principal medida de sucesso visual não será a quantidade de elementos, mas a facilidade com que o leitor encontra uma reflexão, começa a lê-la e permanece atento até o fim.
