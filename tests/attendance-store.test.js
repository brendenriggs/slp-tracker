// Bulk reads and the write paths the Attendance grid needs.
// Every top-level name here is prefixed `att` — see the note in
// attendance-derive.test.js about the shared global scope.

const ATT_MONDAY = '2026-10-05';    // a Monday
const ATT_TUESDAY = '2026-10-06';

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

test('setAttendance refuses a status outside the vocabulary', async () => {
  const w = await loadApp();
  const { ada, slot } = await attSeed(w);
  await throws(() => w.SLP.store.setAttendance({
    dateStr: ATT_MONDAY, slot, studentId: ada.id, status: 'excused',
  }), 'the write path is the last gate before the database');
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
  await throws(() => w.SLP.store.setSessionAttendance({
    dateStr: ATT_MONDAY, slot, status: 'snowday' }), 'same gate as the single write');
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
