import React, { useState } from 'react';
import { Loader2, Clock, AlertCircle, X } from 'lucide-react';
import { quizApi } from '@/lib/api';
import { SanitizedQuestionResponse } from '@/types/api';

interface QuizConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentId: string;
  /**
   * Callback fired when the backend successfully generates the quiz.
   * Passes the session ID, the selected timer, and the sanitized questions to the parent
   * to initialize the Simulation Engine.
   */
  onQuizReady: (sessionId: string, timerMinutes: number, questions: SanitizedQuestionResponse[]) => void;
}

/**
 * QuizConfigModal Component
 * Handles the US-17 requirement for triggering AI Quiz Generation with configurable timers.
 * Enforces strict 30/60/90 minute constraints and manages the generation loading state.
 */
export default function QuizConfigModal({ isOpen, onClose, documentId, onQuizReady }: QuizConfigModalProps) {
  const [selectedTimer, setSelectedTimer] = useState<number>(30);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleGenerate = async () => {
    try {
      setIsGenerating(true);
      setError(null);

      // Trigger the backend API to generate exactly 20 questions
      const response = await quizApi.generateQuiz({
        document_id: documentId,
        timer_minutes: selectedTimer,
      });

      // Pass the generated session data up to the parent to launch the QuizPlayer
      onQuizReady(response.session_id, response.timer_minutes, response.questions);
      
    } catch (err: any) {
      // Defensive Architecture: Catch and display localized error messages
      const errorMessage = err.response?.data?.detail || "Une erreur est survenue lors de la génération du quiz.";
      setError(errorMessage);
    } finally {
      setIsGenerating(false);
    }
  };

  const timerOptions = [
    { value: 30, label: "30 Minutes", description: "Format court, idéal pour une révision rapide." },
    { value: 60, label: "60 Minutes", description: "Format standard, examen classique." },
    { value: 90, label: "90 Minutes", description: "Format long, simulation d'épreuve complète." },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col border border-gray-200">
        
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-100 bg-gray-50/50">
          <h2 className="text-xl font-bold text-gray-900">Configuration de l'Examen</h2>
          <button 
            onClick={onClose}
            disabled={isGenerating}
            className="text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
            aria-label="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
          <div>
            <p className="text-sm text-gray-600 mb-4">
              L'IA va générer un QCM de 20 questions basé sur ce document. Choisissez la durée de la simulation :
            </p>

            <div className="space-y-3">
              {timerOptions.map((option) => (
                <label 
                  key={option.value}
                  className={`
                    flex items-start p-4 border rounded-lg cursor-pointer transition-all
                    ${selectedTimer === option.value 
                      ? 'border-blue-600 bg-blue-50 ring-1 ring-blue-600' 
                      : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                    }
                    ${isGenerating ? 'opacity-50 pointer-events-none' : ''}
                  `}
                >
                  <div className="flex items-center h-5">
                    <input
                      type="radio"
                      name="timer"
                      value={option.value}
                      checked={selectedTimer === option.value}
                      onChange={() => setSelectedTimer(option.value)}
                      disabled={isGenerating}
                      className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-600"
                    />
                  </div>
                  <div className="ml-3 flex flex-col">
                    <span className="text-sm font-medium text-gray-900 flex items-center gap-2">
                      <Clock className="w-4 h-4 text-gray-500" />
                      {option.label}
                    </span>
                    <span className="text-xs text-gray-500 mt-1">{option.description}</span>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Error Display */}
          {error && (
            <div className="p-3 bg-red-50 text-red-700 rounded-md flex items-start gap-2 text-sm">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <p>{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-100 bg-gray-50/50 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={isGenerating}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:ring-4 focus:ring-blue-300 disabled:opacity-70 flex items-center gap-2 transition-colors"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Génération IA en cours...
              </>
            ) : (
              'Démarrer la simulation'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}