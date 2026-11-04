import { db } from "@/services";
import { createLearnerOverviewService } from "./learner-overview-service";
import { createStudyActivityService } from "./study-activity-service";
export const learnerOverviewService = createLearnerOverviewService(db);
export const studyActivityService = createStudyActivityService(db);
