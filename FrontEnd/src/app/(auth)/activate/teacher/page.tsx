import { Metadata } from 'next';
import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import TeacherActivationForm from '@/components/auth/TeacherActivationForm';

export const metadata: Metadata = {
  title: 'Activate Teacher Account | ATLAS',
  description: 'Set up your ATLAS teacher profile, password, and academic details.',
};

export default function TeacherActivationPage() {
  return (
    <div className="flex flex-col items-center justify-center w-full min-h-[calc(100vh-4rem)] p-4">
      {/* Suspense is strictly required here. 
        TeacherActivationForm uses useSearchParams(), which would break static generation 
        if not wrapped in a Suspense boundary.
      */}
      <Suspense 
        fallback={
          <div className="flex flex-col items-center justify-center space-y-4 text-blue-600">
            <Loader2 className="w-8 h-8 animate-spin" />
            <span className="text-sm font-medium text-gray-600">Chargement de l'environnement sécurisé...</span>
          </div>
        }
      >
        <TeacherActivationForm />
      </Suspense>
    </div>
  );
}