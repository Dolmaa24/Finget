# Finget — the decision-first financial system 💸

Most money apps tell you what you *already* spent. Finget answers the question you
actually have in the shop: **can I afford this, right now, without hurting anything
I care about?**

It works in two modes, and the switch re-scopes the entire application:

| | **Personal mode** | **Friends mode** |
|---|---|---|
| Income | Yours | Pooled across members |
| Ledger | Your transactions | Shared, with the payer recorded |
| Goals | Private | Shared, with per-member contributions |
| Extra | — | Splits, settle-up, activity feed |

---

## ✨ What it does

### 1. Safe-to-spend, computed for *today*
Income (plus any income logged this month) minus what has already been spent, minus
the savings you ring-fenced, divided by the days actually left in the month. The risk
level turns to **Warning** below your emergency buffer and **Risky** below zero.

### 2. A what-if simulator that knows your goals
Type or drag an amount and Finget shows the new remaining budget, the new daily
allowance, the new risk level — and how many days the purchase pushes back the goal
it hurts most.

### 3. Friends mode: a genuinely shared wallet
- **Invite codes** — six characters, rotatable. Nobody joins by pasting a raw database id.
- **Splits** — equal (with per-person include/exclude) or custom amounts that must
  reconcile to the total. Remainders are distributed in paise so parts always sum exactly.
- **Settle up** — a greedy matcher reduces every debt in the group to the fewest
  possible transfers, and recorded payments net off against the balances.
- **Shared goals** — each contribution is credited to whoever made it.
- **Live activity feed** — expenses, settlements and goals, updated over Socket.IO
  the moment another member acts.
- **Admin controls** — only admins rename the group, rotate the code, or change the
  shared budget rules. Leaving is blocked while you still hold an open balance.

### 4. Insights: rules first, AI second
Deterministic rules run instantly and always: recurring-charge detection, category
overspend vs last month, projected month-end balance, goal-pace warnings, weekend
spending spikes, and a group contribution-imbalance check. An LLM pass layers on top
**when a key is configured** — and the app states plainly when it is not.

### 5. Context-aware AI coach
Streams over SSE with persistent per-scope conversation memory. Its figures come from
the database, not from the client, so the numbers it quotes are always the real ones.

---

## 🎨 Design

One warm photographic ground with slow-drifting light pools; translucent panels
floating above it; a glass rail that re-scopes with the mode. Everything derives from
CSS custom properties in [`src/styles/theme.css`](src/styles/theme.css) — colour,
blur, radii, elevation — and Tailwind maps its own tokens onto those variables, so
the whole application re-themes from one file.

---

## 🚀 Tech stack

**Frontend** — React 19 + Vite, TypeScript, Tailwind, React Router, Socket.IO client.
**Backend** — Node + Express, MongoDB/Mongoose, JWT + bcrypt, Socket.IO, Groq — OpenAI-compatible (optional).

### Architecture

The whole app is explicit about scope. `ScopeProvider` owns the mode, the active
group, and the groups list; every API helper takes a `ScopeRef` and serialises it as
`?context=user` or `?context=group&groupId=…`.

On the server, [`services/scopeResolver.js`](finget-backend/services/scopeResolver.js)
is the single place that turns that pair into *(owner, transactions, settings, goals)*
and enforces membership. Controllers never re-implement the check — which is what
allowed an authorization bug to hide in four of them before.

**Money** is integer paise in every calculation. The database still stores
rupees, so [`utils/money.js`](finget-backend/utils/money.js) owns the only two
conversion points and a test enforces that nothing else multiplies or divides
by 100.

**Dates** are Asia/Kolkata everywhere, via
[`utils/time.js`](finget-backend/utils/time.js). Server-local boundaries used to
roll the month over at 05:30 IST on a UTC host — invisible on an Indian dev
machine, wrong in production.

**Goal currency** — [`services/goalCurrencyService.js`](finget-backend/services/goalCurrencyService.js)
is the product in one function: it turns ₹8,499 into *"6 days of your Goa trip"*,
and names the frame it chose in `headlineKind` so nothing downstream has to guess.

---

## 🚦 Getting started

You need Node 18+ and a MongoDB instance.

```bash
git clone https://github.com/Dolmaa24/Finget.git
cd Finget
npm install
cd finget-backend && npm install && cd ..
```

Create the backend env file:

```bash
cp finget-backend/.env.example finget-backend/.env
```

Fill in `MONGO_URI` and a strong `JWT_SECRET` (`openssl rand -hex 32`).
`GROQ_API_KEY` is optional — without it the AI coach and AI insights show a clear
"not connected" state and **everything else works normally**.

Run both servers:

```bash
npm run dev
```

```bash
npm --prefix finget-backend run dev
```

The app is at `http://localhost:5173`, the API at `http://localhost:5000`.

> **Note:** `finget-backend/.env` is git-ignored. It was previously committed; if you
> are pulling an old clone, rotate any secret that was in it.

### Browser extension

`extension/` is a **standalone package** with its own install and its own
release cadence (Chrome Web Store review), so it is deliberately not part of the
root install:

```bash
npm --prefix extension install && npm --prefix extension run build
```

Load `extension/dist` at `chrome://extensions` → Developer mode → *Load
unpacked*, then open **Settings → Connected apps → Connect the extension** in
the web app. The connect page hands the key over automatically when the
extension is installed, and falls back to a copyable key when it is not.

To iterate on the chip without loading it into Chrome or visiting a retailer:

```bash
npm --prefix extension run harness
```

That serves `harness/index.html` — the real `renderChip` against deliberately
hostile host-page CSS, which is what the chip's shadow DOM exists to survive.

---

## 🔌 API

| Method | Route | Purpose |
|---|---|---|
| `POST` | `/api/auth/signup` · `/login` | Returns `{ token, user }` |
| `GET/PUT` | `/api/auth/me` | Profile and monthly income |
| `GET` | `/api/finance/affordability` | Safe-to-spend for the scope |
| `POST` | `/api/finance/translate` | **Goal currency** — what a price costs in days of your goal |
| `POST` | `/api/finance/simulate` | _Deprecated._ Rupee-denominated wrapper over `/translate` |
| `POST` | `/api/finance/future-impact` | Habit-change projection |
| `GET/PUT` | `/api/finance/budget-settings` | Savings target + emergency buffer |
| `GET` | `/api/finance/auto-budget` | Category split from recent spend |
| `GET/POST/DELETE` | `/api/transactions` | Ledger, with splits |
| `GET` | `/api/transactions/categories` | Category list |
| `GET/POST/PUT/DELETE` | `/api/goals` | Goals |
| `POST` | `/api/goals/:id/contribute` | Attributed contribution |
| `GET/POST` | `/api/groups` | List / create |
| `POST` | `/api/groups/join` | Join by invite code |
| `PUT` | `/api/groups/:id` | Rename (admin) |
| `POST` | `/api/groups/:id/rotate-code` | New invite code (admin) |
| `POST` | `/api/groups/:id/leave` | Leave (blocked if unsettled) |
| `GET` | `/api/groups/:id/balances` | Balances + minimal transfers |
| `POST` | `/api/groups/:id/settle` | Record a payment |
| `GET` | `/api/groups/:id/activity` | Merged activity feed |
| `POST` | `/api/ai/coach` | SSE coach stream |
| `GET/DELETE` | `/api/ai/coach/history` | Per-scope conversation |
| `GET` | `/api/ai/insights` | Rule + AI insights |
| `GET` | `/api/health` | Status, including `aiEnabled` |
| `POST/GET/DELETE` | `/api/tokens` | Scoped extension credentials — mint, list, revoke |
| `POST/GET/DELETE` | `/api/share` | Mint, list and revoke share cards |
| `GET` | `/s/:token` | **Public** share card page (HTML + Open Graph) |
| `GET` | `/s/:token.png` | **Public** share card image, 1200×630 PNG |

All `/api` routes except signup, login and health require
`Authorization: Bearer <token>`. `/s/:token` is deliberately public — it is the
only route that returns user data without authentication, and everything it
serves has passed the redaction serialiser in `services/shareCardService.js`.

### Scoped tokens

`POST /api/tokens` mints a `fgt_`-prefixed credential for the browser
extension. It is **not** the app's JWT: it reaches `POST /api/finance/translate`
and nothing else, it is stored as a SHA-256 hash so a database dump yields
nothing usable, and it is revocable from Settings without signing the user out
anywhere else. Only the app JWT can mint one, so a leaked extension token
cannot mint itself a replacement.

### Share card images

`/s/:token.png` renders through satori → `@resvg/resvg-js` with a bundled Inter
subset. Both are **optional at runtime**: if the native prebuild is missing on
the host, the `.png` route returns `501` and `/s/:token` keeps serving the HTML
card with its Open Graph text. A link that loses its image is degraded; a link
that 500s is broken.

Inter's `latin` subset has no `₹` (U+20B9), so `latin-ext` is loaded as a named
fallback at every weight. Dropping it to save ~140 KB makes every card read
`□8,499`, and nothing throws.

---

## 🧪 Tests

```bash
npm test
```

```bash
npm --prefix finget-backend test
```

Every money calculation and every authorization boundary is covered: paise
conversion and remainder distribution, IST month boundaries, goal translation,
split reconciliation, scope isolation, and share-payload redaction.

`tests/no-bare-hundreds.test.js` scans the backend for a stray `* 100` or
`/ 100` outside `utils/money.js` and fails the build if it finds one — that is
the entire rupee/paise bug class, caught at the only moment it is cheap.

Set `MONGO_TEST_URI` to run integration tests against a real Mongo instead of
downloading `mongodb-memory-server`'s binary.
