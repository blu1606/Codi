import { db } from "./src/services";
import { courses, user } from "@codi-1/db";
import { eq } from "drizzle-orm";

async function main() {
  console.log("Fetching users...");
  const users = await db.select().from(user).limit(1);
  
  if (users.length === 0) {
    console.log("No users found. Creating a dummy instructor...");
    const [newUser] = await db.insert(user).values({
      id: crypto.randomUUID(),
      name: "Nguyễn Văn A",
      email: "instructor@codi.vn",
    }).returning();
    users.push(newUser);
  }

  const instructorId = users[0].id;

  console.log(`Setting instructor (${instructorId}) and rating for dsa-interview-prep...`);
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
