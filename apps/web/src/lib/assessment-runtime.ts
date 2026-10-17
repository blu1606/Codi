import { db } from "@/services";
import { createAssessmentService } from "./assessment-service";
import { assignmentFiles } from "./storage";

export const assessmentService = createAssessmentService(db, assignmentFiles);
