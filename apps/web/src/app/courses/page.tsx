"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  CheckCircle2,
  Clock,
  Compass,
  GraduationCap,
  Layers,
  Search,
  Sparkles,
  X,
  ArrowRight,
  ExternalLink,
} from "lucide-react";
import { Button } from "@codi-1/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@codi-1/ui/components/card";
import { Input } from "@codi-1/ui/components/input";
import { SEED_COURSES, type Course } from "@/lib/data/courses";
import { authClient } from "@/lib/auth-client";

const CATEGORIES = [
  "Tất cả",
  "Frontend",
  "Backend",
  "Data & AI",
  "Mobile",
  "Computer Science",
] as const;

const LEVELS = ["Tất cả cấp độ", "Beginner", "Intermediate", "Advanced"] as const;

export default function CoursesPage() {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("Tất cả");
  const [selectedLevel, setSelectedLevel] = useState<string>("Tất cả cấp độ");
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);

  // Filter courses based on search term, category and level
  const filteredCourses = useMemo(() => {
    return SEED_COURSES.filter((course) => {
      const matchesSearch =
        searchTerm.trim() === "" ||
        course.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        course.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        course.topics.some((t) => t.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesCategory =
        selectedCategory === "Tất cả" || course.category === selectedCategory;

      const matchesLevel =
        selectedLevel === "Tất cả cấp độ" || course.level === selectedLevel;

      return matchesSearch && matchesCategory && matchesLevel;
    });
  }, [searchTerm, selectedCategory, selectedLevel]);

  const handleEnrollClick = (course: Course) => {
    if (session?.user) {
      router.push("/dashboard");
    } else {
      router.push("/login");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Header Section */}
      <section className="border-b border-border/40 bg-gradient-to-b from-primary/5 via-background to-background py-12 sm:py-16">
        <div className="container mx-auto max-w-7xl px-4 sm:px-6">
          <div className="max-w-3xl space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              <span>Chương trình đào tạo thực chiến Codi</span>
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight sm:text-5xl text-foreground">
              Khám phá các khóa học <br className="hidden sm:inline" />
              <span className="text-primary">lập trình &amp; công nghệ</span>
            </h1>
            <p className="text-base sm:text-lg text-muted-foreground leading-relaxed">
              Trải nghiệm học tập gắn liền với dự án thực tế, hệ sinh thái bài tập tương tác
              và trợ lý AI hỗ trợ giải đáp thắc mắc 24/7.
            </p>
          </div>

          {/* Search Bar & Instant Filters */}
          <div className="mt-8 grid gap-4 md:grid-cols-12 items-center">
            {/* Search Input */}
            <div className="relative md:col-span-6">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Tìm khóa học theo tên, công nghệ (React, Node, AI...)"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-9 h-11 rounded-xl bg-card border-border shadow-sm text-sm"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Level Selector */}
            <div className="md:col-span-3">
              <select
                value={selectedLevel}
                onChange={(e) => setSelectedLevel(e.target.value)}
                className="w-full h-11 px-3 rounded-xl bg-card border border-border text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer"
              >
                {LEVELS.map((lvl) => (
                  <option key={lvl} value={lvl}>
                    {lvl === "Tất cả cấp độ" ? "Tất cả cấp độ" : `Cấp độ: ${lvl}`}
                  </option>
                ))}
              </select>
            </div>

            {/* Quick AI Advisor CTA */}
            <div className="md:col-span-3 flex justify-end">
              <Button
                variant="outline"
                onClick={() => router.push("/ai")}
                className="w-full h-11 gap-2 border-primary/30 hover:bg-primary/10 text-primary cursor-pointer"
              >
                <Sparkles className="h-4 w-4" />
                Nhờ AI gợi ý lộ trình
              </Button>
            </div>
          </div>

          {/* Category Filter Pills */}
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-muted-foreground mr-1">Chủ đề:</span>
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-all duration-150 cursor-pointer ${
                  selectedCategory === cat
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Main Course Listing Section */}
      <section className="container mx-auto max-w-7xl px-4 sm:px-6 py-10">
        {/* Results Counter */}
        <div className="flex items-center justify-between pb-6">
          <p className="text-sm text-muted-foreground">
            Hiển thị <strong className="text-foreground">{filteredCourses.length}</strong> khóa học phù hợp
          </p>
          {(searchTerm || selectedCategory !== "Tất cả" || selectedLevel !== "Tất cả cấp độ") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchTerm("");
                setSelectedCategory("Tất cả");
                setSelectedLevel("Tất cả cấp độ");
              }}
              className="text-xs text-primary hover:text-primary cursor-pointer gap-1"
            >
              <X className="h-3.5 w-3.5" />
              Đặt lại bộ lọc
            </Button>
          )}
        </div>

        {/* Empty State */}
        {filteredCourses.length === 0 ? (
          <Card className="border border-dashed border-border py-16 text-center">
            <CardContent className="space-y-4 max-w-md mx-auto">
              <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
                <Search className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold">Không tìm thấy khóa học phù hợp</h3>
                <p className="text-sm text-muted-foreground">
                  Thử tìm kiếm với từ khóa khác hoặc xóa bộ lọc để xem toàn bộ danh mục đào tạo.
                </p>
              </div>
              <div className="flex justify-center gap-3 pt-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearchTerm("");
                    setSelectedCategory("Tất cả");
                    setSelectedLevel("Tất cả cấp độ");
                  }}
                  className="cursor-pointer"
                >
                  Xem tất cả khóa học
                </Button>
                <Button
                  variant="default"
                  onClick={() => router.push("/ai")}
                  className="gap-1.5 cursor-pointer"
                >
                  <Sparkles className="h-4 w-4" />
                  Hỏi AI tư vấn
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          /* Course Cards Grid */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredCourses.map((course) => (
              <Card
                key={course.id}
                className="group flex flex-col justify-between border-border hover:border-primary/40 transition-all duration-200 hover:shadow-md bg-card overflow-hidden"
              >
                <div>
                  <CardHeader className="pb-3 space-y-2.5">
                    {/* Badges: Category & Level */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="rounded-md bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                        {course.category}
                      </span>
                      <span className="rounded-md bg-secondary text-secondary-foreground px-2 py-0.5 text-xs font-medium">
                        {course.level}
                      </span>
                    </div>

                    <CardTitle className="text-lg font-bold tracking-tight group-hover:text-primary transition-colors line-clamp-2">
                      {course.title}
                    </CardTitle>

                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" />
                      <span>{course.duration}</span>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground line-clamp-3 leading-relaxed">
                      {course.description}
                    </p>

                    {/* Key Topics preview */}
                    <div className="space-y-1.5">
                      <span className="text-xs font-semibold text-foreground/80">Chủ đề trọng tâm:</span>
                      <div className="flex flex-wrap gap-1.5">
                        {course.topics.slice(0, 3).map((topic, i) => (
                          <span
                            key={i}
                            className="rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground font-medium"
                          >
                            {topic}
                          </span>
                        ))}
                        {course.topics.length > 3 && (
                          <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                            +{course.topics.length - 3}
                          </span>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </div>

                {/* Card Footer Actions */}
                <div className="p-6 pt-0 border-t border-border/40 mt-4 flex items-center justify-between gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedCourse(course)}
                    className="text-xs text-muted-foreground hover:text-foreground cursor-pointer px-2"
                  >
                    Xem chi tiết
                  </Button>

                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => handleEnrollClick(course)}
                    className="gap-1.5 text-xs cursor-pointer"
                  >
                    <span>{session?.user ? "Vào học ngay" : "Đăng ký học"}</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* AI Learning Advisor Banner */}
        <div className="mt-16 rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary uppercase tracking-wider">
              <Sparkles className="h-3.5 w-3.5" />
              Lộ trình cá nhân hóa
            </div>
            <h3 className="text-xl sm:text-2xl font-bold tracking-tight">
              Bạn chưa rõ nên bắt đầu từ khóa học nào?
            </h3>
            <p className="text-sm text-muted-foreground max-w-xl">
              Cung cấp cho Trợ lý AI Codi mục tiêu nghề nghiệp, thời gian học mỗi ngày và nền tảng hiện tại của bạn để nhận lộ trình chi tiết từng tuần.
            </p>
          </div>
          <Button
            size="lg"
            onClick={() => router.push("/ai")}
            className="gap-2 shrink-0 cursor-pointer shadow-sm"
          >
            <Sparkles className="h-4 w-4" />
            Tư vấn lộ trình với AI
          </Button>
        </div>
      </section>

      {/* Course Detail Modal Dialog */}
      {selectedCourse && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div
            className="relative w-full max-w-2xl rounded-2xl bg-card border border-border p-6 shadow-xl max-h-[90vh] overflow-y-auto space-y-5"
            role="dialog"
            aria-modal="true"
          >
            {/* Close Button */}
            <button
              type="button"
              onClick={() => setSelectedCourse(null)}
              className="absolute right-4 top-4 rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>

            {/* Header */}
            <div className="space-y-2 pr-8">
              <div className="flex flex-wrap gap-2">
                <span className="rounded-md bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                  {selectedCourse.category}
                </span>
                <span className="rounded-md bg-secondary text-secondary-foreground px-2 py-0.5 text-xs font-medium">
                  {selectedCourse.level}
                </span>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  {selectedCourse.duration}
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                {selectedCourse.title}
              </h2>
            </div>

            <p className="text-sm text-muted-foreground leading-relaxed">
              {selectedCourse.description}
            </p>

            {/* Information Grid */}
            <div className="grid sm:grid-cols-2 gap-4 rounded-xl bg-muted/40 p-4 border border-border/60 text-xs">
              <div className="space-y-1">
                <span className="font-semibold text-foreground">Đối tượng phù hợp:</span>
                <p className="text-muted-foreground">{selectedCourse.targetAudience}</p>
              </div>
              <div className="space-y-1">
                <span className="font-semibold text-foreground">Yêu cầu đầu vào:</span>
                <p className="text-muted-foreground">{selectedCourse.prerequisites}</p>
              </div>
            </div>

            {/* Curriculum Topics */}
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <Layers className="h-4 w-4 text-primary" />
                Nội dung các học phần:
              </h4>
              <ul className="grid sm:grid-cols-2 gap-2 text-xs">
                {selectedCourse.topics.map((topic, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-2 rounded-lg border border-border/60 p-2.5 bg-background"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span className="text-foreground/90">{topic}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-3 pt-3 border-t border-border">
              <Button
                onClick={() => {
                  setSelectedCourse(null);
                  handleEnrollClick(selectedCourse);
                }}
                className="flex-1 cursor-pointer gap-2"
              >
                <span>{session?.user ? "Tham gia lớp học ngay" : "Đăng ký học khóa này"}</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setSelectedCourse(null);
                  router.push(`/ai?topic=${encodeURIComponent(selectedCourse.title)}`);
                }}
                className="gap-2 cursor-pointer text-primary border-primary/30"
              >
                <Sparkles className="h-4 w-4" />
                Hỏi AI về khóa học
              </Button>
              <Button
                variant="ghost"
                onClick={() => setSelectedCourse(null)}
                className="cursor-pointer"
              >
                Đóng
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
