const category = document.getElementById("category-filter");
const date = document.getElementById("date-filter");
const posts = Array.from(document.querySelectorAll(".post-item"));
function applyFilters() {
  const selected = category?.value ?? "";
  const minimum = date?.value ? new Date(date.value) : null;
  for (const post of posts) {
    const published = post.dataset.publishAt ? new Date(post.dataset.publishAt) : null;
    post.hidden = !((!selected || post.dataset.category === selected) && (!minimum || (published && published >= minimum)));
  }
}
category?.addEventListener("change", applyFilters);
date?.addEventListener("change", applyFilters);
