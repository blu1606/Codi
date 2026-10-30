import { ReviewForm } from "@/app/learn/[courseId]/course-home-sections";
import { coursePathCompleted, coursePathReview } from "@/demo-fixtures/learner/s10-course-home";
import type { CoursePathView } from "@/lib/learning-path-contract";
import type { Screen, ScreenState } from "../screen-types";

/** The review modal opens over the course home; the lab renders the same form with it open. */
const modal = (data: CoursePathView, initialRating: number | null, save: (rating: number, text: string) => Promise<void>) => (
  <ReviewForm initialRating={initialRating} data={data} open onOpenChange={() => {}} save={save} />
);

const reviewState = (label: string, data: CoursePathView, initialRating: number | null, extra: Partial<ScreenState> = {}): ScreenState => ({
  label,
  route: { pathname: "/learn/course-js-001" },
  render: () => modal(data, initialRating, async () => {}),
  ...extra,
});

export const s14ReviewFormScreen: Screen = {
  id: "S14",
  title: "Form đánh giá khoá học (modal)",
  group: "Học tập",
  role: "learner",
  mockupHash: "#/learn/course-js-001",
  states: {
    new: reviewState("Chưa có đánh giá", coursePathCompleted, null),
    "from-completion": reviewState("Mở từ màn hoàn thành (đã chọn sao)", coursePathCompleted, 5),
    edit: reviewState("Sửa đánh giá", coursePathReview, null),
    "save-error": reviewState("Lưu thất bại", coursePathCompleted, 4, {
      render: () => modal(coursePathCompleted, 4, async () => {
        throw new Error("Không thể lưu đánh giá. Vui lòng thử lại.");
      }),
    }),
  },
};
