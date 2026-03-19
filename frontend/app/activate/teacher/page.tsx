"use client";

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import api from '@/lib/api';

function TeacherActivationForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  
  // --- Form State ---
  const [step, setStep] = useState<number>(0); // 0 = Validating, 1 = Email, 2 = OTP & Password, 3 = Profile
  const [email, setEmail] = useState<string>('');
  const [otpCode, setOtpCode] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  
  const [specialization, setSpecialization] = useState<string>('');
  const [modules, setModules] = useState<string>('');

  // --- UI State ---
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false);

  // --- Initial Gate Check ---
  useEffect(() => {
    const validateToken = async () => {
      if (!token) {
        setFatalError('Missing invitation token. Please use the exact link provided in your email.');
        return;
      }

      try {
        // Hit the Gate Endpoint
        await api.get(`/auth/validate-invite?token=${token}`);
        setStep(1); // Proceed to Step 1 if valid
      } catch (err: any) {
        setFatalError(err.response?.data?.detail || 'This invitation link is invalid, consumed, or has expired.');
      }
    };

    validateToken();
  }, [token]);

  // --- Handlers ---
  const handleRequestOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    if (!email) {
      setError('Please enter your email address.');
      setIsLoading(false);
      return;
    }

    try {
      // SOTA FIX: Dispatch to the isolated teacher-specific OTP endpoint
      await api.post('/auth/request-teacher-otp', { email, token });
      setStep(2);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to send OTP. Ensure your email matches the invitation.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifySecurity = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!otpCode || !password || !confirmPassword) {
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

    setStep(3);
  };

  const handleFinalSubmit = async (e: React.FormEvent) => {
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
        token,
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
      setError(err.response?.data?.detail || 'Activation failed. The code may be invalid or expired.');
      // Kick back to OTP step if activation fails
      setStep(2);
    } finally {
      setIsLoading(false);
    }
  };

  // --- Renderers ---
  if (fatalError) {
    return (
      <div className="text-center">
        <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100 mb-6">
          <svg className="h-8 w-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h2>
        <p className="text-gray-600 mb-6">{fatalError}</p>
      </div>
    );
  }

  if (step === 0) {
    return (
      <div className="text-center py-10">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
        <p className="mt-4 text-gray-600">Verifying secure connection...</p>
      </div>
    );
  }

  if (success) {
    return (
      <div className="text-center border border-green-100 p-8 rounded-xl bg-white">
        <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-100 mb-6">
          <svg className="h-8 w-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Account Activated!</h2>
        <p className="text-gray-600">Your teacher profile has been verified and created.</p>
        <p className="text-sm text-gray-500 mt-4 animate-pulse">Redirecting to login...</p>
      </div>
    );
  }

  return (
    <>
      <div className="text-center mb-8">
        <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight">ATLAS Onboarding</h2>
        <p className="text-sm text-gray-500 mt-2">
          {step === 1 && "Step 1: Identify your account"}
          {step === 2 && "Step 2: Secure your credentials"}
          {step === 3 && "Step 3: Complete your profile"}
        </p>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border-l-4 border-red-500 p-4 rounded-md">
          <p className="text-sm text-red-700 font-medium">{error}</p>
        </div>
      )}

      {/* Step 1: Request OTP */}
      {step === 1 && (
        <form onSubmit={handleRequestOTP} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700">Institutional Email Address</label>
            <input
              type="email"
              required
              className="mt-1 appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="prof@university.edu"
            />
            <p className="mt-2 text-xs text-gray-500">
              Please enter the exact email address where you received this invitation.
            </p>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 mt-6 disabled:opacity-50"
          >
            {isLoading ? 'Sending...' : 'Request OTP Code'}
          </button>
        </form>
      )}

      {/* Step 2: Verify OTP & Password */}
      {step === 2 && (
        <form onSubmit={handleVerifySecurity} className="space-y-5">
          <div className="bg-blue-50 p-4 rounded-md mb-4 border border-blue-100">
            <p className="text-sm text-blue-800">
              We've sent a 6-digit code to <strong>{email}</strong>.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">6-Digit Verification Code</label>
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
            <label className="block text-sm font-medium text-gray-700">Set Secure Password</label>
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

          <div className="flex space-x-3 pt-4">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="flex-1 py-2.5 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Back
            </button>
            <button
              type="submit"
              className="flex-1 flex justify-center py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Continue
            </button>
          </div>
        </form>
      )}

      {/* Step 3: Profile Completion */}
      {step === 3 && (
        <form onSubmit={handleFinalSubmit} className="space-y-5">
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
              onClick={() => setStep(2)}
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
    </>
  );
}

// Wrapper component to satisfy Next.js Suspense boundary requirements for useSearchParams
export default function TeacherActivationPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full bg-white p-8 rounded-xl shadow-md border border-gray-100">
        <Suspense fallback={
          <div className="text-center py-10">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading secure environment...</p>
          </div>
        }>
          <TeacherActivationForm />
        </Suspense>
      </div>
    </div>
  );
}