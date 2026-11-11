import { describe, expect, it } from 'vitest';
import { scramSha256Verifier } from '../../../prisma/scram.js';

describe('scramSha256Verifier', () => {
  it('matches an independently computed verifier', () => {
    // Computed with Python's hashlib (PBKDF2-HMAC-SHA256, 4096 iterations).
    const salt = Buffer.from('W22ZaJ0SNY7soEsUEjb6gQ==', 'base64');
    expect(scramSha256Verifier('pencil', salt, 4096)).toBe(
      'SCRAM-SHA-256$4096:W22ZaJ0SNY7soEsUEjb6gQ==$WG5d8oPm3OtcPnkdi4Uo7BkeZkBFzpcXkuLmtbsT4qY=:wfPLwcE6nTWhTAmQ7tl2KeoiWGPlZqQxSrmfPwDl2dU=',
    );
  });

  it('uses a random 16-byte salt and 4096 iterations by default', () => {
    const first = scramSha256Verifier('secret');
    const second = scramSha256Verifier('secret');
    expect(first).toMatch(
      /^SCRAM-SHA-256\$4096:[A-Za-z0-9+/]{22}==\$[A-Za-z0-9+/]{43}=:[A-Za-z0-9+/]{43}=$/,
    );
    expect(first).not.toBe(second);
  });

  it('rejects passwords outside printable ASCII (SASLprep is not implemented)', () => {
    expect(() => scramSha256Verifier('senha-çã')).toThrow(/printable ASCII/);
  });
});
