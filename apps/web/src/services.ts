import { createAuth } from "@codi-1/auth";
import { createDb } from "@codi-1/db";

import { ENV } from "./env.server";

export const db = createDb(ENV);
export const auth = createAuth(ENV, db);
