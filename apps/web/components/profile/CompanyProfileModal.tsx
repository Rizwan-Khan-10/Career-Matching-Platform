'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';
import { apiClient } from '@/lib/apiClient';
import { companyProfileSchema, type CompanyProfileValues } from '@/lib/schemas/profile';
import { toast } from '@/lib/toast';

export function CompanyProfileModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CompanyProfileValues>({
    resolver: zodResolver(companyProfileSchema),
  });

  const mutation = useMutation({
    mutationFn: (values: CompanyProfileValues) =>
      apiClient.patch('/companies/me', values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companyProfile'] });
      toast.success('Profile updated');
      onClose();
    },
    onError: (err: any) =>
      toast.error(err.response?.data?.message || 'Could not save profile'),
  });

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 z-40"
          />
          {/* Modal */}
          <motion.div
            key="modal"
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-x-4 top-1/2 -translate-y-1/2 md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:w-full md:max-w-md z-50 bg-paper-raised rounded-2xl border border-hairline shadow-xl p-6"
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-heading text-lg text-ink">Company Profile</h2>
              <button
                type="button"
                onClick={onClose}
                className="text-ink-grey hover:text-ink"
                aria-label="Close"
              >
                <X className="size-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="flex flex-col gap-4">
              <div>
                <input
                  {...register('name')}
                  placeholder="Company name *"
                  className="w-full text-sm border border-hairline rounded-lg px-3 py-2 bg-paper text-ink placeholder:text-ink-grey focus:outline-none focus:ring-1 focus:ring-accent"
                />
                {errors.name && (
                  <p className="text-xs text-danger mt-0.5">{errors.name.message}</p>
                )}
              </div>

              <input
                {...register('industry')}
                placeholder="Industry (optional)"
                className="w-full text-sm border border-hairline rounded-lg px-3 py-2 bg-paper text-ink placeholder:text-ink-grey focus:outline-none focus:ring-1 focus:ring-accent"
              />

              <input
                {...register('contact')}
                placeholder="Contact email or phone (optional)"
                className="w-full text-sm border border-hairline rounded-lg px-3 py-2 bg-paper text-ink placeholder:text-ink-grey focus:outline-none focus:ring-1 focus:ring-accent"
              />

              <button
                type="submit"
                disabled={mutation.isPending}
                className="mt-1 w-full bg-ink text-paper-raised text-sm font-medium py-2.5 rounded-lg hover:bg-ink/80 disabled:opacity-50"
              >
                {mutation.isPending ? 'Saving…' : 'Save profile'}
              </button>
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

