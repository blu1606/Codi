import { db } from "@/services";
import { createAssessmentService } from "./assessment-service";
import { assignmentFiles } from "./storage";
import { ENV } from "@/env";

export const assessmentService = createAssessmentService(
  db,
  assignmentFiles,
  ENV.BETTER_AUTH_SECRET,
);
