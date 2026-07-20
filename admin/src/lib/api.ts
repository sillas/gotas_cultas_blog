import type { AdminPostList, AdminPostListStatus, CoverImage, MetricsSummary, Post, PostInput, PostUpdateInput, PresignedUpload } from "@blog/shared";
import { config } from "./config";
import { getAccessToken } from "./auth";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAccessToken();
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

function isPost(value: unknown): value is Post {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<Post>;
  return typeof candidate.slug === "string"
    && candidate.slug.length > 0
    && typeof candidate.title === "string"
    && ["draft", "scheduled", "published"].includes(candidate.status ?? "");
}

export const api = {
  listPosts: async (status: AdminPostListStatus, year?: number) => {
    const query = new URLSearchParams({ status });
    if (status === "published" && year) query.set("year", String(year));
    const result = await request<AdminPostList>(`/posts?${query}`);
    return { ...result, items: result.items.filter(isPost) };
  },
  getPost: (slug: string) => request<Post>(`/posts/${encodeURIComponent(slug)}`),
  createPost: (input: PostInput) => request<Post>("/posts", { method: "POST", body: JSON.stringify(input) }),
  updatePost: (slug: string, input: PostUpdateInput) =>
    request<Post>(`/posts/${encodeURIComponent(slug)}`, { method: "PUT", body: JSON.stringify(input) }),
  deletePost: (slug: string) => request<void>(`/posts/${encodeURIComponent(slug)}`, { method: "DELETE" }),
  getMetrics: () => request<MetricsSummary>("/metrics"),
  presignUpload: (fileName: string, contentType: string) =>
    request<PresignedUpload>("/uploads/presign", {
      method: "POST",
      body: JSON.stringify({ fileName, contentType }),
    }),
  getUploadState: (id: string) => request<CoverImage>(`/uploads/${encodeURIComponent(id)}`),
};
