'use client';

// ============================================================================
// ATLAS - Reset Password Form Component
// Author: Mouhamed (Lead FE)
// Description: Finalizes password reset. Includes 15-min visual countdown,
// OTP verification, and new password setup.
// ============================================================================

import React, { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { Loader2, AlertCircle, CheckCircle2, Clock } from 'lucide-react';

import { resetPasswordConfirmSchema, ResetPasswordConfirmInput } from '@/lib/validations/auth.schema';
import { apiClient } from '@/lib/api/axios.client';

export default function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get('email');

  const [globalError, setGlobalError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  
  // 15 minutes TTL as per US-04 backlog (900 seconds)
  const [timeLeft, setTimeLeft] = useState<number>(900);

  useEffect(() => {
    if (timeLeft <= 0) return;
    const timer = setInterval(() => setTimeLeft((prev) => prev - 1), 1000);
    return () => clearInterval(timer);
  }, [timeLeft]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordConfirmInput>({
    resolver: zodResolver(resetPasswordConfirmSchema),
    defaultValues: { pin: '', password: '' },
  });

  const resetMutation = useMutation({
    mutationFn: async (data: ResetPasswordConfirmInput) => {
      const response = await apiClient.post('/auth/reset-password', {
        email,
        otp: data.pin,
        newPassword: data.password,
      });
      return response.data;
    },
    onSuccess: () => {
      setGlobalError(null);
      setSuccessMessage('Mot de passe mis à jour ! Redirection...');
      setTimeout(() => router.push('/login'), 2000);
    },
    onError: (error: any) => {
      console.error('[Reset Password Error]', error);
      const message = error.response?.data?.message || 'Code invalide ou expiré.';
      setGlobalError(message);
    },
  });

  const onSubmit = (data: ResetPasswordConfirmInput) => {
    if (!email) {
      setGlobalError('Email introuvable.');
      return;
    }
    resetMutation.mutate(data);
  };

  if (!email) {
    return (
      <div className="w-full max-w-md p-8 text-center bg-white rounded-xl shadow-md border border-gray-100">
        <AlertCircle className="w-12 h-12 mx-auto text-red-500 mb-4" />
        <h2 className="text-xl font-bold text-gray-900">Requête invalide</h2>
        <button onClick={() => router.push('/forgot-password')} className="mt-6 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md">
          Recommencer
        </button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md p-8 space-y-6 bg-white rounded-xl shadow-md border border-gray-100">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Nouveau mot de passe</h1>
        <p className="text-sm text-gray-500">Un code a été envoyé à {email}</p>
      </div>

      <div className="flex items-center justify-center p-3 space-x-2 text-sm font-medium text-amber-800 bg-amber-50 rounded-md border border-amber-200">
        <Clock className="w-4 h-4" />
        <span>Expire dans : {formatTime(timeLeft)}</span>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {globalError && (
          <div className="flex items-center p-3 text-sm text-red-800 bg-red-100 rounded-md">
            <AlertCircle className="w-4 h-4 mr-2" />{globalError}
          </div>
        )}
        {successMessage && (
          <div className="flex items-center p-3 text-sm text-green-800 bg-green-100 rounded-md">
            <CheckCircle2 className="w-4 h-4 mr-2" />{successMessage}
          </div>
        )}

        <div className="space-y-2 text-center">
          <label htmlFor="pin" className="text-sm font-medium leading-none text-left block">Code OTP</label>
          <input
            id="pin"
            type="text"
            maxLength={6}
            placeholder="000000"
            {...register('pin')}
            className={`flex h-12 w-full text-center text-2xl tracking-[1em] rounded-md border bg-transparent px-3 py-2 font-mono placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-600 ${errors.pin ? 'border-red-500' : 'border-gray-300'}`}
          />
          {errors.pin && <p className="text-xs font-medium text-red-500 text-left">{errors.pin.message}</p>}
        </div>

        <div className="space-y-2">
          <label htmlFor="password" className="text-sm font-medium leading-none">Nouveau mot de passe</label>
          <input
            id="password"
            type="password"
            {...register('password')}
            className={`flex h-10 w-full rounded-md border bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 ${errors.password ? 'border-red-500' : 'border-gray-300'}`}
          />
          {errors.password && <p className="text-xs font-medium text-red-500">{errors.password.message}</p>}
        </div>

        <button
          type="submit"
          disabled={resetMutation.isPending || timeLeft <= 0}
          className="inline-flex items-center justify-center w-full h-10 px-4 py-2 mt-4 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {resetMutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Chargement...</> : 'Confirmer le changement'}
        </button>
      </form>
    </div>
  );
}