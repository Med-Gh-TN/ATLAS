'use client';

// ============================================================================
// ATLAS - Forgot Password Form Component
// Author: Mouhamed (Lead FE)
// Description: Initiates the password reset flow. Sends the email to backend
// and redirects to the OTP validation screen on success.
// ============================================================================

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { Loader2, ArrowLeft } from 'lucide-react';

import { resetPasswordSchema, ResetPasswordInput } from '@/lib/validations/auth.schema';
import { apiClient } from '@/lib/api/axios.client';

export default function ForgotPasswordForm() {
  const router = useRouter();
  const [globalError, setGlobalError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { email: '' },
  });

  const requestOtpMutation = useMutation({
    mutationFn: async (data: ResetPasswordInput) => {
      const response = await apiClient.post('/auth/forgot-password', data);
      return response.data;
    },
    onSuccess: (_, variables) => {
      setGlobalError(null);
      // Pass the email to the next screen via URL params
      const encodedEmail = encodeURIComponent(variables.email);
      router.push(`/reset-password?email=${encodedEmail}`);
    },
    onError: (error: any) => {
      console.error('[Forgot Password Error]', error);
      const message = error.response?.data?.message || 'Une erreur est survenue.';
      setGlobalError(message);
    },
  });

  const onSubmit = (data: ResetPasswordInput) => {
    requestOtpMutation.mutate(data);
  };

  return (
    <div className="w-full max-w-md p-8 space-y-6 bg-white rounded-xl shadow-md border border-gray-100">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Mot de passe oublié</h1>
        <p className="text-sm text-gray-500">
          Saisissez votre adresse email. Nous vous enverrons un code de réinitialisation.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {globalError && (
          <div className="p-3 text-sm font-medium text-red-800 bg-red-100 rounded-md">
            {globalError}
          </div>
        )}

        <div className="space-y-2">
          <label htmlFor="email" className="text-sm font-medium leading-none">Email</label>
          <input
            id="email"
            type="email"
            placeholder="etudiant@fss.rnu.tn"
            {...register('email')}
            className={`flex h-10 w-full rounded-md border bg-transparent px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent ${
              errors.email ? 'border-red-500 focus:ring-red-600' : 'border-gray-300'
            }`}
          />
          {errors.email && (
            <p className="text-sm font-medium text-red-500">{errors.email.message}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={requestOtpMutation.isPending}
          className="inline-flex items-center justify-center w-full h-10 px-4 py-2 text-sm font-medium text-white transition-colors bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {requestOtpMutation.isPending ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Envoi...</>
          ) : (
            'Recevoir le code'
          )}
        </button>

        <div className="text-center pt-2">
          <Link href="/login" className="inline-flex items-center text-sm font-medium text-gray-600 hover:text-gray-900">
            <ArrowLeft className="w-4 h-4 mr-2" /> Retour à la connexion
          </Link>
        </div>
      </form>
    </div>
  );
}