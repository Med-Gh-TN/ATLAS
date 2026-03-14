"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { z } from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { AxiosError } from "axios"
import api from "@/lib/api"

// --- Constants ---
const FILIERES = ["Computer Science", "Mathematics", "Physics", "Biology", "Chemistry"] as const
const LEVELS = ["L1", "L2", "L3", "M1", "M2"] as const
const OTP_TTL_SECONDS = 24 * 60 * 60 // 24 hours per US-04

// --- Zod Validation Schemas ---
const registerSchema = z.object({
  full_name: z.string().min(2, "Full name must be at least 2 characters."),
  email: z.string().email("Please enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters long."),
  filiere: z.enum(FILIERES, { errorMap: () => ({ message: "Please select a valid major." }) }),
  level: z.enum(LEVELS, { errorMap: () => ({ message: "Please select a valid level." }) }),
})

const otpSchema = z.object({
  code: z.string().length(6, "The verification code must be exactly 6 digits."),
})

// --- Type Definitions ---
type RegisterFormValues = z.infer<typeof registerSchema>
type OtpFormValues = z.infer<typeof otpSchema>

export default function RegisterPage() {
  const router = useRouter()
  
  // View State
  const [isVerifying, setIsVerifying] = useState(false)
  const [registeredEmail, setRegisteredEmail] = useState("")
  
  // API State
  const [globalError, setGlobalError] = useState("")
  const [successMsg, setSuccessMsg] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  
  // Countdown State (24 hours)
  const [timeLeft, setTimeLeft] = useState(OTP_TTL_SECONDS)

  // --- Form Hooks ---
  const registerForm = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      full_name: "",
      email: "",
      password: "",
      filiere: FILIERES[0],
      level: LEVELS[0]
    }
  })

  const otpForm = useForm<OtpFormValues>({
    resolver: zodResolver(otpSchema),
    defaultValues: { code: "" }
  })

  // --- Countdown Timer Effect ---
  useEffect(() => {
    if (!isVerifying || timeLeft <= 0) return

    const timerId = setInterval(() => {
      setTimeLeft((prev) => prev - 1)
    }, 1000)

    return () => clearInterval(timerId)
  }, [isVerifying, timeLeft])

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    return `${h.toString().padStart(2, '0')}h ${m.toString().padStart(2, '0')}m ${s.toString().padStart(2, '0')}s`
  }

  // --- Helpers ---
  const handleAxiosError = (err: unknown, defaultMsg: string) => {
    if (err instanceof AxiosError) {
      const detail = err.response?.data?.detail;
      if (Array.isArray(detail)) {
        setGlobalError(detail[0].msg || "Validation error occurred.");
      } else {
        setGlobalError(typeof detail === 'string' ? detail : defaultMsg);
      }
    } else {
      setGlobalError("An unexpected error occurred.")
    }
  }

  const clearMessages = () => {
    setGlobalError("")
    setSuccessMsg("")
  }

  // --- Submit Handlers ---
  const onRegisterSubmit = async (data: RegisterFormValues) => {
    clearMessages()
    setIsLoading(true)
    
    try {
      // Backend expects 'role' as well for default registrations
      const payload = { ...data, role: "STUDENT" }
      await api.post('/auth/register', payload)
      
      setRegisteredEmail(data.email)
      setIsVerifying(true)
      setTimeLeft(OTP_TTL_SECONDS) // Start 24h countdown
    } catch (err) {
      handleAxiosError(err, "Failed to create account. Email might be taken.")
    } finally {
      setIsLoading(false)
    }
  }

  const onVerifySubmit = async (data: OtpFormValues) => {
    clearMessages()
    setIsLoading(true)

    try {
      await api.post('/auth/verify-otp', {
        email: registeredEmail,
        code: data.code
      })
      // Success: User is now verified and can log in
      router.push('/auth/login?verified=true')
    } catch (err) {
      handleAxiosError(err, "Invalid or expired verification code.")
    } finally {
      setIsLoading(false)
    }
  }

  const handleResendOTP = async () => {
    clearMessages()
    setIsLoading(true)

    try {
      await api.post('/auth/request-otp', { email: registeredEmail })
      setTimeLeft(OTP_TTL_SECONDS) // Reset countdown
      setSuccessMsg("A new code has been sent to your email.")
      otpForm.reset()
    } catch (err) {
      handleAxiosError(err, "Failed to resend code. Please try again later.")
    } finally {
      setIsLoading(false)
    }
  }

  // --- UI RENDERING BLOCKS ---
  
  const renderRegisterForm = () => (
    <form className="space-y-6" onSubmit={registerForm.handleSubmit(onRegisterSubmit)}>
      <div>
        <label htmlFor="full_name" className="block text-sm font-medium text-neutral-700">Full Name</label>
        <input
          id="full_name" type="text"
          {...registerForm.register("full_name")}
          className={`mt-2 block w-full rounded-lg border px-3 py-2 text-neutral-900 focus:ring-1 transition-colors sm:text-sm ${
            registerForm.formState.errors.full_name ? "border-red-500 focus:border-red-500 focus:ring-red-500" : "border-neutral-200 focus:border-neutral-900 focus:ring-neutral-900"
          }`}
          placeholder="John Doe"
        />
        {registerForm.formState.errors.full_name && (
          <p className="mt-1 text-xs text-red-600">{registerForm.formState.errors.full_name.message}</p>
        )}
      </div>

      <div>
        <label htmlFor="email" className="block text-sm font-medium text-neutral-700">Email address</label>
        <input
          id="email" type="email"
          {...registerForm.register("email")}
          className={`mt-2 block w-full rounded-lg border px-3 py-2 text-neutral-900 focus:ring-1 transition-colors sm:text-sm ${
            registerForm.formState.errors.email ? "border-red-500 focus:border-red-500 focus:ring-red-500" : "border-neutral-200 focus:border-neutral-900 focus:ring-neutral-900"
          }`}
          placeholder="you@university.edu"
        />
        {registerForm.formState.errors.email && (
          <p className="mt-1 text-xs text-red-600">{registerForm.formState.errors.email.message}</p>
        )}
      </div>

      <div>
        <label htmlFor="password" name="password" className="block text-sm font-medium text-neutral-700">Password</label>
        <input
          id="password" type="password"
          {...registerForm.register("password")}
          className={`mt-2 block w-full rounded-lg border px-3 py-2 text-neutral-900 focus:ring-1 transition-colors sm:text-sm ${
            registerForm.formState.errors.password ? "border-red-500 focus:border-red-500 focus:ring-red-500" : "border-neutral-200 focus:border-neutral-900 focus:ring-neutral-900"
          }`}
          placeholder="••••••••"
        />
        {registerForm.formState.errors.password && (
          <p className="mt-1 text-xs text-red-600">{registerForm.formState.errors.password.message}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="filiere" className="block text-sm font-medium text-neutral-700">Major</label>
          <select
            id="filiere"
            {...registerForm.register("filiere")}
            className="mt-2 block w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm focus:border-neutral-900 focus:ring-neutral-900"
          >
            {FILIERES.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
          {registerForm.formState.errors.filiere && (
            <p className="mt-1 text-xs text-red-600">{registerForm.formState.errors.filiere.message}</p>
          )}
        </div>
        <div>
          <label htmlFor="level" className="block text-sm font-medium text-neutral-700">Level</label>
          <select
            id="level"
            {...registerForm.register("level")}
            className="mt-2 block w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm focus:border-neutral-900 focus:ring-neutral-900"
          >
            {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          {registerForm.formState.errors.level && (
            <p className="mt-1 text-xs text-red-600">{registerForm.formState.errors.level.message}</p>
          )}
        </div>
      </div>

      <button
        type="submit" disabled={isLoading}
        className="flex w-full justify-center items-center rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-70 transition-all"
      >
        {isLoading ? "Creating..." : "Create Account"}
      </button>
    </form>
  )

  const renderOtpForm = () => (
    <form className="space-y-6" onSubmit={otpForm.handleSubmit(onVerifySubmit)}>
      <div>
        <label htmlFor="otp" className="block text-sm font-medium text-neutral-700 text-center">
          Enter 6-digit code
        </label>
        <div className="mt-4">
          <input
            id="otp" type="text" maxLength={6} autoFocus
            {...otpForm.register("code")}
            onChange={(e) => {
              const val = e.target.value.replace(/\D/g, "");
              otpForm.setValue("code", val, { shouldValidate: true });
            }}
            className={`block w-full text-center text-3xl tracking-[1rem] font-bold appearance-none rounded-lg border px-3 py-3 text-neutral-900 focus:outline-none focus:ring-1 transition-colors ${
              otpForm.formState.errors.code ? "border-red-500 focus:border-red-500 focus:ring-red-500" : "border-neutral-200 bg-white focus:border-neutral-900 focus:ring-neutral-900"
            }`}
            placeholder="000000"
          />
        </div>
        {otpForm.formState.errors.code && (
          <p className="mt-2 text-xs text-center text-red-600">{otpForm.formState.errors.code.message}</p>
        )}
      </div>

      <div className="text-center">
        <div className="inline-flex items-center justify-center rounded-full bg-neutral-100 px-3 py-1 text-sm font-medium text-neutral-800">
          <svg className="mr-1.5 h-4 w-4 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Expires in: <span className="ml-1 font-bold font-mono">{formatTime(timeLeft)}</span>
        </div>
      </div>

      <button
        type="submit" disabled={isLoading || timeLeft <= 0}
        className="flex w-full justify-center items-center rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-70 transition-all"
      >
        {isLoading ? "Verifying..." : "Verify Code"}
      </button>

      <div className="flex flex-col space-y-3 text-center">
        <button 
          type="button" onClick={handleResendOTP} disabled={isLoading}
          className="text-sm font-medium text-neutral-600 hover:text-neutral-900 transition-colors disabled:opacity-50"
        >
          Didn't receive a code? Resend
        </button>
        <button 
          type="button" onClick={() => { setIsVerifying(false); clearMessages(); }}
          className="text-xs text-neutral-400 hover:text-neutral-700 transition-colors"
        >
          ← Back to registration
        </button>
      </div>
    </form>
  )

  return (
    <div className="flex min-h-screen flex-col justify-center bg-neutral-50 py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 className="mt-6 text-center text-3xl font-bold tracking-tight text-neutral-900">
          {isVerifying ? "Verify your email" : "Join ATLAS"}
        </h2>
        <p className="mt-2 text-center text-sm text-neutral-500">
          {isVerifying 
            ? `We've sent a 6-digit code to ${registeredEmail}` 
            : "Set up your academic profile to access resources and contribute."}
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white px-4 py-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] sm:rounded-2xl sm:px-10 border border-neutral-100">
          
          {globalError && (
            <div className="mb-6 rounded-lg bg-red-50/50 p-4 border border-red-100">
              <div className="text-sm font-medium text-red-600">{globalError}</div>
            </div>
          )}

          {successMsg && (
            <div className="mb-6 rounded-lg bg-green-50/50 p-4 border border-green-100">
              <div className="text-sm font-medium text-green-700">{successMsg}</div>
            </div>
          )}

          {!isVerifying ? renderRegisterForm() : renderOtpForm()}

          {!isVerifying && (
            <div className="mt-8 text-center text-sm text-neutral-500">
              Already have an account?{' '}
              <a href="/auth/login" className="font-medium text-neutral-900 hover:underline">Sign in</a>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}