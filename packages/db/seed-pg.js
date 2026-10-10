import pg from 'pg';

async function main() {
  const client = new pg.Client({
    connectionString: 'postgresql://postgres.nwelnegsoojejerqxiqc:DiAzK0jEZwMAFmkmgJ15DfSy@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres'
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
        INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at) 
        VALUES ($1, $2, $3, $4, NOW(), NOW()) RETURNING id
      `, ['instructor-123', 'Nguyễn Văn A', 'instructor@codi.vn', true]);
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
