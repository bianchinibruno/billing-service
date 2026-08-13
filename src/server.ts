import { Pool } from 'pg';
import { construirApp } from './app.js';
import { RepositorioPostgres, aplicarSchema } from './repositorio/postgres.js';

// Sobe o serviço. Se DATABASE_URL estiver setada, usa Postgres; senão, cai no
// repositório em memória — o mesmo serviço, persistência trocável.
async function main() {
  const porta = Number(process.env.PORT ?? 3000);
  const databaseUrl = process.env.DATABASE_URL;

  let app;
  if (databaseUrl) {
    const pool = new Pool({ connectionString: databaseUrl });
    await aplicarSchema(pool);
    app = construirApp({ repo: new RepositorioPostgres(pool) });
    // eslint-disable-next-line no-console
    console.log('billing-service usando Postgres');
  } else {
    app = construirApp();
    // eslint-disable-next-line no-console
    console.log('billing-service usando repositório em memória (sem DATABASE_URL)');
  }

  await app.listen({ port: porta, host: '0.0.0.0' });
  // eslint-disable-next-line no-console
  console.log(`billing-service ouvindo em http://localhost:${porta}`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
