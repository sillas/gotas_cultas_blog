/**
 * Single-table design for the blog. One item type today (post metadata).
 *
 * Item shape (post):
 *   PK    = POST#<slug>            SK = METADATA
 *   GSI2PK = STATUS#<status>       GSI2SK = <publishAt-or-createdAt>#<slug> (StatusDateIndex)
 *
 * Category filtering is done with a FilterExpression on StatusDateIndex —
 * post volume for a single-author blog stays low enough that this is
 * cheaper to run than maintaining a third GSI per category.
 *
 * AdminPostsIndex (GSI1) keeps lightweight editorial lists separate from
 * full post content: drafts, scheduled posts, and one partition per
 * publication year. View metrics intentionally remain outside this index.
 */

export const TABLE_PARTITION_KEY = "PK";
export const TABLE_SORT_KEY = "SK";

export const STATUS_DATE_INDEX_NAME = "StatusDateIndex";
export const STATUS_DATE_INDEX_PARTITION_KEY = "GSI2PK";
export const STATUS_DATE_INDEX_SORT_KEY = "GSI2SK";

export const ADMIN_POSTS_INDEX_NAME = "AdminPostsIndex";
export const ADMIN_POSTS_INDEX_PARTITION_KEY = "GSI1PK";
export const ADMIN_POSTS_INDEX_SORT_KEY = "GSI1SK";

export function postKey(slug: string) {
  return { [TABLE_PARTITION_KEY]: `POST#${slug}`, [TABLE_SORT_KEY]: "METADATA" };
}

export function imageKey(id: string) {
  return { [TABLE_PARTITION_KEY]: `IMAGE#${id}`, [TABLE_SORT_KEY]: "METADATA" };
}

export function statusDateIndexKeys(status: string, publishAtOrCreatedAt: string, slug: string) {
  return {
    [STATUS_DATE_INDEX_PARTITION_KEY]: `STATUS#${status}`,
    [STATUS_DATE_INDEX_SORT_KEY]: `${publishAtOrCreatedAt}#${slug}`,
  };
}

export function adminPostIndexKeys(
  status: string,
  publishAt: string | null,
  updatedAt: string,
  slug: string,
) {
  const date = status === "draft" ? updatedAt : (publishAt ?? updatedAt);
  const partition = status === "published"
    ? `ADMIN#PUBLISHED#${date.slice(0, 4)}`
    : status === "scheduled"
      ? "ADMIN#SCHEDULED"
      : "ADMIN#DRAFT";
  return {
    [ADMIN_POSTS_INDEX_PARTITION_KEY]: partition,
    [ADMIN_POSTS_INDEX_SORT_KEY]: `${date}#${slug}`,
  };
}
