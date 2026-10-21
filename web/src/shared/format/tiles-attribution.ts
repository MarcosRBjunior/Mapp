import { getEnv } from '../../config/env';
import { htmlToText } from './html-to-text';

let cached: string | undefined;

export function tilesAttributionText(): string {
  cached ??= htmlToText(getEnv().tilesAttribution);
  return cached;
}
