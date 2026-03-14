'use client';

import React, { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Loader2, Check, AlertCircle, ArrowRight, BookOpen, Eye, Edit2, FileText, Search } from 'lucide-react';
import FileUploadDropzone from './FileUploadDropzone';
import api from '../../lib/api';
import { useRouter } from 'next/navigation';
// ARCHITECTURE ADDITION: Import the newly refactored picker
import CourseSearchModal from '../document/CourseSearchModal'; 

const contributionSchema = z.object({
  title: z.string().min(5, "Title must be at least 5 characters.").max(120, "Title is too long."),
  description: z.string().optional(),
  course_id: z.string().uuid("Please select a target course."), // Mandatory backend requirement
  department_id: z.string().optional(),
  niveau: z.string().min(1, "Please select a level."),
  type: z.string().min(1, "Please select a document type."),
  annee: z.string().min(1, "Please select an academic year."),
  langue: z.string().min(1, "Please select a language."),
  file: z.any().refine((val) => val instanceof File, "Please upload a valid document."),
});

type ContributionFormValues = z.infer<typeof contributionSchema>;

export default function ContributionForm() {
  const router = useRouter();
  
  // Pipeline States
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  
  // UX States for Course Picker
  const [isCourseModalOpen, setIsCourseModalOpen] = useState(false);
  const [selectedCourseTitle, setSelectedCourseTitle] = useState<string>('');

  // Data Snapshot for Preview
  const [stagedData, setStagedData] = useState<ContributionFormValues | null>(null);

  const {
    register,
    handleSubmit,
    control,
    reset,
    setValue, // Used to silently update the hidden course_id field
    trigger,  // Used to force validation after modal selection
    formState: { errors, isSubmitting },
  } = useForm<ContributionFormValues>({
    resolver: zodResolver(contributionSchema),
    defaultValues: {
      title: '',
      description: '',
      course_id: '', 
      department_id: '',
      niveau: '',
      type: '',
      annee: '',
      langue: '',
      file: undefined,
    },
  });

  // Step 1: Intercept form validation success and stage the data for preview
  const handleStageForPreview = (data: ContributionFormValues) => {
    setStagedData(data);
    setIsPreviewMode(true);
    setServerError(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Step 2: Allow the user to go back and edit
  const handleEdit = () => {
    setIsPreviewMode(false);
  };

  // Step 3: Final execution to the backend
  const handleFinalSubmit = async () => {
    if (!stagedData) return;
    
    setServerError(null);
    setUploadProgress(0);
    
    try {
      const formData = new FormData();
      formData.append('title', stagedData.title);
      formData.append('course_id', stagedData.course_id); 
      
      if (stagedData.description) formData.append('description', stagedData.description);
      if (stagedData.department_id) {
        formData.append('department_id', stagedData.department_id);
      }
      
      formData.append('level', stagedData.niveau);
      formData.append('course_type', stagedData.type);
      formData.append('academic_year', stagedData.annee);
      formData.append('language', stagedData.langue);
      formData.append('file', stagedData.file);

      await api.post('/contributions', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setUploadProgress(percentCompleted);
          }
        }
      });

      setIsSuccess(true);
    } catch (error: any) {
      console.error("Upload error:", error);
      setUploadProgress(0); 
      
      if (error.response?.status === 409) {
        setServerError("This file already exists on the platform (Duplicate detected).");
      } else if (error.response?.status === 413) {
        setServerError("File is too large. The maximum permitted size is 50MB.");
      } else if (error.response?.status === 415) {
        setServerError("Unsupported file format. Please upload a PDF, DOCX, or PPTX.");
      } else if (error.response?.status === 404) {
        setServerError("The specified Target Course could not be found.");
      } else if (error.response?.status === 422) {
        setServerError("Validation error: Please verify that all required fields are correct.");
      } else {
        setServerError(error.response?.data?.detail || "An unexpected error occurred during upload.");
      }
    }
  };

  const handleReset = () => {
    reset();
    setSelectedCourseTitle('');
    setIsSuccess(false);
    setIsPreviewMode(false);
    setStagedData(null);
    setServerError(null);
    setUploadProgress(0);
  };

  // Callback from the Modal
  const handleCourseSelected = (selectedId: string, selectedTitle: string) => {
    setSelectedCourseTitle(selectedTitle);
    setValue('course_id', selectedId, { shouldValidate: true, shouldDirty: true });
    trigger('course_id'); // Clear any existing errors
  };

  // --- Success State UI ---
  if (isSuccess) {
    return (
      <div className="bg-white border border-neutral-100 rounded-2xl p-10 text-center shadow-[0_8px_30px_rgb(0,0,0,0.04)] animate-in fade-in zoom-in-95 duration-300">
        <div className="mx-auto w-16 h-16 bg-neutral-50 border border-neutral-100 text-neutral-900 rounded-full flex items-center justify-center mb-6 shadow-sm">
          <Check className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold text-neutral-900 mb-3 tracking-tight">Contribution Submitted</h2>
        <p className="text-neutral-500 mb-8 max-w-md mx-auto leading-relaxed text-sm">
          Your document has been uploaded successfully and is currently being processed by our AI pipeline. It will be available in the library once verified by a moderator.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={() => router.push('/search')}
            className="px-6 py-2.5 bg-white border border-neutral-200 text-neutral-700 text-sm font-semibold rounded-lg hover:bg-neutral-50 hover:text-neutral-900 transition-colors"
          >
            Return to Search
          </button>
          <button
            onClick={handleReset}
            className="px-6 py-2.5 bg-neutral-900 text-white text-sm font-semibold rounded-lg hover:bg-neutral-800 transition-colors flex items-center justify-center gap-2 shadow-sm"
          >
            New Contribution <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // --- Preview State UI ---
  if (isPreviewMode && stagedData) {
    return (
      <div className="bg-white border border-neutral-100 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300">
        <div className="p-8 border-b border-neutral-100 bg-neutral-50/50 flex items-center gap-4">
          <div className="p-3 bg-white rounded-xl shadow-sm border border-neutral-100 text-neutral-900">
            <Eye className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-neutral-900 tracking-tight">Preview Contribution</h2>
            <p className="text-sm text-neutral-500 mt-0.5">
              Please verify your document details before final submission.
            </p>
          </div>
        </div>

        <div className="p-8 space-y-8">
          <div className="bg-neutral-50 p-5 rounded-xl border border-neutral-200 flex items-center gap-4">
            <div className="p-3 bg-white border border-neutral-200 text-neutral-500 rounded-lg">
              <FileText className="w-6 h-6" />
            </div>
            <div className="overflow-hidden">
              <p className="text-sm font-bold text-neutral-900 truncate" title={stagedData.file.name}>
                {stagedData.file.name}
              </p>
              <p className="text-xs text-neutral-500 mt-1 font-medium">
                {(stagedData.file.size / (1024 * 1024)).toFixed(2)} MB
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-8">
            <div>
              <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Title</p>
              <p className="text-sm font-medium text-neutral-900">{stagedData.title}</p>
            </div>
            {/* ARCHITECTURE FIX: Display the user-friendly title, not the UUID */}
            <div>
              <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Target Course</p>
              <p className="text-sm font-medium text-neutral-900 truncate">{selectedCourseTitle || stagedData.course_id}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Level</p>
              <p className="text-sm font-medium text-neutral-900">{stagedData.niveau}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Resource Type</p>
              <p className="text-sm font-medium text-neutral-900">{stagedData.type}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Academic Year</p>
              <p className="text-sm font-medium text-neutral-900">{stagedData.annee}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Language</p>
              <p className="text-sm font-medium text-neutral-900">{stagedData.langue}</p>
            </div>
            {stagedData.department_id && (
              <div>
                <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Department ID</p>
                <p className="text-sm font-medium text-neutral-900">{stagedData.department_id}</p>
              </div>
            )}
            {stagedData.description && (
              <div className="sm:col-span-2">
                <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1">Description</p>
                <p className="text-sm text-neutral-700 leading-relaxed bg-neutral-50 p-4 rounded-xl border border-neutral-100">
                  {stagedData.description}
                </p>
              </div>
            )}
          </div>

          {serverError && (
            <div className="p-4 bg-red-50/50 border border-red-100 rounded-xl flex items-start gap-3 text-red-700 animate-in fade-in duration-200">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <p className="text-sm font-medium">{serverError}</p>
            </div>
          )}

          <div className="pt-6 border-t border-neutral-100 flex flex-col-reverse sm:flex-row justify-end gap-3">
            <button
              type="button"
              onClick={handleEdit}
              disabled={isSubmitting}
              className="w-full sm:w-auto px-6 py-3 text-sm font-semibold text-neutral-600 bg-white border border-neutral-200 rounded-lg hover:bg-neutral-50 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Edit2 className="w-4 h-4" />
              Edit Details
            </button>
            <button
              onClick={handleFinalSubmit}
              disabled={isSubmitting}
              className="w-full sm:w-auto px-8 py-3 bg-neutral-900 text-white text-sm font-semibold rounded-lg shadow-sm hover:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:ring-offset-2 transition-all disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Uploading... {uploadProgress}%
                </>
              ) : (
                'Confirm & Submit'
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- Main Form UI ---
  return (
    <>
      <div className="bg-white border border-neutral-100 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
        <div className="p-8 border-b border-neutral-100 bg-neutral-50/50 flex items-center gap-4">
          <div className="p-3 bg-white rounded-xl shadow-sm border border-neutral-100 text-neutral-900">
            <BookOpen className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-neutral-900 tracking-tight">New Contribution</h2>
            <p className="text-sm text-neutral-500 mt-0.5">
              Share your courses, summaries, or exams with the ATLAS community.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit(handleStageForPreview)} className="p-8 space-y-8">
          
          <div>
            <label className="block text-sm font-semibold text-neutral-900 mb-3 flex items-center gap-2">
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-neutral-100 text-neutral-600 text-[10px]">1</span>
              Document Upload <span className="text-red-500">*</span>
            </label>
            <Controller
              name="file"
              control={control}
              render={({ field }) => (
                <FileUploadDropzone
                  onFileSelect={(file) => field.onChange(file)}
                  isUploading={isSubmitting}
                  uploadProgress={uploadProgress}
                />
              )}
            />
            {errors.file && (
              <p className="mt-3 text-sm text-red-600 flex items-center gap-1.5 font-medium">
                <AlertCircle className="w-4 h-4" /> {errors.file.message as string}
              </p>
            )}
          </div>

          <div className="space-y-5 pt-8 border-t border-neutral-100">
            <label className="block text-sm font-semibold text-neutral-900 mb-4 flex items-center gap-2">
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-neutral-100 text-neutral-600 text-[10px]">2</span>
              Document Details
            </label>

            <div>
              <label htmlFor="title" className="block text-sm font-medium text-neutral-700 mb-1.5">
                Explicit Title <span className="text-red-500">*</span>
              </label>
              <input
                id="title"
                type="text"
                {...register('title')}
                disabled={isSubmitting}
                className={`block w-full appearance-none rounded-lg border bg-white px-4 py-2.5 text-neutral-900 placeholder-neutral-400 focus:outline-none focus:ring-1 transition-colors sm:text-sm ${
                  errors.title ? 'border-red-300 focus:border-red-500 focus:ring-red-500 bg-red-50/30' : 'border-neutral-200 focus:border-neutral-900 focus:ring-neutral-900'
                } disabled:opacity-60`}
                placeholder="e.g., Chapter 3 - Binary Search Trees"
              />
              {errors.title && (
                <p className="mt-2 text-xs font-medium text-red-600">{errors.title.message}</p>
              )}
            </div>

            {/* ARCHITECTURE FIX: The Interactive Target Course Picker */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1.5">
                Target Course <span className="text-red-500">*</span>
              </label>
              
              <div 
                onClick={() => !isSubmitting && setIsCourseModalOpen(true)}
                className={`flex items-center justify-between block w-full appearance-none rounded-lg border bg-white px-4 py-2.5 text-neutral-900 transition-colors sm:text-sm cursor-pointer ${
                  errors.course_id ? 'border-red-300 focus:border-red-500 focus:ring-red-500 bg-red-50/30' : 'border-neutral-200 hover:border-neutral-400 focus:border-neutral-900'
                } ${isSubmitting ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                <span className={selectedCourseTitle ? "text-neutral-900 font-medium" : "text-neutral-400"}>
                  {selectedCourseTitle || "Click to search and select a course..."}
                </span>
                <Search className="w-4 h-4 text-neutral-400" />
              </div>
              
              {/* Hidden input to maintain RHF bindings and validation */}
              <input type="hidden" {...register('course_id')} />
              
              {errors.course_id && (
                <p className="mt-2 text-xs font-medium text-red-600">{errors.course_id.message}</p>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label htmlFor="department_id" className="block text-sm font-medium text-neutral-700 mb-1.5">
                  Department ID
                </label>
                <input
                  id="department_id"
                  type="text"
                  {...register('department_id')}
                  disabled={isSubmitting}
                  className={`block w-full appearance-none rounded-lg border bg-white px-4 py-2.5 text-neutral-900 placeholder-neutral-400 focus:outline-none focus:ring-1 transition-colors sm:text-sm ${
                    errors.department_id ? 'border-red-300 focus:border-red-500 focus:ring-red-500 bg-red-50/30' : 'border-neutral-200 focus:border-neutral-900 focus:ring-neutral-900'
                  } disabled:opacity-60`}
                  placeholder="Optional Department UUID"
                />
                {errors.department_id && (
                  <p className="mt-2 text-xs font-medium text-red-600">{errors.department_id.message}</p>
                )}
              </div>

              <div>
                <label htmlFor="niveau" className="block text-sm font-medium text-neutral-700 mb-1.5">
                  Level <span className="text-red-500">*</span>
                </label>
                <select
                  id="niveau"
                  {...register('niveau')}
                  disabled={isSubmitting}
                  className={`block w-full rounded-lg border bg-white px-4 py-2.5 text-neutral-900 focus:outline-none focus:ring-1 transition-colors sm:text-sm ${
                    errors.niveau ? 'border-red-300 focus:border-red-500 focus:ring-red-500 bg-red-50/30' : 'border-neutral-200 focus:border-neutral-900 focus:ring-neutral-900'
                  } disabled:opacity-60`}
                >
                  <option value="">Select a level</option>
                  <option value="L1">Bachelor 1 (L1)</option>
                  <option value="L2">Bachelor 2 (L2)</option>
                  <option value="L3">Bachelor 3 (L3)</option>
                  <option value="M1">Master 1 (M1)</option>
                  <option value="M2">Master 2 (M2)</option>
                  <option value="OTHER">Other</option>
                </select>
                {errors.niveau && (
                  <p className="mt-2 text-xs font-medium text-red-600">{errors.niveau.message}</p>
                )}
              </div>

              <div>
                <label htmlFor="type" className="block text-sm font-medium text-neutral-700 mb-1.5">
                  Resource Type <span className="text-red-500">*</span>
                </label>
                <select
                  id="type"
                  {...register('type')}
                  disabled={isSubmitting}
                  className={`block w-full rounded-lg border bg-white px-4 py-2.5 text-neutral-900 focus:outline-none focus:ring-1 transition-colors sm:text-sm ${
                    errors.type ? 'border-red-300 focus:border-red-500 focus:ring-red-500 bg-red-50/30' : 'border-neutral-200 focus:border-neutral-900 focus:ring-neutral-900'
                  } disabled:opacity-60`}
                >
                  <option value="">Select a type</option>
                  <option value="LECTURE">Course (Lecture)</option>
                  <option value="TD">Tutorial (TD)</option>
                  <option value="TP">Lab Work (TP)</option>
                  <option value="SUMMARY">Summary</option>
                  <option value="EXAM">Exam</option>
                  <option value="OTHER">Other</option>
                </select>
                {errors.type && (
                  <p className="mt-2 text-xs font-medium text-red-600">{errors.type.message}</p>
                )}
              </div>

              <div>
                <label htmlFor="annee" className="block text-sm font-medium text-neutral-700 mb-1.5">
                  Academic Year <span className="text-red-500">*</span>
                </label>
                <select
                  id="annee"
                  {...register('annee')}
                  disabled={isSubmitting}
                  className={`block w-full rounded-lg border bg-white px-4 py-2.5 text-neutral-900 focus:outline-none focus:ring-1 transition-colors sm:text-sm ${
                    errors.annee ? 'border-red-300 focus:border-red-500 focus:ring-red-500 bg-red-50/30' : 'border-neutral-200 focus:border-neutral-900 focus:ring-neutral-900'
                  } disabled:opacity-60`}
                >
                  <option value="">Select year</option>
                  <option value="2023-2024">2023-2024</option>
                  <option value="2024-2025">2024-2025</option>
                  <option value="2025-2026">2025-2026</option>
                </select>
                {errors.annee && (
                  <p className="mt-2 text-xs font-medium text-red-600">{errors.annee.message}</p>
                )}
              </div>

              <div className="md:col-span-2">
                <label htmlFor="langue" className="block text-sm font-medium text-neutral-700 mb-1.5">
                  Language <span className="text-red-500">*</span>
                </label>
                <select
                  id="langue"
                  {...register('langue')}
                  disabled={isSubmitting}
                  className={`block w-full rounded-lg border bg-white px-4 py-2.5 text-neutral-900 focus:outline-none focus:ring-1 transition-colors sm:text-sm ${
                    errors.langue ? 'border-red-300 focus:border-red-500 focus:ring-red-500 bg-red-50/30' : 'border-neutral-200 focus:border-neutral-900 focus:ring-neutral-900'
                  } disabled:opacity-60`}
                >
                  <option value="">Select language</option>
                  <option value="FR">French</option>
                  <option value="EN">English</option>
                  <option value="AR">Arabic</option>
                </select>
                {errors.langue && (
                  <p className="mt-2 text-xs font-medium text-red-600">{errors.langue.message}</p>
                )}
              </div>
            </div>

            <div>
              <label htmlFor="description" className="block text-sm font-medium text-neutral-700 mb-1.5 mt-2">
                Description (Optional)
              </label>
              <textarea
                id="description"
                {...register('description')}
                disabled={isSubmitting}
                rows={3}
                className="block w-full appearance-none rounded-lg border border-neutral-200 bg-white px-4 py-2.5 text-neutral-900 placeholder-neutral-400 focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900 transition-colors sm:text-sm resize-none disabled:opacity-60"
                placeholder="Add details about the contents of this document..."
              />
            </div>
          </div>

          <div className="pt-6 border-t border-neutral-100 flex justify-end">
            <button
              type="submit"
              className="w-full sm:w-auto px-8 py-3 bg-neutral-900 text-white text-sm font-semibold rounded-lg shadow-sm hover:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:ring-offset-2 transition-all flex items-center justify-center gap-2"
            >
              Review Contribution <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </form>
      </div>

      {/* ARCHITECTURE ADDITION: Mount the Search Modal */}
      <CourseSearchModal 
        isOpen={isCourseModalOpen} 
        onClose={() => setIsCourseModalOpen(false)} 
        onSelect={handleCourseSelected}
      />
    </>
  );
}