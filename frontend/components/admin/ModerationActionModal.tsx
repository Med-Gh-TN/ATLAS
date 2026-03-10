// frontend/components/admin/ModerationActionModal.tsx

'use client';

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Loader2, X, CheckCircle, AlertTriangle, MessageSquareWarning } from 'lucide-react';
import api from '../../lib/api';

// --- Zod Schema: Only requires 'reason' if the action is REJECT ---
const rejectSchema = z.object({
  reason: z.string()
    .min(10, "La raison doit contenir au moins 10 caractères pour aider l'étudiant.")
    .max(500, "La raison est trop longue."),
});

type RejectFormValues = z.infer<typeof rejectSchema>;

export type ActionType = 'APPROVE' | 'REJECT' | null;

export interface ModerationActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  contributionId: string | null;
  contributionTitle: string;
  actionType: ActionType;
  onSuccess: () => void; // Triggered to refresh the TanStack Query cache
}

export default function ModerationActionModal({
  isOpen,
  onClose,
  contributionId,
  contributionTitle,
  actionType,
  onSuccess,
}: ModerationActionModalProps) {
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<RejectFormValues>({
    resolver: zodResolver(rejectSchema),
    defaultValues: { reason: '' },
  });

  if (!isOpen || !contributionId || !actionType) return null;

  const handleClose = () => {
    reset();
    setServerError(null);
    onClose();
  };

  const executeAction = async (data?: RejectFormValues) => {
    setServerError(null);
    try {
      if (actionType === 'APPROVE') {
        await api.post(`/contributions/${contributionId}/approve`);
      } else if (actionType === 'REJECT') {
        // FIXED: Replaced JSON body with URLSearchParams to match application/x-www-form-urlencoded
        const formData = new URLSearchParams();
        formData.append('reason', data?.reason || '');
        
        await api.post(`/contributions/${contributionId}/reject`, formData);
      }
      handleClose();
      onSuccess();
    } catch (error: any) {
      console.error(`Moderation ${actionType} error:`, error);
      setServerError(error.response?.data?.detail || "Une erreur est survenue lors de l'opération.");
    }
  };

  // Prevent background clicks from closing if we are submitting
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !isSubmitting) {
      handleClose();
    }
  };

  const isApprove = actionType === 'APPROVE';

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm transition-opacity"
      onClick={handleBackdropClick}
    >
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className={`p-6 border-b ${isApprove ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'} flex justify-between items-start`}>
          <div className="flex gap-4 items-start">
            <div className={`p-2 rounded-full mt-1 ${isApprove ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'}`}>
              {isApprove ? <CheckCircle className="w-6 h-6" /> : <AlertTriangle className="w-6 h-6" />}
            </div>
            <div>
              <h2 className={`text-lg font-bold ${isApprove ? 'text-emerald-900' : 'text-red-900'}`}>
                {isApprove ? 'Approuver la contribution' : 'Rejeter la contribution'}
              </h2>
              <p className={`text-sm mt-1 ${isApprove ? 'text-emerald-700' : 'text-red-700'} line-clamp-2`}>
                Document : <span className="font-semibold">{contributionTitle}</span>
              </p>
            </div>
          </div>
          <button 
            onClick={handleClose}
            disabled={isSubmitting}
            className="text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content & Form */}
        <div className="p-6">
          {isApprove ? (
            <div className="space-y-4">
              <p className="text-sm text-slate-600 leading-relaxed">
                Êtes-vous sûr de vouloir approuver ce document ? Il deviendra immédiatement consultable par tous les étudiants dans la recherche sémantique.
              </p>
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 flex gap-3 text-sm text-slate-700">
                <CheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                <p>L'étudiant recevra automatiquement <strong>+50 XP</strong> pour cette contribution.</p>
              </div>
            </div>
          ) : (
            <form id="reject-form" onSubmit={handleSubmit(executeAction)} className="space-y-4">
              <p className="text-sm text-slate-600 leading-relaxed">
                Le rejet ne supprime pas définitivement le document, mais informe l'étudiant qu'une révision est nécessaire.
              </p>
              
              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-900 mb-2">
                  <MessageSquareWarning className="w-4 h-4 text-slate-500" />
                  Raison du rejet (Obligatoire) <span className="text-red-500">*</span>
                </label>
                <textarea
                  {...register('reason')}
                  rows={4}
                  placeholder="Ex: Le scan est illisible sur les pages 4 à 7. Merci de scanner à nouveau avec une meilleure lumière."
                  className={`w-full px-4 py-3 border rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500 transition-colors resize-none ${
                    errors.reason ? 'border-red-300' : 'border-slate-300'
                  }`}
                />
                {errors.reason && (
                  <p className="mt-1.5 text-xs text-red-600 font-medium">{errors.reason.message}</p>
                )}
              </div>
            </form>
          )}

          {serverError && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 font-medium text-center">
              {serverError}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-6 pt-0 flex justify-end gap-3">
          <button
            onClick={handleClose}
            disabled={isSubmitting}
            className="px-5 py-2.5 text-sm font-semibold text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            Annuler
          </button>
          
          {isApprove ? (
            <button
              onClick={() => executeAction()}
              disabled={isSubmitting}
              className="px-5 py-2.5 text-sm font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center gap-2 shadow-sm"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              Confirmer l'approbation
            </button>
          ) : (
            <button
              type="submit"
              form="reject-form"
              disabled={isSubmitting}
              className="px-5 py-2.5 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-2 shadow-sm"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertTriangle className="w-4 h-4" />}
              Confirmer le rejet
            </button>
          )}
        </div>

      </div>
    </div>
  );
}