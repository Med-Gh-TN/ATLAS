"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { z } from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { AxiosError } from "axios"
import api from "@/lib/api"
import { useAuthStore } from "@/lib/store/useAuthStore"

// --- Zod Validation Schemas ---

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address."),
  password: z.string().min(1, "Password is required."),
})

const forgotPasswordSchema = z.object({
  email: z.string().email("Please enter a valid email address."),
})

const resetPasswordSchema = z.object({
  code: z.string().length(6, "The recovery code must be exactly 6 digits."),
  new_password: z.string().min(8, "Password must be at least 8 characters long."),
})

// --- Type Definitions ---
type AuthState = "LOGIN" | "FORGOT_PASSWORD" | "VERIFY_OTP"

type LoginFormValues = z.infer<typeof loginSchema>
type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>
type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>

export default function LoginPage() {
  const router = useRouter()
  const setGlobalUser = useAuthStore((state) => state.login)
  
  const [authState, setAuthState] = useState<AuthState>("LOGIN")
  const [recoveryEmail, setRecoveryEmail] = useState("") // Tracks email between steps
  
  const [globalError, setGlobalError] = useState("")
  const [successMsg, setSuccessMsg] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  // --- Form Hooks ---
  
  const loginForm = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" }
  })

  const forgotPasswordForm = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" }
  })

  const resetPasswordForm = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { code: "", new_password: "" }
  })

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
      setGlobalError("An unexpected error occurred. Please try again.")
    }
  }

  const clearMessages = () => {
    setGlobalError("")
    setSuccessMsg("")
  }

  // --- Submit Handlers ---

  const onLoginSubmit = async (data: LoginFormValues) => {
    clearMessages()
    setIsLoading(true)
    
    try {
      // 1. Authenticate and get tokens
      const formData = new URLSearchParams()
      formData.append('username', data.email)
      formData.append('password', data.password)
      
      const response = await api.post('/auth/login', formData, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
      
      const { access_token } = response.data
      
      // 2. Securely store the access token (Refresh token is handled via httpOnly cookie)
      if (typeof window !== 'undefined') {
        localStorage.setItem('accessToken', access_token)
      }
      
      // 3. Fetch user profile to populate global state and determine role
      const userResponse = await api.get('/auth/me')
      const user = userResponse.data
      
      setGlobalUser(user)
      
      // 4. Smart Role-Based Redirection (US-04)
      const role = user.role?.toUpperCase() || ""
      if (role === "TEACHER") {
        router.push('/upload') // espace cours proxy
      } else if (role === "ADMIN") {
        router.push('/admin/moderation')
      } else {
        router.push('/search') // student dashboard proxy
      }
      
    } catch (err) {
      handleAxiosError(err, "Failed to sign in. Please check your credentials.")
    } finally {
      setIsLoading(false)
    }
  }

  const onForgotPasswordSubmit = async (data: ForgotPasswordFormValues) => {
    clearMessages()
    setIsLoading(true)

    try {
      await api.post('/auth/forgot-password', { email: data.email })
      setRecoveryEmail(data.email)
      setAuthState("VERIFY_OTP")
      setSuccessMsg(`We sent a recovery code to ${data.email}`)
    } catch (err) {
      handleAxiosError(err, "Failed to request password reset.")
    } finally {
      setIsLoading(false)
    }
  }

  const onResetPasswordSubmit = async (data: ResetPasswordFormValues) => {
    clearMessages()
    setIsLoading(true)

    try {
      await api.post('/auth/reset-password', { 
        email: recoveryEmail, 
        code: data.code,
        new_password: data.new_password 
      })
      
      setAuthState("LOGIN")
      loginForm.setValue("email", recoveryEmail)
      loginForm.setValue("password", "")
      resetPasswordForm.reset()
      setSuccessMsg("Password successfully reset! You can now log in.")
    } catch (err) {
      handleAxiosError(err, "Failed to reset password. The code might be expired.")
    } finally {
      setIsLoading(false)
    }
  }

  // --- UI RENDERING BLOCKS ---

  const renderLoginForm = () => (
    <form className="space-y-6" onSubmit={loginForm.handleSubmit(onLoginSubmit)}>
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-neutral-700">Email address</label>
        <input
          id="email" type="email"
          {...loginForm.register("email")}
          className={`mt-2 block w-full rounded-lg border px-3 py-2 text-neutral-900 focus:ring-1 transition-colors sm:text-sm ${
            loginForm.formState.errors.email ? "border-red-500 focus:border-red-500 focus:ring-red-500" : "border-neutral-200 focus:border-neutral-900 focus:ring-neutral-900"
          }`}
          placeholder="you@university.edu"
        />
        {loginForm.formState.errors.email && (
          <p className="mt-1 text-xs text-red-600">{loginForm.formState.errors.email.message}</p>
        )}
      </div>
      <div>
        <div className="flex items-center justify-between">
          <label htmlFor="password" className="block text-sm font-medium text-neutral-700">Password</label>
          <button 
            type="button" 
            onClick={() => { setAuthState("FORGOT_PASSWORD"); clearMessages(); }}
            className="text-sm font-medium text-neutral-500 hover:text-neutral-900 transition-colors"
          >
            Forgot password?
          </button>
        </div>
        <input
          id="password" type="password"
          {...loginForm.register("password")}
          className={`mt-2 block w-full rounded-lg border px-3 py-2 text-neutral-900 focus:ring-1 transition-colors sm:text-sm ${
            loginForm.formState.errors.password ? "border-red-500 focus:border-red-500 focus:ring-red-500" : "border-neutral-200 focus:border-neutral-900 focus:ring-neutral-900"
          }`}
          placeholder="••••••••"
        />
        {loginForm.formState.errors.password && (
          <p className="mt-1 text-xs text-red-600">{loginForm.formState.errors.password.message}</p>
        )}
      </div>
      <button
        type="submit" disabled={isLoading}
        className="flex w-full justify-center rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-70 transition-all"
      >
        {isLoading ? "Signing in..." : "Sign in"}
      </button>
      <div className="mt-8 text-center text-sm text-neutral-500">
        Don't have an account? <a href="/auth/register" className="font-medium text-neutral-900 hover:underline">Register now</a>
      </div>
    </form>
  )

  const renderForgotPasswordForm = () => (
    <form className="space-y-6" onSubmit={forgotPasswordForm.handleSubmit(onForgotPasswordSubmit)}>
      <div>
        <label htmlFor="reset-email" className="block text-sm font-medium text-neutral-700">
          Enter your registered email
        </label>
        <input
          id="reset-email" type="email" autoFocus
          {...forgotPasswordForm.register("email")}
          className={`mt-2 block w-full rounded-lg border px-3 py-2 text-neutral-900 focus:ring-1 transition-colors sm:text-sm ${
            forgotPasswordForm.formState.errors.email ? "border-red-500 focus:border-red-500 focus:ring-red-500" : "border-neutral-200 focus:border-neutral-900 focus:ring-neutral-900"
          }`}
          placeholder="you@university.edu"
        />
        {forgotPasswordForm.formState.errors.email && (
          <p className="mt-1 text-xs text-red-600">{forgotPasswordForm.formState.errors.email.message}</p>
        )}
      </div>
      <button
        type="submit" disabled={isLoading}
        className="flex w-full justify-center rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-70 transition-all"
      >
        {isLoading ? "Sending..." : "Send Recovery Code"}
      </button>
      <div className="text-center">
        <button 
          type="button" onClick={() => setAuthState("LOGIN")}
          className="text-xs text-neutral-500 hover:text-neutral-900 transition-colors"
        >
          ← Back to login
        </button>
      </div>
    </form>
  )

  const renderResetPasswordForm = () => (
    <form className="space-y-6" onSubmit={resetPasswordForm.handleSubmit(onResetPasswordSubmit)}>
      <div>
        <label htmlFor="otp" className="block text-sm font-medium text-neutral-700 text-center">
          Enter 6-digit recovery code
        </label>
        <input
          id="otp" type="text" maxLength={6} autoFocus
          {...resetPasswordForm.register("code")}
          onChange={(e) => {
            const val = e.target.value.replace(/\D/g, "");
            resetPasswordForm.setValue("code", val, { shouldValidate: true });
          }}
          className={`mt-4 block w-full text-center text-3xl tracking-[1rem] font-bold rounded-lg border px-3 py-3 text-neutral-900 focus:ring-1 transition-colors ${
            resetPasswordForm.formState.errors.code ? "border-red-500 focus:border-red-500 focus:ring-red-500" : "border-neutral-200 focus:border-neutral-900 focus:ring-neutral-900"
          }`}
          placeholder="000000"
        />
        {resetPasswordForm.formState.errors.code && (
          <p className="mt-1 text-xs text-center text-red-600">{resetPasswordForm.formState.errors.code.message}</p>
        )}
      </div>
      <div>
        <label htmlFor="new-password" className="block text-sm font-medium text-neutral-700">
          New Password
        </label>
        <input
          id="new-password" type="password"
          {...resetPasswordForm.register("new_password")}
          className={`mt-2 block w-full rounded-lg border px-3 py-2 text-neutral-900 focus:ring-1 transition-colors sm:text-sm ${
            resetPasswordForm.formState.errors.new_password ? "border-red-500 focus:border-red-500 focus:ring-red-500" : "border-neutral-200 focus:border-neutral-900 focus:ring-neutral-900"
          }`}
          placeholder="••••••••"
        />
        {resetPasswordForm.formState.errors.new_password && (
          <p className="mt-1 text-xs text-red-600">{resetPasswordForm.formState.errors.new_password.message}</p>
        )}
      </div>
      <button
        type="submit" disabled={isLoading}
        className="flex w-full justify-center rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-70 transition-all"
      >
        {isLoading ? "Resetting..." : "Reset Password"}
      </button>
      <div className="text-center">
        <button 
          type="button" onClick={() => { setAuthState("FORGOT_PASSWORD"); clearMessages(); }}
          className="text-xs text-neutral-500 hover:text-neutral-900 transition-colors"
        >
          Resend code
        </button>
      </div>
    </form>
  )

  return (
    <div className="flex min-h-screen flex-col justify-center bg-neutral-50 py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 className="mt-6 text-center text-3xl font-bold tracking-tight text-neutral-900">
          {authState === "LOGIN" && "Welcome back"}
          {authState === "FORGOT_PASSWORD" && "Recover Account"}
          {authState === "VERIFY_OTP" && "Set New Password"}
        </h2>
        <p className="mt-2 text-center text-sm text-neutral-500">
          {authState === "LOGIN" && "Enter your credentials to access your academic workspace."}
          {authState === "FORGOT_PASSWORD" && "Enter your email to receive a password reset code."}
          {authState === "VERIFY_OTP" && `Check your inbox for the recovery code.`}
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

          {authState === "LOGIN" && renderLoginForm()}
          {authState === "FORGOT_PASSWORD" && renderForgotPasswordForm()}
          {authState === "VERIFY_OTP" && renderResetPasswordForm()}

        </div>
      </div>
    </div>
  )
}