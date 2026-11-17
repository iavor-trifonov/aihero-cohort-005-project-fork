# Use Knock for in-app Notifications

Cadence sends in-app Notifications through Knock, a closed-source hosted service that stores each person's feed. That makes Knock the one place outside our SQLite file (ADR 0006) where Cadence data lives. We picked it because its free tier fits v1 (10k messages a month, unlimited workflows, unlimited feed retention), its Node SDK is typed, its React hooks let us build the feed in shadcn, and it has a sandbox mode.

## Considered Options

- **Novu.** Open source and self-hostable, and its prebuilt inbox takes Tailwind classes. Rejected: the free tier allows only 5 workflows (the v1 catalogue has six Notifications) and keeps inbox items for 30 days. Self-hosting means running MongoDB, Redis, S3 and three services. It stays the fallback if open source or self-hosting ever becomes a requirement.
- **Courier.** Rejected: its inbox uses shadow-DOM web components, which Tailwind classes can't style.
- **MagicBell.** Rejected: its free tier has only 1,000 deliveries a month, and its ecosystem is small.

## Consequences

- Every Knock call goes from our server with the secret key, and the browser never calls Knock, so v1 signs no user tokens. Enhanced security only gates requests made with the public key, but it is still switched on in Production, because without it anyone holding the public key and a user id can read that feed. Live updates in the browser would need signed user tokens.
- A Knock user id can't be changed after it's created, and the feed history lives in Knock. Moving to another vendor means losing or migrating that history.
- Knock has no offline mode. Following the mailer pattern, a fake transport records Notifications locally when no Knock key is set.
- Above 10k messages a month the next plan costs $250/mo. Check production volume against that limit.
