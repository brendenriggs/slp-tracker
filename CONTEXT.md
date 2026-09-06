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

**Requirement**:
What a student's IEP obliges: a number of sessions per **Frequency** period. Read off the
IEP alongside weeks/year and length in minutes.
_Avoid_: quota, allocation, service level

**Frequency**:
*Weekly* or *monthly*, and nothing else — the IEP's own dropdown, mirrored rather than
reinterpreted. There are no in-between cadences because the source document offers none.

**Offered**:
Sessions the clinician actually presented to a student — those she held plus those the
student was absent from.

**Held**:
Offered sessions the student attended.

**Opportunity**:
A slot projected onto a weekday that a student does not need, because their **Requirement**
is already met or is monthly. Drawn as an unused chance: a state of its own, neither a
to-do nor an absence. It exists because the clinician wants to see where she *could* catch
a low-cadence student.

**Attendance percentage**:
Held over **Requirement** across the selected range, excluding anything dated after today.
Reported three ways, each oriented so 100% is good — *planned attendance* (makeups
excluded) and *offered attendance* (makeups included) are the child's; *delivery* is the
clinician's, and reads what she provided over what was required.
_Avoid_: attendance rate, presence

**Uncharted**:
A session with nothing entered against it — a real third state, never a silent present.

**Makeup**:
A session booked to repay a session the clinician owes a student.

**Attempt**:
A student appearing on a session they were not scheduled for — an ad-hoc session, or being
added to an existing session outside its roster. What repays **Makeup debt**. Holding a
student's own regular session is never an attempt, however well it goes. Derived from the
roster, never a flag the clinician has to set.

**Makeup debt**:
Sessions the clinician owes a student for sessions she missed, shown as `Owed`. Cleared by
**Attempts**: one for a weekly student, two for a monthly one. An attempt repays whether
the student attends or is absent — but not if the *clinician* misses it.
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
- A **Student** has one **Requirement**; a **Requirement** is a session count per
  **Frequency** period
- A **Requirement** accrues by month, and a month it did not meet becomes **Makeup debt**
  carried into the months after
- An **Attempt** repays **Makeup debt**; a **Slot** projection a **Requirement** does not
  need is an **Opportunity**
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
- **"Percentage of time" was resolved on 2026-09-06: sessions, never minutes.** The
  clinician does no partial sessions, so a 60-minute session and a 30-minute one count the
  same. Minutes remain an *input* read off the IEP and are never a figure the app reports.
  **The code has not caught up** — `attendancePct` and `makeupBalance` still compute in
  minutes. See `docs/adr/0004-service-requirements-and-attempt-based-debt.md`.
- **Slot vs Session** was used interchangeably in early prose. They are distinct: the slot
  is the template, the session is history. Editing one never rewrites the other.
