export class Database {
  constructor(db) {
    this.db = db;
  }

  async ensureSchema() {
    try { await this.db.prepare("PRAGMA foreign_keys = ON;").run(); } catch (e) {}

    const statements = [
      `CREATE TABLE IF NOT EXISTS admins (id INTEGER PRIMARY KEY, email TEXT UNIQUE, password_hash TEXT, created_at TEXT)`,
      `CREATE TABLE IF NOT EXISTS subjects (id INTEGER PRIMARY KEY, admin_id INTEGER, full_name TEXT, alias TEXT, dob TEXT, age INTEGER, gender TEXT, sex TEXT, occupation TEXT, nationality TEXT, ideology TEXT, religion TEXT, location TEXT, contact TEXT, hometown TEXT, previous_locations TEXT, modus_operandi TEXT, notes TEXT, weakness TEXT, avatar_path TEXT, is_archived INTEGER DEFAULT 0, status TEXT DEFAULT 'Active', threat_level TEXT DEFAULT 'Low', last_sighted TEXT, height TEXT, weight TEXT, eye_color TEXT, hair_color TEXT, blood_type TEXT, identifying_marks TEXT, social_links TEXT, digital_identifiers TEXT, created_at TEXT, updated_at TEXT)`,
      `CREATE TABLE IF NOT EXISTS subject_intel (id INTEGER PRIMARY KEY, subject_id INTEGER, category TEXT, label TEXT, value TEXT, analysis TEXT, confidence INTEGER DEFAULT 100, source TEXT, created_at TEXT)`,
      `CREATE TABLE IF NOT EXISTS subject_media (id INTEGER PRIMARY KEY, subject_id INTEGER, object_key TEXT, content_type TEXT, description TEXT, media_type TEXT DEFAULT 'file', external_url TEXT, created_at TEXT)`,
      `CREATE TABLE IF NOT EXISTS subject_relationships (id INTEGER PRIMARY KEY, subject_a_id INTEGER, subject_b_id INTEGER, relationship_type TEXT, notes TEXT, custom_name TEXT, custom_avatar TEXT, custom_notes TEXT, created_at TEXT)`,
      `CREATE TABLE IF NOT EXISTS subject_interactions (id INTEGER PRIMARY KEY, subject_id INTEGER, date TEXT, type TEXT, transcript TEXT, conclusion TEXT, evidence_url TEXT, created_at TEXT)`,
      `CREATE TABLE IF NOT EXISTS subject_locations (id INTEGER PRIMARY KEY, subject_id INTEGER, name TEXT, address TEXT, lat REAL, lng REAL, type TEXT, notes TEXT, created_at TEXT)`,
      `CREATE TABLE IF NOT EXISTS subject_shares (id INTEGER PRIMARY KEY, subject_id INTEGER REFERENCES subjects(id), token TEXT UNIQUE, is_active INTEGER DEFAULT 1, duration_seconds INTEGER, views INTEGER DEFAULT 0, started_at TEXT, created_at TEXT)`
    ];

    for (const stmt of statements) {
      try { await this.db.prepare(stmt).run(); } catch (e) { /* Ignore exists errors */ }
    }

    await this.ensureShareMigrations();
    await this.ensureSubjectMigrations();
  }

  async nuke() {
    const tables = ['subject_shares', 'subject_locations', 'subject_interactions', 'subject_relationships', 'subject_media', 'subject_intel', 'subjects', 'admins'];
    await this.db.prepare("PRAGMA foreign_keys = OFF;").run();
    for (const t of tables) {
      try { await this.db.prepare(`DROP TABLE IF EXISTS ${t}`).run(); } catch (e) {}
    }
    await this.db.prepare("PRAGMA foreign_keys = ON;").run();
    await this.ensureSchema();
  }

  async ensureShareMigrations() {
    try {
      const info = await this.db.prepare("PRAGMA table_info('subject_shares')").all();
      const cols = new Set((info?.results || []).map((c) => c.name));

      const maybeAddColumn = async (name, ddl) => {
        if (!cols.has(name)) {
          try {
            await this.db.prepare(ddl).run();
          } catch (e) {
            console.warn(`Migration skipped for ${name}:`, e?.message || e);
          }
        }
      };

      await maybeAddColumn('views', 'ALTER TABLE subject_shares ADD COLUMN views INTEGER DEFAULT 0');
      await maybeAddColumn('started_at', 'ALTER TABLE subject_shares ADD COLUMN started_at TEXT');
      await maybeAddColumn('duration_seconds', 'ALTER TABLE subject_shares ADD COLUMN duration_seconds INTEGER');
      await maybeAddColumn('is_active', 'ALTER TABLE subject_shares ADD COLUMN is_active INTEGER DEFAULT 1');
      await maybeAddColumn('created_at', 'ALTER TABLE subject_shares ADD COLUMN created_at TEXT');
    } catch (e) {
      console.warn('Share table migration check failed:', e?.message || e);
    }
  }

  async ensureSubjectMigrations() {
    try {
      const info = await this.db.prepare("PRAGMA table_info('subjects')").all();
      const cols = new Set((info?.results || []).map((c) => c.name));
      if (!cols.has('sex')) {
        try {
          await this.db.prepare('ALTER TABLE subjects ADD COLUMN sex TEXT').run();
        } catch (e) {
          console.warn('Sex column migration skipped:', e?.message || e);
        }
      }
      if (!cols.has('religion')) {
        try {
          await this.db.prepare('ALTER TABLE subjects ADD COLUMN religion TEXT').run();
        } catch (e) {
          console.warn('Religion column migration skipped:', e?.message || e);
        }
      }
    } catch (e) {
      console.warn('Subject table migration check failed:', e?.message || e);
    }
  }
}
