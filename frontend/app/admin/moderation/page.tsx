'use client';

import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useFilteredContributions } from '../../../lib/hooks/useSearch';
import ModerationActionModal, { ActionType } from '../../../components/admin/ModerationActionModal';
import { 
  ShieldAlert, 
  Loader2, 
  CheckCircle2, 
  XCircle, 
  FileText, 
  Clock, 
  Activity,
  User,
  RefreshCw,
  Search
} from 'lucide-react';

export default function ModerationPage() {
  const queryClient = useQueryClient();
  
  // Fetch only PENDING contributions
  const { 
    data: pendingContributions, 
    isLoading, 
    isError,
    refetch 
  } = useFilteredContributions({ status: 'PENDING', limit: 50 });

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<{ id: string; title: string } | null>(null);
  const [actionType, setActionType] = useState<ActionType>(null);

  const openModal = (id: string, title: string, action: ActionType) => {
    setSelectedDoc({ id, title });
    setActionType(action);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setTimeout(() => {
      setSelectedDoc(null);
      setActionType(null);
    }, 200); // Wait for exit animation
  };

  const handleActionSuccess = () => {
    // Invalidate the cache to instantly remove the processed item from the UI
    queryClient.invalidateQueries({ queryKey: ['contributions'] });
    refetch();
  };

  return (
    <div className="min-h-screen bg-neutral-50 pt-24 pb-20 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 bg-white p-8 rounded-2xl border border-neutral-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-3 tracking-tight">
              <div className="p-2 bg-neutral-100 rounded-lg">
                <ShieldAlert className="w-5 h-5 text-neutral-900" />
              </div>
              Moderation Queue
            </h1>
            <p className="text-sm text-neutral-500 mt-2 leading-relaxed">
              Review and approve student contributions before publishing them to the ATLAS library.
            </p>
          </div>
          <div className="bg-neutral-900 text-white px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2.5 shadow-sm shrink-0">
            <Clock className="w-4 h-4 text-neutral-300" />
            {pendingContributions?.items.length || 0} Pending Review
          </div>
        </div>

        {/* Data Grid */}
        <div className="bg-white border border-neutral-100 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-32 text-neutral-400 space-y-4">
              <Loader2 className="w-8 h-8 animate-spin text-neutral-300" />
              <p className="text-sm font-medium tracking-wide">Loading queue...</p>
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center py-20 text-red-500 bg-red-50/30 m-8 rounded-xl border border-red-100">
              <p className="text-sm font-semibold">Failed to load moderation data. Please try again.</p>
            </div>
          ) : pendingContributions?.items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-32 text-center border-2 border-dashed border-neutral-100 rounded-2xl m-8">
              <div className="w-16 h-16 bg-neutral-50 border border-neutral-200 text-neutral-900 rounded-full flex items-center justify-center mb-5 shadow-sm">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-neutral-900 tracking-tight mb-1">All Caught Up!</h3>
              <p className="text-sm text-neutral-500 max-w-sm">
                There are no contributions waiting for moderation right now. Outstanding work.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-neutral-50/80 border-b border-neutral-100 text-[11px] uppercase tracking-wider text-neutral-500 font-semibold">
                    <th className="px-8 py-5">Document</th>
                    <th className="px-6 py-5 hidden md:table-cell">Author</th>
                    <th className="px-6 py-5 hidden xl:table-cell">OCR Quality</th>
                    <th className="px-6 py-5 hidden lg:table-cell">Status</th>
                    <th className="px-8 py-5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {pendingContributions?.items.map((item: any) => {
                    // Extract OCR quality with a fallback for type safety
                    const ocrScore = item.ocr_quality_score ?? item.ocrQualityScore ?? null;
                    const isOcrLow = ocrScore !== null && ocrScore < 70;

                    return (
                      <tr key={item.id} className="hover:bg-neutral-50/80 transition-colors group">
                        <td className="px-8 py-5">
                          <div className="flex items-start gap-4">
                            <div className="p-2.5 bg-white border border-neutral-200 text-neutral-600 rounded-xl shrink-0 mt-0.5 shadow-sm group-hover:border-neutral-300 transition-colors">
                              <FileText className="w-5 h-5" />
                            </div>
                            <div>
                              <p className="text-sm font-bold text-neutral-900 line-clamp-1 group-hover:text-black transition-colors">{item.title}</p>
                              <p className="text-xs text-neutral-500 mt-1.5 line-clamp-1 font-medium">
                                {item.description || "No description provided."}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-5 hidden md:table-cell">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-neutral-100 border border-neutral-200 flex items-center justify-center text-neutral-600">
                              <User className="w-4 h-4" />
                            </div>
                            <span className="text-sm font-semibold text-neutral-700">Student</span>
                          </div>
                        </td>
                        <td className="px-6 py-5 hidden xl:table-cell">
                          {ocrScore !== null ? (
                            <div className="flex items-center gap-2">
                              <div className={`text-xs font-bold px-2 py-1 rounded-md border ${isOcrLow ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                                {ocrScore}%
                              </div>
                              {isOcrLow && <Search className="w-3.5 h-3.5 text-amber-500" title="Low OCR quality detected" />}
                            </div>
                          ) : (
                            <span className="text-xs text-neutral-400 font-medium">N/A</span>
                          )}
                        </td>
                        <td className="px-6 py-5 hidden lg:table-cell">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-neutral-50 text-neutral-600 text-[11px] uppercase tracking-wider font-bold border border-neutral-200">
                            <Activity className="w-3.5 h-3.5" />
                            Review
                          </span>
                        </td>
                        <td className="px-8 py-5 text-right">
                          <div className="flex items-center justify-end gap-1.5 opacity-80 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => openModal(item.id, item.title, 'APPROVE')}
                              className="p-2 text-neutral-400 hover:text-emerald-700 hover:bg-emerald-50 rounded-xl transition-all border border-transparent hover:border-emerald-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                              title="Approve & Award XP"
                            >
                              <CheckCircle2 className="w-5 h-5" />
                            </button>
                            <button
                              onClick={() => openModal(item.id, item.title, 'REQUEST_REVISION')}
                              className="p-2 text-neutral-400 hover:text-amber-600 hover:bg-amber-50 rounded-xl transition-all border border-transparent hover:border-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
                              title="Request Revision"
                            >
                              <RefreshCw className="w-5 h-5" />
                            </button>
                            <button
                              onClick={() => openModal(item.id, item.title, 'REJECT')}
                              className="p-2 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all border border-transparent hover:border-red-200 focus:outline-none focus:ring-2 focus:ring-red-500"
                              title="Reject (Soft Delete)"
                            >
                              <XCircle className="w-5 h-5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Moderation Action Modal Injection */}
      <ModerationActionModal
        isOpen={isModalOpen}
        onClose={closeModal}
        contributionId={selectedDoc?.id || null}
        contributionTitle={selectedDoc?.title || ''}
        actionType={actionType}
        onSuccess={handleActionSuccess}
      />
    </div>
  );
}