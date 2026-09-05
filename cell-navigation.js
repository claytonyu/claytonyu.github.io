/* =========================================================
   Interactive Cell Navigation
   ---------------------------------------------------------
   This file intentionally knows very little about the SVG.

   CONNECTION RULE:
   - A card declares:       data-cell-anchor="nucleus"
   - SVG marker declares:  data-cell-anchor-marker="nucleus"
   - SVG organelle group:  data-cell-source="nucleus"

   Matching names are connected automatically.

   EASY EDIT:
   To make the About card point to a mitochondrion instead,
   change only this in index.html:
       data-cell-anchor="nucleus"
   to:
       data-cell-anchor="mitochondrion"
   ========================================================= */

(() => {
  const section = document.querySelector("[data-cell-navigation]");
  if (!section) return;

  const overlay = section.querySelector("[data-cell-leader-overlay]");
  const cards = [...section.querySelectorAll("[data-cell-anchor]")];
  const svgNamespace = "http://www.w3.org/2000/svg";
  const mobileQuery = window.matchMedia("(max-width: 850px)");

  let animationFrame = null;

  /* ---------- Small selector helper ---------- */
  function selectorSafe(value) {
    // CSS.escape is supported in modern browsers. This fallback keeps
    // simple anchor names usable in older ones.
    if (window.CSS && CSS.escape) return CSS.escape(value);
    return value.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
  }

  /* ---------- Find the SVG pieces for one anchor name ---------- */
  function getMarker(anchorName) {
    return section.querySelector(
      `[data-cell-anchor-marker="${selectorSafe(anchorName)}"]`
    );
  }

  function getSource(anchorName) {
    return section.querySelector(
      `[data-cell-source="${selectorSafe(anchorName)}"]`
    );
  }

  /* ---------- Draw all desktop dogleg leader lines ---------- */
  function drawLeaders() {
    animationFrame = null;
    overlay.replaceChildren();

    // On mobile, the diagram stacks above the cards. Long side-to-side
    // leaders would add clutter, so CSS supplies a simpler card marker.
    if (mobileQuery.matches) return;

    const overlayRect = overlay.getBoundingClientRect();
    const width = overlayRect.width;
    const height = overlayRect.height;

    overlay.setAttribute("viewBox", `0 0 ${width} ${height}`);
    overlay.setAttribute("width", width);
    overlay.setAttribute("height", height);

    cards.forEach((card) => {
      const anchorName = card.dataset.cellAnchor;
      const marker = getMarker(anchorName);
      if (!marker) return;

      const markerRect = marker.getBoundingClientRect();
      const cardRect = card.getBoundingClientRect();

      const startX = markerRect.left + markerRect.width / 2 - overlayRect.left;
      const startY = markerRect.top + markerRect.height / 2 - overlayRect.top;
      const endX = cardRect.left - overlayRect.left;
      const endY = cardRect.top + cardRect.height / 2 - overlayRect.top;

      /*
         Dogleg geometry:

         organelle ●────╲
                        ╲________________ card

         The first short section deliberately leaves the organelle
         at an angle. The long second section resolves toward the
         card, and a short horizontal tail meets the card edge.
      */
      const direction = endY >= startY ? 1 : -1;
      const firstLegX = startX + 38;
      const firstLegY = startY + 18 * direction;
      const finalLegX = Math.max(firstLegX + 32, endX - 38);

      const path = document.createElementNS(svgNamespace, "path");
      path.setAttribute(
        "d",
        `M ${startX} ${startY} L ${firstLegX} ${firstLegY} L ${finalLegX} ${endY} L ${endX} ${endY}`
      );
      path.classList.add("cell-leader-line");
      path.dataset.cellLeader = anchorName;
      overlay.appendChild(path);

      const startDot = document.createElementNS(svgNamespace, "circle");
      startDot.setAttribute("cx", startX);
      startDot.setAttribute("cy", startY);
      startDot.setAttribute("r", "6");
      startDot.classList.add("cell-leader-dot");
      startDot.dataset.cellLeader = anchorName;
      overlay.appendChild(startDot);
    });
  }

  function scheduleDraw() {
    if (animationFrame !== null) cancelAnimationFrame(animationFrame);
    animationFrame = requestAnimationFrame(drawLeaders);
  }

  /* ---------- Shared hover/focus state ---------- */
  function setActive(anchorName, isActive) {
    const card = cards.find((item) => item.dataset.cellAnchor === anchorName);
    const source = getSource(anchorName);
    const linePieces = section.querySelectorAll(
      `[data-cell-leader="${selectorSafe(anchorName)}"]`
    );

    card?.classList.toggle("is-active", isActive);
    source?.classList.toggle("is-active", isActive);
    linePieces.forEach((piece) => piece.classList.toggle("is-active", isActive));
  }

  /* ---------- Wire each card to its matching organelle ---------- */
  cards.forEach((card) => {
    const anchorName = card.dataset.cellAnchor;
    const source = getSource(anchorName);

    card.addEventListener("mouseenter", () => setActive(anchorName, true));
    card.addEventListener("mouseleave", () => setActive(anchorName, false));
    card.addEventListener("focusin", () => setActive(anchorName, true));
    card.addEventListener("focusout", () => setActive(anchorName, false));

    if (!source) return;

    // Make only organelles that are currently mapped to cards interactive.
    // Decorative/unmapped organelles remain ordinary SVG artwork.
    source.setAttribute("tabindex", "0");
    source.setAttribute("role", "link");
    source.setAttribute(
      "aria-label",
      `${card.querySelector("h3")?.textContent || "Open page"}`
    );
    source.classList.add("is-linked");

    source.addEventListener("mouseenter", () => setActive(anchorName, true));
    source.addEventListener("mouseleave", () => setActive(anchorName, false));
    source.addEventListener("focusin", () => setActive(anchorName, true));
    source.addEventListener("focusout", () => setActive(anchorName, false));
    source.addEventListener("click", () => card.click());
    source.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        card.click();
      }
    });
  });

  /* ---------- Keep lines attached while the layout changes ---------- */
  window.addEventListener("resize", scheduleDraw);
  mobileQuery.addEventListener?.("change", scheduleDraw);

  if ("ResizeObserver" in window) {
    const resizeObserver = new ResizeObserver(scheduleDraw);
    resizeObserver.observe(section);
    cards.forEach((card) => resizeObserver.observe(card));
  }

  // Fonts/layout can settle after DOMContentLoaded, so draw once now
  // and once after the full page load.
  scheduleDraw();
  window.addEventListener("load", scheduleDraw, { once: true });
})();
