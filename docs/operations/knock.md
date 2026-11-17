# Setting up Knock for in-app Notifications

Cadence keeps each person's Notifications in Knock (ADR 0013). The code is in
`app/lib/notifications/knock-feed.server.ts`. Knock is used whenever
`KNOCK_API_KEY` is set. Without it, Notifications go to the gitignored
`.notifications.json` file instead, so local dev needs no Knock account.

These steps are done by hand in the [Knock dashboard](https://dashboard.knock.app),
once for **Development** and once for **Production**. Knock's environments
don't share workflows, users or feeds.

## Environment variables

| Var                     | Used | What                                                                                                                                             |
| ----------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `KNOCK_API_KEY`         | Yes  | The environment's **secret** API key (`sk_…`). Server only. Setting it switches Cadence from the file feed to Knock.                             |
| `KNOCK_FEED_CHANNEL_ID` | Yes  | The id of the in-app feed channel ("Cadence in-app"). Without it Notifications are still sent, but `/notifications` can't read or mark the feed. |
| `KNOCK_PUBLIC_API_KEY`  | No   | The public key (`pk_…`). Unused in v1: the browser never calls Knock.                                                                            |
| `KNOCK_SIGNING_KEY`     | No   | The signing key for user tokens. Unused in v1: no user tokens are signed.                                                                        |

Locally these live in the repo-root `.env`, which is gitignored. `react-router
dev` loads it, and Vitest doesn't, so tests always use the file feed. In
production, set them in the host's secret store. Never commit a key.

## 1. The in-app feed channel

Under **Integrations → Channels**, check that the in-app feed channel exists
and copy its id into `KNOCK_FEED_CHANNEL_ID`. A channel keeps the same id in
every environment.

## 2. The six workflows

Under **Workflows**, create one workflow for each Notification type. The
workflow **key** must equal the type exactly, because `notify()` triggers the
workflow whose key is the Notification's `type`:

- `refund-request-raised`
- `refund-request-decided`
- `comment-replied`
- `question-asked`
- `seat-claimed`
- `course-status-changed`

Each workflow has a **single step**: an in-app feed step on the feed channel
from step 1. No email, push or other channels, and no delay or batch steps.

The step's template isn't shown to anyone: Cadence renders each row's text
itself, from the type and the snapshot in the message's `data`. Something
short like `{{ data.url }}` is enough to save it. The trigger `data` holds the
Notification's snapshot (names, titles, `url`) plus `actorId`, the id of the
person whose action caused it.

**Commit** each workflow so the environment runs it, then **promote** the
changes from Development to Production (or create them there the same way).

Recipients need no setup. Each trigger names them inline as `{ id, name }`,
where `id` is `String(users.id)`, and Knock creates or updates the user.

## 3. Enhanced security in Production

In the **Production** environment, under **Developers → API keys** (or the
environment's settings), switch **enhanced security** on. Cadence only uses
the secret key, which enhanced security doesn't affect, but it stops anyone
with the public key from reading feeds. Leave it off in Development.

## 4. Check it against Development

With the Development keys in `.env`, run `npm run dev` and, switching users
in the DevUI panel:

1. **Trigger:** raise a Refund Request as a Student. In Knock's **Logs**, the
   `refund-request-raised` workflow runs once, with every Platform Admin but
   the buyer as recipients.
2. **List:** as a Platform Admin, open `/notifications`. The new Notification
   is at the top, with the right text and link.
3. **Unread count:** the sidebar badge and the **Unread (n)** tab show the
   same number as the user's feed in Knock.
4. **Mark read / unread:** toggle one row. The count goes down and back up,
   and the message's read state changes in Knock.
5. **Mark all read:** the count drops to 0. Knock runs this in the
   background, so a reload straight after may briefly show the old count.
6. **Failure:** set `KNOCK_API_KEY` to a wrong value and raise another Refund
   Request. The refund still succeeds, and the server log shows the dropped
   Notification with its workflow key and recipient ids.
