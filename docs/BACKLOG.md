# Backlog

Action items that are not yet specs, plans, or code. Newest first. When one graduates
into a spec, replace its entry with a link to that spec rather than deleting it.

Decisions that depend on the clinician live in `docs/OPEN-QUESTIONS.md`, not here.

---

## Service requirements, opportunities, and attempt-based makeup debt

**Raised:** 2026-09-06 by Carol Ann · **Status:** designed, not built

The largest change the app has taken on. Design and reasoning are in
`docs/adr/0004-service-requirements-and-attempt-based-debt.md` — read that first; it is not
re-derived here.

In short: a **Requirement** of *N sessions per weekly-or-monthly period* comes off the IEP,
low-cadence students stay on the weekly schedule with their unneeded weekdays drawn as
**Opportunities**, the child's percentage is measured against what they needed, and makeup
debt is counted in **Attempts** rather than minutes.

**Two pieces shipped ahead of the rest in 1.8.0**, because they were one line each and
needed nothing from the model: `attendancePct` now computes in sessions, and
`makeupBalance` credits an attempt the child skipped. What remains is the requirement
itself, the **Frequency** field, opportunity cells, the three percentages, and moving
`owed` off minutes.

---

## Three attendance percentages instead of one

**Raised:** 2026-09-06 by Carol Ann · **Status:** designed, not built

She wants the data sliced three ways, each oriented so 100% is good: *planned attendance*
(attended ÷ planned, makeups excluded), *offered attendance* (attended ÷ offered, makeups
included), and *delivery* (what she provided ÷ what was required). The first two are the
child's record, the third is hers.

This is the existing separation — `missed` and `cancelled` are already kept out of the
child's number — surfaced as three figures rather than left implicit in one. Depends on the
requirement model above.

---

## An ad-hoc session button on Today

**Raised:** 2026-09-06 by Carol Ann · **Status:** ready to design

> "she should be able to hit an 'ad-hoc session' button at top of the today page that lets
> her configure a time and students"

She needs to hold a session for one or more students without permanently adding it to the
weekly schedule. It must behave as a real session — chartable, note-carrying — not a
reminder.

The domain already has **Ad-hoc session** and `deleteSlot` already folds orphaned sessions
back into Today through that path, so the model supports this; the affordance is what is
missing. Note the interaction with attempt-based debt: adding a student to a session they
were not scheduled for *is* an attempt, so this button repays debt as a side effect of
ordinary use. That is intended, per ADR 0004.

---

## Marking a whole day as "school closed"

**Raised:** 2026-09-06 by Carol Ann · **Status:** ready to design

She wants to mark a day closed dynamically, for one school or for all schools at once.

Settled: **a closure creates no makeup debt** — she does not owe that time. Not settled:
whether a closure reduces a student's monthly **Requirement** or leaves them reading zero of
two. That is question 1 in `docs/OPEN-QUESTIONS.md` and this cannot ship without it.

---

## "I missed it" exists and she could not find it

**Raised:** 2026-09-06 by Carol Ann · **Status:** ready to design

She reported no clear way to mark a session she missed. It has been there the whole time:
the attendance grid's cell popover offers **"Whole session: I missed it"** below the divider
(`index.html:3095-3097`), sweeping the roster without overwriting marks she made by hand.

So this is discoverability, not a missing capability. The likely fix is surfacing it on
**Today**, where the miss actually happens, rather than in the attendance grid afterwards —
but where she went looking is question 3 in `docs/OPEN-QUESTIONS.md` and should be confirmed
before building to the guess.

---

## Deleting a slot hides sessions already charted against it

**Raised:** 2026-09-03 by audit · **Status:** done, 2026-09-03 (`11c9950`)

`deleteSlot` now nulls the `slotId` on the sessions that referenced it, so the existing
ad-hoc path folds them back into Today. A session whose slot is gone genuinely has no
template any more, and it renders from the time, roster and location snapshot it already
carries. Three regression tests.

The workaround this trap sat behind — deleting and recreating a slot to fix its time — is
still the only way to change a slot's time. That is now unblocked — see the three actions
under "A schedule slot's time cannot be edited" above.

---

## A schedule slot's time cannot be edited

**Raised:** 2026-09-02 by Carol Ann · **Status:** unblocked 2026-09-06, ready to design

> If you put the time in wrong for your schedule, I can't edit it,
>
> So I wrote my note and then realized it was the wrong time
>
> I can't go and fix that without deleting the session and then have to retype the notes

**Answered 2026-09-06.** It is not one action but three, and she needs all of them:

1. **Correct a typo** — the time has always really been 9:30 and she typed 9:00. Fixing it
   *does* reach back and correct the sessions already written up. This is the one behind her
   complaint above.
2. **Move the group permanently, going forward** — history stays as it happened.
3. **Move a single session** — this week only, the slot untouched.

Only (1) rewrites history, so only (1) needs to be deliberate about it. Note this reverses
nothing about the existing rule: the schedule is still a plan and a written-up session is
still history. What changes is that correcting a *mistake in the plan* becomes an explicit
act she can take, rather than something the app refuses and she works around by deleting and
retyping.

---

## Deferred, still true

- ~~**The `chart()` percent axis is hardcoded at 100**~~ — done 2026-09-03 (`4c700b7`). The
  ceiling rises to the highest datapoint and a dashed line marks 100%, per
  `docs/adr/0003-objective-charts-scale-past-criterion.md`.
- **The day-long tab-through** is still deferred.
- ~~**The Today collapse has never been confirmed by hand**~~ — confirmed 2026-09-06. Asked
  whether she would rather everything opened on load; she loves it as it is. Collapsed by
  default stays, and this is settled rather than merely untested.
- ~~**The scroll fix's two untested cases**~~ — done 2026-09-03 (`6cecef4`). Paging to a
  different day was preserving the offset and now starts at the top. The shrinking-content
  case turned out not to be a bug: a drastic shrink already lands at the top by clamping,
  and keeping her at the clamped bottom of a moderate one is deliberate — the alternative
  throws her to the header whenever she collapses a card at the end of a long day. Both are
  pinned in `tests/scroll-restore.test.js` so the reasoning is not re-derived.
- **Stage 2 of attendance** (service targets, forward projection) is **unblocked as of
  2026-09-06.** The IEP carries columns for # sessions, frequency (weekly vs monthly),
  weeks/year, length in minutes, and minutes per week. The design that came out of it is
  `docs/adr/0004-service-requirements-and-attempt-based-debt.md`.
