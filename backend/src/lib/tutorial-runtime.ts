import { db } from "@/services";
import { createTutorialService } from "./tutorial-service";
export const tutorialService = createTutorialService(db);
