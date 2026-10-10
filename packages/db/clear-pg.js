import pg from 'pg';

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error("DATABASE_URL must be explicitly configured");
  }
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL
  });

  try {
    await client.connect();
    
    console.log("Removing instructor and rating for dsa-interview-prep...");
    await client.query(`
      UPDATE "courses" 
      SET instructor_id = NULL, rating = 0, review_count = 0
      WHERE slug = 'dsa-interview-prep'
    `);

    console.log("Database updated successfully!");
  } catch (err) {
    console.error("Error updating database:", err);
  } finally {
    await client.end();
  }
}

main();
