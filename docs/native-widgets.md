# Native widgets — the follow-up, deliberately not built

Milestone 7 makes Finget an installable PWA and gives it one endpoint designed
to be polled cheaply. That is as far as the web can go on a phone home screen:
**neither iOS nor Android lets a web app draw a widget.** A widget is native
code, in a native app bundle, signed and shipped through a store.

So this document is the milestone's actual deliverable for widgets: the seam is
built and documented, and the native shim is a separate piece of work with its
own cost. Nothing here is implemented.

---

## What already exists to build against

`GET /api/finance/ambient` is the entire contract. It was designed for this
consumer and nothing else:

```json
{
  "safeDaily": 2150,
  "safeDailyPaise": 215000,
  "risk": "Safe",
  "context": "₹43,000 left, 20 days to go.",
  "scope": "user",
  "label": null,
  "asOf": "2026-08-17T09:12:44.108Z"
}
```

- **Small and fixed.** No goals, no transactions, no insight sweep, no model
  call. One scope resolve and some arithmetic.
- **Authenticated by a narrow token.** `POST /api/tokens` with
  `{"scopes": ["ambient"]}` mints an `fgt_` credential that reaches this route
  and nothing else. A widget must use one of these, never the app's JWT — a
  session token in a shared keychain reaches every endpoint in the product.
- **`asOf` is mandatory to display.** See the rule below.

## The one rule any widget must honour

> A stale number is never shown without saying it is stale.

Finget's proposition is a figure you act on in a shop. A widget showing a cached
number as current is the app confidently telling someone to spend money they may
no longer have. Every surface in this codebase already obeys this — the service
worker stamps a fetch time onto the cached response, `public/offline.html`
refuses to render a number it cannot date, and `StalenessBanner` says the age
in-app.

A native widget refreshes on the OS's schedule, not ours, and will routinely be
showing something 15–60 minutes old. It must render the age whenever the last
refresh did not just succeed. **Do not ship a widget that hides this.**

---

## iOS — WidgetKit

**Shape:** a small SwiftUI app whose only job is to hold the widget extension.
No login UI beyond pasting or deep-linking a token.

1. **Credential.** Mint an `ambient` token in the web app, hand it to the app
   via a `finget://connect?token=…` deep link (mirroring how
   `/extension/connect` works for the browser extension in Milestone 1). Store
   it in the Keychain with an App Group so the extension can read it.
2. **Timeline provider.** `TimelineProvider` fetching `/api/finance/ambient`,
   returning entries ~30 minutes apart. iOS treats the interval as a hint and
   budgets refreshes per app; assume you get far fewer than you ask for, which
   is exactly why the staleness rule matters.
3. **Families.** `systemSmall` is the honest target: the number, the risk
   colour, and the age. `systemMedium` can add `context`. Do not attempt a
   chart — the value here is one figure read at a glance.
4. **Live Activity** is tempting for Trip Mode (a burn strip on the lock screen
   for the duration of a trip) and is the strongest native case in the product.
   It needs `ActivityKit` plus push updates via APNs, which means an Apple
   developer account, an APNs key, and a server path that is NOT the Web Push
   one built in this milestone. Cost this separately.

## Android — Glance / App Widget

1. Same token flow, stored in `EncryptedSharedPreferences`.
2. `GlanceAppWidget` with a `CoroutineWorker` on a ~30-minute
   `PeriodicWorkRequest`. Android is more generous than iOS here.
3. Android can also badge and can show an ongoing notification, so a trip burn
   strip is achievable without anything like ActivityKit.

## What NOT to do

- **Do not put the app JWT in a widget.** It reaches every endpoint. The
  `ambient` scope exists so a credential on a home screen can only ever read one
  number.
- **Do not cache transactions, balances or goals** in a native container. The
  service worker deliberately refuses to (`public/sw.js`), for the same reason:
  a person's financial history should not outlive a sign-out on a device.
- **Do not compute the number natively.** It comes from
  `affordabilityService.calculateAffordability`, which knows about vault holds,
  income-sharing consent and IST month boundaries. A second implementation would
  disagree with the app within a month, and the user would have no way to know
  which was lying.
- **Do not add a "spend" action to a widget.** Finget records decisions; it does
  not move money.

## Rough cost

| Piece | Estimate |
|---|---|
| iOS shell app + `systemSmall` widget | 3–5 days, plus App Store review |
| iOS Live Activity for Trip Mode | +1 week (APNs, ActivityKit, a second push path) |
| Android Glance widget | 2–4 days |
| Apple developer account | $99/yr |

The PWA covers the "number on my home screen" case today on Android, and on iOS
covers it as an installed icon that opens straight to the number offline. Native
widgets buy glanceability without a tap. Worth doing after Milestone 8, once
there is revenue to justify two more build targets.
