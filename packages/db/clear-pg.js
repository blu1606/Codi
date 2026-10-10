import pg from 'pg';

async function main() {
  const client = new pg.Client({
    connectionString: 'postgresql://postgres.nwelnegsoojejerqxiqc:DiAzK0jEZwMAFmkmgJ15DfSy@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres'
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
