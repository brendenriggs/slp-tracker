# SLP Session Tracker

A single-file app for one school speech-language pathologist to record therapy sessions,
chart progress against IEP objectives, and produce the attendance figures her progress
notes require.

## Language

### People and scheduling

**Clinician**:
The speech-language pathologist who owns the app and enters every record.
_Avoid_: user, therapist, SLP (in prose)

**Student**:
A child on the clinician's caseload.
_Avoid_: client, kid, case

**Caseload**:
The set of active students. Not a screen — it lives inside Students.

**Slot**:
A recurring weekly appointment template: a weekday, a start and end time, a location, and
a roster of students.
_Avoid_: appointment, timeslot, class

**Session**:
One dated occurrence of therapy, materialized the first time anything is entered against
it, snapshotting the slot's times, location and roster.
_Avoid_: visit, meeting, appointment

**Ad-hoc session**:
A session belonging to no slot — a makeup, or a one-off. Identified by its own id, never
by slot.

**Roster**:
The students attached to a slot or, once snapshotted, to a session.

### Attendance

**Offered**:
Minutes of session the clinician actually presented to a student — those she held plus
those the student was absent from.

**Held**:
Minutes of offered session the student attended.

**Attendance percentage**:
Held over offered across the selected range, excluding anything dated after today.
_Avoid_: attendance rate, presence

**Uncharted**:
A session with nothing entered against it — a real third state, never a silent present.

**Makeup**:
A session booked to repay time the clinician owes a student.

**Makeup debt**:
Minutes the clinician owes a student for sessions she missed, shown as `Owed`.
_Avoid_: owed time, credit, balance

### Charting

**Goal**:
An IEP aim for a student, holding one or more objectives.

**Objective**:
A measurable target under a goal, and the unit progress is charted against.

**Datapoint**:
One session's measurement for one objective.

**Criterion**:
The objective's target — the 100% line on its chart.

**Charted**:
An objective has a datapoint for a session. Distinct from *entered*.

**Entered**:
The clinician actually typed a value. A pre-filled default is never entered.

**Note**:
Free text the clinician writes about a session.

### Delivery

**Beta**:
The hosted app while the clinician has not been given its URL. Nobody is watching it.

**Promotion**:
The single act of giving her the URL, which turns the hosted app into the copy she works
in. Requires a data migration, because her records do not cross origins.

## Relationships

- A **Slot** recurs weekly and materializes many **Sessions**
- A **Session** belongs to at most one **Slot**; an **Ad-hoc session** belongs to none
- A **Session** carries one **Note** and many **Datapoints**
- A **Student** has many **Goals**; a **Goal** has many **Objectives**
- A **Datapoint** measures one **Objective** in one **Session**
- **Attendance percentage** and **Makeup debt** are both computed per **Student** over a
  chosen date range

## Example dialogue

> **Dev:** "If she fixes a **Slot**'s time, does last week's **Session** change too?"
>
> **Clinician:** "No — the **Slot** is my weekly plan. Once I've written the note, that
> **Session** is what happened. Changing the plan shouldn't rewrite history."
>
> **Dev:** "So when a **Session** she *missed* gets repaid, that repayment is a **Makeup**
> — and it counts as **Offered** like any other session?"
>
> **Clinician:** "Right. If I hold it, the child attended. What I missed isn't the child's
> attendance problem — that's my **Makeup debt**, and it's a separate number."

## Flagged ambiguities

- **"Missed" means the clinician missed it**, not the student. A student who did not come
  is *absent*. The two land in different places: absence lowers the **Attendance
  percentage**; a miss creates **Makeup debt** and is excluded from the percentage
  entirely.
- **"Percentage of time"** is computed in minutes, per the spec's reasoning — but this has
  never been confirmed with the clinician, and every fixture uses 30-minute slots, so the
  test suite cannot tell minutes from session-count. See `docs/OPEN-QUESTIONS.md`.
- **Slot vs Session** was used interchangeably in early prose. They are distinct: the slot
  is the template, the session is history. Editing one never rewrites the other.
