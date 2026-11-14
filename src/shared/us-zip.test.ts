import { describe, expect, it } from 'vitest';
import { cityKey, normalizeZip, stateOfZip, tidyCityName, zip3Of } from './us-zip';

describe('US ZIP codes', () => {
  it('reads five-digit ZIPs and cuts ZIP+4', () => {
    expect(normalizeZip('78723')).toBe('78723');
    expect(normalizeZip(' 78723-1234 ')).toBe('78723');
    expect(normalizeZip('787231234')).toBe('78723');
    expect(normalizeZip('7872')).toBeNull();
    expect(normalizeZip('ABCDE')).toBeNull();
    expect(zip3Of('78723')).toBe('787');
    expect(zip3Of('nope')).toBeNull();
  });

  it('names the state from the first three digits', () => {
    expect(stateOfZip('78723')).toBe('TX'); // Austin
    expect(stateOfZip('73301')).toBe('TX'); // Austin's IRS prefix, inside Oklahoma's range
    expect(stateOfZip('73102')).toBe('OK'); // Oklahoma City
    expect(stateOfZip('79901')).toBe('TX'); // El Paso
    expect(stateOfZip('88510')).toBe('TX'); // El Paso's other prefix
    expect(stateOfZip('10001')).toBe('NY');
    expect(stateOfZip('02139')).toBe('MA');
    expect(stateOfZip('05501')).toBe('MA'); // Andover, inside Vermont's range
    expect(stateOfZip('05401')).toBe('VT');
    expect(stateOfZip('20001')).toBe('DC');
    expect(stateOfZip('20166')).toBe('VA');
    expect(stateOfZip('94103')).toBe('CA');
    expect(stateOfZip('96813')).toBe('HI');
    expect(stateOfZip('99501')).toBe('AK');
    expect(stateOfZip('00901')).toBe('PR');
    expect(stateOfZip('60601')).toBe('IL');
  });

  it('serves no military mail and nothing that is not a ZIP', () => {
    expect(stateOfZip('09001')).toBeNull(); // AE
    expect(stateOfZip('34001')).toBeNull(); // AA
    expect(stateOfZip('96201')).toBeNull(); // AP
    expect(stateOfZip('00001')).toBeNull();
    expect(stateOfZip('1234')).toBeNull();
  });
});

describe('city names people type', () => {
  it('tidies spacing, a trailing state code and one-case typing', () => {
    expect(tidyCityName('  san   antonio, tx ')).toBe('San Antonio');
    expect(tidyCityName('DALLAS TX')).toBe('Dallas');
    expect(tidyCityName('McAllen')).toBe('McAllen');
    expect(tidyCityName('winston-salem')).toBe('Winston-Salem');
    expect(tidyCityName('st. louis')).toBe('St. Louis');
    expect(tidyCityName('El Paso')).toBe('El Paso');
    expect(tidyCityName('Ox')).toBe('Ox'); // two letters, not a state code once it's the whole name
  });

  it('refuses empty and overlong names', () => {
    expect(tidyCityName('  ')).toBeNull();
    expect(tidyCityName('a')).toBeNull();
    expect(tidyCityName('x'.repeat(61))).toBeNull();
    expect(tidyCityName(undefined)).toBeNull();
  });

  it('gives two spellings of a city one key', () => {
    expect(cityKey('San antonio')).toBe(cityKey('SAN ANTONIO, TX'));
    expect(cityKey('')).toBeNull();
  });
});
