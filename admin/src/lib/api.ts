import type { MetricsSummary, Post, PostInput, PresignedUpload } from "@blog/shared";
import { config } from "./config";
import { getIdToken } from "./auth";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getIdToken();
  const response = await fetch(`${config.apiBaseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`${init?.method ?? "GET"} ${path} failed: ${response.status}`);
  }

  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

export const api = {
  listPosts: () => request<Post[]>("/posts"),
  getPost: (slug: string) => request<Post>(`/posts/${encodeURIComponent(slug)}`),
  createPost: (input: PostInput) => request<Post>("/posts", { method: "POST", body: JSON.stringify(input) }),
  updatePost: (slug: string, input: PostInput) =>
    request<Post>(`/posts/${encodeURIComponent(slug)}`, { method: "PUT", body: JSON.stringify(input) }),
  deletePost: (slug: string) => request<void>(`/posts/${encodeURIComponent(slug)}`, { method: "DELETE" }),
  getMetrics: () => request<MetricsSummary>("/metrics"),
  presignUpload: (fileName: string, contentType: string) =>
    request<PresignedUpload>("/uploads/presign", {
      method: "POST",
      body: JSON.stringify({ fileName, contentType }),
    }),
};
