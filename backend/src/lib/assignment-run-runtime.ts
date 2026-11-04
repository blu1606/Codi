import { db } from "@/services";
import { createAssignmentRunService } from "./assignment-run-service";
export const assignmentRunService = createAssignmentRunService(db);
