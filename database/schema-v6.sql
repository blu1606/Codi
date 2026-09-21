/* ============================================================
   CODI - AI-POWERED PERSONALIZED LEARNING PLATFORM
   Database schema v6  |  SQL Server  |  2026-09-21

   Rebuilt from V5 to close the gaps a review found:
     - business rules that had no home in the schema
     - tables split without reason
     - two UNIQUE-on-NULL constraints that break on the 2nd row

   Traceability: every table maps to a use case in UC-by-actor.drawio.
   The UC id in each section header refers to the RDS use case table.
   ============================================================ */

USE master;
GO

IF DB_ID(N'Codi') IS NOT NULL
BEGIN
    ALTER DATABASE Codi SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
    DROP DATABASE Codi;
END
GO

CREATE DATABASE Codi;
GO

USE Codi;
GO


/* ============================================================
   1. IDENTITY AND ACCESS
   UC-01 Register Account .. UC-09 Change Password,
   UC-39 View User Accounts, UC-40 Update User Account Status,
   UC-41 Update User Role
   ============================================================ */

CREATE TABLE roles (
    role_id     VARCHAR(20)  NOT NULL PRIMARY KEY,
    role_name   NVARCHAR(50) NOT NULL UNIQUE
);
GO

INSERT INTO roles (role_id, role_name) VALUES
    ('LEARNER',  N'Learner'),
    ('LECTURER', N'Lecturer'),
    ('ADMIN',    N'Admin');
GO

CREATE TABLE users (
    user_id                 BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,

    email                   VARCHAR(255)  NOT NULL UNIQUE,
    password_hash           VARCHAR(255)  NOT NULL,
    full_name               NVARCHAR(150) NOT NULL,
    phone                   VARCHAR(30)   NULL,
    avatar_url              VARCHAR(500)  NULL,

    -- UC-02 Verify Email Address: folded in rather than a 1:1 side table
    is_email_verified       BIT           NOT NULL DEFAULT 0,
    email_verification_code VARCHAR(10)   NULL,
    email_verification_expires_at DATETIME2(3) NULL,
    email_verified_at       DATETIME2(3)  NULL,

    -- UC-06 Recover Password
    password_reset_token    VARCHAR(255)  NULL,
    password_reset_expires_at DATETIME2(3) NULL,
    password_reset_requested_at DATETIME2(3) NULL,

    -- UC-40 Update User Account Status (activate / deactivate)
    is_active               BIT           NOT NULL DEFAULT 1,
    status_changed_by       BIGINT        NULL,
    status_changed_at       DATETIME2(3)  NULL,
    status_change_reason    NVARCHAR(500) NULL,

    last_login_at           DATETIME2(3)  NULL,
    created_at              DATETIME2(3)  NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at              DATETIME2(3)  NOT NULL DEFAULT SYSUTCDATETIME(),

    CONSTRAINT FK_users_status_changed_by
        FOREIGN KEY (status_changed_by) REFERENCES users(user_id)
);
GO

/* A plain UNIQUE constraint on a nullable column is a trap in SQL Server:
   it treats NULLs as equal, so only ONE row may hold NULL. V5 declared
   password_reset_token NULL UNIQUE, which meant the second user could not be
   inserted. A filtered index is the correct form. */
CREATE UNIQUE INDEX UX_users_password_reset_token
    ON users(password_reset_token)
    WHERE password_reset_token IS NOT NULL;
GO

/* UC-41: roles are granted and revoked, and a user may legitimately hold more
   than one (a Lecturer who also studies other courses). revoked_at keeps the
   history instead of overwriting it. */
CREATE TABLE user_roles (
    user_role_id BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    user_id      BIGINT       NOT NULL,
    role_id      VARCHAR(20)  NOT NULL,

    granted_by   BIGINT       NULL,
    granted_at   DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
    revoked_by   BIGINT       NULL,
    revoked_at   DATETIME2(3) NULL,

    CONSTRAINT CK_user_roles_revoke_order
        CHECK (revoked_at IS NULL OR revoked_at >= granted_at),

    CONSTRAINT FK_user_roles_user
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    CONSTRAINT FK_user_roles_role
        FOREIGN KEY (role_id) REFERENCES roles(role_id),
    CONSTRAINT FK_user_roles_granted_by
        FOREIGN KEY (granted_by) REFERENCES users(user_id),
    CONSTRAINT FK_user_roles_revoked_by
        FOREIGN KEY (revoked_by) REFERENCES users(user_id)
);
GO

-- a user may hold a given role once at a time, but may be re-granted later
CREATE UNIQUE INDEX UX_user_roles_active
    ON user_roles(user_id, role_id)
    WHERE revoked_at IS NULL;
GO


/* ============================================================
   2. COURSE AND CONTENT
   UC-03 Search Published Courses, UC-04 View Course Details,
   UC-24 Create Course, UC-25/27/28 Course Content CRUD,
   UC-37 Hide Published Course, UC-38 Update Course Price
   ============================================================ */

CREATE TABLE courses (
    course_id        BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    lecturer_id      BIGINT        NOT NULL,

    course_code      VARCHAR(50)   NULL,
    title            NVARCHAR(255) NOT NULL,
    description      NVARCHAR(MAX) NULL,
    thumbnail_url    VARCHAR(500)  NULL,

    level            VARCHAR(20)   NOT NULL DEFAULT 'BEGINNER',
    language         VARCHAR(20)   NOT NULL DEFAULT 'VI',

    -- UC-38: pricing belongs to the Admin, not the Lecturer, so who last
    -- touched it is part of the record
    price            DECIMAL(12,2) NOT NULL DEFAULT 0,
    currency         VARCHAR(10)   NOT NULL DEFAULT 'VND',
    price_updated_by BIGINT        NULL,
    price_updated_at DATETIME2(3)  NULL,

    learning_objectives NVARCHAR(MAX) NULL,
    requirements        NVARCHAR(MAX) NULL,

    -- DRAFT -> SUBMITTED -> PUBLISHED -> DISABLED (UC-37 hides to DISABLED)
    status           VARCHAR(20)   NOT NULL DEFAULT 'DRAFT',

    /* UC-26 Extract Course Knowledge Map. Four columns instead of a separate
       table: the map itself lives in skills / skill_prerequisites, this only
       records the extraction run. content_hash lets the app skip re-extraction
       when the authored content has not changed. */
    knowledge_map_status       VARCHAR(20)  NOT NULL DEFAULT 'NONE',
    knowledge_map_model        VARCHAR(100) NULL,
    knowledge_map_content_hash VARCHAR(64)  NULL,
    knowledge_map_generated_at DATETIME2(3) NULL,

    created_at       DATETIME2(3)  NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at       DATETIME2(3)  NOT NULL DEFAULT SYSUTCDATETIME(),
    published_at     DATETIME2(3)  NULL,

    CONSTRAINT CK_courses_level
        CHECK (level IN ('BEGINNER','INTERMEDIATE','ADVANCED')),
    CONSTRAINT CK_courses_status
        CHECK (status IN ('DRAFT','SUBMITTED','PUBLISHED','DISABLED')),
    CONSTRAINT CK_courses_price
        CHECK (price >= 0),
    CONSTRAINT CK_courses_knowledge_map_status
        CHECK (knowledge_map_status IN ('NONE','GENERATING','READY','FAILED','STALE')),
    /* every Codi course is paid, so a course may only reach PUBLISHED with a
       price set - UC-33 Validate Publication Requirements checks this too */
    CONSTRAINT CK_courses_published_has_price
        CHECK (status <> 'PUBLISHED' OR price > 0),

    CONSTRAINT FK_courses_lecturer
        FOREIGN KEY (lecturer_id) REFERENCES users(user_id),
    CONSTRAINT FK_courses_price_updated_by
        FOREIGN KEY (price_updated_by) REFERENCES users(user_id)
);
GO

-- same NULL-UNIQUE trap as above: course_code is optional
CREATE UNIQUE INDEX UX_courses_course_code
    ON courses(course_code)
    WHERE course_code IS NOT NULL;
GO

CREATE TABLE chapters (
    chapter_id  BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    course_id   BIGINT        NOT NULL,

    title       NVARCHAR(255) NOT NULL,
    description NVARCHAR(MAX) NULL,
    order_index INT           NOT NULL,

    created_at  DATETIME2(3)  NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at  DATETIME2(3)  NOT NULL DEFAULT SYSUTCDATETIME(),

    CONSTRAINT CK_chapters_order CHECK (order_index > 0),
    CONSTRAINT UQ_chapters_course_order UNIQUE (course_id, order_index),
    CONSTRAINT FK_chapters_course
        FOREIGN KEY (course_id) REFERENCES courses(course_id)
);
GO

CREATE TABLE lessons (
    lesson_id        BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    chapter_id       BIGINT        NOT NULL,

    title            NVARCHAR(255) NOT NULL,
    description      NVARCHAR(MAX) NULL,
    body             NVARCHAR(MAX) NULL,   -- the reading text of the lesson
    duration_minutes INT           NULL,
    order_index      INT           NOT NULL,

    is_free_preview  BIT           NOT NULL DEFAULT 0,
    is_remedial      BIT           NOT NULL DEFAULT 0,
    is_published     BIT           NOT NULL DEFAULT 0,

    created_at       DATETIME2(3)  NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at       DATETIME2(3)  NOT NULL DEFAULT SYSUTCDATETIME(),

    CONSTRAINT CK_lessons_duration
        CHECK (duration_minutes IS NULL OR duration_minutes >= 0),
    CONSTRAINT CK_lessons_order CHECK (order_index > 0),
    CONSTRAINT UQ_lessons_chapter_order UNIQUE (chapter_id, order_index),
    CONSTRAINT FK_lessons_chapter
        FOREIGN KEY (chapter_id) REFERENCES chapters(chapter_id) ON DELETE CASCADE
);
GO

/* V5 could only store one video URL plus a text blob per lesson, so the
   "lecture video, PDF / slide deck and reading text" the RDS promises had
   nowhere to live. A lesson now owns an ordered list of materials. */
CREATE TABLE lesson_materials (
    material_id      BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    lesson_id        BIGINT        NOT NULL,

    material_type    VARCHAR(20)   NOT NULL,   -- VIDEO / PDF / SLIDE / DOCUMENT / LINK
    title            NVARCHAR(255) NOT NULL,
    url              VARCHAR(1000) NOT NULL,
    file_size_kb     INT           NULL,
    duration_seconds INT           NULL,       -- video only
    order_index      INT           NOT NULL,

    created_at       DATETIME2(3)  NOT NULL DEFAULT SYSUTCDATETIME(),

    CONSTRAINT CK_lesson_materials_type
        CHECK (material_type IN ('VIDEO','PDF','SLIDE','DOCUMENT','LINK')),
    CONSTRAINT CK_lesson_materials_size
        CHECK (file_size_kb IS NULL OR file_size_kb > 0),
    CONSTRAINT CK_lesson_materials_duration
        CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
    CONSTRAINT CK_lesson_materials_order CHECK (order_index > 0),
    CONSTRAINT UQ_lesson_materials_order UNIQUE (lesson_id, order_index),
    CONSTRAINT FK_lesson_materials_lesson
        FOREIGN KEY (lesson_id) REFERENCES lessons(lesson_id) ON DELETE CASCADE
);
GO


/* ============================================================
   3. COURSE KNOWLEDGE MAP
   UC-26 Extract Course Knowledge Map

   Skills are scoped to a course: the AI derives each course's concepts from
   that course's own content, so two courses may both have a "Recursion"
   concept without colliding.
   ============================================================ */

CREATE TABLE skills (
    skill_id    BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    course_id   BIGINT        NOT NULL,

    skill_name  NVARCHAR(150) NOT NULL,
    description NVARCHAR(MAX) NULL,
    level       VARCHAR(20)   NULL,
    source      VARCHAR(20)   NOT NULL DEFAULT 'AI',   -- AI / LECTURER

    /* Bayesian Knowledge Tracing parameters, per concept.
       Seeded with the values commonly used in the literature and refitted by
       EM once real learner data exists. Without these columns BKT cannot be
       implemented at all - V5 had nowhere to put them. */
    bkt_p_init  DECIMAL(4,3)  NOT NULL DEFAULT 0.100,   -- P(known before any practice)
    bkt_p_learn DECIMAL(4,3)  NOT NULL DEFAULT 0.200,   -- P(learn per opportunity)
    bkt_p_guess DECIMAL(4,3)  NOT NULL DEFAULT 0.200,   -- P(correct while not known)
    bkt_p_slip  DECIMAL(4,3)  NOT NULL DEFAULT 0.100,   -- P(wrong while known)

    created_at  DATETIME2(3)  NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at  DATETIME2(3)  NOT NULL DEFAULT SYSUTCDATETIME(),

    CONSTRAINT CK_skills_level
        CHECK (level IS NULL OR level IN ('BEGINNER','INTERMEDIATE','ADVANCED')),
    CONSTRAINT CK_skills_source
        CHECK (source IN ('AI','LECTURER')),
    CONSTRAINT CK_skills_bkt_range
        CHECK (bkt_p_init  BETWEEN 0 AND 1
           AND bkt_p_learn BETWEEN 0 AND 1
           AND bkt_p_guess BETWEEN 0 AND 1
           AND bkt_p_slip  BETWEEN 0 AND 1),
    /* BKT degenerates when guess + slip >= 1: the model can no longer tell a
       knower from a guesser. Beck's standard identifiability bound. */
    CONSTRAINT CK_skills_bkt_identifiable
        CHECK (bkt_p_guess + bkt_p_slip < 1),

    CONSTRAINT UQ_skills_course_name UNIQUE (course_id, skill_name),
    CONSTRAINT FK_skills_course
        FOREIGN KEY (course_id) REFERENCES courses(course_id)
);
GO

/* The prerequisite edges of the knowledge map. Both skills must belong to the
   same course - enforced by the application, because SQL Server cannot express
   it as a CHECK across two rows. */
CREATE TABLE skill_prerequisites (
    skill_id              BIGINT NOT NULL,
    prerequisite_skill_id BIGINT NOT NULL,

    source     VARCHAR(20)  NOT NULL DEFAULT 'AI',   -- AI / LECTURER
    created_at DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),

    PRIMARY KEY (skill_id, prerequisite_skill_id),

    CONSTRAINT CK_skill_prerequisites_not_self
        CHECK (skill_id <> prerequisite_skill_id),
    CONSTRAINT CK_skill_prerequisites_source
        CHECK (source IN ('AI','LECTURER')),

    -- only one side may cascade, or SQL Server rejects the second path
    CONSTRAINT FK_skill_prerequisites_skill
        FOREIGN KEY (skill_id) REFERENCES skills(skill_id) ON DELETE CASCADE,
    CONSTRAINT FK_skill_prerequisites_required
        FOREIGN KEY (prerequisite_skill_id) REFERENCES skills(skill_id)
);
GO

CREATE TABLE lesson_skills (
    lesson_id BIGINT NOT NULL,
    skill_id  BIGINT NOT NULL,

    PRIMARY KEY (lesson_id, skill_id),

    CONSTRAINT FK_lesson_skills_lesson
        FOREIGN KEY (lesson_id) REFERENCES lessons(lesson_id) ON DELETE CASCADE,
    CONSTRAINT FK_lesson_skills_skill
        FOREIGN KEY (skill_id) REFERENCES skills(skill_id)
);
GO


/* ============================================================
   4. COURSE PUBLICATION WORKFLOW
   UC-32 Request Course Publication, UC-33 Validate Publication
   Requirements, UC-35 Review Course Publication Request,
   UC-36 Validate Course Content
   ============================================================ */

CREATE TABLE course_publication_requests (
    request_id        BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    course_id         BIGINT        NOT NULL,
    requested_by      BIGINT        NOT NULL,
    reviewed_by       BIGINT        NULL,

    request_version   INT           NOT NULL DEFAULT 1,

    -- UC-33: the automatic completeness check, run when the Lecturer submits
    validation_status VARCHAR(20)   NOT NULL DEFAULT 'PENDING',
    validation_note   NVARCHAR(MAX) NULL,
    validated_at      DATETIME2(3)  NULL,

    -- UC-35 / UC-36: the Admin's manual decision
    status            VARCHAR(20)   NOT NULL DEFAULT 'PENDING',
    review_note       NVARCHAR(MAX) NULL,
    reviewed_at       DATETIME2(3)  NULL,

    requested_at      DATETIME2(3)  NOT NULL DEFAULT SYSUTCDATETIME(),

    CONSTRAINT CK_publication_version CHECK (request_version > 0),
    CONSTRAINT CK_publication_status
        CHECK (status IN ('PENDING','APPROVED','REJECTED','CANCELLED')),
    CONSTRAINT CK_publication_validation_status
        CHECK (validation_status IN ('PENDING','PASSED','FAILED')),
    -- an approve/reject decision must name who made it and when
    CONSTRAINT CK_publication_review_complete
        CHECK (status NOT IN ('APPROVED','REJECTED')
               OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)),

    CONSTRAINT UQ_publication_course_version UNIQUE (course_id, request_version),
    CONSTRAINT FK_publication_course
        FOREIGN KEY (course_id) REFERENCES courses(course_id),
    CONSTRAINT FK_publication_requested_by
        FOREIGN KEY (requested_by) REFERENCES users(user_id),
    CONSTRAINT FK_publication_reviewed_by
        FOREIGN KEY (reviewed_by) REFERENCES users(user_id)
);
GO

-- at most one open request per course
CREATE UNIQUE INDEX UX_publication_pending_per_course
    ON course_publication_requests(course_id)
    WHERE status = 'PENDING';
GO


/* ============================================================
   5. ASSESSMENTS
   UC-13 Complete Course Diagnostic Assessment, UC-18 Submit Course
   Quiz, UC-19 Submit Assignment, UC-29 Grade Assignment Submission

   V5 split quiz_details and assignment_details into 1:1 side tables holding
   three and four columns. They are folded back in: every read of an
   assessment saved a join, and the nullable columns cost nothing.
   ============================================================ */

CREATE TABLE assessments (
    assessment_id     BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,

    /* The diagnostic is a COURSE entry test, not a lesson quiz. V5 forced
       every assessment onto a lesson, so the diagnostic had to be bolted onto
       an arbitrary one. course_id is now mandatory and lesson_id optional. */
    course_id         BIGINT        NOT NULL,
    lesson_id         BIGINT        NULL,

    assessment_type   VARCHAR(20)   NOT NULL,   -- QUIZ / ASSIGNMENT
    is_diagnostic     BIT           NOT NULL DEFAULT 0,

    title             NVARCHAR(255) NOT NULL,
    description       NVARCHAR(MAX) NULL,
    instructions      NVARCHAR(MAX) NULL,

    max_score         DECIMAL(6,2)  NOT NULL DEFAULT 100,
    pass_score        DECIMAL(6,2)  NULL,
    time_limit_minutes INT          NULL,
    max_attempts      INT           NULL,

    due_at            DATETIME2(3)  NULL,
    allow_late_submission BIT       NOT NULL DEFAULT 0,
    allow_resubmission    BIT       NOT NULL DEFAULT 1,

    -- quiz-only settings (were quiz_details)
    shuffle_questions       BIT NULL,
    show_result_immediately BIT NULL,

    -- assignment-only settings (were assignment_details)
    submission_format  VARCHAR(30)   NULL,   -- TEXT / FILE / TEXT_AND_FILE
    max_file_size_mb   INT           NULL,
    allowed_file_types VARCHAR(500)  NULL,
    rubric             NVARCHAR(MAX) NULL,

    status            VARCHAR(20)   NOT NULL DEFAULT 'DRAFT',
    created_at        DATETIME2(3)  NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at        DATETIME2(3)  NOT NULL DEFAULT SYSUTCDATETIME(),
    published_at      DATETIME2(3)  NULL,

    CONSTRAINT CK_assessments_type
        CHECK (assessment_type IN ('QUIZ','ASSIGNMENT')),
    CONSTRAINT CK_assessments_status
        CHECK (status IN ('DRAFT','PUBLISHED','DISABLED')),
    CONSTRAINT CK_assessments_max_score CHECK (max_score > 0),
    CONSTRAINT CK_assessments_pass_score
        CHECK (pass_score IS NULL OR pass_score BETWEEN 0 AND max_score),
    CONSTRAINT CK_assessments_time
        CHECK (time_limit_minutes IS NULL OR time_limit_minutes > 0),
    CONSTRAINT CK_assessments_attempts
        CHECK (max_attempts IS NULL OR max_attempts > 0),
    CONSTRAINT CK_assessments_format
        CHECK (submission_format IS NULL
               OR submission_format IN ('TEXT','FILE','TEXT_AND_FILE')),
    CONSTRAINT CK_assessments_file_size
        CHECK (max_file_size_mb IS NULL OR max_file_size_mb > 0),
    -- the diagnostic is always a course-level quiz
    CONSTRAINT CK_assessments_diagnostic_shape
        CHECK (is_diagnostic = 0
               OR (assessment_type = 'QUIZ' AND lesson_id IS NULL)),
    -- an assignment needs a submission format, a quiz does not
    CONSTRAINT CK_assessments_assignment_format
        CHECK (assessment_type <> 'ASSIGNMENT' OR submission_format IS NOT NULL),

    CONSTRAINT FK_assessments_course
        FOREIGN KEY (course_id) REFERENCES courses(course_id),
    CONSTRAINT FK_assessments_lesson
        FOREIGN KEY (lesson_id) REFERENCES lessons(lesson_id)
);
GO

-- exactly one diagnostic per course
CREATE UNIQUE INDEX UX_assessments_diagnostic_per_course
    ON assessments(course_id)
    WHERE is_diagnostic = 1;
GO

CREATE TABLE quiz_questions (
    question_id   BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    assessment_id BIGINT        NOT NULL,

    /* A question points at the LESSON it tests, never at a skill directly:
       skills are declared once, on the lesson, and the question inherits them
       through lesson_skills. That keeps one place to tag concepts.

       For a lesson quiz this is the assessment's own lesson and may be left
       NULL. It matters for the diagnostic, which is course-level and therefore
       has no lesson of its own - this column is how each entry-test question
       maps onto the syllabus so BKT knows which concepts it is evidence for. */
    lesson_id     BIGINT        NULL,

    question_text NVARCHAR(MAX) NOT NULL,
    question_type VARCHAR(30)   NOT NULL,
    code_snippet  NVARCHAR(MAX) NULL,
    points        DECIMAL(6,2)  NOT NULL DEFAULT 1,
    order_index   INT           NOT NULL,
    explanation   NVARCHAR(MAX) NULL,

    CONSTRAINT CK_quiz_questions_type
        CHECK (question_type IN
            ('SINGLE_CHOICE','MULTIPLE_CHOICE','FILL_IN_BLANK','PREDICT_OUTPUT')),
    CONSTRAINT CK_quiz_questions_points CHECK (points > 0),
    CONSTRAINT CK_quiz_questions_order CHECK (order_index > 0),
    CONSTRAINT UQ_quiz_questions_order UNIQUE (assessment_id, order_index),

    CONSTRAINT FK_quiz_questions_assessment
        FOREIGN KEY (assessment_id) REFERENCES assessments(assessment_id)
        ON DELETE CASCADE,
    CONSTRAINT FK_quiz_questions_lesson
        FOREIGN KEY (lesson_id) REFERENCES lessons(lesson_id)
);
GO

CREATE TABLE quiz_options (
    option_id    BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    question_id  BIGINT        NOT NULL,

    option_text  NVARCHAR(MAX) NOT NULL,
    is_correct   BIT           NOT NULL DEFAULT 0,
    explanation  NVARCHAR(MAX) NULL,
    order_index  INT           NOT NULL DEFAULT 1,

    CONSTRAINT CK_quiz_options_order CHECK (order_index > 0),
    CONSTRAINT UQ_quiz_options_order UNIQUE (question_id, order_index),
    CONSTRAINT FK_quiz_options_question
        FOREIGN KEY (question_id) REFERENCES quiz_questions(question_id)
        ON DELETE CASCADE
);
GO


/* ============================================================
   6. COMMERCE
   UC-10 Purchase Course, UC-11 Confirm Payment,
   UC-42 View Orders and Transactions
   ============================================================ */

CREATE TABLE vouchers (
    voucher_id          BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    code                VARCHAR(50)   NOT NULL UNIQUE,
    description         NVARCHAR(255) NULL,

    discount_percent    DECIMAL(5,2)  NULL,
    discount_amount     DECIMAL(12,2) NULL,
    min_order_amount    DECIMAL(12,2) NOT NULL DEFAULT 0,
    max_discount_amount DECIMAL(12,2) NULL,

    usage_limit         INT           NULL,
    used_count          INT           NOT NULL DEFAULT 0,

    created_by          BIGINT        NULL,
    starts_at           DATETIME2(3)  NULL,
    expires_at          DATETIME2(3)  NOT NULL,
    is_active           BIT           NOT NULL DEFAULT 1,
    created_at          DATETIME2(3)  NOT NULL DEFAULT SYSUTCDATETIME(),

    -- exactly one of the two discount kinds
    CONSTRAINT CK_vouchers_discount_kind
        CHECK ((discount_percent IS NOT NULL AND discount_amount IS NULL)
            OR (discount_percent IS NULL AND discount_amount IS NOT NULL)),
    CONSTRAINT CK_vouchers_percent
        CHECK (discount_percent IS NULL OR discount_percent BETWEEN 0.01 AND 100),
    CONSTRAINT CK_vouchers_amount
        CHECK (discount_amount IS NULL OR discount_amount >= 0),
    CONSTRAINT CK_vouchers_min_order CHECK (min_order_amount >= 0),
    CONSTRAINT CK_vouchers_max_discount
        CHECK (max_discount_amount IS NULL OR max_discount_amount >= 0),
    CONSTRAINT CK_vouchers_usage
        CHECK (used_count >= 0 AND (usage_limit IS NULL OR usage_limit > 0)),
    CONSTRAINT CK_vouchers_window
        CHECK (starts_at IS NULL OR expires_at > starts_at),

    CONSTRAINT FK_vouchers_created_by
        FOREIGN KEY (created_by) REFERENCES users(user_id)
);
GO

CREATE TABLE orders (
    order_id         BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    order_code       VARCHAR(50)   NOT NULL UNIQUE,
    student_id       BIGINT        NOT NULL,
    voucher_id       BIGINT        NULL,

    subtotal         DECIMAL(12,2) NOT NULL,
    discount_amount  DECIMAL(12,2) NOT NULL DEFAULT 0,
    tax_amount       DECIMAL(12,2) NOT NULL DEFAULT 0,
    total_amount     DECIMAL(12,2) NOT NULL,
    currency         VARCHAR(10)   NOT NULL DEFAULT 'VND',

    status           VARCHAR(20)   NOT NULL DEFAULT 'PENDING',
    payment_deadline DATETIME2(3)  NULL,

    billing_name     NVARCHAR(150) NULL,
    billing_email    VARCHAR(255)  NULL,
    billing_phone    VARCHAR(30)   NULL,
    note             NVARCHAR(500) NULL,

    created_at       DATETIME2(3)  NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at       DATETIME2(3)  NOT NULL DEFAULT SYSUTCDATETIME(),
    paid_at          DATETIME2(3)  NULL,
    cancelled_at     DATETIME2(3)  NULL,

    CONSTRAINT CK_orders_amounts
        CHECK (subtotal >= 0 AND discount_amount >= 0 AND tax_amount >= 0
               AND total_amount = subtotal - discount_amount + tax_amount
               AND total_amount >= 0),
    CONSTRAINT CK_orders_status
        CHECK (status IN ('PENDING','PAID','FAILED','CANCELLED','REFUNDED','EXPIRED')),
    CONSTRAINT CK_orders_paid_has_timestamp
        CHECK (status <> 'PAID' OR paid_at IS NOT NULL),

    CONSTRAINT FK_orders_student
        FOREIGN KEY (student_id) REFERENCES users(user_id),
    CONSTRAINT FK_orders_voucher
        FOREIGN KEY (voucher_id) REFERENCES vouchers(voucher_id)
);
GO

CREATE TABLE order_items (
    order_item_id BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    order_id      BIGINT        NOT NULL,
    course_id     BIGINT        NOT NULL,

    -- title and price are copied, not joined: an order must still read
    -- correctly after the course is renamed or repriced
    course_title  NVARCHAR(255) NOT NULL,
    unit_price    DECIMAL(12,2) NOT NULL,

    CONSTRAINT CK_order_items_price CHECK (unit_price >= 0),
    CONSTRAINT UQ_order_items_course UNIQUE (order_id, course_id),

    CONSTRAINT FK_order_items_order
        FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE,
    CONSTRAINT FK_order_items_course
        FOREIGN KEY (course_id) REFERENCES courses(course_id)
);
GO

CREATE TABLE payments (
    payment_id        BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    order_id          BIGINT        NOT NULL,

    transaction_code  VARCHAR(100)  NULL,
    payment_method    VARCHAR(50)   NOT NULL DEFAULT 'ZALOPAY_SANDBOX',
    amount            DECIMAL(12,2) NOT NULL,
    payment_status    VARCHAR(20)   NOT NULL DEFAULT 'PENDING',

    provider_response NVARCHAR(MAX) NULL,
    failure_reason    NVARCHAR(500) NULL,

    created_at        DATETIME2(3)  NOT NULL DEFAULT SYSUTCDATETIME(),
    paid_at           DATETIME2(3)  NULL,

    CONSTRAINT CK_payments_amount CHECK (amount >= 0),
    CONSTRAINT CK_payments_status
        CHECK (payment_status IN ('PENDING','SUCCESS','FAILED','REFUNDED')),

    CONSTRAINT FK_payments_order
        FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE
);
GO

-- a provider transaction code, when present, identifies exactly one payment
CREATE UNIQUE INDEX UX_payments_transaction_code
    ON payments(transaction_code)
    WHERE transaction_code IS NOT NULL;
GO


/* ============================================================
   7. ENROLLMENT AND PROGRESS
   UC-12 Set Course Learning Goal, UC-16 Study Course Lesson,
   UC-20 View Learning Progress and Results,
   UC-34 View Learner Progress and Results
   ============================================================ */

CREATE TABLE enrollments (
    enrollment_id    BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    student_id       BIGINT        NOT NULL,
    course_id        BIGINT        NOT NULL,
    order_item_id    BIGINT        NULL,

    /* UC-12. V5 kept the goal as free text on the learning path, which is both
       the wrong place (the goal is an input to path generation, not an output)
       and the wrong shape (a rule engine cannot read prose). */
    learning_goal    VARCHAR(30)   NOT NULL DEFAULT 'COMPLETE_COURSE',
    target_skill_id  BIGINT        NULL,      -- only for MASTER_SPECIFIC_SKILL
    goal_set_at      DATETIME2(3)  NULL,

    status           VARCHAR(20)   NOT NULL DEFAULT 'ACTIVE',
    progress_percent DECIMAL(5,2)  NOT NULL DEFAULT 0,

    enrolled_at      DATETIME2(3)  NOT NULL DEFAULT SYSUTCDATETIME(),
    completed_at     DATETIME2(3)  NULL,
    expires_at       DATETIME2(3)  NULL,

    CONSTRAINT CK_enrollments_status
        CHECK (status IN ('ACTIVE','COMPLETED','SUSPENDED','EXPIRED')),
    CONSTRAINT CK_enrollments_progress
        CHECK (progress_percent BETWEEN 0 AND 100),
    CONSTRAINT CK_enrollments_goal
        CHECK (learning_goal IN
            ('COMPLETE_COURSE','PASS_ASSESSMENTS','MASTER_SPECIFIC_SKILL','REFRESH_BASICS')),
    CONSTRAINT CK_enrollments_target_skill
        CHECK ((learning_goal =  'MASTER_SPECIFIC_SKILL' AND target_skill_id IS NOT NULL)
            OR (learning_goal <> 'MASTER_SPECIFIC_SKILL' AND target_skill_id IS NULL)),
    CONSTRAINT CK_enrollments_completed
        CHECK (status <> 'COMPLETED' OR completed_at IS NOT NULL),

    CONSTRAINT UQ_enrollments_student_course UNIQUE (student_id, course_id),
    CONSTRAINT FK_enrollments_student
        FOREIGN KEY (student_id) REFERENCES users(user_id),
    CONSTRAINT FK_enrollments_course
        FOREIGN KEY (course_id) REFERENCES courses(course_id),
    CONSTRAINT FK_enrollments_order_item
        FOREIGN KEY (order_item_id) REFERENCES order_items(order_item_id),
    CONSTRAINT FK_enrollments_target_skill
        FOREIGN KEY (target_skill_id) REFERENCES skills(skill_id)
);
GO

/* The student is reached through the enrollment, so it is not repeated here. */
CREATE TABLE lesson_progress (
    progress_id      BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    enrollment_id    BIGINT        NOT NULL,
    lesson_id        BIGINT        NOT NULL,

    status           VARCHAR(20)   NOT NULL DEFAULT 'NOT_STARTED',
    progress_percent DECIMAL(5,2)  NOT NULL DEFAULT 0,
    last_position_seconds INT      NULL,

    first_started_at DATETIME2(3)  NULL,
    last_accessed_at DATETIME2(3)  NULL,
    completed_at     DATETIME2(3)  NULL,

    CONSTRAINT CK_lesson_progress_status
        CHECK (status IN ('NOT_STARTED','IN_PROGRESS','COMPLETED')),
    CONSTRAINT CK_lesson_progress_percent
        CHECK (progress_percent BETWEEN 0 AND 100),
    CONSTRAINT CK_lesson_progress_position
        CHECK (last_position_seconds IS NULL OR last_position_seconds >= 0),
    CONSTRAINT CK_lesson_progress_completed
        CHECK (status <> 'COMPLETED' OR completed_at IS NOT NULL),

    CONSTRAINT UQ_lesson_progress UNIQUE (enrollment_id, lesson_id),
    CONSTRAINT FK_lesson_progress_enrollment
        FOREIGN KEY (enrollment_id) REFERENCES enrollments(enrollment_id)
        ON DELETE CASCADE,
    CONSTRAINT FK_lesson_progress_lesson
        FOREIGN KEY (lesson_id) REFERENCES lessons(lesson_id)
);
GO


/* ============================================================
   8. SUBMISSIONS AND GRADING
   UC-18 Submit Course Quiz, UC-19 Submit Assignment,
   UC-20 View Learning Progress and Results,
   UC-29 Grade Assignment Submission
   ============================================================ */

CREATE TABLE assessment_submissions (
    submission_id     BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    assessment_id     BIGINT        NOT NULL,
    -- bound to the enrollment, not the raw user: a submission only exists
    -- inside a course the learner actually bought
    enrollment_id     BIGINT        NOT NULL,

    submission_number INT           NOT NULL,

    answer_text       NVARCHAR(MAX) NULL,
    file_url          VARCHAR(1000) NULL,
    file_name         NVARCHAR(255) NULL,

    status            VARCHAR(20)   NOT NULL DEFAULT 'DRAFT',
    started_at        DATETIME2(3)  NULL,
    saved_at          DATETIME2(3)  NOT NULL DEFAULT SYSUTCDATETIME(),
    submitted_at      DATETIME2(3)  NULL,

    score             DECIMAL(6,2)  NULL,
    is_passed         BIT           NULL,
    is_late           BIT           NOT NULL DEFAULT 0,

    -- UC-29: the Lecturer's grade and written feedback, read back by UC-20
    graded_by         BIGINT        NULL,
    graded_at         DATETIME2(3)  NULL,
    grading_feedback  NVARCHAR(MAX) NULL,

    created_at        DATETIME2(3)  NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at        DATETIME2(3)  NOT NULL DEFAULT SYSUTCDATETIME(),

    CONSTRAINT CK_submissions_number CHECK (submission_number > 0),
    CONSTRAINT CK_submissions_status
        CHECK (status IN ('DRAFT','SUBMITTED','GRADING','GRADED','RETURNED')),
    CONSTRAINT CK_submissions_score CHECK (score IS NULL OR score >= 0),
    CONSTRAINT CK_submissions_submitted
        CHECK (status = 'DRAFT' OR submitted_at IS NOT NULL),
    CONSTRAINT CK_submissions_graded
        CHECK (status <> 'GRADED'
               OR (score IS NOT NULL AND graded_at IS NOT NULL)),

    CONSTRAINT UQ_submissions_attempt
        UNIQUE (assessment_id, enrollment_id, submission_number),

    /* NO ACTION on purpose: graded work must not disappear when an assessment
       is deleted. Retire an assessment with status = 'DISABLED' instead. */
    CONSTRAINT FK_submissions_assessment
        FOREIGN KEY (assessment_id) REFERENCES assessments(assessment_id),
    CONSTRAINT FK_submissions_enrollment
        FOREIGN KEY (enrollment_id) REFERENCES enrollments(enrollment_id),
    CONSTRAINT FK_submissions_graded_by
        FOREIGN KEY (graded_by) REFERENCES users(user_id)
);
GO

CREATE TABLE assessment_answers (
    submission_id      BIGINT NOT NULL,
    question_id        BIGINT NOT NULL,

    selected_option_id BIGINT        NULL,
    answer_text        NVARCHAR(MAX) NULL,
    is_correct         BIT           NULL,
    earned_points      DECIMAL(6,2)  NOT NULL DEFAULT 0,

    PRIMARY KEY (submission_id, question_id),

    CONSTRAINT CK_assessment_answers_points CHECK (earned_points >= 0),

    CONSTRAINT FK_assessment_answers_submission
        FOREIGN KEY (submission_id) REFERENCES assessment_submissions(submission_id)
        ON DELETE CASCADE,
    CONSTRAINT FK_assessment_answers_question
        FOREIGN KEY (question_id) REFERENCES quiz_questions(question_id),
    CONSTRAINT FK_assessment_answers_option
        FOREIGN KEY (selected_option_id) REFERENCES quiz_options(option_id)
);
GO


/* ============================================================
   9. MASTERY AND PERSONALIZED LEARNING PATH
   UC-14 Generate Personalized Learning Path,
   UC-15 View Personalized Learning Path,
   UC-17 Update Personalized Learning Path

   Mastery is per enrollment because skills are per course.
   ============================================================ */

CREATE TABLE enrollment_skill_mastery (
    enrollment_id    BIGINT NOT NULL,
    skill_id         BIGINT NOT NULL,

    -- the BKT posterior P(L_n): a probability, not a percentage
    p_mastery        DECIMAL(6,5)  NOT NULL DEFAULT 0.10000,
    evidence_count   INT           NOT NULL DEFAULT 0,
    correct_count    INT           NOT NULL DEFAULT 0,

    last_assessed_at DATETIME2(3)  NULL,
    updated_at       DATETIME2(3)  NOT NULL DEFAULT SYSUTCDATETIME(),

    PRIMARY KEY (enrollment_id, skill_id),

    CONSTRAINT CK_mastery_probability CHECK (p_mastery BETWEEN 0 AND 1),
    CONSTRAINT CK_mastery_counts
        CHECK (evidence_count >= 0 AND correct_count BETWEEN 0 AND evidence_count),

    CONSTRAINT FK_mastery_enrollment
        FOREIGN KEY (enrollment_id) REFERENCES enrollments(enrollment_id)
        ON DELETE CASCADE,
    CONSTRAINT FK_mastery_skill
        FOREIGN KEY (skill_id) REFERENCES skills(skill_id)
);
GO

CREATE TABLE personalized_learning_paths (
    path_id           BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    enrollment_id     BIGINT        NOT NULL,
    version_number    INT           NOT NULL DEFAULT 1,

    status            VARCHAR(20)   NOT NULL DEFAULT 'ACTIVE',
    progress_percent  DECIMAL(5,2)  NOT NULL DEFAULT 0,

    -- UC-14 runs once after the entry test, UC-17 after each finished lesson
    generation_trigger VARCHAR(30)  NOT NULL,
    source_submission_id BIGINT     NULL,   -- the diagnostic or quiz behind it

    generated_by      VARCHAR(20)   NOT NULL DEFAULT 'AI',
    ai_model          VARCHAR(100)  NULL,
    ai_rationale      NVARCHAR(MAX) NULL,   -- shown to the learner by UC-15

    /* The cache key. The path is only regenerated when the mastery vector has
       moved far enough that this hash changes, instead of calling the model
       after every single lesson. */
    mastery_snapshot_hash VARCHAR(64) NULL,

    generated_at      DATETIME2(3)  NULL,
    superseded_at     DATETIME2(3)  NULL,
    created_at        DATETIME2(3)  NOT NULL DEFAULT SYSUTCDATETIME(),

    CONSTRAINT CK_paths_status
        CHECK (status IN ('ACTIVE','SUPERSEDED','COMPLETED','ARCHIVED')),
    CONSTRAINT CK_paths_progress CHECK (progress_percent BETWEEN 0 AND 100),
    CONSTRAINT CK_paths_generated_by
        CHECK (generated_by IN ('AI','LECTURER','SYSTEM')),
    CONSTRAINT CK_paths_trigger
        CHECK (generation_trigger IN
            ('DIAGNOSTIC_COMPLETED','LESSON_COMPLETED','GOAL_CHANGED','MANUAL')),
    CONSTRAINT CK_paths_version CHECK (version_number > 0),
    CONSTRAINT CK_paths_superseded
        CHECK (status <> 'SUPERSEDED' OR superseded_at IS NOT NULL),

    CONSTRAINT UQ_paths_enrollment_version UNIQUE (enrollment_id, version_number),
    CONSTRAINT FK_paths_enrollment
        FOREIGN KEY (enrollment_id) REFERENCES enrollments(enrollment_id)
        ON DELETE CASCADE,
    CONSTRAINT FK_paths_source_submission
        FOREIGN KEY (source_submission_id)
        REFERENCES assessment_submissions(submission_id)
);
GO

-- one live path per enrollment; older versions stay for the audit trail
CREATE UNIQUE INDEX UX_paths_active_per_enrollment
    ON personalized_learning_paths(enrollment_id)
    WHERE status = 'ACTIVE';
GO

CREATE TABLE path_items (
    path_item_id      BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    path_id           BIGINT        NOT NULL,
    lesson_id         BIGINT        NOT NULL,

    sequence_order    INT           NOT NULL,
    status            VARCHAR(20)   NOT NULL DEFAULT 'AVAILABLE',
    is_required       BIT           NOT NULL DEFAULT 1,

    -- why the AI placed this lesson here, in plain language for the learner
    ai_reason         NVARCHAR(MAX) NULL,
    estimated_minutes INT           NULL,

    available_at      DATETIME2(3)  NULL,
    started_at        DATETIME2(3)  NULL,
    completed_at      DATETIME2(3)  NULL,

    CONSTRAINT CK_path_items_order CHECK (sequence_order > 0),
    CONSTRAINT CK_path_items_status
        CHECK (status IN ('LOCKED','AVAILABLE','IN_PROGRESS','COMPLETED','SKIPPED')),
    CONSTRAINT CK_path_items_estimate
        CHECK (estimated_minutes IS NULL OR estimated_minutes >= 0),

    CONSTRAINT UQ_path_items_sequence UNIQUE (path_id, sequence_order),
    CONSTRAINT UQ_path_items_lesson UNIQUE (path_id, lesson_id),
    CONSTRAINT FK_path_items_path
        FOREIGN KEY (path_id) REFERENCES personalized_learning_paths(path_id)
        ON DELETE CASCADE,
    CONSTRAINT FK_path_items_lesson
        FOREIGN KEY (lesson_id) REFERENCES lessons(lesson_id)
);
GO


/* ============================================================
   10. INTERACTION
   UC-21 Post Course Question, UC-30 Answer Course Question,
   UC-22 Submit Course Review, UC-31 Respond to Course Review
   ============================================================ */

/* One threaded table instead of V5's separate lesson_comments and
   assessment_comments. lesson_id is optional, so a question may be asked about
   the course as a whole - which UC-21 allows and V5 could not store. A
   Lecturer's answer (UC-30) is a child row. */
CREATE TABLE course_discussions (
    discussion_id     BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    course_id         BIGINT        NOT NULL,
    lesson_id         BIGINT        NULL,
    parent_id         BIGINT        NULL,

    author_id         BIGINT        NOT NULL,
    body              NVARCHAR(MAX) NOT NULL,
    is_resolved       BIT           NOT NULL DEFAULT 0,
    is_hidden         BIT           NOT NULL DEFAULT 0,

    created_at        DATETIME2(3)  NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at        DATETIME2(3)  NULL,

    -- only a thread root can be marked resolved
    CONSTRAINT CK_discussions_resolved
        CHECK (is_resolved = 0 OR parent_id IS NULL),

    CONSTRAINT FK_discussions_course
        FOREIGN KEY (course_id) REFERENCES courses(course_id),
    CONSTRAINT FK_discussions_lesson
        FOREIGN KEY (lesson_id) REFERENCES lessons(lesson_id),
    CONSTRAINT FK_discussions_parent
        FOREIGN KEY (parent_id) REFERENCES course_discussions(discussion_id),
    CONSTRAINT FK_discussions_author
        FOREIGN KEY (author_id) REFERENCES users(user_id)
);
GO

CREATE TABLE course_reviews (
    review_id        BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    course_id        BIGINT        NOT NULL,
    enrollment_id    BIGINT        NOT NULL,

    rating           TINYINT       NOT NULL,
    review_text      NVARCHAR(MAX) NULL,

    -- UC-31 Respond to Course Review: a reply column beats a whole table for
    -- a strictly one-per-review answer
    lecturer_reply   NVARCHAR(MAX) NULL,
    replied_by       BIGINT        NULL,
    replied_at       DATETIME2(3)  NULL,

    is_visible       BIT           NOT NULL DEFAULT 1,
    created_at       DATETIME2(3)  NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at       DATETIME2(3)  NULL,

    CONSTRAINT CK_course_reviews_rating CHECK (rating BETWEEN 1 AND 5),
    CONSTRAINT CK_course_reviews_reply
        CHECK (lecturer_reply IS NULL
               OR (replied_by IS NOT NULL AND replied_at IS NOT NULL)),

    -- one review per enrollment, so only someone who bought the course reviews it
    CONSTRAINT UQ_course_reviews_enrollment UNIQUE (enrollment_id),
    CONSTRAINT FK_course_reviews_course
        FOREIGN KEY (course_id) REFERENCES courses(course_id),
    CONSTRAINT FK_course_reviews_enrollment
        FOREIGN KEY (enrollment_id) REFERENCES enrollments(enrollment_id),
    CONSTRAINT FK_course_reviews_replied_by
        FOREIGN KEY (replied_by) REFERENCES users(user_id)
);
GO


/* ============================================================
   11. AI INTERACTION LOG
   UC-23 Ask AI Learning Assistant, plus an audit trail for every
   model call the platform makes (UC-14, UC-17, UC-26)
   ============================================================ */

CREATE TABLE ai_interaction_logs (
    log_id        BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,

    user_id       BIGINT        NULL,      -- null for background extraction
    enrollment_id BIGINT        NULL,
    course_id     BIGINT        NULL,
    lesson_id     BIGINT        NULL,
    path_id       BIGINT        NULL,

    request_type  VARCHAR(40)   NOT NULL,
    model         VARCHAR(100)  NULL,
    user_prompt   NVARCHAR(MAX) NULL,
    ai_response   NVARCHAR(MAX) NULL,

    -- cost and latency, so the report can quantify the AI usage
    prompt_tokens     INT          NULL,
    completion_tokens INT          NULL,
    latency_ms        INT          NULL,
    is_success        BIT          NOT NULL DEFAULT 1,
    error_message     NVARCHAR(500) NULL,

    created_at    DATETIME2(3)  NOT NULL DEFAULT SYSUTCDATETIME(),

    CONSTRAINT CK_ai_logs_request_type
        CHECK (request_type IN
            ('EXTRACT_KNOWLEDGE_MAP','GENERATE_PATH','UPDATE_PATH',
             'ASK_ASSISTANT','EXPLAIN_LESSON','OTHER')),
    CONSTRAINT CK_ai_logs_tokens
        CHECK ((prompt_tokens IS NULL OR prompt_tokens >= 0)
           AND (completion_tokens IS NULL OR completion_tokens >= 0)),
    CONSTRAINT CK_ai_logs_latency
        CHECK (latency_ms IS NULL OR latency_ms >= 0),

    CONSTRAINT FK_ai_logs_user
        FOREIGN KEY (user_id) REFERENCES users(user_id),
    CONSTRAINT FK_ai_logs_enrollment
        FOREIGN KEY (enrollment_id) REFERENCES enrollments(enrollment_id),
    CONSTRAINT FK_ai_logs_course
        FOREIGN KEY (course_id) REFERENCES courses(course_id),
    CONSTRAINT FK_ai_logs_lesson
        FOREIGN KEY (lesson_id) REFERENCES lessons(lesson_id),
    CONSTRAINT FK_ai_logs_path
        FOREIGN KEY (path_id) REFERENCES personalized_learning_paths(path_id)
);
GO


/* ============================================================
   12. INDEXES
   Driven by the queries the use cases actually run.
   ============================================================ */

-- UC-03 Search Published Courses: the catalogue always filters on status
CREATE INDEX IX_courses_status_level ON courses(status, level)
    INCLUDE (title, price, thumbnail_url);
CREATE INDEX IX_courses_lecturer ON courses(lecturer_id);

CREATE INDEX IX_chapters_course ON chapters(course_id);
CREATE INDEX IX_lessons_chapter ON lessons(chapter_id);
CREATE INDEX IX_lesson_materials_lesson ON lesson_materials(lesson_id);

CREATE INDEX IX_skills_course ON skills(course_id);
CREATE INDEX IX_skill_prerequisites_required ON skill_prerequisites(prerequisite_skill_id);
CREATE INDEX IX_lesson_skills_skill ON lesson_skills(skill_id);

CREATE INDEX IX_assessments_course ON assessments(course_id);
CREATE INDEX IX_assessments_lesson ON assessments(lesson_id);
CREATE INDEX IX_quiz_questions_assessment ON quiz_questions(assessment_id);
CREATE INDEX IX_quiz_questions_lesson ON quiz_questions(lesson_id);
CREATE INDEX IX_quiz_options_question ON quiz_options(question_id);

CREATE INDEX IX_submissions_enrollment ON assessment_submissions(enrollment_id);
CREATE INDEX IX_submissions_assessment ON assessment_submissions(assessment_id);
-- UC-29: the Lecturer's grading queue
CREATE INDEX IX_submissions_grading_queue ON assessment_submissions(status, submitted_at)
    WHERE status IN ('SUBMITTED','GRADING');

CREATE INDEX IX_enrollments_student ON enrollments(student_id);
CREATE INDEX IX_enrollments_course ON enrollments(course_id);
CREATE INDEX IX_lesson_progress_enrollment ON lesson_progress(enrollment_id);
CREATE INDEX IX_lesson_progress_lesson ON lesson_progress(lesson_id);

CREATE INDEX IX_mastery_skill ON enrollment_skill_mastery(skill_id);
CREATE INDEX IX_paths_enrollment ON personalized_learning_paths(enrollment_id);
CREATE INDEX IX_path_items_path ON path_items(path_id, sequence_order);
CREATE INDEX IX_path_items_lesson ON path_items(lesson_id);

CREATE INDEX IX_orders_student ON orders(student_id);
CREATE INDEX IX_orders_status_created ON orders(status, created_at);
CREATE INDEX IX_order_items_course ON order_items(course_id);
CREATE INDEX IX_payments_order ON payments(order_id);

CREATE INDEX IX_discussions_course ON course_discussions(course_id, created_at);
CREATE INDEX IX_discussions_lesson ON course_discussions(lesson_id);
CREATE INDEX IX_discussions_parent ON course_discussions(parent_id);
CREATE INDEX IX_course_reviews_course ON course_reviews(course_id, is_visible);

CREATE INDEX IX_publication_requests_course ON course_publication_requests(course_id);
CREATE INDEX IX_publication_requests_queue ON course_publication_requests(status, requested_at);

CREATE INDEX IX_ai_logs_user ON ai_interaction_logs(user_id, created_at);
CREATE INDEX IX_ai_logs_type ON ai_interaction_logs(request_type, created_at);
GO


/* ============================================================
   13. REPORTING VIEWS
   UC-43 View Administration Dashboard, UC-20 / UC-34 progress.
   Kept as views so the counters can never drift, unlike V5's
   denormalised courses.total_lessons.
   ============================================================ */

CREATE VIEW vw_course_stats AS
SELECT
    c.course_id,
    c.title,
    c.status,
    c.price,
    (SELECT COUNT(*) FROM chapters ch
        JOIN lessons l ON l.chapter_id = ch.chapter_id
        WHERE ch.course_id = c.course_id)                        AS total_lessons,
    (SELECT ISNULL(SUM(l.duration_minutes), 0) FROM chapters ch
        JOIN lessons l ON l.chapter_id = ch.chapter_id
        WHERE ch.course_id = c.course_id)                        AS total_duration_minutes,
    (SELECT COUNT(*) FROM enrollments e
        WHERE e.course_id = c.course_id)                         AS total_enrollments,
    (SELECT AVG(CAST(r.rating AS DECIMAL(4,2))) FROM course_reviews r
        WHERE r.course_id = c.course_id AND r.is_visible = 1)    AS average_rating
FROM courses c;
GO

CREATE VIEW vw_enrollment_progress AS
SELECT
    e.enrollment_id,
    e.student_id,
    e.course_id,
    e.learning_goal,
    e.status,
    COUNT(lp.progress_id)                                        AS lessons_touched,
    SUM(CASE WHEN lp.status = 'COMPLETED' THEN 1 ELSE 0 END)     AS lessons_completed,
    (SELECT AVG(m.p_mastery) FROM enrollment_skill_mastery m
        WHERE m.enrollment_id = e.enrollment_id)                 AS average_mastery
FROM enrollments e
LEFT JOIN lesson_progress lp ON lp.enrollment_id = e.enrollment_id
GROUP BY e.enrollment_id, e.student_id, e.course_id, e.learning_goal, e.status;
GO


/* ============================================================
   14. VERIFICATION
   ============================================================ */

DECLARE @tables INT, @views INT;
SELECT @tables = COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE';
SELECT @views  = COUNT(*) FROM INFORMATION_SCHEMA.VIEWS;

SELECT
    @tables AS TotalTables,
    CASE WHEN @tables = 28 THEN 'PASS' ELSE 'CHECK' END AS TableCountStatus,
    @views  AS TotalViews,
    CASE WHEN @views  = 2  THEN 'PASS' ELSE 'CHECK' END AS ViewCountStatus;
GO

SELECT TABLE_NAME
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_TYPE = 'BASE TABLE'
ORDER BY TABLE_NAME;
GO

SELECT
    OBJECT_NAME(fk.parent_object_id)                            AS ChildTable,
    COL_NAME(fkc.parent_object_id, fkc.parent_column_id)        AS ChildColumn,
    OBJECT_NAME(fk.referenced_object_id)                        AS ParentTable,
    COL_NAME(fkc.referenced_object_id, fkc.referenced_column_id) AS ParentColumn,
    fk.delete_referential_action_desc                           AS OnDelete
FROM sys.foreign_keys fk
JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
ORDER BY ChildTable, ChildColumn;
GO
