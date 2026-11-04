// AI grading-assist jobs (additive only). The lecturer-ai grading card creates db.aiGradingJobs lazily when an
// older database lacks it; this patch adds the collection plus two finished jobs for existing submissions:
// a ready suggestion on a pending submission (sub-001) and one that was used before grading (sub-004).
// Results were produced by gradingResult() in src/features/lecturer-ai/grading-draft-logic.js for these submissions.
// Job shape: see src/features/lecturer-ai/grading-jobs.js.
const SEED_AI_GRADING_JOBS = [
  {
    "id": "aigj-seed-001",
    "submissionId": "sub-001",
    "lecturerId": "usr-lecturer-001",
    "status": "succeeded",
    "stage": "feedback",
    "progress": 100,
    "createdAt": "2026-10-11T02:00:00.000Z",
    "startedAt": "2026-10-11T02:00:00.600Z",
    "finishedAt": "2026-10-11T02:00:04.800Z",
    "error": null,
    "result": {
      "total": 8,
      "max": 10,
      "assessed": 4,
      "criteria": 4,
      "scores": {
        "r1": {
          "score": 3.5,
          "max": 4,
          "rationale": "Bài nộp thể hiện tốt tiêu chí này: mọi yêu cầu trong đề chạy đúng, kể cả trường hợp biên.",
          "evidence": "Ghi chú: “Em chặn giá trị âm bằng Math.max.”"
        },
        "r2": {
          "score": 1.5,
          "max": 2,
          "rationale": "Đáp ứng phần lớn, nhưng chưa thấy rõ: có trạng thái đang tải, thông báo lỗi rõ ràng.",
          "evidence": "Liên kết: https://codesandbox.io/s/counter-haidang"
        },
        "r3": {
          "score": 1.5,
          "max": 2,
          "rationale": "Đáp ứng phần lớn, nhưng chưa thấy rõ: tách hàm/component hợp lý, tên biến dễ hiểu.",
          "evidence": "Ghi chú: “Em chặn giá trị âm bằng Math.max.”"
        },
        "r4": {
          "score": 1.5,
          "max": 2,
          "rationale": "Đáp ứng phần lớn, nhưng chưa thấy rõ: README hoặc ghi chú giải thích cách làm và cách chạy.",
          "evidence": "Liên kết: https://codesandbox.io/s/counter-haidang"
        }
      },
      "feedback": "Bài làm đáp ứng phần lớn yêu cầu, ghi chú của bạn giúp mình hiểu cách làm. Điểm cần cải thiện nhất: xử lý trạng thái & lỗi — có trạng thái đang tải, thông báo lỗi rõ ràng. Gợi ý: kiểm tra lại các trường hợp biên trước khi nộp lần sau.",
      "confidence": 0.85,
      "flags": []
    },
    "appliedAt": null,
    "appliedBy": null,
    "dismissedAt": null
  },
  {
    "id": "aigj-seed-002",
    "submissionId": "sub-004",
    "lecturerId": "usr-lecturer-001",
    "status": "succeeded",
    "stage": "feedback",
    "progress": 100,
    "createdAt": "2026-10-07T07:40:00.000Z",
    "startedAt": "2026-10-07T07:40:00.600Z",
    "finishedAt": "2026-10-07T07:40:04.800Z",
    "error": null,
    "result": {
      "total": 5.5,
      "max": 8,
      "assessed": 3,
      "criteria": 4,
      "scores": {
        "r1": {
          "score": 3,
          "max": 4,
          "rationale": "Đáp ứng phần lớn, nhưng chưa thấy rõ: mọi yêu cầu trong đề chạy đúng, kể cả trường hợp biên.",
          "evidence": "Liên kết: https://github.com/thaolinh/todo-app"
        },
        "r2": {
          "score": 1,
          "max": 2,
          "rationale": "Còn thiếu bằng chứng cho: có trạng thái đang tải, thông báo lỗi rõ ràng.",
          "evidence": "Liên kết: https://github.com/thaolinh/todo-app"
        },
        "r3": {
          "score": 1.5,
          "max": 2,
          "rationale": "Đáp ứng phần lớn, nhưng chưa thấy rõ: tách hàm/component hợp lý, tên biến dễ hiểu.",
          "evidence": "Liên kết: https://github.com/thaolinh/todo-app"
        },
        "r4": {
          "score": null,
          "max": 2,
          "rationale": "Chỉ có liên kết, không có ghi chú hay tệp mô tả cách làm nên chưa đánh giá được.",
          "evidence": null
        }
      },
      "feedback": "Bài làm đáp ứng phần lớn yêu cầu. Điểm cần cải thiện nhất: xử lý trạng thái & lỗi — có trạng thái đang tải, thông báo lỗi rõ ràng. Gợi ý: kiểm tra lại các trường hợp biên trước khi nộp lần sau.",
      "confidence": 0.57,
      "flags": [
        {
          "code": "short",
          "label": "Bài nộp quá ngắn"
        }
      ]
    },
    "appliedAt": "2026-10-07T07:42:00.000Z",
    "appliedBy": "usr-lecturer-001",
    "dismissedAt": null
  }
];

patchSeed((db) => {
  if (!Array.isArray(db.aiGradingJobs)) db.aiGradingJobs = [];
  const subs = new Set((db.submissions || []).map((s) => s.id));
  SEED_AI_GRADING_JOBS.forEach((j) => {
    if (!subs.has(j.submissionId) || db.aiGradingJobs.some((x) => x.id === j.id)) return;
    db.aiGradingJobs.push(JSON.parse(JSON.stringify(j)));
  });
});
