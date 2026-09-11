// "I missed this session" on Today. Every top-level name is prefixed `miss` —
// tests/index.html loads each *.test.js into ONE global scope.
//
// The capability is old: the attendance grid's cell popover has offered
// "Whole session: I missed it" all along, and a missed session already accrues
// makeup debt and already stays out of the child's percentage. What was missing
// was the doorway. Carol Ann, 2026-09-11, reported no easy way to say a miss was
// hers rather than the child's — question 3 in docs/OPEN-QUESTIONS.md asked where
// she went looking, and the answer is Today, at the moment it happens.
//
// So these tests pin the affordance and its undo, not a new kind of record.

const MISS_MONDAY = '2026-09-07';

async function missSeed(w) {
  const m = w.SLP.model, st = w.SLP.store;
  const ada = m.student({ name: 'Ada' });
  const bo = m.student({ name: 'Bo' });
  await st.saveStudent(ada); await st.saveStudent(bo);
  const slot = m.slot({ dayOfWeek: 1, startTime: '09:00', endTime: '09:30',
                        studentIds: [ada.id, bo.id], location: 'Room 4' });
  await st.saveSlot(slot);
  return { ada, bo, slot };
}

async function missOpenDay(w, date = MISS_MONDAY) {
  await w.SLP.ui.go({ tab: 'today', date });
  return w.document;
}

function missButton(w) {
  return w.document.querySelector('.slot-head .slot-missed');
}

async function missPress(w) {
  missButton(w).click();
  await w.SLP.ui.today.flush();
  await w.SLP.ui.render();
}

// The stored status for one student on the day's only session, or undefined.
async function missStatus(w, slot, studentId) {
  const data = await w.SLP.store.attendanceRange({ from: MISS_MONDAY, to: MISS_MONDAY });
  const session = data.sessions.find(s => s.date === MISS_MONDAY && s.slotId === slot.id);
  if (!session) return undefined;
  const row = data.attendance.find(a => a.sessionId === session.id && a.studentId === studentId);
  return row ? row.status : undefined;
}

async function missOwed(w, studentId) {
  const data = await w.SLP.store.attendanceRange({ from: '2026-09-01', to: '2026-09-30' });
  const grid = w.SLP.derive.attendanceGrid(data);
  const row = grid.rows.find(r => r.student.id === studentId);
  return row ? row.owed.owed : null;
}

test('Today carries a control for a session she missed, on the session it belongs to', async () => {
  const w = await loadApp();
  await missSeed(w);
  await missOpenDay(w);
  const button = missButton(w);
  assert(button, 'she went looking on Today, not in the attendance grid afterwards');
  assert(/missed/i.test(button.textContent),
     'named for the fault being hers — got ' + button.textContent);
  assert(button.closest('.slot-section'),
     'it acts on one session, so it sits in that session — not at page level');
});

test('pressing it marks every student on the roster as one she missed', async () => {
  const w = await loadApp();
  const { ada, bo, slot } = await missSeed(w);
  await missOpenDay(w);
  await missPress(w);
  eq(await missStatus(w, slot, ada.id), 'missed', 'Ada was swept');
  eq(await missStatus(w, slot, bo.id), 'missed', 'Bo was swept');
});

test('a student she already marked absent keeps that mark when she sweeps the session', async () => {
  const w = await loadApp();
  const { ada, bo, slot } = await missSeed(w);
  await w.SLP.store.setAttendance({ dateStr: MISS_MONDAY, slot, studentId: bo.id,
                                    status: 'absent' });
  await missOpenDay(w);
  await missPress(w);
  eq(await missStatus(w, slot, ada.id), 'missed', 'Ada was swept');
  eq(await missStatus(w, slot, bo.id), 'absent',
     'Bo did not come — sweeping her own slip over it would invent minutes she does not owe');
});

test('a session she missed adds its minutes to what she owes that child', async () => {
  const w = await loadApp();
  const { ada } = await missSeed(w);
  eq(await missOwed(w, ada.id), 0, 'nothing owed before she presses it');
  await missOpenDay(w);
  await missPress(w);
  eq(await missOwed(w, ada.id), 30, 'the 09:00–09:30 slot is 30 minutes of makeup debt');
});

test('the control reads as pressed once the session is marked missed', async () => {
  const w = await loadApp();
  await missSeed(w);
  await missOpenDay(w);
  eq(missButton(w).getAttribute('aria-pressed'), 'false', 'nothing marked yet');
  await missPress(w);
  eq(missButton(w).getAttribute('aria-pressed'), 'true', 'she can see the mark took');
});

test('pressing it again withdraws the sweep and leaves a mark she made by hand', async () => {
  const w = await loadApp();
  const { ada, bo, slot } = await missSeed(w);
  await w.SLP.store.setAttendance({ dateStr: MISS_MONDAY, slot, studentId: bo.id,
                                    status: 'absent' });
  await missOpenDay(w);
  await missPress(w);
  await missPress(w);
  eq(await missStatus(w, slot, ada.id), null, 'Ada is back to unmarked, not stuck');
  eq(await missStatus(w, slot, bo.id), 'absent', 'undoing her own slip does not touch Bo');
  eq(await missOwed(w, ada.id), 0, 'and the debt it created is gone with it');
});

test('clearSessionAttendance withdraws only the rows carrying the status it is given', async () => {
  const w = await loadApp();
  const { ada, bo, slot } = await missSeed(w);
  await w.SLP.store.setAttendance({ dateStr: MISS_MONDAY, slot, studentId: bo.id,
                                    status: 'absent' });
  await w.SLP.store.setSessionAttendance({ dateStr: MISS_MONDAY, slot, status: 'missed' });
  assert(typeof w.SLP.store.clearSessionAttendance === 'function',
     'clearSessionAttendance exists');
  await w.SLP.store.clearSessionAttendance({ dateStr: MISS_MONDAY, slot, status: 'missed' });
  eq(await missStatus(w, slot, ada.id), null, 'the swept row is withdrawn');
  eq(await missStatus(w, slot, bo.id), 'absent', 'a row holding another status is untouched');
});

test('clearSessionAttendance rejects a status the app does not have', async () => {
  const w = await loadApp();
  const { slot } = await missSeed(w);
  assert(typeof w.SLP.store.clearSessionAttendance === 'function',
     'clearSessionAttendance exists');
  const e = await throws(() => w.SLP.store.clearSessionAttendance({
    dateStr: MISS_MONDAY, slot, status: 'skipped' }));
  assert(/skipped/.test(e.message),
     'the message names what it rejected — got ' + e.message);
});
