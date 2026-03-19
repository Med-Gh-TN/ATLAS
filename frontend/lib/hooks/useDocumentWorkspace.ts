import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api';
import type { DocumentVersion, Contribution } from '../../types/api';

export function useDocumentWorkspace(initialVersionId: string) {
  const queryClient = useQueryClient();
  const [activeVersionId, setActiveVersionId] = useState<string>(initialVersionId);

  // 1. Fetch the specific document version
  const { 
    data: currentVersion, 
    isLoading: isVersionLoading, 
    isError: isVersionError 
  } = useQuery({
    queryKey: ['version', activeVersionId],
    queryFn: async () => {
      const res = await api.get<DocumentVersion>(`/contributions/version/${activeVersionId}`);
      return res.data;
    },
    enabled: !!activeVersionId,
  });

  // 2. Fetch the parent contribution (Title, Description, etc.)
  const { 
    data: contribution, 
    isLoading: isContributionLoading 
  } = useQuery({
    queryKey: ['contribution', currentVersion?.contribution_id],
    queryFn: async () => {
      const res = await api.get<Contribution>(`/contributions/${currentVersion?.contribution_id}`);
      return res.data;
    },
    enabled: !!currentVersion?.contribution_id,
  });

  // 3. Fetch all versions for the timeline
  const { 
    data: allVersions 
  } = useQuery({
    queryKey: ['contributionVersions', currentVersion?.contribution_id],
    queryFn: async () => {
      const res = await api.get<DocumentVersion[]>(`/contributions/${currentVersion?.contribution_id}/versions`);
      return res.data;
    },
    enabled: !!currentVersion?.contribution_id,
  });

  // Handle local state and browser history sync
  const handleVersionSwitch = (newVersionId: string) => {
    setActiveVersionId(newVersionId);
    window.history.pushState(null, '', `/app/document/${newVersionId}`);
  };

  // --- US-11 RESUBMISSION MUTATION ---
  const uploadRevisionMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      // Ensure we explicitly link this upload to the existing course_id
      formData.append('file', file);
      formData.append('title', contribution?.title || 'Revised Document');
      formData.append('course_id', contribution?.course_id || '');
      
      if (contribution?.description) {
        formData.append('description', contribution.description);
      }
      
      const res = await api.post<Contribution>('/contributions', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      return res.data;
    },
    onSuccess: () => {
      // Invalidate queries to fetch the new version automatically
      queryClient.invalidateQueries({ queryKey: ['contributionVersions', contribution?.id] });
      queryClient.invalidateQueries({ queryKey: ['contribution', contribution?.id] });
      alert("Votre révision a été soumise avec succès. Elle est en attente de modération.");
    },
    onError: (error: any) => {
      console.error('Revision upload error:', error);
      alert(error.response?.data?.detail || "Erreur lors de l'envoi de la révision.");
    }
  });

  // Wrapper function to enforce file size limits defensively before hitting the network
  const uploadRevision = (file: File) => {
    if (file.size > 50 * 1024 * 1024) {
      alert("La taille du fichier dépasse la limite de 50 Mo.");
      return;
    }
    uploadRevisionMutation.mutate(file);
  };

  const isLoading = isVersionLoading || isContributionLoading;

  return {
    activeVersionId,
    currentVersion,
    contribution,
    allVersions,
    isLoading,
    isVersionError,
    handleVersionSwitch,
    uploadRevision,
    isUploadingRevision: uploadRevisionMutation.isPending,
  };
}