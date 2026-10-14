# Kaypee v2

A local HTML/CSS/JavaScript onboarding demo for a new Listing teammate. It starts with a four-step setup, then opens a five-day learning path, workbook-based Knowledge Hub, floating DeepSeek chat, and SOP Navigator with three demo workflows.

## Run

Node.js 26 or later is required. Install dependencies for Cloudflare commands.

```sh
npm install
cp .env.example .env
# Add DEEPSEEK_API_KEY to .env
npm start
```

Open <http://127.0.0.1:4173>. Run `npm test` for API and citation checks.

Google sign-in requires a Google Web OAuth client ID in `GOOGLE_CLIENT_ID` and `http://127.0.0.1:4173` in that client's authorized JavaScript origins. Without it, use the clearly labeled demo profile to preview all four steps. Google sign-in verifies identity only; the tool choices in step 4 are browser-stored demo preferences and do not access Gmail, Drive, Calendar, Jira, Confluence or chat. Those services need separate OAuth consent and integrations. Setup state uses `kaypee-onboarding-v1`; **Edit setup** reopens it from the app.

The server binds to loopback and never serves `.env`. DeepSeek receives the question, recent Kaypee v2 conversation and at most four relevant sources total, including up to three related local notes. It does not receive the whole workbook or raw slide OCR. Citation IDs are checked against the supplied context before display. If DeepSeek returns plain text instead of JSON, only valid bracketed source IDs become citations; an uncited response remains explicitly uncited. The default model is `deepseek-flash`.

## What is in the app

- **Home / My learning:** One shared 0–5 progress count. A day completes after its source is marked read and its quick check is correct. The next day unlocks immediately. Continue resumes the current learning day or last SOP plan. Each completed day gets a source-based recap and editable reflection. Preparing a check-in creates an agenda and a Google Calendar event draft with the proposed time; the user adds attendees and saves it in Calendar. A daily log lets the user return to earlier check-ins. Kaypee records only user-marked booking and recap status, never a verified Calendar booking or manager approval.
- **Knowledge Hub:** Search checked excerpts, 54 original workbook cells, 26 embedded slides and local notes. Slide OCR is searchable but is labelled for visual verification and is not sent to AI as source text. Add/edit notes and links locally; related note excerpts can be AI context.
- **Kaypee mini:** Floating chat on desktop and a bottom sheet on mobile. Hub Ask, checked-source Ask and mini share one conversation. The source viewer offers a contextual Ask action; workbook images open in an enlarged, keyboard-accessible viewer.
- **SOP Navigator:** Feature launch, issue investigation and data analysis templates, with editable task name, step progress, blockers and a manager review draft. These are generic demo workflows, not approved SOPs.

The source workbook is `Knowledge Base Listing.xlsx`, sheet `Listing_Knowledge`. `workbook-sources.json` retains cell coordinates, original links, image anchors and OCR. The checked learning excerpts in `content.json` cite exact cells or slides; no source date or approval metadata was supplied. More complex stock material stays in the Hub for direct inspection.

To re-import the workbook, run `python scripts/import_workbook.py "/path/to/Knowledge Base Listing.xlsx"` with `openpyxl` installed. The original workbook is not in this repository. `scripts/workbook-ocr.json` holds the local macOS Vision extraction used by that script. OCR may be wrong; compare with the slide before relying on it.

Browser state uses `kaypee-listing-v3`. On first load, old chat from `kaypee-listing-demo-v2` is copied; old 4/4 learning progress and SOUP state are not. **Reset demo activity** clears v3 learning, notes, task drafts and new chat while retaining the earlier chat. No check-in books a calendar event or records manager approval. No live Shopee system is connected.

## Cloudflare deployment

The Cloudflare version uses a dedicated Worker (`kaypee-onboarding`) and D1 database (`kaypee-user-state`). Google ID tokens are verified server-side, then a 24-hour HttpOnly Secure session cookie identifies the Google `sub`. Learning progress, notes, chat, SOP drafts and check-ins are stored per `sub` in D1 with revision checks. Sign out revokes that server session and clears the cookie; progress stays with the account. Demo mode remains browser-only. The deployed AI endpoint requires a Google session; the localhost AI endpoint remains usable for testing without one. Google sign-in does not grant Gmail or Drive access.

`wrangler.jsonc` contains the public Google OAuth client ID and D1 binding. The DeepSeek key is a Worker Secret, never a browser asset or source file. The static build copies only the explicit app assets into the ignored `public/` directory; it excludes `.env`.

For a new Cloudflare account, update the account and D1 IDs in `wrangler.jsonc`, then run:

```sh
npx wrangler login
npx wrangler d1 create kaypee-user-state --location apac
npx wrangler d1 migrations apply kaypee-user-state --remote
npm run deploy
npx wrangler secret put DEEPSEEK_API_KEY
```

Add the deployed HTTPS origin to the Google OAuth client's Authorized JavaScript origins. The Worker URL for this account is <https://kaypee-onboarding.focus-companion-extension.workers.dev>.

## Collaborating

Use branches and pull requests on the private GitHub repository. A Git push alone does not deploy: one maintainer runs `npm run deploy` from the merged `main` branch to update the same Worker, URL, D1 binding and existing Worker Secret. A teammate who only edits code needs repository access; Cloudflare access is needed only to deploy or administer D1. Never commit `.env`, `.dev.vars`, downloaded data or Wrangler credentials. If a change adds a D1 migration, apply it to the existing database before deploying code that depends on it.
