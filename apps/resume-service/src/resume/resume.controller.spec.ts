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

    it('delegates confirm to the service with the id from the URL and the user from the JWT', async () => {
        const confirm = jest.fn().mockResolvedValue({ id: 'r1' });
        const controller = new ResumeController({ confirm } as any);
        await controller.confirm('r1', { user: { userId: 'app-1', role: 'APPLICANT' } } as any);
        expect(confirm).toHaveBeenCalledWith('r1', 'app-1');
        expect(rolesOf(ResumeController.prototype.confirm)).toBeUndefined(); // applicant-only via the class-level role
    });

    it('delegates delete to the service with the JWT user and keeps it applicant-only', async () => {
        const deleteOwn = jest.fn().mockResolvedValue({ deleted: true });
        const controller = new ResumeController({ deleteOwn } as any);
        await expect(controller.remove('r1', { user: { userId: 'app-1', role: 'APPLICANT' } } as any)).resolves.toEqual({ deleted: true });
        expect(deleteOwn).toHaveBeenCalledWith('r1', 'app-1');
        expect(rolesOf(ResumeController.prototype.remove)).toBeUndefined(); // class-level APPLICANT
    });
});