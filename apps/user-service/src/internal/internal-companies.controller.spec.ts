import { NotFoundException } from '@nestjs/common';
import { InternalCompaniesController } from './internal-companies.controller';

const build = (company: unknown) =>
    new InternalCompaniesController({ companyProfile: { findUnique: jest.fn().mockResolvedValue(company) } } as any);

describe('InternalCompaniesController', () => {
    it('returns the company status', async () => {
        await expect(build({ userId: 'c1', name: 'Acme', status: 'pending' }).status('c1')).resolves.toEqual({ status: 'pending' });
    });

    it('answers 404 for an unknown company', async () => {
        await expect(build(null).status('nope')).rejects.toBeInstanceOf(NotFoundException);
        await expect(build(null).name('nope')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('still returns the name', async () => {
        await expect(build({ name: 'Acme', status: 'approved' }).name('c1')).resolves.toEqual({ name: 'Acme' });
    });
});