// Editing a slot's time. Every top-level name is prefixed `stime` — tests/index.html
// loads each *.test.js into ONE global scope.
//
// Her complaint, 2026-09-02: "If you put the time in wrong for your schedule, I can't edit
// it. So I wrote my note and then realized it was the wrong time. I can't go and fix that
// without deleting the session and then have to retype the notes."
//
// Answered 2026-09-06: it is not one action but three, and she needs all of them.
//   1. Correct a typo      — the time was always 9:30; fixing it corrects what is written up.
//   2. Move the group      — from here on; history stays as it happened.
//   3. Move one session    — this week only, the slot untouched.
// Only (1) rewrites history, so only (1) has to be deliberate about it. The rule that
// makes the three coexist is that a correction only touches sessions still carrying the
// slot's old time — a session already moved on its own is not a copy of the typo.

const STIME_MON_A = '2026-08-31';
const STIME_MON_B = '2026-09-07';

async function stimeSeed(w) {
  const m = w.SLP.model, st = w.SLP.store;
  const ada = m.student({ name: 'Ada' });
  await st.saveStudent(ada);
  const slot = m.slot({ dayOfWeek: 1, startTime: '09:00', endTime: '09:30',
                        studentIds: [ada.id], location: 'Room 4' });
  await st.saveSlot(slot);
  return { ada, slot };
}

// The session she has already written up — the one her complaint is about.
async function stimeWriteUp(w, { slot, ada, date, text = 'Worked on /r/ in words.' }) {
  await w.SLP.store.saveNote({ dateStr: date, slot, studentId: ada.id, text });
  const sessions = await w.SLP.db.getAll('sessions');
  return sessions.find(s => s.date === date && s.slotId === slot.id);
}

function stimeSlotById(w, id) {
  return w.SLP.store.listSlots().then(slots => slots.find(s => s.id === id));
}

test('correcting a typo reaches back into the sessions already written up', async () => {
  const w = await loadApp();
  const { ada, slot } = await stimeSeed(w);
  const written = await stimeWriteUp(w, { slot, ada, date: STIME_MON_A });

  await w.SLP.store.correctSlotTime(slot.id, { startTime: '09:30', endTime: '10:00' });

  const after = await w.SLP.db.get('sessions', written.id);
  eq(after.startTime, '09:30', 'the time it was really held at, all along');
  eq(after.endTime, '10:00', 'and its real end');
  eq((await stimeSlotById(w, slot.id)).startTime, '09:30', 'the template is corrected too');
  const notes = await w.SLP.db.getAll('notes');
  eq(notes.length, 1, 'and she does not retype the note — that is the whole complaint');
  assert(notes[0].text.includes('/r/'), 'word for word what she wrote');
});

test('correcting a typo leaves a session she had already moved on its own', async () => {
  const w = await loadApp();
  const { ada, slot } = await stimeSeed(w);
  const typo = await stimeWriteUp(w, { slot, ada, date: STIME_MON_A });
  const moved = await stimeWriteUp(w, { slot, ada, date: STIME_MON_B });
  await w.SLP.store.moveSession(moved.id, { startTime: '13:00', endTime: '13:30' });

  await w.SLP.store.correctSlotTime(slot.id, { startTime: '09:30', endTime: '10:00' });

  eq((await w.SLP.db.get('sessions', typo.id)).startTime, '09:30', 'the copies of the typo are fixed');
  eq((await w.SLP.db.get('sessions', moved.id)).startTime, '13:00',
     'a session she deliberately moved is not a copy of the typo, and is left alone');
});

test('moving the group from here on leaves history as it happened', async () => {
  const w = await loadApp();
  const { ada, slot } = await stimeSeed(w);
  const written = await stimeWriteUp(w, { slot, ada, date: STIME_MON_A });

  await w.SLP.store.moveSlotTime(slot.id, { startTime: '11:00', endTime: '11:30' });

  eq((await stimeSlotById(w, slot.id)).startTime, '11:00', 'the plan changes');
  eq((await w.SLP.db.get('sessions', written.id)).startTime, '09:00',
     'and the session she wrote up still says when it actually happened');
});

test('moving one session moves nothing else', async () => {
  const w = await loadApp();
  const { ada, slot } = await stimeSeed(w);
  const a = await stimeWriteUp(w, { slot, ada, date: STIME_MON_A });
  const b = await stimeWriteUp(w, { slot, ada, date: STIME_MON_B });

  await w.SLP.store.moveSession(b.id, { startTime: '13:00', endTime: '13:45' });

  eq((await w.SLP.db.get('sessions', b.id)).startTime, '13:00', 'this week only');
  eq((await w.SLP.db.get('sessions', b.id)).endTime, '13:45', 'through its own end');
  eq((await w.SLP.db.get('sessions', a.id)).startTime, '09:00', 'last week is untouched');
  eq((await stimeSlotById(w, slot.id)).startTime, '09:00', 'and the slot is still the plan it was');
});

test('a time that ends before it starts is refused by the store, not just the form', async () => {
  const w = await loadApp();
  const { slot } = await stimeSeed(w);
  for (const call of [
    () => w.SLP.store.correctSlotTime(slot.id, { startTime: '10:00', endTime: '09:00' }),
    () => w.SLP.store.moveSlotTime(slot.id, { startTime: '10:00', endTime: '09:00' }),
  ]) {
    const e = await throws(call);
    // Naming the times it rejected, per tests/backup.test.js:152-168 — "it threw" would
    // pass just as happily against a function that does not exist.
    assert(/10:00/.test(e.message) && /09:00/.test(e.message),
       'the message names what it rejected — got ' + e.message);
  }
  eq((await stimeSlotById(w, slot.id)).endTime, '09:30', 'and nothing was written');
});

// --- the Schedule tab: the two slot-level actions ------------------------------

async function stimeOpenSlotForm(w, slot) {
  await w.SLP.ui.go({ tab: 'schedule' });
  w.document.querySelector('.slot-card[data-slot-id="' + slot.id + '"] .edit-slot-time').click();
  await w.SLP.ui.render();
  return w.document;
}

function stimeType(w, id, value) { w.document.querySelector(id).value = value; }

test('a slot on the schedule offers to have its time edited', async () => {
  const w = await loadApp();
  const { slot } = await stimeSeed(w);
  await w.SLP.ui.go({ tab: 'schedule' });
  const card = w.document.querySelector('.slot-card[data-slot-id="' + slot.id + '"]');
  assert(card.querySelector('.edit-slot-time'),
     'deleting and recreating the slot was the only way, and it cost her the notes');
  eq(w.document.querySelector('#slot-edit-start'), null, 'shut until she asks');
});

test('the two ways out of the form are labelled by what they do to history', async () => {
  const w = await loadApp();
  const { slot } = await stimeSeed(w);
  const doc = await stimeOpenSlotForm(w, slot);
  const form = doc.querySelector('#slot-edit');
  assert(doc.querySelector('#slot-edit-correct'), 'a typo is one act');
  assert(doc.querySelector('#slot-edit-move'), 'moving the group is another');
  assert(/already written up|written up/.test(form.textContent),
     'the one that rewrites history says so — got ' + form.textContent);
});

test('fixing a typo from the schedule corrects the session she wrote up', async () => {
  const w = await loadApp();
  const { ada, slot } = await stimeSeed(w);
  const written = await stimeWriteUp(w, { slot, ada, date: STIME_MON_A });

  await stimeOpenSlotForm(w, slot);
  stimeType(w, '#slot-edit-start', '09:30');
  stimeType(w, '#slot-edit-end', '10:00');
  w.document.querySelector('#slot-edit-correct').click();
  await w.SLP.ui.render();

  eq((await w.SLP.db.get('sessions', written.id)).startTime, '09:30', 'reaching back');
  eq((await stimeSlotById(w, slot.id)).startTime, '09:30', 'and forward');
  eq(w.document.querySelector('#slot-edit'), null, 'the form is done');
  assert(w.document.querySelector('.slot-card[data-slot-id="' + slot.id + '"]')
           .textContent.includes('09:30'), 'and the card shows the corrected time');
});

test('moving the group from the schedule leaves the session she wrote up alone', async () => {
  const w = await loadApp();
  const { ada, slot } = await stimeSeed(w);
  const written = await stimeWriteUp(w, { slot, ada, date: STIME_MON_A });

  await stimeOpenSlotForm(w, slot);
  stimeType(w, '#slot-edit-start', '11:00');
  stimeType(w, '#slot-edit-end', '11:30');
  w.document.querySelector('#slot-edit-move').click();
  await w.SLP.ui.render();

  eq((await stimeSlotById(w, slot.id)).startTime, '11:00', 'the plan moved');
  eq((await w.SLP.db.get('sessions', written.id)).startTime, '09:00', 'history did not');
});

test('an end before the start is refused in the app’s own words', async () => {
  const w = await loadApp();
  const { slot } = await stimeSeed(w);
  await stimeOpenSlotForm(w, slot);
  stimeType(w, '#slot-edit-start', '11:00');
  stimeType(w, '#slot-edit-end', '10:00');
  w.document.querySelector('#slot-edit-correct').click();
  await w.SLP.ui.render();

  eq(w.document.querySelector('.toast').textContent, 'The end time must be after the start.',
     'the sentence the schedule form has always used');
  eq((await stimeSlotById(w, slot.id)).startTime, '09:00', 'and nothing moved');
});

// --- Today: moving this week's session on its own -----------------------------

async function stimeOpenMove(w, date = STIME_MON_A) {
  await w.SLP.ui.go({ tab: 'today', date });
  w.document.querySelector('.slot-section .move-session').click();
  await w.SLP.ui.render();
  return w.document;
}

test('a session she has written up can be moved on its own from Today', async () => {
  const w = await loadApp();
  const { ada, slot } = await stimeSeed(w);
  const written = await stimeWriteUp(w, { slot, ada, date: STIME_MON_A });

  await stimeOpenMove(w);
  stimeType(w, '#session-move-start', '13:00');
  stimeType(w, '#session-move-end', '13:30');
  w.document.querySelector('#session-move-save').click();
  await w.SLP.ui.render();

  eq((await w.SLP.db.get('sessions', written.id)).startTime, '13:00', 'this one moved');
  eq((await stimeSlotById(w, slot.id)).startTime, '09:00', 'the weekly plan did not');
  assert(w.document.querySelector('.slot-section').textContent.includes('13:00'),
     'and the day shows it where it now is');
});

test('a session moved later in the day sits where it now is, not where the slot is', async () => {
  // The day is built from the slots, so a moved session kept its old place in the list
  // and its old time in the heading — both read off the template it no longer follows.
  const w = await loadApp();
  const { ada, slot } = await stimeSeed(w);
  const m = w.SLP.model, st = w.SLP.store;
  const later = m.slot({ dayOfWeek: 1, startTime: '10:00', endTime: '10:30',
                         studentIds: [ada.id], location: 'Room 4' });
  await st.saveSlot(later);
  const written = await stimeWriteUp(w, { slot, ada, date: STIME_MON_A });
  await st.moveSession(written.id, { startTime: '14:00', endTime: '14:30' });

  await w.SLP.ui.go({ tab: 'today', date: STIME_MON_A });
  const heads = [...w.document.querySelectorAll('.slot-section .slot-head')]
    .map(el => el.textContent);
  assert(heads[0].includes('10:00'), 'the untouched 10:00 slot comes first now — got ' + heads[0]);
  assert(heads[1].includes('14:00'),
     'and the moved session reads and sorts at its own time — got ' + heads[1]);
});

test('moving a session she has not charted yet writes one to move', async () => {
  const w = await loadApp();
  const { slot } = await stimeSeed(w);
  eq((await w.SLP.db.getAll('sessions')).length, 0, 'nothing materialized yet');

  await stimeOpenMove(w);
  stimeType(w, '#session-move-start', '13:00');
  stimeType(w, '#session-move-end', '13:30');
  w.document.querySelector('#session-move-save').click();
  await w.SLP.ui.render();

  const sessions = await w.SLP.db.getAll('sessions');
  eq(sessions.length, 1, 'moving a day she has not touched is still a fact about that day');
  eq(sessions[0].startTime, '13:00', 'at the time she moved it to');
  eq(sessions[0].slotId, slot.id, 'still the slot’s session, not an ad-hoc one');
  eq((await stimeSlotById(w, slot.id)).startTime, '09:00', 'and the plan is untouched');
});
