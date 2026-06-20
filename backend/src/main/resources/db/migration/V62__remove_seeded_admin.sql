-- Retire the source-committed seed admin account. V2/V4/V5 inserted (and
-- force-reset on every deploy) an 'admin' member whose BCrypt hash is public in
-- the repo — a standing backdoor. Real admins exist independently (a dedicated
-- admin plus promotable student accounts), so removing the seed cannot lock the
-- org out. The DELETE is conditioned on the committed hash, so it only removes
-- the known-insecure seed and leaves the row untouched if its password was ever
-- rotated. No table has a FK to members, so this is a safe standalone delete.
DELETE FROM members
WHERE student_id = 'admin'
  AND password = '$2a$12$9D.ha5zCP2Nr0GWYORU8q.i2hEy/0aVWzrR0jxdSco8jmm.SNL5Qy';
