
import 'dotenv/config';
import { FalkorDB } from 'falkordb';

const {
  FALKORDB_HOST,
  FALKORDB_PORT,
  FALKORDB_USERNAME,
  FALKORDB_PASSWORD,
  FALKORDB_TLS = 'true',
  FALKORDB_GRAPH = 'orgingraphs_test',
} = process.env;

if (!FALKORDB_HOST || !FALKORDB_PASSWORD) {
  throw new Error('Missing FalkorDB host or password in .env');
}

let db;

try {
  db = await FalkorDB.connect({
    socket: {
      host: FALKORDB_HOST,
      port: Number(FALKORDB_PORT || 6379),
      tls: FALKORDB_TLS === 'true',
      connectTimeout: 10000,
    },
    ...(FALKORDB_USERNAME
      ? { username: FALKORDB_USERNAME }
      : {}),
    password: FALKORDB_PASSWORD,
  });

  console.log('✅ Connected to FalkorDB Cloud');

  const graph = db.selectGraph(FALKORDB_GRAPH);
  const result = await graph.query(
    'RETURN 1 AS connectionTest'
  );

  console.log('✅ openCypher query succeeded');
  console.dir(result.data, { depth: 4 });
} catch (error) {
  console.error('❌ Connection test failed:', error.message);
  process.exitCode = 1;
} finally {
  if (db) await db.close();
}
