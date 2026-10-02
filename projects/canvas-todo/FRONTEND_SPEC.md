# SPEC: Canvas-Integrated To-Do List App — Frontend

Companion to [SPEC.md](SPEC.md) and [BACKEND_IMPLEMENTATION.md](BACKEND_IMPLEMENTATION.md). This covers only the frontend: plain HTML/CSS/JS, hosted on GitHub Pages, calling the Render backend.

## Overview
This app is a to-do app, allowing the user to create tasks with deadlines. One of its largest features is its integration with Canvas. Communicating with a backend 

## Architecture
- Hosting: GitHub Pages
- Stack: HTML, CSS, vanilla JS (no framework/build step\).
- Backend base URL: https://one5113-hw4-backend.onrender.com

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
  - This should only appear after user has logged out, cookie/PAT token has expired, or the first time a user enters.
- Task list (This is the main view)
  - Allow the user to view their courses and tasks, and click them to edit/view in more detail. See more in below sections.
- Task detail / edit
  - When a task is clicked, a sidebar on the right should appear. This is not a separate page.
- Canvas import (course/assignment picker)
  - List of courses should appear
    - Allow the user to tick a checkbox to ignore/reveal a course again.
    - New courses should pop to the top and be highlighted blue to draw attention, but allow the user to not take action.
  - List tasks underneath each course
    - All previously chosen/ignored assignments should be hidden by default (maybe through a UI like the Mac folders), but give a checkbox.
    - New courses should be highlighted blue. Once decided, they should be hidden with the rest.
  - Allow for searching course or assignment by name.
- User Settings
  - Display user name & information from Canvas
  - Buttons for (give a description to the user what each will do):
    - logging out
    - Disconnecting Canvas
    - Deleting account

## Session & Auth Handling
Above all, make sure user data is never leaked and is safely handled by the front-end.
- Store the session token in browser cookies.
- On 401 and 403, redirect to the login page, with proper parameters.

## Task List & Editing UI
Layout of Task List Page:
- Tasks should be either present in a continuous list format (not organized by classes) or lists of assignments bunched under their respective course. Create a visual dummy course for tasks that are not assignments.
- Allow the user to change their view in a top bar:
    - To switch between the list format and the bunched lists.
    - To sort by: time due, etc.
    - To show/hide completed tasks
- Allow the user to search for tasks/courses.
- Allow the user to delete and create tasks.
- Completing a task: UI reflects the server's response for repeating tasks (due date moves forward, not deleted).
- Bulk actions needed in UI (multi-select delete) if shift is held.
Task Editing:
- If a Canvas task, show relevant information (as described in the other companion md files), including a link to the Canvas assignment.
- If not a Canvas task, show the same relevant information as above (unless not applicable). Allow the user to edit the task.
- Visual distinction for Canvas-imported tasks (`html_url` present) vs manual tasks, and which fields are read-only for imported tasks (BACKEND_IMPLEMENTATION.md: re-sync only touches `due_at`/`course_id`).
- Create/edit form fields and validation (title required, recurrence requires `due_at`, etc.).

## Canvas Import UI
- Sync should be triggered upon page load, and have a manual button. Expect `POST /canvas/sync` to be slow (cold starts up to ~1 min), and display that somehow.
  - This button should be on both the Task List and Canvas Import page.
- Pending courses picker → `PATCH /canvas/courses`.
- Pending assignments picker (only after courses are kept) → `PATCH /canvas/assignments`.
- Un-ignoring previously ignored courses/assignments from settings.
- Loading/empty states for each step.

## Data Fetching & State Management
- How API calls are structured (fetch wrapper, central API module, etc.).
- Client-side caching/refetching strategy (refetch after every mutation vs optimistic update).
- Shape of in-memory app state and how views stay in sync with it.

## Error Handling & Loading States
- Mapping of backend error shapes/status codes (`400`, `401`, `403 canvas_token_required`, `404`, `502`) to user-facing messages, per BACKEND_IMPLEMENTATION.md section 5.
- Global vs per-form error display conventions.
- Loading indicators, especially for cold start on first request (`GET /health` ping on load?).

## Styling / Design
- Visual style, color palette, layout approach (consistent with rest of claytonyu.github.io, or standalone?).
- Responsive/mobile support: required or not.
- Accessibility requirements (keyboard nav, ARIA, contrast).

## Security Considerations (Frontend)
- Session token never written to `localStorage` or logs.
- PAT is sent once and never stored or persisted in the DOM/state longer than needed.
- Any input sanitization needed for rendering task titles/descriptions (XSS).

## Deployment & Config
- File/folder layout within `projects/canvas-todo/`.
- How the backend URL and any other config differ between local testing and the deployed GitHub Pages site.
- CORS dependency: the deployed frontend origin must match the backend's `FRONTEND_URL`.
