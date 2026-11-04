import { db } from "@/services";
import { createCodingService } from "./coding-service";
export const codingService = createCodingService(db);
