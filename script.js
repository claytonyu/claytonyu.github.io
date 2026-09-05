/* =========================================================
   Shared JavaScript
   Handles project detail pop-up windows (modals).
   ========================================================= */

const modal = document.querySelector("#project-modal");

if (modal) {
  const modalTitle = modal.querySelector("#modal-title");
  const modalDescription = modal.querySelector("#modal-description");
  const modalLink = modal.querySelector("#modal-link");
  const closeButton = modal.querySelector(".modal-close");
  let lastFocusedElement = null;

  document.querySelectorAll("[data-project-open]").forEach((button) => {
    button.addEventListener("click", () => {
      const card = button.closest(".project-card");
      lastFocusedElement = button;

      modalTitle.textContent = card.dataset.title;
      modalDescription.textContent = card.dataset.description;

      const externalUrl = card.dataset.url;
      if (externalUrl && externalUrl !== "#") {
        modalLink.href = externalUrl;
        modalLink.hidden = false;
      } else {
        modalLink.hidden = true;
      }

      modal.hidden = false;
      document.body.classList.add("modal-open");
      closeButton.focus();
    });
  });

  function closeModal() {
    modal.hidden = true;
    document.body.classList.remove("modal-open");
    if (lastFocusedElement) lastFocusedElement.focus();
  }

  closeButton.addEventListener("click", closeModal);

  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeModal();
  });

  document.addEventListener("keydown", (event) => {
    if (!modal.hidden && event.key === "Escape") closeModal();
  });
}
