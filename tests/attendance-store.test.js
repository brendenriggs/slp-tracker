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
