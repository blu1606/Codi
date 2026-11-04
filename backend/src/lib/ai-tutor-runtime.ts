import { db } from "@/services";
import { createAiChatService } from "./ai-chat-service";
import { createTutorService } from "./ai-tutor-service";
export const tutorService = createTutorService(db);
export const chatService = createAiChatService(db);
