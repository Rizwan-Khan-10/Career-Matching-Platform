import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateJobRoleDto } from './create-job-role.dto';
import { UpdateJobRoleDto } from './update-job-role.dto';

const base = { title: 'Backend Developer', requiredSkills: ['Java', 'Spring'] };
const createErrors = (body: object) => validate(plainToInstance(CreateJobRoleDto, { ...base, ...body }));
const updateErrors = (body: object) => validate(plainToInstance(UpdateJobRoleDto, body));
const props = (errors: { property: string }[]) => errors.map((e) => e.property).sort();

const full = {
    summary: 'Build APIs',
    preferredSkills: ['Docker'],
    minExperienceYears: 0,
    maxExperienceYears: 1,
    strictMinExperience: false,
    qualifications: 'B.Tech',
    responsibilities: ['Write services'],
    level: 'fresher',
    track: 'backend',
    stacks: ['java'],
    minCgpa: 7,
    allowedBranches: ['Computer Science', 'Information Technology'],
    passingYears: [2026, 2027],
    maxBacklogs: 0,
};

describe.each([
    ['CreateJobRoleDto', createErrors],
    ['UpdateJobRoleDto', updateErrors],
])('%s requirement keys (contract 4.1)', (_name, errorsFor) => {
    it('accepts every key of the contract', async () => {
        expect(await errorsFor(full)).toHaveLength(0);
    });

    it('accepts null for every optional key ("rule not set")', async () => {
        const nulls = Object.fromEntries(
            ['summary', 'minExperienceYears', 'maxExperienceYears', 'strictMinExperience', 'qualifications', 'responsibilities', 'level', 'track', 'stacks', 'minCgpa', 'allowedBranches', 'passingYears', 'maxBacklogs']
                .map((k) => [k, null]),
        );
        expect(await errorsFor(nulls)).toHaveLength(0);
    });

    it('validates track against the taxonomy', async () => {
        expect(await errorsFor({ track: 'other' })).toHaveLength(0);
        expect(props(await errorsFor({ track: 'blockchain' }))).toEqual(['track']);
    });

    it('validates stacks against the taxonomy ids', async () => {
        expect(await errorsFor({ track: 'mobile', stacks: ['android', 'ios'] })).toHaveLength(0);
        expect(props(await errorsFor({ stacks: ['rust'] }))).toEqual(['stacks']);
        expect(props(await errorsFor({ stacks: ['java', 'java'] }))).toEqual(['stacks']);
        expect(props(await errorsFor({ stacks: 'java' }))).toEqual(['stacks']);
    });

    it('validates level', async () => {
        for (const level of ['fresher', 'experienced', 'any']) expect(await errorsFor({ level })).toHaveLength(0);
        expect(props(await errorsFor({ level: 'senior' }))).toEqual(['level']);
    });

    it('validates the experience band fields', async () => {
        expect(props(await errorsFor({ maxExperienceYears: -1 }))).toEqual(['maxExperienceYears']);
        expect(props(await errorsFor({ maxExperienceYears: 61 }))).toEqual(['maxExperienceYears']);
        expect(props(await errorsFor({ maxExperienceYears: '3' }))).toEqual(['maxExperienceYears']);
        expect(props(await errorsFor({ strictMinExperience: 'yes' }))).toEqual(['strictMinExperience']);
        expect(await errorsFor({ maxExperienceYears: 0, strictMinExperience: true })).toHaveLength(0);
    });

    it('validates the academic rules', async () => {
        expect(props(await errorsFor({ minCgpa: 11 }))).toEqual(['minCgpa']);
        expect(props(await errorsFor({ minCgpa: -1 }))).toEqual(['minCgpa']);
        expect(props(await errorsFor({ maxBacklogs: -1 }))).toEqual(['maxBacklogs']);
        expect(props(await errorsFor({ maxBacklogs: 1.5 }))).toEqual(['maxBacklogs']);
        expect(props(await errorsFor({ passingYears: [1980] }))).toEqual(['passingYears']);
        expect(props(await errorsFor({ passingYears: [2026.5] }))).toEqual(['passingYears']);
        expect(props(await errorsFor({ passingYears: [2026, 2026] }))).toEqual(['passingYears']);
        expect(props(await errorsFor({ allowedBranches: [''] }))).toEqual(['allowedBranches']);
        expect(props(await errorsFor({ allowedBranches: [123] }))).toEqual(['allowedBranches']);
    });
});

describe('CreateJobRoleDto', () => {
    it('only needs title and requiredSkills', async () => {
        expect(await validate(plainToInstance(CreateJobRoleDto, base))).toHaveLength(0);
    });

    it('rejects a missing title or requiredSkills', async () => {
        expect(props(await validate(plainToInstance(CreateJobRoleDto, {})))).toEqual(['requiredSkills', 'title']);
    });
});

describe('UpdateJobRoleDto', () => {
    it('allows an empty body', async () => {
        expect(await updateErrors({})).toHaveLength(0);
    });
});
