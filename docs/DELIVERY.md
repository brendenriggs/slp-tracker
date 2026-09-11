# Delivering the tracker

The app is hosted at **https://brendenriggs.github.io/slp-tracker/**.

## Status: live. She uses this URL.

**Promotion has happened.** Confirmed by Brenden on 2026-09-11. Carol Ann works from the
hosted app, not from an emailed `file://` copy.

This reverses the single most important standing assumption in this repo, and earlier
handoffs still say the opposite. **`main` is production.** A push reaches her within about
ten minutes, with nothing to send and nothing for her to accept. So:

- **A push is a release to a working clinician.** There is no beta environment any more.
  Half-finished work does not belong on `main`; it belongs on a branch.
- **The suite being green is not sufficient.** Verify past it — layout, scroll, fixture
  size, and now upgrades — before pushing. See `docs/AUTONOMY.md`.
- **Nothing announces a release to her.** She finds out by reading the version stamp, or
  because Brenden tells her.

The migration below has already been done. It is kept because it documents why her data
lives where it does, and because the same origin rule applies to any future move.

The draft note that handed her the URL is `tmp/note-for-her.md` (gitignored).

## Changing the database shape, now that she is live

Learned the hard way on 1.12.0, which added a store and so raised `DB_VERSION`.

**An open tab holds the database at the version it knew.** A tab she left open on the old
version blocks the upgrade in the tab she just reloaded. Before 1.12.0 that produced a
**blank page** — no message, no explanation — which for someone whose records are her job
looks exactly like having lost everything.

From 1.12.0 on, three things guard this, and a schema change must keep all three working:

1. An open connection **yields** when a newer version wants in (`db.onversionchange`), so a
   stale tab can no longer block the tab she is using.
2. A refusal is **a sentence she can act on**, not a diagnosis.
3. Boot **catches** a database that will not open and renders that sentence with a Reload
   button, rather than rendering nothing.

Before shipping any change to `SCHEMA`, `DB_VERSION` or `SCHEMA_VERSION`, run
`tmp/cdp-upgrade-probe.js`. It seeds the previous release, upgrades in place at the same
URL, and checks every store survives. **No test in the suite performs an upgrade at all** —
each one starts from a wiped database — so the suite cannot answer this question.

Also check the backup file she already has still restores. `parseBackup` validates a file
against the stores that existed at the version the file declares (`STORE_SINCE`), which is
what lets an older backup restore without weakening the guard against a truncated one.

## Updating her copy — after promotion

`git push` to `main`. GitHub Pages rebuilds within a minute or two, and its CDN caches
HTML for about ten minutes, so a refresh shortly after the push gets her the new version.
Nothing to send, nothing for her to save.

To confirm she actually has an update, ask her to read the version in the bottom-right
corner of the page. If it is stale, a hard refresh (Ctrl+Shift+R) settles it.

That stamp also opens the changelog — pressing it expands **What's new**, newest release
first, in the page rather than over it. **Nothing announces a release to her**: no banner,
no badge, no dialog. So an update she would want to know about still has to be mentioned
by Brenden; the changelog is what she reads when she goes looking, not a notification.
Every release needs a line there before it ships — `tests/changelog.test.js` fails a
version the changelog does not describe.

## The one-time move from the emailed file — done, kept for the reasoning

Her data lives in the browser, keyed to the origin it was created under. The old copy ran
on `file://`; the hosted app runs on `https://brendenriggs.github.io`. **These are
different origins, and IndexedDB does not cross between them.** Her linked backup file
handle does not cross either. So the switch is a migration, not a bookmark change:

1. Open the **old** `slp-tracker.html` file. Press **Back up now**. Confirm the JSON file
   is on disk and is not zero bytes.
2. Open https://brendenriggs.github.io/slp-tracker/. **It will be empty.** Tell her this
   before she sees it, or she will think a year of sessions is gone.
3. **Restore** from the backup file written in step 1.
4. Spot-check: a few students, a recent week of sessions.
5. **Link a backup file** again — the hosted app has no memory of the old one. Point it
   at the same Google Drive for Desktop folder.
6. Only now delete the old HTML file, so there is no second copy collecting sessions that
   the hosted app will never see.

Step 6 is the one that matters most. Two working copies on two origins, both accepting
entries, is the failure this migration can leave behind.

## What she must know

1. **It needs internet now.** The old file opened on a plane; this does not. There is no
   offline cache, deliberately — a stale service worker is the most common reason a hosted
   app stops showing updates, which is the whole point of hosting it.
2. **Chrome can still clear this data.** `persist()` was denied on her laptop, so "Clear
   browsing data" wipes it. Press **Back up now** regularly — the app nags after 3 days.
   Hosting changed nothing about this.
3. **Link a backup file once**, ideally inside her Google Drive for Desktop folder. After
   that, Back up now writes straight to it with no dialog, and Drive carries it off the
   laptop on its own.
4. **Restore** reads a backup file back. It replaces everything; it does not merge.

## Why the repo is public

GitHub Pages is free only for public repos. The repo holds app code and design docs — no
student data, no names, no district. `.gitignore` keeps backups (`slp-data-*.json`,
`*-backup.json`, `data/`) out, and test fixtures are invented. Keep it that way.

## Not built (deliberately)

School-year rollover, makeup-session linking, multi-user or sync, offline caching, and
Phase 2 (curriculum and lesson planning). See spec §7.
