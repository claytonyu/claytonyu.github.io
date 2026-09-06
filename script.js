/* =========================================================
   Shared JavaScript
   Handles project detail pop-up windows (modals).
   ========================================================= */

const modal = document.querySelector("#project-modal");

if (modal) {
  const modalTitle = modal.querySelector("#modal-title");
  const modalDescription = modal.querySelector("#modal-description");
  const modalLink = modal.querySelector("#modal-link");
  const modalImage = modal.querySelector("#modal-image");
  const closeButton = modal.querySelector(".modal-close");

  function openProject(card) {
    modalTitle.textContent = card.dataset.title;
    modalDescription.textContent = card.dataset.description;

    // Reuse the preview image already inside the project card.
    // This keeps the card and modal image in sync automatically.
    const cardImage = card.querySelector(".project-card-image img");
    if (cardImage) {
      modalImage.src = cardImage.src;
      modalImage.alt = cardImage.alt;
      modalImage.parentElement.hidden = false;
    } else {
      modalImage.removeAttribute("src");
      modalImage.alt = "";
      modalImage.parentElement.hidden = true;
    }

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
  }

  document.querySelectorAll("[data-project-open]").forEach((card) => {
    card.addEventListener("click", () => openProject(card));

    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openProject(card);
      }
    });
  });

  function closeModal() {
    modal.hidden = true;
    document.body.classList.remove("modal-open");
  }

  closeButton.addEventListener("click", closeModal);

  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeModal();
  });

  document.addEventListener("keydown", (event) => {
    if (!modal.hidden && event.key === "Escape") closeModal();
  });
}
