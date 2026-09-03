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

const ATT_TODAY = '2026-10-31';
const attRow = (date, status, minutes, isMakeup = false) => ({ date, status, minutes, isMakeup });
const attPct = (w, rows) => w.SLP.derive.attendancePct(rows, { today: ATT_TODAY });

test('a session she missed stays out of the denominator', async () => {
  const w = await loadApp();
  const p = attPct(w, [attRow('2026-10-05', 'present', 30),
                       attRow('2026-10-12', 'missed', 30)]);
  eq(p.pct, 100, 'her own paperwork must not land on a child’s progress note');
  eq(p.offeredSessions, 1, 'only one session was ever offered to the child');
});

test('a district cancellation stays out of the denominator', async () => {
  const w = await loadApp();
  const p = attPct(w, [attRow('2026-10-05', 'present', 30),
                       attRow('2026-10-12', 'cancelled', 30)]);
  eq(p.pct, 100, 'a snow day is not an opportunity the child declined');
});

test('an absence counts against the child, as it should', async () => {
  const w = await loadApp();
  const p = attPct(w, [attRow('2026-10-05', 'present', 30),
                       attRow('2026-10-12', 'absent', 30)]);
  eq(p.pct, 50, 'offered twice, present once');
});

test('a held makeup lands in both lines, so the figure can never exceed 100%', async () => {
  const w = await loadApp();
  // Missed once, made it up. 8 offered of 10 — not 7 of 9.
  const p = attPct(w, [attRow('2026-10-05', 'absent', 30),
                       attRow('2026-10-12', 'missed', 30),
                       attRow('2026-10-14', 'present', 30, true),
                       attRow('2026-10-19', 'present', 30)]);
  eq(p, { pct: 67, heldMinutes: 60, offeredMinutes: 90,
          heldSessions: 2, offeredSessions: 3, uncharted: 0 },
     'the makeup is simply a session that was offered');
  assert(p.pct <= 100, 'and it can never push the number past 100');
});

test('a session that has not happened yet is neither offered nor uncharted', async () => {
  const w = await loadApp();
  const p = attPct(w, [attRow('2026-10-05', 'present', 30),
                       attRow('2026-11-09', null, 30)]);
  eq(p.uncharted, 0,
     'a quarter in progress must not accuse her of being behind on paperwork');
  eq(p.offeredSessions, 1, 'and the future session is not in the denominator either');
});

test('uncharted sessions are excluded from the number and counted beside it', async () => {
  const w = await loadApp();
  const p = attPct(w, [attRow('2026-10-05', 'present', 30),
                       attRow('2026-10-12', null, 30),
                       attRow('2026-10-19', null, 30)]);
  eq(p.pct, 100, 'nothing was entered, so nothing is claimed');
  eq(p.uncharted, 2, 'but a confident 100% out of one session must say so out loud');
});

test('minutes, not session count, decide the percentage', async () => {
  const w = await loadApp();
  // One 30-minute session held, one 60-minute session missed by the child.
  // By session count this is 50%. By minutes it is 33%.
  const p = attPct(w, [attRow('2026-10-05', 'present', 30),
                       attRow('2026-10-12', 'absent', 60)]);
  eq(p.pct, 33, 'the honest figure when a student carries two session lengths');
  eq([p.heldSessions, p.offeredSessions], [1, 2],
     'the counts still travel, because "1 of 2" is what she writes in the note');
});

test('a student with nothing offered reads as a dash, not zero', async () => {
  const w = await loadApp();
  eq(attPct(w, []).pct, null, 'not 0%, which reads as a child who never came');
  eq(attPct(w, [attRow('2026-10-05', 'cancelled', 30)]).pct, null, 'and not NaN');
});
