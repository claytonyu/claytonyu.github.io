// Toasts for transient confirmations, banners for persistent states.
import { el } from "./dom.js";

const TOAST_MS = 4500;
const toastRegion = document.getElementById("toasts");
const bannerRegion = document.getElementById("banners");

export function toast(message, kind = "info") {
  const item = el("div", { className: `toast toast--${kind}` }, message);
  toastRegion.append(item);
  setTimeout(() => item.remove(), TOAST_MS);
}

// Banners are keyed by id, so the same state never shows twice. Info banners are progress
// notices removed by their owner; warnings and errors stay until acted on or dismissed.
export function showBanner(id, message, { kind = "info", action } = {}) {
  hideBanner(id);
  bannerRegion.append(el("div", {
    className: `banner banner--${kind}`,
    dataset: { bannerId: id },
    role: kind === "error" ? "alert" : "status",
  }, [
    el("span", { className: "banner__message" }, message),
    action && el("button", { type: "button", className: "button button--small", onclick: action.onClick }, action.label),
    kind !== "info" && el("button", {
      type: "button",
      className: "icon-button banner__dismiss",
      "aria-label": "Dismiss",
      onclick: () => hideBanner(id),
    }, "×"),
  ]));
}

export function hideBanner(id) {
  bannerRegion.querySelector(`[data-banner-id="${id}"]`)?.remove();
}

export function clearBanners() {
  bannerRegion.replaceChildren();
}
