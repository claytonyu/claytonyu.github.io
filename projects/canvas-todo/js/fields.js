// Labeled form controls with accessible hint and error text.
import { el } from "./dom.js";

export function field({ label, control, hint }) {
  const hintId = `${control.id}-hint`;
  const errorId = `${control.id}-error`;
  control.setAttribute("aria-describedby", [hint && hintId, errorId].filter(Boolean).join(" "));
  return el("div", { className: "field" }, [
    el("label", { className: "field__label", htmlFor: control.id }, label),
    control,
    hint && el("p", { id: hintId, className: "field__hint" }, hint),
    el("p", { id: errorId, className: "field__error" }),
  ]);
}

export function setFieldError(control, message) {
  document.getElementById(`${control.id}-error`).textContent = message ?? "";
  if (message) control.setAttribute("aria-invalid", "true");
  else control.removeAttribute("aria-invalid");
}

// options: [[value, label], ...]
export function selectControl({ id, options, value, onChange }) {
  return el("select", { id, className: "input", onchange: onChange && ((event) => onChange(event.target.value)) },
    options.map(([optionValue, label]) => el("option", { value: optionValue, selected: optionValue === value }, label)));
}

export function selectField({ id, label, options, value, onChange }) {
  return el("div", { className: "inline-field" }, [
    el("label", { htmlFor: id }, label),
    selectControl({ id, options, value, onChange }),
  ]);
}
