import { serveLessonMedia } from "@/lib/lesson-media";

/** Lecture media uploaded by lecturers (unguessable keys under lesson-media/), with byte-range support. */
export async function GET(request: Request) {
  return serveLessonMedia(request);
}
