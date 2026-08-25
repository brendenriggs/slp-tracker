test('the header offers a backup control', async () => {
  const w = await loadApp();
  assert(w.document.querySelector('#backup-now'), 'back up now');
  assert(w.document.querySelector('#backup-restore-input'), 'restore input');
});

test('a never-backed-up app with data nags', async () => {
  const w = await loadApp();
  await w.SLP.store.saveStudent(w.SLP.model.student({ name: 'Ada' }));
  await w.SLP.ui.render();
  const nag = w.document.querySelector('#backup-nag');
  assert(nag, 'nag shown');
  assert(/never/i.test(nag.textContent), 'says it has never been backed up');
});

test('an empty app does not nag', async () => {
  const w = await loadApp();
  await w.SLP.ui.render();
  eq(w.document.querySelector('#backup-nag'), null, 'nothing to lose yet');
});

test('a recent backup does not nag', async () => {
  const w = await loadApp();
  await w.SLP.store.saveStudent(w.SLP.model.student({ name: 'Ada' }));
  await w.SLP.db.put('meta', { id: 'meta', schemaVersion: 1,
    lastBackupAt: new Date().toISOString(), backupFileHandle: null });
  await w.SLP.ui.render();
  eq(w.document.querySelector('#backup-nag'), null, 'quiet when she is current');
});

test('a stale backup nags with the day count', async () => {
  const w = await loadApp();
  await w.SLP.store.saveStudent(w.SLP.model.student({ name: 'Ada' }));
  await w.SLP.db.put('meta', { id: 'meta', schemaVersion: 1,
    lastBackupAt: new Date(Date.now() - 9 * 86400000).toISOString(), backupFileHandle: null });
  await w.SLP.ui.render();
  assert(/9 days/.test(w.document.querySelector('#backup-nag').textContent),
         'names the number of days');
});

test('the status line reports whether a backup file is linked', async () => {
  const w = await loadApp();
  assert(/not linked/i.test(w.document.querySelector('#backup-status').textContent),
         'no file picked yet');
});

test('restoring from a chosen file replaces the data and re-renders', async () => {
  const w = await loadApp();
  await w.SLP.store.saveStudent(w.SLP.model.student({ name: 'Ada' }));
  const text = await w.SLP.backup.exportText();
  await w.SLP.db.clearAll();

  // Drive the restore handler directly: constructing a real FileList is not possible.
  await w.SLP.ui.backup.restoreFromFile(new w.File([text], 'slp-data-2026-09-07.json',
                                                   { type: 'application/json' }));
  eq((await w.SLP.store.listStudents({})).map(s => s.name), ['Ada'], 'data restored');
});

test('restoring a damaged file reports the problem and changes nothing', async () => {
  const w = await loadApp();
  await w.SLP.store.saveStudent(w.SLP.model.student({ name: 'Ada' }));
  await w.SLP.ui.backup.restoreFromFile(new w.File(['garbage'], 'bad.json'));
  eq((await w.SLP.store.listStudents({})).length, 1, 'her data is untouched');
  const toast = w.document.querySelector('.toast');
  assert(toast && toast.classList.contains('toast-error'), 'and she is told');
});

test('backup now falls back to a download when no file is linked', async () => {
  const w = await loadApp();
  await w.SLP.store.saveStudent(w.SLP.model.student({ name: 'Ada' }));
  let downloaded = null;
  w.SLP.backup.download = async () => { downloaded = 'yes'; };
  await w.SLP.ui.backup.backupNow();
  eq(downloaded, 'yes', 'the fallback carries the load when the API path is unavailable');
});
