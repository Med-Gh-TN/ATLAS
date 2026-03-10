// frontend/app/admin/moderation/page.tsx

'use client';

import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useFilteredContributions } from '../../../lib/hooks/useSearch';
import ModerationActionModal, { ActionType } from '../../../components/admin/ModerationActionModal';
import { 
  ShieldAlert, 
  Loader2, 
  CheckCircle, 
  XCircle, 
  FileText, 
  Clock, 
  Activity 
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
    // Invalidate the cache to instantly remove the approved/rejected item from the UI
    queryClient.invalidateQueries({ queryKey: ['contributions'] });
    refetch();
  };

  return (
    <div className="min-h-screen bg-slate-50 pt-24 pb-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <ShieldAlert className="w-6 h-6 text-blue-600" />
              File d'attente de modération
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Examinez les contributions étudiantes avant de les publier sur ATLAS.
            </p>
          </div>
          <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2">
            <Clock className="w-4 h-4" />
            {pendingContributions?.items.length || 0} en attente
          </div>
        </div>

        {/* Data Grid */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-32 text-slate-500 space-y-4">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
              <p className="text-sm font-medium">Chargement des contributions...</p>
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center py-20 text-red-500">
              <p className="text-sm font-medium">Erreur lors du chargement des données.</p>
            </div>
          ) : pendingContributions?.items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-32 text-center">
              <div className="w-16 h-16 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mb-4">
                <CheckCircle className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Tout est à jour !</h3>
              <p className="text-sm text-slate-500 mt-1 max-w-sm">
                Il n'y a aucune contribution en attente de modération pour le moment.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500 font-semibold">
                    <th className="px-6 py-4">Document</th>
                    <th className="px-6 py-4 hidden md:table-cell">Auteur</th>
                    <th className="px-6 py-4 hidden lg:table-cell">Qualité OCR</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pendingContributions?.items.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-start gap-3">
                          <div className="p-2 bg-blue-50 text-blue-600 rounded-lg shrink-0 mt-0.5">
                            <FileText className="w-5 h-5" />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-slate-900 line-clamp-1">{item.title}</p>
                            <p className="text-xs text-slate-500 mt-1 line-clamp-1">
                              {item.description || "Aucune description fournie."}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 hidden md:table-cell">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-600">
                            {/* Initials Placeholder */}
                            ET
                          </div>
                          <span className="text-sm font-medium text-slate-700">Étudiant</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 hidden lg:table-cell">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 text-xs font-semibold border border-emerald-100">
                          <Activity className="w-3.5 h-3.5" />
                          Excellente
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openModal(item.id, item.title, 'APPROVE')}
                            className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors border border-transparent hover:border-emerald-200"
                            title="Approuver"
                          >
                            <CheckCircle className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => openModal(item.id, item.title, 'REJECT')}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-200"
                            title="Rejeter"
                          >
                            <XCircle className="w-5 h-5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
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