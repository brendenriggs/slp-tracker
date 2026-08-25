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

// --- deleting goals and objectives -------------------------------------
// A goal owns objectives, and objectives own the data charted against them.
// Deleting the parent has to take the children with it or the database keeps
// rows nothing can ever read again — invisible on screen, still in the backup.

async function chart(w, { ada, obj, slot }, raw) {
  const fieldId = obj.fields.find(f => f.role === 'achieved').id;
  await w.SLP.store.recordValue({ dateStr: MONDAY, slot, studentId: ada.id,
                                  objectiveId: obj.id, fieldId, raw });
}

test('deleting a goal removes the goal', async () => {
  const w = await loadApp();
  const { goal } = await seedCaseload(w);
  await w.SLP.store.deleteGoal(goal.id);
  eq(await w.SLP.db.get('goals', goal.id), undefined, 'goal is gone');
});

test('deleting a goal removes its objectives', async () => {
  const w = await loadApp();
  const { goal, obj } = await seedCaseload(w);
  await w.SLP.store.deleteGoal(goal.id);
  eq((await w.SLP.db.getAll('objectives')).length, 0,
     'an objective cannot outlive the goal it belongs to');
});

test('deleting a goal removes the data charted against its objectives', async () => {
  const w = await loadApp();
  const seed = await seedCaseload(w);
  await chart(w, seed, '3');
  eq((await w.SLP.db.getAll('datapoints')).length, 1, 'charted once, to be sure');
  await w.SLP.store.deleteGoal(seed.goal.id);
  eq((await w.SLP.db.getAll('datapoints')).length, 0,
     'orphaned datapoints would survive in the backup with nothing to read them');
});

test('deleting a goal leaves other goals and their data alone', async () => {
  const w = await loadApp();
  const seed = await seedCaseload(w);
  const m = w.SLP.model;
  const keep = m.goal({ studentId: seed.ada.id, text: 'STUDENT will do something else' });
  await w.SLP.store.saveGoal(keep);
  const keepObj = m.objective({ goalId: keep.id, text: 'STUDENT will keep this' });
  await w.SLP.store.saveObjective(keepObj);
  await chart(w, seed, '3');
  await chart(w, { ...seed, obj: keepObj }, '2');

  await w.SLP.store.deleteGoal(seed.goal.id);

  eq((await w.SLP.store.goalsFor(seed.ada.id)).map(g => g.id), [keep.id], 'the other goal stays');
  eq((await w.SLP.db.getAll('objectives')).map(o => o.id), [keepObj.id], 'so does its objective');
  eq((await w.SLP.db.getAll('datapoints')).map(d => d.objectiveId), [keepObj.id],
     'and the data charted against it');
});

test('a goal knows what deleting it would cost', async () => {
  const w = await loadApp();
  const seed = await seedCaseload(w);
  const m = w.SLP.model;
  const second = m.objective({ goalId: seed.goal.id, text: 'STUDENT will also do this' });
  await w.SLP.store.saveObjective(second);
  await chart(w, seed, '3');
  await chart(w, { ...seed, obj: second }, '2');

  const stakes = await w.SLP.store.goalStakes(seed.goal.id);
  eq(stakes.objectives, 2, 'both objectives counted');
  eq(stakes.sessions, 1, 'two objectives charted in one session is one session, not two');
});

test('an untouched goal costs nothing to delete', async () => {
  const w = await loadApp();
  const goal = w.SLP.model.goal({ studentId: 'nobody', text: 'STUDENT will do a thing' });
  await w.SLP.store.saveGoal(goal);
  const stakes = await w.SLP.store.goalStakes(goal.id);
  eq(stakes, { objectives: 0, sessions: 0 }, 'nothing hangs off it');
});

test('deleting an objective removes the data charted against it', async () => {
  const w = await loadApp();
  const seed = await seedCaseload(w);
  await chart(w, seed, '3');
  await w.SLP.store.deleteObjective(seed.obj.id);
  eq((await w.SLP.db.getAll('datapoints')).length, 0,
     'the confirmation promises "everything charted against it" — it has to mean it');
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

test('a student grade and school can be corrected after they are added', async () => {
  const w = await loadApp();
  const m = w.SLP.model, st = w.SLP.store;
  const ada = m.student({ name: 'Ada', grade: '3', school: 'Lincon Elementary' });
  await st.saveStudent(ada);
  await st.updateStudentDetails(ada.id, { grade: '4', school: 'Lincoln Elementary' });
  const saved = (await st.listStudents({}))[0];
  eq(saved.grade, '4', 'the new grade stuck');
  eq(saved.school, 'Lincoln Elementary', 'the typo is gone');
});

test('correcting a student leaves the rest of their record alone', async () => {
  const w = await loadApp();
  const m = w.SLP.model, st = w.SLP.store;
  const ada = m.student({ name: 'Ada', grade: '3', school: 'Lincoln Elementary',
                          background: 'Loves trains' });
  await st.saveStudent(ada);
  await st.setStudentActive(ada.id, false);
  await st.updateStudentDetails(ada.id, { grade: '4', school: 'Roosevelt Middle' });
  const saved = (await st.listStudents({}))[0];
  eq(saved.name, 'Ada', 'the name is untouched');
  eq(saved.background, 'Loves trains', 'the background is untouched');
  eq(saved.active, false, 'editing a former student does not put them back on the caseload');
  eq(saved.id, ada.id, 'still the same record');
});

test('correcting a student who is gone changes nothing', async () => {
  const w = await loadApp();
  eq(await w.SLP.store.updateStudentDetails('s_nobody', { grade: '4', school: 'X' }), null,
     'a missing student reports itself rather than creating one');
  eq((await w.SLP.store.listStudents({})).length, 0, 'and nothing was written');
});
