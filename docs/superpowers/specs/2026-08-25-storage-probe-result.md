# Storage probe — result

**Run:** 2026-08-24 22:49 EDT, on the end user's actual district laptop.
**Probe:** `storage-probe.html` (repo root).
**Answers:** build order §10 step 1, and the High-severity risk in §9.

---

## Verdict

**Browser storage works from `file://` on her machine. The architecture in the design
document stands — no rework needed.**

| Check | Result |
|---|---|
| IndexedDB usable | **yes** |
| Survived browser restart | **yes** (see caveat 2) |
| localStorage usable | **yes** |
| File System Access API — real pick, write, read-back | **yes**, 149 bytes round-tripped |
| Stored file handle reusable later | **yes**, permission still granted, no prompt |
| Persistent storage (`persisted()`) | **no**, and `persist()` was **denied** — see caveat 1 |

Environment: Windows 10/11, Chrome 151, `file:///C:/Users/.../Desktop/storage-probe.html`,
secure context **yes**, quota **~10 GB** (usage 2.8 KB), `showSaveFilePicker` and
`showDirectoryPicker` both present.

---

## Caveat 1 — storage is best-effort, not persistent

`navigator.storage.persisted()` returned **false**. Chrome is holding the data on an
evictable basis: **"Clear browsing data" wipes it**, and so can storage pressure. This
does not invalidate the design — §9 already called this out — but it converts the
backup story from prudent to load-bearing.

The probe was extended after this run with an **"Ask for permanent storage"** button
calling `navigator.storage.persist()`. **Result: denied.** Persistence is not available
to her, so browser storage can be cleared or evicted at any time and §6's backup layer
carries the entire safety burden.

**Decision (Brenden, 2026-08-25):** accepted. Backup is manual — she saves to a file.
No automatic mirror is required for v1.

Worth noting how cheap that is to make good: because the stored file handle proved
reusable **with no permission prompt**, "save a backup" can write straight back to the
same file she picked once — one button, no dialog, no download folder, and it can live
in her Google Drive for Desktop folder. That is the mirror's entire benefit on a manual
trigger, which is what was asked for.

## Caveat 2 — the restart evidence is suggestive, not conclusive

The load log showed **32 seconds** between writing the note and the first load in a new
browser session. A closed window and a fully restarted browser are indistinguishable to
a web page — `sessionStorage` is empty in both cases. 32 seconds is plausible for a real
quit-and-relaunch but fast enough to be worth confirming.

The probe now computes and prints this gap and warns when it is under 25 seconds.
**Re-run wanted:** a genuine quit, ideally a reboot.

---

## Consequence for the build order

**Settled: no automatic mirror in v1.** Backup stays manual, per the decision above.
§10's ordering stands, with one adjustment worth making — build the backup button on
the **File System Access handle**, not on a download. Same effort, no permission prompt
after the first pick, and the file can sit in Drive for Desktop so it syncs off the
laptop on its own.

## Resolved — data survives the app file being replaced or moved

**Answer: yes. `file://` storage is keyed to the shared `file://` origin, not to the
file's path. Shipping her a new copy of the app does not wipe her data.**

Tested 2026-08-25 on Linux, Chrome 147, headless with a persistent profile:

1. A probe page at `…/origin-test/a/probe.html` wrote a token to **both** localStorage
   and IndexedDB.
2. A byte-identical copy at `…/origin-test/b/probe.html` — a different directory — was
   opened in the same browser profile.
3. It read **both** values back: `ls=PROBETOKEN-a-…`, `idb=PROBETOKEN-a-…`.

Corroborating detail from the profile on disk: Chrome created exactly one store,
`Default/IndexedDB/file__0.indexeddb.leveldb`, and the localStorage record is namespaced
`_file://`. Both are named for the origin. A second path produced no second store.

**Consequence:** delivery is just "here is the new file, double-click it." No
export/import dance in the release process, and the update path is not a data-loss risk.

*Confidence note:* this ran on Chrome 147/Linux; hers is Chrome 151/Windows. The
`file://` origin model is Chromium-wide and not platform-specific, so this is expected
to hold — but the first time she gets an updated file, have her confirm her data is
still there before she throws the old copy away. That costs one glance and removes the
remaining doubt.

## Also outstanding

A cleaner restart confirmation (caveat 2). Lower stakes than the path question, which is
now closed.

---

## Not a factor: git

The end user will never interact with this repository. Version history here is for
Brenden alone. Delivery to her is one HTML file she double-clicks — which is exactly
why the update-safety question above matters.
