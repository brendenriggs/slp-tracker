# Delivering the tracker

The deliverable is one file: `slp-tracker.html`. Send it; she double-clicks it. Nothing
to install, no internet needed.

## Updating her copy

Send the new file. **Her data is not affected** — Chrome keys `file://` storage to the
shared `file://` origin, not to the file path (verified 2026-08-25, see
`docs/superpowers/specs/2026-08-25-storage-probe-result.md`). She can save the new copy
anywhere, even over the old one.

The first time she takes an update, have her confirm her sessions are still there before
deleting the old file. That check costs a glance and closes the only remaining doubt.

## What she must know

1. **Chrome can clear this data.** `persist()` was denied on her laptop, so "Clear
   browsing data" wipes it. Press **Back up now** regularly — the app nags after 3 days.
2. **Link a backup file once**, ideally inside her Google Drive for Desktop folder. After
   that, Back up now writes straight to it with no dialog, and Drive carries it off the
   laptop on its own.
3. **Restore** reads a backup file back. It replaces everything; it does not merge.

## Not built (deliberately)

School-year rollover, makeup-session linking, multi-user or sync, and Phase 2 (curriculum
and lesson planning). See spec §7.
