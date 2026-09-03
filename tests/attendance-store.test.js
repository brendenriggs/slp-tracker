// Bulk reads and the write paths the Attendance grid needs.
// Every top-level name here is prefixed `att` — see the note in
// attendance-derive.test.js about the shared global scope.

const ATT_MONDAY = '2026-10-05';    // a Monday

async function attSeed(w) {
  const m = w.SLP.model, st = w.SLP.store;
  const ada = m.student({ name: 'Ada', grade: '3', school: 'Lincoln' });
  const bo = m.student({ name: 'Bo', grade: '4', school: 'Lincoln' });
  await st.saveStudent(ada); await st.saveStudent(bo);
  const slot = m.slot({ dayOfWeek: 1, startTime: '09:00', endTime: '09:30',
                        studentIds: [ada.id, bo.id], location: 'Room 4' });
  await st.saveSlot(slot);
  // Task 9 charts a datapoint against a makeup to prove deleteMakeup cleans up after
  // itself, so the seed carries one objective. Same shape as aggregation.test.js:5-8.
  const goal = m.goal({ studentId: ada.id, text: 'STUDENT will improve' });
  await st.saveGoal(goal);
  const objective = m.objective({ goalId: goal.id, text: 'STUDENT will identify objects' });
  await st.saveObjective(objective);
  return { ada, bo, slot, objective };
}

// Asserts the function exists before asserting it throws: otherwise a missing
// setAttendance/setSessionAttendance throws a TypeError and the test passes
// green having proved nothing. See tests/backup.test.js:152-168.
test('setAttendance refuses a status outside the vocabulary', async () => {
  const w = await loadApp();
  const { ada, slot } = await attSeed(w);
  assert(typeof w.SLP.store.setAttendance === 'function', 'setAttendance exists');
  const e = await throws(() => w.SLP.store.setAttendance({
    dateStr: ATT_MONDAY, slot, studentId: ada.id, status: 'excused',
  }), 'the write path is the last gate before the database');
  assert(/excused/.test(e.message),
         'named for the bad status, not for a missing function — got: ' + e.message);
});

test('setAttendance accepts each of the four outcomes', async () => {
  const w = await loadApp();
  const { ada, slot } = await attSeed(w);
  for (const status of ['present', 'absent', 'missed', 'cancelled']) {
    const row = await w.SLP.store.setAttendance({
      dateStr: ATT_MONDAY, slot, studentId: ada.id, status });
    eq(row.status, status, status + ' is a legal outcome');
  }
});

test('charting against a booked makeup marks it held without losing isMakeup', async () => {
  const w = await loadApp();
  const { ada, slot } = await attSeed(w);
  const session = await w.SLP.store.ensureSession(ATT_MONDAY, slot);
  await w.SLP.db.put('attendance', w.SLP.model.attendance({
    sessionId: session.id, studentId: ada.id, status: null, isMakeup: true }));

  await w.SLP.store.saveNote({ dateStr: ATT_MONDAY, slot, studentId: ada.id,
                               text: 'worked on /s/ blends' });

  const rows = (await w.SLP.db.getAllBy('attendance', 'sessionId', session.id))
    .filter(r => r.studentId === ada.id);
  eq(rows.length, 1, 'the booked row was filled in, not duplicated');
  eq(rows[0].status, 'present', 'a null status is not hers to protect — it is unfilled');
  eq(rows[0].isMakeup, true, 'and it is still the makeup she booked');
});

test('clearing the note undoes the charting, not the makeup booking', async () => {
  const w = await loadApp();
  const { ada, slot } = await attSeed(w);
  const session = await w.SLP.store.ensureSession(ATT_MONDAY, slot);
  await w.SLP.db.put('attendance', w.SLP.model.attendance({
    sessionId: session.id, studentId: ada.id, status: null, isMakeup: true }));

  await w.SLP.store.saveNote({ dateStr: ATT_MONDAY, slot, studentId: ada.id,
                               text: 'worked on /s/ blends' });
  // She typed it into the wrong child and clears it again.
  await w.SLP.store.saveNote({ dateStr: ATT_MONDAY, slot, studentId: ada.id, text: '' });

  const rows = (await w.SLP.db.getAllBy('attendance', 'sessionId', session.id))
    .filter(r => r.studentId === ada.id);
  eq(rows.length, 1, 'the appointment she scheduled survives an emptied note');
  eq(rows[0].status, null, 'back to booked-but-unmarked, not held');
  eq(rows[0].isMakeup, true,
     'and still flagged, or the grid can no longer cancel it and the debt silently returns');
});

test('clearing the note on an ordinary session still withdraws the derived mark', async () => {
  const w = await loadApp();
  const { ada, slot } = await attSeed(w);
  const session = await w.SLP.store.ensureSession(ATT_MONDAY, slot);

  await w.SLP.store.saveNote({ dateStr: ATT_MONDAY, slot, studentId: ada.id, text: 'ok' });
  await w.SLP.store.saveNote({ dateStr: ATT_MONDAY, slot, studentId: ada.id, text: '' });

  const rows = (await w.SLP.db.getAllBy('attendance', 'sessionId', session.id))
    .filter(r => r.studentId === ada.id);
  eq(rows.length, 0,
     'the makeup carve-out is an exception, not a new general rule — this row still goes');
});

test('attendanceRange returns exactly what the grid needs', async () => {
  const w = await loadApp();
  const { ada, slot } = await attSeed(w);
  await w.SLP.store.setAttendance({ dateStr: ATT_MONDAY, slot,
                                    studentId: ada.id, status: 'absent' });

  const data = await w.SLP.store.attendanceRange({ from: '2026-10-01', to: '2026-10-31',
                                                   today: '2026-10-31' });
  eq(data.students.map(s => s.name), ['Ada', 'Bo'], 'the caseload, by name');
  eq(data.slots.length, 1, 'the weekly template');
  eq(data.sessions.length, 1, 'the one session materialized by that write');
  eq(data.attendance.length, 1, 'and its attendance row');
  eq(data.today, '2026-10-31', 'the caller’s notion of today is echoed back');
});

test('attendanceRange excludes sessions outside the range', async () => {
  const w = await loadApp();
  const { ada, slot } = await attSeed(w);
  await w.SLP.store.setAttendance({ dateStr: ATT_MONDAY, slot,
                                    studentId: ada.id, status: 'absent' });
  await w.SLP.store.setAttendance({ dateStr: '2026-11-02', slot,
                                    studentId: ada.id, status: 'absent' });

  const data = await w.SLP.store.attendanceRange({ from: '2026-10-01', to: '2026-10-31' });
  eq(data.sessions.length, 1, 'only October');
  eq(data.attendance.length, 1, 'and no orphan rows from November’s session');
});

test('attendanceRange includes sessions dated exactly on the from and to boundaries', async () => {
  const w = await loadApp();
  const { ada, slot } = await attSeed(w);
  await w.SLP.store.setAttendance({ dateStr: '2026-10-01', slot,
                                    studentId: ada.id, status: 'present' });
  await w.SLP.store.setAttendance({ dateStr: '2026-10-31', slot,
                                    studentId: ada.id, status: 'present' });

  const data = await w.SLP.store.attendanceRange({ from: '2026-10-01', to: '2026-10-31' });
  eq(data.sessions.map(s => s.date).sort(), ['2026-10-01', '2026-10-31'],
     'from and to are both inclusive, not just the dates strictly between them');
});

test('attendanceRange defaults today to null and echoes a supplied value unchanged', async () => {
  const w = await loadApp();
  await attSeed(w);

  const withoutToday = await w.SLP.store.attendanceRange({ from: '2026-10-01', to: '2026-10-31' });
  eq(withoutToday.today, null, 'omitted today defaults to null');

  const withToday = await w.SLP.store.attendanceRange({
    from: '2026-10-01', to: '2026-10-31', today: '2026-10-15' });
  eq(withToday.today, '2026-10-15', 'a supplied today is echoed back unchanged');
});

test('attendanceRange leaves former students off the page', async () => {
  const w = await loadApp();
  const { bo } = await attSeed(w);
  await w.SLP.store.setStudentActive(bo.id, false);
  const data = await w.SLP.store.attendanceRange({ from: '2026-10-01', to: '2026-10-31' });
  eq(data.students.map(s => s.name), ['Ada'], 'the grid is her current caseload');
});

test('attendanceRange does not fan out one query per session', async () => {
  const w = await loadApp();
  const { ada, slot } = await attSeed(w);
  // Thirty sessions — a month of a real caseload. The old shape would be hundreds
  // of IndexedDB round-trips; this must stay flat.
  for (let d = 1; d <= 30; d++) {
    const date = '2026-10-' + String(d).padStart(2, '0');
    await w.SLP.store.setAttendance({ dateStr: date, slot, studentId: ada.id,
                                      status: 'present' });
  }

  let calls = 0;
  const realGetAll = w.SLP.db.getAll, realGetAllBy = w.SLP.db.getAllBy;
  w.SLP.db.getAll = function (...a) { calls++; return realGetAll.apply(this, a); };
  w.SLP.db.getAllBy = function (...a) { calls++; return realGetAllBy.apply(this, a); };
  try {
    await w.SLP.store.attendanceRange({ from: '2026-10-01', to: '2026-10-31' });
  } finally {
    w.SLP.db.getAll = realGetAll; w.SLP.db.getAllBy = realGetAllBy;
  }
  assert(calls <= 6, 'expected a handful of bulk reads, got ' + calls +
                     ' — the per-session fan-out is back');
});

test('marking a session writes every student on its roster', async () => {
  const w = await loadApp();
  const { ada, bo, slot } = await attSeed(w);
  const written = await w.SLP.store.setSessionAttendance({
    dateStr: ATT_MONDAY, slot, status: 'missed' });
  eq(written.length, 2, 'both students on the roster');

  const session = await w.SLP.store.ensureSession(ATT_MONDAY, slot);
  const rows = await w.SLP.db.getAllBy('attendance', 'sessionId', session.id);
  eq(rows.map(r => r.status).sort(), ['missed', 'missed'], 'and both are on file');
  eq(rows.filter(r => r.studentId === ada.id).length, 1, 'Ada, once');
  eq(rows.filter(r => r.studentId === bo.id).length, 1, 'Bo, once');
});

test('a session-wide sweep does not overwrite a mark she made by hand', async () => {
  const w = await loadApp();
  const { ada, bo, slot } = await attSeed(w);
  await w.SLP.store.setAttendance({ dateStr: ATT_MONDAY, slot,
                                    studentId: ada.id, status: 'absent' });

  await w.SLP.store.setSessionAttendance({ dateStr: ATT_MONDAY, slot, status: 'missed' });

  const session = await w.SLP.store.ensureSession(ATT_MONDAY, slot);
  const rows = await w.SLP.db.getAllBy('attendance', 'sessionId', session.id);
  const adaRow = rows.find(r => r.studentId === ada.id);
  const boRow = rows.find(r => r.studentId === bo.id);
  eq(adaRow.status, 'absent',
     'she said Ada was not there; a sweep must not blame the paperwork on the child');
  eq(boRow.status, 'missed', 'Bo, who had no mark, takes the sweep');
});

test('a bulk sweep is refused an unknown status too', async () => {
  const w = await loadApp();
  const { slot } = await attSeed(w);
  assert(typeof w.SLP.store.setSessionAttendance === 'function', 'setSessionAttendance exists');
  const e = await throws(() => w.SLP.store.setSessionAttendance({
    dateStr: ATT_MONDAY, slot, status: 'snowday' }), 'same gate as the single write');
  assert(/snowday/.test(e.message),
         'named for the bad status, not for a missing function — got: ' + e.message);
});

// The roster member with no prior row gets validated for free, on the create path
// through m.attendance(). A member who already has a row does not pass through
// m.attendance() at all — `row = prior` — so a bad status reaching that branch
// would be written straight to the database with no check. This pins the guard
// at the top of setSessionAttendance that catches it before either branch runs,
// and pins that a rejected sweep leaves an existing row untouched rather than
// corrupting it on the way to the throw.
test('a rejected bulk sweep does not touch a row it already held', async () => {
  const w = await loadApp();
  const { ada, slot } = await attSeed(w);
  await w.SLP.store.setAttendance({ dateStr: ATT_MONDAY, slot,
                                    studentId: ada.id, status: 'present' });

  assert(typeof w.SLP.store.setSessionAttendance === 'function', 'setSessionAttendance exists');
  const e = await throws(() => w.SLP.store.setSessionAttendance({
    dateStr: ATT_MONDAY, slot, status: 'snowday' }), 'a bad sweep must still be refused');
  assert(/snowday/.test(e.message),
         'named for the bad status, not for a missing function — got: ' + e.message);

  const session = await w.SLP.store.ensureSession(ATT_MONDAY, slot);
  const rows = await w.SLP.db.getAllBy('attendance', 'sessionId', session.id);
  const adaRow = rows.find(r => r.studentId === ada.id);
  eq(adaRow.status, 'present', 'a rejected sweep must not write before it throws');
});

test('a session-wide mark creates no debt for a child who was absent', async () => {
  const w = await loadApp();
  const { ada, bo, slot } = await attSeed(w);
  await w.SLP.store.setAttendance({ dateStr: ATT_MONDAY, slot,
                                    studentId: ada.id, status: 'absent' });
  await w.SLP.store.setSessionAttendance({ dateStr: ATT_MONDAY, slot, status: 'missed' });

  const data = await w.SLP.store.attendanceRange({ from: '2026-10-01', to: '2026-10-31',
                                                   today: '2026-10-31' });
  const grid = w.SLP.derive.attendanceGrid(data);
  const adaRow = grid.rows.find(r => r.student.id === ada.id);
  const boRow = grid.rows.find(r => r.student.id === bo.id);
  eq(adaRow.owed.owed, 0, 'a child who stayed home is owed nothing');
  eq(boRow.owed.owed, 30, 'Bo turned up to a session that did not happen');
});

test('booking a makeup writes a one-off session and an unheld makeup row', async () => {
  const w = await loadApp();
  const { ada } = await attSeed(w);
  const { session, attendance } = await w.SLP.store.bookMakeup({
    date: '2026-10-16', startTime: '11:00', endTime: '11:30',
    location: 'Room 4', studentId: ada.id });

  eq(session.slotId, null, 'a one-off is not recurring');
  eq(session.roster, [ada.id], 'a roster of one');
  eq(attendance.isMakeup, true, 'the makeup flag is per-student, on the row');
  eq(attendance.status, null,
     'booked is not held — crediting it now would zero the debt before the session happens');
});

test('booking a makeup does not pay the debt down until it is held', async () => {
  const w = await loadApp();
  const { ada, slot } = await attSeed(w);
  await w.SLP.store.setAttendance({ dateStr: ATT_MONDAY, slot,
                                    studentId: ada.id, status: 'missed' });
  await w.SLP.store.bookMakeup({ date: '2026-10-16', startTime: '11:00',
                                 endTime: '11:30', studentId: ada.id });

  const before = w.SLP.derive.attendanceGrid(await w.SLP.store.attendanceRange({
    from: '2026-10-01', to: '2026-10-31', today: '2026-10-31' }));
  eq(before.rows.find(r => r.student.id === ada.id).owed.owed, 30,
     'still outstanding — she has not delivered it yet');

  const booked = (await w.SLP.db.getAll('sessions')).find(s => s.date === '2026-10-16');
  const row = (await w.SLP.db.getAllBy('attendance', 'sessionId', booked.id))[0];
  row.status = 'present';
  await w.SLP.db.put('attendance', row);

  const after = w.SLP.derive.attendanceGrid(await w.SLP.store.attendanceRange({
    from: '2026-10-01', to: '2026-10-31', today: '2026-10-31' }));
  eq(after.rows.find(r => r.student.id === ada.id).owed.owed, 0, 'settled once held');
});

test('a booked makeup appears on Today for its date', async () => {
  const w = await loadApp();
  const { ada } = await attSeed(w);
  await w.SLP.store.bookMakeup({ date: '2026-10-16', startTime: '11:00',
                                 endTime: '11:30', location: 'Room 4', studentId: ada.id });
  const plan = await w.SLP.store.planForDate('2026-10-16');
  eq(plan.length, 1, 'planForDate already folds in ad-hoc sessions');
  eq(plan[0].students.map(s => s.name), ['Ada'], 'and it is her session');
});

test('deleting a makeup takes its rows with it', async () => {
  const w = await loadApp();
  const { ada, objective } = await attSeed(w);
  const { session } = await w.SLP.store.bookMakeup({
    date: '2026-10-16', startTime: '11:00', endTime: '11:30', studentId: ada.id });
  const adHocSlot = { id: null, sessionId: session.id, startTime: '11:00',
                      endTime: '11:30', studentIds: [ada.id], location: '' };
  await w.SLP.store.saveNote({ dateStr: '2026-10-16', slot: adHocSlot,
                               studentId: ada.id, text: 'x' });
  await w.SLP.store.recordValue({ dateStr: '2026-10-16', slot: adHocSlot,
                                  studentId: ada.id, objectiveId: objective.id,
                                  fieldId: objective.fields[0].id, raw: '4' });

  await w.SLP.store.deleteMakeup(session.id);

  eq(await w.SLP.db.get('sessions', session.id), undefined, 'the session is gone');
  // All four stores, not just the two that are easy to reach — the notes and datapoints
  // loop is the half that was shipped untested, and a backup carries whatever it misses.
  for (const store of ['attendance', 'notes', 'datapoints']) {
    eq((await w.SLP.db.getAllBy(store, 'sessionId', session.id)).length, 0,
       store + ' rows nothing can read again still ride in every backup she makes');
  }
});

// The third door onto an isMakeup row: Today's Remove control. Removing the only
// student from a booked makeup deletes that row, and the slotless session it belonged
// to then has nobody in it — still drawn on Today by planForDate, and unreachable from
// the grid, whose delete control is gated on isMakeup. Same orphan ADR 0002 documents.
test('removing the last student from a booked makeup takes the empty session with it', async () => {
  const w = await loadApp();
  const { ada } = await attSeed(w);
  const { session } = await w.SLP.store.bookMakeup({
    date: '2026-10-16', startTime: '11:00', endTime: '11:30', studentId: ada.id });

  await w.SLP.store.removeStudentFromSession(session.id, ada.id);

  eq(await w.SLP.db.get('sessions', session.id), undefined,
     'an appointment with nobody in it can never be cancelled from the grid again');
  eq((await w.SLP.store.planForDate('2026-10-16')).length, 0,
     'and it must not sit on Today forever as an empty card');
});

test('emptying a scheduled session leaves it alone — the slot still owns that day', async () => {
  const w = await loadApp();
  const { ada, bo, slot } = await attSeed(w);
  const session = await w.SLP.store.ensureSession(ATT_MONDAY, slot);
  await w.SLP.store.removeStudentFromSession(session.id, ada.id);
  await w.SLP.store.removeStudentFromSession(session.id, bo.id);
  assert(await w.SLP.db.get('sessions', session.id),
     'the cleanup is for slotless bookings only — a recurring session is still on her schedule');
});

test('two makeups on one day do not write into each other', async () => {
  const w = await loadApp();
  const { ada, bo } = await attSeed(w);
  // The collision ADR 0001 exists for: both sessions are slotless on the same date, so
  // a lookup keyed on `slotId === null` cannot tell them apart and returns the first.
  const first = await w.SLP.store.bookMakeup({ date: '2026-10-16', startTime: '11:00',
                                               endTime: '11:30', studentId: ada.id });
  const second = await w.SLP.store.bookMakeup({ date: '2026-10-16', startTime: '13:00',
                                                endTime: '13:30', studentId: bo.id });
  assert(first.session.id !== second.session.id, 'two bookings, two sessions');

  await w.SLP.store.saveNote({
    dateStr: '2026-10-16',
    slot: { id: null, sessionId: second.session.id, startTime: '13:00', endTime: '13:30',
            studentIds: [bo.id], location: '' },
    studentId: bo.id, text: 'bo worked on /r/' });

  const onFirst = await w.SLP.db.getAllBy('notes', 'sessionId', first.session.id);
  const onSecond = await w.SLP.db.getAllBy('notes', 'sessionId', second.session.id);
  eq(onFirst.length, 0, "Ada's session must not receive a note written against Bo's");
  eq(onSecond.length, 1, 'the note belongs to the session it was written against');
});

test('an ad-hoc session cannot be addressed by date alone', async () => {
  const w = await loadApp();
  const { ada } = await attSeed(w);
  await w.SLP.store.bookMakeup({ date: '2026-10-16', startTime: '11:00',
                                 endTime: '11:30', studentId: ada.id });
  let threw = null;
  try {
    await w.SLP.store.saveNote({
      dateStr: '2026-10-16',
      slot: { id: null, startTime: '11:00', endTime: '11:30', studentIds: [ada.id], location: '' },
      studentId: ada.id, text: 'x' });
  } catch (e) { threw = e; }
  assert(threw, 'a slotless slot with no sessionId names no session — guessing is the bug');
});
