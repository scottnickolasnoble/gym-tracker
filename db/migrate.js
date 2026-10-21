// Creates/updates the tables and loads the exercise library.
// Runs automatically every time the server starts, and can be run by hand: npm run db:migrate
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { withTransaction } = require('./pool');
const { seedLibrary } = require('./seed');

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await withTransaction(async (client) => {
    await client.query(sql);
    await seedLibrary(client);
  });
}

module.exports = { migrate };

// Allow "node db/migrate.js" on its own.
if (require.main === module) {
  migrate()
    .then(() => { console.log('Database is up to date.'); process.exit(0); })
    .catch((err) => { console.error(err); process.exit(1); });
}
