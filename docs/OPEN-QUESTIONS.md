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

**Assumed meanwhile:** minutes, per the spec's reasoning.

Earlier notes said this was untestable, on the reasoning that every fixture uses 30-minute
slots so both definitions produce identical numbers. That is no longer true, and was never
true of the test that matters: `tests/attendance-derive.test.js`, *minutes, not session
count, decide the percentage*, seeds one 30-minute session held and one 60-minute session
missed — 50% by session count, 33% by minutes — and asserts 33.

So the assumption is pinned rather than floating. **If she says sessions, that one test is
where the answer lands**, along with the `heldMinutes`/`offeredMinutes` arithmetic in
`SLP.derive.attendancePct`. The question is still hers to answer; what changed is that
answering it is now a small, located edit instead of an audit.

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

---

## 6. Over a whole quarter, should the grid show sessions from before a child was in that group?

> The attendance grid fills in every weekday from your current weekly schedule. So if a
> child joined your Monday group in November and you pull up September to December, every
> Monday back to September shows as a session that was scheduled and never written up. The
> same happens if you moved a group from Tuesdays to Thursdays partway through the year.
> Are those sessions you want to see as "not charted yet", or should the grid start each
> child where they actually started?

**Why it matters:** the published percentage is the same either way — uncharted sessions are
out of both lines of it. What changes is the *provisional* flag: the number is set in italics
with "· N uncharted" beside it whenever anything in the range is unwritten. At month scale
that flags the transcription she is genuinely behind on. At quarter scale the backwards
projection fires it on nearly every student, and a flag that applies to everyone stops
discriminating.

Two readings:

- **Bound the projection by when the child joined the slot.** Weekdays before that draw as
  "not scheduled" dots instead of empty boxes, the uncharted counts fall, and a student who
  joined in November shows a plain number over a Q1 range rather than an italic one.
- **Accept it, and read `uncharted` as "not charted, whenever it was scheduled".** The screen
  is unchanged: at quarter scale most students carry italics and a large uncharted count, and
  telling "behind on paperwork" apart from "was not in this group yet" would need something
  the grid does not currently show.

**Assumed meanwhile:** the current behaviour — the weekly schedule is projected across the
whole range, and every unwritten weekday in it counts as uncharted. Not being designed
either way until she answers.
