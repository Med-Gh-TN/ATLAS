'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '../lib/store/useAuthStore';
import api from '../lib/api';
import { 
  BookOpen, 
  Search, 
  Upload, 
  Shield, 
  LogOut, 
  Menu, 
  X,
  User as UserIcon
} from 'lucide-react';

export default function GlobalHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, user, logout } = useAuthStore();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // RBAC Derived State
  const isAdmin = user?.role === 'ADMIN';
  const isTeacher = user?.role === 'TEACHER';

  const handleLogout = async () => {
    try {
      // 1. Invalidate the HttpOnly refresh cookie in the backend/Redis
      await api.post('/auth/logout');
    } catch (error) {
      console.error('Failed to invalidate session on server:', error);
    } finally {
      // 2. Purge client-side access token and Zustand state
      logout();
      router.push('/auth/login');
    }
  };

  // Helper to determine active route styling
  const isActive = (path: string) => pathname?.startsWith(path);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-neutral-200 bg-white/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          
          {/* Logo & Brand */}
          <div className="flex-shrink-0 flex items-center">
            <Link href={isAuthenticated ? "/search" : "/"} className="flex items-center gap-2 group">
              <div className="p-2 bg-neutral-900 rounded-lg text-white group-hover:bg-neutral-800 transition-colors">
                <BookOpen className="w-5 h-5" />
              </div>
              <span className="font-bold text-xl tracking-tight text-neutral-900">ATLAS</span>
            </Link>
          </div>

          {/* Desktop Navigation */}
          {isAuthenticated && (
            <nav className="hidden md:flex items-center space-x-1 lg:space-x-2">
              <Link 
                href="/search" 
                className={`px-3 py-2 rounded-md text-sm font-medium flex items-center gap-2 transition-colors ${isActive('/search') ? 'bg-neutral-100 text-neutral-900' : 'text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900'}`}
              >
                <Search className="w-4 h-4" /> Search
              </Link>
              
              <Link 
                href="/upload" 
                className={`px-3 py-2 rounded-md text-sm font-medium flex items-center gap-2 transition-colors ${isActive('/upload') ? 'bg-neutral-100 text-neutral-900' : 'text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900'}`}
              >
                <Upload className="w-4 h-4" /> Upload
              </Link>

              {/* Secure Admin/Teacher Navigation Boundary */}
              {(isAdmin || isTeacher) && (
                <div className="flex items-center pl-2 ml-2 border-l border-neutral-200">
                  <Link 
                    href="/admin/moderation" 
                    className={`px-3 py-2 rounded-md text-sm font-medium flex items-center gap-2 transition-colors ${isActive('/admin') ? 'bg-red-50 text-red-700' : 'text-red-600 hover:bg-red-50 hover:text-red-700'}`}
                  >
                    <Shield className="w-4 h-4" /> Admin Panel
                  </Link>
                </div>
              )}
            </nav>
          )}

          {/* User Context & Actions */}
          <div className="hidden md:flex items-center space-x-4">
            {isAuthenticated ? (
              <div className="flex items-center gap-4">
                <div className="flex flex-col items-end">
                  <span className="text-sm font-bold text-neutral-900 leading-tight">{user?.email}</span>
                  <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">{user?.role || 'STUDENT'}</span>
                </div>
                <button
                  onClick={handleLogout}
                  className="p-2 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors"
                  aria-label="Logout"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <Link href="/auth/login" className="text-sm font-medium text-neutral-600 hover:text-neutral-900 transition-colors">
                  Log in
                </Link>
                <Link href="/auth/register" className="px-4 py-2 bg-neutral-900 text-white text-sm font-medium rounded-lg hover:bg-neutral-800 transition-colors shadow-sm">
                  Sign up
                </Link>
              </div>
            )}
          </div>

          {/* Mobile menu button */}
          <div className="flex md:hidden items-center">
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="p-2 rounded-md text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-neutral-900"
            >
              <span className="sr-only">Open main menu</span>
              {isMobileMenuOpen ? (
                <X className="block w-6 h-6" aria-hidden="true" />
              ) : (
                <Menu className="block w-6 h-6" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Navigation Menu */}
      {isMobileMenuOpen && (
        <div className="md:hidden border-t border-neutral-200 bg-white">
          <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
            {isAuthenticated ? (
              <>
                <Link href="/search" className="block px-3 py-2 rounded-md text-base font-medium text-neutral-900 hover:bg-neutral-50 flex items-center gap-2">
                  <Search className="w-5 h-5" /> Search
                </Link>
                <Link href="/upload" className="block px-3 py-2 rounded-md text-base font-medium text-neutral-900 hover:bg-neutral-50 flex items-center gap-2">
                  <Upload className="w-5 h-5" /> Upload Contribution
                </Link>
                {(isAdmin || isTeacher) && (
                  <Link href="/admin/moderation" className="block px-3 py-2 rounded-md text-base font-medium text-red-700 hover:bg-red-50 flex items-center gap-2 mt-2 border-t border-red-100 pt-3">
                    <Shield className="w-5 h-5" /> Moderation Dashboard
                  </Link>
                )}
                
                <div className="mt-4 pt-4 border-t border-neutral-200">
                  <div className="flex items-center px-3 mb-4">
                    <div className="flex-shrink-0 p-2 bg-neutral-100 rounded-full">
                      <UserIcon className="w-5 h-5 text-neutral-600" />
                    </div>
                    <div className="ml-3">
                      <div className="text-base font-medium text-neutral-900">{user?.email}</div>
                      <div className="text-sm font-medium text-neutral-500">{user?.role || 'STUDENT'}</div>
                    </div>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="w-full text-left block px-3 py-2 rounded-md text-base font-medium text-neutral-600 hover:text-neutral-900 hover:bg-neutral-50 flex items-center gap-2"
                  >
                    <LogOut className="w-5 h-5" /> Sign out
                  </button>
                </div>
              </>
            ) : (
              <div className="pt-2 pb-3 space-y-2">
                <Link href="/auth/login" className="block px-3 py-2 rounded-md text-base font-medium text-neutral-900 hover:bg-neutral-50">
                  Log in
                </Link>
                <Link href="/auth/register" className="block px-3 py-2 rounded-md text-base font-medium text-neutral-900 hover:bg-neutral-50">
                  Sign up
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}