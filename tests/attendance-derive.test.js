// The attendance vocabulary and the arithmetic that comes off it.
//
// Helpers here are prefixed `att` on purpose: tests/index.html loads every
// *.test.js as a classic script into ONE global scope, so a bare `chart()`
// or `row()` here would silently clobber another file's.

test('the status vocabulary is exactly the four outcomes', async () => {
  const w = await loadApp();
  eq([...w.SLP.model.ATTENDANCE_STATUSES],
     ['present', 'absent', 'missed', 'cancelled'],
     'one field carries the outcome, and these are its values');
});

// Asserts the function exists before asserting it throws: otherwise a missing
// model.attendance throws a TypeError and the test passes green having proved
// nothing. See tests/backup.test.js:152-168 for the same convention.
test('an unknown attendance status is refused at construction', async () => {
  const w = await loadApp();
  assert(typeof w.SLP.model.attendance === 'function', 'model.attendance exists');
  const e = await throws(() => w.SLP.model.attendance({
    sessionId: 'se1', studentId: 's1', status: 'excused',
  }), 'a status outside the vocabulary must not reach the database');
  assert(/excused/.test(e.message),
         'named for the bad status, not for a missing function — got: ' + e.message);
});

test('a null status is legal — a makeup booked but not yet held', async () => {
  const w = await loadApp();
  const row = w.SLP.model.attendance({
    sessionId: 'se1', studentId: 's1', status: null, isMakeup: true,
  });
  eq(row.status, null, 'the row exists to carry isMakeup, not an outcome');
  eq(row.isMakeup, true, 'and the makeup flag survives');
});

test('minutesOf measures a span in whole minutes', async () => {
  const w = await loadApp();
  eq(w.SLP.derive.minutesOf({ startTime: '09:00', endTime: '09:30' }), 30, 'half hour');
  eq(w.SLP.derive.minutesOf({ startTime: '09:45', endTime: '10:15' }), 30,
     'and it crosses the hour boundary');
});

test('minutesOf reads a slot and a session identically', async () => {
  const w = await loadApp();
  const m = w.SLP.model;
  const slot = m.slot({ dayOfWeek: 1, startTime: '11:00', endTime: '11:45', studentIds: [] });
  const session = m.session({ date: '2026-10-05', startTime: '11:00', endTime: '11:45' });
  eq(w.SLP.derive.minutesOf(slot), 45, 'a slot has the same shape');
  eq(w.SLP.derive.minutesOf(session), 45, 'so one helper serves both');
});

test('minutesOf returns 0 rather than NaN on unusable times', async () => {
  const w = await loadApp();
  eq(w.SLP.derive.minutesOf({ startTime: '', endTime: '' }), 0, 'blank');
  eq(w.SLP.derive.minutesOf(null), 0, 'nothing at all');
  eq(w.SLP.derive.minutesOf({ startTime: '10:00', endTime: '09:00' }), 0,
     'a backwards span is not negative minutes');
});

test('a null-status row does not read as a state on Today', async () => {
  const w = await loadApp();
  const entry = { attendance: { s1: { status: null, isMakeup: true } },
                  notes: {}, datapoints: {} };
  eq(w.SLP.derive.studentState(entry, 's1'), 'none',
     'booked-but-unmarked is not charted yet — it must not leak a null onto the card');
});

const attMiss = (minutes, isMakeup = false) => ({ status: 'missed', isMakeup, minutes });
const attHeld = (minutes, isMakeup = false) => ({ status: 'present', isMakeup, minutes });

test('a session she missed owes its minutes', async () => {
  const w = await loadApp();
  eq(w.SLP.derive.makeupBalance([attMiss(30)]),
     { debt: 30, credit: 0, owed: 30 }, 'the debt is hers');
});

test('a held makeup pays the debt down', async () => {
  const w = await loadApp();
  eq(w.SLP.derive.makeupBalance([attMiss(30), attHeld(30, true)]),
     { debt: 30, credit: 30, owed: 0 }, 'settled');
});

test('over-delivering is not a balance she can draw down', async () => {
  const w = await loadApp();
  const b = w.SLP.derive.makeupBalance([attMiss(30), attHeld(60, true)]);
  eq(b.owed, 0, 'never a positive credit — she cannot bank 30 minutes against next month');
});

test('missing a makeup adds no second helping of debt', async () => {
  const w = await loadApp();
  // She missed a 30-minute session, booked a makeup for it, then missed the makeup.
  // One skipped obligation. If the makeup counted, she would owe 60 for one miss —
  // and the number would drift upward every time a makeup slipped.
  const b = w.SLP.derive.makeupBalance([attMiss(30), attMiss(30, true)]);
  eq(b, { debt: 30, credit: 0, owed: 30 }, 'the original debt simply stays outstanding');
});

test('nothing but her own misses creates debt', async () => {
  const w = await loadApp();
  const b = w.SLP.derive.makeupBalance([
    { status: 'absent', isMakeup: false, minutes: 30 },
    { status: 'cancelled', isMakeup: false, minutes: 30 },
    attHeld(30),
  ]);
  eq(b, { debt: 0, credit: 0, owed: 0 },
     'a child who stayed home and a district snow day are not her paperwork');
});

test('debt is measured in minutes, not sessions', async () => {
  const w = await loadApp();
  eq(w.SLP.derive.makeupBalance([attMiss(45), attMiss(20)]).owed, 65,
     'two misses of different lengths owe what they were worth');
});

const ATT_TODAY = '2026-10-31';
const attRow = (date, status, minutes, isMakeup = false) => ({ date, status, minutes, isMakeup });
const attPct = (w, rows) => w.SLP.derive.attendancePct(rows, { today: ATT_TODAY });

test('a session she missed stays out of the denominator', async () => {
  const w = await loadApp();
  const p = attPct(w, [attRow('2026-10-05', 'present', 30),
                       attRow('2026-10-12', 'missed', 30)]);
  eq(p.pct, 100, 'her own paperwork must not land on a child’s progress note');
  eq(p.offeredSessions, 1, 'only one session was ever offered to the child');
});

test('a district cancellation stays out of the denominator', async () => {
  const w = await loadApp();
  const p = attPct(w, [attRow('2026-10-05', 'present', 30),
                       attRow('2026-10-12', 'cancelled', 30)]);
  eq(p.pct, 100, 'a snow day is not an opportunity the child declined');
});

test('an absence counts against the child, as it should', async () => {
  const w = await loadApp();
  const p = attPct(w, [attRow('2026-10-05', 'present', 30),
                       attRow('2026-10-12', 'absent', 30)]);
  eq(p.pct, 50, 'offered twice, present once');
});

test('a held makeup lands in both lines, so the figure can never exceed 100%', async () => {
  const w = await loadApp();
  // Missed once, made it up. 8 offered of 10 — not 7 of 9.
  const p = attPct(w, [attRow('2026-10-05', 'absent', 30),
                       attRow('2026-10-12', 'missed', 30),
                       attRow('2026-10-14', 'present', 30, true),
                       attRow('2026-10-19', 'present', 30)]);
  eq(p, { pct: 67, heldMinutes: 60, offeredMinutes: 90,
          heldSessions: 2, offeredSessions: 3, uncharted: 0 },
     'the makeup is simply a session that was offered');
  assert(p.pct <= 100, 'and it can never push the number past 100');
});

test('a session that has not happened yet is neither offered nor uncharted', async () => {
  const w = await loadApp();
  const p = attPct(w, [attRow('2026-10-05', 'present', 30),
                       attRow('2026-11-09', null, 30)]);
  eq(p.uncharted, 0,
     'a quarter in progress must not accuse her of being behind on paperwork');
  eq(p.offeredSessions, 1, 'and the future session is not in the denominator either');
});

test('uncharted sessions are excluded from the number and counted beside it', async () => {
  const w = await loadApp();
  const p = attPct(w, [attRow('2026-10-05', 'present', 30),
                       attRow('2026-10-12', null, 30),
                       attRow('2026-10-19', null, 30)]);
  eq(p.pct, 100, 'nothing was entered, so nothing is claimed');
  eq(p.uncharted, 2, 'but a confident 100% out of one session must say so out loud');
});

test('minutes, not session count, decide the percentage', async () => {
  const w = await loadApp();
  // One 30-minute session held, one 60-minute session missed by the child.
  // By session count this is 50%. By minutes it is 33%.
  const p = attPct(w, [attRow('2026-10-05', 'present', 30),
                       attRow('2026-10-12', 'absent', 60)]);
  eq(p.pct, 33, 'the honest figure when a student carries two session lengths');
  eq([p.heldSessions, p.offeredSessions], [1, 2],
     'the counts still travel, because "1 of 2" is what she writes in the note');
});

test('a student with nothing offered reads as a dash, not zero', async () => {
  const w = await loadApp();
  eq(attPct(w, []).pct, null, 'not 0%, which reads as a child who never came');
  eq(attPct(w, [attRow('2026-10-05', 'cancelled', 30)]).pct, null, 'and not NaN');
});

test('a row dated exactly today counts; one dated the next day does not', async () => {
  const w = await loadApp();
  // The exclusion is `r.date > today` — strict. A row dated today itself must
  // still land in the denominator, or the last real day of a range in progress
  // would silently drop out of her own paperwork.
  const p = attPct(w, [attRow(ATT_TODAY, 'present', 30),
                       attRow('2026-11-01', 'present', 30)]);
  eq(p.offeredSessions, 1, 'today has happened and belongs in the count');
  eq(p.heldSessions, 1, 'and it was held');
  eq(p.pct, 100, 'tomorrow has not happened yet, so it cannot drag the figure down');
});

// 2026-10-05 is a Monday; 2026-10-10 is that Saturday.
function attGridData(w, over) {
  return Object.assign({
    from: '2026-10-05', to: '2026-10-09', today: '2026-10-31',
    students: [], slots: [], sessions: [], attendance: [],
  }, over || {});
}

test('the grid shows weekdays only', async () => {
  const w = await loadApp();
  const g = w.SLP.derive.attendanceGrid(attGridData(w, { from: '2026-10-05', to: '2026-10-11' }));
  eq(g.dates, ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09'],
     'her paper form is M–F; a weekend would be two dead columns');
});

test('a weekend that carries a session still gets its column', async () => {
  const w = await loadApp();
  const m = w.SLP.model;
  const ada = m.student({ name: 'Ada' });
  const sat = m.session({ date: '2026-10-10', startTime: '10:00', endTime: '10:30',
                          roster: [ada.id] });
  const g = w.SLP.derive.attendanceGrid(attGridData(w, {
    from: '2026-10-05', to: '2026-10-11', students: [ada], sessions: [sat] }));
  assert(g.dates.includes('2026-10-10'),
     'a makeup booked on a Saturday must not be written and then made invisible');
});

test('a scheduled slot with no session yields an unmarked cell', async () => {
  const w = await loadApp();
  const m = w.SLP.model;
  const ada = m.student({ name: 'Ada' });
  const slot = m.slot({ dayOfWeek: 1, startTime: '09:00', endTime: '09:30',
                        studentIds: [ada.id] });
  const g = w.SLP.derive.attendanceGrid(attGridData(w, { students: [ada], slots: [slot] }));
  const cells = g.rows[0].cells['2026-10-05'];
  eq(cells.length, 1, 'Monday is her day');
  eq(cells[0].state, 'unmarked', 'scheduled, nothing entered');
  eq(cells[0].minutes, 30, 'and it is worth 30 minutes');
  eq(g.rows[0].cells['2026-10-06'], undefined, 'Tuesday is not her day at all');
});

test('a materialized session replaces its slot rather than doubling it', async () => {
  const w = await loadApp();
  const m = w.SLP.model;
  const ada = m.student({ name: 'Ada' });
  const slot = m.slot({ dayOfWeek: 1, startTime: '09:00', endTime: '09:30',
                        studentIds: [ada.id] });
  const session = m.session({ date: '2026-10-05', slotId: slot.id, startTime: '09:00',
                              endTime: '09:30', roster: [ada.id] });
  const row = m.attendance({ sessionId: session.id, studentId: ada.id, status: 'absent' });
  const g = w.SLP.derive.attendanceGrid(attGridData(w, {
    students: [ada], slots: [slot], sessions: [session], attendance: [row] }));
  const cells = g.rows[0].cells['2026-10-05'];
  eq(cells.length, 1, 'one session, one box — not the slot AND the session');
  eq(cells[0].state, 'absent', 'and the session is what actually happened');
});

test('two sessions in one day render as two boxes, in time order', async () => {
  const w = await loadApp();
  const m = w.SLP.model;
  const ada = m.student({ name: 'Ada' });
  const late = m.session({ date: '2026-10-05', startTime: '13:00', endTime: '13:30',
                           roster: [ada.id] });
  const early = m.session({ date: '2026-10-05', startTime: '09:00', endTime: '09:30',
                            roster: [ada.id] });
  const g = w.SLP.derive.attendanceGrid(attGridData(w, {
    students: [ada], sessions: [late, early] }));
  const cells = g.rows[0].cells['2026-10-05'];
  eq(cells.length, 2, 'merging would silently hide a miss');
  eq(cells.map(c => c.startTime), ['09:00', '13:00'], 'in the order she worked them');
});

test('a makeup lands on a day that is not that student’s scheduled day', async () => {
  const w = await loadApp();
  const m = w.SLP.model;
  const ada = m.student({ name: 'Ada' });
  const slot = m.slot({ dayOfWeek: 1, startTime: '09:00', endTime: '09:30',
                        studentIds: [ada.id] });
  const makeup = m.session({ date: '2026-10-07', startTime: '11:00', endTime: '11:30',
                             roster: [ada.id] });          // a Wednesday, slotId null
  const row = m.attendance({ sessionId: makeup.id, studentId: ada.id,
                             status: null, isMakeup: true });
  const g = w.SLP.derive.attendanceGrid(attGridData(w, {
    students: [ada], slots: [slot], sessions: [makeup], attendance: [row] }));
  const cells = g.rows[0].cells['2026-10-07'];
  eq(cells.length, 1, 'it appears on its own date');
  eq(cells[0].state, 'unmarked', 'booked, not yet held');
  eq(cells[0].isMakeup, true, 'and it must never read as a routine session');
});

// The columns and the arithmetic must be the same set of sessions. They were two
// independent filters — `dates` from eachDate, the cell loop from a raw from..to
// comparison — and they came apart in two ways she can reach with one keystroke.
test('a cleared start date draws no columns and claims no percentage', async () => {
  const w = await loadApp();
  const m = w.SLP.model;
  const ada = m.student({ name: 'Ada' });
  const held = m.session({ date: '2026-10-05', startTime: '09:00', endTime: '09:30',
                           roster: [ada.id] });
  // `<input type="date">` fires change with value '' when she clears it, and every
  // date string compares >= ''. The raw filter therefore matched her entire history.
  const g = w.SLP.derive.attendanceGrid(attGridData(w, {
    from: '', to: '2026-10-31', students: [ada], sessions: [held],
    attendance: [m.attendance({ sessionId: held.id, studentId: ada.id, status: 'present' })] }));
  eq(g.dates, [], 'no range, no columns');
  eq(g.rows[0].cells, {}, 'and no cells behind them');
  eq(g.rows[0].pct.pct, null,
     'a confident 100% under two date inputs showing something else is the whole defect');
});

test('the arithmetic never sees a session outside the drawn columns', async () => {
  const w = await loadApp();
  const m = w.SLP.model;
  const ada = m.student({ name: 'Ada' });
  const held = m.session({ date: '2026-10-05', startTime: '09:00', endTime: '09:30',
                           roster: [ada.id] });
  // 2016 for 2026 is one keystroke. eachDate stops at its 400-day cap, so the columns
  // run out in 2017 and this session is nowhere on the page.
  const g = w.SLP.derive.attendanceGrid(attGridData(w, {
    from: '2016-10-01', to: '2026-10-31', students: [ada], sessions: [held],
    attendance: [m.attendance({ sessionId: held.id, studentId: ada.id, status: 'present' })] }));
  eq(g.dates.includes('2026-10-05'), false, 'the cap truncated the columns long before it');
  eq(g.rows[0].cells['2026-10-05'], undefined, 'so the session is not on the page');
  eq(g.rows[0].pct.pct, null,
     'and a number computed over a decade beside four hundred empty columns is not a number');
});

test('a booked Saturday makeup keeps its column and still counts', async () => {
  const w = await loadApp();
  const m = w.SLP.model;
  const ada = m.student({ name: 'Ada' });
  const sat = m.session({ date: '2026-10-10', startTime: '10:00', endTime: '10:30',
                          roster: [ada.id] });
  const g = w.SLP.derive.attendanceGrid(attGridData(w, {
    from: '2026-10-05', to: '2026-10-11', students: [ada], sessions: [sat],
    attendance: [m.attendance({ sessionId: sat.id, studentId: ada.id,
                                status: 'present', isMakeup: true })] }));
  assert(g.dates.includes('2026-10-10'), 'a weekday-only filter must not lose it');
  eq(g.rows[0].cells['2026-10-10'].length, 1, 'and it is drawn');
  eq(g.rows[0].pct.pct, 100,
     'binding the arithmetic to the drawn columns must not drop the session it draws');
});

test('a student with no slots at all still gets a row', async () => {
  const w = await loadApp();
  const ada = w.SLP.model.student({ name: 'Ada' });
  const g = w.SLP.derive.attendanceGrid(attGridData(w, { students: [ada] }));
  eq(g.rows.length, 1, 'she is on the caseload, so she is on the page');
  eq(g.rows[0].cells, {}, 'with nothing scheduled');
  eq(g.rows[0].pct.pct, null, 'and a dash, not a zero');
});

test('each row carries its own percentage and balance', async () => {
  const w = await loadApp();
  const m = w.SLP.model;
  const ada = m.student({ name: 'Ada' });
  const held = m.session({ date: '2026-10-05', startTime: '09:00', endTime: '09:30',
                           roster: [ada.id] });
  const skipped = m.session({ date: '2026-10-06', startTime: '09:00', endTime: '09:30',
                              roster: [ada.id] });
  const g = w.SLP.derive.attendanceGrid(attGridData(w, {
    students: [ada], sessions: [held, skipped],
    attendance: [
      m.attendance({ sessionId: held.id, studentId: ada.id, status: 'present' }),
      m.attendance({ sessionId: skipped.id, studentId: ada.id, status: 'missed' }),
    ] }));
  eq(g.rows[0].pct.pct, 100, 'the child was there for everything offered');
  eq(g.rows[0].owed.owed, 30, 'and she owes the session she did not hold');
});

test('sessions outside the range are ignored even if handed in', async () => {
  const w = await loadApp();
  const m = w.SLP.model;
  const ada = m.student({ name: 'Ada' });
  const stray = m.session({ date: '2026-09-28', startTime: '09:00', endTime: '09:30',
                            roster: [ada.id] });
  const g = w.SLP.derive.attendanceGrid(attGridData(w, {
    students: [ada], sessions: [stray] }));
  eq(g.rows[0].cells, {}, 'the range is the range');
});

test('a student pulled from a materialized session gets no cell, not an accusing unmarked one', async () => {
  const w = await loadApp();
  const m = w.SLP.model;
  const ada = m.student({ name: 'Ada' });
  const bo = m.student({ name: 'Bo' });
  // A group slot with both students, but the session that actually happened that day
  // only rostered Ada — Bo was pulled (absent, moved, whatever) before it materialized.
  const slot = m.slot({ dayOfWeek: 1, startTime: '09:00', endTime: '09:30',
                        studentIds: [ada.id, bo.id] });
  const session = m.session({ date: '2026-10-05', slotId: slot.id, startTime: '09:00',
                              endTime: '09:30', roster: [ada.id] });
  const g = w.SLP.derive.attendanceGrid(attGridData(w, {
    students: [ada, bo], slots: [slot], sessions: [session] }));
  eq(g.rows[0].cells['2026-10-05'].length, 1, 'Ada was in the session, so she gets her box');
  eq(g.rows[1].cells['2026-10-05'], undefined,
     'Bo was never in that session’s roster — the slot fallback must not stand in for ' +
     'it and mark her unmarked for a session she was not scheduled into');
});

test('the range defaults to the month she is in', async () => {
  const w = await loadApp();
  eq(w.SLP.derive.monthRange('2026-10-14'), { from: '2026-10-01', to: '2026-10-31' },
     'a 31-day month');
  eq(w.SLP.derive.monthRange('2026-02-03'), { from: '2026-02-01', to: '2026-02-28' },
     'and February knows its own length');
});

test('a makeup is proposed at one session’s length, not the whole debt', async () => {
  const w = await loadApp();
  const m = w.SLP.model;
  const slot = m.slot({ dayOfWeek: 1, startTime: '09:00', endTime: '09:30',
                        studentIds: ['s1'] });
  eq(w.SLP.derive.makeupDuration(90, [slot], 's1'), 30,
     'a student owed 90 minutes gets a 30-minute makeup proposed, not a 90-minute one');
});

test('a makeup shorter than one session is proposed at what is owed', async () => {
  const w = await loadApp();
  const slot = w.SLP.model.slot({ dayOfWeek: 1, startTime: '09:00', endTime: '09:30',
                                  studentIds: ['s1'] });
  eq(w.SLP.derive.makeupDuration(15, [slot], 's1'), 15, 'never longer than the debt');
});

test('the cap is that student’s longest regular session', async () => {
  const w = await loadApp();
  const m = w.SLP.model;
  const short = m.slot({ dayOfWeek: 1, startTime: '09:00', endTime: '09:30',
                         studentIds: ['s1'] });
  const long = m.slot({ dayOfWeek: 3, startTime: '11:00', endTime: '12:00',
                        studentIds: ['s1'] });
  const other = m.slot({ dayOfWeek: 4, startTime: '13:00', endTime: '15:00',
                         studentIds: ['s2'] });
  eq(w.SLP.derive.makeupDuration(120, [short, long, other], 's1'), 60,
     'someone else’s two-hour block is not a cap on hers');
});

test('a student with no regular slot is proposed the whole debt', async () => {
  const w = await loadApp();
  eq(w.SLP.derive.makeupDuration(45, [], 's1'), 45, 'nothing to cap against');
});
