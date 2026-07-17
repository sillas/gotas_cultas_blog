import { useEffect, useState } from "react";
import type { MetricsSummary } from "@blog/shared";
import { api } from "../lib/api";

export function Metrics() {
  const [metrics, setMetrics] = useState<MetricsSummary | null>(null);

  useEffect(() => {
    api.getMetrics().then(setMetrics);
  }, []);

  if (!metrics) return <p className="loading-state" role="status">Carregando métricas…</p>;

  return (
    <div className="page-stack">
      <header className="page-header"><div><p className="eyebrow">Desempenho</p><h1>Métricas</h1><p>Uma visão direta do alcance das publicações.</p></div></header>
      <div className="metric-grid">
        <article className="metric-card"><span>Visualizações</span><strong>{metrics.totalViews.toLocaleString("pt-BR")}</strong></article>
        <article className="metric-card"><span>Publicações</span><strong>{metrics.totalPosts.toLocaleString("pt-BR")}</strong></article>
      </div>

      <section className="panel"><h2>Mais visualizados</h2>
      {metrics.postsByViews.length === 0 && <p className="muted">Ainda não há dados de visualização.</p>}
      <ol className="ranking-list">
        {metrics.postsByViews.map((post) => (
          <li key={post.slug}>
            <span>{post.title}</span><strong>{post.viewCount.toLocaleString("pt-BR")}</strong>
          </li>
        ))}
      </ol></section>
    </div>
  );
}
