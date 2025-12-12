let schemaInitialized = false;

export async function ensureSchema(db) {
  if (schemaInitialized) return;
  try {
    await db.prepare("PRAGMA foreign_keys = ON;").run();

    await db.batch([
      db.prepare(`CREATE TABLE IF NOT EXISTS admins (
            id INTEGER PRIMARY KEY,
            email TEXT UNIQUE,
            password_hash TEXT,
            created_at TEXT
        )`),

      db.prepare(`CREATE TABLE IF NOT EXISTS subjects (
          id INTEGER PRIMARY KEY,
          admin_id INTEGER,
          full_name TEXT,
          alias TEXT,
          dob TEXT,
          age INTEGER,
          gender TEXT,
          occupation TEXT,
          nationality TEXT,
          ideology TEXT,
          location TEXT,
          contact TEXT,
          hometown TEXT,
          previous_locations TEXT,
          modus_operandi TEXT,
          notes TEXT,
          weakness TEXT,
          avatar_path TEXT,
          is_archived INTEGER DEFAULT 0,
          status TEXT DEFAULT 'Active',
          threat_level TEXT DEFAULT 'Low',
          last_sighted TEXT,
          height TEXT,
          weight TEXT,
          eye_color TEXT,
          hair_color TEXT,
          blood_type TEXT,
          identifying_marks TEXT,
          social_links TEXT,
          digital_identifiers TEXT,
          created_at TEXT,
          updated_at TEXT
        )`),

      db.prepare(`CREATE TABLE IF NOT EXISTS subject_intel (
          id INTEGER PRIMARY KEY,
          subject_id INTEGER,
          category TEXT,
          label TEXT,
          value TEXT,
          analysis TEXT,
          confidence INTEGER DEFAULT 100,
          source TEXT,
          created_at TEXT
        )`),

      db.prepare(`CREATE TABLE IF NOT EXISTS subject_media (
          id INTEGER PRIMARY KEY,
          subject_id INTEGER,
          object_key TEXT,
          content_type TEXT,
          description TEXT,
          media_type TEXT DEFAULT 'file',
          external_url TEXT,
          created_at TEXT
        )`),

      db.prepare(`CREATE TABLE IF NOT EXISTS subject_relationships (
          id INTEGER PRIMARY KEY,
          subject_a_id INTEGER,
          subject_b_id INTEGER,
          relationship_type TEXT,
          role_b TEXT,
          notes TEXT,
          custom_name TEXT,
          custom_avatar TEXT,
          custom_notes TEXT,
          created_at TEXT
        )`),

      db.prepare(`CREATE TABLE IF NOT EXISTS subject_interactions (
            id INTEGER PRIMARY KEY,
            subject_id INTEGER,
            date TEXT,
            type TEXT,
            transcript TEXT,
            conclusion TEXT,
            evidence_url TEXT,
            created_at TEXT
        )`),

      db.prepare(`CREATE TABLE IF NOT EXISTS subject_locations (
            id INTEGER PRIMARY KEY,
            subject_id INTEGER,
            name TEXT,
            address TEXT,
            lat REAL,
            lng REAL,
            type TEXT,
            notes TEXT,
            created_at TEXT
        )`),

      db.prepare(`CREATE TABLE IF NOT EXISTS subject_shares (
          id INTEGER PRIMARY KEY,
          subject_id INTEGER REFERENCES subjects(id),
          token TEXT UNIQUE,
          is_active INTEGER DEFAULT 1,
          duration_seconds INTEGER,
          views INTEGER DEFAULT 0,
          started_at TEXT,
          created_at TEXT
        )`)
    ]);

    try {
      await db.prepare("ALTER TABLE subject_relationships ADD COLUMN role_b TEXT").run();
    } catch (e) {
      // Ignore error if column already exists
    }

    schemaInitialized = true;
  } catch (err) {
    console.error("Init Error", err);
  }
}

export async function nukeDatabase(db) {
  const tables = [
    'subject_shares', 'subject_locations', 'subject_interactions',
    'subject_relationships', 'subject_media', 'subject_intel',
    'subjects', 'admins'
  ];

  await db.prepare("PRAGMA foreign_keys = OFF;").run();
  for (const t of tables) {
    try { await db.prepare(`DROP TABLE IF EXISTS ${t}`).run(); } catch (e) { console.error(`Failed to drop ${t}`, e); }
  }
  await db.prepare("PRAGMA foreign_keys = ON;").run();
  schemaInitialized = false;
  return true;
}

export function resetSchemaFlag() {
  schemaInitialized = false;
}
