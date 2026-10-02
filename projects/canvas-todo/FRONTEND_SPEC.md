# SPEC: Canvas-Integrated To-Do List App — Frontend

Companion to [SPEC.md](SPEC.md) and [BACKEND_IMPLEMENTATION.md](BACKEND_IMPLEMENTATION.md). This covers only the frontend: plain HTML/CSS/JS, hosted on GitHub Pages, calling the Render backend.

## Overview
This app is a to-do app, allowing the user to create tasks with deadlines. One of its largest features is its integration with Canvas. The frontend is a static site with no backend of its own — it communicates with the existing Flask API (see BACKEND_IMPLEMENTATION.md) over `fetch` for all auth, task, and Canvas-sync operations.

## Architecture
- Hosting: GitHub Pages
- Stack: HTML, CSS, vanilla JS (no framework/build step\).
- Backend base URL: a single config constant in `api.js` (or a dedicated `config.js`), derived automatically from `location.hostname` rather than hand-toggled:
  ```js
  const BACKEND_URL = (location.hostname === "localhost" || location.hostname === "127.0.0.1")
    ? "http://localhost:8080"
    : "https://one5113-hw4-backend.onrender.com";
  ```
  Local testing (`python app.py`, port 8080 per BACKEND_IMPLEMENTATION.md section 9) hits a local backend/local Postgres; the deployed site always hits production. No manual swap to forget before pushing. All API calls read from this constant rather than hardcoding the URL per call site.

## Coding Style
You are a senior software architect. Strictly adhere to these principles:
1. KISS (Keep It Simple, Stupid): Write straightforward, uncomplicated logic. Avoid premature optimizations or speculative "what-if" abstractions.
2. YAGNI (You Aren't Gonna Need It): Do not add extra features, utility methods, or error-handling blocks for scenarios that cannot physically happen in this scope.
3. SOLID: Ensure conceptual single responsibility per class/function.
4. Reduce cognitive complexity (aim for low cyclomatic complexity).
Follow common convention for HTML and JS. Make sure you are writing safe and understandable code at all times possible.

## Pages / Views
- Login
  - Point the user to https://canvas.cmu.edu/profile/settings#access_tokens_holder to generate a PAT token, and allow them to paste it in here.
  - Depending on the situation, ask the user to generate a NEW token or paste their old one in (if you need to split these pages, it's ok).
  - This should only appear after user has logged out, the session token has expired/is invalid, or the first time a user enters.
- Task list (This is the main view)
  - Allow the user to view their courses and tasks, and click them to edit/view in more detail. See more in below sections.
- Task detail / edit
  - When a task is clicked, a sidebar on the right should appear. This is not a separate page.
  - The sidebar sits beside the list, which narrows to make room. It doesn't overlay the page, gray it out or block clicks, so the rest of the app stays usable while it's open. On narrow screens it takes the full width, still without a backdrop.
  - Opening another task (or a new one) while the sidebar has unsaved changes asks "Discard changes?" first; with no changes it switches straight away.
- Canvas import
  - This page should allow the user to see new assignments to sync and show/ignore courses and assignments.
- User Settings
  - Display user name & information from Canvas
  - Buttons for (give a description to the user what each will do):
    - logging out
    - Disconnecting Canvas
    - Deleting account

## Session & Auth Handling
Above all, make sure user data is never leaked and is safely handled by the front-end.
- Decided: bearer tokens, stored in `sessionStorage`. Matches the backend's design (no cookies used; `Authorization: Bearer <session_token>` on every request) and clears when the tab closes, trading a little convenience for less XSS exposure than `localStorage`.
- Never `localStorage` for the session token.
- Attach it as `Authorization: Bearer <token>` on every request via the central API module (see Data Fetching section).
- On `401`: the session is gone or invalid.
  - If this happened in response to a request the user actively triggered while mid-edit (e.g. saving a task in the sidebar), show a warning first ("your session has expired, your changes couldn't be saved") instead of redirecting out from under them silently.
  - Otherwise, clear local state and redirect to Login.
- On `403` with `"error": "canvas_token_required"`: the session is still valid, only the PAT is bad/expired. Do **not** log the user out — show a "reconnect Canvas" prompt (likely the Login page's PAT form, but keeping the user's existing session) and resubmit to `POST /auth/token`.
- Decided: the redirect carries `?reason=expired|logged_out|disconnected|deleted`, and Login shows a message for each (plus a first-visit message when there's no reason).
- **Session expiry warning:** `POST /auth/token` returns `expires_at`. Track it client-side (e.g. alongside the token in `sessionStorage`) and, when the session is nearing `expires_at`, show a modal warning the user their session is about to end, with the approximate remaining time. Decided: warn once at 5 minutes remaining; check on page load, every 30 seconds via `setInterval`, and when the tab becomes visible again. Once `expires_at` passes, the session ends as if it got a `401`.

## Error Handling & Loading States
- Centralize response handling in the API module (see Data Fetching) so every call path gets consistent error behavior instead of each view re-implementing status checks.
- Map backend error shapes to UI treatment:
  - `400` — show `error` message inline on the form that submitted (field-level if the message maps to a known field, otherwise a general banner).
  - `401` — handled globally per Session & Auth Handling above (redirect to Login).
  - `403 canvas_token_required` — handled globally; prompt for a new PAT without discarding the session.
  - `404` — the item is gone or not the user's. Refresh the relevant list and show a brief "no longer available" notice rather than a hard error.
  - `502` — Canvas is unreachable. Show a retryable error, distinct from `400`, since the fix is "try again," not "fix your input."
- Loading states needed: initial page load (cold start, see Canvas Import UI), task list fetch, any mutation in flight (disable the submit button to avoid double-submits on bulk endpoints).
- Decided: both, floating in one stack at the bottom center of the screen, layered over the page so nothing shifts. Toasts for transient confirmations (task saved). Banners for ongoing states: progress banners (sync in progress, server waking up) disappear on their own; warnings that need action (Canvas unreachable with Retry, Canvas token needed) stay until acted on or dismissed.

## Task List & Editing UI
Layout of Task List Page:
- Tasks should be either present in a continuous list format (not organized by classes) or lists of assignments bunched under their respective course. Create a visual dummy course for tasks that are not assignments (maps to `course_id=none`).
- In bunched view, the dummy course is sortable/orderable the same as real courses, not pinned to a fixed position — it participates in whatever course ordering the user picks (see sort options below).
- Allow the user to change their view in a top bar:
    - To switch between the list format and the bunched lists.
    - To sort by: time due, etc. (and, in bunched view, course order — e.g. alphabetical, or by soonest due task in the course).
    - To show/hide completed tasks
- Allow the user to search for tasks/courses. Build this as one shared search component/function (matches by name/title substring) reused by the Canvas Import search below, just pointed at a different data set (tasks/courses here, pending Canvas items there).
- At the top of every task list — including when it's empty — show a "+ New Task" button that opens the task creation form (in the same sidebar used for editing).
  - In bunched view, each course's list (including the dummy course) also has its own "+ New task" button, which opens the form with that course pre-filled.
- When there are no tasks, show an empty state pointing to the Canvas Import page (with the number of new Canvas items waiting, if any).
- Allow the user to delete and create tasks.
- Completing a task: UI reflects the server's response for repeating tasks (due date moves forward, not deleted).
- Bulk actions in UI if shift is held: multi-select, then delete, mark done, or mark not done (shown when any selected task is completed). Repeating tasks marked done roll forward as usual.
Task Editing:
- If a Canvas task, show relevant information (as described in the other companion md files), including a link to the Canvas assignment.
- If not a Canvas task, show the same relevant information as above (unless not applicable). Allow the user to edit the task.
- Visual distinction for Canvas-imported tasks (`html_url` present) vs manual tasks, and which fields are read-only for imported tasks (BACKEND_IMPLEMENTATION.md: re-sync only touches `due_at`/`course_id`).
- Create/edit form fields and validation (title required, recurrence requires `due_at`, etc.).

## Canvas Import UI
- Sync should be triggered upon page load, and have a manual button. Expect `POST /canvas/sync` to be slow (cold starts up to ~1 min), and display that with a floating progress notice (see Error Handling & Loading States).
  - This button should be on both the Task List and Canvas Import page.
- List of courses should appear
  - Allow the user to tick a checkbox to ignore/reveal a course again.
  - New courses should pop to the top and be highlighted yellow to draw attention, but allow the user to not take action.
- List tasks underneath each course
  - All previously chosen/ignored assignments are collapsed by default in a per-course expand/collapse section (like Mac folders). Expanded, each has a checkbox to keep/ignore it, with normal (not highlighted) styling.
  - New assignments should be highlighted yellow. Once decided, they move into the collapsed section with the rest.
- Never scroll the page on the user's behalf (after a keep/ignore decision, or when assignments finish loading). A decided course may move out of the "new" group.
- Allow for searching course or assignment by name. Same search implementation as the Task List search (see Task List & Editing UI), scoped to pending Canvas courses/assignments instead of tasks.
- Loading/empty states for each step.
- **Sync only when needed:** changing pages triggers `POST /canvas/sync` only if a sync is needed: the session just started (sign-in, reconnect, or app opened), or the last sync failed. Keeping a course syncs right away, since that's the only way its assignments get fetched. Otherwise sync runs only from the manual button. Keeping a course/assignment immediately updates in-memory state (shared app-state module) so the Task List reflects it without a manual refresh.

## Data Fetching & State Management
There should be a central API module or wrapper to modularize code (e.g. `api.js`): one function per endpoint, each handling the `Authorization` header, JSON parsing, and routing errors through the shared error handling above. Views call these functions and never call `fetch` directly.
- State needed in memory: current user, task list (plus active filter/sort/search), pending courses/assignments from the last sync.
- Refetch-after-mutation vs optimistic update: given the bulk-only, all-or-nothing API (BACKEND_IMPLEMENTATION.md section 2), the simplest correct approach is to use the server's response from each mutation to patch local state directly (`POST/PATCH /tasks` already return the updated `[Task]`), rather than refetching the whole list or guessing the result optimistically. This also matters for repeating tasks, where the server computes the new `due_at`.
- Decided: one small app-state module (`js/state.js`). Mutations call `emit()`, and the active view's `update()` re-renders from state.
- Decided: the task list filters and sorts client-side on every render, so local edits are placed correctly without refetching.

## Styling / Design
Aesthetic should be clean but is standalone from the rest of claytonyu.github.io (own stylesheet, not a shared `styles.css`, similar to how `crossy-road/` is self-contained).
- Visual style: red accent color, dashboard-like layout (persistent nav/sidebar, data-dense list views, clear sections for courses/tasks), kept clean and minimalist — avoid heavy shadows/gradients/decoration, favor whitespace and typographic hierarchy over ornamentation.
  - Palette (shades of these are allowed): `#fff4ec` cream background, `#2e294e` navy text/nav, `#7698b3` steel blue secondary (borders, fills; darkened for text), `#cba328` gold for the "new item" highlight, `#c00d1f` red reserved for accents (primary actions, active nav item, due/overdue indicators) rather than large fill areas, so the dashboard stays legible and the red doesn't read as an error state everywhere.
  - Yellow is reserved for the "new item" highlight in Canvas Import, so it doesn't collide visually with the red accent/overdue treatment in the task list.
- Accessibility requirements: keyboard nav for the task sidebar (non-modal, so no focus trap: focus moves into it on open, Escape closes it, focus returns to the task on close) and the session-expiry modal (focus trapped), ARIA roles for the sidebar (`dialog`), the expiry modal (`alertdialog`), and course-ignore checkboxes, sufficient contrast for the yellow "new item" highlight against both its background and normal rows, and sufficient contrast for red accents against the background (plain red-on-white text can fail WCAG AA at small sizes, so prefer red for borders/icons/backgrounds-with-dark-text over red body text).
- Decided: one `styles.css` for now; split it if it grows unwieldy.

## Security Considerations (Frontend)
- Session token never written to `localStorage` or logs.
- PAT is sent once (`POST /auth/token`), kept only in the login form's input value, and never written into app state, `sessionStorage`, or any persisted store after that call resolves.
- Render task titles/descriptions as text content (`textContent`, not `innerHTML`) to avoid XSS, since both can contain arbitrary user input.
- Only follow `html_url` / Canvas links via normal anchor navigation (`target="_blank" rel="noreferrer"`); never fetch or embed Canvas content directly from the frontend.

## Deployment & Config
- File layout within `projects/canvas-todo/`: static HTML/CSS/JS files alongside the existing `SPEC.md`, `BACKEND_IMPLEMENTATION.md`, `FRONTEND_SPEC.md` — no separate build output since there's no build step.
- Backend base URL switches automatically between local and production based on `location.hostname` (see Architecture above). Local dev needs the Flask backend running locally (`python app.py`, port 8080) with its own local `.env`/Postgres — local testing never touches the production database.
- CORS is backend-enforced via `FRONTEND_URL`; the deployed origin (`https://<username>.github.io`) must exactly match what's configured on Render, or every request will fail at the browser level with no useful error from the backend's side. For local frontend testing, the local backend's `FRONTEND_URL` must likewise allow the local origin (e.g. `http://localhost:5500` or whatever serves the static files).

## Open Issues
- Browser support: the last two versions of Chrome, Firefox, Safari and Edge. No offline support.
