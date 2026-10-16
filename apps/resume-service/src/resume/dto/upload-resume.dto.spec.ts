import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UploadResumeDto } from './upload-resume.dto';

const errorsFor = (body: object) => validate(plainToInstance(UploadResumeDto, body));

describe('UploadResumeDto', () => {
    it('accepts a valid track and stack', async () => {
        expect(await errorsFor({ targetTrack: 'backend', targetStack: 'java' })).toHaveLength(0);
        expect(await errorsFor({ targetTrack: 'backend', targetStack: 'other' })).toHaveLength(0);
    });

    it('requires both fields', async () => {
        const errors = await errorsFor({});
        expect(errors.map((e) => e.property).sort()).toEqual(['targetStack', 'targetTrack']);
    });

    it('rejects ids that are not in the taxonomy', async () => {
        const errors = await errorsFor({ targetTrack: 'blockchain', targetStack: 'solidity' });
        expect(errors).toHaveLength(2);
    });
});