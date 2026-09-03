# Delivering the tracker

The app is hosted at **https://brendenriggs.github.io/slp-tracker/**.

## Status: beta. She does not have this URL.

As of 2026-09-02 Carol Ann is still working from her emailed `file://` copy of
`slp-tracker.html`. The hosted app is a **beta environment** — Brenden's to push to and
break freely, because nobody else is looking at it.

**Everything below the "Promoting to production" heading has not happened yet.** Until it
does, `main` carries no obligation to be coherent, and a half-finished feature on it
harms nobody.

## Promoting to production

Promotion is a single act: **giving her the URL and walking her through the migration in
"The one-time move" below.** Do it only when `main` is green and coherent — she cannot see
a version number climb and reason about whether a broken tab is expected.

The draft note that hands her the URL is `tmp/note-for-her.md` (gitignored, unsent).

## Updating her copy — after promotion

`git push` to `main`. GitHub Pages rebuilds within a minute or two, and its CDN caches
HTML for about ten minutes, so a refresh shortly after the push gets her the new version.
Nothing to send, nothing for her to save.

To confirm she actually has an update, ask her to read the version in the bottom-right
corner of the page. If it is stale, a hard refresh (Ctrl+Shift+R) settles it.

## The one-time move from the emailed file

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
