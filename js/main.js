/* ==========================================================================
   main.js — Shared JavaScript for all pages
   ==========================================================================
   Sections:
   1. Navigation — scroll shrink effect + mobile hamburger
   2. Active nav link highlight (based on current page)
   3. FAQ accordion
   4. Scroll-reveal animations
   5. Form handling (Formspree)
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {

  /* -------------------------------------------------------------------------
     1. NAVIGATION — Scroll shrink + mobile toggle
  ------------------------------------------------------------------------- */
  const nav        = document.getElementById('main-nav');
  const navToggle  = document.getElementById('nav-toggle');
  const navMobile  = document.getElementById('nav-mobile');

  // Shrink nav on scroll
  if (nav) {
    window.addEventListener('scroll', () => {
      if (window.scrollY > 60) {
        nav.classList.add('scrolled');
      } else {
        nav.classList.remove('scrolled');
      }
    }, { passive: true });
  }

  // Mobile hamburger toggle
  if (navToggle && navMobile) {
    navToggle.addEventListener('click', () => {
      const isOpen = navToggle.classList.toggle('open');
      navMobile.classList.toggle('open', isOpen);
      navToggle.setAttribute('aria-expanded', isOpen);
      navMobile.setAttribute('aria-hidden', !isOpen);
    });

    // Close mobile menu when a link is tapped
    navMobile.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        navToggle.classList.remove('open');
        navMobile.classList.remove('open');
        navToggle.setAttribute('aria-expanded', false);
        navMobile.setAttribute('aria-hidden', true);
      });
    });
  }

  /* -------------------------------------------------------------------------
     2. ACTIVE NAV LINK — highlights the link matching the current page
  ------------------------------------------------------------------------- */
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';

  document.querySelectorAll('.nav-links a, .nav-mobile a').forEach(link => {
    const href = link.getAttribute('href');
    if (
      href === currentPage ||
      (currentPage === '' && href === 'index.html') ||
      (currentPage === 'index.html' && href === 'index.html')
    ) {
      link.classList.add('active');
    }
  });

  /* -------------------------------------------------------------------------
     3. FAQ ACCORDION
  ------------------------------------------------------------------------- */
  document.querySelectorAll('.faq-item').forEach(item => {
    const question = item.querySelector('.faq-question');
    const answer   = item.querySelector('.faq-answer');

    if (!question || !answer) return;

    question.addEventListener('click', () => {
      const isOpen = item.classList.contains('open');

      // Close all other items
      document.querySelectorAll('.faq-item.open').forEach(openItem => {
        if (openItem !== item) {
          openItem.classList.remove('open');
          openItem.querySelector('.faq-question').setAttribute('aria-expanded', false);
        }
      });

      // Toggle current
      item.classList.toggle('open', !isOpen);
      question.setAttribute('aria-expanded', !isOpen);
    });
  });

  /* -------------------------------------------------------------------------
     4. SCROLL-REVEAL — fade-in elements as they enter the viewport
  ------------------------------------------------------------------------- */
  const revealElements = document.querySelectorAll('.reveal');

  if (revealElements.length > 0) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry, index) => {
        if (entry.isIntersecting) {
          // Stagger delay based on element order within its parent
          const siblings = Array.from(entry.target.parentElement?.children ?? []);
          const siblingsWithReveal = siblings.filter(el => el.classList.contains('reveal'));
          const siblingIndex = siblingsWithReveal.indexOf(entry.target);
          const delay = siblingIndex >= 0 ? siblingIndex * 80 : 0;

          setTimeout(() => {
            entry.target.classList.add('visible');
          }, delay);

          observer.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.12,
      rootMargin: '0px 0px -40px 0px'
    });

    revealElements.forEach(el => observer.observe(el));
  }

  /* -------------------------------------------------------------------------
     5. FORMSPREE FORM HANDLING
     HOW TO USE:
     1. Create a free account at https://formspree.io
     2. Create a new form and copy your form ID (looks like: xpzgkwrb)
     3. Replace YOUR_FORMSPREE_ID in tutoring.html with your actual ID
     The form action attribute handles submission; this JS just manages
     the success/error UI states.
  ------------------------------------------------------------------------- */
  const inquiryForm    = document.getElementById('inquiry-form');
  const formSuccess    = document.getElementById('form-success');
  const formSubmitBtn  = document.getElementById('form-submit-btn');

  if (inquiryForm) {
    inquiryForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      // Show loading state
      if (formSubmitBtn) {
        formSubmitBtn.disabled = true;
        formSubmitBtn.textContent = 'Sending…';
      }

      try {
        const response = await fetch(inquiryForm.action, {
          method: 'POST',
          body: new FormData(inquiryForm),
          headers: { 'Accept': 'application/json' }
        });

        if (response.ok) {
          // Show success message, hide form
          inquiryForm.style.display = 'none';
          if (formSuccess) formSuccess.style.display = 'block';
        } else {
          const data = await response.json();
          const errMsg = data?.errors?.map(e => e.message).join(', ')
            ?? 'Something went wrong. Please try emailing directly.';
          alert(errMsg);

          if (formSubmitBtn) {
            formSubmitBtn.disabled = false;
            formSubmitBtn.textContent = 'Send Inquiry';
          }
        }
      } catch (err) {
        alert('Network error — please check your connection and try again, or email directly.');
        if (formSubmitBtn) {
          formSubmitBtn.disabled = false;
          formSubmitBtn.textContent = 'Send Inquiry';
        }
      }
    });
  }

}); // end DOMContentLoaded
