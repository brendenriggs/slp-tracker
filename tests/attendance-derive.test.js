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
