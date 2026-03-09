'use client';

// ============================================================================
// ATLAS - OTP Activation Form Component
// Author: Mouhamed (Lead FE)
// Description: Handles 6-digit OTP validation, 24h visual countdown, and 
// OTP resend logic. Extracts user email from URL search params.
// ============================================================================

import React, { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { Loader2, CheckCircle2, AlertCircle, Clock } from 'lucide-react';

import { otpSchema, OtpInput } from '@/lib/validations/auth.schema';
import { apiClient } from '@/lib/api/axios.client';

export default function ActivateOTPForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get('email');

  const [globalError, setGlobalError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  
  // 24 hours in seconds (86400)
  const [timeLeft, setTimeLeft] = useState<number>(86400);

  // 1. Timer Logic
  useEffect(() => {
    if (timeLeft <= 0) return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [timeLeft]);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}h ${m.toString().padStart(2, '0')}m ${s.toString().padStart(2, '0')}s`;
  };

  // 2. React Hook Form Setup
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<OtpInput>({
    resolver: zodResolver(otpSchema),
    defaultValues: { pin: '' },
  });

  // 3. Verify OTP Mutation
  const verifyMutation = useMutation({
    mutationFn: async (data: OtpInput) => {
      const response = await apiClient.post('/auth/verify-otp', {
        email,
        otp: data.pin,
      });
      return response.data;
    },
    onSuccess: () => {
      setGlobalError(null);
      setSuccessMessage('Compte activé avec succès ! Redirection vers la connexion...');
      // Redirect to login after 2 seconds for a better UX
      setTimeout(() => router.push('/login'), 2000);
    },
    onError: (error: any) => {
      console.error('[Verify OTP Error]', error);
      const message = error.response?.data?.message || 'Code OTP invalide ou expiré.';
      setGlobalError(message);
    },
  });

  // 4. Resend OTP Mutation
  const resendMutation = useMutation({
    mutationFn: async () => {
      const response = await apiClient.post('/auth/resend-otp', { email });
      return response.data;
    },
    onSuccess: () => {
      setGlobalError(null);
      setSuccessMessage('Un nouveau code a été envoyé à votre adresse email.');
      setTimeLeft(86400); // Reset timer to 24h
      setTimeout(() => setSuccessMessage(null), 5000); // Clear message after 5s
    },
    onError: (error: any) => {
      console.error('[Resend OTP Error]', error);
      const message = error.response?.data?.message || 'Erreur lors du renvoi du code.';
      setGlobalError(message);
    },
  });

  // 5. Submit Handler
  const onSubmit = (data: OtpInput) => {
    if (!email) {
      setGlobalError("Email introuvable. Veuillez recommencer l'inscription.");
      return;
    }
    verifyMutation.mutate(data);
  };

  // Fallback if accessed directly without an email param
  if (!email) {
    return (
      <div className="w-full max-w-md p-8 text-center bg-white rounded-xl shadow-md border border-gray-100">
        <AlertCircle className="w-12 h-12 mx-auto text-red-500 mb-4" />
        <h2 className="text-xl font-bold text-gray-900">Accès non autorisé</h2>
        <p className="mt-2 text-sm text-gray-500">
          Veuillez passer par la page d'inscription pour activer votre compte.
        </p>
        <button
          onClick={() => router.push('/register')}
          className="mt-6 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
        >
          Retour à l'inscription
        </button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md p-8 space-y-6 bg-white rounded-xl shadow-md border border-gray-100">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Vérification Email</h1>
        <p className="text-sm text-gray-500">
          Un code à 6 chiffres a été envoyé à <br />
          <span className="font-medium text-gray-900">{email}</span>
        </p>
      </div>

      {/* Countdown Timer Visual */}
      <div className="flex items-center justify-center p-3 space-x-2 text-sm font-medium text-amber-800 bg-amber-50 rounded-md border border-amber-200">
        <Clock className="w-4 h-4" />
        <span>Expire dans : {formatTime(timeLeft)}</span>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* Alerts */}
        {globalError && (
          <div className="flex items-center p-3 text-sm font-medium text-red-800 bg-red-100 rounded-md">
            <AlertCircle className="w-4 h-4 mr-2 flex-shrink-0" />
            {globalError}
          </div>
        )}
        {successMessage && (
          <div className="flex items-center p-3 text-sm font-medium text-green-800 bg-green-100 rounded-md">
            <CheckCircle2 className="w-4 h-4 mr-2 flex-shrink-0" />
            {successMessage}
          </div>
        )}

        {/* OTP Input Field */}
        <div className="space-y-2 text-center">
          <label htmlFor="pin" className="sr-only">Code OTP</label>
          <input
            id="pin"
            type="text"
            maxLength={6}
            placeholder="000000"
            {...register('pin')}
            className={`flex h-14 w-full text-center text-2xl tracking-[1em] rounded-md border bg-transparent px-3 py-2 font-mono placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent ${
              errors.pin ? 'border-red-500 focus:ring-red-600' : 'border-gray-300'
            }`}
          />
          {errors.pin && (
            <p className="text-sm font-medium text-red-500">{errors.pin.message}</p>
          )}
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={verifyMutation.isPending || timeLeft <= 0}
          className="inline-flex items-center justify-center w-full h-10 px-4 py-2 text-sm font-medium text-white transition-colors bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none"
        >
          {verifyMutation.isPending ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Vérification...
            </>
          ) : (
            'Activer mon compte'
          )}
        </button>
      </form>

      {/* Resend Action */}
      <div className="text-sm text-center text-gray-500 border-t pt-4 border-gray-100">
        Vous n'avez pas reçu le code ?{' '}
        <button
          type="button"
          onClick={() => resendMutation.mutate()}
          disabled={resendMutation.isPending}
          className="font-medium text-blue-600 hover:text-blue-500 focus:outline-none focus:underline disabled:opacity-50"
        >
          {resendMutation.isPending ? 'Renvoi en cours...' : 'Renvoyer le code'}
        </button>
      </div>
    </div>
  );
}