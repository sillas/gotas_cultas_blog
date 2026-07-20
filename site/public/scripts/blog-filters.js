const category = document.getElementById("category-filter");
const date = document.getElementById("date-filter");
const posts = Array.from(document.querySelectorAll(".post-item"));
const status = document.getElementById("filter-status");
function applyFilters() {
  const selected = category?.value ?? "";
  const minimum = date?.value ? new Date(date.value) : null;
  let visibleCount = 0;
  for (const post of posts) {
    const published = post.dataset.publishAt ? new Date(post.dataset.publishAt) : null;
    post.hidden = !((!selected || post.dataset.category === selected) && (!minimum || (published && published >= minimum)));
    if (!post.hidden) visibleCount += 1;
  }
  if (status) {
    status.textContent = visibleCount === 0
      ? "Nenhuma publicação corresponde aos filtros."
      : visibleCount === 1
        ? "1 publicação encontrada."
        : `${visibleCount} publicações encontradas.`;
  }
}
category?.addEventListener("change", applyFilters);
date?.addEventListener("change", applyFilters);
