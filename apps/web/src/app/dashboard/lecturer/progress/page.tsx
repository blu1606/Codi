import { getLecturerCoursesProgress } from "./actions";
import { ProgressCoursesView } from "./progress-views";

export default async function LecturerProgressPage() {
  const courses = await getLecturerCoursesProgress();

  return <ProgressCoursesView courses={courses} />;
}
