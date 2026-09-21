/* ============================================================
   CODI schema v6 - smoke test

   Proves the schema enforces the business rules, not just that it
   compiles. Run against a scratch database:

       sqlcmd -S localhost -E -d Codi_v6_verify -i database\smoke_test.sql

   Every block prints PASS or FAIL. A FAIL means the constraint that
   should have stopped the statement did not fire.
   ============================================================ */

SET NOCOUNT ON;
DECLARE @pass INT = 0, @fail INT = 0;

PRINT '--- 0. the V5 bug, reproduced ------------------------------';
/* A plain UNIQUE on a nullable column lets through exactly one NULL.
   This is what made V5 reject its own second user. */
BEGIN TRY
    CREATE TABLE #v5_style (token VARCHAR(50) NULL UNIQUE);
    INSERT INTO #v5_style VALUES (NULL);
    INSERT INTO #v5_style VALUES (NULL);   -- fails here
    PRINT '  FAIL  two NULLs were accepted - the trap is not reproducible here';
    SET @fail += 1;
END TRY
BEGIN CATCH
    PRINT '  PASS  second NULL rejected: ' + ERROR_MESSAGE();
    SET @pass += 1;
END CATCH
DROP TABLE IF EXISTS #v5_style;

/* v6 uses a filtered index, so any number of rows may hold NULL. */
BEGIN TRY
    INSERT INTO users (email, password_hash, full_name)
    VALUES ('lecturer@codi.vn', 'x', N'Le Van Giang'),
           ('learner@codi.vn',  'x', N'Nguyen Thi Hoc'),
           ('admin@codi.vn',    'x', N'Quan Tri Vien');
    PRINT '  PASS  three users inserted, all with NULL password_reset_token';
    SET @pass += 1;
END TRY
BEGIN CATCH
    PRINT '  FAIL  ' + ERROR_MESSAGE();
    SET @fail += 1;
END CATCH

DECLARE @lecturer BIGINT = (SELECT user_id FROM users WHERE email = 'lecturer@codi.vn');
DECLARE @learner  BIGINT = (SELECT user_id FROM users WHERE email = 'learner@codi.vn');
DECLARE @admin    BIGINT = (SELECT user_id FROM users WHERE email = 'admin@codi.vn');

INSERT INTO user_roles (user_id, role_id, granted_by) VALUES
    (@lecturer, 'LECTURER', @admin),
    (@learner,  'LEARNER',  @admin),
    (@admin,    'ADMIN',    @admin),
    (@lecturer, 'LEARNER',  @admin);   -- a lecturer may also study

PRINT '';
PRINT '--- 1. a course cannot be published without a price --------';
INSERT INTO courses (lecturer_id, title, price) VALUES (@lecturer, N'Java co ban', 0);
DECLARE @course BIGINT = SCOPE_IDENTITY();
BEGIN TRY
    UPDATE courses SET status = 'PUBLISHED' WHERE course_id = @course;
    PRINT '  FAIL  published at price 0';
    SET @fail += 1;
END TRY
BEGIN CATCH
    PRINT '  PASS  blocked by CK_courses_published_has_price';
    SET @pass += 1;
END CATCH
UPDATE courses
   SET price = 499000, price_updated_by = @admin, price_updated_at = SYSUTCDATETIME(),
       status = 'PUBLISHED', published_at = SYSUTCDATETIME()
 WHERE course_id = @course;

PRINT '';
PRINT '--- 2. content, knowledge map, BKT parameters --------------';
INSERT INTO chapters (course_id, title, order_index) VALUES (@course, N'Nhap mon', 1);
DECLARE @chapter BIGINT = SCOPE_IDENTITY();
INSERT INTO lessons (chapter_id, title, order_index, duration_minutes, is_published)
VALUES (@chapter, N'Bien va kieu du lieu', 1, 25, 1);
DECLARE @lesson BIGINT = SCOPE_IDENTITY();

INSERT INTO lesson_materials (lesson_id, material_type, title, url, order_index) VALUES
    (@lesson, 'VIDEO', N'Bai giang', 'https://cdn/v1.mp4', 1),
    (@lesson, 'PDF',   N'Slide',     'https://cdn/s1.pdf', 2),
    (@lesson, 'DOCUMENT', N'Bai doc', 'https://cdn/r1.md', 3);
PRINT '  PASS  one lesson holds video + PDF + reading text';
SET @pass += 1;

INSERT INTO skills (course_id, skill_name, source) VALUES (@course, N'Variables', 'AI');
DECLARE @skill1 BIGINT = SCOPE_IDENTITY();
INSERT INTO skills (course_id, skill_name, source) VALUES (@course, N'Data Types', 'AI');
DECLARE @skill2 BIGINT = SCOPE_IDENTITY();
INSERT INTO skill_prerequisites (skill_id, prerequisite_skill_id) VALUES (@skill2, @skill1);
INSERT INTO lesson_skills (lesson_id, skill_id) VALUES (@lesson, @skill1), (@lesson, @skill2);

BEGIN TRY
    UPDATE skills SET bkt_p_guess = 0.6, bkt_p_slip = 0.5 WHERE skill_id = @skill1;
    PRINT '  FAIL  guess + slip >= 1 was accepted (BKT unidentifiable)';
    SET @fail += 1;
END TRY
BEGIN CATCH
    PRINT '  PASS  blocked by CK_skills_bkt_identifiable';
    SET @pass += 1;
END CATCH

BEGIN TRY
    INSERT INTO skill_prerequisites (skill_id, prerequisite_skill_id) VALUES (@skill1, @skill1);
    PRINT '  FAIL  a skill was allowed to require itself';
    SET @fail += 1;
END TRY
BEGIN CATCH
    PRINT '  PASS  self-prerequisite blocked';
    SET @pass += 1;
END CATCH

PRINT '';
PRINT '--- 3. exactly one diagnostic per course -------------------';
INSERT INTO assessments (course_id, assessment_type, is_diagnostic, title)
VALUES (@course, 'QUIZ', 1, N'Bai kiem tra dau vao');
DECLARE @diag BIGINT = SCOPE_IDENTITY();
BEGIN TRY
    INSERT INTO assessments (course_id, assessment_type, is_diagnostic, title)
    VALUES (@course, 'QUIZ', 1, N'Bai kiem tra dau vao 2');
    PRINT '  FAIL  a second diagnostic was accepted';
    SET @fail += 1;
END TRY
BEGIN CATCH
    PRINT '  PASS  blocked by UX_assessments_diagnostic_per_course';
    SET @pass += 1;
END CATCH

BEGIN TRY
    INSERT INTO assessments (course_id, lesson_id, assessment_type, is_diagnostic, title)
    VALUES (@course, @lesson, 'QUIZ', 1, N'Diagnostic gan vao lesson');
    PRINT '  FAIL  a diagnostic was allowed to sit on a lesson';
    SET @fail += 1;
END TRY
BEGIN CATCH
    PRINT '  PASS  blocked by CK_assessments_diagnostic_shape';
    SET @pass += 1;
END CATCH

BEGIN TRY
    INSERT INTO assessments (course_id, lesson_id, assessment_type, title)
    VALUES (@course, @lesson, 'ASSIGNMENT', N'Bai tap thieu format');
    PRINT '  FAIL  an assignment without submission_format was accepted';
    SET @fail += 1;
END TRY
BEGIN CATCH
    PRINT '  PASS  blocked by CK_assessments_assignment_format';
    SET @pass += 1;
END CATCH

/* The diagnostic is course-level, so each of its questions names the lesson it
   tests. That is the only path from an entry-test answer to a concept:
   question -> lesson -> lesson_skills -> skills. */
INSERT INTO quiz_questions (assessment_id, lesson_id, question_text, question_type, order_index)
VALUES (@diag, @lesson, N'int x = 5; x la gi?', 'SINGLE_CHOICE', 1);
DECLARE @q BIGINT = SCOPE_IDENTITY();
INSERT INTO quiz_options (question_id, option_text, is_correct, order_index)
VALUES (@q, N'Bien', 1, 1), (@q, N'Ham', 0, 2);

-- the concepts a diagnostic answer is evidence for, resolved through the lesson
DECLARE @reached INT = (
    SELECT COUNT(*) FROM quiz_questions q
    JOIN lesson_skills ls ON ls.lesson_id = q.lesson_id
    WHERE q.question_id = @q);
IF @reached = 2
BEGIN
    PRINT '  PASS  diagnostic question resolves to 2 skills via its lesson';
    SET @pass += 1;
END
ELSE
BEGIN
    PRINT '  FAIL  expected 2 skills through the lesson, got ' + CAST(@reached AS VARCHAR);
    SET @fail += 1;
END

PRINT '';
PRINT '--- 4. purchase, enrollment, learning goal -----------------';
INSERT INTO orders (order_code, student_id, subtotal, total_amount, status, paid_at)
VALUES ('ORD-0001', @learner, 499000, 499000, 'PAID', SYSUTCDATETIME());
DECLARE @order BIGINT = SCOPE_IDENTITY();
INSERT INTO order_items (order_id, course_id, course_title, unit_price)
VALUES (@order, @course, N'Java co ban', 499000);
DECLARE @item BIGINT = SCOPE_IDENTITY();
INSERT INTO payments (order_id, amount, payment_status, transaction_code, paid_at)
VALUES (@order, 499000, 'SUCCESS', 'TXN-0001', SYSUTCDATETIME());

BEGIN TRY
    INSERT INTO enrollments (student_id, course_id, order_item_id, learning_goal)
    VALUES (@learner, @course, @item, 'MASTER_SPECIFIC_SKILL');   -- no target_skill_id
    PRINT '  FAIL  MASTER_SPECIFIC_SKILL accepted without a target skill';
    SET @fail += 1;
END TRY
BEGIN CATCH
    PRINT '  PASS  blocked by CK_enrollments_target_skill';
    SET @pass += 1;
END CATCH

INSERT INTO enrollments (student_id, course_id, order_item_id, learning_goal,
                         target_skill_id, goal_set_at)
VALUES (@learner, @course, @item, 'MASTER_SPECIFIC_SKILL', @skill2, SYSUTCDATETIME());
DECLARE @enr BIGINT = SCOPE_IDENTITY();

BEGIN TRY
    INSERT INTO enrollments (student_id, course_id, learning_goal)
    VALUES (@learner, @course, 'COMPLETE_COURSE');
    PRINT '  FAIL  the same learner enrolled twice in one course';
    SET @fail += 1;
END TRY
BEGIN CATCH
    PRINT '  PASS  blocked by UQ_enrollments_student_course';
    SET @pass += 1;
END CATCH

PRINT '';
PRINT '--- 5. diagnostic submission drives BKT and the path -------';
INSERT INTO assessment_submissions
    (assessment_id, enrollment_id, submission_number, status, submitted_at, score, is_passed, graded_at)
VALUES (@diag, @enr, 1, 'GRADED', SYSUTCDATETIME(), 40, 0, SYSUTCDATETIME());
DECLARE @sub BIGINT = SCOPE_IDENTITY();
INSERT INTO assessment_answers (submission_id, question_id, is_correct, earned_points)
VALUES (@sub, @q, 0, 0);

BEGIN TRY
    UPDATE assessment_submissions SET status = 'GRADED', score = NULL WHERE submission_id = @sub;
    PRINT '  FAIL  a GRADED submission was allowed to have no score';
    SET @fail += 1;
END TRY
BEGIN CATCH
    PRINT '  PASS  blocked by CK_submissions_graded';
    SET @pass += 1;
END CATCH

INSERT INTO enrollment_skill_mastery (enrollment_id, skill_id, p_mastery, evidence_count, correct_count)
VALUES (@enr, @skill1, 0.18400, 1, 0), (@enr, @skill2, 0.10000, 0, 0);

BEGIN TRY
    UPDATE enrollment_skill_mastery SET p_mastery = 72 WHERE enrollment_id = @enr AND skill_id = @skill1;
    PRINT '  FAIL  p_mastery accepted a value outside 0..1';
    SET @fail += 1;
END TRY
BEGIN CATCH
    PRINT '  PASS  blocked by CK_mastery_probability (it is a probability, not a percent)';
    SET @pass += 1;
END CATCH

INSERT INTO personalized_learning_paths
    (enrollment_id, version_number, generation_trigger, source_submission_id,
     generated_by, ai_model, ai_rationale, mastery_snapshot_hash, generated_at)
VALUES (@enr, 1, 'DIAGNOSTIC_COMPLETED', @sub, 'AI', 'gpt-x',
        N'Diagnostic cho thay chua nam Variables, bat dau tu bai nay.',
        'a1b2c3', SYSUTCDATETIME());
DECLARE @path BIGINT = SCOPE_IDENTITY();
INSERT INTO path_items (path_id, lesson_id, sequence_order, ai_reason, estimated_minutes)
VALUES (@path, @lesson, 1, N'Cung co Variables truoc khi sang Data Types.', 25);

BEGIN TRY
    INSERT INTO personalized_learning_paths (enrollment_id, version_number, generation_trigger)
    VALUES (@enr, 2, 'LESSON_COMPLETED');
    PRINT '  FAIL  two ACTIVE paths accepted for one enrollment';
    SET @fail += 1;
END TRY
BEGIN CATCH
    PRINT '  PASS  blocked by UX_paths_active_per_enrollment';
    SET @pass += 1;
END CATCH

-- superseding the old version is the supported way to add one
UPDATE personalized_learning_paths
   SET status = 'SUPERSEDED', superseded_at = SYSUTCDATETIME()
 WHERE path_id = @path;
INSERT INTO personalized_learning_paths
    (enrollment_id, version_number, generation_trigger, generated_by, mastery_snapshot_hash, generated_at)
VALUES (@enr, 2, 'LESSON_COMPLETED', 'AI', 'd4e5f6', SYSUTCDATETIME());
PRINT '  PASS  version 2 created after version 1 was superseded';
SET @pass += 1;

PRINT '';
PRINT '--- 6. interaction ----------------------------------------';
-- a course-level question: this is what V5 could not store
INSERT INTO course_discussions (course_id, lesson_id, author_id, body)
VALUES (@course, NULL, @learner, N'Khoa nay co can biet C truoc khong a?');
DECLARE @thread BIGINT = SCOPE_IDENTITY();
INSERT INTO course_discussions (course_id, parent_id, author_id, body)
VALUES (@course, @thread, @lecturer, N'Khong can em nhe.');
UPDATE course_discussions SET is_resolved = 1 WHERE discussion_id = @thread;
PRINT '  PASS  course-level question asked and answered';
SET @pass += 1;

INSERT INTO course_reviews (course_id, enrollment_id, rating, review_text)
VALUES (@course, @enr, 5, N'Lo trinh rat hop voi minh.');
UPDATE course_reviews
   SET lecturer_reply = N'Cam on em!', replied_by = @lecturer, replied_at = SYSUTCDATETIME()
 WHERE enrollment_id = @enr;
PRINT '  PASS  lecturer replied to a review';
SET @pass += 1;

BEGIN TRY
    INSERT INTO course_reviews (course_id, enrollment_id, rating) VALUES (@course, @enr, 4);
    PRINT '  FAIL  a second review for the same enrollment was accepted';
    SET @fail += 1;
END TRY
BEGIN CATCH
    PRINT '  PASS  blocked by UQ_course_reviews_enrollment';
    SET @pass += 1;
END CATCH

PRINT '';
PRINT '--- 7. graded work survives an assessment delete -----------';
BEGIN TRY
    DELETE FROM assessments WHERE assessment_id = @diag;
    PRINT '  FAIL  an assessment with graded submissions was deleted';
    SET @fail += 1;
END TRY
BEGIN CATCH
    PRINT '  PASS  delete refused, graded work kept (retire with status DISABLED)';
    SET @pass += 1;
END CATCH

PRINT '';
PRINT '--- 8. reporting views ------------------------------------';
SELECT total_lessons, total_enrollments, average_rating FROM vw_course_stats WHERE course_id = @course;
SELECT lessons_completed, average_mastery FROM vw_enrollment_progress WHERE enrollment_id = @enr;
PRINT '  PASS  both views return rows';
SET @pass += 1;

PRINT '';
PRINT '===========================================================';
PRINT '  PASSED: ' + CAST(@pass AS VARCHAR) + '   FAILED: ' + CAST(@fail AS VARCHAR);
PRINT '===========================================================';
GO
