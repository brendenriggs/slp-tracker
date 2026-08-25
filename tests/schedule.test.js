async function openSchedule(w) {
  await w.SLP.ui.go({ tab: 'schedule' });
  return w.document;
}
function fill(doc, sel, value) {
  const el = doc.querySelector(sel);
  assert(el, 'no element for ' + sel);
  el.value = value;
  el.dispatchEvent(new el.ownerDocument.defaultView.Event('input', { bubbles: true }));
  el.dispatchEvent(new el.ownerDocument.defaultView.Event('change', { bubbles: true }));
  return el;
}

test('schedule view shows an empty state before anything exists', async () => {
  const w = await loadApp();
  const doc = await openSchedule(w);
  assert(doc.querySelector('#caseload-editor'), 'caseload editor present');
  assert(doc.querySelector('#week-grid'), 'week grid present');
  assert(/no students/i.test(doc.querySelector('#caseload-list').textContent),
         'says the caseload is empty');
});

test('adding a student puts them on the caseload', async () => {
  const w = await loadApp();
  const doc = await openSchedule(w);
  fill(doc, '#new-student-name', 'Ada Byron');
  fill(doc, '#new-student-grade', '3');
  doc.querySelector('#add-student').click();
  await w.SLP.ui.render();
  assert(/Ada Byron/.test(doc.querySelector('#caseload-list').textContent), 'listed');
  eq((await w.SLP.store.listStudents({})).length, 1, 'and persisted');
});

test('adding a student with a blank name is refused', async () => {
  const w = await loadApp();
  const doc = await openSchedule(w);
  fill(doc, '#new-student-name', '   ');
  doc.querySelector('#add-student').click();
  await w.SLP.ui.render();
  eq((await w.SLP.store.listStudents({})).length, 0, 'nothing saved');
});

test('deactivating a student removes them from the caseload list but keeps the record', async () => {
  const w = await loadApp();
  await w.SLP.store.saveStudent(w.SLP.model.student({ name: 'Ada' }));
  const doc = await openSchedule(w);
  doc.querySelector('.student-row[data-student-name="Ada"] .toggle-active').click();
  await w.SLP.ui.render();
  eq((await w.SLP.store.listStudents({ activeOnly: true })).length, 0, 'off the caseload');
  eq((await w.SLP.db.getAll('students')).length, 1, 'record survives');
});

test('creating a slot places it in the right day column', async () => {
  const w = await loadApp();
  const ada = w.SLP.model.student({ name: 'Ada' });
  await w.SLP.store.saveStudent(ada);
  const doc = await openSchedule(w);

  fill(doc, '#slot-day', '2');            // Tuesday
  fill(doc, '#slot-start', '10:15');
  fill(doc, '#slot-end', '10:45');
  doc.querySelector('.slot-student[data-student-id="' + ada.id + '"]').click();
  doc.querySelector('#add-slot').click();
  await w.SLP.ui.render();

  const tuesday = doc.querySelector('.day-column[data-day="2"]');
  assert(/10:15/.test(tuesday.textContent), 'slot lands on Tuesday');
  assert(/Ada/.test(tuesday.textContent), 'with its student');
  eq(doc.querySelectorAll('.day-column[data-day="1"] .slot-card').length, 0, 'Monday empty');
});

test('a slot with no students is refused', async () => {
  const w = await loadApp();
  const doc = await openSchedule(w);
  fill(doc, '#slot-day', '1');
  fill(doc, '#slot-start', '09:00');
  fill(doc, '#slot-end', '09:30');
  doc.querySelector('#add-slot').click();
  await w.SLP.ui.render();
  eq((await w.SLP.store.listSlots()).length, 0, 'a slot with nobody in it is not a session');
});

test('a slot ending before it starts is refused', async () => {
  const w = await loadApp();
  const ada = w.SLP.model.student({ name: 'Ada' });
  await w.SLP.store.saveStudent(ada);
  const doc = await openSchedule(w);
  fill(doc, '#slot-day', '1');
  fill(doc, '#slot-start', '11:00');
  fill(doc, '#slot-end', '10:00');
  doc.querySelector('.slot-student[data-student-id="' + ada.id + '"]').click();
  doc.querySelector('#add-slot').click();
  await w.SLP.ui.render();
  eq((await w.SLP.store.listSlots()).length, 0, 'refused');
});

test('slots are listed in time order within a day', async () => {
  const w = await loadApp();
  const m = w.SLP.model;
  const ada = m.student({ name: 'Ada' });
  await w.SLP.store.saveStudent(ada);
  await w.SLP.store.saveSlot(m.slot({ dayOfWeek: 1, startTime: '13:00', endTime: '13:30',
                                      studentIds: [ada.id] }));
  await w.SLP.store.saveSlot(m.slot({ dayOfWeek: 1, startTime: '09:00', endTime: '09:30',
                                      studentIds: [ada.id] }));
  const doc = await openSchedule(w);
  const times = Array.from(doc.querySelectorAll('.day-column[data-day="1"] .slot-time'))
    .map(el => el.textContent.trim());
  eq(times[0].startsWith('09:00'), true, 'earliest first, got: ' + times.join(', '));
});

test('deleting a slot removes it from the grid', async () => {
  const w = await loadApp();
  const m = w.SLP.model;
  const ada = m.student({ name: 'Ada' });
  await w.SLP.store.saveStudent(ada);
  const slot = m.slot({ dayOfWeek: 1, startTime: '09:00', endTime: '09:30',
                        studentIds: [ada.id] });
  await w.SLP.store.saveSlot(slot);
  const doc = await openSchedule(w);
  doc.querySelector('.slot-card[data-slot-id="' + slot.id + '"] .delete-slot').click();
  await w.SLP.ui.render();
  eq((await w.SLP.store.listSlots()).length, 0, 'slot gone');
});

test('only active students are offered when building a slot', async () => {
  const w = await loadApp();
  const m = w.SLP.model;
  const ada = m.student({ name: 'Ada' });
  const gone = m.student({ name: 'Moved Away' });
  gone.active = false;
  await w.SLP.store.saveStudent(ada);
  await w.SLP.store.saveStudent(gone);
  const doc = await openSchedule(w);
  const offered = Array.from(doc.querySelectorAll('.slot-student')).map(el => el.textContent);
  eq(offered.some(t => /Moved Away/.test(t)), false, 'inactive students are not scheduled');
});
