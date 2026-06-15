## Verification Plan

Confirm the homepage renders correctly from a production build (not just the dev preview).

### Steps

1. **Build the app** — run `npm --prefix app run build` and confirm it exits 0 with no errors/warnings about `Home.tsx` or `Home.css`.
2. **Serve the production bundle** — run `npm --prefix app run preview` (or `npx vite preview`) on a local port.
3. **Smoke-test `/` via Playwright** (headless Chromium against the preview port):
   - Navigate to `http://localhost:<preview-port>/`
   - Assert HTTP 200 and no console errors
   - Assert hero copy "Turn Local Data Into Paying Customers" is visible
   - Assert all 3 feature cards render (Location Intelligence, Lead Scorer AI, Smart Outreach)
   - Assert nav bar and search input are present
   - Capture a full-viewport screenshot at 1280×1800 for visual confirmation
4. **Check the built HTML** — inspect `app/dist/index.html` to confirm the Home chunk is referenced and CSS is included.
5. **Report results** — share screenshot + any console/network errors. If anything fails, diagnose (missing asset, route misconfig, CSS not bundled) before fixing.

### Out of scope
No code changes unless step 3 or 4 surfaces a real defect.
