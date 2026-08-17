# Finget — the decision-first financial system 💸

Most money apps tell you what you *already* spent. Finget answers the question you
actually have in the shop: **can I afford this, right now, without hurting anything
I care about?**

It works in two modes, and the switch re-scopes the entire application:

| | **Personal mode** | **Friends mode** |
|---|---|---|
| Income | Yours | Pooled across the members who opt in |
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
- **Splits** — equal (with per-person include/exclude), **income-weighted**, or custom
  amounts that must reconcile to the total. Remainders are distributed in paise so parts
  always sum exactly, whichever mode is used.
- **Income stays private** — weighting is opt-in *per group*, and no member's income is
  ever sent to another. Not as a field, and not as a pooled total either: a group-wide
  sum is one subtraction away from a co-member's exact salary in a two-person group, so
  pooling counts only the people who opted in and the UI always says how many that is.
  A member who opts out is weighted at the average of those who opted in, so opting out
  is neither a discount nor a penalty. The opt-in copy is explicit that a larger share
  still implies a larger income — that much is inherent to weighting, and pretending
  otherwise would be the dishonest part.
- **Settle up** — a greedy matcher reduces every debt in the group to the fewest
  possible transfers, and recorded payments net off against the balances.
- **Shared goals** — each contribution is credited to whoever made it.
- **Live activity feed** — expenses, settlements and goals, updated over Socket.IO
  the moment another member acts.
- **Admin controls** — only admins rename the group, rotate the code, or change the
  shared budget rules. Leaving is blocked while you still hold an open balance.

### 4. The Silent Collector
Chasing a friend for money is the most socially expensive thing a shared ledger can ask
of anyone, and it is why they quietly die — the debt is recorded, nobody wants to raise
it, and the group stops using the app rather than have the conversation. Finget raises it
instead: a gentle nudge at day 3, a firmer one at day 7, a plain summary at day 14, and
then **silence**. Three messages per debt, ever.

- **Never shames.** No "overdue", no counting how many times it has asked. The debtor is
  a friend who forgot, because that is who they almost always are.
- **Only the debtor** is messaged, never the group. Per-person mute, per-group mute, and
  an admin switch for the whole group. Muting silences the messages, not the balance.
- **One-tap settling** via a `upi://pay` intent with the amount pre-filled. Finget does
  not hold, move, or see the money — the link opens the payer's own UPI app, and the debt
  stays open until a human records the payment.
- **Idempotent by construction.** Scheduling is a unique index on
  (group, debtor, creditor, stage, debt-episode), not a check-then-write, so repeated,
  concurrent, or crash-retried sweeps converge on exactly one message. Settling and
  falling behind again starts a new episode, so the key never locks anyone out forever.
- Email is optional (`RESEND_API_KEY`). Without it reminders still arrive in-app, still
  escalate on the same schedule, and still carry the pay link.

### 5. Insights: rules first, AI second
Deterministic rules run instantly and always: recurring-charge detection, category
overspend vs last month, projected month-end balance, goal-pace warnings, weekend
spending spikes, and a group contribution-imbalance check. An LLM pass layers on top
**when a key is configured** — and the app states plainly when it is not.

### 6. The Deflection Ledger and the 48-hour vault
Every other money app only counts what you got wrong. Tap **I want this** and the
amount leaves safe-to-spend *immediately* — the dashboard number moves before you
have left the page — and Finget asks again in two days. Walk away and it is credited
to a running total, expressed in goal currency: *"₹12,400 kept — that's the Goa trip,
funded."* Say nothing for 72 hours and the money is released for you. There is no
"you caved" figure anywhere in the feature, and the server does not compute one.

Group holds are scope-local, capped at a quarter of group headroom per member so one
indecisive person cannot freeze everyone's number, and releasable by the creator or a
group admin.

### 7. Trip Mode and Trip Wrapped
A trip is a group with a clock, not a separate entity — splits, settle-up, goals and the
activity feed all keep working. Set dates and a pot and the dashboard grows a live burn
strip: *"Day 2 of 5 · 61% spent · you're running hot."* Pace compares spend progress
against time progress, so the same 61% reads as running hot on day two and comfortably
ahead on day four. It updates over the group's existing socket room the moment anyone
pays for lunch.

**Trip Wrapped** is the recap: totals, who paid versus who owed, the biggest expense, the
top category, and deterministic superlatives (*Biggest Spender*, *The One Who Always
Paid*, *Cheapest Day*). Every figure and badge is computed on the server; an optional AI
sentence sits on top and can change nothing underneath it. Each member mints **their own**
card with their own name in the headline — a generic recap does not get posted to a group
chat.

**Joining is frictionless and still private.** The public link carries a 22-char opaque
token, never the 6-char invite code, and shows the trip name, emoji, dates, member count
and first initials — deliberately **not the total**, because that is the figure that would
make a forwarded link worth having. Resetting the link kills every copy already sent and
removes nobody from the group.

### 8. Import: stop typing transactions in
Manual entry is the biggest reason people abandon this category. Paste a batch of bank
or UPI SMS and Finget reads them with **per-issuer regex — no API key, no network call,
nothing leaves the server**. Bank SMS is among the most sensitive text a person owns, so
the ordinary import path is deterministic and local. OTPs and balance alerts are ignored.

Payment screenshots go through a **pluggable vision provider**, enabled by config alone
(`VISION_API_KEY`, optionally `VISION_PROVIDER` / `VISION_MODEL` / `VISION_BASE_URL`).
With none configured the feature says so plainly and points at the SMS path, which is
what most imports use anyway.

Everything lands in a **review sheet** — nothing is ever written without a person
confirming it. Suspected duplicates arrive unticked with the row they matched named
next to them, matched on the bank reference where one exists and otherwise on amount,
date ±1 day, and fuzzy merchant. Categories are suggested from the person's own past
corrections first (a plain merchant→category map, no ML), then a small seed list. **No
image is ever stored** — read once, discarded, and the UI says so.

### 9. Context-aware AI coach
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

The app is at `http://localhost:5173`, the API at `http://localhost:5001`.

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
| `POST` | `/api/groups/:id/income-sharing` | **Opt in / out of income weighting.** Acts only on the caller — nobody, admin included, can consent on your behalf |
| `GET` | `/api/groups/:id/split-preview` | Shares for an amount, plus a relative label about **your own** share only |
| `POST` | `/api/groups/:id/mute-reminders` | Mute the Silent Collector for this group, for yourself |
| `GET` | `/api/notifications` | In-app notifications + unread count |
| `POST` | `/api/notifications/read` | Mark one, several, or all as read |
| `POST` | `/api/ai/coach` | SSE coach stream |
| `GET/DELETE` | `/api/ai/coach/history` | Per-scope conversation |
| `GET` | `/api/ai/insights` | Rule + AI insights |
| `GET` | `/api/health` | Status, including `aiEnabled` |
| `GET` | `/api/receipts/status` | What this server can import — SMS always, screenshots if configured |
| `POST` | `/api/receipts/parse-sms` | **Bulk paste** → reviewable drafts, deterministic and offline |
| `POST` | `/api/receipts/parse` | Screenshot → draft, via the pluggable vision provider |
| `POST` | `/api/receipts/commit` | Write the rows the person confirmed |
| `GET` | `/api/groups/:id/trip-status` | **Live trip burn** — day, pace, allowance, projection |
| `GET` | `/api/groups/:id/wrapped` | Trip recap, with an optional AI one-liner |
| `POST` | `/api/groups/:id/wrapped/share` | Mint *your own* personalised Wrapped card |
| `POST` | `/api/groups/:id/invite-card` | The trip as a shareable card |
| `POST` | `/api/groups/:id/rotate-preview` | New share link; the old one dies, members stay |
| `POST` | `/api/groups/join-by-token` | Join from a public link, once signed in |
| `GET` | `/join/:previewToken` | **Public** trip preview (HTML + Open Graph) |
| `GET` | `/join/:previewToken.json` | The same preview, for the web app |
| `POST` | `/api/deflections` | **48-hour vault** — ring-fence an amount out of safe-to-spend |
| `POST` | `/api/deflections/:id/resolve` | Bought, or walked away |
| `GET` | `/api/deflections/ledger` | Money kept, this month / quarter / all time |
| `GET` | `/api/deflections/pending` | Holds whose 48 hours are up |
| `POST/GET/DELETE` | `/api/tokens` | Scoped extension credentials — mint, list, revoke |
| `POST/GET/DELETE` | `/api/share` | Mint, list and revoke share cards |
| `GET` | `/s/:token` | **Public** share card page (HTML + Open Graph) |
| `GET` | `/s/:token.png` | **Public** share card image, 1200×630 PNG |

All `/api` routes except signup, login and health require
`Authorization: Bearer <token>`. `/s/:token` and `/join/:previewToken` are
deliberately public — they are the **only two** routes that return user data
without authentication. Everything `/s` serves has passed the redaction
serialiser in `services/shareCardService.js`; everything `/join` serves comes
from `services/tripPreviewService.js`, which is the single place that decides
what a stranger may see.

### Scoped tokens

`POST /api/tokens` mints a `fgt_`-prefixed credential for the browser
extension. It is **not** the app's JWT. Each token carries a set of scopes and
each scope grants exactly one route — `translate` reaches
`POST /api/finance/translate`, `deflect` reaches `POST /api/deflections`, and
nothing reaches anything else. It is stored as a SHA-256 hash so a database
dump yields nothing usable, and it is revocable from Settings without signing
the user out anywhere. Only the app JWT can mint one, so a leaked extension
token cannot mint itself a replacement — and it cannot *decide* a vault hold
either, so the worst it can do is ring-fence money that releases itself in 72
hours.

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
split reconciliation (equal *and* weighted), income non-disclosure, reminder
idempotency under repeated and concurrent sweeps, scope isolation, and
share-payload redaction.

`tests/no-bare-hundreds.test.js` scans the backend for a stray `* 100` or
`/ 100` outside `utils/money.js` and fails the build if it finds one — that is
the entire rupee/paise bug class, caught at the only moment it is cheap.

Set `MONGO_TEST_URI` to run integration tests against a real Mongo instead of
downloading `mongodb-memory-server`'s binary.
