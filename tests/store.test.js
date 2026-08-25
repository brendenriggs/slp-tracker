async function seedCaseload(w) {
  const m = w.SLP.model, st = w.SLP.store;
  const ada = m.student({ name: 'Ada', grade: '3' });
  const bo = m.student({ name: 'Bo', grade: '3' });
  await st.saveStudent(ada); await st.saveStudent(bo);
  const goal = m.goal({ studentId: ada.id, text: 'STUDENT will identify objects' });
  await st.saveGoal(goal);
  const obj = m.objective({ goalId: goal.id, text: 'STUDENT will name 4 objects' });
  await st.saveObjective(obj);
  const slot = m.slot({ dayOfWeek: 1, startTime: '09:00', endTime: '09:30',
                        studentIds: [ada.id, bo.id] });
  await st.saveSlot(slot);
  return { ada, bo, goal, obj, slot };
}

// 2026-09-07 is a Monday (dayOfWeek 1).
const MONDAY = '2026-09-07';

test('browsing a day materializes nothing', async () => {
  const w = await loadApp();
  await seedCaseload(w);
  const plan = await w.SLP.store.planForDate(MONDAY);
  eq(plan.length, 1, 'one slot on the schedule that day');
  eq(plan[0].session, null, 'reading a day must not create a session');
  eq((await w.SLP.db.getAll('sessions')).length, 0, 'no session rows written');
});

test('a day with no matching slot yields an empty plan', async () => {
  const w = await loadApp();
  await seedCaseload(w);
  const plan = await w.SLP.store.planForDate('2026-09-08'); // Tuesday
  eq(plan.length, 0, 'nothing scheduled');
});

test('the first write materializes exactly one session', async () => {
  const w = await loadApp();
  const { ada, obj, slot } = await seedCaseload(w);
  const fieldId = obj.fields.find(f => f.role === 'achieved').id;
  await w.SLP.store.recordValue({ dateStr: MONDAY, slot, studentId: ada.id,
                                  objectiveId: obj.id, fieldId, raw: '3' });
  const sessions = await w.SLP.db.getAll('sessions');
  eq(sessions.length, 1, 'one session materialized');
  eq(sessions[0].date, MONDAY, 'session snapshots its date');
  eq(sessions[0].startTime, '09:00', 'session snapshots its time');
  eq(sessions[0].roster.length, 2, 'session snapshots its roster');
});

test('a second write reuses the same session', async () => {
  const w = await loadApp();
  const { ada, obj, slot } = await seedCaseload(w);
  const fieldId = obj.fields.find(f => f.role === 'achieved').id;
  await w.SLP.store.recordValue({ dateStr: MONDAY, slot, studentId: ada.id,
                                  objectiveId: obj.id, fieldId, raw: '3' });
  await w.SLP.store.recordValue({ dateStr: MONDAY, slot, studentId: ada.id,
                                  objectiveId: obj.id, fieldId, raw: '4' });
  eq((await w.SLP.db.getAll('sessions')).length, 1, 'still one session');
  eq((await w.SLP.db.getAll('datapoints')).length, 1, 'still one datapoint');
});

test('editing the schedule never rewrites a past session', async () => {
  const w = await loadApp();
  const { ada, obj, slot } = await seedCaseload(w);
  const fieldId = obj.fields.find(f => f.role === 'achieved').id;
  await w.SLP.store.recordValue({ dateStr: MONDAY, slot, studentId: ada.id,
                                  objectiveId: obj.id, fieldId, raw: '3' });
  slot.startTime = '10:30';
  slot.studentIds = [ada.id];
  await w.SLP.store.saveSlot(slot);
  const s = (await w.SLP.db.getAll('sessions'))[0];
  eq(s.startTime, '09:00', 'the session keeps the time it actually ran at');
  eq(s.roster.length, 2, 'and the roster it actually had');
});

test('entering data marks the student present', async () => {
  const w = await loadApp();
  const { ada, obj, slot } = await seedCaseload(w);
  const fieldId = obj.fields.find(f => f.role === 'achieved').id;
  await w.SLP.store.recordValue({ dateStr: MONDAY, slot, studentId: ada.id,
                                  objectiveId: obj.id, fieldId, raw: '3' });
  const plan = await w.SLP.store.planForDate(MONDAY);
  eq(plan[0].attendance[ada.id].status, 'present', 'attendance derives from data entry');
});

test('a pre-filled default alone never marks anyone present', async () => {
  const w = await loadApp();
  const { ada, obj, slot } = await seedCaseload(w);
  const targetId = obj.fields.find(f => f.role === 'target').id;
  // Simulate the UI writing back the untouched pre-filled target.
  await w.SLP.store.recordValue({ dateStr: MONDAY, slot, studentId: ada.id,
                                  objectiveId: obj.id, fieldId: targetId, raw: '' });
  const plan = await w.SLP.store.planForDate(MONDAY);
  assert(!plan[0].attendance[ada.id],
         'an untouched default must not create an attendance row');
});

test('clearing the last entered value removes the derived present mark', async () => {
  const w = await loadApp();
  const { ada, obj, slot } = await seedCaseload(w);
  const fieldId = obj.fields.find(f => f.role === 'achieved').id;
  await w.SLP.store.recordValue({ dateStr: MONDAY, slot, studentId: ada.id,
                                  objectiveId: obj.id, fieldId, raw: '3' });
  await w.SLP.store.recordValue({ dateStr: MONDAY, slot, studentId: ada.id,
                                  objectiveId: obj.id, fieldId, raw: '' });
  const plan = await w.SLP.store.planForDate(MONDAY);
  assert(!plan[0].attendance[ada.id] || plan[0].attendance[ada.id].status !== 'present',
         'undoing her only entry should undo the derived attendance');
});

test('an explicit absent mark survives later data entry', async () => {
  const w = await loadApp();
  const { ada, obj, slot } = await seedCaseload(w);
  await w.SLP.store.setAttendance({ dateStr: MONDAY, slot, studentId: ada.id, status: 'absent' });
  const fieldId = obj.fields.find(f => f.role === 'achieved').id;
  await w.SLP.store.recordValue({ dateStr: MONDAY, slot, studentId: ada.id,
                                  objectiveId: obj.id, fieldId, raw: '3' });
  const plan = await w.SLP.store.planForDate(MONDAY);
  eq(plan[0].attendance[ada.id].status, 'absent',
     'an explicit mark is hers, not the app’s to overwrite');
});

test('marking absent materializes a session', async () => {
  const w = await loadApp();
  const { ada, slot } = await seedCaseload(w);
  await w.SLP.store.setAttendance({ dateStr: MONDAY, slot, studentId: ada.id, status: 'absent' });
  eq((await w.SLP.db.getAll('sessions')).length, 1, 'absence is a record worth keeping');
});

test('a note marks the student present and materializes a session', async () => {
  const w = await loadApp();
  const { ada, slot } = await seedCaseload(w);
  await w.SLP.store.saveNote({ dateStr: MONDAY, slot, studentId: ada.id, text: 'good day' });
  const plan = await w.SLP.store.planForDate(MONDAY);
  eq(plan[0].notes[ada.id].text, 'good day', 'note saved');
  eq(plan[0].attendance[ada.id].status, 'present', 'a note is data entry');
});

test('adding a student affects only that session', async () => {
  const w = await loadApp();
  const { ada, bo, obj, slot } = await seedCaseload(w);
  const cy = w.SLP.model.student({ name: 'Cy', grade: '4' });
  await w.SLP.store.saveStudent(cy);
  const session = await w.SLP.store.ensureSession(MONDAY, slot);
  await w.SLP.store.addStudentToSession(session.id, cy.id);

  const plan = await w.SLP.store.planForDate(MONDAY);
  eq(plan[0].students.map(s => s.name).sort(), ['Ada', 'Bo', 'Cy'], 'Cy is in this session');
  eq(plan[0].attendance[cy.id].participation, 'added', 'and is chipped as added');

  const nextWeek = await w.SLP.store.planForDate('2026-09-14');
  eq(nextWeek[0].students.map(s => s.name).sort(), ['Ada', 'Bo'],
     'next week’s slot is untouched');
});

test('deactivating a student keeps their history', async () => {
  const w = await loadApp();
  const { ada, obj, slot } = await seedCaseload(w);
  const fieldId = obj.fields.find(f => f.role === 'achieved').id;
  await w.SLP.store.recordValue({ dateStr: MONDAY, slot, studentId: ada.id,
                                  objectiveId: obj.id, fieldId, raw: '3' });
  await w.SLP.store.setStudentActive(ada.id, false);
  eq((await w.SLP.store.listStudents({ activeOnly: true })).map(s => s.name), ['Bo'],
     'inactive students drop off the caseload');
  eq((await w.SLP.db.getAll('datapoints')).length, 1, 'but their data survives');
});

test('students list is sorted by name', async () => {
  const w = await loadApp();
  const m = w.SLP.model;
  for (const n of ['Zoe', 'Ada', 'Mo']) await w.SLP.store.saveStudent(m.student({ name: n }));
  eq((await w.SLP.store.listStudents({})).map(s => s.name), ['Ada', 'Mo', 'Zoe'], 'sorted');
});

test('slots are sorted by day then start time', async () => {
  const w = await loadApp();
  const m = w.SLP.model, st = w.SLP.store;
  await st.saveSlot(m.slot({ dayOfWeek: 3, startTime: '09:00', endTime: '09:30' }));
  await st.saveSlot(m.slot({ dayOfWeek: 1, startTime: '13:00', endTime: '13:30' }));
  await st.saveSlot(m.slot({ dayOfWeek: 1, startTime: '09:00', endTime: '09:30' }));
  eq((await st.listSlots()).map(s => s.dayOfWeek + '@' + s.startTime),
     ['1@09:00', '1@13:00', '3@09:00'], 'schedule reading order');
});
