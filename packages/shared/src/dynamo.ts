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
 * ViewsIndex (GSI1) keys are defined below but NOT provisioned on the table
 * (see infra/lib/data-stack.ts) and NOT written by the views Lambda today:
 * keeping GSI1SK's embedded viewCount in sync would need a second write per
 * view (read-modify-write isn't atomic in one UpdateCommand). The metrics
 * Lambda uses a plain Scan instead, which is simpler and cheap enough at
 * this post volume. Wire this GSI in if the catalog ever grows large enough
 * that a Scan becomes the bottleneck.
 */

export const TABLE_PARTITION_KEY = "PK";
export const TABLE_SORT_KEY = "SK";

export const VIEWS_INDEX_NAME = "ViewsIndex";
export const VIEWS_INDEX_PARTITION_KEY = "GSI1PK";
export const VIEWS_INDEX_SORT_KEY = "GSI1SK";

export const STATUS_DATE_INDEX_NAME = "StatusDateIndex";
export const STATUS_DATE_INDEX_PARTITION_KEY = "GSI2PK";
export const STATUS_DATE_INDEX_SORT_KEY = "GSI2SK";

export function postKey(slug: string) {
  return { [TABLE_PARTITION_KEY]: `POST#${slug}`, [TABLE_SORT_KEY]: "METADATA" };
}

export function imageKey(id: string) {
  return { [TABLE_PARTITION_KEY]: `IMAGE#${id}`, [TABLE_SORT_KEY]: "METADATA" };
}

/** Zero-pads so lexicographic string sort matches numeric sort, up to 999,999,999,999 views. */
export function padViewCount(viewCount: number): string {
  return String(Math.max(0, Math.trunc(viewCount))).padStart(12, "0");
}

export function viewsIndexKeys(viewCount: number, slug: string) {
  return {
    [VIEWS_INDEX_PARTITION_KEY]: "POST",
    [VIEWS_INDEX_SORT_KEY]: `${padViewCount(viewCount)}#${slug}`,
  };
}

export function statusDateIndexKeys(status: string, publishAtOrCreatedAt: string, slug: string) {
  return {
    [STATUS_DATE_INDEX_PARTITION_KEY]: `STATUS#${status}`,
    [STATUS_DATE_INDEX_SORT_KEY]: `${publishAtOrCreatedAt}#${slug}`,
  };
}
