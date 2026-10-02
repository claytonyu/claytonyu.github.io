// Shared search: one matching rule and one input component, used by the Task List
// (tasks/courses) and Canvas Import (courses/assignments).
import { el } from "./dom.js";

export function matchesQuery(text, query) {
  const needle = query.trim().toLowerCase();
  return needle === "" || (text ?? "").toLowerCase().includes(needle);
}

export function createSearchInput({ id, label, value = "", onSearch }) {
  return el("div", { className: "search" }, [
    el("label", { htmlFor: id, className: "visually-hidden" }, label),
    el("input", {
      id,
      type: "search",
      className: "input search__input",
      placeholder: label,
      value,
      autocomplete: "off",
      oninput: (event) => onSearch(event.target.value),
    }),
  ]);
}
