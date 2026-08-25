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

// ---------------------------------------------------------------------------
// Start fresh. Emptying the app was a DevTools job — open the console, delete an
// IndexedDB by name — which is not a thing to ask of someone who is not a developer.
// It is guarded exactly like restore, and for the same reason: what makes it safe is
// not how hard the button is to press, but whether a copy exists on disk first.
// ---------------------------------------------------------------------------

async function openMore(w) {
  w.document.querySelector('#backup-more').click();
  await w.SLP.ui.render();
  return w.document;
}

// click() discards the handler's promise, so there is nothing to await for a button
// whose work is asynchronous. Draining the render loop once is not enough — startFresh
// counts every store before it clears, and each count is another turn. Settle on the
// condition itself rather than on a guessed number of renders.
async function settle(w, predicate, what) {
  for (let i = 0; i < 20; i++) {
    if (await predicate()) return;
    await w.SLP.ui.render();
  }
  throw new Error('timed out waiting for ' + what);
}
const backedUpToday = (w, name) => w.SLP.db.put('meta',
  { id: 'meta', schemaVersion: 1, lastBackupAt: new Date().toISOString(),
    backupFileHandle: name ? { name } : null });

test('start fresh stays behind More with the other rare controls', async () => {
  const w = await loadApp();
  eq(w.document.querySelector('#start-fresh'), null, 'not sitting on the bar');
  const doc = await openMore(w);
  assert(doc.querySelector('#start-fresh'), 'it appears with restore');
});

test('start fresh clears nothing until it is confirmed', async () => {
  const w = await loadApp();
  await w.SLP.store.saveStudent(w.SLP.model.student({ name: 'Ada' }));
  await backedUpToday(w, 'speech-backup.json');
  const doc = await openMore(w);
  doc.querySelector('#start-fresh').click();
  await w.SLP.ui.render();
  eq((await w.SLP.store.listStudents({})).length, 1, 'her student is still there');
  assert(doc.querySelector('#start-fresh-confirm'), 'and she is being asked');
});

test('the confirmation counts what would be erased', async () => {
  const w = await loadApp();
  for (const n of ['Ada', 'Bo']) await w.SLP.store.saveStudent(w.SLP.model.student({ name: n }));
  await backedUpToday(w, 'speech-backup.json');
  const doc = await openMore(w);
  doc.querySelector('#start-fresh').click();
  await w.SLP.ui.render();
  const text = doc.querySelector('#start-fresh-confirm').textContent;
  assert(/2 students/.test(text), 'names the number at stake — got: ' + text);
});

test('backing out of start fresh leaves the data alone', async () => {
  const w = await loadApp();
  await w.SLP.store.saveStudent(w.SLP.model.student({ name: 'Ada' }));
  await backedUpToday(w, 'speech-backup.json');
  const doc = await openMore(w);
  doc.querySelector('#start-fresh').click();
  await w.SLP.ui.render();
  doc.querySelector('#start-fresh-cancel').click();
  await w.SLP.ui.render();
  eq((await w.SLP.store.listStudents({})).length, 1, 'still there');
  eq(doc.querySelector('#start-fresh-confirm'), null, 'and the panel is gone');
});

test('confirming start fresh empties the app', async () => {
  const w = await loadApp();
  await w.SLP.store.saveStudent(w.SLP.model.student({ name: 'Ada' }));
  await backedUpToday(w, 'speech-backup.json');
  const doc = await openMore(w);
  doc.querySelector('#start-fresh').click();
  await w.SLP.ui.render();
  doc.querySelector('#start-fresh-go').click();
  await settle(w, async () => (await w.SLP.store.listStudents({})).length === 0,
               'the app to empty');
  eq((await w.SLP.store.listStudents({})).length, 0, 'empty');
  eq((await w.SLP.backup.status()).fileName, 'speech-backup.json', 'but still linked');
  eq(doc.querySelector('#start-fresh-confirm'), null, 'and the panel is gone');
});

// The gate is about what is on disk, not about how scary the button is.
test('data backed up today is cleared without making her type', async () => {
  const w = await loadApp();
  await w.SLP.store.saveStudent(w.SLP.model.student({ name: 'Ada' }));
  await backedUpToday(w, 'speech-backup.json');
  const doc = await openMore(w);
  doc.querySelector('#start-fresh').click();
  await w.SLP.ui.render();
  eq(doc.querySelector('#start-fresh-phrase'), null, 'a copy is safe on disk');
  eq(doc.querySelector('#start-fresh-go').disabled, false, 'so the button is live');
});

test('erasing work that was never backed up demands the typed phrase', async () => {
  const w = await loadApp();
  await w.SLP.store.saveStudent(w.SLP.model.student({ name: 'Ada' }));
  const doc = await openMore(w);
  doc.querySelector('#start-fresh').click();
  await w.SLP.ui.render();
  const box = doc.querySelector('#start-fresh-phrase');
  assert(box, 'the heavy gate is up');
  eq(doc.querySelector('#start-fresh-go').disabled, true, 'and the button is held shut');
  box.value = 'DELETE EVERYTHING';
  box.dispatchEvent(new w.Event('input', { bubbles: true }));
  eq(doc.querySelector('#start-fresh-go').disabled, false, 'typing it opens the gate');
});

test('a half-typed phrase does not unlock start fresh', async () => {
  const w = await loadApp();
  await w.SLP.store.saveStudent(w.SLP.model.student({ name: 'Ada' }));
  const doc = await openMore(w);
  doc.querySelector('#start-fresh').click();
  await w.SLP.ui.render();
  const box = doc.querySelector('#start-fresh-phrase');
  box.value = 'DELETE EVERY';
  box.dispatchEvent(new w.Event('input', { bubbles: true }));
  eq(doc.querySelector('#start-fresh-go').disabled, true, 'still shut');
});

// Nothing to lose is not the same as nothing to think about, but it is close
// enough that a typed phrase would be friction for its own sake.
test('an already-empty app is cleared without ceremony', async () => {
  const w = await loadApp();
  const doc = await openMore(w);
  doc.querySelector('#start-fresh').click();
  await w.SLP.ui.render();
  eq(doc.querySelector('#start-fresh-phrase'), null, 'nothing to lose');
  const text = doc.querySelector('#start-fresh-confirm').textContent;
  assert(/nothing/i.test(text), 'and it says so — got: ' + text);
});

// Restore and start fresh both own the pane below the bar; two confirmations
// stacked there would be a genuinely dangerous thing to mis-click between.
test('opening start fresh puts away a pending restore', async () => {
  const w = await loadApp();
  await w.SLP.store.saveStudent(w.SLP.model.student({ name: 'Ada' }));
  await backedUpToday(w, 'speech-backup.json');
  const text = JSON.stringify({ schemaVersion: 1, exportedAt: new Date().toISOString(),
    data: { students: [], goals: [], objectives: [], slots: [], sessions: [],
            datapoints: [], attendance: [], notes: [], meta: [] } });
  await w.SLP.ui.backup.restoreFromFile(new w.File([text], 'b.json'));
  assert(w.document.querySelector('#restore-confirm'), 'a restore is pending');
  const doc = await openMore(w);
  doc.querySelector('#start-fresh').click();
  await w.SLP.ui.render();
  eq(doc.querySelector('#restore-confirm'), null, 'the restore stood down');
  assert(doc.querySelector('#start-fresh-confirm'), 'and start fresh has the pane');
});
