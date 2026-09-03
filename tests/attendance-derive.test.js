// The attendance vocabulary and the arithmetic that comes off it.
//
// Helpers here are prefixed `att` on purpose: tests/index.html loads every
// *.test.js as a classic script into ONE global scope, so a bare `chart()`
// or `row()` here would silently clobber another file's.

test('the status vocabulary is exactly the four outcomes', async () => {
  const w = await loadApp();
  eq([...w.SLP.model.ATTENDANCE_STATUSES],
     ['present', 'absent', 'missed', 'cancelled'],
     'one field carries the outcome, and these are its values');
});

test('an unknown attendance status is refused at construction', async () => {
  const w = await loadApp();
  await throws(() => w.SLP.model.attendance({
    sessionId: 'se1', studentId: 's1', status: 'excused',
  }), 'a status outside the vocabulary must not reach the database');
});

test('a null status is legal — a makeup booked but not yet held', async () => {
  const w = await loadApp();
  const row = w.SLP.model.attendance({
    sessionId: 'se1', studentId: 's1', status: null, isMakeup: true,
  });
  eq(row.status, null, 'the row exists to carry isMakeup, not an outcome');
  eq(row.isMakeup, true, 'and the makeup flag survives');
});

test('minutesOf measures a span in whole minutes', async () => {
  const w = await loadApp();
  eq(w.SLP.derive.minutesOf({ startTime: '09:00', endTime: '09:30' }), 30, 'half hour');
  eq(w.SLP.derive.minutesOf({ startTime: '09:45', endTime: '10:15' }), 30,
     'and it crosses the hour boundary');
});

test('minutesOf reads a slot and a session identically', async () => {
  const w = await loadApp();
  const m = w.SLP.model;
  const slot = m.slot({ dayOfWeek: 1, startTime: '11:00', endTime: '11:45', studentIds: [] });
  const session = m.session({ date: '2026-10-05', startTime: '11:00', endTime: '11:45' });
  eq(w.SLP.derive.minutesOf(slot), 45, 'a slot has the same shape');
  eq(w.SLP.derive.minutesOf(session), 45, 'so one helper serves both');
});

test('minutesOf returns 0 rather than NaN on unusable times', async () => {
  const w = await loadApp();
  eq(w.SLP.derive.minutesOf({ startTime: '', endTime: '' }), 0, 'blank');
  eq(w.SLP.derive.minutesOf(null), 0, 'nothing at all');
  eq(w.SLP.derive.minutesOf({ startTime: '10:00', endTime: '09:00' }), 0,
     'a backwards span is not negative minutes');
});

test('a null-status row does not read as a state on Today', async () => {
  const w = await loadApp();
  const entry = { attendance: { s1: { status: null, isMakeup: true } },
                  notes: {}, datapoints: {} };
  eq(w.SLP.derive.studentState(entry, 's1'), 'none',
     'booked-but-unmarked is not charted yet — it must not leak a null onto the card');
});

const attMiss = (minutes, isMakeup = false) => ({ status: 'missed', isMakeup, minutes });
const attHeld = (minutes, isMakeup = false) => ({ status: 'present', isMakeup, minutes });

test('a session she missed owes its minutes', async () => {
  const w = await loadApp();
  eq(w.SLP.derive.makeupBalance([attMiss(30)]),
     { debt: 30, credit: 0, owed: 30 }, 'the debt is hers');
});

test('a held makeup pays the debt down', async () => {
  const w = await loadApp();
  eq(w.SLP.derive.makeupBalance([attMiss(30), attHeld(30, true)]),
     { debt: 30, credit: 30, owed: 0 }, 'settled');
});

test('over-delivering is not a balance she can draw down', async () => {
  const w = await loadApp();
  const b = w.SLP.derive.makeupBalance([attMiss(30), attHeld(60, true)]);
  eq(b.owed, 0, 'never a positive credit — she cannot bank 30 minutes against next month');
});

test('missing a makeup adds no second helping of debt', async () => {
  const w = await loadApp();
  // She missed a 30-minute session, booked a makeup for it, then missed the makeup.
  // One skipped obligation. If the makeup counted, she would owe 60 for one miss —
  // and the number would drift upward every time a makeup slipped.
  const b = w.SLP.derive.makeupBalance([attMiss(30), attMiss(30, true)]);
  eq(b, { debt: 30, credit: 0, owed: 30 }, 'the original debt simply stays outstanding');
});

test('nothing but her own misses creates debt', async () => {
  const w = await loadApp();
  const b = w.SLP.derive.makeupBalance([
    { status: 'absent', isMakeup: false, minutes: 30 },
    { status: 'cancelled', isMakeup: false, minutes: 30 },
    attHeld(30),
  ]);
  eq(b, { debt: 0, credit: 0, owed: 0 },
     'a child who stayed home and a district snow day are not her paperwork');
});

test('debt is measured in minutes, not sessions', async () => {
  const w = await loadApp();
  eq(w.SLP.derive.makeupBalance([attMiss(45), attMiss(20)]).owed, 65,
     'two misses of different lengths owe what they were worth');
});
