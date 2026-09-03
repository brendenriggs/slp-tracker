# Backlog

Action items that are not yet specs, plans, or code. Newest first. When one graduates
into a spec, replace its entry with a link to that spec rather than deleting it.

---

## A schedule slot's time cannot be edited

**Raised:** 2026-09-02 by Carol Ann · **Status:** captured, not yet processed —
no design, no scope, no estimate. Deliberately deferred.

Her note, verbatim:

> If you put the time in wrong for your schedule, I can't edit it,
>
> So I wrote my note and then realized it was the wrong time
>
> I can't go and fix that without deleting the session and then have to retype the notes

**Confirmed in the code, 2026-09-02.** `index.html:1322–1336` renders each slot card with
its time as plain text (`h('div', { class: 'slot-time', text: ... })`) and exactly one
control: **Delete**. There is no edit path for `startTime`/`endTime`, on the slot or
anywhere else. `slotForm` (`index.html:1304`) only ever creates.

Two things worth noticing before anyone designs a fix, because they are not the same
problem and she has run into both at once:

1. **The slot has no editor.** That is the literal request.
2. **Her charted work does not survive the workaround.** `deleteSlot` toasts *"Sessions
   already charted are untouched"*, yet she reports retyping her notes. Either the toast
   overpromises or the recovery path is not discoverable. **Find out which before
   designing anything** — if it is the second, an edit button alone will not have fixed
   what actually hurt her.

Then process it the way the last two of her requests were processed, which worked:

1. `superpowers:brainstorming` — her requests have needed real clarification every time.
   Requirements moved four times during the original design, and the attendance spec had
   the reporting period wrong for two sessions running because monthly was *inferred* from
   the shape of her paper form rather than asked about. Ask.
2. Classify honestly. The Today-collapse request arrived exactly this way and was correctly
   handled on the bounded path; the attendance work was architectural and needed a spec.
3. If it turns out architectural, it takes its own spec in `docs/superpowers/specs/`, and
   it queues *behind* the attendance work rather than interleaving with it.

**Note for whoever picks this up:** she is actively using the app and her requests arrive
mid-session. That is normal here and not a reason to drop what is in flight — the
attendance plan is ten tasks deep and half-finishing it is worse than starting late.

---

## Deferred, still true

Carried forward from the handoffs so they stop living only in prose:

- **The `chart()` percent axis is hardcoded at 100**, so a datapoint above criterion draws
  outside the plot area. Explicitly out of scope for the attendance plan.
- **Goal deletion** — handled separately from the attendance work.
- **The day-long tab-through** (attendance plan's predecessor, Task 14 Step 5) is still
  deferred.
- **Neither the scroll fix nor the Today collapse has been confirmed by hand.** Both are
  the kind of behaviour a green suite agrees with while still feeling wrong in use.
- **Stage 2 of attendance** (service targets, forward projection) is blocked on her answer
  to how her IEPs phrase required service minutes.
