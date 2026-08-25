async function seedForBackup(w) {
  const m = w.SLP.model, st = w.SLP.store;
  const ada = m.student({ name: 'Ada', grade: '3' });
  await st.saveStudent(ada);
  const goal = m.goal({ studentId: ada.id, text: 'STUDENT will identify objects' });
  await st.saveGoal(goal);
  const obj = m.objective({ goalId: goal.id, text: 'STUDENT will name 4 objects' });
  await st.saveObjective(obj);
  const slot = m.slot({ dayOfWeek: 1, startTime: '09:00', endTime: '09:30',
                        studentIds: [ada.id] });
  await st.saveSlot(slot);
  await st.recordValue({ dateStr: '2026-09-07', slot, studentId: ada.id,
                         objectiveId: obj.id,
                         fieldId: obj.fields.find(f => f.role === 'achieved').id, raw: '3' });
  return { ada, goal, obj, slot };
}

test('export includes every store and a schema version', async () => {
  const w = await loadApp();
  await seedForBackup(w);
  const dump = await w.SLP.backup.exportObject();
  eq(typeof dump.schemaVersion, 'number', 'schema version present');
  assert(dump.exportedAt, 'export timestamp present');
  for (const s of w.SLP.db.STORES) {
    assert(Array.isArray(dump.data[s]), 'missing store in export: ' + s);
  }
  eq(dump.data.students.length, 1, 'the student is in the dump');
  eq(dump.data.datapoints.length, 1, 'the datapoint is in the dump');
});

test('the export filename is dated', async () => {
  const w = await loadApp();
  assert(/^slp-data-\d{4}-\d{2}-\d{2}\.json$/.test(w.SLP.backup.filename()),
         'got: ' + w.SLP.backup.filename());
});

test('export text is valid JSON', async () => {
  const w = await loadApp();
  await seedForBackup(w);
  const text = await w.SLP.backup.exportText();
  const parsed = JSON.parse(text);
  eq(parsed.data.students.length, 1, 'round-trips through JSON');
});

test('restore replaces everything with the backup contents', async () => {
  const w = await loadApp();
  const { ada } = await seedForBackup(w);
  const text = await w.SLP.backup.exportText();

  // Diverge from the backup: add a student, delete the original.
  await w.SLP.store.saveStudent(w.SLP.model.student({ name: 'Later Addition' }));
  await w.SLP.db.del('students', ada.id);

  await w.SLP.backup.restoreFromText(text);
  const names = (await w.SLP.store.listStudents({})).map(s => s.name);
  eq(names, ['Ada'], 'restore is a replace, not a merge');
  eq((await w.SLP.db.getAll('datapoints')).length, 1, 'her data came back');
});

test('a full export/restore cycle preserves the entered flag', async () => {
  const w = await loadApp();
  const { obj } = await seedForBackup(w);
  const text = await w.SLP.backup.exportText();
  await w.SLP.db.clearAll();
  await w.SLP.backup.restoreFromText(text);
  const dp = (await w.SLP.db.getAll('datapoints'))[0];
  const achievedId = obj.fields.find(f => f.role === 'achieved').id;
  const targetId = obj.fields.find(f => f.role === 'target').id;
  eq(dp.values[achievedId].entered, true, 'her observation survived the round trip');
  eq(dp.values[targetId].entered, false,
     'and the pre-filled target did NOT become one');
});

test('restore rejects a file that is not JSON, leaving data untouched', async () => {
  const w = await loadApp();
  await seedForBackup(w);
  await throws(() => w.SLP.backup.restoreFromText('this is not json'),
               'should reject non-JSON');
  eq((await w.SLP.store.listStudents({})).length, 1, 'existing data untouched');
});

test('restore rejects a foreign JSON file, leaving data untouched', async () => {
  const w = await loadApp();
  await seedForBackup(w);
  await throws(() => w.SLP.backup.restoreFromText('{"hello":"world"}'),
               'should reject a file that is not an SLP backup');
  eq((await w.SLP.store.listStudents({})).length, 1, 'existing data untouched');
});

test('restore rejects a backup with a store missing, leaving data untouched', async () => {
  const w = await loadApp();
  await seedForBackup(w);
  const dump = await w.SLP.backup.exportObject();
  delete dump.data.datapoints;
  await throws(() => w.SLP.backup.restoreFromText(JSON.stringify(dump)),
               'should reject a truncated backup');
  eq((await w.SLP.db.getAll('datapoints')).length, 1,
     'a half-written file must never half-restore');
});

test('restore rejects a newer schema version than this app understands', async () => {
  const w = await loadApp();
  await seedForBackup(w);
  const dump = await w.SLP.backup.exportObject();
  dump.schemaVersion = 999;
  await throws(() => w.SLP.backup.restoreFromText(JSON.stringify(dump)),
               'should refuse a backup from a future version');
});

test('backup status reports staleness', async () => {
  const w = await loadApp();
  const before = await w.SLP.backup.status();
  eq(before.lastBackupAt, null, 'never backed up yet');
  eq(before.hasHandle, false, 'no file picked yet');

  await w.SLP.db.put('meta', { id: 'meta', schemaVersion: 1,
    lastBackupAt: new Date(Date.now() - 5 * 86400000).toISOString(), backupFileHandle: null });
  const after = await w.SLP.backup.status();
  eq(after.staleDays, 5, 'five days since the last backup');
});

test('writeToHandle reports no-handle before a file is picked', async () => {
  const w = await loadApp();
  eq(await w.SLP.backup.writeToHandle(), 'no-handle', 'nothing to write to yet');
});

test('the File System Access API is detected', async () => {
  const w = await loadApp();
  eq(w.SLP.backup.hasFileApi(), typeof w.showSaveFilePicker === 'function',
     'detection matches reality in this browser');
});

// Reading a backup and committing to it are separate acts, so she can be shown what a
// file holds before anything of hers is replaced.
test('parseBackup reports what a file holds without changing anything', async () => {
  const w = await loadApp();
  await w.SLP.store.saveStudent(w.SLP.model.student({ name: 'Ada' }));
  const text = await w.SLP.backup.exportText();
  await w.SLP.store.saveStudent(w.SLP.model.student({ name: 'Grace' }));

  const parsed = w.SLP.backup.parseBackup(text);
  eq(parsed.counts.students, 1, 'the file holds one student');
  eq((await w.SLP.store.listStudents({})).length, 2, 'and hers are untouched');
});

test('parseBackup counts sessions too, so a wrong file is obvious', async () => {
  const w = await loadApp();
  const parsed = w.SLP.backup.parseBackup(await w.SLP.backup.exportText());
  eq(parsed.counts.sessions, 0, 'an empty app exports no sessions');
});

// These assert the function exists before asserting it throws: otherwise a missing
// parseBackup throws a TypeError and the test passes green having proved nothing.
test('parseBackup refuses a damaged file', async () => {
  const w = await loadApp();
  assert(typeof w.SLP.backup.parseBackup === 'function', 'parseBackup exists');
  const e = await throws(() => w.SLP.backup.parseBackup('garbage'), 'unreadable json must throw');
  assert(!/is not a function/.test(e.message), 'and throws about the file, not about itself');
});

test('parseBackup refuses a file that is not an SLP backup', async () => {
  const w = await loadApp();
  assert(typeof w.SLP.backup.parseBackup === 'function', 'parseBackup exists');
  const e = await throws(() => w.SLP.backup.parseBackup('{"hello":"world"}'),
                         'a stray json file must throw');
  assert(/SLP Session Tracker backup|schema version/i.test(e.message),
         'named for what is wrong with it — got: ' + e.message);
});

// ---------------------------------------------------------------------------
// Starting fresh. Clearing the app used to mean opening DevTools and deleting an
// IndexedDB by hand, which is not a thing to ask of someone who is not a developer.
// ---------------------------------------------------------------------------

test('startFresh empties every store that holds her work', async () => {
  const w = await loadApp();
  assert(typeof w.SLP.backup.startFresh === 'function', 'startFresh exists');
  await seedForBackup(w);
  await w.SLP.backup.startFresh();
  for (const store of w.SLP.db.STORES) {
    if (store === 'meta') continue;
    eq((await w.SLP.db.getAll(store)).length, 0, store + ' is empty');
  }
});

// The handle is where her backups go, not part of what she is clearing. Losing it
// would silently stop backups on the very screen that just told her she is safe.
test('startFresh keeps the linked backup file', async () => {
  const w = await loadApp();
  await seedForBackup(w);
  const stamp = new Date().toISOString();
  await w.SLP.db.put('meta', { id: 'meta', schemaVersion: 1, lastBackupAt: stamp,
                               backupFileHandle: { name: 'speech-backup.json' } });
  await w.SLP.backup.startFresh();
  const status = await w.SLP.backup.status();
  eq(status.fileName, 'speech-backup.json', 'still linked');
  eq(status.lastBackupAt, stamp, 'and the file really does hold what it held');
});

test('startFresh reports what it cleared', async () => {
  const w = await loadApp();
  await seedForBackup(w);
  const { cleared } = await w.SLP.backup.startFresh();
  eq(cleared.students, 1, 'counted the student');
  assert(cleared.sessions >= 1, 'and the session');
});

// ---------------------------------------------------------------------------
// How long since the last save. Day granularity was useless during the day it
// mattered most: back up after first period, and the bar still read "today" —
// the same words it read before she pressed it, so the button gave no feedback
// that it had worked. Minutes and hours are what a school day is measured in.
// ---------------------------------------------------------------------------

const AT = (w, iso, nowIso) => w.SLP.backup.sinceLabel(iso, new Date(nowIso));
const NOW = '2026-08-25T14:00:00';

test('sinceLabel says so plainly when there is no backup at all', async () => {
  const w = await loadApp();
  assert(typeof w.SLP.backup.sinceLabel === 'function', 'sinceLabel exists');
  eq(AT(w, null, NOW), 'never backed up', 'not "0 minutes ago"');
});

// The point of the whole change: pressing the button must visibly change the line.
test('sinceLabel reads as just now immediately after a backup', async () => {
  const w = await loadApp();
  eq(AT(w, '2026-08-25T14:00:00', NOW), 'just now', 'at the same instant');
  eq(AT(w, '2026-08-25T13:59:30', NOW), 'just now', 'and half a minute later');
});

test('sinceLabel counts minutes within the hour', async () => {
  const w = await loadApp();
  eq(AT(w, '2026-08-25T13:59:00', NOW), '1 minute ago', 'singular at one');
  eq(AT(w, '2026-08-25T13:48:00', NOW), '12 minutes ago', 'plural after');
  eq(AT(w, '2026-08-25T13:01:00', NOW), '59 minutes ago', 'right up to the hour');
});

test('sinceLabel counts hours within the day', async () => {
  const w = await loadApp();
  eq(AT(w, '2026-08-25T13:00:00', NOW), '1 hour ago', 'singular at one');
  eq(AT(w, '2026-08-25T08:00:00', NOW), '6 hours ago', 'across a morning');
  eq(AT(w, '2026-08-24T15:00:00', NOW), '23 hours ago', 'right up to the day');
});

test('sinceLabel counts days past that', async () => {
  const w = await loadApp();
  eq(AT(w, '2026-08-24T14:00:00', NOW), 'yesterday', 'a day gets a word, not a number');
  eq(AT(w, '2026-08-22T14:00:00', NOW), '3 days ago', 'and then days');
});

// A clock that has been set back, or a file restored from a machine an hour ahead,
// must not produce "in 40 minutes" on a line about the past.
test('sinceLabel does not go backwards when the clock disagrees', async () => {
  const w = await loadApp();
  eq(AT(w, '2026-08-25T14:40:00', NOW), 'just now', 'a future stamp reads as just now');
});

test('the status line carries the fine-grained time, not the day count', async () => {
  const w = await loadApp();
  await w.SLP.db.put('meta', { id: 'meta', schemaVersion: 1, backupFileHandle: null,
                               lastBackupAt: new Date(Date.now() - 12 * 60000).toISOString() });
  const status = await w.SLP.backup.status();
  eq(status.since, '12 minutes ago', 'status reports it so the bar can show it');
});
