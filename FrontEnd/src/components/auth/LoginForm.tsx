'use client';

// ============================================================================
// ATLAS - Login Form Component
// Author: Mouhamed (Lead FE)
// Description: Handles user authentication, Zod validation, and intelligent
// role-based redirection using Next.js App Router and Zustand.
// ============================================================================

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';

import { loginSchema, LoginInput } from '@/lib/validations/auth.schema';
import { apiClient } from '@/lib/api/axios.client';
import { useAuthStore, User } from '@/store/auth.store';

export default function LoginForm() {
  const router = useRouter();
  const setAuth = useAuthStore((state) => state.setAuth);
  const [globalError, setGlobalError] = useState<string | null>(null);

  // 1. Initialize React Hook Form with Zod strictly
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  // 2. Setup TanStack Query Mutation for the API call
  const loginMutation = useMutation({
    mutationFn: async (credentials: LoginInput) => {
      // The backend handles the JWT generation and sets the httpOnly cookie
      const response = await apiClient.post<{ user: User }>('/auth/login', credentials);
      return response.data.user;
    },
    onSuccess: (user) => {
      // 3. Update global state
      setAuth(user);
      setGlobalError(null);

      // 4. Intelligent role-based redirection
      if (user.role === 'TEACHER') {
        router.push('/teacher');
      } else if (user.role === 'ADMIN') {
        router.push('/admin/dashboard');
      } else {
        router.push('/dashboard');
      }
    },
    onError: (error: any) => {
      console.error('[Login Error]', error);
      // Extract backend error message if available, otherwise generic
      const message = error.response?.data?.message || 'Identifiants invalides. Veuillez réessayer.';
      setGlobalError(message);
    },
  });

  // 5. Submit Handler
  const onSubmit = (data: LoginInput) => {
    loginMutation.mutate(data);
  };

  return (
    <div className="w-full max-w-md p-8 space-y-6 bg-white rounded-xl shadow-md border border-gray-100">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Bienvenue sur ATLAS</h1>
        <p className="text-sm text-gray-500">Connectez-vous à votre compte pour continuer</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* Global Error Banner */}
        {globalError && (
          <div className="p-3 text-sm font-medium text-red-800 bg-red-100 rounded-md">
            {globalError}
          </div>
        )}

        {/* Email Field */}
        <div className="space-y-2">
          <label htmlFor="email" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
            Email
          </label>
          <input
            id="email"
            type="email"
            placeholder="etudiant@fss.rnu.tn"
            {...register('email')}
            className={`flex h-10 w-full rounded-md border bg-transparent px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50 ${
              errors.email ? 'border-red-500 focus:ring-red-600' : 'border-gray-300'
            }`}
          />
          {errors.email && (
            <p className="text-sm font-medium text-red-500">{errors.email.message}</p>
          )}
        </div>

        {/* Password Field */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
              Mot de passe
            </label>
            {/* FIXED: Using Next.js Link instead of a tag */}
            <Link href="/forgot-password" className="text-sm font-medium text-blue-600 hover:text-blue-500">
              Mot de passe oublié ?
            </Link>
          </div>
          <input
            id="password"
            type="password"
            {...register('password')}
            className={`flex h-10 w-full rounded-md border bg-transparent px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50 ${
              errors.password ? 'border-red-500 focus:ring-red-600' : 'border-gray-300'
            }`}
          />
          {errors.password && (
            <p className="text-sm font-medium text-red-500">{errors.password.message}</p>
          )}
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={loginMutation.isPending}
          className="inline-flex items-center justify-center w-full h-10 px-4 py-2 text-sm font-medium text-white transition-colors bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none"
        >
          {loginMutation.isPending ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Connexion en cours...
            </>
          ) : (
            'Se connecter'
          )}
        </button>
      </form>
    </div>
  );
}