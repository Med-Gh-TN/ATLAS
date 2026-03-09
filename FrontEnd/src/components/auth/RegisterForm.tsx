'use client';

// ============================================================================
// ATLAS - Register Form Component
// Author: Mouhamed (Lead FE)
// Description: Handles student registration, strict Zod validation, and 
// routing to the OTP activation step.
// ============================================================================

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { Loader2, AlertCircle } from 'lucide-react';

import { registerSchema, RegisterInput } from '@/lib/validations/auth.schema';
import { apiClient } from '@/lib/api/axios.client';

export default function RegisterForm() {
  const router = useRouter();
  const [globalError, setGlobalError] = useState<string | null>(null);

  // 1. Initialize React Hook Form with Zod strictly
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      password: '',
    },
  });

  // 2. Setup TanStack Query Mutation for the API call
  const registerMutation = useMutation({
    mutationFn: async (data: RegisterInput) => {
      // The backend creates the user (isActive: false) and sends the OTP email
      const response = await apiClient.post('/auth/register', data);
      return response.data;
    },
    onSuccess: (_, variables) => {
      setGlobalError(null);
      // 3. Redirect to the OTP activation page with the email in the query string
      const encodedEmail = encodeURIComponent(variables.email);
      router.push(`/activate?email=${encodedEmail}`);
    },
    onError: (error: any) => {
      console.error('[Register Error]', error);
      // Handle HTTP 409 Conflict (Email already exists) or other backend errors
      const message = error.response?.data?.message || 'Une erreur est survenue lors de l\'inscription.';
      setGlobalError(message);
    },
  });

  // 4. Submit Handler
  const onSubmit = (data: RegisterInput) => {
    registerMutation.mutate(data);
  };

  return (
    <div className="w-full max-w-md p-8 space-y-6 bg-white rounded-xl shadow-md border border-gray-100">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Créer un compte</h1>
        <p className="text-sm text-gray-500">Rejoignez ATLAS en tant qu'étudiant</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* Global Error Banner */}
        {globalError && (
          <div className="flex items-center p-3 text-sm font-medium text-red-800 bg-red-100 rounded-md">
            <AlertCircle className="w-4 h-4 mr-2" />
            {globalError}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          {/* First Name Field */}
          <div className="space-y-2">
            <label htmlFor="firstName" className="text-sm font-medium leading-none">
              Prénom
            </label>
            <input
              id="firstName"
              type="text"
              placeholder="Ali"
              {...register('firstName')}
              className={`flex h-10 w-full rounded-md border bg-transparent px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent ${
                errors.firstName ? 'border-red-500 focus:ring-red-600' : 'border-gray-300'
              }`}
            />
            {errors.firstName && (
              <p className="text-xs font-medium text-red-500">{errors.firstName.message}</p>
            )}
          </div>

          {/* Last Name Field */}
          <div className="space-y-2">
            <label htmlFor="lastName" className="text-sm font-medium leading-none">
              Nom
            </label>
            <input
              id="lastName"
              type="text"
              placeholder="Ben Salah"
              {...register('lastName')}
              className={`flex h-10 w-full rounded-md border bg-transparent px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent ${
                errors.lastName ? 'border-red-500 focus:ring-red-600' : 'border-gray-300'
              }`}
            />
            {errors.lastName && (
              <p className="text-xs font-medium text-red-500">{errors.lastName.message}</p>
            )}
          </div>
        </div>

        {/* Email Field */}
        <div className="space-y-2">
          <label htmlFor="email" className="text-sm font-medium leading-none">
            Email institutionnel
          </label>
          <input
            id="email"
            type="email"
            placeholder="ali.bensalah@fss.rnu.tn"
            {...register('email')}
            className={`flex h-10 w-full rounded-md border bg-transparent px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent ${
              errors.email ? 'border-red-500 focus:ring-red-600' : 'border-gray-300'
            }`}
          />
          {errors.email && (
            <p className="text-xs font-medium text-red-500">{errors.email.message}</p>
          )}
        </div>

        {/* Password Field */}
        <div className="space-y-2">
          <label htmlFor="password" className="text-sm font-medium leading-none">
            Mot de passe
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
          <p className="text-xs text-gray-500">
            Min. 8 caractères, 1 majuscule, 1 chiffre.
          </p>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={registerMutation.isPending}
          className="inline-flex items-center justify-center w-full h-10 px-4 py-2 mt-4 text-sm font-medium text-white transition-colors bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none"
        >
          {registerMutation.isPending ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Inscription en cours...
            </>
          ) : (
            "S'inscrire"
          )}
        </button>

        <div className="text-sm text-center text-gray-500">
          Vous avez déjà un compte ?{' '}
          <a href="/login" className="font-medium text-blue-600 hover:text-blue-500">
            Connectez-vous
          </a>
        </div>
      </form>
    </div>
  );
}