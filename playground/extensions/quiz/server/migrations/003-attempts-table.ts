import { defineMigration } from '#modular'

/**
 * Creates a table through the `db` the module puts in every migration context
 * (`modular.database`). Plain portable SQL runs on SQLite, MySQL and PostgreSQL;
 * `dialect` is there for the rare statement that differs.
 */
export default defineMigration({
  async up({ db }) {
    await db.exec(
      'CREATE TABLE IF NOT EXISTS quiz_attempts (id VARCHAR(64) NOT NULL PRIMARY KEY, course_id VARCHAR(64) NOT NULL, score INT NOT NULL, created_at BIGINT NOT NULL)',
    )
  },
  async down({ db }) {
    await db.exec('DROP TABLE IF EXISTS quiz_attempts')
  },
})
