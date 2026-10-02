// Hash routes like "#/tasks" or "#/login?reason=expired".
export function currentRoute() {
  const [path, query = ""] = location.hash.replace(/^#\/?/, "").split("?");
  return { name: path || "tasks", params: new URLSearchParams(query) };
}

export function navigate(name, params = {}) {
  const query = new URLSearchParams(params).toString();
  const hash = `#/${name}${query ? `?${query}` : ""}`;
  if (location.hash === hash) window.dispatchEvent(new HashChangeEvent("hashchange"));
  else location.hash = hash;
}
