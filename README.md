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

### 9. Log by WhatsApp
The fastest way to log a ₹450 dinner is not to open an app. Message Finget the way you'd
text a friend — *450 dinner split with Goa* — and it books the expense, splits it, and
replies with the confirmation **and what it just cost you**: *"That's 3 days of your Goa
trip."* That reply is the product's whole argument, delivered in the app the group is
already arguing about money in.

- **Deterministic parser first.** Amounts (`₹1,250.50`, `2k`), categories, groups and
  split mode are read by regex with no key and no network call. These are private
  messages; the ordinary path must not ship them anywhere. The model is a fallback.
- **The number is the credential**, so linking is the security boundary: a code is sent
  **to** the number over WhatsApp and must be replied **from** it. Confirming it in the
  web app would only prove you still had the session you already had. The code is stored
  hashed, expires in 15 minutes, and dies after five wrong tries.
- **An unlinked number can never write.** Not an expense, not a settlement, not even a
  balance read — and it gets exactly *one* reply per hour, so the number cannot be used as
  a free SMS gateway and the silence leaks nothing about who has an account.
- **Every write is reversible for ten minutes** and says so in the same breath. Reply
  *UNDO* and the row is deleted, not offset by a compensating one.
- **Signature-verified, replay-safe.** HMAC-SHA256 over the raw bytes — which is why the
  webhook mounts its own body parser above the global one. Meta redelivers whenever it
  doesn't get a prompt 200, so the provider's message id is claimed under a unique index
  before anything happens; three redeliveries of one *450 dinner* produce one transaction.
- **Provider-agnostic.** Everything Meta-shaped lives in one adapter behind a normalised
  `{ providerMessageId, from, text }`. Swapping in Twilio or a self-hosted bridge is an
  adapter, not a rewrite — and the day that's needed is not the day to discover a
  controller destructuring `entry[0].changes[0].value.messages[0]`.

Unconfigured, the feature is cleanly off and Settings says so.

### 10. The ambient number (PWA)
The value is a number at the point of sale, and that should never require opening an app.
Finget installs to a home screen, opens straight to today's figure, and works offline.

One rule holds the whole milestone up: **a stale number is never shown without saying it
is stale.** A cached figure presented as current is the app confidently telling someone to
spend money they may no longer have. So the service worker stamps a fetch time onto the
cached response, the offline shell refuses to render a number it cannot date, and an
in-app bar names the age the moment the connection drops.

- **`GET /api/finance/ambient`** — 175 bytes: the number, its risk, one deterministic line
  of context, and `asOf`. No goals, no insight sweep, no model call, because a widget polls
  this and a dashboard-sized payload would be a battery complaint. It carries three forms
  of the figure — exact paise, a float matching `/affordability`, and a pre-formatted label
  so nothing renders `₹2866.6666666666665`.
- **A narrow token for it.** `ambient` is the most restricted scope in the app: read-only,
  one route, no history. A credential sitting on a home screen should not be able to spend.
- **Web Push, three events only**, each actionable at the moment it arrives: a vault
  decision coming due (which the person explicitly asked for), a trip running hot while
  there is still trip left, and a Friday heads-up when what's left won't cover a normal
  weekend. Never a summary of what you already spent. Per-device topic switches, and
  idempotent by construction through `PushLog`'s unique index.
- **A notification carries a figure and a sentence** — never a merchant, a transaction, or
  a list. Nothing about what you bought passes through Google's or Apple's servers.
- **The weekend pre-warning is measured, not modelled**: *"₹800 left for the weekend; the
  last three weekends you spent about ₹1,900."* Both halves come from money that actually
  left the account. It stays silent rather than counting a no-data weekend as a ₹0 one,
  because a person only believes that sentence the second time if it was true the first.
- **Badging** shows what wants attention, not the rupee figure — the API caps display at
  "99+", so an amount there would look meaningful and be nonsense.
- Native widgets are a documented follow-up, deliberately not built —
  see [docs/native-widgets.md](docs/native-widgets.md).

### 11. Money

Free stays genuinely useful forever, and **the daily number is never paywalled** — there is
a test that fails if anyone ever adds a capability check to `/affordability` or `/ambient`.
Manual entry, goals, the what-if simulator, the rule-based insights and your first group are
free on every plan.

| Tier | Price | Unlocks |
|---|---|---|
| Free | ₹0 | Personal mode, 1 group you create, rule insights, manual entry, 5 coach messages/mo |
| **Plus** | ₹99/mo · ₹899/yr | Unlimited groups and coach, screenshot + SMS import, extension, widgets, Wrapped exports, weighted splits |
| **Trip Pass** | ₹199 once | Plus features for one trip — **for every member of it**, including whoever joins later |

- **The Trip Pass is the one that matters**, and it lives inside Trip Mode where an organiser
  is standing, not as a line on a pricing page. Students don't subscribe; organisers pay once
  to make the money part painless, and that upgrades four to six people who meet the personal
  paywall later on their own. Its window is `endDate + 30 days`, because Wrapped is generated
  *after* the trip and a pass that expired on the last day would sell someone a card they
  couldn't export.
- **The client never names a price.** Order creation takes a product key and prices it from
  the server's catalogue. A client that can send `amount: 1` is a client that buys a year
  for ₹1.
- **Nothing is granted outside the webhook.** There is deliberately no verify/confirm/success
  endpoint — a test asserts all four 404. Razorpay's browser callback is user-controlled and
  replayable; the webhook is HMAC-signed over the raw body with a secret only the server
  holds. Grants are idempotent on the provider's payment id under a unique index, so the
  retries Razorpay guarantees can't hand out eleven months for one payment. A capture whose
  amount doesn't match the order is refused.
- **No card data reaches Finget.** Razorpay Checkout collects the instrument on its own
  origin; the server sees an order id. The Checkout script is loaded lazily, only when
  someone actually opens a payment.
- **The paywall never blocks you mid-action.** It appears *after* the thing you were doing,
  names the specific benefit from the server's own `explain()` — never "upgrade to unlock" —
  and always says what still works. On a group-scoped gate it leads with the Trip Pass,
  because ₹199 once for the table beats ₹99/month each.
- Refunds revoke what they bought. Renewing early extends from your existing expiry rather
  than replacing it.

**Not built, deliberately:** routing a matured savings goal to a partner deposit or fund.
`services/goalCompletionService.js` is an interface with a no-op provider and a TODO naming
the AMFI/SEBI registration and legal review it depends on. **No investment recommendation
ships**, and the guard is a source scan — a test walks the backend for anything registering
a provider, in the same spirit as `no-bare-hundreds`.

### 12. Context-aware AI coach
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
| `GET` | `/api/finance/ambient` | **The widget payload** — number, risk, one line, `asOf`. Reachable with an `ambient`-scoped token |
| `GET` | `/api/push/config` | VAPID public key + whether push is configured |
| `POST` | `/api/push/subscribe` | Register this device |
| `POST` | `/api/push/unsubscribe` | Drop this device |
| `PUT` | `/api/push/topics` | Which notifications this device wants |
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
| `GET` | `/api/payments/config` | Price list, your plan, whether this server can sell, and test-vs-live |
| `POST` | `/api/payments/order` | Open an order for a product **key** — the server prices it |
| `POST` | `/api/payments/webhook` | **Public** — signed by Razorpay. The only thing that grants an entitlement |
| `GET` | `/api/payments/history` | Your own receipts |
| `GET` | `/api/ai/coach/usage` | Free-tier coach meter, so it's visible before you hit it |
| `GET` | `/api/whatsapp/webhook` | **Public** — Meta's registration challenge |
| `POST` | `/api/whatsapp/webhook` | **Public** — inbound messages, gated by an HMAC signature over the raw body |
| `GET` | `/api/whatsapp/status` | Whether your number is linked, and whether this server supports it |
| `POST` | `/api/whatsapp/link/start` | Send a linking code to a number |
| `POST` | `/api/whatsapp/link/stop` | Unlink |
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

All `/api` routes except signup, login, health and the WhatsApp webhook require
`Authorization: Bearer <token>`.

Three routes are reachable without a session, each for a different reason and
each with its own gate:

- `/s/:token` and `/join/:previewToken` are the **only two that return user
  data** unauthenticated. Everything `/s` serves has passed the redaction
  serialiser in `services/shareCardService.js`; everything `/join` serves comes
  from `services/tripPreviewService.js`, the single place that decides what a
  stranger may see.
- `/api/whatsapp/webhook` returns nothing, but **writes**. Meta has no account
  here, so its gate is an HMAC-SHA256 signature over the raw request body,
  checked before the payload is even parsed. With no app secret configured it
  fails closed and refuses every delivery — an unverified webhook is an open
  write endpoint, and "we hadn't set the secret yet" is exactly how one ships.

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
