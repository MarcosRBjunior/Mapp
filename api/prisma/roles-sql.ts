import pg from 'pg';

const { escapeIdentifier, escapeLiteral } = pg;

export interface ReaderRoleOptions {
  owner: string;
  reader: string;
  password: string;
  database: string;
  readerExists: boolean;
}

export interface ConnectionParts {
  user: string;
  password: string;
  database: string;
}

export function buildReaderRoleSql(options: ReaderRoleOptions): string[] {
  const owner = escapeIdentifier(options.owner);
  const reader = escapeIdentifier(options.reader);
  const password = escapeLiteral(options.password);
  const database = escapeIdentifier(options.database);

  return [
    `${options.readerExists ? 'ALTER' : 'CREATE'} ROLE ${reader} WITH LOGIN PASSWORD ${password}`,
    `GRANT CONNECT ON DATABASE ${database} TO ${reader}`,
    `GRANT USAGE ON SCHEMA public TO ${reader}`,
    `GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${reader}`,
    `ALTER DEFAULT PRIVILEGES FOR ROLE ${owner} IN SCHEMA public GRANT SELECT ON TABLES TO ${reader}`,
  ];
}

export function parseConnectionUrl(url: string): ConnectionParts {
  const parsed = new URL(url);
  const user = decodeURIComponent(parsed.username);
  const password = decodeURIComponent(parsed.password);
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (!user || !password || !database) {
    throw new Error('Connection URL must include user, password and database');
  }
  return { user, password, database };
}
