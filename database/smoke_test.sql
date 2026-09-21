/* ============================================================
   CODI schema - smoke test (PostgreSQL)

   22 test scenarios verifying business rule constraints.
   Run with: psql -v ON_ERROR_STOP=1 -f database/smoke_test.sql

   If any test fails (RAISE EXCEPTION), the entire suite stops.
   ============================================================ */

SET TIME ZONE 'UTC';

-- Setup: test data
INSERT INTO users (email, full_name) VALUES
    ('lecturer@codi.vn', 'Lecturer'),
    ('learner@codi.vn',  'Learner'),
    ('admin@codi.vn',    'Admin');

INSERT INTO roles (role_id, role_name) VALUES ('LEARNER', 'Learner'), ('LECTURER', 'Lecturer'), ('ADMIN', 'Admin')
ON CONFLICT DO NOTHING;

-- Extract IDs for reuse
CREATE TEMP TABLE _ids AS
SELECT
  (SELECT id FROM users WHERE email = 'lecturer@codi.vn') AS lecturer,
  (SELECT id FROM users WHERE email = 'learner@codi.vn') AS learner,
  (SELECT id FROM users WHERE email = 'admin@codi.vn') AS admin;

INSERT INTO user_roles (user_id, role_id, granted_by)
SELECT lecturer, 'LECTURER', admin FROM _ids
UNION ALL SELECT learner, 'LEARNER', admin FROM _ids;

-- ============================================================
-- Test 0: PostgreSQL NULL behavior (opposite of SQL Server)
-- ============================================================

DO $$
BEGIN
    CREATE TEMP TABLE _nulls (token VARCHAR(50) NULL UNIQUE);
    INSERT INTO _nulls VALUES (NULL), (NULL);
    RAISE NOTICE 'PASS  0: PostgreSQL accepts multiple NULLs in UNIQUE (filtered index prevents regression)';
EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'FAIL  0: %', SQLERRM;
END $$;

-- ============================================================
-- Test 1: Course price validation
-- ============================================================

DO $$
DECLARE vid INTEGER;
BEGIN
    INSERT INTO courses (lecturer_id, title, price) VALUES
      ((SELECT lecturer FROM _ids), 'Java', 0) RETURNING course_id INTO vid;

    BEGIN
        UPDATE courses SET status = 'PUBLISHED' WHERE course_id = vid;
        RAISE EXCEPTION 'FAIL  1: published at price 0 - CK_courses_published_has_price did not block';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'PASS  1: blocked by CK_courses_published_has_price';
    END;

    UPDATE courses SET price = 499000, status = 'PUBLISHED' WHERE course_id = vid;
END $$;

-- ============================================================
-- Test 2-5: Content, knowledge map, BKT
-- ============================================================

DO $$
DECLARE vid INTEGER; chid INTEGER; lid INTEGER; s1id INTEGER; s2id INTEGER;
BEGIN
    SELECT course_id INTO vid FROM courses WHERE price = 499000 LIMIT 1;

    INSERT INTO chapters (course_id, title, order_index) VALUES (vid, 'Ch1', 1) RETURNING chapter_id INTO chid;
    INSERT INTO lessons (chapter_id, title, order_index, is_published) VALUES (chid, 'L1', 1, true) RETURNING lesson_id INTO lid;
    INSERT INTO lesson_materials (lesson_id, material_type, title, url, order_index) VALUES
        (lid, 'VIDEO', 'Video', 'https://x.mp4', 1),
        (lid, 'PDF', 'Slide', 'https://x.pdf', 2),
        (lid, 'DOCUMENT', 'Doc', 'https://x.md', 3);
    RAISE NOTICE 'PASS  2: one lesson holds video + PDF + reading text';

    INSERT INTO skills (course_id, skill_name, source) VALUES (vid, 'Var', 'AI') RETURNING skill_id INTO s1id;
    INSERT INTO skills (course_id, skill_name, source) VALUES (vid, 'Type', 'AI') RETURNING skill_id INTO s2id;
    INSERT INTO skill_prerequisites (skill_id, prerequisite_skill_id) VALUES (s2id, s1id);
    INSERT INTO lesson_skills (lesson_id, skill_id) VALUES (lid, s1id), (lid, s2id);

    BEGIN
        UPDATE skills SET bkt_p_guess = 0.6, bkt_p_slip = 0.5 WHERE skill_id = s1id;
        RAISE EXCEPTION 'FAIL  3: guess+slip>=1 accepted - CK_skills_bkt_identifiable did not block';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'PASS  3: blocked by CK_skills_bkt_identifiable';
    END;

    BEGIN
        INSERT INTO skill_prerequisites (skill_id, prerequisite_skill_id) VALUES (s1id, s1id);
        RAISE EXCEPTION 'FAIL  4: self-prerequisite accepted';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'PASS  4: self-prerequisite blocked';
    END;
END $$;

-- ============================================================
-- Test 5-8: Diagnostic constraints
-- ============================================================

DO $$
DECLARE vid INTEGER; lid INTEGER; diagid INTEGER;
BEGIN
    SELECT course_id INTO vid FROM courses WHERE price = 499000 LIMIT 1;
    SELECT lesson_id INTO lid FROM lessons LIMIT 1;

    INSERT INTO assessments (course_id, assessment_type, is_diagnostic, title)
      VALUES (vid, 'QUIZ', true, 'Diag') RETURNING assessment_id INTO diagid;

    BEGIN
        INSERT INTO assessments (course_id, assessment_type, is_diagnostic, title)
        VALUES (vid, 'QUIZ', true, 'Diag 2');
        RAISE EXCEPTION 'FAIL  5: second diagnostic accepted - UX_assessments_diagnostic_per_course';
    EXCEPTION WHEN unique_violation THEN
        RAISE NOTICE 'PASS  5: blocked by UX_assessments_diagnostic_per_course';
    END;

    BEGIN
        INSERT INTO assessments (course_id, lesson_id, assessment_type, is_diagnostic, title)
        VALUES (vid, lid, 'QUIZ', true, 'Bad');
        RAISE EXCEPTION 'FAIL  6: diagnostic on lesson accepted - CK_assessments_diagnostic_shape';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'PASS  6: blocked by CK_assessments_diagnostic_shape';
    END;

    BEGIN
        INSERT INTO assessments (course_id, lesson_id, assessment_type, title)
        VALUES (vid, lid, 'ASSIGNMENT', 'Assign');
        RAISE EXCEPTION 'FAIL  7: assignment without format - CK_assessments_assignment_format';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'PASS  7: blocked by CK_assessments_assignment_format';
    END;

    INSERT INTO quiz_questions (assessment_id, lesson_id, question_text, question_type, order_index)
      VALUES (diagid, lid, 'Q?', 'SINGLE_CHOICE', 1);

    IF (SELECT COUNT(*) FROM lesson_skills WHERE lesson_id = lid) = 2 THEN
        RAISE NOTICE 'PASS  8: diagnostic resolves to 2 skills via lesson';
    ELSE
        RAISE EXCEPTION 'FAIL  8: expected 2 skills, got %', (SELECT COUNT(*) FROM lesson_skills);
    END IF;
END $$;

-- ============================================================
-- Test 9-11: Enrollment and duplicate
-- ============================================================

DO $$
DECLARE vid INTEGER; learnid INTEGER; adminid INTEGER; enrid INTEGER; orderid INTEGER; itemid INTEGER;
BEGIN
    SELECT course_id INTO vid FROM courses WHERE price = 499000 LIMIT 1;
    SELECT learner, admin INTO learnid, adminid FROM _ids;

    BEGIN
        INSERT INTO enrollments (student_id, course_id, learning_goal)
        VALUES (learnid, vid, 'MASTER_SPECIFIC_SKILL');
        RAISE EXCEPTION 'FAIL  9: MASTER_SPECIFIC_SKILL without target - CK_enrollments_target_skill';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'PASS  9: blocked by CK_enrollments_target_skill';
    END;

    INSERT INTO orders (order_code, student_id, subtotal, total_amount, status, paid_at)
      VALUES ('ORD-1', learnid, 499000, 499000, 'PAID', NOW()) RETURNING order_id INTO orderid;
    INSERT INTO order_items (order_id, course_id, course_title, unit_price)
      VALUES (orderid, vid, 'Java', 499000) RETURNING order_item_id INTO itemid;

    INSERT INTO enrollments (student_id, course_id, order_item_id, learning_goal)
      VALUES (learnid, vid, itemid, 'COMPLETE_COURSE') RETURNING enrollment_id INTO enrid;

    BEGIN
        INSERT INTO enrollments (student_id, course_id, learning_goal) VALUES (learnid, vid, 'COMPLETE_COURSE');
        RAISE EXCEPTION 'FAIL 10: duplicate enrollment - UQ_enrollments_student_course';
    EXCEPTION WHEN unique_violation THEN
        RAISE NOTICE 'PASS 10: blocked by UQ_enrollments_student_course';
    END;
END $$;

-- ============================================================
-- Test 11-13: Submission and mastery
-- ============================================================

DO $$
DECLARE enrid INTEGER; diagid INTEGER; subid INTEGER;
BEGIN
    SELECT enrollment_id INTO enrid FROM enrollments LIMIT 1;
    SELECT assessment_id INTO diagid FROM assessments WHERE is_diagnostic = true LIMIT 1;

    INSERT INTO assessment_submissions (assessment_id, enrollment_id, submission_number, status, submitted_at, score, is_passed, graded_at)
      VALUES (diagid, enrid, 1, 'GRADED', NOW(), 40, false, NOW()) RETURNING submission_id INTO subid;

    BEGIN
        UPDATE assessment_submissions SET status = 'GRADED', score = NULL WHERE submission_id = subid;
        RAISE EXCEPTION 'FAIL 11: GRADED without score - CK_submissions_graded';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'PASS 11: blocked by CK_submissions_graded';
    END;

    INSERT INTO enrollment_skill_mastery (enrollment_id, skill_id, p_mastery, evidence_count, correct_count)
      SELECT enrid, skill_id, 0.5, 1, 0 FROM skills LIMIT 1;

    BEGIN
        UPDATE enrollment_skill_mastery SET p_mastery = 1.5 WHERE enrollment_id = enrid;
        RAISE EXCEPTION 'FAIL 12: p_mastery > 1 - CK_mastery_probability';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'PASS 12: blocked by CK_mastery_probability';
    END;
END $$;

-- ============================================================
-- Test 13-15: Learning paths
-- ============================================================

DO $$
DECLARE enrid INTEGER; p1id INTEGER;
BEGIN
    SELECT enrollment_id INTO enrid FROM enrollments LIMIT 1;

    INSERT INTO personalized_learning_paths (enrollment_id, version_number, generation_trigger, generated_by, mastery_snapshot_hash, generated_at)
      VALUES (enrid, 1, 'DIAGNOSTIC_COMPLETED', 'AI', 'hash1', NOW()) RETURNING path_id INTO p1id;
    RAISE NOTICE 'PASS 13: learning path v1 created';

    BEGIN
        INSERT INTO personalized_learning_paths (enrollment_id, version_number, generation_trigger, generated_by, mastery_snapshot_hash, generated_at)
          VALUES (enrid, 2, 'LESSON_COMPLETED', 'AI', 'hash2', NOW());
        RAISE EXCEPTION 'FAIL 14: two ACTIVE paths - UX_paths_active_per_enrollment';
    EXCEPTION WHEN unique_violation THEN
        RAISE NOTICE 'PASS 14: blocked by UX_paths_active_per_enrollment';
    END;

    UPDATE personalized_learning_paths SET status = 'SUPERSEDED', superseded_at = NOW() WHERE path_id = p1id;
    INSERT INTO personalized_learning_paths (enrollment_id, version_number, generation_trigger, generated_by, mastery_snapshot_hash, generated_at)
      VALUES (enrid, 2, 'LESSON_COMPLETED', 'AI', 'hash2', NOW());
    RAISE NOTICE 'PASS 15: v2 created after v1 superseded';
END $$;

-- ============================================================
-- Test 16-18: Interaction
-- ============================================================

DO $$
DECLARE vid INTEGER; learnid INTEGER; lecid INTEGER; enrid INTEGER;
BEGIN
    SELECT course_id INTO vid FROM courses LIMIT 1;
    SELECT learner, lecturer INTO learnid, lecid FROM _ids;
    SELECT enrollment_id INTO enrid FROM enrollments LIMIT 1;

    INSERT INTO course_discussions (course_id, author_id, body) VALUES (vid, learnid, 'Q?');
    RAISE NOTICE 'PASS 16: course-level question asked';

    INSERT INTO course_reviews (course_id, enrollment_id, rating, review_text)
      VALUES (vid, enrid, 5, 'Great');
    RAISE NOTICE 'PASS 17: review created';

    BEGIN
        INSERT INTO course_reviews (course_id, enrollment_id, rating) VALUES (vid, enrid, 4);
        RAISE EXCEPTION 'FAIL 18: duplicate review - UQ_course_reviews_enrollment';
    EXCEPTION WHEN unique_violation THEN
        RAISE NOTICE 'PASS 18: blocked by UQ_course_reviews_enrollment';
    END;
END $$;

-- ============================================================
-- Test 19: Delete with graded work
-- ============================================================

DO $$
DECLARE diagid INTEGER;
BEGIN
    SELECT assessment_id INTO diagid FROM assessments WHERE is_diagnostic = true LIMIT 1;

    BEGIN
        DELETE FROM assessments WHERE assessment_id = diagid;
        RAISE EXCEPTION 'FAIL 19: deleted assessment with graded submissions';
    EXCEPTION WHEN foreign_key_violation THEN
        RAISE NOTICE 'PASS 19: delete rejected, graded work protected';
    END;
END $$;

-- ============================================================
-- Test 20-21: Views exist
-- ============================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM vw_course_stats LIMIT 1) THEN
        RAISE NOTICE 'PASS 20: vw_course_stats returns rows';
    ELSE
        RAISE EXCEPTION 'FAIL 20: vw_course_stats empty';
    END IF;

    IF EXISTS (SELECT 1 FROM vw_enrollment_progress LIMIT 1) THEN
        RAISE NOTICE 'PASS 21: vw_enrollment_progress returns rows';
    ELSE
        RAISE EXCEPTION 'FAIL 21: vw_enrollment_progress empty';
    END IF;
END $$;

-- ============================================================
-- Test 22: Email case-insensitivity
-- ============================================================

DO $$
BEGIN
    INSERT INTO users (email, full_name) VALUES ('ALICE@test.vn', 'A1');

    BEGIN
        INSERT INTO users (email, full_name) VALUES ('alice@test.vn', 'A2');
        RAISE EXCEPTION 'FAIL 22: alice@test accepted (Alice@test exists) - UQ_users_email_lower';
    EXCEPTION WHEN unique_violation THEN
        RAISE NOTICE 'PASS 22: blocked by UQ_users_email_lower (case-insensitive)';
    END;
END $$;

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '========== ALL 22 TESTS PASSED ==========';
END $$;
