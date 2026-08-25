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
| Persistent storage (`persisted()`) | **no** — see caveat 1 |

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
calling `navigator.storage.persist()`. That result is **not yet in**. If persistence is
granted, eviction risk largely disappears and the backup nagging in §6 can be gentler.
If denied, §6's nagging and the file mirror carry the entire safety burden.

## Caveat 2 — the restart evidence is suggestive, not conclusive

The load log showed **32 seconds** between writing the note and the first load in a new
browser session. A closed window and a fully restarted browser are indistinguishable to
a web page — `sessionStorage` is empty in both cases. 32 seconds is plausible for a real
quit-and-relaunch but fast enough to be worth confirming.

The probe now computes and prints this gap and warns when it is under 25 seconds.
**Re-run wanted:** a genuine quit, ideally a reboot.

---

## Consequence for the build order

**Recommend promoting the file mirror from §10 step 7 to immediately after step 2.**

The reasoning: the mirror was scheduled last and made conditional on the File System
Access API existing. That API demonstrably exists here, `showDirectoryPicker` is
available too, and a stored handle survives to be reused without re-prompting. Meanwhile
`persisted() === false` means Chrome may drop the authoritative copy at any time.

Building the views first means a month of real session data — student records — sitting
in storage the browser is free to evict, with only a manual button between that and
total loss. The mirror is the safety net, and the net should exist before the data does.

**Not yet applied to the design document.** Brenden's call.
