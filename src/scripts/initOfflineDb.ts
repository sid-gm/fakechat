import { initializeHistoryDatabase } from "../storage/sqlite";

const dbPath = initializeHistoryDatabase();

console.log(`[offline-db] SQLite history database ready at: ${dbPath}`);





