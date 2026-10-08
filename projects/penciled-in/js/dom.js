// Tiny DOM helper. Text is always set through text nodes / textContent,
// never innerHTML, so user-provided strings can't inject markup.

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  let deferredValue;
  if (props) {
    for (const [key, val] of Object.entries(props)) {
      if (val === undefined || val === null) continue;
      if (key.startsWith('aria-')) {
        el.setAttribute(key, String(val));
        continue;
      }
      if (val === false) continue;
      if (key === 'class') el.className = val;
      else if (key === 'text') el.textContent = val;
      else if (key === 'dataset') for (const [k, v] of Object.entries(val)) el.dataset[k] = v;
      else if (key === 'style') for (const [k, v] of Object.entries(val)) el.style.setProperty(k, v);
      else if (key.startsWith('on') && typeof val === 'function') el.addEventListener(key.slice(2), val);
      else if (key === 'for') el.htmlFor = val;
      else if (key === 'role' || key === 'tabindex') el.setAttribute(key, val);
      else if (key === 'value') deferredValue = val; // set after <option> children exist
      else if (key in el) el[key] = val;
      else el.setAttribute(key, val === true ? '' : val);
    }
  }
  append(el, children);
  if (deferredValue !== undefined) el.value = deferredValue;
  return el;
}

export function append(parent, children) {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    if (Array.isArray(child)) append(parent, child);
    else if (child instanceof Node) parent.appendChild(child);
    else parent.appendChild(document.createTextNode(String(child)));
  }
  return parent;
}

export function clear(el) {
  el.replaceChildren();
  return el;
}

// A label + control (+ optional hint) row used by all forms.
export function field(id, labelText, control, hint) {
  control.id = id;
  const hintId = hint ? `${id}-hint` : null;
  if (hintId) control.setAttribute('aria-describedby', hintId);
  return h(
    'div',
    { class: 'field' },
    h('label', { for: id, text: labelText }),
    control,
    hint ? h('p', { class: 'hint', id: hintId, text: hint }) : null,
  );
}
