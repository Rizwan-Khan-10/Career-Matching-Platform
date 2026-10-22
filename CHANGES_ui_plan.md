# UI plan: what changed (apps/web only)

No new npm packages. pnpm-lock.yaml and package.json are NOT in this zip. Nothing to install.
Verified: `tsc --noEmit` clean, `eslint` 0 errors, `next build` passes (29 routes).
Not verified: I could not open the app in a browser. Click through each page at 375 px and 1280 px.

Not done (left on purpose): dark mode (needs a second token set and a fix for the dark auth panel), activity chart
(needs a backend endpoint), print styles, keyboard shortcuts, row highlight on status change.
Delete by hand (a zip cannot delete): apps/web/public/{file,globe,next,vercel,window}.svg

Notes
- "Almost eligible" is derived from match.reason starting with "Possible match" (the API does not send the verdict).
- The progress path has 4 steps: the target role is picked during upload in this app, so it is part of step 1.
- Page titles: dashboards set document.title in DashboardShell; auth pages use a small layout.tsx with metadata.
  Check the tab title once after navigating; if Next resets it, tell me.
- Page fade is in app/(admin|company|applicant)/template.tsx (not app/template.tsx) so the sidebar does not re-fade.
