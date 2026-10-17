import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateResumeDto } from './update-resume.dto';

const errorsFor = (body: object) => validate(plainToInstance(UpdateResumeDto, body));

describe('UpdateResumeDto', () => {
    it('accepts the academic keys', async () => {
        expect(await errorsFor({ branch: 'Computer Science', passingYear: 2026, backlogs: 0 })).toHaveLength(0);
    });

    it('accepts passingYear 1990..2100 like user-service and the contract', async () => {
        expect(await errorsFor({ passingYear: 1990 })).toHaveLength(0);
        expect(await errorsFor({ passingYear: 2100 })).toHaveLength(0);
        expect(await errorsFor({ passingYear: 1989 })).toHaveLength(1);
    });

    it('accepts null to clear an academic key', async () => {
        expect(await errorsFor({ branch: null, passingYear: null, backlogs: null })).toHaveLength(0);
    });

    it('rejects out-of-range or non-integer academic values', async () => {
        const errors = await errorsFor({ passingYear: 1850, backlogs: -1 });
        expect(errors.map((e) => e.property).sort()).toEqual(['backlogs', 'passingYear']);
        expect(await errorsFor({ backlogs: 1.5 })).toHaveLength(1);
    });

    it('accepts a taxonomy target and rejects unknown ids', async () => {
        expect(await errorsFor({ targetTrack: 'backend', targetStack: 'java' })).toHaveLength(0);
        expect(await errorsFor({ targetTrack: 'blockchain' })).toHaveLength(1);
    });

    it('allows an empty body', async () => {
        expect(await errorsFor({})).toHaveLength(0);
    });
});