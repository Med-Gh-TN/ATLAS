'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { LogOut, User as UserIcon, Shield, BookOpen, GraduationCap } from 'lucide-react';

import { useAuthStore } from '@/store/auth.store';
import { apiClient } from '@/lib/api/axios.client';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { user, clearAuth } = useAuthStore();

  // Logout Mutation: Hits Tony's backend to clear the httpOnly cookie, 
  // then wipes the Zustand store and redirects.
  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiClient.post('/auth/logout');
    },
    onSettled: () => {
      // Whether the backend call succeeds or fails, we forcefully clear 
      // the local session to prevent the user from being stuck.
      clearAuth();
      router.push('/login');
    },
  });

  const handleLogout = () => {
    logoutMutation.mutate();
  };

  // Dynamic icon based on user role
  const RoleIcon = 
    user?.role === 'ADMIN' ? Shield : 
    user?.role === 'TEACHER' ? BookOpen : 
    GraduationCap;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* SOTA Topbar */}
      <nav className="sticky top-0 z-50 w-full bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            {/* Left side: Branding */}
            <div className="flex items-center space-x-3">
              <div className="flex items-center justify-center w-8 h-8 bg-blue-600 rounded-md">
                <span className="text-lg font-bold text-white">A</span>
              </div>
              <span className="text-xl font-bold tracking-tight text-gray-900">
                ATLAS
              </span>
              {user?.role && (
                <span className="hidden md:inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 uppercase tracking-wider">
                  <RoleIcon className="w-3 h-3 mr-1" />
                  {user.role}
                </span>
              )}
            </div>

            {/* Right side: User Profile & Logout */}
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2 text-sm text-gray-700">
                <UserIcon className="w-4 h-4 text-gray-400" />
                <span className="font-medium">
                  {user?.firstName && user?.lastName 
                    ? `${user.firstName} ${user.lastName}`
                    : user?.email || 'Loading...'}
                </span>
              </div>
              
              <div className="h-6 w-px bg-gray-200" aria-hidden="true" />
              
              <button
                onClick={handleLogout}
                disabled={logoutMutation.isPending}
                className="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-500 transition-colors rounded-md hover:text-red-600 hover:bg-red-50 disabled:opacity-50"
                title="Déconnexion"
              >
                <LogOut className="w-4 h-4 mr-2" />
                {logoutMutation.isPending ? '...' : 'Logout'}
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content Assembly Line */}
      <main className="flex-1 w-full max-w-7xl mx-auto">
        {children}
      </main>
    </div>
  );
}