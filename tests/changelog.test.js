// The changelog she can read if she wants to. Every top-level name is prefixed `clog` —
// tests/index.html loads each *.test.js into ONE global scope.
//
// Brenden, 2026-09-06: "we should be having a changelog that she can read if she wants
// to. noninvasive, she has to click a button to see it. not a popup." All three
// constraints are pinned below — closed until asked for, opened in the page's own flow,
// and never over the top of what she was reading.

function clogToggle(doc) { return doc.querySelector('#changelog-toggle'); }

async function clogOpen(w) {
  clogToggle(w.document).click();
  await w.SLP.ui.render();
  return w.document;
}

test('the footer still says which version she is on', async () => {
  const w = await loadApp();
  const button = clogToggle(w.document);
  assert(button, 'the version stamp is the control now');
  assert(button.textContent.includes('v' + w.SLP.version),
     '"did you get the update?" is answered over the phone by her reading this back — got '
     + button.textContent);
  assert(button.id, 'a control that survives a render is found again by its id');
});

test('the changelog stays shut until she asks for it', async () => {
  const w = await loadApp();
  eq(w.document.querySelector('#changelog'), null,
     'nothing she did not ask for appears on the page she opened');
  eq(clogToggle(w.document).getAttribute('aria-expanded'), 'false',
     'and the control says so');
});

test('it opens inside the page, not over it', async () => {
  const w = await loadApp();
  const before = w.document.body.scrollHeight;
  const doc = await clogOpen(w);
  const panel = doc.querySelector('#changelog');
  assert(panel, 'the panel is open');
  eq(clogToggle(doc).getAttribute('aria-expanded'), 'true', 'and the control says so');

  const position = w.getComputedStyle(panel).position;
  assert(position !== 'fixed' && position !== 'absolute',
     'a popup covers what she was reading — this must not — got ' + position);
  assert(w.document.body.scrollHeight > before,
     'it takes its own room in the page rather than floating above someone else’s');
  eq(doc.querySelectorAll('dialog, .toast').length, 0, 'and nothing is modal');
});

test('clicking again puts it away', async () => {
  const w = await loadApp();
  await clogOpen(w);
  clogToggle(w.document).click();
  await w.SLP.ui.render();
  eq(w.document.querySelector('#changelog'), null, 'closed by the same control that opened it');
  assert(clogToggle(w.document), 'and the control is still there');
});

test('the changelog opens on the version she is running', async () => {
  // The pin: shipping a version with nothing written for it fails here rather than
  // being noticed by her, months later, wondering what changed.
  const w = await loadApp();
  const log = w.SLP.changelog;
  assert(Array.isArray(log) && log.length, 'there is a changelog at all');
  eq(log[0].version, w.SLP.version, 'the newest release is the one running');
  for (const release of log) {
    assert(/^\d+\.\d+\.\d+$/.test(release.version), 'numbered — got ' + release.version);
    assert(/^\d{4}-\d{2}-\d{2}$/.test(release.date), 'and dated — got ' + release.date);
    assert(release.notes.length, release.version + ' says nothing about itself');
  }
});

test('the releases run newest first', async () => {
  const w = await loadApp();
  const dates = w.SLP.changelog.map(r => r.date);
  eq(dates, [...dates].sort().reverse(), 'she reads the top of the list for what just changed');
});

test('every line is written for her, not lifted from git', async () => {
  // The failure this exists to catch: a future release note pasted from a commit
  // subject. "perf: the grid derives the rows she can see" is true and she cannot
  // read it — she has never seen the grid's rows called anything.
  const w = await loadApp();
  for (const release of w.SLP.changelog) {
    for (const note of release.notes) {
      assert(!/^(feat|fix|docs|chore|perf|test|refactor)[:(]/.test(note),
         'a commit subject, not a sentence: ' + note);
      assert(/[.?!]$/.test(note), 'a whole sentence, ending in a full stop: ' + note);
    }
  }
});

test('it renders every release, with its number and its date', async () => {
  const w = await loadApp();
  const doc = await clogOpen(w);
  const panel = doc.querySelector('#changelog');
  for (const release of w.SLP.changelog) {
    const el = panel.querySelector('[data-version="' + release.version + '"]');
    assert(el, release.version + ' is missing from the panel');
    assert(el.textContent.includes(release.notes[0]),
       release.version + ' does not say what changed');
  }
});
