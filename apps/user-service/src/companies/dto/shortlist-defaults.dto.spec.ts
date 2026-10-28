import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ShortlistDefaultsDto } from './shortlist-defaults.dto';

const bad = async (o: object) => (await validate(plainToInstance(ShortlistDefaultsDto, o))).map((e) => e.property);

describe('ShortlistDefaultsDto', () => {
  it('accepts a full template, an empty one and nulls', async () => {
    expect(await bad({ roundName: 'HR', mode: 'online', link: 'https://meet.example.com/x', address: 'Pune', bring: 'ID', note: 'hi' })).toEqual([]);
    expect(await bad({})).toEqual([]);
    expect(await bad({ roundName: null, mode: null, link: null })).toEqual([]);
    expect(await bad({ link: '' })).toEqual([]);
  });

  it('rejects a wrong mode, a link without http(s), and too-long text', async () => {
    expect(await bad({ mode: 'carrier-pigeon' })).toEqual(['mode']);
    expect(await bad({ link: 'meet.example.com' })).toEqual(['link']);
    expect(await bad({ roundName: 'x'.repeat(101) })).toEqual(['roundName']);
    expect(await bad({ note: 'x'.repeat(1001) })).toEqual(['note']);
  });
});
