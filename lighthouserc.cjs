// Core Web Vitals baseline (ADSENSE_READINESS_AND_RECOMMENDATIONS.md #8):
// collect Lighthouse numbers on every CI run, before any ad slot is ever
// enabled, so a later "did AdSense hurt CLS/LCP?" comparison has something
// to compare against. No `assert` block on purpose — this is a baseline
// capture, not a quality gate; ci.yml also runs this step with
// `continue-on-error: true` so a flaky Lighthouse/Chrome run never blocks a
// deploy. CI builds the site with no real post content (see ci.yml comment
// on "Build public site"), so this only covers the site shell — run
// Lighthouse locally against a real build for post-page numbers.
module.exports = {
  ci: {
    collect: {
      staticDistDir: "./site/dist",
      url: ["/index.html", "/sobre/index.html", "/privacidade/index.html"],
      numberOfRuns: 1,
      settings: {
        chromeFlags: "--no-sandbox --disable-gpu",
      },
    },
    upload: {
      target: "filesystem",
      outputDir: "./lighthouse-ci-report",
    },
  },
};
