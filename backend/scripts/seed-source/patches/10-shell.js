// Shell / account seed additions (additive only: new fields and new collections, nothing renamed or removed).
//  users[].emailVerified   true for every seeded account except the newest learner, so the real app's
//                          "Tài khoản chưa xác thực email" card has a seeded case (usr-learner-010).
//  users[].image           null = no uploaded avatar yet (initials are shown).
//  userSessions[]          device sessions for Settings > Mật khẩu & Bảo mật > Thiết Bị Đã Đăng Nhập, one per user at
//                          their last activity, plus a phone session for accounts that signed up after August.
//  studentActivities[]     "login" activity at each user's lastActive, feeding the profile heatmap together with
//                          enrolments, learnerStudyDays and submissions (merged at read time in the shell).
patchSeed((db) => {
  const DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
  const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
  const PHONE = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
  const UNVERIFIED = 'usr-learner-010';

  db.users.forEach((u) => {
    if (u.emailVerified === undefined) u.emailVerified = u.id !== UNVERIFIED;
    if (u.image === undefined) u.image = null;
  });

  if (!Array.isArray(db.userSessions)) db.userSessions = [];
  if (!Array.isArray(db.studentActivities)) db.studentActivities = [];
  const hasSession = new Set(db.userSessions.map((s) => s.id));
  const hasActivity = new Set(db.studentActivities.map((a) => a.id));

  db.users.forEach((u, i) => {
    const tail = u.id.replace(/^usr-/, '');
    const desk = { id: 'ses-' + tail + '-1', userId: u.id, userAgent: i % 3 === 2 ? MAC : DESKTOP, createdAt: u.lastActive || u.createdAt };
    if (!hasSession.has(desk.id)) db.userSessions.push(desk);
    if (u.createdAt >= '2026-08-01' && u.status === 'active') {
      const phone = { id: 'ses-' + tail + '-2', userId: u.id, userAgent: PHONE, createdAt: u.createdAt };
      if (!hasSession.has(phone.id)) db.userSessions.push(phone);
    }
    if (u.lastActive) {
      const act = { id: 'act-' + tail + '-login', userId: u.id, type: 'login', occurredAt: u.lastActive };
      if (!hasActivity.has(act.id)) db.studentActivities.push(act);
    }
  });
});
