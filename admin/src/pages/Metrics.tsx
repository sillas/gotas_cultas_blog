import { useEffect, useState } from "react";
import type { MetricsSummary } from "@blog/shared";
import { api } from "../lib/api";

export function Metrics() {
  const [metrics, setMetrics] = useState<MetricsSummary | null>(null);

  useEffect(() => {
    api.getMetrics().then(setMetrics);
  }, []);

  if (!metrics) return <p>Carregando métricas...</p>;

  return (
    <div>
      <h1>Métricas</h1>
      <p>
        Total de views: <strong>{metrics.totalViews}</strong> · Total de posts:{" "}
        <strong>{metrics.totalPosts}</strong>
      </p>

      <h2>Mais visualizados</h2>
      <ol>
        {metrics.postsByViews.map((post) => (
          <li key={post.slug}>
            {post.title} — {post.viewCount} views
          </li>
        ))}
      </ol>
    </div>
  );
}
