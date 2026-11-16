# In-app notification vendors for Cadence

Research for [#10](https://github.com/iavor-trifonov/aihero-cohort-005-project-fork/issues/10), part of the map [#8](https://github.com/iavor-trifonov/aihero-cohort-005-project-fork/issues/8). Sources were read on **2026-11-16**. Prices change often, so check them again before deciding.

**Question:** Which third-party in-app notification vendors fit Cadence (React Router 8 framework mode, Drizzle + one SQLite file, shadcn/Tailwind), and how do they compare?

The recommendation at the end is **input to the decision in #11**. It is not the decision.

## Summary table

| Criterion | Knock | Novu | Courier | MagicBell |
| --- | --- | --- | --- | --- |
| Server SDK | `@knocklabs/node`, typed (TS ≥ 4.9), Apache-2.0. `client.workflows.trigger(key, { recipients, data })` [K3] | `@novu/api` (Node) triggers workflows (not verified in detail, see gaps) | `@trycourier/courier`, typed, Apache-2.0. `client.send.message({ message: { to, content } })` [C3] | `magicbell` npm package (`magicbell/project-client`); the API surface has changed across major versions [M3] |
| React feed component | `@knocklabs/react`: `NotificationFeedPopover`, `NotificationFeed`, `NotificationIconButton` [K2] | `@novu/react` `<Inbox />` with Bell, Notifications, InboxContent and Preferences; supports React 19 [N3] | `@trycourier/courier-react` v9 `<CourierInbox />`, built on web components [C4][C5] | `@magicbell/react`: `FloatingInbox`, `Inbox`, `InlineNotification` [M2] |
| Restyling for shadcn/Tailwind | **Good.** `--rnf-*` CSS variables and `rnf-` classes, you can drop Knock's CSS entirely, `renderItem` replaces cells, and headless hooks (`useNotifications`, `useNotificationStore`) let you build the UI in shadcn [K4][K5] | **Best of the prebuilt components.** You can pass Tailwind classes per element through `appearance.elements`, plus variables and icon overrides; headless hooks are also available [N4][N3] | **Weakest.** It's shadow-DOM web components, styled through a theme object plus a `renderListItem` slot, so Tailwind classes don't reach inside. `CourierInboxDatastore` is available for a fully custom UI [C4][C5][C6] | **Medium.** Per-component CSS, overridable classes, `--magicbell-*` variables and an `unstyled` flag; the current docs mention no headless hooks [M2][M4] |
| Real-time | Yes, over a socket, with tab-idle auto-disconnect [K4] | Yes: a WS service is part of the stack, and the unread count stays live [N3][N5] | Yes, over WebSocket (`listenForUpdates()`) [C4] | Not documented on the current React page (unverified) |
| Free tier (date read: 2026-11-16) | **Free:** 10,000 messages/mo, unlimited profiles and workflows, unlimited configurable feed retention, Knock branding. **Starter:** $250/mo for 50k messages [K1] | **Free:** 10,000 workflow runs/mo, unlimited subscribers, **5 workflows**, 2 environments, **30-day inbox retention**. **Pro:** from $30/mo [N1][N2] | **Developer:** 10,000 sends/mo (a send is one template to one recipient). **Business:** $0.005 per send, billed from the first send [C1] (page dated 2026-11-12) | **Builder:** **1,000 deliveries/mo**, counted per channel. **Startup:** $249/mo for 50k [M1] |
| Self-host / open source | No. Cloud only; the SDKs are open source | **Yes.** MIT core (the `enterprise/` folder is under a commercial licence). The self-host stack is API, Worker, WS, Dashboard, MongoDB, Redis and S3, and some cloud-only Inbox features are missing [N5][N6] | No. Cloud only; the SDKs are open source | No. Cloud only |
| Recipient / identity model | User `id` = our user id (it can't be changed afterwards); users are created by an identify call or inline on trigger; Objects and tenants for grouping [K6] | `subscriberId` = our user id; subscribers are created just-in-time on trigger; Topics for groups [N7] | `userId` = our id; the client signs in with a JWT that our backend mints with the right scopes [C4] | Users by `external_id` or email; a JWT minted by our server [M2][M3] |
| Client auth | Public key plus user id by default (insecure). With enhanced security, our server signs an RS256 JWT with `signUserToken` from `@knocklabs/node` [K7] | `subscriberHash` (HMAC) for production [N3] | JWT from our backend, scopes `inbox:read:messages` and `inbox:write:events` [C4] | User JWT from our server [M2] |
| Who stores the feed | Vendor stores it, with unlimited retention [K1] | Vendor (or our self-hosted Mongo); 30 days on Free, 90 on paid [N2] | Vendor | Vendor |
| Local dev / no-key mode | No offline mode. There are separate Development/Production environments, plus `sandbox_mode` per trigger or per channel, which generates messages without delivering them [K8] | No offline mode. `npx novu dev` tunnels to Novu Cloud [N8]; self-hosting in Docker is the only fully local option | No documented mock or test mode [C3] | None documented |
| Multi-channel headroom | Email, SMS, push, chat, Slack/Teams kits, all channels on Free [K1][K2] | Email, in-app, SMS, chat and push, all on Free [N1] | Email, SMS, push, chat and inbox; one send covers a multichannel template [C1] | Email, Slack, web push and others; each channel counts as a delivery [M1][M2] |

## Findings per vendor

### Knock

- **Trigger:** One call from a route action: `await knock.workflows.trigger("refund-approved", { recipients: [userId], data })` [K3]. Recipients can be identified inline on trigger, so users don't have to be synced up front [K6].
- **UI:** Prebuilt components can be themed through `--rnf-*` variables, and you can replace the CSS entirely [K4]. The headless path is `useKnockClient()`, then `useNotifications(client, channelId)`, then `useNotificationStore(feed)`, which returns `items` and `metadata.unread_count` and `unseen_count` [K5]. This would let us render the feed with shadcn `Popover`, `ScrollArea` and so on, while Knock keeps the state.
- **Security:** Feeds can be read by anyone with the feed id until enhanced security is turned on. For production we'd mint a token per user in a loader with `signUserToken` and `KNOCK_SIGNING_KEY` [K7].
- **Pricing:** 10k messages/mo on Free should cover dev and small production. The jump to paid is steep ($250/mo) [K1].
- **Testing:** Environments plus `settings.sandbox_mode` [K8]. There's no fake client, so Cadence's own fake transport (the mailer pattern) is still needed.

### Novu

- **Open source:** It's the only one with an MIT core and a documented self-host [N5][N6]. Self-hosting is heavy for Cadence (MongoDB, two Redis clusters, S3, three services) and doesn't fit the one-SQLite-file ethos (ADR 0006).
- **Restyling:** The `appearance.elements` prop accepts Tailwind class strings, including callbacks that compute them [N4]. Its prebuilt component fits shadcn best.
- **Free tier limits that matter:** 5 workflows. The v1 catalogue (refund, comment, redeem, course status, and others) could hit that limit. Inbox items are retained for 30 days on Free [N2]. The pricing page lists a 24-hour *activity feed* retention; that's the logs, not the inbox [N1][N2].
- **Local dev:** `npx novu dev` still tunnels through Novu Cloud [N8].

### Courier

- **Server SDK:** Good, and the free volume is comparable (10k sends) [C1][C3].
- **UI:** The v8+ React inbox wraps shadow-DOM web components [C5]. Styling is through a theme object and render slots, so shadcn/Tailwind classes can't style its internals. A custom UI needs `CourierInboxDatastore` [C5][C6].
- **Pricing:** The Business plan bills every send from the first one, so leaving Free means paying for everything [C1].

### MagicBell

- **Pricing:** The free tier is the smallest (1,000 deliveries/mo), and the next tier is $249/mo [M1].
- **UI:** The React library offers CSS variables and an `unstyled` mode, but the current docs show no headless hooks [M2][M4]. The repo has a `react-headless` package [M5], but its status isn't clear from the docs.
- **Ecosystem:** Small (the JS monorepo has about 31 stars) [M5]. The server SDK API has changed across majors [M3].

## How the "fake transport" preference fits

None of the four has a no-key offline mode. So whichever vendor we pick, Cadence would mirror `app/lib/mailer.server.ts`: a `NotificationTransport` interface, with a vendor transport when the key is set and an outbox/SQLite fake otherwise.

That only covers the *write* side. The vendor's React feed reads straight from the vendor, so without a key the prebuilt component has nothing to show. A UI built on headless hooks (Knock, Novu), or on our own loader, can switch to the fake store in dev and tests. This matters for #8's open question, "Where notifications are stored": if the fake has to back the UI locally, a small notifications table or JSON outbox read by a loader is the natural fake.

## Recommendation (input to #11, not the decision)

**My lead pick is Knock, with Novu as a strong alternative.**

- **Knock:** It has the most generous small-scale terms for an in-app feed: 10k messages, unlimited feed retention and unlimited workflows on Free. It has a clean typed Node SDK, both prebuilt and fully headless React APIs (good for a shadcn-built feed), real-time sockets, and per-environment sandboxing.
  - Costs: no self-host, a steep jump to $250/mo, and Knock branding on the Free component (which goes away if we build the UI headless).
- **Novu:** Pick it if open source or self-hosting matters, or if we want to use the prebuilt inbox styled with Tailwind classes. Its Free limits (5 workflows, 30-day inbox retention) and heavy self-host stack weigh against it for Cadence.
- **Courier:** Rule it out on restyleability, because shadow DOM fights shadcn/Tailwind.
- **MagicBell:** Rule it out on its free tier size and ecosystem maturity.

## Not verified

- **Novu Node SDK:** The current package name and exact trigger signature (`@novu/api` vs the older `@novu/node`). I didn't open the SDK page.
- **MagicBell:** Its real-time transport, and whether `react-headless` is still maintained.
- **Knock:** The pricing page has no date; the figures are as read on 2026-11-16. MagicBell's pricing page also has no date. Novu's limits page and pricing page disagree in wording, so I used the limits table for inbox retention.
- **Courier:** Whether the free Developer plan includes Inbox. The pricing page lists no Inbox-specific limits.

## Sources

- [K1] Knock pricing: https://knock.app/pricing
- [K2] Knock React overview: https://docs.knock.app/in-app-ui/react/overview
- [K3] Knock Node SDK: https://github.com/knocklabs/knock-node
- [K4] Knock React feed: https://docs.knock.app/in-app-ui/react/feed
- [K5] Knock headless feed: https://docs.knock.app/in-app-ui/react/headless/feed
- [K6] Knock users: https://docs.knock.app/concepts/users
- [K7] Knock in-app security and authentication: https://docs.knock.app/in-app-ui/security-and-authentication
- [K8] Knock testing workflows and environments: https://docs.knock.app/send-notifications/testing-workflows
- [N1] Novu pricing: https://novu.co/pricing
- [N2] Novu limits: https://docs.novu.co/platform/developer/limits
- [N3] Novu Inbox overview: https://docs.novu.co/platform/inbox/overview
- [N4] Novu Inbox styling: https://docs.novu.co/platform/inbox/configuration/styling
- [N5] Novu self-hosting: https://docs.novu.co/community/self-hosting-novu/overview
- [N6] Novu repo and licence: https://github.com/novuhq/novu
- [N7] Novu subscribers: https://docs.novu.co/platform/concepts/subscribers
- [N8] Novu local dev (`novu dev`): https://docs.novu.co/framework/studio
- [C1] Courier pricing: https://www.courier.com/pricing
- [C3] Courier Node SDK: https://github.com/trycourier/courier-node
- [C4] Courier Inbox overview: https://www.courier.com/docs/platform/inbox/inbox-overview and https://www.courier.com/docs/sdk-libraries/courier-react-web
- [C5] Courier Web Components SDK: https://www.courier.com/docs/sdk-libraries/courier-ui-inbox-web
- [C6] Courier React v8 migration guide: https://www.courier.com/docs/sdk-libraries/courier-react-v8-migration-guide
- [M1] MagicBell pricing: https://www.magicbell.com/pricing
- [M2] MagicBell React: https://www.magicbell.com/docs/libraries/react
- [M3] MagicBell Node package: https://www.npmjs.com/package/magicbell
- [M4] MagicBell React (headless check): https://www.magicbell.com/docs/libraries/react-headless
- [M5] MagicBell JS monorepo: https://github.com/magicbell/magicbell-js
