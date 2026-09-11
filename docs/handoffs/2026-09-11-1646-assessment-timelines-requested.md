# Handoff — "I missed it" shipped, and assessment timelines is the next build

**Written:** 2026-09-11 16:46 UTC · **Branch:** `main` · **HEAD:** `0c802dc` ·
**Previous handoff:** `2026-09-08-0102-per-student-colour-question-open.md`

---

## Start here

Read `docs/AUTONOMY.md` first. Its rules all still stand verbatim and are not repeated here.

**One feature shipped and is pushed. One is requested and unstarted.** Nothing is
half-done and the tree is clean. Resume at the assessment-timelines design, which has not
begun — no spec, no plan, no code.

The previous handoff's subject, **per-student column colour, is superseded but not
rejected.** Brenden picked it off a "what could come next" list; Carol Ann has since asked
for two real things. Her requests outrank an idea we generated. The colour framing in that
handoff is still the best statement of that problem if it comes back.

## What shipped — 1.11.0, pushed

`0c802dc` — "I missed this session" on Today. The commit message carries the full
reasoning; `docs/BACKLOG.md` carries the entry. Do not re-derive either.

The short version: the sweep itself was as old as the attendance grid and the arithmetic
was already right. What shipped is the doorway, at the moment the miss happens. It closed
**question 3 in `docs/OPEN-QUESTIONS.md`**, which is deleted; two questions remain there.

`main` is level with `origin` and GitHub Pages serves it. **Promotion still has not
happened and is not yours to do** — `tmp/note-for-her.md` stays unsent. See
`docs/DELIVERY.md`.

## What was requested and not built: assessment timelines

This is the next build. It is **architectural** — a new record with its own store, shown on
more than one screen — not a field on the student.

Her words, from Brenden's relay of a text thread on 2026-09-11, kept verbatim because the
nine component names and the framing are the requirement:

> could you add something to the website to help me with assessment timelines
>
> Something simple like I put in the date of the IEP meeting and it calculates when I need
> to have the assessment done? I know it's probably something very simple that I could do
> myself, but it would just be nice to have that exist.
>
> So for example, I just ordered an assessment for a student and I have 60 calendar days to
> complete it. So I would love to just type in the date of the student. The students
> assessment got ordered and it spit out when I need to have the assessment completed.
>
> And then it would be cool if I could then track each component of the assessment and kind
> of just check it off whenever it's complete
>
> Like -background history -classroom observation -language sample, -narrative sample,
> -formal assessment, -teacher interview, -assessment written, -assessment uploaded, -
> assessment billed
>
> Cause now I have to report the dates I do all of these things to Medicaid
>
> Which is fucking dumb

Brenden asked her what "type in the date of the student" meant. She answered **"Like the
date we ordered the assessment."** He proposed *a field like "original date assessment
ordered", and then a calculated 60 days later that you can easily see on different
screens*, and she agreed.

### What is settled and what is not

**Settled, from her own words twice plus a direct confirmation:** the clock runs from the
date the assessment was ordered, 60 **calendar** days.

**Settled:** the nine components each need a **date**, not a checkmark. She has to report
the dates to Medicaid. A checkbox would lose the thing she asked for.

**Open, and hers to answer, not Brenden's:** her first message anchors the calculation to
**the IEP meeting date** and her later ones to **the order date**. Those are different
clocks. It was put to Brenden this session and he had no preference, which makes it a
question about how her practice works — `docs/AUTONOMY.md` says the clinician decides
those. **It is not yet written into `docs/OPEN-QUESTIONS.md`; write it there.** The
standing call, made explicitly so it is not mistaken for a guess about her practice: build
the order-date clock, which is not in dispute, and leave the IEP meeting date out entirely
until she answers whether it is a second deadline or just how she first described the same
one.

**Not yet asked at all**, and worth putting to her in the same message:

- Is 60 always 60, or does it vary by district, state or assessment type?
- Is the list of nine components fixed, or does she add to it?
- Can a student have more than one assessment over time? Triennial re-evaluations suggest
  yes, which decides whether this is one record per student or many.

### What the code says, so the next session need not re-read it

- **Adding a store is cheap.** `SCHEMA` at `index.html:414` is a map of store name to index
  list, and the `onupgradeneeded` handler below it is additive and idempotent — it creates
  any store not already present. Adding one means an entry in `SCHEMA` and a bump of
  `DB_VERSION`, nothing more.
- **`SCHEMA_VERSION` (`index.html:1586`) is a separate number** that rides in the backup
  file. Check what the backup and restore paths do with a new store before assuming her
  existing backup file still restores.
- **The student record is `{ id, name, grade, school, background }`** with no assessment
  field (`index.html:633`). The model factories all sit together there; follow their shape.
- **`renderDetail` (`index.html:2529`)** builds the student page out of `section.panel`
  blocks. That is where a per-student assessment block would go.
- **Exactly two field types, number and text** — an `AUTONOMY.md` constraint. A date input
  is not a third *objective field type*, but check that framing holds before leaning on it.

## The one thing noticed and deliberately not touched

The attendance grid draws a miss in `--warn` amber (`index.html:307`). Today's state chip
for the same fact falls through to `--muted` grey, identical to "not charted" except for
the word. 1.11.0 makes her see that chip daily, so the disagreement now matters.

It is not a quick swap: `--warn` on white is about 3.6:1, under the 4.5:1 floor for 12px
text, and `AUTONOMY.md`'s "quiet is not invisible" rule applies. It needs a real choice.
Raised with Brenden, not assigned.

## State, verified this session

`main` at `0c802dc`, tree clean, level with `origin` (0/0). Suite **452/452, 0 failed** —
run in full, three times this session, summary line read each time.

Verified beyond the suite, per `AUTONOMY.md`, with `tmp/cdp-shot-missed.js` at 49 students
and eight in the session: the three-control slot head fits unclipped at 1280 and 760, seven
swept students each owe 30 minutes, the child marked absent by hand owes nothing, and no
student outside the session moved. Screenshots are `tmp/missed-*.png`.

**The local app database is wiped** — the suite runs did it. Restore from
`tmp/slp-test-data.json` through the backup UI. Settled; do not re-raise.

## What could come next

Assessment timelines is the assigned one. Otherwise the previous handoff's list is
unchanged: the requirement model (ADR 0004) is still the big deferred build, per-student
colour is still a conversation rather than a ticket, and the missed-chip colour above is
new to the list.

## Verify before acting

No state-verification script in this repo.

```bash
git -C /home/brenden/dev/slp-tracker rev-parse --abbrev-ref HEAD   # main
git -C /home/brenden/dev/slp-tracker status --short                # expect clean
git -C /home/brenden/dev/slp-tracker log --oneline -3              # this handoff on top of 0c802dc
bash /home/brenden/dev/slp-tracker/tests/run-tests.sh              # 452 tests, 0 failed (~2 min)
```

## Suggested skills

- **`superpowers:brainstorming`** — assessment timelines classifies as architectural, so it
  is the full path: questions, approaches, a sectioned design, a spec under
  `docs/superpowers/specs/`, then `writing-plans`. Do not start at an implementation.
- **`superpowers:test-driven-development`** — the house style here. Watch every test fail
  first; `throws()` alone proves nothing, so assert the message names what was rejected.
- **`superpowers:verification-before-completion`** — a green suite is blind to layout,
  scroll, timing and fixture size. Copy `tmp/cdp-shot-missed.js` for the visual pass.

## One operational note

Brenden often reads from his phone — short, scannable answers earn their keep. **Never
prefix a shell command with `cd`**; every tool here takes a path (`git -C <repo>`, absolute
paths). Quote paths containing `(`, `)`, `[`, `]`. Do not write files via shell redirection
or `sed -i`; use the Write/Edit tools. Dispatched subagents do not reliably inherit his
global `CLAUDE.md` — restate this in every dispatch prompt.

## Repo state

`/home/brenden/dev/slp-tracker`, branch `main`, remote `origin`
(`git@github.com:brendenriggs/slp-tracker.git`, **public**). GitHub Pages serves `main` at
https://brendenriggs.github.io/slp-tracker/. `tmp/` and `.superpowers/` are gitignored and
exist on this machine only.
