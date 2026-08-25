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

test('the status line says plainly that backups are not saving anywhere yet', async () => {
  const w = await loadApp();
  assert(/not saving to a file/i.test(w.document.querySelector('#backup-status').textContent),
         'no file picked yet, said without jargon');
});

test('the status line names the linked file once one is chosen', async () => {
  const w = await loadApp();
  await w.SLP.db.put('meta', { id: 'meta', schemaVersion: 1, lastBackupAt: null,
                               backupFileHandle: { name: 'speech-backup.json' } });
  await w.SLP.ui.render();
  assert(/speech-backup\.json/.test(w.document.querySelector('#backup-status').textContent),
         'she can see exactly which file she is trusting');
});

// The button and the time it last worked belong on the same line: pressing Back up now
// should visibly change the words beside it, which "today" never did.
test('the bar shows how long ago it saved, beside the button', async () => {
  const w = await loadApp();
  await w.SLP.db.put('meta', { id: 'meta', schemaVersion: 1,
                               lastBackupAt: new Date(Date.now() - 12 * 60000).toISOString(),
                               backupFileHandle: { name: 'speech-backup.json' } });
  await w.SLP.ui.render();
  const bar = w.document.querySelector('#backup-bar');
  assert(/12 minutes ago/.test(bar.textContent),
         'minutes, not a day count — got: ' + bar.textContent);
  assert(bar.contains(w.document.querySelector('#backup-now')), 'on the same line as the button');
});

test('the rarely used controls stay tucked away until More is opened', async () => {
  const w = await loadApp();
  assert(!w.document.querySelector('#backup-restore'), 'restore is not sitting on the bar');
  assert(!w.document.querySelector('#backup-pick'), 'nor is changing the file');
  assert(w.document.querySelector('#backup-now'), 'the everyday action still is');

  w.document.querySelector('#backup-more').click();
  await w.SLP.ui.render();
  assert(w.document.querySelector('#backup-restore'), 'restore appears once she opens More');
});

test('choosing a restore file replaces nothing until it is confirmed', async () => {
  const w = await loadApp();
  await w.SLP.store.saveStudent(w.SLP.model.student({ name: 'Ada' }));
  const text = await w.SLP.backup.exportText();
  await w.SLP.store.saveStudent(w.SLP.model.student({ name: 'Grace' }));

  // Drive the restore handler directly: constructing a real FileList is not possible.
  await w.SLP.ui.backup.restoreFromFile(new w.File([text], 'slp-data-2026-09-07.json',
                                                   { type: 'application/json' }));
  eq((await w.SLP.store.listStudents({})).length, 2, 'still her data until she says yes');
  assert(w.document.querySelector('#restore-confirm'), 'and the confirmation is on screen');
});

test('the confirmation counts what is at stake on both sides', async () => {
  const w = await loadApp();
  await w.SLP.store.saveStudent(w.SLP.model.student({ name: 'Ada' }));
  const text = await w.SLP.backup.exportText();
  await w.SLP.store.saveStudent(w.SLP.model.student({ name: 'Grace' }));

  await w.SLP.ui.backup.restoreFromFile(new w.File([text], 'b.json'));
  const panel = w.document.querySelector('#restore-confirm').textContent;
  assert(/2 students/.test(panel), 'what she has now — got: ' + panel);
  assert(/1 student\b/.test(panel), 'what the file holds — got: ' + panel);
});

test('cancelling a restore leaves the data alone', async () => {
  const w = await loadApp();
  await w.SLP.store.saveStudent(w.SLP.model.student({ name: 'Ada' }));
  const text = await w.SLP.backup.exportText();
  await w.SLP.store.saveStudent(w.SLP.model.student({ name: 'Grace' }));

  await w.SLP.ui.backup.restoreFromFile(new w.File([text], 'b.json'));
  w.document.querySelector('#restore-confirm-cancel').click();
  await w.SLP.ui.render();

  eq((await w.SLP.store.listStudents({})).length, 2, 'nothing replaced');
  assert(!w.document.querySelector('#restore-confirm'), 'and the panel is gone');
});

test('confirming a restore replaces the data and re-renders', async () => {
  const w = await loadApp();
  await w.SLP.store.saveStudent(w.SLP.model.student({ name: 'Ada' }));
  const text = await w.SLP.backup.exportText();
  await w.SLP.db.clearAll();

  await w.SLP.ui.backup.restoreFromFile(new w.File([text], 'slp-data-2026-09-07.json',
                                                   { type: 'application/json' }));
  w.document.querySelector('#restore-confirm-go').click();
  await w.SLP.ui.render();
  eq((await w.SLP.store.listStudents({})).map(s => s.name), ['Ada'], 'data restored');
});

test('restoring into an empty app asks only once', async () => {
  const w = await loadApp();
  await w.SLP.store.saveStudent(w.SLP.model.student({ name: 'Ada' }));
  const text = await w.SLP.backup.exportText();
  await w.SLP.db.clearAll();

  await w.SLP.ui.backup.restoreFromFile(new w.File([text], 'b.json'));
  assert(!w.document.querySelector('#restore-confirm-phrase'),
         'nothing to lose, so nothing to type');
  assert(!w.document.querySelector('#restore-confirm-go').disabled, 'she can just proceed');
});

test('replacing data that was never backed up demands the typed phrase', async () => {
  const w = await loadApp();
  await w.SLP.store.saveStudent(w.SLP.model.student({ name: 'Ada' }));
  const text = await w.SLP.backup.exportText();
  await w.SLP.store.saveStudent(w.SLP.model.student({ name: 'Grace' }));

  await w.SLP.ui.backup.restoreFromFile(new w.File([text], 'b.json'));
  assert(w.document.querySelector('#restore-confirm-go').disabled,
         'the button is dead until she types it');

  const box = w.document.querySelector('#restore-confirm-phrase');
  assert(box, 'and there is somewhere to type it');
  box.value = 'REPLACE EVERYTHING';
  box.dispatchEvent(new w.Event('input', { bubbles: true }));
  assert(!w.document.querySelector('#restore-confirm-go').disabled, 'now she may');
});

test('a half-typed phrase does not unlock the replace button', async () => {
  const w = await loadApp();
  await w.SLP.store.saveStudent(w.SLP.model.student({ name: 'Ada' }));
  const text = await w.SLP.backup.exportText();
  await w.SLP.store.saveStudent(w.SLP.model.student({ name: 'Grace' }));

  await w.SLP.ui.backup.restoreFromFile(new w.File([text], 'b.json'));
  const box = w.document.querySelector('#restore-confirm-phrase');
  box.value = 'REPLACE EVERY';
  box.dispatchEvent(new w.Event('input', { bubbles: true }));
  assert(w.document.querySelector('#restore-confirm-go').disabled, 'still locked');
});

test('data backed up today is replaced without making her type', async () => {
  const w = await loadApp();
  await w.SLP.store.saveStudent(w.SLP.model.student({ name: 'Ada' }));
  const text = await w.SLP.backup.exportText();
  await w.SLP.store.saveStudent(w.SLP.model.student({ name: 'Grace' }));
  await w.SLP.db.put('meta', { id: 'meta', schemaVersion: 1,
                               lastBackupAt: new Date().toISOString(),
                               backupFileHandle: { name: 'speech-backup.json' } });

  await w.SLP.ui.backup.restoreFromFile(new w.File([text], 'b.json'));
  assert(!w.document.querySelector('#restore-confirm-phrase'),
         'her work is safe on disk, so the heavy gate would be friction for nothing');
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
