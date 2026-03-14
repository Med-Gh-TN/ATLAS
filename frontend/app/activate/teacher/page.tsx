"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';

export default function TeacherActivationPage() {
  const router = useRouter();
  
  // --- Form State ---
  const [step, setStep] = useState<number>(1);
  const [email, setEmail] = useState<string>('');
  const [otpCode, setOtpCode] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  
  const [specialization, setSpecialization] = useState<string>('');
  const [modules, setModules] = useState<string>('');

  // --- UI State ---
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false);

  // --- Handlers ---
  const handleNextStep = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email || !otpCode || !password || !confirmPassword) {
      setError('Please fill in all security fields.');
      return;
    }
    
    if (otpCode.length !== 6) {
      setError('OTP code must be exactly 6 digits.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    setStep(2);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    if (!specialization || !modules) {
      setError('Please complete your profile information.');
      setIsLoading(false);
      return;
    }

    try {
      // Dispatch atomic activation payload to the backend
      await api.post('/auth/activate-teacher', {
        email,
        otp_code: otpCode,
        password,
        specialization,
        modules,
      });

      setSuccess(true);
      
      // Redirect to login after 3 seconds
      setTimeout(() => {
        router.push('/auth/login');
      }, 3000);

    } catch (err: any) {
      if (err.response && err.response.data && err.response.data.detail) {
        setError(err.response.data.detail);
      } else {
        setError('Activation failed. The code may be invalid or expired.');
      }
      // Kick back to step 1 if it's an OTP error
      setStep(1);
    } finally {
      setIsLoading(false);
    }
  };

  // --- Renderers ---
  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full bg-white p-8 rounded-xl shadow-md text-center border border-green-100">
          <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-100 mb-6">
            <svg className="h-8 w-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Account Activated!</h2>
          <p className="text-gray-600">Your teacher profile has been verified and created.</p>
          <p className="text-sm text-gray-500 mt-4 animate-pulse">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full bg-white p-8 rounded-xl shadow-md border border-gray-100">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight">ATLAS Onboarding</h2>
          <p className="text-sm text-gray-500 mt-2">Complete your teacher profile activation</p>
        </div>

        {error && (
          <div className="mb-6 bg-red-50 border-l-4 border-red-500 p-4 rounded-md">
            <p className="text-sm text-red-700 font-medium">{error}</p>
          </div>
        )}

        {/* Step 1: Security */}
        {step === 1 && (
          <form onSubmit={handleNextStep} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700">Email Address</label>
              <input
                type="email"
                required
                className="mt-1 appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="prof@university.edu"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">6-Digit Onboarding Code (OTP)</label>
              <input
                type="text"
                required
                maxLength={6}
                className="mt-1 appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 text-center tracking-widest sm:text-lg font-mono"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))} // Digits only
                placeholder="000000"
              />
            </div>

            <div className="border-t border-gray-200 pt-5 mt-5">
              <label className="block text-sm font-medium text-gray-700">Set New Password</label>
              <input
                type="password"
                required
                className="mt-1 appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Confirm Password</label>
              <input
                type="password"
                required
                className="mt-1 appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>

            <button
              type="submit"
              className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 mt-6"
            >
              Continue to Profile
            </button>
          </form>
        )}

        {/* Step 2: Profile Completion */}
        {step === 2 && (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700">Primary Specialization</label>
              <input
                type="text"
                required
                className="mt-1 appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                value={specialization}
                onChange={(e) => setSpecialization(e.target.value)}
                placeholder="e.g., Artificial Intelligence, Database Systems"
              />
              <p className="mt-1 text-xs text-gray-500">Your main field of expertise.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Taught Modules</label>
              <textarea
                required
                rows={3}
                className="mt-1 appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                value={modules}
                onChange={(e) => setModules(e.target.value)}
                placeholder="e.g., Machine Learning 101, Data Structures..."
              />
              <p className="mt-1 text-xs text-gray-500">Comma-separated list of modules you teach.</p>
            </div>

            <div className="flex space-x-3 pt-4">
              <button
                type="button"
                onClick={() => setStep(1)}
                disabled={isLoading}
                className="flex-1 py-2.5 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="flex-1 flex justify-center py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
              >
                {isLoading ? 'Activating...' : 'Activate Account'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}