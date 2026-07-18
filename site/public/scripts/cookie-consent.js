const storageKey = "cookie-consent";
const banner = document.getElementById("cookie-consent");
const acceptButton = document.getElementById("cookie-consent-accept");
if (localStorage.getItem(storageKey) === "granted") document.dispatchEvent(new CustomEvent("consent-granted"));
else if (banner) banner.hidden = false;
acceptButton?.addEventListener("click", () => {
  localStorage.setItem(storageKey, "granted");
  if (banner) banner.hidden = true;
  document.dispatchEvent(new CustomEvent("consent-granted"));
});
