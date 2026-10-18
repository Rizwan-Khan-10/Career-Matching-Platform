import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateApplicantDto } from './update-applicant.dto';
import { CreateProfileDto } from '../../internal/dto/create-profile.dto';

async function messages<T extends object>(cls: new () => T, input: object): Promise<string[]> {
  const errors = await validate(plainToInstance(cls, input));
  const collect = (errs: typeof errors): string[] =>
    errs.flatMap((e) => [...Object.values(e.constraints ?? {}), ...collect(e.children ?? [])]);
  return collect(errors);
}

describe('academic field validation (PATCH /applicants/me)', () => {
  it.each([
    [{ cgpa: 0 }], [{ cgpa: 100 }], [{ cgpa: 8.75 }],
    [{ branch: 'x'.repeat(100) }],
    [{ passingYear: 1990 }], [{ passingYear: 2100 }],
    [{ backlogs: 0 }], [{ backlogs: 50 }],
    [{ cgpa: null, branch: null, passingYear: null, backlogs: null }],
    [{}],
  ])('accepts %j', async (input) => {
    expect(await messages(UpdateApplicantDto, input)).toEqual([]);
  });

  it.each([
    [{ cgpa: -0.1 }, 'CGPA cannot be negative'],
    [{ cgpa: 100.5 }, 'CGPA cannot be above 100'],
    [{ cgpa: 'abc' }, 'CGPA must be a number'],
    [{ branch: 'x'.repeat(101) }, 'Branch is too long'],
    [{ passingYear: 1989 }, 'Passing year must be 1990 or later'],
    [{ passingYear: 2101 }, 'Passing year must be 2100 or earlier'],
    [{ passingYear: 2026.5 }, 'Passing year must be a whole number'],
    [{ backlogs: -1 }, 'Backlogs cannot be negative'],
    [{ backlogs: 51 }, 'Backlogs cannot be above 50'],
    [{ backlogs: 1.5 }, 'Backlogs must be a whole number'],
  ])('rejects %j', async (input, expected) => {
    expect((await messages(UpdateApplicantDto, input)).join(' | ')).toContain(expected);
  });

  it('turns a blank form value into null (a cleared field) without an error', async () => {
    const dto = plainToInstance(UpdateApplicantDto, { cgpa: '', branch: '  ', passingYear: '', backlogs: '' });
    expect(dto).toMatchObject({ cgpa: null, branch: null, passingYear: null, backlogs: null });
    expect(await validate(dto)).toEqual([]);
  });
});

describe('CreateProfileDto (POST /internal/profiles)', () => {
  const base = { userId: 'u1', role: 'APPLICANT', email: 'a@college.edu' };

  it('accepts the import payload with nested academic data', async () => {
    const input = {
      ...base, name: 'Asha',
      academic: { cgpa: 8.1, branch: 'CSE', passingYear: 2026, backlogs: 0 },
      academicVerified: true,
    };
    expect(await messages(CreateProfileDto, input)).toEqual([]);
  });

  it('applies the same academic rules to nested data', async () => {
    const msgs = await messages(CreateProfileDto, { ...base, academic: { cgpa: 200, backlogs: 99 } });
    expect(msgs.join(' | ')).toContain('CGPA cannot be above 100');
    expect(msgs.join(' | ')).toContain('Backlogs cannot be above 50');
  });

  it('only accepts pending or approved as companyStatus', async () => {
    expect(await messages(CreateProfileDto, { ...base, role: 'COMPANY', companyStatus: 'pending' })).toEqual([]);
    expect((await messages(CreateProfileDto, { ...base, role: 'COMPANY', companyStatus: 'rejected' })).length).toBeGreaterThan(0);
  });

  it('still accepts the old three-field payload', async () => {
    expect(await messages(CreateProfileDto, base)).toEqual([]);
  });
});