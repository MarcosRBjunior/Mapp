import { describe, expect, it } from 'vitest';
import { htmlToText } from './html-to-text';

describe('htmlToText', () => {
  it('decodes entities and drops tags', () => {
    expect(htmlToText('&copy; <a href="https://x.test">OpenStreetMap</a> contributors')).toBe(
      '© OpenStreetMap contributors',
    );
  });

  it('never keeps markup', () => {
    expect(htmlToText('<img src=x onerror="alert(1)">CARTO')).toBe('CARTO');
  });
});
