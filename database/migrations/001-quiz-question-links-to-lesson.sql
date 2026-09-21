/* ============================================================
   Migration 001 - a quiz question points at a lesson, not a skill

   Feedback: the quiz table should hang off the lesson table rather than
   off skills. quiz_questions.skill_id also let a question be tagged with
   a skill belonging to some other lesson, which nothing prevented.

   After this, concepts are declared in exactly one place - on the lesson,
   through lesson_skills - and a question reaches them as:

       quiz_questions -> lessons -> lesson_skills -> skills

   lesson_id stays nullable. A lesson quiz can leave it empty because the
   lesson is already on the assessment; the diagnostic needs it, because a
   course-level entry test has no lesson of its own.

   Safe to run on a database that already holds data: the dropped column
   was nullable and unused.
   ============================================================ */

USE Codi;
GO

IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_quiz_questions_skill')
    ALTER TABLE quiz_questions DROP CONSTRAINT FK_quiz_questions_skill;
GO

IF EXISTS (SELECT 1 FROM sys.indexes
           WHERE name = 'IX_quiz_questions_skill'
             AND object_id = OBJECT_ID('quiz_questions'))
    DROP INDEX IX_quiz_questions_skill ON quiz_questions;
GO

IF EXISTS (SELECT 1 FROM sys.columns
           WHERE name = 'skill_id' AND object_id = OBJECT_ID('quiz_questions'))
    ALTER TABLE quiz_questions DROP COLUMN skill_id;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns
               WHERE name = 'lesson_id' AND object_id = OBJECT_ID('quiz_questions'))
    ALTER TABLE quiz_questions ADD lesson_id BIGINT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_quiz_questions_lesson')
    ALTER TABLE quiz_questions ADD CONSTRAINT FK_quiz_questions_lesson
        FOREIGN KEY (lesson_id) REFERENCES lessons(lesson_id);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes
               WHERE name = 'IX_quiz_questions_lesson'
                 AND object_id = OBJECT_ID('quiz_questions'))
    CREATE INDEX IX_quiz_questions_lesson ON quiz_questions(lesson_id);
GO

SELECT
    (SELECT COUNT(*) FROM sys.columns
      WHERE object_id = OBJECT_ID('quiz_questions') AND name = 'lesson_id') AS HasLessonId,
    (SELECT COUNT(*) FROM sys.columns
      WHERE object_id = OBJECT_ID('quiz_questions') AND name = 'skill_id')  AS HasSkillId,
    (SELECT COUNT(*) FROM sys.foreign_keys
      WHERE name = 'FK_quiz_questions_lesson')                              AS HasLessonFk;
GO
