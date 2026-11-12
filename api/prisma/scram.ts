import { createHash, createHmac, pbkdf2Sync, randomBytes } from 'node:crypto';

const PRINTABLE_ASCII = /^[\x20-\x7e]+$/;

// The verifier Postgres stores for SCRAM-SHA-256 (same format as its own password hashing), so
// CREATE/ALTER ROLE never carries the password itself. SASLprep is skipped: ASCII-only passwords.
export function scramSha256Verifier(
  password: string,
  salt: Buffer = randomBytes(16),
  iterations = 4096,
): string {
  if (!PRINTABLE_ASCII.test(password)) {
    throw new Error('Reader password must be printable ASCII');
  }
  const salted = pbkdf2Sync(password, salt, iterations, 32, 'sha256');
  const clientKey = createHmac('sha256', salted).update('Client Key').digest();
  const storedKey = createHash('sha256').update(clientKey).digest();
  const serverKey = createHmac('sha256', salted).update('Server Key').digest();
  return `SCRAM-SHA-256$${iterations}:${salt.toString('base64')}$${storedKey.toString('base64')}:${serverKey.toString('base64')}`;
}
