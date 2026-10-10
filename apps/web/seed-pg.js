import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });

  try {
    await client.connect();
    console.log("Connected to PostgreSQL.");

    // Check if user exists
    let res = await client.query('SELECT id FROM "user" LIMIT 1');
    let instructorId = res.rows[0]?.id;

    if (!instructorId) {
      console.log("No user found, inserting dummy user...");
      res = await client.query(`
        INSERT INTO "user" (id, name, email, role, email_verified, created_at, updated_at) 
        VALUES ($1, $2, $3, $4, $5, NOW(), NOW()) RETURNING id
      `, ['instructor-123', 'Nguyễn Văn A', 'instructor@codi.vn', 'instructor', true]);
      instructorId = res.rows[0].id;
    }

    console.log(`Setting instructor (${instructorId}) and rating for dsa-interview-prep...`);
    await client.query(`
      UPDATE "courses" 
      SET instructor_id = $1, rating = $2, review_count = $3
      WHERE slug = 'dsa-interview-prep'
    `, [instructorId, 4.8, 120]);

    console.log("Database updated successfully!");
  } catch (err) {
    console.error("Error updating database:", err);
  } finally {
    await client.end();
  }
}

main();
