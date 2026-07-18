export type PostStatus = "draft" | "scheduled" | "published";

export interface PostAuthor {
  /** Stable Cognito subject. Null only for legacy/imported content. */
  id: string | null;
  /** Editorial snapshot kept with the post even if the display name changes later. */
  name: string;
}

export type CoverImageStatus = "processing" | "ready" | "failed";
export type ImageFormat = "avif" | "webp";

export interface ImageVariant {
  format: ImageFormat;
  width: number;
  height: number;
  url: string;
}

export interface CoverImage {
  id: string;
  status: CoverImageStatus;
  width: number | null;
  height: number | null;
  aspectRatio: number | null;
  variants: ImageVariant[];
  error?: string;
}

export interface Post {
  slug: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  author: PostAuthor;
  coverImageKey: string | null;
  /** New responsive cover contract. Optional while legacy posts are migrated. */
  coverImage?: CoverImage | null;
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

/** Update contract used for optimistic concurrency. */
export type PostUpdateInput = PostInput & { expectedUpdatedAt: string };

export interface MetricsSummary {
  totalViews: number;
  totalPosts: number;
  postsByViews: Array<{ slug: string; title: string; viewCount: number }>;
}

export interface PresignedUpload {
  uploadUrl: string;
  fields: Record<string, string>;
  image: CoverImage;
}
