# Clipboard feedback candidate

Cards, market/index links and plugin detail pages use one copy controller. A
resolved Clipboard write produces success feedback. Rejection or an unavailable
Clipboard API leaves the installation context open and offers the literal command
in a selected, read-only dialog. Closing that dialog returns focus to the trigger.

Writes are serialized because ignoring an old Promise result cannot undo an old
Clipboard side effect. Superseded, detached or reused card controls are checked
again before a queued write. A menu's delayed close is bound to its toggle cycle,
so a completed copy cannot close a menu the visitor has since reopened.

Local automated verification:

```sh
node --test scripts/command-copy.test.mjs
node --test scripts/*.test.mjs
```

The candidate passes 10 copy regressions and all 57 repository tests. They include
successful writes, rejection, a missing API, failure/retry, stale success timers,
serialized native side effects, superseded errors, windowed card reuse, and a
reopened menu. Independent review reproduced a write-ordering issue and a stale
menu-close issue; both now have passing regression cases.

Browser acceptance is still required: list and detail pages, keyboard focus and
Escape, permission rejection, manual selection, retry, and 320/390/1440px layout.
Automated Clipboard calls in those checks should be stubbed so they do not change
a user's real clipboard. Unit fixtures are not a browser-acceptance claim.

For local preview or the repository's non-publishing PR path, the existing
`SKIP_PUBLISH_CHECKS=1 node scripts/build-site.mjs` is available. It does not
certify publishing coverage. The normal build's star-coverage guard stays intact;
missing probe data must not be presented as a valid production catalog. This
candidate does not install plugins, alter browser permissions, publish the site,
or submit an upstream contribution.
