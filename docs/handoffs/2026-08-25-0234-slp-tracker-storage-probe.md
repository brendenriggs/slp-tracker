# Handoff — SLP Session Tracker: storage probe

**Written:** 2026-08-25 02:34 UTC
**Next focus:** Build the `file://` storage test page. Nothing else.

---

## Where things stand

Design is **finished and approved**. All open questions resolved. No code written yet.

- **Spec:** `docs/superpowers/specs/2026-08-24-slp-session-tracker-design.md` — read this first, it is the source of truth.
- **Published version:** https://claude.ai/code/artifact/a1a69fb0-acbb-40ee-866d-a2745b8c8f92 (source: `docs/superpowers/specs/slp-session-tracker.html`, republish the same path to update in place).

Do not re-derive the design. It survived four rounds of requirement churn and the open questions are closed.

## What the next session does

**Only step 1 of the build order: verify browser storage works on her actual district laptop.** The user explicitly deferred everything else.

Everything in the spec is contingent on this. The app is a single HTML file opened by double-click, which means it runs on a `file://` origin, where Chrome has historically been inconsistent about persistent storage — and "clear browsing data" can wipe it. If this fails on her machine, the architecture changes. It is the highest-severity risk in the spec (§9) and step 1 of the build order (§10) for that reason.

### What the test page needs to answer

1. Does **IndexedDB** work from `file://` on her laptop? Write, read back, close the tab, reopen the file, read again.
2. Does the data **survive a browser restart**, not just a tab reload? This is the one that actually matters.
3. Is the **File System Access API** available (`window.showSaveFilePicker`)? If yes, can she actually pick a file and can the page write to it from `file://`? This decides whether the automatic Drive-folder mirror in spec §6 is buildable or whether the manual backup button carries the whole load.
4. Report `navigator.storage.estimate()` and whether the origin is considered secure, for diagnostics.

### Constraints on the test page itself

- Single self-contained HTML file, no network calls of any kind — it will run on a district machine with student data nearby.
- Must be usable by a non-technical person: plain-language pass/fail, big obvious result, explicit "now close Chrome completely, reopen this file, and press Check Again" instruction.
- Results should be copyable as text so she can paste them back.

## Decisions a fresh agent should not relitigate

- **She is never at a computer during a session.** She charts on paper and transcribes later. This is a keyboard-first batch-entry app, not live capture. This fact already invalidated one full screen design.
- Local-first. No Google OAuth, no Apps Script, no server. Manual backup to Drive.
- Data model is Student → Goal → Objective, with data collected per objective. Objectives declare their own fields (numbers and free text only).
- Progress is charted per objective over time, never across objectives.
- Pre-filled field defaults must not count as data entry — see the callout in spec §4. This is the subtle bug to avoid once implementation starts.

## Context worth carrying

The user's wife is the end user and does not have a clear picture of what she wants — requirements moved four times during design. The thing that consistently worked was asking for **a real artifact** (she pasted actual IEP goal text) rather than an abstract description. Use that lever if Phase 2 questions stall.

Phase 2 (curriculum ingestion + lesson planning) is deliberately unscoped and gets its own design pass. See spec §7.

## Repo state

**This is not a git repository.** `/home/brenden/dev/claude` has no git, so this handoff was not committed or pushed. Worth offering to `git init` the `slp-tracker/` directory at the start of the next session — the spec and the app file both want version history, and the `pickup` skill expects a committed handoffs directory.

Files created this session, all under `/home/brenden/dev/claude/slp-tracker/`:

```
docs/superpowers/specs/2026-08-24-slp-session-tracker-design.md
docs/superpowers/specs/slp-session-tracker.html
docs/handoffs/2026-08-25-0234-slp-tracker-storage-probe.md
```

## Suggested skills

- `superpowers:brainstorming` — only if the storage probe fails and the architecture needs rethinking. If it passes, skip it; the design is already approved.
- `superpowers:writing-plans` — once the probe result is in, to turn spec §10 into an implementation plan.
- `artifact-design` — before publishing any updated version of the spec page.
