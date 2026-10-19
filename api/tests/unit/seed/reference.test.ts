import { describe, expect, it } from 'vitest';
import { buildCountrySeeds, parseCsv } from '../../../prisma/seed/reference.js';

const HEADER =
  'UID,iso2,iso3,code3,FIPS,Admin2,Province_State,Country_Region,Lat,Long_,Combined_Key,Population';
const csv = (...rows: string[]): string => `${[HEADER, ...rows].join('\n')}\n`;

const BRAZIL = '76,BR,BRA,76,,,,Brazil,-14.235,-51.9253,Brazil,212559409';
const AFGHANISTAN = '4,AF,AFG,4,,,,Afghanistan,33.93911,67.709953,Afghanistan,38928341';
const VICTORIA =
  '3608,AU,AUS,36,,,Victoria,Australia,-37.8136,144.9631,"Victoria, Australia",6629870';
const KOREA_SOUTH = '410,KR,KOR,410,,,,"Korea, South",35.907757,127.766922,"Korea, South",51269183';
const CONGO_KINSHASA =
  '180,CD,COD,180,,,,Congo (Kinshasa),-4.0383,21.7587,Congo (Kinshasa),89561404';
const BURMA = '104,MM,MMR,104,,,,Burma,21.9162,95.956,Burma,54409794';
const WEST_BANK = '275,PS,PSE,275,,,,West Bank and Gaza,31.9522,35.2332,West Bank and Gaza,5101416';
const ANTARCTICA = '10,AQ,ATA,10,,,,Antarctica,-71.9499,23.347,Antarctica,';
const DIAMOND_PRINCESS = '9999,,,,,,,Diamond Princess,,,Diamond Princess,';
const MS_ZAANDAM = '8888,,,,,,,MS Zaandam,,,MS Zaandam,';
const SUMMER_OLYMPICS = '9998,,,,,,,Summer Olympics 2020,35.6491,139.7737,Summer Olympics 2020,';
const WINTER_OLYMPICS = '9997,,,,,,,Winter Olympics 2022,39.9042,116.4074,Winter Olympics 2022,';

describe('parseCsv', () => {
  it('strips a leading UTF-8 BOM from the first cell', () => {
    expect(parseCsv('\uFEFFUID,iso2\n1,BR\n')[0]).toEqual(['UID', 'iso2']);
  });

  it('handles quoted fields with commas and escaped quotes', () => {
    expect(parseCsv('a,"b, c","say ""hi"""\r\n1,2,3\n')).toEqual([
      ['a', 'b, c', 'say "hi"'],
      ['1', '2', '3'],
    ]);
  });
});

describe('buildCountrySeeds', () => {
  it('does not treat inherited object keys as non-geographic entities', () => {
    expect(() => buildCountrySeeds(csv('1,,,,,,,constructor,,,constructor,'))).toThrow(
      /constructor/,
    );
  });

  it('rejects a blank coordinate', () => {
    expect(() =>
      buildCountrySeeds(csv('76,BR,BRA,76,,,,Brazil, ,-51.9253,Brazil,212559409')),
    ).toThrow(/Invalid coordinate/);
  });

  it('maps a country-level row', () => {
    expect(buildCountrySeeds(csv(BRAZIL))).toEqual([
      {
        code: 'BRA',
        name: 'Brasil',
        kind: 'country',
        lat: -14.235,
        lng: -51.9253,
        population: 212559409,
        sourceName: 'Brazil',
      },
    ]);
  });

  it('keeps quoted source names', () => {
    const [korea] = buildCountrySeeds(csv(KOREA_SOUTH));
    expect(korea?.sourceName).toBe('Korea, South');
    expect(korea?.name).toBe('Coreia do Sul');
  });

  it('ignores province rows', () => {
    expect(buildCountrySeeds(csv(BRAZIL, VICTORIA)).map((seed) => seed.code)).toEqual(['BRA']);
  });

  it('applies the pt-BR name overrides and keeps Intl names otherwise', () => {
    const names = Object.fromEntries(
      buildCountrySeeds(csv(CONGO_KINSHASA, BURMA, WEST_BANK)).map((seed) => [
        seed.code,
        seed.name,
      ]),
    );
    expect(names).toEqual({
      COD: 'República Democrática do Congo',
      MMR: 'Mianmar',
      PSE: new Intl.DisplayNames(['pt-BR'], { type: 'region' }).of('PS'),
    });
  });

  it('uses null population when the source has none', () => {
    const [antarctica] = buildCountrySeeds(csv(ANTARCTICA));
    expect(antarctica?.population).toBeNull();
    expect(antarctica?.kind).toBe('country');
  });

  it('maps the four non-geographic entities to user-assigned codes without coordinates', () => {
    expect(
      buildCountrySeeds(csv(DIAMOND_PRINCESS, MS_ZAANDAM, SUMMER_OLYMPICS, WINTER_OLYMPICS)),
    ).toEqual([
      {
        code: 'XDP',
        name: 'Navio Diamond Princess',
        kind: 'non_geographic',
        lat: null,
        lng: null,
        population: null,
        sourceName: 'Diamond Princess',
      },
      {
        code: 'XMZ',
        name: 'Navio MS Zaandam',
        kind: 'non_geographic',
        lat: null,
        lng: null,
        population: null,
        sourceName: 'MS Zaandam',
      },
      {
        code: 'XSO',
        name: 'Jogos Olímpicos de Verão 2020',
        kind: 'non_geographic',
        lat: null,
        lng: null,
        population: null,
        sourceName: 'Summer Olympics 2020',
      },
      {
        code: 'XWO',
        name: 'Jogos Olímpicos de Inverno 2022',
        kind: 'non_geographic',
        lat: null,
        lng: null,
        population: null,
        sourceName: 'Winter Olympics 2022',
      },
    ]);
  });

  it('sorts by code and accepts a UTF-8 BOM', () => {
    expect(buildCountrySeeds(`\uFEFF${csv(BRAZIL, AFGHANISTAN)}`).map((seed) => seed.code)).toEqual(
      ['AFG', 'BRA'],
    );
  });

  it('rejects an unknown row without iso3', () => {
    expect(() => buildCountrySeeds(csv('1,,,,,,,Atlantis,,,Atlantis,'))).toThrow(/Atlantis/);
  });

  it('rejects duplicate codes', () => {
    expect(() => buildCountrySeeds(csv(BRAZIL, BRAZIL))).toThrow(/Duplicate country code BRA/);
  });

  it('rejects coordinates out of range', () => {
    expect(() =>
      buildCountrySeeds(csv('76,BR,BRA,76,,,,Brazil,-95,-51.9253,Brazil,212559409')),
    ).toThrow(/Invalid coordinate/);
  });
});
