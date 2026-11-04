// Coding challenge, tutorial and AI tutor seed additions (additive only).
//  - tutorThreads[]: per learner + lesson tutor thread (id `tt-<userId>-<lessonId>`) for the Tutor history page.
//  - A Python challenge in the Python course: the real app has no Python sandbox, so the lesson shows
//    "Sandbox chưa sẵn sàng" and keeps drafts instead of simulating a grade.
//  - codeAttempts rows get the fields the real grading rules use: lastScore (latest submit decides) and
//    solutionFailSubmits (failed submits whose run finished, for the solution gate).
patchSeed((db) => {
  // ---------- codeAttempts: real grading fields on existing rows ----------
  (db.codeAttempts || []).forEach((a) => {
    if (a.lastScore === undefined) a.lastScore = a.submits ? (a.passed ? 100 : a.bestScore || 0) : null;
    if (a.solutionFailSubmits === undefined) a.solutionFailSubmits = a.failSubmits || 0;
  });

  // ---------- Python challenge (sandbox unavailable state) ----------
  const py = (db.courses || []).find((c) => c.id === 'course-python-001');
  const pyChapter = py && py.chapters.find((ch) => ch.title === 'Python cơ bản');
  if (pyChapter && !pyChapter.lessons.some((l) => l.id === 'lesson-py-p01')) {
    pyChapter.lessons.push({
      id: 'lesson-py-p01', title: 'Thử thách: Điểm trung bình', type: 'code', durationMin: 20, conceptIds: [],
      reading: null, quiz: null, assignment: null,
      code: {
        kind: 'challenge', language: 'python', fileName: 'main.py',
        instructions: [
          'Viết hàm `diem_trung_binh(diem)` trả về điểm trung bình của danh sách `diem`, làm tròn 1 chữ số thập phân.',
          'Danh sách rỗng thì trả về `0`.',
        ],
        starter: [
          'def diem_trung_binh(diem):',
          '    # Viết code của bạn ở đây',
          '    pass',
          '',
          'print(diem_trung_binh([8, 6, 10]))',
        ].join('\n'),
        solution: [
          'def diem_trung_binh(diem):',
          '    if not diem:',
          '        return 0',
          '    return round(sum(diem) / len(diem), 1)',
        ].join('\n'),
        tests: [
          { id: 'pt-1', step: 0, name: 'diem_trung_binh([8, 6, 10]) trả về 8.0', call: 'diem_trung_binh([8, 6, 10])', expected: 8 },
          { id: 'pt-2', step: 0, name: 'diem_trung_binh([7, 8]) trả về 7.5', call: 'diem_trung_binh([7, 8])', expected: 7.5 },
          { id: 'pt-3', step: 1, name: 'Danh sách rỗng', call: 'diem_trung_binh([])', expected: 0, hidden: true },
        ],
        hints: [
          'Hàm `sum()` cộng cả danh sách, `len()` cho số phần tử.',
          'Kiểm tra danh sách rỗng trước khi chia, nếu không sẽ gặp lỗi chia cho 0.',
        ],
        solutionCheck: null,
      },
    });
    py.durationMin = (py.durationMin || 0) + 20;
  }

  // ---------- tutor threads of the main learner (JavaScript course) ----------
  const L = 'usr-learner-001';
  const thread = (lessonId, messages) => ({ id: `tt-${L}-${lessonId}`, userId: L, courseId: 'course-js-001', lessonId, messages, updatedAt: messages[messages.length - 1].at });
  const m = (id, role, text, at, extra) => Object.assign({ id, role, text, at }, role === 'ai' ? { lines: [], diff: null, vote: null, reason: null } : {}, extra || {});
  const seeded = [
    thread('lesson-js-p02', [
      m('tm-seed-001', 'user', 'Vì sao code của mình chưa chạy đúng?', '2026-10-28T13:05:00Z'),
      m('tm-seed-002', 'ai', 'Ở test **tongTien với 2 đơn**, kết quả mong đợi là `350` nhưng code đang trả về `undefined`.\n\nThử tự trả lời mấy câu này trước:\n- Hàm `tongTien` đã có lệnh `return` chưa?\n- Với 2 đơn giá 100 và 250, bạn tự cộng tay ra bao nhiêu?\n- Mảng rỗng thì hàm nên trả về gì?\n\nMình không viết sẵn lời giải. Cần thêm trợ giúp thì bấm **Gợi ý tiếp theo**.', '2026-10-28T13:05:04Z', { vote: 'up' }),
      m('tm-seed-003', 'user', 'Hàm reduce có cần giá trị khởi đầu không?', '2026-10-28T13:09:00Z'),
      m('tm-seed-004', 'ai', 'Câu hỏi hay. Thử nghĩ: nếu mảng rỗng và không có giá trị khởi đầu, `reduce` sẽ cộng từ đâu?\n\nChạy thử `[].reduce((t, x) => t + x)` trong Console rồi đọc thông báo lỗi — đó chính là trường hợp test “mảng rỗng” đang kiểm tra.', '2026-10-28T13:09:05Z'),
    ]),
    thread('lesson-js-002', [
      m('tm-seed-005', 'user', 'Tóm tắt ý chính của bài', '2026-10-20T02:30:00Z'),
      m('tm-seed-006', 'ai', 'Bài **Hàm và phạm vi** thuộc chương “Làm quen JavaScript”, tập trung vào Hàm.\n\nĐể chắc là bạn đã nắm bài, thử:\n- Nói lại bằng lời của bạn điều bài muốn bạn làm được\n- Làm lại ví dụ trong bài mà không nhìn tài liệu\n- Ghi ra một chỗ bạn còn chưa chắc rồi hỏi mình cụ thể chỗ đó', '2026-10-20T02:30:06Z'),
    ]),
  ];
  db.tutorThreads = db.tutorThreads || [];
  seeded.forEach((t) => { if (!db.tutorThreads.some((x) => x.id === t.id)) db.tutorThreads.push(t); });
});
