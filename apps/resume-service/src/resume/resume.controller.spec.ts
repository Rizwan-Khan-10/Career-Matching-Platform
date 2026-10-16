import 'reflect-metadata';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { ResumeController } from './resume.controller';

describe('ResumeController roles', () => {
    const rolesOf = (fn: unknown) => Reflect.getMetadata(ROLES_KEY, fn as object);

    it('lets every logged-in role read target-roles', () => {
        expect(rolesOf(ResumeController.prototype.targetRoles)).toEqual(['APPLICANT', 'COMPANY', 'ADMIN']);
    });

    it('keeps upload applicant-only through the class-level role', () => {
        expect(rolesOf(ResumeController.prototype.upload)).toBeUndefined();
        expect(rolesOf(ResumeController)).toEqual(['APPLICANT']);
    });

    it('returns the taxonomy with labels', () => {
        const controller = new ResumeController({} as any);
        const body = controller.targetRoles();
        expect(body.tracks.find((t) => t.id === 'backend')?.stacks[0]).toEqual({ id: 'java', label: 'Java' });
    });
});