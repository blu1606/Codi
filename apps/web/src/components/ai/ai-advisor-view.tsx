"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Check,
  Clock,
  Compass,
  CornerDownLeft,
  List,
  Plus,
  RotateCcw,
  Search,
  Send,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@codi-1/ui/components/button";
import { Alert, AlertDescription, AlertTitle } from "@codi-1/ui/components/alert";
import {
  DOWN_VOTE_REASONS,
  INTAKE_QUESTIONS,
  formatVnd,
  type AdvisorCourseCard,
  type AdvisorStructuredResponse,
  type DownVoteReason,
  type IntakeKey,
  type IntakeState,
} from "@/lib/ai-advisor-contract";
import type { CourseOwnershipDetail } from "@/lib/course-ownership";

export type MessageRole =
  | "user"
  | "ai"
  | "intake-question"
  | "thinking"
  | "error"
  | "ratelimit";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  text?: string;
  streaming?: boolean;
  stopped?: boolean;
  question?: string;
  // Intake question properties
  key?: IntakeKey;
  options?: readonly string[];
  canSkip?: boolean;
  // AI structured answer properties
  courses?: AdvisorCourseCard[];
  table?: { headers: string[]; rows: string[][] } | null;
  order?: { id: string; slug: string; title: string; reason: string }[];
  followups?: string[];
  noMatch?: boolean;
  // Feedback properties
  logId?: number | null;
  feedbackToken?: string | null;
  vote?: "up" | "down" | null;
  reason?: DownVoteReason | null;
}

interface AdvisorInitData {
  user: { id: string; name?: string | null } | null;
  currentCourse: {
    id: string;
    slug: string;
    title: string;
    doneLessons: number;
    totalLessons: number;
  } | null;
}

export function AiAdvisorView({
  initialTopic,
  initialPrompt,
  initialAction,
  initialCourseId,
}: {
  initialTopic?: string;
  initialPrompt?: string;
  initialAction?: string;
  initialCourseId?: string;
}) {
  const router = useRouter();
  const [initData, setInitData] = useState<AdvisorInitData | null>(null);
  const [loadingContext, setLoadingContext] = useState(true);
  const [inputText, setInputText] = useState(
    initialTopic ? `Mình muốn tìm hiểu về ${initialTopic}` : ""
  );
  const [busy, setBusy] = useState(false);
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  const [ownershipMap, setOwnershipMap] = useState<Record<string, CourseOwnershipDetail>>({});
  const [actionBusyCourseId, setActionBusyCourseId] = useState<string | null>(null);

  // Guest answers stay in this component; signed-in restoration comes from the server.
  const [intake, setIntake] = useState<IntakeState>({ skipped: [] });

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const pendingActionHandledRef = useRef(false);
  const initialPromptHandledRef = useRef(false);

  const updateIntake = setIntake;

  // Load context on mount
  useEffect(() => {
    let active = true;
    fetch("/api/ai")
      .then((res) => {
        if (!res.ok) throw new Error("Không thể tải ngữ cảnh gợi ý khoá học.");
        return res.json();
      })
      .then((data) => {
        if (!active) return;
        setInitData({
          user: data.user ?? null,
          currentCourse: data.currentCourse ?? null,
        });

        setIntake({
          goal: data.user ? data.savedIntake?.goal ?? null : null,
          level: data.user ? data.savedIntake?.level ?? null : null,
          hoursPerWeek: data.user ? data.savedIntake?.hoursPerWeek ?? null : null,
          skipped: [],
        });

        setLoadingContext(false);
      })
      .catch((err) => {
        console.error("Failed to load /api/ai context", err);
        if (active) setLoadingContext(false);
      });

    return () => {
      active = false;
    };
  }, []);

  // Replay pending guest intent action once authenticated user state is confirmed
  useEffect(() => {
    if (!initData?.user || !initialAction || !initialCourseId || pendingActionHandledRef.current) {
      return;
    }
    pendingActionHandledRef.current = true;

    // Clean up query parameters from browser URL without triggering full page reload
    if (typeof window !== "undefined" && window.history?.replaceState) {
      const url = new URL(window.location.href);
      url.searchParams.delete("action");
      url.searchParams.delete("courseId");
      window.history.replaceState({}, "", url.pathname + (url.search ? url.search : ""));
    }

    if (initialAction === "add-cart") {
      void handleAddToCart(initialCourseId, "khoá học đã chọn", initData.user);
    } else if (initialAction === "enroll-free") {
      void handleEnrollFree(initialCourseId, "khoá học đã chọn", initData.user);
    }
  }, [initData?.user, initialAction, initialCourseId]);

  // Auto-scroll on messages change
  useEffect(() => {
    if (messages.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // Fetch ownership status for rendered course cards
  const fetchOwnership = async (courseIds: string[]) => {
    if (!courseIds.length) return;
    try {
      const res = await fetch("/api/courses/ownership", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courses: courseIds }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.ownerships) {
          setOwnershipMap((prev) => ({ ...prev, ...data.ownerships }));
        }
      }
    } catch (e) {
      console.error("Failed to fetch ownership for advisor courses", e);
    }
  };

  const getMissingIntake = (state: IntakeState) => {
    return INTAKE_QUESTIONS.filter(
      (q) => {
        const val = q.key === "goal" ? state.goal : q.key === "level" ? state.level : state.hoursPerWeek;
        return !val && !(state.skipped || []).includes(q.key);
      }
    );
  };

  const executeAIQuery = async (queryText: string, overrideIntake?: IntakeState) => {
    if (loadingContext || !initData) return;
    setBusy(true);
    const thinkingId = `msg-${Date.now()}`;
    const thinkingMessage: ChatMessage = {
      id: thinkingId,
      role: "thinking",
      streaming: true,
    };

    setMessages((prev) => [...prev, thinkingMessage]);

    abortControllerRef.current = new AbortController();

    const activeIntake = overrideIntake ?? intake;

    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: queryText,
          intake: activeIntake,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (res.status === 429) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === thinkingId
              ? {
                  id: `ratelimit-${Date.now()}`,
                  role: "ratelimit",
                  question: queryText,
                }
              : m
          )
        );
        setBusy(false);
        return;
      }

      if (!res.ok) {
        throw new Error("Codi tạm thời không phản hồi");
      }

      const data: AdvisorStructuredResponse & { logId?: number; feedbackToken?: string | null } = await res.json();

      setMessages((prev) =>
        prev.map((m) =>
          m.id === thinkingId
            ? {
                id: `ai-${Date.now()}`,
                role: "ai",
                text: data.text,
                courses: data.courses,
                table: data.table,
                order: data.order,
                followups: data.followups,
                noMatch: data.noMatch,
                logId: data.logId,
                feedbackToken: data.feedbackToken ?? null,
                vote: null,
                reason: null,
              }
            : m
        )
      );

      // Fetch ownership for returned courses
      const allCourseIds = [
        ...(data.courses || []).map((c) => c.id),
        ...(data.order || []).map((o) => o.id),
      ];
      if (allCourseIds.length) {
        void fetchOwnership(allCourseIds);
      }
    } catch (err: any) {
      if (err.name === "AbortError") {
        // Handled by handleStop
        return;
      }
      setMessages((prev) =>
        prev.map((m) =>
          m.id === thinkingId
            ? {
                id: `err-${Date.now()}`,
                role: "error",
                question: queryText,
              }
            : m
        )
      );
    } finally {
      setBusy(false);
      abortControllerRef.current = null;
    }
  };

  const handleSend = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy || loadingContext || !initData) return;

    // Append user message
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      text: trimmed,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputText("");

    // Check missing intake
    const missing = getMissingIntake(intake);
    if (missing.length > 0) {
      setPendingPrompt(trimmed);
      const intakeQuestionsToAdd: ChatMessage[] = missing.map((q) => ({
        id: `intake-${q.key}-${Date.now()}`,
        role: "intake-question",
        key: q.key,
        text: q.text,
        options: q.options,
        canSkip: true,
      }));
      setMessages((prev) => [...prev, ...intakeQuestionsToAdd]);
      return;
    }

    void executeAIQuery(trimmed);
  };

  // Dispatch from the resolved render, not the mount-time closure's empty intake.
  useEffect(() => {
    if (!initialPrompt || loadingContext || !initData || initialPromptHandledRef.current) return;
    initialPromptHandledRef.current = true;
    handleSend(initialPrompt);
  }, [initialPrompt, loadingContext, initData]);

  const handleIntakeAnswer = (key: IntakeKey, answer: string) => {
    const nextIntake: IntakeState = {
      ...intake,
      ...(key === "goal" ? { goal: answer } : {}),
      ...(key === "level" ? { level: answer } : {}),
      ...(key === "hours" ? { hoursPerWeek: answer } : {}),
      skipped: (intake.skipped || []).filter((k) => k !== key),
    };

    updateIntake(() => nextIntake);

    // Replace the intake-question message with a user response bubble
    setMessages((prev) =>
      prev.map((m) =>
        m.role === "intake-question" && m.key === key
          ? {
              id: `user-intake-${Date.now()}`,
              role: "user",
              text: answer,
            }
          : m
      )
    );

    // Check if remaining questions exist against the updated intake state
    const remainingMissing = INTAKE_QUESTIONS.filter((q) => {
      const val = q.key === "goal" ? nextIntake.goal : q.key === "level" ? nextIntake.level : nextIntake.hoursPerWeek;
      return !val && !(nextIntake.skipped || []).includes(q.key);
    });

    if (remainingMissing.length === 0 && pendingPrompt) {
      const promptToRun = pendingPrompt;
      setPendingPrompt(null);
      void executeAIQuery(promptToRun, nextIntake);
    }
  };

  const handleIntakeSkip = (key: IntakeKey) => {
    const nextIntake: IntakeState = {
      ...intake,
      skipped: Array.from(new Set([...(intake.skipped || []), key])),
    };

    updateIntake(() => nextIntake);

    // Remove the question from messages
    setMessages((prev) => prev.filter((m) => !(m.role === "intake-question" && m.key === key)));

    const remainingMissing = INTAKE_QUESTIONS.filter((q) => {
      const val = q.key === "goal" ? nextIntake.goal : q.key === "level" ? nextIntake.level : nextIntake.hoursPerWeek;
      return !val && !(nextIntake.skipped || []).includes(q.key);
    });

    if (remainingMissing.length === 0 && pendingPrompt) {
      const promptToRun = pendingPrompt;
      setPendingPrompt(null);
      void executeAIQuery(promptToRun, nextIntake);
    }
  };

  const handleClearIntake = (field: "goal" | "level" | "hours") => {
    updateIntake((prev) => {
      const next = { ...prev };
      if (field === "goal") next.goal = null;
      else if (field === "level") next.level = null;
      else if (field === "hours") next.hoursPerWeek = null;
      return next;
    });
  };

  const handleEditIntake = () => {
    updateIntake((prev) => ({ ...prev, skipped: [] }));
    const newIntakeQuestions: ChatMessage[] = INTAKE_QUESTIONS.map((q) => ({
      id: `intake-edit-${q.key}-${Date.now()}`,
      role: "intake-question",
      key: q.key,
      text: q.text,
      options: q.options,
      canSkip: true,
    }));
    setMessages((prev) => [...prev, ...newIntakeQuestions]);
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setMessages((prev) =>
      prev.map((m) =>
        m.role === "thinking"
          ? {
              id: `stopped-${Date.now()}`,
              role: "ai",
              text: "Bạn đã dừng câu trả lời này.",
              stopped: true,
            }
          : m
      )
    );
    setBusy(false);
  };

  const handleNewChat = () => {
    setMessages([]);
    setPendingPrompt(null);
    setBusy(false);
  };

  const handleRetry = (questionText?: string) => {
    if (!questionText || busy) return;
    setMessages((prev) => prev.filter((m) => m.role !== "error" && m.role !== "ratelimit"));
    void executeAIQuery(questionText);
  };

  const handleVote = async (messageIndex: number, voteType: "up" | "down") => {
    const m = messages[messageIndex];
    if (!m) return;

    const newVote = m.vote === voteType ? null : voteType;

    setMessages((prev) =>
      prev.map((msg, idx) =>
        idx === messageIndex ? { ...msg, vote: newVote, reason: null } : msg
      )
    );

    if (newVote === "up") {
      toast("Cảm ơn phản hồi của bạn.");
    }

    try {
      await fetch("/api/ai/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          logId: m.logId,
          feedbackToken: m.feedbackToken,
          vote: newVote,
        }),
      });
    } catch {}
  };

  const handleReason = async (messageIndex: number, reason: DownVoteReason) => {
    const m = messages[messageIndex];
    if (!m) return;

    setMessages((prev) =>
      prev.map((msg, idx) => (idx === messageIndex ? { ...msg, reason } : msg))
    );

    toast("Cảm ơn, góp ý của bạn giúp Codi trả lời tốt hơn.");

    try {
      await fetch("/api/ai/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          logId: m.logId,
          feedbackToken: m.feedbackToken,
          vote: "down",
          reason,
        }),
      });
    } catch {}
  };

  const handleAddToCart = async (
    courseId: string,
    title: string,
    currentUser?: { id: string } | null
  ) => {
    const activeUser = currentUser !== undefined ? currentUser : initData?.user;
    if (!activeUser) {
      router.push(`/login?callbackURL=${encodeURIComponent(`/ai?action=add-cart&courseId=${courseId}`)}`);
      return;
    }

    setActionBusyCourseId(courseId);
    try {
      const res = await fetch("/api/student/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId }),
      });

      if (res.ok) {
        setOwnershipMap((prev) => ({
          ...prev,
          [courseId]: { ownership: "in-cart" },
        }));
        toast.success(`Đã thêm “${title}” vào giỏ hàng.`, {
          action: {
            label: "Xem giỏ hàng",
            onClick: () => router.push("/cart"),
          },
        });
      } else {
        const err = await res.json();
        toast.error(err.error || "Không thể thêm vào giỏ hàng");
      }
    } catch {
      toast.error("Lỗi kết nối khi thêm vào giỏ");
    } finally {
      setActionBusyCourseId(null);
    }
  };

  const handleEnrollFree = async (
    courseId: string,
    title: string,
    currentUser?: { id: string } | null
  ) => {
    const activeUser = currentUser !== undefined ? currentUser : initData?.user;
    if (!activeUser) {
      router.push(`/login?callbackURL=${encodeURIComponent(`/ai?action=enroll-free&courseId=${courseId}`)}`);
      return;
    }

    setActionBusyCourseId(courseId);
    try {
      const res = await fetch("/api/courses/enroll-free", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId }),
      });

      if (res.ok) {
        setOwnershipMap((prev) => ({
          ...prev,
          [courseId]: { ownership: "owned" },
        }));
        toast.success(`Đã đăng ký "${title}"`, {
          action: {
            label: "Học ngay",
            onClick: () => router.push(`/learn/${courseId}`),
          },
        });
      } else {
        const err = await res.json();
        toast.error(err.error || "Không thể đăng ký khoá học miễn phí");
      }
    } catch {
      toast.error("Lỗi kết nối khi đăng ký miễn phí");
    } finally {
      setActionBusyCourseId(null);
    }
  };

  const renderCourseCTA = (c: AdvisorCourseCard) => {
    const own = ownershipMap[c.id]?.ownership ?? (c.price === 0 ? "free" : "not-owned");
    const isActing = actionBusyCourseId === c.id;

    if (own === "owned") {
      return (
        <Link
          href={`/learn/${c.id}`}
          className={buttonVariants({ size: "sm" })}
        >
          Tiếp tục học
        </Link>
      );
    }

    if (own === "in-cart") {
      return (
        <Link
          href="/cart"
          className={buttonVariants({ variant: "secondary", size: "sm" })}
        >
          Đã có trong giỏ · Xem giỏ hàng
        </Link>
      );
    }

    if (own === "pending-payment") {
      const orderCode = ownershipMap[c.id]?.pendingOrderId;
      return (
        <Link
          href={orderCode ? `/checkout?order=${orderCode}` : "/checkout"}
          className={buttonVariants({ variant: "secondary", size: "sm" })}
        >
          Tiếp tục thanh toán
        </Link>
      );
    }

    if (c.price === 0 || own === "free") {
      return (
        <Button
          size="sm"
          disabled={isActing}
          onClick={() => handleEnrollFree(c.id, c.title)}
        >
          {isActing ? "Đang xử lý..." : "Đăng ký miễn phí"}
        </Button>
      );
    }

    return (
      <Button
        size="sm"
        disabled={isActing}
        onClick={() => handleAddToCart(c.id, c.title)}
      >
        {isActing ? "Đang xử lý..." : "Thêm vào giỏ"}
      </Button>
    );
  };

  const user = initData?.user;
  const currentCourse = initData?.currentCourse;

  // Suggestions list matching S17 & ai-advisor.js
  const suggestionList = [
    currentCourse
      ? {
          icon: Compass,
          title: `Học gì sau “${currentCourse.title}”?`,
          desc: "Gợi ý khoá tiếp theo dựa trên khoá bạn đang học",
          prompt: `Sau ${currentCourse.title} nên học gì tiếp?`,
        }
      : {
          icon: BookOpen,
          title: "Mới bắt đầu học lập trình",
          desc: "Nên học ngôn ngữ và khoá nào trước",
          prompt: "Mình mới bắt đầu học lập trình, nên học gì trước?",
        },
    {
      icon: Search,
      title: "Tìm khoá cho mục tiêu",
      desc: "Làm dự án, đổi nghề hay chuẩn bị phỏng vấn",
      prompt: "Dựa vào mục tiêu của tôi, nên học khoá nào?",
    },
    {
      icon: List,
      title: "So sánh các khoá phù hợp",
      desc: "Trình độ, số bài, học phí đặt cạnh nhau",
      prompt: "So sánh các khoá học phù hợp với tôi",
    },
    user
      ? {
          icon: Clock,
          title: "Mình bị chậm tiến độ",
          desc: "Cách lấy lại nhịp học mỗi tuần",
          prompt: "Mình bị chậm tiến độ, nên làm gì?",
        }
      : {
          icon: ArrowRight,
          title: "Lên lộ trình học",
          desc: "Thứ tự các khoá để đi từ cơ bản đến dự án",
          prompt: "Lộ trình học để trở thành fullstack developer theo thứ tự nào?",
        },
  ];

  const intakeItems = [
    { key: "goal" as const, val: intake.goal },
    { key: "level" as const, val: intake.level },
    { key: "hours" as const, val: intake.hoursPerWeek ? `${intake.hoursPerWeek}/tuần` : null },
  ].filter((x) => Boolean(x.val));

  return (
    <div className="min-h-full w-full bg-background px-4 py-6 md:py-10">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        {/* Header */}
        <header className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Gợi ý khoá học từ danh mục</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              Bản thử nghiệm dùng quy tắc đối chiếu danh mục khoá học đã xuất bản; không dùng mô hình AI để phân tích.
            </p>
            {messages.length === 0 ? (
              <p className="text-muted-foreground text-sm mt-1">
                {user && currentCourse
                  ? `Bạn đang học ${currentCourse.title} (${currentCourse.doneLessons}/${currentCourse.totalLessons} bài). Hỏi Codi nên học gì tiếp, hoặc so sánh các khoá trước khi mua.`
                  : "Kể mục tiêu của bạn, Codi gợi ý khoá học phù hợp, so sánh các lựa chọn và thứ tự nên học."}
              </p>
            ) : null}
          </div>
          {messages.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleNewChat}
              disabled={busy}
              className="self-start md:self-auto gap-1.5"
            >
              <Plus className="size-4" /> Cuộc trò chuyện mới
            </Button>
          )}
        </header>

        {!loadingContext && !initData && (
          <Alert variant="destructive">
            <AlertTitle>Không thể tải ngữ cảnh gợi ý khoá học</AlertTitle>
            <AlertDescription>Vui lòng tải lại trang trước khi gửi câu hỏi.</AlertDescription>
          </Alert>
        )}

        {/* Guest prompt line */}
        {!user && messages.length === 0 && (
          <p className="text-sm text-muted-foreground -mt-3">
            Bạn đang dùng với tư cách khách.{" "}
            <Link href="/login?callbackURL=/ai" className="text-primary font-medium underline">
              Đăng nhập
            </Link>{" "}
            để xem tiến độ và ưu tiên khoá học chưa sở hữu.
          </p>
        )}

        {/* "Codi đang hiểu về bạn" intake row */}
        {intakeItems.length > 0 && (
          <div
            className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3 text-sm"
            role="group"
            aria-label="Codi đang hiểu về bạn"
          >
            <span className="font-semibold text-muted-foreground">Codi đang hiểu về bạn:</span>
            {intakeItems.map((item) => (
              <span
                key={item.key}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-3 py-0.5 text-xs font-medium text-foreground"
              >
                {item.val}
                <button
                  type="button"
                  onClick={() => handleClearIntake(item.key)}
                  aria-label={`Bỏ “${item.val}”`}
                  className="rounded-full p-0.5 hover:bg-background text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
            <button
              type="button"
              onClick={handleEditIntake}
              className="text-xs text-primary font-medium hover:underline ml-1"
            >
              Sửa
            </button>
          </div>
        )}

        {/* Empty state: Suggestions cards */}
        {messages.length === 0 && (
          <section aria-labelledby="ai-suggest-title" className="space-y-3">
            <h2 id="ai-suggest-title" className="text-sm font-semibold text-muted-foreground">
              Thử hỏi
            </h2>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {suggestionList.map((s, idx) => {
                const IconComponent = s.icon;
                return (
                  <li key={idx}>
                    <button
                      type="button"
                      onClick={() => handleSend(s.prompt)}
                      disabled={loadingContext || !initData}
                      className="flex h-full w-full items-start gap-3 rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-primary hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <IconComponent className="size-5 shrink-0 text-primary mt-0.5" />
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm font-semibold text-foreground">{s.title}</span>
                        <span className="text-xs text-muted-foreground">{s.desc}</span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="text-xs text-muted-foreground pt-1">
              Gợi ý theo quy tắc có thể chưa phù hợp với bạn. Hãy xem kỹ trang chi tiết khoá học trước khi mua.
            </p>
          </section>
        )}

        {/* Chat Thread */}
        {messages.length > 0 && (
          <div
            className="flex flex-col gap-5"
            role="log"
            aria-live="polite"
            aria-label="Cuộc trò chuyện với Codi"
          >
            {messages.map((m, i) => {
              if (m.role === "user") {
                return (
                  <div key={m.id} className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground">
                      {m.text}
                    </div>
                  </div>
                );
              }

              if (m.role === "thinking") {
                return (
                  <div
                    key={m.id}
                    className="flex items-center gap-2 text-sm text-muted-foreground py-2"
                    aria-busy="true"
                  >
                    <span className="inline-block size-2 animate-ping rounded-full bg-primary" />
                    <span>Đang đối chiếu danh mục…</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleStop}
                      className="ml-auto text-xs"
                    >
                      <X className="mr-1 size-3.5" /> Dừng
                    </Button>
                  </div>
                );
              }

              if (m.role === "error") {
                return (
                  <Alert key={m.id} variant="destructive">
                    <AlertTriangle className="size-4" />
                    <AlertTitle>Codi tạm thời không phản hồi</AlertTitle>
                    <AlertDescription className="flex flex-col gap-3 mt-2">
                      <p>Câu hỏi chưa được trả lời. Bạn có thể thử lại hoặc tự xem danh mục khoá học.</p>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleRetry(m.question)}
                          className="gap-1.5"
                        >
                          <RotateCcw className="size-3.5" /> Thử lại
                        </Button>
                        <Link
                          href="/courses"
                          className={buttonVariants({ size: "sm", variant: "ghost" })}
                        >
                          Xem danh mục
                        </Link>
                      </div>
                    </AlertDescription>
                  </Alert>
                );
              }

              if (m.role === "ratelimit") {
                return (
                  <Alert key={m.id} className="border-warning/50 bg-warning/10 text-warning-foreground">
                    <AlertTriangle className="size-4 text-warning" />
                    <AlertTitle>Bạn đã hỏi quá nhiều trong thời gian ngắn</AlertTitle>
                    <AlertDescription className="flex flex-col gap-3 mt-2">
                      <p>Đợi vài phút rồi thử lại.</p>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleRetry(m.question)}
                        className="self-start gap-1.5"
                      >
                        <RotateCcw className="size-3.5" /> Thử lại
                      </Button>
                    </AlertDescription>
                  </Alert>
                );
              }

              if (m.role === "intake-question" && m.key && m.options) {
                return (
                  <div key={m.id} className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
                    <p className="text-sm font-semibold">{m.text}</p>
                    <div className="flex flex-wrap gap-2 pt-1" role="group" aria-label={m.text}>
                      {m.options.map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => handleIntakeAnswer(m.key!, opt)}
                          className="rounded-full border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:border-primary hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {opt}
                        </button>
                      ))}
                      {m.canSkip && (
                        <button
                          type="button"
                          onClick={() => handleIntakeSkip(m.key!)}
                          className="rounded-full border border-dashed border-border px-4 py-2 text-sm text-muted-foreground hover:bg-muted"
                        >
                          Bỏ qua
                        </button>
                      )}
                    </div>
                  </div>
                );
              }

              // Catalog-rules answer message
              return (
                <div key={m.id} className="flex flex-col gap-4 text-sm leading-relaxed">
                  <p className="text-xs text-muted-foreground">
                    Gợi ý theo quy tắc danh mục · Không phải phân tích từ mô hình AI.
                  </p>
                  {m.text && (
                    <div className="whitespace-pre-line text-foreground">{m.text}</div>
                  )}

                  {/* Comparison Table */}
                  {m.table && (
                    <div className="overflow-x-auto rounded-lg border border-border bg-card">
                      <table className="w-full text-left text-xs">
                        <caption className="sr-only">So sánh khoá học</caption>
                        <thead className="border-b border-border bg-muted/60 text-muted-foreground font-semibold">
                          <tr>
                            {m.table.headers.map((h, k) => (
                              <th key={k} className="p-3">
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {m.table.rows.map((row, rIdx) => (
                            <tr key={rIdx} className="hover:bg-muted/30">
                              {row.map((cell, cIdx) => (
                                <td
                                  key={cIdx}
                                  className={`p-3 ${cIdx === 0 ? "font-semibold text-foreground" : "text-muted-foreground"}`}
                                >
                                  {cell}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Course Cards */}
                  {m.courses && m.courses.length > 0 && (
                    <ul className="divide-y divide-border rounded-xl border border-border bg-card">
                      {m.courses.map((c, k) => (
                        <li
                          key={c.id}
                          className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="flex flex-col gap-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <Link
                                href={`/courses/${c.slug}`}
                                className="font-semibold text-foreground hover:underline text-base"
                              >
                                {c.title}
                              </Link>
                              {c.isBestMatch && (
                                <span className="rounded-full bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 text-[11px] font-semibold">
                                  Phù hợp nhất
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {c.level} · {c.lessonCount} bài ·{" "}
                              <span className="font-medium text-foreground">
                                {formatVnd(c.price)}
                              </span>
                            </div>
                            {c.reason && (
                              <p className="text-xs text-muted-foreground italic mt-0.5">
                                {c.reason}
                              </p>
                            )}
                          </div>
                          <div className="shrink-0 sm:self-center">
                            {renderCourseCTA(c)}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}

                  {/* Suggested Roadmap Order */}
                  {m.order && m.order.length > 0 && (
                    <ol className="list-decimal list-inside space-y-2 rounded-lg border border-border bg-card p-4">
                      {m.order.map((item) => (
                        <li key={item.id} className="text-sm">
                          <Link
                            href={`/courses/${item.slug}`}
                            className="font-semibold text-primary hover:underline ml-1"
                          >
                            {item.title}
                          </Link>
                          <span className="text-xs text-muted-foreground ml-2">
                            — {item.reason}
                          </span>
                        </li>
                      ))}
                    </ol>
                  )}

                  {/* Feedback row 👍/👎 */}
                  {!m.stopped && (
                    <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-muted-foreground">
                      <button
                        type="button"
                        onClick={() => handleVote(i, "up")}
                        aria-pressed={m.vote === "up"}
                        aria-label="Câu trả lời hữu ích"
                        className={`rounded p-1.5 transition-colors hover:bg-muted ${
                          m.vote === "up" ? "bg-accent text-primary font-bold" : "text-muted-foreground"
                        }`}
                      >
                        <ThumbsUp className="size-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleVote(i, "down")}
                        aria-pressed={m.vote === "down"}
                        aria-label="Câu trả lời chưa tốt"
                        className={`rounded p-1.5 transition-colors hover:bg-muted ${
                          m.vote === "down" ? "bg-destructive/10 text-destructive font-bold" : "text-muted-foreground"
                        }`}
                      >
                        <ThumbsDown className="size-4" />
                      </button>

                      {m.vote === "down" && !m.reason && (
                        <div className="flex flex-wrap items-center gap-1.5 ml-2">
                          <span className="text-[11px]">Chưa tốt ở điểm nào?</span>
                          {DOWN_VOTE_REASONS.map((r) => (
                            <button
                              key={r}
                              type="button"
                              onClick={() => handleReason(i, r)}
                              className="rounded-full border border-border bg-background px-2.5 py-0.5 text-[11px] hover:border-primary hover:bg-accent"
                            >
                              {r}
                            </button>
                          ))}
                        </div>
                      )}

                      {m.reason && (
                        <span className="text-[11px] italic ml-1">Đã ghi nhận: {m.reason}</span>
                      )}
                    </div>
                  )}

                  {/* Follow-up chips */}
                  {m.followups && m.followups.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-2" role="group" aria-label="Hỏi tiếp">
                      {m.followups.map((fPrompt, fIdx) => (
                        <button
                          key={fIdx}
                          type="button"
                          onClick={() => handleSend(fPrompt)}
                          className="rounded-full border border-border bg-muted/50 px-3.5 py-1.5 text-xs font-medium text-foreground hover:border-primary hover:bg-accent transition-colors"
                        >
                          {fPrompt}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}

        {/* Sticky Composer */}
        <div className="sticky bottom-4 z-10 w-full pt-4">
          <form
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              handleSend(inputText);
            }}
            className="flex items-center gap-2 rounded-xl border border-border bg-card p-2 shadow-lg focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20"
          >
            <label className="sr-only" htmlFor="advisor-q">
              Câu hỏi cho Codi
            </label>
            <input
              id="advisor-q"
              type="text"
              name="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={
                messages.length === 0
                  ? "Ví dụ: Mình muốn làm web, nên học khoá nào trước?"
                  : "Hỏi tiếp…"
              }
              autoComplete="off"
              disabled={busy || loadingContext || !initData}
              className="flex-1 min-w-0 bg-transparent px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
            <Button
              type="submit"
              size="sm"
              disabled={busy || loadingContext || !initData || !inputText.trim()}
              className="gap-1.5"
            >
              <Send className="size-4" />
              <span className="hidden sm:inline">Hỏi Codi</span>
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
