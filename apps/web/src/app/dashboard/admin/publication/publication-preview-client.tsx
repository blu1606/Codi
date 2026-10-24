"use client";

import { useState } from "react";
import LessonMarkdown from "@/components/lesson-markdown";
import { Button } from "@codi-1/ui/components/button";
import type { CourseDataForReview, LessonLike, QuizQuestionLike } from "@/lib/publication-service";

function safeUrl(value?: string | null) {
  try {
    const url = new URL(value || "");
    return ["https:", "http:"].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}

function PreviewQuiz({ questions }: { questions: QuizQuestionLike[] }) {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [checked, setChecked] = useState(false);
  return <section className="space-y-4" aria-label="Quiz xem trước">
    <p className="text-sm text-muted-foreground">Chọn đáp án và kiểm tra tại chỗ. Không lưu bài làm hoặc điểm.</p>
    {questions.map((q, i) => <fieldset key={q.id} className="space-y-2 rounded-lg border border-border p-3">
      <legend className="font-semibold">Câu {i + 1}: {q.text}</legend>
      {q.options.map((option, index) => <label key={index} className="flex gap-2">
        <input type="radio" name={`preview-question-${q.id}`} checked={answers[String(q.id)] === index}
          onChange={() => { setAnswers(previous => ({ ...previous, [q.id]: index })); setChecked(false); }} />
        <span>{option}</span>
      </label>)}
      {checked && <p role="status" className="text-sm">
        {q.correctIndex === undefined || q.correctIndex < 0 ? "Chưa có đáp án đúng được lưu."
          : answers[String(q.id)] === undefined ? "Chưa chọn đáp án."
            : answers[String(q.id)] === q.correctIndex ? "Chính xác." : "Chưa chính xác."}
        {q.explanation ? ` Giải thích: ${q.explanation}` : ""}
      </p>}
    </fieldset>)}
    <Button disabled={questions.length === 0} onClick={() => setChecked(true)}>Kiểm tra đáp án</Button>
  </section>;
}

function PreviewLesson({ lesson }: { lesson: LessonLike }) {
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  return <div className="space-y-5">
    {(lesson.materials || []).map((material, i) => {
      const url = safeUrl(material.url);
      const label = material.title || `Tài liệu ${i + 1}`;
      return <section key={material.id || i} className="space-y-2" aria-label={label}>
        <h3 className="font-semibold">{label}</h3>
        {!url ? <p className="text-sm text-destructive">Đường dẫn tài liệu không hợp lệ.</p> : <>
          {material.type === "video" && !failed[String(i)] &&
            <video src={url} controls playsInline preload="metadata" aria-label={label}
              className="aspect-video w-full rounded-lg bg-muted" onError={() => setFailed(prior => ({ ...prior, [i]: true }))} />}
          {["pdf", "slide"].includes(material.type) &&
            <iframe src={url} title={label} sandbox="allow-same-origin" referrerPolicy="no-referrer"
              className="h-96 w-full rounded-lg border border-border" />}
          {failed[String(i)] && <p role="alert" className="text-sm text-destructive">Không phát được video. Hãy kiểm tra tệp nguồn.</p>}
          <a href={url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary underline">Mở tài liệu: {label}</a>
        </>}
      </section>;
    })}
    {lesson.body && <LessonMarkdown>{lesson.body}</LessonMarkdown>}
    {lesson.quiz && <PreviewQuiz questions={lesson.quiz.questions} />}
    {lesson.code && <section className="space-y-3" aria-label="Bài code xem trước">
      <p className="text-sm font-semibold">Không chạy mã trong preview. Chỉ xem yêu cầu và mã khởi đầu.</p>
      {(lesson.code.instructions || []).map((text, i) => <LessonMarkdown key={i}>{text}</LessonMarkdown>)}
      {lesson.code.starterCode ? <pre className="overflow-auto rounded-lg bg-muted p-3"><code>{lesson.code.starterCode}</code></pre>
        : <p className="text-sm text-muted-foreground">Chưa có mã khởi đầu.</p>}
    </section>}
    {lesson.assignment && <section className="space-y-3">
      <LessonMarkdown>{lesson.assignment.instructions}</LessonMarkdown>
      <ul>{lesson.assignment.rubric?.map((item, i) => <li key={i}>{item.name}: {item.points} điểm{item.desc ? ` — ${item.desc}` : ""}</li>)}</ul>
      <p className="text-sm text-muted-foreground">Chỉ xem nội dung, không nộp bài trong preview.</p>
    </section>}
  </div>;
}

export function PublicationPreviewClient({ course, onClose }: { course: CourseDataForReview; onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const lessons = course.chapters.flatMap(chapter => chapter.lessons);
  const items = [
    ...(course.entryTest ? [{ id: "entry", title: "Bài kiểm tra đầu vào", lesson: null }] : []),
    ...lessons.map(lesson => ({ id: lesson.id, title: lesson.title, lesson })),
  ];
  const selected = items[index];
  return <div role="dialog" aria-modal="true" aria-label="Xem trước nội dung quản trị"
    className="fixed inset-0 z-50 flex flex-col overflow-auto bg-background p-4">
    <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-background pb-3">
      <div>
        <h2 className="font-semibold">Xem trước nội dung quản trị · {course.title}</h2>
        <p className="text-sm text-muted-foreground">Bản xem trước giới hạn: không lưu tiến độ, điểm hoặc bài nộp; không chạy mã.</p>
      </div>
      <Button variant="outline" onClick={onClose}>Thoát xem trước</Button>
    </div>
    <div className="grid flex-1 gap-5 py-4 md:grid-cols-[16rem_1fr]">
      <nav aria-label="Nội dung khoá học" className="space-y-2">
        {items.map((item, i) => <button key={item.id} type="button" aria-current={i === index ? "step" : undefined}
          onClick={() => setIndex(i)} className="block w-full rounded-lg border border-border p-3 text-left text-sm">
          {item.title}
        </button>)}
      </nav>
      <main className="min-w-0 space-y-4">
        <h3 className="text-lg font-semibold">{selected?.title || "Khoá học chưa có nội dung."}</h3>
        {selected?.lesson ? <PreviewLesson key={selected.id} lesson={selected.lesson} />
          : selected && course.entryTest ? <PreviewQuiz key="entry" questions={course.entryTest.questions} /> : null}
      </main>
    </div>
    <div className="sticky bottom-0 flex justify-between border-t border-border bg-background py-3">
      <Button variant="outline" disabled={index === 0 || items.length === 0} onClick={() => setIndex(i => i - 1)}>Bài trước</Button>
      <span className="text-sm text-muted-foreground">{items.length ? index + 1 : 0} / {items.length}</span>
      <Button variant="outline" disabled={index >= items.length - 1} onClick={() => setIndex(i => i + 1)}>Bài tiếp theo</Button>
    </div>
  </div>;
}
