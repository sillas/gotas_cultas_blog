export type PostStatus = "draft" | "scheduled" | "published";

export interface Post {
  slug: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  coverImageKey: string | null;
  contentMarkdown: string;
  status: PostStatus;
  /** ISO 8601 in UTC. Required when status is "scheduled" or "published". */
  publishAt: string | null;
  createdAt: string;
  updatedAt: string;
  viewCount: number;
}

/** Fields the admin can set when creating/editing a post. Server fills the rest. */
export type PostInput = Pick<
  Post,
  "slug" | "title" | "description" | "category" | "tags" | "coverImageKey" | "contentMarkdown" | "status" | "publishAt"
>;

export interface MetricsSummary {
  totalViews: number;
  totalPosts: number;
  postsByViews: Array<{ slug: string; title: string; viewCount: number }>;
}

export interface PresignedUpload {
  uploadUrl: string;
  objectKey: string;
  publicUrl: string;
}
