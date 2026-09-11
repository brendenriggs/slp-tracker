async function assessOpenStudent(w, studentId) {
  await w.SLP.ui.go({ tab: 'students', studentId });
  return w.document;
}
async function assessSeedWithOrder(w, orderedOn, name = 'Ada') {
  await w.SLP.store.saveStudent(w.SLP.model.student({ name }));
  const all = await w.SLP.db.getAll('students');
  const student = all.find(s => s.name === name);
  const as = await w.SLP.store.orderAssessment(student.id, orderedOn);
  return { student, as };
}
// The floor for 15px text. The body font is 15px, so nothing here gets the large-text
// exemption. Returns the WCAG contrast ratio of a computed colour against white.
function assessContrast(rgb) {
  const [r, g, b] = rgb.match(/\d+/g).slice(0, 3).map(Number);
  const lin = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return 1.05 / (L + 0.05);
}

test('a student with no assessment is offered one, not shown an empty tracker', async () => {
  const w = await loadApp();
  await w.SLP.store.saveStudent(w.SLP.model.student({ name: 'Ada' }));
  const [ada] = await w.SLP.db.getAll('students');
  const doc = await assessOpenStudent(w, ada.id);
  assert(doc.querySelector('#assessment-order-form'), 'the order form is offered');
  assert(!doc.querySelector('.assess-row'), 'no component rows until one is ordered');
});

test('an open assessment shows when it was ordered and when it is due', async () => {
  const w = await loadApp();
  w.SLP.ui.todayStr = () => '2026-09-11';
  const { student } = await assessSeedWithOrder(w, '2026-09-11');
  const doc = await assessOpenStudent(w, student.id);
  const line = doc.querySelector('#assessment-due').textContent;
  assert(/11 Sep 2026/.test(line), 'the order date is on the line, got: ' + line);
  assert(/10 Nov 2026/.test(line), 'the due date is on the line, got: ' + line);
  assert(/60 days/.test(line), 'and how long she has, got: ' + line);
  assert(!doc.querySelector('#assessment-order-form'),
         'no order form while one is open');
});

test('all nine components are listed, in her order, each with a date field', async () => {
  const w = await loadApp();
  w.SLP.ui.todayStr = () => '2026-09-11';
  const { student } = await assessSeedWithOrder(w, '2026-09-11');
  const doc = await assessOpenStudent(w, student.id);
  const rows = Array.from(doc.querySelectorAll('.assess-row'));
  eq(rows.map(r => r.dataset.key), [
    'backgroundHistory', 'classroomObservation', 'languageSample', 'narrativeSample',
    'formalAssessment', 'teacherInterview', 'assessmentWritten', 'assessmentUploaded',
    'assessmentBilled',
  ], 'her nine, in her order');
  for (const r of rows) {
    const box = r.querySelector('input[type="checkbox"]');
    const date = r.querySelector('input[type="date"]');
    assert(box && box.id, 'every checkbox needs an id, missing on ' + r.dataset.key);
    assert(date && date.id, 'every date input needs an id, missing on ' + r.dataset.key);
  }
});

test('the count reads from the dates', async () => {
  const w = await loadApp();
  w.SLP.ui.todayStr = () => '2026-09-20';
  const { student, as } = await assessSeedWithOrder(w, '2026-09-11');
  await w.SLP.store.setComponentDate(as.id, 'backgroundHistory', '2026-09-15');
  await w.SLP.store.setComponentDate(as.id, 'languageSample', '2026-09-18');
  const doc = await assessOpenStudent(w, student.id);
  eq(doc.querySelector('#assess-count').textContent.trim(), '2 of 9', 'two carry a date');
});

test('overdue is said in words, not only in colour', async () => {
  const w = await loadApp();
  w.SLP.ui.todayStr = () => '2026-11-17';           // ordered 11 Sep, due 10 Nov
  const { student } = await assessSeedWithOrder(w, '2026-09-11');
  const doc = await assessOpenStudent(w, student.id);
  const line = doc.querySelector('#assessment-due');
  assert(/7 days over/.test(line.textContent),
         'the state is in the text, got: ' + line.textContent);
});

test('the overdue colour is legible at the size it is actually drawn', async () => {
  const w = await loadApp();
  w.SLP.ui.todayStr = () => '2026-11-17';
  const { student } = await assessSeedWithOrder(w, '2026-09-11');
  const doc = await assessOpenStudent(w, student.id);
  const el = doc.querySelector('#assessment-due .assess-standing');
  const style = w.getComputedStyle(el);
  const ratio = assessContrast(style.color);
  assert(ratio >= 4.5, 'overdue text must clear 4.5:1, got ' + ratio.toFixed(2) +
                       ' for ' + style.color);
  // A contrast floor cannot see a dropped rule: a stray comment once invalidated a whole
  // block and a 12px-wide black button sailed through at 21:1. Assert a size too.
  const box = el.getBoundingClientRect();
  assert(box.width > 40 && box.height > 10,
         'the overdue text must actually be drawn, got ' + box.width + 'x' + box.height);
});

test('due soon is legible too — --warn is 3.6:1 and must never be used for text', async () => {
  const w = await loadApp();
  w.SLP.ui.todayStr = () => '2026-11-01';           // due 10 Nov, nine days out
  const { student } = await assessSeedWithOrder(w, '2026-09-11');
  const doc = await assessOpenStudent(w, student.id);
  const el = doc.querySelector('#assessment-due .assess-standing');
  assert(/9 days/.test(el.textContent), 'said in words, got: ' + el.textContent);
  const ratio = assessContrast(w.getComputedStyle(el).color);
  assert(ratio >= 4.5, 'due-soon text must clear 4.5:1, got ' + ratio.toFixed(2));
});

test('a finished assessment leaves the tracker and becomes history', async () => {
  const w = await loadApp();
  w.SLP.ui.todayStr = () => '2026-11-01';
  const { student, as } = await assessSeedWithOrder(w, '2026-09-11');
  await w.SLP.store.finishAssessment(as.id, '2026-10-30');
  const doc = await assessOpenStudent(w, student.id);
  assert(doc.querySelector('#assessment-order-form'),
         'she can order the next one');
  assert(!doc.querySelector('.assess-row'), 'the finished one is not still being tracked');
  const earlier = doc.querySelector('#assessment-earlier');
  assert(earlier && /1/.test(earlier.textContent),
         'but it is counted as history, got: ' + (earlier && earlier.textContent));
});

function assessClick(el) {
  el.dispatchEvent(new el.ownerDocument.defaultView.MouseEvent('click', { bubbles: true }));
}
function assessSetInput(el, value) {
  el.value = value;
  el.dispatchEvent(new el.ownerDocument.defaultView.Event('input', { bubbles: true }));
  el.dispatchEvent(new el.ownerDocument.defaultView.Event('change', { bubbles: true }));
}

test('ordering an assessment from her page opens one', async () => {
  const w = await loadApp();
  w.SLP.ui.todayStr = () => '2026-09-11';
  await w.SLP.store.saveStudent(w.SLP.model.student({ name: 'Ada' }));
  const [ada] = await w.SLP.db.getAll('students');
  const doc = await assessOpenStudent(w, ada.id);
  assessSetInput(doc.querySelector('#assess-order-date'), '2026-09-11');
  assessClick(doc.querySelector('#assess-order'));
  await w.SLP.ui.render();
  const as = await w.SLP.store.activeAssessment(ada.id);
  eq(as.orderedOn, '2026-09-11', 'the date she typed is the date stored');
  assert(w.document.querySelector('#assessment-due'), 'and the tracker replaced the form');
});

test('ticking a component stamps today, not a flag', async () => {
  const w = await loadApp();
  w.SLP.ui.todayStr = () => '2026-09-20';
  const { student, as } = await assessSeedWithOrder(w, '2026-09-11');
  const doc = await assessOpenStudent(w, student.id);
  assessClick(doc.querySelector('#assess-languageSample-done'));
  await w.SLP.ui.render();
  const stored = await w.SLP.db.get('assessments', as.id);
  eq(stored.components.find(c => c.key === 'languageSample').date, '2026-09-20',
     'the box wrote the date, and the date is the only record of it being done');
});

test('unticking clears the date back to nothing', async () => {
  const w = await loadApp();
  w.SLP.ui.todayStr = () => '2026-09-20';
  const { student, as } = await assessSeedWithOrder(w, '2026-09-11');
  await w.SLP.store.setComponentDate(as.id, 'languageSample', '2026-09-15');
  const doc = await assessOpenStudent(w, student.id);
  assessClick(doc.querySelector('#assess-languageSample-done'));
  await w.SLP.ui.render();
  const stored = await w.SLP.db.get('assessments', as.id);
  eq(stored.components.find(c => c.key === 'languageSample').date, null, 'cleared');
});

test('typing the day it actually happened overrides the stamp', async () => {
  const w = await loadApp();
  w.SLP.ui.todayStr = () => '2026-09-20';
  const { student, as } = await assessSeedWithOrder(w, '2026-09-11');
  const doc = await assessOpenStudent(w, student.id);
  assessSetInput(doc.querySelector('#assess-languageSample-date'), '2026-09-15');
  await w.SLP.ui.render();
  const stored = await w.SLP.db.get('assessments', as.id);
  eq(stored.components.find(c => c.key === 'languageSample').date, '2026-09-15',
     'she charts on paper and transcribes later, so the real date has to win');
  const box = w.document.querySelector('#assess-languageSample-done');
  eq(box.checked, true, 'and the box follows the date, because the date is the truth');
});

test('clearing the date field unticks the box', async () => {
  const w = await loadApp();
  w.SLP.ui.todayStr = () => '2026-09-20';
  const { student, as } = await assessSeedWithOrder(w, '2026-09-11');
  await w.SLP.store.setComponentDate(as.id, 'languageSample', '2026-09-15');
  const doc = await assessOpenStudent(w, student.id);
  assessSetInput(doc.querySelector('#assess-languageSample-date'), '');
  await w.SLP.ui.render();
  eq((await w.SLP.db.get('assessments', as.id))
       .components.find(c => c.key === 'languageSample').date, null, 'cleared');
  eq(w.document.querySelector('#assess-languageSample-done').checked, false, 'and unticked');
});

test('she can finish it with components still undated', async () => {
  const w = await loadApp();
  w.SLP.ui.todayStr = () => '2026-10-30';
  const { student, as } = await assessSeedWithOrder(w, '2026-09-11');
  await w.SLP.store.setComponentDate(as.id, 'backgroundHistory', '2026-09-15');
  const doc = await assessOpenStudent(w, student.id);
  assessClick(doc.querySelector('#assess-finish'));
  await w.SLP.ui.render();
  const stored = await w.SLP.db.get('assessments', as.id);
  eq(stored.finishedOn, '2026-10-30', 'closed on the day she said so');
  assert(w.document.querySelector('#assessment-order-form'), 'she can order the next');
  const earlier = w.document.querySelector('#assessment-earlier');
  assert(/1 of 9/.test(earlier.textContent),
         'the gap stays visible in the history, got: ' + earlier.textContent);
});

test('ordering with no date is refused without losing what she typed elsewhere', async () => {
  const w = await loadApp();
  w.SLP.ui.todayStr = () => '2026-09-11';
  await w.SLP.store.saveStudent(w.SLP.model.student({ name: 'Ada' }));
  const [ada] = await w.SLP.db.getAll('students');
  const doc = await assessOpenStudent(w, ada.id);
  assessSetInput(doc.querySelector('#assess-order-date'), '');
  assessClick(doc.querySelector('#assess-order'));
  await w.SLP.ui.render();
  eq(await w.SLP.store.activeAssessment(ada.id), null, 'nothing was created');
  assert(w.document.querySelector('.toast'), 'and she was told why');
});
