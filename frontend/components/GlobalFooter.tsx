import React from 'react';
import Link from 'next/link';
import { BookOpen } from 'lucide-react';

export default function GlobalFooter() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-white border-t border-neutral-200 mt-auto">
      <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        <div className="md:flex md:items-center md:justify-between">
          <div className="flex justify-center md:justify-start space-x-6 md:order-2">
            <Link href="#" className="text-sm text-neutral-500 hover:text-neutral-900 transition-colors font-medium">
              About
            </Link>
            <Link href="#" className="text-sm text-neutral-500 hover:text-neutral-900 transition-colors font-medium">
              Privacy Policy
            </Link>
            <Link href="#" className="text-sm text-neutral-500 hover:text-neutral-900 transition-colors font-medium">
              Terms of Service
            </Link>
            <Link href="#" className="text-sm text-neutral-500 hover:text-neutral-900 transition-colors font-medium">
              Contact
            </Link>
          </div>
          
          <div className="mt-8 md:mt-0 md:order-1 flex flex-col items-center md:items-start">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-1.5 bg-neutral-100 rounded-md text-neutral-600">
                <BookOpen className="w-4 h-4" />
              </div>
              <span className="text-sm font-bold text-neutral-900 tracking-tight uppercase">ATLAS Platform</span>
            </div>
            <p className="text-center md:text-left text-xs text-neutral-400 font-medium">
              &copy; {currentYear} ATLAS Academic Knowledge Base. Built for CS Students. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}