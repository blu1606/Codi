import { db } from "@/services";
import { createTutorService } from "./ai-tutor-service";
export const tutorService = createTutorService(db);
