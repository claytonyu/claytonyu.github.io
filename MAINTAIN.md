# Clayton Yu — Personal Website

A professional personal website serving as both a **STEM tutoring platform** and
**academic portfolio** — hosted on GitHub Pages.

---

## Table of Contents

1. [Folder Structure](#folder-structure)
2. [Quick-Start Checklist](#quick-start-checklist)
3. [GitHub Pages Deployment](#github-pages-deployment)
4. [Custom Domain Setup](#custom-domain-setup)
5. [How to Edit Content](#how-to-edit-content)
   - [Name & Contact Info](#name--contact-info)
   - [Adding a Headshot](#adding-a-headshot)
   - [Editing Portfolio Entries](#editing-portfolio-entries)
   - [Adding Subjects](#adding-subjects)
   - [Adding Testimonials](#adding-testimonials)
   - [Adding / Expanding FAQ](#adding--expanding-faq)
   - [Updating the Resume PDF](#updating-the-resume-pdf)
6. [Formspree Setup (Inquiry Form)](#formspree-setup-inquiry-form)
7. [Adding a New Page](#adding-a-new-page)
8. [Swapping the Color Scheme](#swapping-the-color-scheme)
9. [Form Handling Options (Comparison)](#form-handling-options-comparison)
10. [Future Enhancement Ideas](#future-enhancement-ideas)

---

## Folder Structure

```
/
├── index.html          ← Home page
├── portfolio.html      ← Portfolio / Résumé page
├── tutoring.html       ← Tutoring page (subjects, FAQ, inquiry form)
├── README.md           ← This file
│
├── css/
│   └── styles.css      ← All styles; color variables at the top
│
├── js/
│   └── main.js         ← Nav, FAQ accordion, scroll-reveal, form submit
│
└── assets/
    ├── images/
    │   └── headshot.jpg        ← Add your photo here (see instructions)
    ├── documents/
    │   └── resume.pdf          ← Add your résumé PDF here
    └── icons/
        └── favicon.ico         ← Add a favicon here
```

---

## Quick-Start Checklist

Replace every instance of a placeholder before going live:

| Placeholder              | Replace With                            | Files                          |
|--------------------------|-----------------------------------------|--------------------------------|
| `Clayton Yu`              | Your full name                          | All HTML files, README         |
| `YOUR_EMAIL@example.com` | Your email address                      | portfolio.html, tutoring.html  |
| `YOUR_GITHUB_USERNAME`   | Your GitHub username                    | All HTML `og:url` meta tags    |
| `YOUR_GITHUB`            | Your GitHub username (for the link)     | tutoring.html                  |
| `YOUR_LINKEDIN`          | Your LinkedIn username/path             | tutoring.html                  |
| `YOUR_FORMSPREE_ID`      | Your Formspree form ID                  | tutoring.html                  |
| `[YOUR AREA]`            | Your city or region                     | tutoring.html                  |
| `[Edit Your Hours]`      | Your actual availability                | tutoring.html                  |
| All `[BRACKETED]` items  | Your real content                       | All HTML files                 |

---

## GitHub Pages Deployment

### First-Time Setup

1. **Create a GitHub repository**
   - Go to github.com → New repository
   - Name it: `YOUR_GITHUB_USERNAME.github.io`
   - This exact name makes it your root GitHub Pages site
   - Set to Public; do NOT initialize with a README

2. **Upload your files**
   ```bash
   git init
   git add .
   git commit -m "Initial website"
   git branch -M main
   git remote add origin https://github.com/YOUR_GITHUB_USERNAME/YOUR_GITHUB_USERNAME.github.io.git
   git push -u origin main
   ```

3. **Enable GitHub Pages**
   - Go to your repo → Settings → Pages
   - Under "Source": select `Deploy from a branch`
   - Branch: `main`, folder: `/ (root)`
   - Click Save

4. **Access your site**
   - Your site is live at: `https://YOUR_GITHUB_USERNAME.github.io`
   - It may take 1–3 minutes to appear after first deploy

### Updating the Site

Every time you make changes:
```bash
git add .
git commit -m "Describe what you changed"
git push
```
GitHub Pages rebuilds automatically — changes appear within ~60 seconds.

---

## Custom Domain Setup

### Step 1 — Buy a Domain
Purchase from any registrar: Namecheap, Google Domains, Cloudflare Registrar, etc.
Example: `yourname.com`

### Step 2 — Configure DNS at your registrar
Add these DNS records (exact interface varies by registrar):

**A records** (point the root domain to GitHub's IPs):
```
Type: A    Name: @    Value: 185.199.108.153
Type: A    Name: @    Value: 185.199.109.153
Type: A    Name: @    Value: 185.199.110.153
Type: A    Name: @    Value: 185.199.111.153
```

**CNAME record** (point `www` to your GitHub Pages URL):
```
Type: CNAME    Name: www    Value: YOUR_GITHUB_USERNAME.github.io
```

### Step 3 — Add a CNAME file to your repo
Create a file named `CNAME` (no extension) in the root of your project:
```
yourname.com
```
Commit and push it.

### Step 4 — Set custom domain in GitHub Pages settings
- Repo → Settings → Pages → Custom domain
- Enter `yourname.com` and click Save
- Check "Enforce HTTPS" (available after DNS propagates, usually 24–48 hours)

### Step 5 — Update og:url meta tags
In all three HTML files, update the `og:url` meta tag to your new domain:
```html
<meta property="og:url" content="https://yourname.com/" />
```

---

## How to Edit Content

### Name & Contact Info

All HTML files use `Clayton Yu` as a placeholder.

**Find & Replace** (most code editors: Ctrl+H or Cmd+H):
- Find: `Clayton Yu`
- Replace: `Your Actual Name`

Do the same for email, GitHub, LinkedIn, and Formspree ID.

---

### Adding a Headshot

1. Save your photo as `assets/images/headshot.jpg`
   - Recommended size: 400×400 px, square, JPG or WebP
   - Keep file size under 200KB for fast loading

2. In `index.html`, find the `headshot-placeholder` div and replace it with:
   ```html
   <img src="assets/images/headshot.jpg"
        alt="Clayton Yu headshot"
        class="headshot-img"
        width="280" height="280" />
   ```

3. Add this CSS to the bottom of `css/styles.css`:
   ```css
   .headshot-img {
     width: 280px;
     height: 280px;
     border-radius: 50%;
     object-fit: cover;
     box-shadow: var(--shadow-lg);
     border: 3px solid var(--color-border);
   }
   ```

---

### Editing Portfolio Entries

Each entry in `portfolio.html` looks like:
```html
<div class="entry">
  <div>
    <div class="entry-title">Position / Degree Title</div>
    <div class="entry-subtitle">Organization</div>
    <div class="entry-desc">
      <ul>
        <li>Bullet point here</li>
      </ul>
    </div>
  </div>
  <div class="entry-date">Date Range</div>
</div>
```

To **add** an entry: copy the block above, paste it inside the appropriate
`resume-section`, and fill in your details.

---

### Adding Subjects

In `tutoring.html`, find the relevant `subject-category` block. To add a subject:
```html
<li>New Subject Name</li>
```

To add a whole new category, copy a complete `subject-category` div block:
```html
<div class="subject-category reveal">
  <h3><span class="icon">🔭</span> New Category</h3>
  <ul class="subject-list">
    <li>Subject One</li>
    <li>Subject Two</li>
  </ul>
</div>
```

The same subject should also be added as an `<option>` inside the
`#subject` select in the inquiry form (further down in tutoring.html).

---

### Adding Testimonials

In `tutoring.html`, find the `#testimonials` section. When you have real
testimonials:

1. Delete the `testimonial-placeholder-note` div.
2. Replace it with:
   ```html
   <div class="testimonial-grid">
     <div class="testimonial-card reveal">
       <blockquote>
         Write the student's or parent's quote here.
       </blockquote>
       <div class="testimonial-attribution">
         Parent of High School Student
         <span>Subject, Grade Level</span>
       </div>
     </div>
     <!-- Add more testimonial-card divs here -->
   </div>
   ```

---

### Adding / Expanding FAQ

In `tutoring.html`, find the `faq-list` div. Copy and paste this block:
```html
<div class="faq-item">
  <button class="faq-question" aria-expanded="false">
    Your question here?
    <span class="faq-icon" aria-hidden="true">+</span>
  </button>
  <div class="faq-answer" role="region">
    <div class="faq-answer-inner">
      Your answer here.
    </div>
  </div>
</div>
```

The accordion behavior is handled automatically by `js/main.js`.

---

### Updating the Resume PDF

1. Export your résumé as `resume.pdf`
2. Place it at: `assets/documents/resume.pdf`
3. The download button in `portfolio.html` already links to this path
4. Update the "Last updated" date in portfolio.html
5. Commit and push — GitHub Pages serves the new file automatically

---

## Formspree Setup (Inquiry Form)

**Why Formspree?** Free tier, no backend needed, works perfectly with GitHub Pages,
email notifications included, spam filtering built in.

1. Go to [formspree.io](https://formspree.io) → Create a free account
2. Click **New Form** → name it "Tutoring Inquiry"
3. Copy your form endpoint — looks like `https://formspree.io/f/xpzgkwrb`
4. In `tutoring.html`, find this line:
   ```html
   action="https://formspree.io/f/YOUR_FORMSPREE_ID"
   ```
   Replace `YOUR_FORMSPREE_ID` with your actual ID (e.g., `xpzgkwrb`)
5. Verify your email in Formspree to activate the form
6. Test by submitting the form — you should receive an email

**Free tier limits:** 50 submissions/month. Upgrade at ~$8/month for unlimited.

---

## Adding a New Page

Example: adding a `research.html` page.

### Step 1 — Create the HTML file

Copy `portfolio.html` as a starting point:
```
research.html
```

Change the `<title>`, `meta description`, and `page-hero` content.
Replace the main content sections with your research content.

### Step 2 — Add to navigation (in ALL HTML files)

In `index.html`, `portfolio.html`, `tutoring.html`, AND `research.html`,
find both nav sections and add:
```html
<!-- Desktop nav -->
<li><a href="research.html">Research</a></li>

<!-- Mobile nav -->
<a href="research.html">Research</a>

<!-- Footer nav -->
<a href="research.html">Research</a>
```

### Step 3 — Commit and push
```bash
git add .
git commit -m "Add research page"
git push
```

---

## Swapping the Color Scheme

All colors are defined as CSS variables in the `:root` block at the top of
`css/styles.css`. To change the entire color scheme, edit only those variables —
everything else updates automatically.

### Alternative schemes ready to paste:

**Academic Professional (navy)**
```css
--color-bg:           #F7F9FC;
--color-bg-alt:       #EEF2F8;
--color-surface:      #FFFFFF;
--color-border:       #D0DAE8;
--color-text:         #1A2233;
--color-text-muted:   #5A6B82;
--color-primary:      #1A2F5A;
--color-accent:       #2563EB;
--color-accent-hover: #1D4ED8;
--color-accent-light: #DBEAFE;
--color-link:         #2563EB;
--color-link-hover:   #1D4ED8;
```

**Modern Minimalist (black + teal)**
```css
--color-bg:           #FAFAFA;
--color-bg-alt:       #F2F2F2;
--color-surface:      #FFFFFF;
--color-border:       #E0E0E0;
--color-text:         #111111;
--color-text-muted:   #555555;
--color-primary:      #111111;
--color-accent:       #0D9488;
--color-accent-hover: #0F766E;
--color-accent-light: #CCFBF1;
--color-link:         #0D9488;
--color-link-hover:   #0F766E;
```

---

## Form Handling Options (Comparison)

| Option              | Pros                                          | Cons                                      | Recommendation |
|---------------------|-----------------------------------------------|-------------------------------------------|----------------|
| **Formspree**       | Zero backend, free tier, email alerts, spam filter, easy setup | 50 subs/mo free | ✅ **Recommended** |
| **Netlify Forms**   | Native integration if hosting on Netlify      | Requires migrating from GitHub Pages      | Only if you switch hosts |
| **EmailJS**         | Client-side only, no backend, generous free tier | Exposes service IDs in client JS, more setup | Good alternative |
| **Google Forms**    | Zero setup, unlimited submissions             | Iframe embed looks out-of-place, no styling control | Last resort |

**Recommendation:** Start with Formspree. If you exceed 50 submissions/month
(a great problem to have!), upgrade their plan or switch to EmailJS.

---

## Future Enhancement Ideas

- **`research.html`** — dedicated page for publications, posters, lab work
- **`blog/`** — markdown-based posts (or integrate with a static site generator)
- **`resources.html`** — study guides, practice problem links, recommended tools
- **`testimonials.html`** — dedicated page once you have several testimonials
- **Dark mode toggle** — add a JS toggle + CSS `[data-theme="dark"]` variables
- **Favicon** — generate one at favicon.io and place in `assets/icons/`
- **Google Analytics** — add tracking snippet before `</head>` for visitor data
- **Calendly embed** — replace the form with a Calendly booking widget for scheduling
- **Open Graph image** — create a 1200×630 social preview image at `assets/images/og-preview.png`
- **PWA support** — add a `manifest.json` and service worker for offline support
