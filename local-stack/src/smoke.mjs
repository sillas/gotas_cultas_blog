const base = process.env.LOCAL_BASE_URL ?? "http://localhost:8080";
const checks = [["/", 200], ["/post/bem-vindo/", 200], ["/admin/login", 200], ["/api/health", 200]];

for (const [path, expected] of checks) {
  const response = await fetch(`${base}${path}`);
  if (response.status !== expected) throw new Error(`${path}: expected ${expected}, received ${response.status}`);
  console.log(`OK ${response.status} ${path}`);
}

const posts = await fetch(`${base}/api/posts`, { headers: { Authorization: "Bearer local-dev-token" } });
if (!posts.ok || !(await posts.json()).some((post) => post.slug === "bem-vindo")) {
  throw new Error("Seeded post was not available through the local API");
}
console.log("OK local API authentication and seed data");
