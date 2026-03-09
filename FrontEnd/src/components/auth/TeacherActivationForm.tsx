'use client';

// ============================================================================
// ATLAS - Teacher Activation Form Component
// Author: Mouhamed (Lead FE)
// Description: Specialized onboarding flow for teachers. Validates the 
// single-use OTP, sets the account password, and completes the academic profile.
// ============================================================================

import React, { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { z } from 'zod';
import { Loader2, AlertCircle, CheckCircle2, ShieldCheck, BookOpen } from 'lucide-react';

import { apiClient } from '@/lib/api/axios.client';

// --- Localized Zod Schema for Atomic Modularity ---
const teacherActivationSchema = z.object({
  pin: z
    .string()
    .length(6, { message: "Le code OTP doit contenir exactement 6 chiffres." })
    .regex(/^\d+$/, { message: "Le code OTP ne doit contenir que des chiffres." }),
  password: z
    .string()
    .min(8, { message: "Le mot de passe doit contenir au moins 8 caractères." })
    .regex(/[A-Z]/, { message: "Le mot de passe doit contenir au moins une majuscule." })
    .regex(/[0-9]/, { message: "Le mot de passe doit contenir au moins un chiffre." }),
  specialization: z
    .string()
    .min(2, { message: "La spécialisation est requise (ex: Informatique)." }),
  modules: z
    .string()
    .min(2, { message: "Veuillez lister au moins un module enseigné." }),
});

type TeacherActivationInput = z.infer<typeof teacherActivationSchema>;

export default function TeacherActivationForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get('email');

  const [globalError, setGlobalError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // 1. Initialize React Hook Form
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<TeacherActivationInput>({
    resolver: zodResolver(teacherActivationSchema),
    defaultValues: {
      pin: '',
      password: '',
      specialization: '',
      modules: '',
    },
  });

  // 2. Setup Mutation for Teacher Activation
  const activationMutation = useMutation({
    mutationFn: async (data: TeacherActivationInput) => {
      // The backend validates the single-use OTP, hashes the password, 
      // and updates the Teacher profile metadata.
      const response = await apiClient.post('/auth/activate/teacher', {
        email,
        otp: data.pin,
        password: data.password,
        specialization: data.specialization,
        modules: data.modules.split(',').map((m) => m.trim()), // Format to array
      });
      return response.data;
    },
    onSuccess: () => {
      setGlobalError(null);
      setSuccessMessage('Profil enseignant activé avec succès ! Redirection vers la connexion...');
      // Redirect to login after 2 seconds
      setTimeout(() => router.push('/login'), 2000);
    },
    onError: (error: any) => {
      console.error('[Teacher Activation Error]', error);
      const message = error.response?.data?.message || "Le code d'invitation est invalide ou expiré.";
      setGlobalError(message);
    },
  });

  // 3. Submit Handler
  const onSubmit = (data: TeacherActivationInput) => {
    if (!email) {
      setGlobalError("Email introuvable. Veuillez utiliser le lien fourni dans votre email d'invitation.");
      return;
    }
    activationMutation.mutate(data);
  };

  if (!email) {
    return (
      <div className="w-full max-w-md p-8 text-center bg-white rounded-xl shadow-md border border-gray-100">
        <AlertCircle className="w-12 h-12 mx-auto text-red-500 mb-4" />
        <h2 className="text-xl font-bold text-gray-900">Lien invalide</h2>
        <p className="mt-2 text-sm text-gray-500">
          Veuillez cliquer sur le lien d'activation sécurisé reçu par email.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-xl p-8 space-y-6 bg-white rounded-xl shadow-md border border-gray-100 mx-auto">
      <div className="space-y-2 text-center">
        <div className="flex justify-center mb-2">
          <div className="p-3 bg-blue-50 rounded-full">
            <ShieldCheck className="w-8 h-8 text-blue-600" />
          </div>
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Activation Enseignant</h1>
        <p className="text-sm text-gray-500">
          Bienvenue sur ATLAS. Complétez votre profil pour le compte <br />
          <span className="font-medium text-gray-900">{email}</span>
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left Column: Security */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-900 border-b pb-2">Sécurité</h3>
            
            <div className="space-y-2 text-center">
              <label htmlFor="pin" className="text-sm font-medium leading-none text-left block">
                Code d'invitation (OTP)
              </label>
              <input
                id="pin"
                type="text"
                maxLength={6}
                placeholder="000000"
                {...register('pin')}
                className={`flex h-12 w-full text-center text-xl tracking-[0.5em] rounded-md border bg-transparent px-3 py-2 font-mono placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent ${
                  errors.pin ? 'border-red-500 focus:ring-red-600' : 'border-gray-300'
                }`}
              />
              {errors.pin && (
                <p className="text-xs font-medium text-red-500 text-left">{errors.pin.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium leading-none">
                Nouveau mot de passe
              </label>
              <input
                id="password"
                type="password"
                {...register('password')}
                className={`flex h-10 w-full rounded-md border bg-transparent px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent ${
                  errors.password ? 'border-red-500 focus:ring-red-600' : 'border-gray-300'
                }`}
              />
              {errors.password && (
                <p className="text-xs font-medium text-red-500">{errors.password.message}</p>
              )}
            </div>
          </div>

          {/* Right Column: Profile */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-900 border-b pb-2 flex items-center">
              <BookOpen className="w-4 h-4 mr-2" /> Profil Académique
            </h3>

            <div className="space-y-2">
              <label htmlFor="specialization" className="text-sm font-medium leading-none">
                Spécialisation
              </label>
              <input
                id="specialization"
                type="text"
                placeholder="ex: Génie Logiciel"
                {...register('specialization')}
                className={`flex h-10 w-full rounded-md border bg-transparent px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent ${
                  errors.specialization ? 'border-red-500 focus:ring-red-600' : 'border-gray-300'
                }`}
              />
              {errors.specialization && (
                <p className="text-xs font-medium text-red-500">{errors.specialization.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <label htmlFor="modules" className="text-sm font-medium leading-none">
                Modules Enseignés
              </label>
              <textarea
                id="modules"
                placeholder="ex: Algorithmique, Base de données (séparés par des virgules)"
                rows={3}
                {...register('modules')}
                className={`flex w-full rounded-md border bg-transparent px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent resize-none ${
                  errors.modules ? 'border-red-500 focus:ring-red-600' : 'border-gray-300'
                }`}
              />
              {errors.modules && (
                <p className="text-xs font-medium text-red-500">{errors.modules.message}</p>
              )}
            </div>
          </div>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={activationMutation.isPending || !!successMessage}
          className="inline-flex items-center justify-center w-full h-10 px-4 py-2 mt-4 text-sm font-medium text-white transition-colors bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none"
        >
          {activationMutation.isPending ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Activation en cours...
            </>
          ) : (
            'Activer mon profil enseignant'
          )}
        </button>
      </form>
    </div>
  );
}