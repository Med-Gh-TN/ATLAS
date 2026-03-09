import { Metadata } from 'next';
import TeacherImportZone from '@/components/admin/TeacherImportZone';

export const metadata: Metadata = {
  title: 'Import Teachers | Admin',
  description: 'Batch import teachers via CSV dropzone',
};

export default function AdminTeacherImportPage() {
  return (
    <main className="flex-1 w-full h-full p-4 md:p-8 bg-gray-50/50">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Optional Page-Level Breadcrumbs or Header could go here in the future */}
        <div className="pb-4 border-b border-gray-200">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            Teacher Management
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            Upload a CSV file to batch create new teacher accounts. The system will automatically generate credentials and dispatch activation emails.
          </p>
        </div>

        {/* Snap the component into the assembly line */}
        <div className="pt-4">
          <TeacherImportZone />
        </div>
      </div>
    </main>
  );
}