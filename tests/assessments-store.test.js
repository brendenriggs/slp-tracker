// Helpers in this file are prefixed `assess` — test files share one global scope, so a
// bare `seed()` here would silently overwrite another file's.
async function assessSeedStudent(w, name = 'Ada') {
  await w.SLP.store.saveStudent(w.SLP.model.student({ name }));
  const all = await w.SLP.db.getAll('students');
  return all.find(s => s.name === name);
}

test('ordering an assessment stores it against the student, open', async () => {
  const w = await loadApp();
  const ada = await assessSeedStudent(w);
  const as = await w.SLP.store.orderAssessment(ada.id, '2026-09-11');
  eq(as.studentId, ada.id, 'it belongs to her');
  eq(as.finishedOn, null, 'a new assessment is open');
  eq(as.components.length, 9, 'it carries the nine');
  const active = await w.SLP.store.activeAssessment(ada.id);
  eq(active.id, as.id, 'and it is the active one');
});

test('a student with one open assessment cannot be given a second', async () => {
  const w = await loadApp();
  const ada = await assessSeedStudent(w);
  await w.SLP.store.orderAssessment(ada.id, '2026-09-11');
  const e = await throws(() => w.SLP.store.orderAssessment(ada.id, '2026-10-01'),
                         'a second open assessment must be refused');
  assert(/already has an assessment/i.test(e.message),
         'the message must say why, got: ' + e.message);
});

test('finishing one frees the student for the next', async () => {
  const w = await loadApp();
  const ada = await assessSeedStudent(w);
  const first = await w.SLP.store.orderAssessment(ada.id, '2026-09-11');
  await w.SLP.store.finishAssessment(first.id, '2026-11-01');
  eq(await w.SLP.store.activeAssessment(ada.id), null, 'nothing is open now');
  const second = await w.SLP.store.orderAssessment(ada.id, '2027-09-11');
  eq((await w.SLP.store.activeAssessment(ada.id)).id, second.id, 'the new one is active');
  const all = await w.SLP.store.assessmentsForStudent(ada.id);
  eq(all.map(a => a.orderedOn), ['2027-09-11', '2026-09-11'], 'newest first, history kept');
});

test('she can finish an assessment with components still undated', async () => {
  const w = await loadApp();
  const ada = await assessSeedStudent(w);
  const as = await w.SLP.store.orderAssessment(ada.id, '2026-09-11');
  await w.SLP.store.setComponentDate(as.id, 'backgroundHistory', '2026-09-20');
  const done = await w.SLP.store.finishAssessment(as.id, '2026-10-01');
  eq(done.finishedOn, '2026-10-01', 'it is closed');
  eq(w.SLP.derive.assessmentDue(done, '2026-10-01').done, 1,
     'and it still reports 1 of 9, rather than hiding the gap');
});

test('a component date is written, and clearing it writes null', async () => {
  const w = await loadApp();
  const ada = await assessSeedStudent(w);
  const as = await w.SLP.store.orderAssessment(ada.id, '2026-09-11');
  const dated = await w.SLP.store.setComponentDate(as.id, 'languageSample', '2026-10-02');
  eq(dated.components.find(c => c.key === 'languageSample').date, '2026-10-02', 'written');
  const cleared = await w.SLP.store.setComponentDate(as.id, 'languageSample', null);
  eq(cleared.components.find(c => c.key === 'languageSample').date, null,
     'cleared back to not-done; there is no separate flag to disagree with it');
});

test('an unknown component is refused by name', async () => {
  const w = await loadApp();
  const ada = await assessSeedStudent(w);
  const as = await w.SLP.store.orderAssessment(ada.id, '2026-09-11');
  const e = await throws(() => w.SLP.store.setComponentDate(as.id, 'lunchOrdered', '2026-10-02'),
                         'an unknown component must be refused');
  assert(/lunchOrdered/.test(e.message),
         'the message must name what was rejected, got: ' + e.message);
});

test('a malformed component date is refused rather than stored', async () => {
  const w = await loadApp();
  const ada = await assessSeedStudent(w);
  const as = await w.SLP.store.orderAssessment(ada.id, '2026-09-11');
  const e = await throws(() => w.SLP.store.setComponentDate(as.id, 'languageSample', '02/10/2026'),
                         'a non-ISO date must be refused');
  assert(/02\/10\/2026/.test(e.message),
         'the message must quote what was rejected, got: ' + e.message);
  const still = await w.SLP.db.get('assessments', as.id);
  eq(still.components.find(c => c.key === 'languageSample').date, null, 'nothing was stored');
});

test('assessments survive an export and restore with their dates intact', async () => {
  const w = await loadApp();
  const ada = await assessSeedStudent(w);
  const as = await w.SLP.store.orderAssessment(ada.id, '2026-09-11');
  await w.SLP.store.setComponentDate(as.id, 'languageSample', '2026-10-02');
  const text = await w.SLP.backup.exportText();
  eq(JSON.parse(text).schemaVersion, 2, 'the file declares the version it was written at');
  await w.SLP.backup.restoreFromText(text);
  const [back] = await w.SLP.db.getAll('assessments');
  eq(back.orderedOn, '2026-09-11', 'the order date came back');
  eq(back.components.find(c => c.key === 'languageSample').date, '2026-10-02',
     'the component date came back exactly');
});
