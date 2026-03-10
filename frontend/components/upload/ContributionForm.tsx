// frontend/components/upload/ContributionForm.tsx

'use client';

import React, { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Loader2, CheckCircle, AlertCircle, ArrowRight } from 'lucide-react';
import FileUploadDropzone from './FileUploadDropzone';
import api from '../../lib/api';
import { useRouter } from 'next/navigation';

// --- Zod Schema for strict client-side validation ---
// Updated to match the backend requirements for POST /api/v1/contributions/courses
const contributionSchema = z.object({
  title: z.string().min(5, "Le titre doit contenir au moins 5 caractères.").max(120, "Le titre est trop long."),
  description: z.string().optional(),
  department_id: z.string().min(1, "Veuillez renseigner l'ID du département."),
  niveau: z.string().min(1, "Veuillez sélectionner un niveau."),
  type: z.string().min(1, "Veuillez sélectionner un type de document."),
  annee: z.string().min(1, "Veuillez sélectionner une année universitaire."),
  langue: z.string().min(1, "Veuillez sélectionner une langue."),
  file: z.any().refine((val) => val instanceof File, "Veuillez uploader un document valide."),
});

type ContributionFormValues = z.infer<typeof contributionSchema>;

export default function ContributionForm() {
  const router = useRouter();
  const [isSuccess, setIsSuccess] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ContributionFormValues>({
    resolver: zodResolver(contributionSchema),
    defaultValues: {
      title: '',
      description: '',
      department_id: '',
      niveau: '',
      type: '',
      annee: '',
      langue: '',
      file: undefined,
    },
  });

  const onSubmit = async (data: ContributionFormValues) => {
    setServerError(null);
    try {
      const formData = new FormData();
      formData.append('title', data.title);
      formData.append('department_id', data.department_id);
      formData.append('niveau', data.niveau);
      formData.append('type', data.type);
      formData.append('annee', data.annee);
      formData.append('langue', data.langue);
      
      if (data.description) {
        formData.append('description', data.description);
      }
      
      formData.append('file', data.file);

      // Submitting to the correct endpoint path identified in the API docs
      await api.post('/contributions/courses', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      setIsSuccess(true);
    } catch (error: any) {
      console.error("Upload error:", error);
      if (error.response?.status === 409) {
        setServerError("Ce fichier existe déjà sur la plateforme (Doublon détecté).");
      } else if (error.response?.status === 422) {
        setServerError("Erreur de validation: Vérifiez que tous les champs requis sont corrects.");
      } else {
        setServerError(error.response?.data?.detail || "Une erreur est survenue lors de l'upload.");
      }
    }
  };

  const handleReset = () => {
    reset();
    setIsSuccess(false);
    setServerError(null);
  };

  // --- Success State UI ---
  if (isSuccess) {
    return (
      <div className="bg-white border border-emerald-200 rounded-xl p-8 text-center shadow-sm">
        <div className="mx-auto w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-6">
          <CheckCircle className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Contribution envoyée !</h2>
        <p className="text-slate-600 mb-8 max-w-md mx-auto">
          Votre document a été uploadé avec succès et est en cours de traitement par notre pipeline OCR. Il sera visible après validation.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <button
            onClick={() => router.push('/search')}
            className="px-6 py-2.5 bg-slate-100 text-slate-700 font-semibold rounded-lg hover:bg-slate-200 transition-colors"
          >
            Retour à l'accueil
          </button>
          <button
            onClick={handleReset}
            className="px-6 py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
          >
            Nouvelle contribution <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // --- Main Form UI ---
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      <div className="p-6 border-b border-slate-100 bg-slate-50">
        <h2 className="text-lg font-bold text-slate-900">Nouvelle Contribution</h2>
        <p className="text-sm text-slate-500 mt-1">
          Partagez vos cours, résumés ou TDs avec la communauté ATLAS.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-6">
        
        {/* Step 1: File Upload */}
        <div>
          <label className="block text-sm font-semibold text-slate-900 mb-2">
            1. Document <span className="text-red-500">*</span>
          </label>
          <Controller
            name="file"
            control={control}
            render={({ field }) => (
              <FileUploadDropzone
                onFileSelect={(file) => field.onChange(file)}
              />
            )}
          />
          {errors.file && (
            <p className="mt-2 text-sm text-red-600 flex items-center gap-1">
              <AlertCircle className="w-4 h-4" /> {errors.file.message as string}
            </p>
          )}
        </div>

        {/* Step 2: Metadata */}
        <div className="space-y-4 pt-4 border-t border-slate-100">
          <label className="block text-sm font-semibold text-slate-900">
            2. Informations du document
          </label>

          <div>
            <label htmlFor="title" className="block text-xs font-medium text-slate-700 mb-1">
              Titre explicite <span className="text-red-500">*</span>
            </label>
            <input
              id="title"
              type="text"
              {...register('title')}
              className={`w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 transition-colors ${
                errors.title ? 'border-red-300 bg-red-50' : 'border-slate-300 bg-white'
              }`}
              placeholder="ex: Chapitre 3 - Arbres Binaires de Recherche"
            />
            {errors.title && (
              <p className="mt-1.5 text-xs text-red-600">{errors.title.message}</p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="department_id" className="block text-xs font-medium text-slate-700 mb-1">
                ID du Département <span className="text-red-500">*</span>
              </label>
              <input
                id="department_id"
                type="text"
                {...register('department_id')}
                className={`w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 transition-colors ${
                  errors.department_id ? 'border-red-300 bg-red-50' : 'border-slate-300 bg-white'
                }`}
                placeholder="UUID du département"
              />
              {errors.department_id && (
                <p className="mt-1.5 text-xs text-red-600">{errors.department_id.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="niveau" className="block text-xs font-medium text-slate-700 mb-1">
                Niveau <span className="text-red-500">*</span>
              </label>
              <select
                id="niveau"
                {...register('niveau')}
                className={`w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 transition-colors bg-white ${
                  errors.niveau ? 'border-red-300 bg-red-50' : 'border-slate-300'
                }`}
              >
                <option value="">Sélectionnez un niveau</option>
                <option value="L1">Licence 1 (L1)</option>
                <option value="L2">Licence 2 (L2)</option>
                <option value="L3">Licence 3 (L3)</option>
                <option value="M1">Master 1 (M1)</option>
                <option value="M2">Master 2 (M2)</option>
              </select>
              {errors.niveau && (
                <p className="mt-1.5 text-xs text-red-600">{errors.niveau.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="type" className="block text-xs font-medium text-slate-700 mb-1">
                Type de document <span className="text-red-500">*</span>
              </label>
              <select
                id="type"
                {...register('type')}
                className={`w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 transition-colors bg-white ${
                  errors.type ? 'border-red-300 bg-red-50' : 'border-slate-300'
                }`}
              >
                <option value="">Sélectionnez un type</option>
                <option value="Cours">Cours</option>
                <option value="TD">Travaux Dirigés (TD)</option>
                <option value="TP">Travaux Pratiques (TP)</option>
                <option value="Resume">Résumé</option>
                <option value="Examen">Examen</option>
              </select>
              {errors.type && (
                <p className="mt-1.5 text-xs text-red-600">{errors.type.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="annee" className="block text-xs font-medium text-slate-700 mb-1">
                Année Universitaire <span className="text-red-500">*</span>
              </label>
              <select
                id="annee"
                {...register('annee')}
                className={`w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 transition-colors bg-white ${
                  errors.annee ? 'border-red-300 bg-red-50' : 'border-slate-300'
                }`}
              >
                <option value="">Sélectionnez l'année</option>
                <option value="2023-2024">2023-2024</option>
                <option value="2024-2025">2024-2025</option>
                <option value="2025-2026">2025-2026</option>
              </select>
              {errors.annee && (
                <p className="mt-1.5 text-xs text-red-600">{errors.annee.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="langue" className="block text-xs font-medium text-slate-700 mb-1">
                Langue <span className="text-red-500">*</span>
              </label>
              <select
                id="langue"
                {...register('langue')}
                className={`w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 transition-colors bg-white ${
                  errors.langue ? 'border-red-300 bg-red-50' : 'border-slate-300'
                }`}
              >
                <option value="">Sélectionnez la langue</option>
                <option value="Français">Français</option>
                <option value="Anglais">Anglais</option>
                <option value="Arabe">Arabe</option>
              </select>
              {errors.langue && (
                <p className="mt-1.5 text-xs text-red-600">{errors.langue.message}</p>
              )}
            </div>
          </div>

          <div>
            <label htmlFor="description" className="block text-xs font-medium text-slate-700 mb-1 mt-2">
              Description (Optionnelle)
            </label>
            <textarea
              id="description"
              {...register('description')}
              rows={3}
              className="w-full px-4 py-2.5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 transition-colors resize-none"
              placeholder="Ajoutez des détails sur le contenu de ce document..."
            />
          </div>
        </div>

        {/* Server Error Alert */}
        {serverError && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3 text-red-700">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <p className="text-sm font-medium">{serverError}</p>
          </div>
        )}

        {/* Submit Button */}
        <div className="pt-4 flex justify-end">
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full sm:w-auto px-8 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 focus:ring-4 focus:ring-blue-100 transition-all disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Traitement...
              </>
            ) : (
              'Envoyer le document'
            )}
          </button>
        </div>
      </form>
    </div>
  );
}