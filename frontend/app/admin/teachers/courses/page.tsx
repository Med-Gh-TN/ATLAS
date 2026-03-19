'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { 
  Plus, 
  Search, 
  FileText, 
  Loader2, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  RefreshCcw,
  BookOpen,
  ArrowRight
} from 'lucide-react';
import api from '@/lib/api';
import { useAuthStore } from '@/lib/store/useAuthStore';

// Strict Type Definitions based on OpenAPI Specification
interface ContributionRead {
  id: string;
  title: string;
  course_id: string;
  status: string; // PENDING, APPROVED, REJECTED
  pipeline_status?: string; // QUEUED, OCR_PROCESSING, EMBEDDING, READY, FAILED
  created_at: string;
  description?: string;
}

interface PaginatedResponse {
  items: ContributionRead[];
  meta: {
    total: number;
    limit: number;
    offset: number;
  };
}

// Helper for Pipeline Status UI Mapping
const getStatusConfig = (status?: string) => {
  switch (status?.toUpperCase()) {
    case 'READY':
      return { icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200', label: 'Prêt' };
    case 'FAILED':
      return { icon: XCircle, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200', label: 'Échec' };
    case 'QUEUED':
      return { icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200', label: 'En File d\'attente' };
    case 'OCR_PROCESSING':
    case 'EMBEDDING':
      return { icon: Loader2, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200', label: 'Traitement en cours', spin: true };
    default:
      return { icon: Clock, color: 'text-neutral-500', bg: 'bg-neutral-50', border: 'border-neutral-200', label: status || 'Inconnu' };
  }
};

export default function TeacherCoursesPage() {
  const router = useRouter();
  const { user, isAuthenticated } = useAuthStore();
  const [searchTerm, setSearchTerm] = useState('');

  // DEFENSIVE ARCHITECTURE: TanStack Query with Dynamic Polling
  const { data, isLoading, isError, refetch, isRefetching } = useQuery<PaginatedResponse>({
    queryKey: ['teacher-contributions', user?.id],
    queryFn: async () => {
      // Fetching explicit contributions tied to the current teacher
      const response = await api.get(`/contributions/query?uploader_id=${user?.id}&sort_by=created_at&order=desc`);
      return response.data;
    },
    enabled: !!user?.id && isAuthenticated,
    // Polling Logic: Refetch every 3000ms ONLY if there are pending jobs
    refetchInterval: (query) => {
      const items = query.state.data?.items || [];
      const hasActivePipelines = items.some(
        (item) => 
          item.pipeline_status && 
          item.pipeline_status !== 'READY' && 
          item.pipeline_status !== 'FAILED'
      );
      return hasActivePipelines ? 3000 : false;
    },
  });

  // Derived State
  const filteredItems = data?.items.filter(item => 
    item.title.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  return (
    <div className="max-w-7xl mx-auto p-6 md:p-8 space-y-8 animate-in fade-in duration-500">
      
      {/* Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 tracking-tight flex items-center gap-3">
            <BookOpen className="w-7 h-7 text-neutral-400" />
            Mes Cours Officiels
          </h1>
          <p className="text-sm text-neutral-500 mt-1">
            Gérez vos documents pédagogiques et suivez le statut de traitement IA.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => refetch()}
            disabled={isRefetching}
            className="p-2.5 text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors border border-transparent hover:border-neutral-200 disabled:opacity-50"
            title="Rafraîchir"
          >
            <RefreshCcw className={`w-5 h-5 ${isRefetching ? 'animate-spin' : ''}`} />
          </button>
          <button 
            onClick={() => router.push('/upload')}
            className="flex items-center gap-2 px-5 py-2.5 bg-neutral-900 text-white text-sm font-semibold rounded-xl hover:bg-neutral-800 transition-all shadow-sm focus:ring-2 focus:ring-neutral-900 focus:ring-offset-2"
          >
            <Plus className="w-4 h-4" />
            Nouveau Cours
          </button>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="bg-white p-4 rounded-2xl border border-neutral-200 shadow-[0_2px_10px_rgb(0,0,0,0.02)] flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
          <input 
            type="text"
            placeholder="Rechercher un cours par titre..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-neutral-900 focus:border-neutral-900 transition-colors"
          />
        </div>
      </div>

      {/* Main Data View */}
      {isLoading ? (
        <div className="h-64 flex flex-col items-center justify-center border-2 border-dashed border-neutral-200 rounded-2xl bg-neutral-50/50">
          <Loader2 className="w-8 h-8 text-neutral-400 animate-spin mb-4" />
          <p className="text-sm font-medium text-neutral-500">Chargement de vos cours...</p>
        </div>
      ) : isError ? (
        <div className="p-6 bg-red-50 border border-red-100 rounded-2xl text-center">
          <XCircle className="w-8 h-8 text-red-500 mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-red-800">Erreur de connexion</h3>
          <p className="text-xs text-red-600 mt-1">Impossible de charger les données. Veuillez réessayer.</p>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="h-64 flex flex-col items-center justify-center border-2 border-dashed border-neutral-200 rounded-2xl bg-neutral-50/50">
          <FileText className="w-12 h-12 text-neutral-300 mb-4" />
          <h3 className="text-base font-semibold text-neutral-900 mb-1">Aucun cours trouvé</h3>
          <p className="text-sm text-neutral-500 mb-6 max-w-sm text-center">
            {searchTerm ? "Aucun document ne correspond à votre recherche." : "Vous n'avez pas encore uploadé de cours officiel."}
          </p>
          {!searchTerm && (
            <button 
              onClick={() => router.push('/upload')}
              className="text-sm font-semibold text-neutral-900 underline underline-offset-4 hover:text-neutral-600 transition-colors"
            >
              Uploader votre premier cours
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredItems.map((item) => {
            const statusConfig = getStatusConfig(item.pipeline_status || 'QUEUED');
            const Icon = statusConfig.icon;

            return (
              <div 
                key={item.id} 
                className="group flex flex-col bg-white border border-neutral-200 rounded-2xl overflow-hidden hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
              >
                <div className="p-6 flex-1 flex flex-col">
                  <div className="flex items-start justify-between mb-4">
                    <div className={`p-2.5 rounded-xl ${statusConfig.bg} border ${statusConfig.border}`}>
                      <Icon className={`w-5 h-5 ${statusConfig.color} ${statusConfig.spin ? 'animate-spin' : ''}`} />
                    </div>
                    
                    {/* Telemetry Badge */}
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${statusConfig.bg} ${statusConfig.color} ${statusConfig.border}`}>
                      {statusConfig.label}
                    </span>
                  </div>
                  
                  <h3 className="text-lg font-bold text-neutral-900 leading-tight mb-2 line-clamp-2" title={item.title}>
                    {item.title}
                  </h3>
                  
                  <p className="text-sm text-neutral-500 line-clamp-2 flex-1">
                    {item.description || "Aucune description fournie."}
                  </p>

                  <div className="mt-6 pt-4 border-t border-neutral-100 flex items-center justify-between">
                    <span className="text-xs font-medium text-neutral-400">
                      {new Date(item.created_at).toLocaleDateString('fr-FR', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                      })}
                    </span>
                    <span className="text-xs font-bold text-neutral-900 bg-neutral-100 px-2 py-1 rounded-md">
                      ID: {item.course_id.split('-')[0]}
                    </span>
                  </div>
                </div>
                
                {/* Action Footer */}
                <div className="bg-neutral-50 p-4 border-t border-neutral-200 flex items-center justify-between">
                  <button 
                    onClick={() => router.push(`/document/${item.id}`)}
                    disabled={item.pipeline_status !== 'READY'}
                    className="text-sm font-semibold text-neutral-900 hover:text-blue-600 transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:hover:text-neutral-900 disabled:cursor-not-allowed"
                  >
                    Voir les détails
                  </button>
                  <button 
                    onClick={() => router.push(`/upload?course_id=${item.course_id}&intent=new_version`)}
                    className="text-sm font-semibold text-neutral-600 hover:text-neutral-900 bg-white border border-neutral-200 px-3 py-1.5 rounded-lg hover:bg-neutral-100 transition-colors flex items-center gap-1"
                  >
                    Nouvelle Version <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}