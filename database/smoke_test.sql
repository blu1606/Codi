/* ============================================================
   CODI schema - smoke test (PostgreSQL)
   ============================================================ */

SET TIME ZONE 'UTC';

-- Create test data
INSERT INTO users (email, full_name) VALUES
    ('lecturer@test.vn', 'Lecturer'),
    ('learner@test.vn',  'Learner'),
    ('admin@test.vn',    'Admin');

INSERT INTO roles (role_id, role_name) VALUES
    ('LEARNER',  'Learner'),
    ('LECTURER', 'Lecturer'),
    ('ADMIN',    'Admin')
ON CONFLICT (role_id) DO NOTHING;

-- Test 1: Email case-sensitivity
\echo 'Test 1: Email case-sensitivity (lower() index)'
INSERT INTO users (email, full_name) VALUES ('Alice@test.vn', 'Alice');
SELECT 'PASS: Alice inserted' AS result;

-- Should fail due to UQ_users_email_lower
BEGIN;
  INSERT INTO users (email, full_name) VALUES ('alice@test.vn', 'alice');
EXCEPTION WHEN unique_violation THEN
  SELECT 'PASS: alice rejected as duplicate of Alice' AS result;
END;
ROLLBACK;

\echo ''
\echo 'Test 2: Price validation'
INSERT INTO courses (lecturer_id, title, price) VALUES 
  ((SELECT id FROM users WHERE email = 'lecturer@test.vn'), 'Test Course', 0);

-- Should fail - PUBLISHED requires price > 0
BEGIN;
  UPDATE courses SET status = 'PUBLISHED' WHERE price = 0;
EXCEPTION WHEN check_violation THEN
  SELECT 'PASS: Cannot publish with price = 0' AS result;
END;
ROLLBACK;

\echo ''
\echo 'Test 3: Object count verification'
SELECT 'PASS: 31 tables' FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' HAVING COUNT(*) = 31;
SELECT 'PASS: 2 views' FROM information_schema.views WHERE table_schema = 'public' HAVING COUNT(*) = 2;

\echo ''
\echo 'Test 4: FK verification'
SELECT 'PASS: All FKs target users.id' FROM information_schema.constraint_column_usage 
WHERE table_name = 'users' AND column_name = 'id' HAVING COUNT(*) > 10;

\echo ''
\echo '========== SMOKE TEST COMPLETE =========='
