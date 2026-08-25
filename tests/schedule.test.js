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

function optionValues(doc, sel) {
  return Array.from(doc.querySelectorAll(sel + ' option')).map(o => o.value);
}
async function seedStudent(w, name, grade, school) {
  const s = w.SLP.model.student({ name, grade, school });
  await w.SLP.store.saveStudent(s);
  return s;
}

test('the grade field offers Pre-K through 12th instead of an empty box', async () => {
  const w = await loadApp();
  const doc = await openSchedule(w);
  const grade = doc.querySelector('#new-student-grade');
  eq(grade.tagName, 'SELECT', 'she picks a grade, she does not type one');
  const values = optionValues(doc, '#new-student-grade');
  eq(values[0], '', 'a blank option keeps grade optional');
  eq(values.slice(1).join(','), 'PK,K,1,2,3,4,5,6,7,8,9,10,11,12', 'the whole span, in order');
});

test('a school already on file is offered as an option', async () => {
  const w = await loadApp();
  await seedStudent(w, 'Ada', '3', 'Lincoln Elementary');
  const doc = await openSchedule(w);
  const school = doc.querySelector('#new-student-school');
  const listId = school.getAttribute('list');
  assert(listId, 'the school box is backed by a list');
  const list = doc.getElementById(listId);
  assert(list && list.tagName === 'DATALIST', 'and that list is a datalist');
  eq(Array.from(list.querySelectorAll('option')).map(o => o.value).join('|'),
     'Lincoln Elementary', 'her existing school is offered');
});

// Chrome draws no dropdown arrow on a datalist input until the mouse is over it, so at
// rest the school box is indistinguishable from the free-text name box beside it. The
// placeholder is the only thing that can say "this remembers your schools" at a glance.
test('the school box says it can be picked, not only typed', async () => {
  const w = await loadApp();
  const doc = await openSchedule(w);
  eq(doc.querySelector('#new-student-school').placeholder, 'School — pick or type',
     'the empty add-student box advertises the list');
});

test('a school she types for the first time becomes an option afterwards', async () => {
  const w = await loadApp();
  const doc = await openSchedule(w);
  fill(doc, '#new-student-name', 'Ada Byron');
  fill(doc, '#new-student-school', 'Jefferson High');
  doc.querySelector('#add-student').click();
  await w.SLP.ui.render();
  const listId = doc.querySelector('#new-student-school').getAttribute('list');
  eq(Array.from(doc.getElementById(listId).querySelectorAll('option')).map(o => o.value).join('|'),
     'Jefferson High', 'typed once, offered from then on');
});

test('typing a known school in a different case does not fork the list', async () => {
  const w = await loadApp();
  await seedStudent(w, 'Ada', '3', 'Lincoln Elementary');
  const doc = await openSchedule(w);
  fill(doc, '#new-student-name', 'Bo Peep');
  fill(doc, '#new-student-school', 'lincoln elementary');
  doc.querySelector('#add-student').click();
  await w.SLP.ui.render();
  const bo = (await w.SLP.store.listStudents({})).find(s => s.name === 'Bo Peep');
  eq(bo.school, 'Lincoln Elementary', 'stored under the spelling already on file');
  const listId = doc.querySelector('#new-student-school').getAttribute('list');
  eq(doc.getElementById(listId).querySelectorAll('option').length, 1, 'still one school');
});

test('the caseload names a grade in prose, not as a bare number', async () => {
  const w = await loadApp();
  await seedStudent(w, 'Ada', '3', 'Lincoln Elementary');
  await seedStudent(w, 'Bo', 'PK', 'Lincoln Elementary');
  const doc = await openSchedule(w);
  const text = doc.querySelector('#caseload-list').textContent;
  assert(/Ada · 3rd grade/.test(text), 'reads "Ada · 3rd grade", got: ' + text);
  assert(/Bo · Pre-K/.test(text), 'and "Bo · Pre-K" without the word grade, got: ' + text);
});

test('a student with no grade is listed by name alone', async () => {
  const w = await loadApp();
  await seedStudent(w, 'Ada', '', '');
  const doc = await openSchedule(w);
  eq(/·/.test(doc.querySelector('#caseload-list').textContent), false, 'no dangling separator');
});

test('a mistyped school can be corrected from the caseload', async () => {
  const w = await loadApp();
  const ada = await seedStudent(w, 'Ada', '3', 'Lincon Elementary');
  const doc = await openSchedule(w);
  doc.querySelector('[data-student-id="' + ada.id + '"] .edit-student').click();
  await w.SLP.ui.render();
  fill(doc, '#edit-student-school', 'Lincoln Elementary');
  fill(doc, '#edit-student-grade', '4');
  doc.querySelector('#save-student').click();
  await w.SLP.ui.render();
  const saved = (await w.SLP.store.listStudents({}))[0];
  eq(saved.school, 'Lincoln Elementary', 'the correction stuck');
  eq(saved.grade, '4', 'and so did the grade');
  assert(/Ada · 4th grade/.test(doc.querySelector('#caseload-list').textContent), 'row re-read');
});

test('a corrected school stops being offered once nobody uses it', async () => {
  const w = await loadApp();
  const ada = await seedStudent(w, 'Ada', '3', 'Lincon Elementary');
  const doc = await openSchedule(w);
  doc.querySelector('[data-student-id="' + ada.id + '"] .edit-student').click();
  await w.SLP.ui.render();
  fill(doc, '#edit-student-school', 'Lincoln Elementary');
  doc.querySelector('#save-student').click();
  await w.SLP.ui.render();
  const listId = doc.querySelector('#new-student-school').getAttribute('list');
  eq(Array.from(doc.getElementById(listId).querySelectorAll('option')).map(o => o.value).join('|'),
     'Lincoln Elementary', 'the typo is gone from the dropdown too');
});

test('backing out of an edit changes nothing', async () => {
  const w = await loadApp();
  const ada = await seedStudent(w, 'Ada', '3', 'Lincoln Elementary');
  const doc = await openSchedule(w);
  doc.querySelector('[data-student-id="' + ada.id + '"] .edit-student').click();
  await w.SLP.ui.render();
  fill(doc, '#edit-student-school', 'Somewhere Else');
  doc.querySelector('#cancel-student-edit').click();
  await w.SLP.ui.render();
  eq((await w.SLP.store.listStudents({}))[0].school, 'Lincoln Elementary', 'untouched');
  eq(doc.querySelector('#edit-student-school'), null, 'and the row is back to reading');
});

test('editing one student does not open an edit box on another', async () => {
  const w = await loadApp();
  const ada = await seedStudent(w, 'Ada', '3', 'Lincoln Elementary');
  await seedStudent(w, 'Bo', '4', 'Lincoln Elementary');
  const doc = await openSchedule(w);
  doc.querySelector('[data-student-id="' + ada.id + '"] .edit-student').click();
  await w.SLP.ui.render();
  eq(doc.querySelectorAll('#edit-student-school').length, 1, 'exactly one row is editable');
  assert(doc.querySelector('[data-student-id="' + ada.id + '"] #edit-student-school'),
         'and it is the row she clicked');
});
