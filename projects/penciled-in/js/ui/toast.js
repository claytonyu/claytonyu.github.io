// A brief message announced to screen readers (role=status) and shown near the bottom.
let timer = null;

export function showToast(text, ms = 5000) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(timer);
  timer = setTimeout(() => {
    el.classList.remove('show');
    el.textContent = '';
  }, ms);
}
