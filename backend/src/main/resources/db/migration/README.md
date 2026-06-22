# Flyway Migration Guidelines

PostgreSQL schema is managed exclusively through the versioned Flyway migrations
in this directory (`V<n>__<description>.sql`).

## Rules

1. **Never edit an already-applied migration.** Flyway records a checksum for
   every applied script. Editing `V2`/`V8`/`V12`/`V55` (or any other migration
   that has run in production) changes its checksum and breaks startup against
   existing databases. Fix or extend the schema with a **new forward migration**
   using the next version number instead.

2. **Keep DDL and seed data in separate migrations.** Several early migrations
   mix schema (`CREATE TABLE`, `ALTER TABLE`, `CREATE INDEX`) with seed/data
   `INSERT`s — for example:
   - `V2__insert_admin.sql`, `V8__seed_initial_member.sql`,
     `V12__seed_eligible_member.sql`, `V55__seed_member_app_and_rusty_alarm.sql`.

   These are **historical and must not be rewritten** (see rule 1). Going
   forward, structural changes (DDL) and data seeding (DML/seed) must live in
   **distinct migration files** so that schema history stays auditable and seed
   data can be reasoned about independently. Name DDL migrations after the
   structure they change and seed migrations with a `seed_` prefix.

3. **Use `IF NOT EXISTS` for additive index/table DDL** where possible so a
   migration is safe to re-derive against partially-provisioned environments.

4. The `created_at` ordering index on `community_posts` already exists
   (`idx_community_posts_created_at`, V6); `community_comments` gained its
   matching `created_at` index in `V73`.
