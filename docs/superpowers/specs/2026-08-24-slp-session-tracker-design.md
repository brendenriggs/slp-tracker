# SLP Session Tracker — Design

**Date:** 2026-08-24
**Status:** Draft for review. Data model has open questions (see §8).

---

## 1. The ask

An app for a school-based speech-language pathologist to run her caseload. It
replaces a scatter of paper, spreadsheets, and memory with one place that
answers three questions:

1. **Who did I see, and when?** — take attendance fast, against a schedule that
   repeats every week.
2. **How is this student doing?** — every note and number she has ever recorded
   for a student, in one place, over time.
3. **What am I teaching them?** — lesson plans queued per student, informed by
   what that student's grade is covering in the curriculum this week.

The third is Phase 2 and is not designed here (see §7).

The core insight from the original notes: **she enters data once, in the place
where the work happens, and it aggregates everywhere else automatically.** She
charts a session; that session appears on the student's history, marks them
present, and feeds their progress chart. She never copies anything twice.

## 2. Who it's for, and the constraints

Single user. School district laptop, district Google Workspace account.

| Constraint | Source | Consequence |
|---|---|---|
| Runs as a raw HTML file | Stated requirement | No build step, no server, no install. Double-click to open. |
| Data lives locally | Decided 2026-08-24 | No OAuth, no Google API, no admin approval needed. |
| Backed up to Google Drive manually | Decided 2026-08-24 | Export/import is a first-class feature, not an afterthought. |
| Student IEP data is FERPA-protected | Inherent | Data stays on the district machine and in the district Drive. No third-party services, no telemetry, no CDN calls. |
| **She is never at a computer during a session** | Corrected 2026-08-24 | This is not a live-capture app. It is a transcription app. Optimize for batch back-fill from paper, keyboard-first. |

That last row is the most important line in this document. It invalidated an
entire screen design and should be the first thing checked against any future
UI proposal.

## 3. Decisions locked

- **Groups, not 1:1.** A time slot holds N students. Notes and data are recorded
  per student, so they aggregate to the right person.
- **The recurring schedule is a template, not history.** Sessions snapshot their
  own date, time, and roster. Editing the weekly schedule never rewrites the
  past, which removes any need for schedule versioning or effective-date ranges.
- **Sessions materialize on write, never on read.** A session record is created
  the moment she changes something. Browsing a future day stays read-only, so
  future rosters keep tracking schedule edits.
- **Attendance derives from data entry.** Entering any number or note marks that
  student present. Absent is an explicit control. "Nothing entered" is a third,
  visible state meaning *not charted yet*.
- **Goal and objective text is pasted once and shown forever.** She pastes the
  IEP text on the student record; it appears in every session for that student
  so she can see what she is measuring while she writes the note.
- **An objective normally has several number fields.** Multiple integers is the
  common case, not an edge case. Progress is charted per objective only.
- **Local-first, hybrid persistence.** IndexedDB is the source of truth. Manual
  download/restore backup always available. If the File System Access API works
  on her machine, she links a file in her Drive-synced folder once and the app
  mirrors to it automatically.

## 4. Data model

### Caseload

- **Student** — name, grade, school, active flag, free-text background.
  Deactivating is how a student leaves the caseload; history survives.
- **Goal** — belongs to a student. Students have 1–2. The full IEP goal text,
  pasted verbatim. Long, boilerplate-heavy, contains a `STUDENT` placeholder
  that the app substitutes with the student's name for display.
- **Objective** — belongs to a goal. Goals have 2–3. Also pasted verbatim.
  **This is the unit data is collected against.**

### Data shape (see §8 — this is the unsettled part)

Each **Objective** declares a small, flat list of **fields**. A field is either
a **number** or **free text**. That is the entire type system — confirmed
2026-08-24, "qualitative" meant free text, nothing more.

**An objective can have several number fields, and this is the normal case, not
the exception.** The default preset is two of them:

| Field | Type | Example |
|---|---|---|
| `Trials completed` | number | `3` |
| `Trials # goal` | number | `4` |
| `Notes` | text | *"needed 2 verbal models, distracted by fire drill"* |

She can add, rename, or remove fields on any objective whose shape differs.

**Number fields carry an optional default, set when she creates the objective.**
`Trials # goal` gets a default of `4`; every session pre-fills it, and she
overrides it on the sessions that ran differently. Fast in the common case,
honest in the exception — the session where a student melted down after two
trials records `2 / 2` rather than a misleading `2 / 4`, and the free-text note
explains the gap.

This replaces the stored `criterion` structure from an earlier draft. The target
is a normal field with a default, not a separate concept.

> **A pre-filled default is not data entry.** Two rules depend on this and would
> both break silently if it were ignored:
>
> - **Attendance must not auto-mark from a default.** Attendance derives from
>   fields she actually touched. If defaults counted, every student on the
>   caseload would flip to *present* the instant a day rendered.
> - **The `8 of 11 sessions charted` counter must not count defaults either**, or
>   an untouched day would report itself complete.
>
> So a field tracks whether its value was *entered* or merely *pre-filled*. The
> distinction is invisible to her and load-bearing for the app.

**Why configurable rather than fixed:** the described shape changed four times
during design — one integer, then several integers, then per-goal, then
"varying kinds of qualitative and quantitative data" per objective. A fixed
schema would be wrong again by October. A declared-fields model is wrong-proof
at the cost of setup ceremony.

**Cap it deliberately.** Numbers and short text only. Flat, no nesting. No
conditional logic. No computed fields beyond the percentage implied by a
number-with-denominator. The failure mode of this design is becoming a form
builder, at which point she is doing data modeling instead of therapy. Presets
do the real work; custom fields are the escape hatch.

### What actually happened

- **Session** — a real occurrence on a real date. Snapshots its date, time, and
  roster. Created lazily.
- **Attendance** — one per student per session. Status (`present` / `absent` /
  `excused` / `cancelled`), plus `participation` (`scheduled` / `added`) and an
  `isMakeup` flag.
  *Makeup lives here, not on the session,* because three regulars plus one
  drop-in is one session where makeup-ness applies to a single student.
- **Note** — one per student per session, free text.
- **DataPoint** — one per objective per student per session. Holds the values
  for that objective's declared fields.

### Schedule

- **ScheduleSlot** — the recurring template. Day of week, start/end time, a list
  of student IDs, optional location.

### Derived, not stored

**Progress is measured only within a single objective, over time. Never across
objectives.** Confirmed 2026-08-24. This is a real simplification, not just a
scoping note: nothing needs to be normalized, no two numbers need to be
comparable, and a number field means whatever she says it means on that
objective. Each objective gets its own chart with its own scale, and that is the
only comparison the app ever makes.

Derived from that:

- **Ratio** — when an objective uses the default preset, the app knows which
  field is achieved and which is target, so it can show `3 / 4 · 75%` and chart
  the percentage over time.
- **Mastery** — her goal text says *"in 3 out of 4 trials across three
  sessions."* With a paired preset, the app can show `met criterion in 2 of 3
  consecutive sessions` without her tracking it by hand.

**The presets carry the semantics, not a separate configuration step.** Picking
`Trials completed / Trials # goal` wires the pairing automatically. Custom
number fields are simply charted as their own independent lines. This is what
keeps the field system from turning into a form builder: she never tells the app
what a field *means*, she just picks a preset or doesn't.

## 5. Views

### Today — the transcription screen

Date header with prev/next and jump-to-today. The day's slots in time order,
built from the recurring template plus any ad hoc sessions, **expanded by
default** — she is filling all of them in, not hunting for one.

Down the page: student, then their goal, then a row per objective with whatever
fields that objective declares. Tab moves to the next field in reading order,
through the entire day, without touching the mouse.

**The goal and objective text is on screen while she charts.** She pastes it
once when setting the student up; it then appears in every session for that
student, automatically, so she can see what she is actually measuring while
writing the note. This was an explicit request and it drives a layout problem
worth solving deliberately.

*The problem:* the real text is ~60 words of IEP boilerplate per objective. Three
objectives per student, three students per group, and the entry screen is a wall
of legalese with a few input boxes lost in it.

*The treatment:*

- **Truncate to one line by default,** expanding on click or focus. The
  distinguishing part of an objective is usually its middle clause — *"identify
  common objects when described"* — not the shared preamble, so the truncated
  line is genuinely useful, not decorative.
- **Substitute `STUDENT` with the student's actual name** for display. Her
  pasted text contains the literal placeholder.
- **Show the goal once per student**, collapsed, rather than repeating it above
  each of its objectives.
- **Never let the text push the input fields off screen.** Fields stay in a fixed
  column position so the tab-through rhythm is identical for every student
  regardless of how long their goal text is.

- Autosave on change. No save button, no modals, nothing that can eat a note.
- Absent is a tab-reachable control that greys out that student's objective rows
  but keeps the note box — she often needs to log *why*.
- A completion indicator up top: `8 of 11 sessions charted`, so she can see what
  she still owes.
- `+ Add student` on any slot pulls a caseload member into **that session only**.
  They get an `added` chip and behave identically otherwise. Works because the
  session owns its roster; next week's slot is untouched.
- Removing a student from a session exists but is the awkward path — for a
  scheduled kid who did not show, the correct record is **Absent**, since
  service-minute documentation depends on the miss being visible. Removal
  confirms before discarding anything already charted.

### Students — the aggregation tab

Searchable caseload list, then per student:

- **Goals and objectives**, editable in place, `STUDENT` substituted for display.
- **Progress** — per objective, values over time. Number fields with a
  denominator chart as a percentage; without one, on their own scale. Text
  fields do not chart. Mastery status shown per objective.
- **Session history** — reverse chronological: date, time, attendance, note, and
  the data collected. Filterable by date range, which is effectively "generate
  my quarterly progress report."

### Schedule — set it in September, forget it

Weekly grid, Monday–Friday by time. Add/remove slots, set times, assign
students. Ad hoc sessions are *not* created here — they belong to Today.

## 6. Persistence and backup

**IndexedDB is authoritative.** All reads and writes go there; the app is never
blocked on disk or network.

**Manual backup, always available.** A "Back up now" button downloads
`slp-data-YYYY-MM-DD.json`. A "Restore" button reads one back. A banner nags
when the last backup is more than a few days old.

**File mirror, when available.** If the File System Access API works, she picks
a file once — ideally inside her Google Drive for Desktop folder — and the app
mirrors to it after every session. With Drive Desktop installed, backup becomes
automatic and invisible. If the API is unavailable, this layer simply does not
appear and the download button carries the load.

**Build order matters here:** the manual layer ships first and is not throwaway,
because it is the fallback the mirror needs anyway.

**Known risk:** browser storage on a `file://` origin has been historically
inconsistent in Chrome, and "Clear browsing data" can wipe it. This must be
verified on her actual district laptop **before** the app is built around it.
It is the single highest-priority unknown in this document.

## 7. Out of scope

**Phase 2 — curriculum and lesson planning.** Feeding the curriculum in so the
app can show what each grade is covering in a given week, surfacing that on the
student tab alongside queued lesson plans, and an add-lesson-plan flow with
recently-used items sorted to the top. This depends on Phase 1's student model
existing but is otherwise independent, and gets its own design pass.

Note for that pass: "feed AI the curriculum" should almost certainly mean
processing the curriculum **once, ahead of time**, into a grade-and-week lookup
table shipped inside the file — not a runtime API call, which would require an
API key embedded in an HTML file on a district laptop.

**Not building now, deliberately:**

- School-year rollover. The `active` flag on Student covers the immediate need.
  A real rollover tool is speculation about a workflow neither of us has seen.
- Linking a makeup session to the specific session it makes up for. Nothing
  downstream needs the relationship; the label carries the meaning.
- Multi-user, sharing, sync between devices. Single user, one machine.

## 8. Questions resolved

All four open questions were answered on 2026-08-24. Recorded here with what
they changed, because the answers are load-bearing.

| Question | Answer | What it changed |
|---|---|---|
| What do the numbers mean? | Whatever that objective says they mean. **Progress is compared only within one objective, over time — never across objectives.** | Removed all need for normalization or comparable scales. Each objective owns its chart. |
| Is the target fixed or per-session? | **Both.** A number field carries an optional default set at objective creation; she overrides it on any session that ran differently. | Replaced the stored `criterion` structure with a plain field default. Introduced the entered-vs-pre-filled distinction (§4). |
| What is "qualitative" data? | **Just free text.** No cue-level ratings, no ordinal scales. | Field type system is exactly two types: number and text. Nothing more to build. |
| Should typing "absent" mark absent? | **No — it only needs to be fast.** | One tap plus a keyboard shortcut. No free-text parsing, no false positives. |

Two of these made the design *smaller*, which is the outcome to want from a
question. The "qualitative" answer deleted a whole field type; the
progress-comparison answer deleted normalization logic that would have been
subtly wrong forever.

**One process note worth keeping.** The abstract description of this data moved
four times in ten minutes, while a single concrete artifact — the IEP goal text,
pasted verbatim — settled more than every abstract description combined. If a
future question stalls, ask for the artifact, not the description.

## 9. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| `file://` browser storage blocked or wiped by IT | **High** — total data loss | Verify on her laptop before building. Aggressive backup nagging. File mirror if available. |
| Configurable fields degrade into a form builder | Medium — she stops using it | Hard cap on field types. Presets carry the common case. |
| Requirements keep moving | Medium — rework | Field model absorbs shape changes without code changes. |
| Single HTML file grows unmaintainable | Low–medium | Keep clear sectioning within the file. Revisit only if it actually becomes a problem. |

## 10. Build order

1. **Verify `file://` storage on her actual laptop.** Everything else is
   contingent on this. Do it first, before writing app code.
2. Data model + IndexedDB layer + manual backup/restore.
3. Schedule view — she needs a caseload and a weekly grid before anything else
   is usable.
4. Students view — goals, objectives, field definitions.
5. Today view — the transcription grid. The heart of the app.
6. Aggregation — session history, progress charts, mastery tracking.
7. File-mirror backup layer, if the API is available.
8. Phase 2, separately designed.

Steps 2–6 produce something she can use for real. Ship it to her at that point
and let a month of actual use answer §8 better than any interview will.
