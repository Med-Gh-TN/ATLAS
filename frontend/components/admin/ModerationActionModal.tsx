'use client';

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Loader2, X, CheckCircle2, AlertTriangle, MessageSquareWarning, Zap, RefreshCw } from 'lucide-react';
import api from '../../lib/api';

// --- Zod Schema: Requires 'reason' for REJECT and REQUEST_REVISION ---
const reasonSchema = z.object({
  reason: z.string()
    .min(10, "Reason must be at least 10 characters to help the student understand.")
    .max(500, "Reason is too long."),
});

type ReasonFormValues = z.infer<typeof reasonSchema>;

export type ActionType = 'APPROVE' | 'REJECT' | 'REQUEST_REVISION' | null;

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
  } = useForm<ReasonFormValues>({
    resolver: zodResolver(reasonSchema),
    defaultValues: { reason: '' },
  });

  if (!isOpen || !contributionId || !actionType) return null;

  const handleClose = () => {
    reset();
    setServerError(null);
    onClose();
  };

  const executeAction = async (data?: ReasonFormValues) => {
    setServerError(null);
    try {
      if (actionType === 'APPROVE') {
        await api.post(`/contributions/${contributionId}/approve`);
      } else {
        // Handle REJECT and REQUEST_REVISION
        const formData = new URLSearchParams();
        formData.append('reason', data?.reason || '');
        
        const endpoint = actionType === 'REJECT' ? 'reject' : 'request-revision';
        await api.post(`/contributions/${contributionId}/${endpoint}`, formData);
      }
      handleClose();
      onSuccess();
    } catch (error: any) {
      console.error(`Moderation ${actionType} error:`, error);
      setServerError(error.response?.data?.detail || "An unexpected error occurred during the operation.");
    }
  };

  // Prevent background clicks from closing if we are submitting
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !isSubmitting) {
      handleClose();
    }
  };

  const isApprove = actionType === 'APPROVE';
  const isReject = actionType === 'REJECT';
  const isRevision = actionType === 'REQUEST_REVISION';

  // Dynamic styling based on action
  const theme = {
    bg: isApprove ? 'bg-emerald-50/50' : isReject ? 'bg-red-50/50' : 'bg-amber-50/50',
    border: isApprove ? 'border-emerald-100/50' : isReject ? 'border-red-100/50' : 'border-amber-100/50',
    iconBg: isApprove ? 'bg-white border-emerald-100 text-emerald-600' : isReject ? 'bg-white border-red-100 text-red-600' : 'bg-white border-amber-100 text-amber-600',
    textHeader: isApprove ? 'text-emerald-950' : isReject ? 'text-red-950' : 'text-amber-950',
    textSub: isApprove ? 'text-emerald-700/80' : isReject ? 'text-red-700/80' : 'text-amber-700/80',
    button: isApprove ? 'bg-neutral-900 hover:bg-neutral-800 focus:ring-neutral-900' : isReject ? 'bg-red-600 hover:bg-red-700 focus:ring-red-600' : 'bg-amber-600 hover:bg-amber-700 focus:ring-amber-600',
    title: isApprove ? 'Approve Contribution' : isReject ? 'Reject Contribution' : 'Request Revision',
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-neutral-900/40 backdrop-blur-sm transition-all duration-300"
      onClick={handleBackdropClick}
    >
      <div className="bg-white rounded-2xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.1)] w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200 border border-neutral-100 flex flex-col max-h-full">
        
        {/* Header */}
        <div className={`p-6 border-b ${theme.bg} ${theme.border} flex justify-between items-start shrink-0`}>
          <div className="flex gap-4 items-start pr-4">
            <div className={`p-2.5 rounded-xl mt-0.5 shadow-sm border ${theme.iconBg}`}>
              {isApprove && <CheckCircle2 className="w-5 h-5" />}
              {isReject && <AlertTriangle className="w-5 h-5" />}
              {isRevision && <RefreshCw className="w-5 h-5" />}
            </div>
            <div>
              <h2 className={`text-lg font-bold tracking-tight ${theme.textHeader}`}>
                {theme.title}
              </h2>
              <p className={`text-sm mt-1.5 ${theme.textSub} leading-relaxed`}>
                Document: <span className="font-semibold text-neutral-900">{contributionTitle}</span>
              </p>
            </div>
          </div>
          <button 
            onClick={handleClose}
            disabled={isSubmitting}
            className="p-2 text-neutral-400 hover:bg-white hover:text-neutral-900 rounded-lg transition-colors disabled:opacity-50 shrink-0 shadow-sm border border-transparent hover:border-neutral-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content & Form */}
        <div className="p-6 overflow-y-auto">
          {isApprove ? (
            <div className="space-y-6">
              <p className="text-sm text-neutral-600 leading-relaxed">
                Are you sure you want to approve this document? It will immediately become searchable and available to all students on the platform.
              </p>
              <div className="bg-neutral-50/80 p-4 rounded-xl border border-neutral-100 flex items-start gap-3 text-sm text-neutral-700">
                <Zap className="w-5 h-5 text-amber-500 fill-amber-500 flex-shrink-0 mt-0.5" />
                <p>The student will automatically receive <strong className="text-neutral-900">+50 XP</strong> for this approved contribution.</p>
              </div>
            </div>
          ) : (
            <form id="action-form" onSubmit={handleSubmit(executeAction)} className="space-y-5">
              <p className="text-sm text-neutral-600 leading-relaxed">
                {isReject 
                  ? "Rejecting will soft-delete this document. It will not be searchable. Please provide a reason to help the student understand why."
                  : "Requesting a revision will notify the student and allow them to upload a corrected version of this document."}
              </p>
              
              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-neutral-900 mb-2.5">
                  <MessageSquareWarning className="w-4 h-4 text-neutral-500" />
                  Reason for {isReject ? 'rejection' : 'revision'} <span className="text-red-500">*</span>
                </label>
                <textarea
                  {...register('reason')}
                  rows={4}
                  placeholder={isReject ? "e.g., Content violates community guidelines." : "e.g., The scan is illegible on pages 4 to 7. Please rescan with better lighting."}
                  className={`block w-full appearance-none px-4 py-3 border rounded-xl bg-white text-neutral-900 placeholder-neutral-400 focus:outline-none focus:ring-1 transition-colors resize-none sm:text-sm ${
                    errors.reason ? 'border-red-300 focus:border-red-500 focus:ring-red-500 bg-red-50/30' : 'border-neutral-200 focus:border-neutral-900 focus:ring-neutral-900 shadow-[0_2px_10px_rgb(0,0,0,0.02)]'
                  }`}
                />
                {errors.reason && (
                  <p className="mt-2 text-xs text-red-600 font-medium">{errors.reason.message}</p>
                )}
              </div>
            </form>
          )}

          {serverError && (
            <div className="mt-6 p-4 bg-red-50/50 border border-red-100 rounded-xl flex items-start gap-3 text-sm text-red-700 font-medium">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <p>{serverError}</p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-6 pt-0 flex flex-col-reverse sm:flex-row justify-end gap-3 shrink-0">
          <button
            onClick={handleClose}
            disabled={isSubmitting}
            className="w-full sm:w-auto px-6 py-2.5 text-sm font-semibold text-neutral-600 bg-white border border-neutral-200 rounded-xl hover:bg-neutral-50 hover:text-neutral-900 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          
          {isApprove ? (
            <button
              onClick={() => executeAction()}
              disabled={isSubmitting}
              className={`w-full sm:w-auto px-6 py-2.5 text-sm font-semibold text-white rounded-xl transition-all disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 ${theme.button}`}
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Confirm Approval
            </button>
          ) : (
            <button
              type="submit"
              form="action-form"
              disabled={isSubmitting}
              className={`w-full sm:w-auto px-6 py-2.5 text-sm font-semibold text-white rounded-xl transition-all disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 ${theme.button}`}
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : (isReject ? <AlertTriangle className="w-4 h-4" /> : <RefreshCw className="w-4 h-4" />)}
              {isReject ? 'Confirm Rejection' : 'Request Revision'}
            </button>
          )}
        </div>

      </div>
    </div>
  );
}