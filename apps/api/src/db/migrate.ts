import { createDatabase } from './client.js';
const database = createDatabase({
  DB_PATH: process.env.DB_PATH ?? './data/my-savings.sqlite',
});

try {
  console.info('Database migrations applied');
} finally {
  database.sqlite.close();
}
