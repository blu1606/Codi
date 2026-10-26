import type { CourseChapter, CourseDetail } from "@/lib/course-details";
import type { CourseOwnership, CourseOwnershipDetail } from "@/lib/course-ownership";
import snapshot from "../snapshot/course-detail.json";

const chapters: CourseChapter[] = [
  {
    id: "ch-1",
    title: "Chương 1: Nền tảng JSX và component",
    lessons: [
      { id: "l-1", title: "Cài đặt môi trường", description: null, durationSeconds: 420, isFreePreview: true },
      { id: "l-2", title: "JSX và props", description: "Viết component đầu tiên.", durationSeconds: 1260 },
    ],
  },
  {
    id: "ch-2",
    title: "Chương 2: State và hook",
    lessons: [
      { id: "l-3", title: "useState và sự kiện", description: null, durationSeconds: 1500 },
      { id: "l-4", title: "useEffect và đồng bộ dữ liệu", description: null, durationSeconds: 1800 },
    ],
  },
];

type SnapshotDetail = Omit<CourseDetail, "course"> & {
  course: Omit<CourseDetail["course"], "publishedAt" | "updatedAt"> & { publishedAt: string | null; updatedAt: string };
};
const real = snapshot as unknown as SnapshotDetail;

/** The seed course as the public detail API returns it (snapshot), with the Date fields revived. */
const snapshotDetail: CourseDetail = {
  ...real,
  course: {
    ...real.course,
    publishedAt: real.course.publishedAt ? new Date(real.course.publishedAt) : null,
    updatedAt: new Date(real.course.updatedAt),
  },
};

/** Full course detail for the S02/S03 page (learning outcomes, syllabus, lecturer, reviews). The seed course comes from the snapshot. */
export function courseDetail(slug = snapshotDetail.course.slug): CourseDetail {
  return slug === snapshotDetail.course.slug ? snapshotDetail : sampleCourseDetail(slug);
}

/** Hand-written sample for slugs outside the seed data. */
function sampleCourseDetail(slug: string): CourseDetail {
  return {
    course: {
      id: "c-react",
      slug,
      title: "React từ cơ bản đến nâng cao",
      category: "Frontend",
      level: "Intermediate",
      duration: "48 giờ",
      description: "Xây dựng ứng dụng React hoàn chỉnh với hook, routing và kiểm thử.",
      price: 1290000,
      instructorId: "usr-lecturer-001",
      rating: 4.8,
      reviewCount: 214,
      status: "published",
      createdAt: "2026-09-01T00:00:00.000Z",
      publishedAt: new Date("2026-09-01T00:00:00+07:00"),
      updatedAt: new Date("2026-10-01T00:00:00+07:00"),
      enrollmentCount: 860,
      coverImageUrl: null,
      instructorName: "Trần Minh Khoa",
    },
    instructor: { name: "Trần Minh Khoa", title: "Senior Frontend Engineer", avatar: null, bio: "Hơn 8 năm làm việc với React và TypeScript." },
    rating: 4.8,
    reviewCount: 214,
    reviews: [],
    learningOutcomes: ["Viết component React theo hướng hook", "Quản lý state và side effect an toàn", "Tổ chức dự án React quy mô vừa"],
    requirements: ["Biết HTML, CSS và JavaScript cơ bản"],
    targetAudience: "Lập trình viên muốn chuyển sang frontend hiện đại.",
    coverImageUrl: null,
    introVideoUrl: null,
    introVideoCaptionsUrl: null,
    chapters,
    summary: { chapterCount: chapters.length, lessonCount: 4, durationSeconds: 5000 },
  };
}

/** Course detail with no curriculum yet (S02 empty-curriculum branch). */
export function courseDetailWithoutCurriculum(slug: string): CourseDetail {
  return { ...courseDetail(slug), chapters: [], summary: { chapterCount: 0, lessonCount: 0, durationSeconds: 0 } };
}

/** Ownership answer for the signed-in learner on the detail page. */
export function ownershipFor(courseId: string, ownership: CourseOwnership, pendingOrderId?: string): Record<string, CourseOwnershipDetail> {
  return { [courseId]: pendingOrderId ? { ownership, pendingOrderId } : { ownership } };
}
