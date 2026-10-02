// Small DOM builder. String children become text nodes (never parsed as HTML),
// so user-provided titles and descriptions can't inject markup.
export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    setProp(node, key, value);
  }
  node.append(...[children].flat(Infinity).filter(isRenderable));
  return node;
}

function isRenderable(child) {
  return child !== null && child !== undefined && child !== false;
}

function setProp(node, key, value) {
  if (value === undefined || value === null || value === false) return;
  if (key === "dataset") Object.assign(node.dataset, value);
  else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
  else if (key in node) node[key] = value;
  else node.setAttribute(key, value === true ? "" : String(value));
}

// Only https links are rendered, so a malformed html_url can't become a javascript: link.
export function isHttpsUrl(value) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

// Focus keys let a view re-render a list and put focus back on "the same" control.
export function focusKeyOf(element) {
  return element?.dataset?.focusKey ?? null;
}

// Falls back to the view heading if the keyed control no longer exists (e.g. its row was deleted).
// Never scrolls: restoring focus after a re-render shouldn't move the page under the user.
export function restoreFocus(key) {
  if (!key) return;
  const target = document.querySelector(`[data-focus-key="${CSS.escape(key)}"]`);
  if (target) target.focus({ preventScroll: true });
  else focusViewHeading();
}

export function focusViewHeading() {
  document.querySelector("#view h1")?.focus({ preventScroll: true });
}
