/**
 * Monetization gate (ADSENSE_READINESS_AND_RECOMMENDATIONS.md, "Alterações
 * que podem ser feitas agora" #2). Google/AdSense code, hosts and the cookie
 * consent banner must stay out of the HTML entirely unless this is "true" —
 * not just visually hidden. Flip it in the deploy environment (GitHub
 * Actions "vars.PUBLIC_ADSENSE_ENABLED") only after the blockers in that
 * document are resolved.
 */
export const ADSENSE_ENABLED = import.meta.env.PUBLIC_ADSENSE_ENABLED === "true";
