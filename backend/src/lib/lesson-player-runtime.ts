import { db } from "@/services";
import { createLessonPlayerService } from "./lesson-player-service";

export const lessonPlayerService = createLessonPlayerService(db);
