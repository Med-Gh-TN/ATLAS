import React, { useRef } from 'react';
import { AlertTriangle, UploadCloud, Loader2 } from 'lucide-react';
import type { Contribution } from '@/types/api';

interface RevisionBannerProps {
  contribution: Contribution;
  currentUserId?: string;
  onFileUpload: (file: File) => void;
  isUploading: boolean;
}

export default function RevisionBanner({
  contribution,
  currentUserId,
  onFileUpload,
  isUploading
}: RevisionBannerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // US-11 Logic: Check if current user is the owner and revision is requested
  const isOwner = currentUserId === contribution.uploader_id;
  const needsRevision = contribution.status === 'REVISION_REQUESTED';

  if (!isOwner || !needsRevision) {
    return null; // Render nothing if the conditions are not met
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFileUpload(e.target.files[0]);
      // Reset input so the same file can be selected again if a network error occurs
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 sm:p-5 shadow-sm animate-in fade-in slide-in-from-top-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
        <div>
          <h3 className="text-sm font-bold text-amber-900">Révision Requise</h3>
          <p className="text-sm text-amber-800 mt-1">
            Un modérateur a demandé des modifications avant d'approuver ce document :
          </p>
          {contribution.rejection_reason && (
            <div className="mt-2 bg-white/60 p-3 rounded-lg border border-amber-100 text-sm text-amber-950 italic">
              "{contribution.rejection_reason}"
            </div>
          )}
        </div>
      </div>
      
      <div className="shrink-0 w-full sm:w-auto">
        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={handleFileChange} 
          className="hidden" 
          accept=".pdf,.docx,.pptx"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 text-white text-sm font-bold rounded-lg transition-colors shadow-sm"
        >
          {isUploading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <UploadCloud className="w-4 h-4" />
          )}
          Soumettre une version améliorée
        </button>
      </div>
    </div>
  );
}