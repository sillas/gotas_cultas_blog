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

      <section className="period-section">
        <h2>Tendência</h2>
        <p className="muted">
          Leituras qualificadas por período, comparadas com o intervalo imediatamente anterior de mesma
          duração. Dados diários existem apenas a partir de 22/07/2026; dias anteriores aparecem como ausentes,
          não como zero.
        </p>
        <div className="period-grid">
          {metrics.periods.map((period) => (
            <article className="period-card" key={period.days}>
              <header>
                <span>Últimos {period.days} dias</span>
                <strong>{period.qualifiedViews.toLocaleString("pt-BR")}</strong>
              </header>
              <p className={period.changeRatio !== null && period.changeRatio < 0 ? "period-change period-change-down" : "period-change"}>
                {period.changeRatio === null
                  ? `Sem período anterior para comparar (0 leituras)`
                  : `${period.changeRatio >= 0 ? "▲" : "▼"} ${Math.abs(Math.round(period.changeRatio * 100))}% vs. período anterior (${period.previousQualifiedViews.toLocaleString("pt-BR")})`}
              </p>
              {period.topPosts.length > 0 && (
                <ol className="ranking-list period-top-posts">
                  {period.topPosts.map((post) => (
                    <li key={post.slug}>
                      <span>{post.title}</span><strong>{post.qualifiedViews.toLocaleString("pt-BR")}</strong>
                    </li>
                  ))}
                </ol>
              )}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
