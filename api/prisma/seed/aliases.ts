import { readFileSync } from 'node:fs';
import { z } from 'zod';

const aliasSeedSchema = z.discriminatedUnion('status', [
  z.object({
    sourceName: z.string().min(1),
    countryCode: z.string().regex(/^[A-Z]{3}$/),
    status: z.literal('mapped'),
  }),
  z.object({
    sourceName: z.string().min(1),
    countryCode: z.null(),
    status: z.literal('ignored'),
  }),
]);

const aliasSeedsSchema = z
  .array(aliasSeedSchema)
  .refine((aliases) => new Set(aliases.map((alias) => alias.sourceName)).size === aliases.length, {
    message: 'duplicate sourceName',
  });

export type AliasSeed = z.infer<typeof aliasSeedSchema>;

export function parseAliasSeeds(json: unknown): AliasSeed[] {
  const result = aliasSeedsSchema.safeParse(json);
  if (!result.success) {
    throw new Error(`Invalid aliases.json:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

export function loadAliasSeeds(): AliasSeed[] {
  const text = readFileSync(new URL('./aliases.json', import.meta.url), 'utf8');
  return parseAliasSeeds(JSON.parse(text));
}
