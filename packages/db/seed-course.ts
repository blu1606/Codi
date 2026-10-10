import "varlock/auto-load";
import { createDb } from "./src";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
const db = createDb({ DATABASE_URL: process.env.DATABASE_URL });
import { courses, user } from "./src/schema";
import { eq } from "drizzle-orm";

async function main() {
  console.log("Fetching users...");
  const users = await db.select().from(user).limit(1);

  if (users.length === 0) {
    console.log("No users found. Creating a dummy instructor...");
    const [newUser] = await db.insert(user).values({
      id: "dummy-instructor-id",
      name: "Nguyễn Văn A",
      email: "instructor@codi.vn",
    }).returning();
    
    if (newUser) {
      users.push(newUser);
    }
  }

  const instructor = users[0];
  if (!instructor) throw new Error("Failed to get or create instructor");
  const instructorId = instructor.id;

  console.log(`Setting instructor (${instructorId}) and rating for courses...`);
  await db
    .update(courses)
    .set({
      instructorId: instructorId,
      rating: 4.8,
      reviewCount: 256,
    })
    .where(eq(courses.slug, "dsa-interview-prep"));

  console.log("Done!");
  process.exit(0);
}

main().catch(console.error);
