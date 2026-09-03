# Questions for Carol Ann

Decisions that depend on how her practice actually works. An agent must not answer these by
inventing a reasonable-sounding default — where work had to proceed anyway, the assumption
made is recorded so it can be corrected cheaply.

Phrased for asking her directly. When one is answered, fold it into the spec and delete it
here.

---

## 1. When you report an attendance percentage, is it out of *time* or out of *sessions*?

> If a child was scheduled for four sessions — three half-hour ones and one that ran a full
> hour — and came to everything except that long one, is that 75% (three of four sessions)
> or 60% (90 minutes of 150)?

**Why it matters:** it is the definition of the headline number on her progress notes.

**Assumed meanwhile:** minutes, per the spec's reasoning. **This is currently untestable** —
every fixture uses 30-minute slots, so both definitions produce identical numbers and the
suite cannot tell them apart. If she says sessions, the attendance percentage work needs
revisiting.

---

## 2. When you fix a slot's time, do you mean "it has always been this" or "from now on"?

> Say your Tuesday group is down as 9:00 but it has really been 9:30, and you have already
> written up last week. Should fixing it correct last week's write-up too, or should last
> week stay as it is and only future weeks move?

**Why it matters:** these need different designs. The app deliberately treats the weekly
schedule as a plan and a written-up session as history, so editing the plan does not reach
back. If she wants the correction to be retroactive, that rule has to change. If she wants
it forward-only, she instead needs a way to fix the time on *the one session she already
wrote up* without losing the note.

**Assumed meanwhile:** nothing. Not being designed until she answers — `docs/BACKLOG.md` is
explicit that this one is gated on asking her.

**Worth telling her:** her current workaround has a trap. Deleting the slot and recreating it
makes the already-written session disappear from Today entirely. The note is not destroyed —
it is still on the student's page — but it becomes read-only there, which is why she ends up
retyping. That defect is being fixed regardless of how she answers.

---

## 3. Does the Today page open the way you want it?

> Each student's data-entry grid starts folded away, so you see the note first and open the
> grid when you want it. Is that the right way round, or would you rather everything was open
> when the page loads?

**Why it matters:** the current behaviour came from Brenden's reading of her workflow, not
from her using it. It has also never been confirmed by hand.

**Assumed meanwhile:** left as it is. Not changing it without her.

---

## 4. When you book a makeup, what should it suggest by default?

> Does it make sense to default to that child's usual session time, or is a makeup something
> you always fit into a specific free period?

**Why it matters:** the plan invents an 11:00 start on the next weekday, which is a guess
about her timetable.

**Assumed meanwhile:** defaulting to the student's own usual slot time rather than a fixed
11:00, falling back to 11:00 where they have no slot. Easy to change.

---

## 5. How do your IEPs phrase the required service amount?

> Word for word, how is it written — minutes per week, sessions per month, minutes per
> grading period?

**Why it matters:** gates Stage 2 of attendance (service targets and forward projection).
Nothing depends on it yet.

**Assumed meanwhile:** nothing. Stage 2 is not being built.
