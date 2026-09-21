-- ============================================================
-- CODI - Database seed data
-- Idempotent: safe to apply multiple times
-- ============================================================

SET TIME ZONE 'UTC';

-- Insert the three core roles (idempotent with ON CONFLICT DO NOTHING)
INSERT INTO roles (role_id, role_name) VALUES
    ('LEARNER',  'Learner'),
    ('LECTURER', 'Lecturer'),
    ('ADMIN',    'Admin')
ON CONFLICT (role_id) DO NOTHING;

-- Note: An admin user account would be created via the application's
-- registration/user management interface, not in the seed script.
-- This seed ensures the three role records exist for FK relationships.
