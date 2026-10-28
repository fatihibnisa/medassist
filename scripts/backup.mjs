// Consistent backup without the sqlite3 CLI (works on Windows and in the Docker image):
//   node scripts/backup.mjs [dataDir] [backupDir]
// Restore: stop the server, copy medassist-<stamp>.db to <dataDir>/medassist.db and uploads-<stamp>/ to <dataDir>/uploads/, start the server.
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const dataDir = path.resolve(process.argv[2] || process.env.DATA_DIR || './data');
const dest = path.resolve(process.argv[3] || process.env.BACKUP_DIR || './backups');
const d = new Date();
const stamp = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + '-' + String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0') + String(d.getSeconds()).padStart(2, '0');
fs.mkdirSync(dest, { recursive: true });
const dbOut = path.join(dest, 'medassist-' + stamp + '.db');
const db = new DatabaseSync(path.join(dataDir, 'medassist.db'));
db.exec("VACUUM INTO '" + dbOut.replace(/'/g, "''") + "'"); // a transactionally consistent copy, safe while the server runs
db.close();
const up = path.join(dataDir, 'uploads');
if (fs.existsSync(up)) fs.cpSync(up, path.join(dest, 'uploads-' + stamp), { recursive: true });
// Keep 30 days of backups.
const cutoff = Date.now() - 30 * 86400000;
for (const f of fs.readdirSync(dest)) { const p = path.join(dest, f); if (fs.statSync(p).mtimeMs < cutoff) fs.rmSync(p, { recursive: true, force: true }); }
console.log('Zaxira tayyor: ' + dbOut);
