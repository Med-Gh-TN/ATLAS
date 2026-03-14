import React, { useState, useEffect, useCallback } from 'react';
import { Clock, AlertCircle, Loader2, ChevronRight, ChevronLeft, CheckCircle } from 'lucide-react';
import { quizApi } from '@/lib/api';
import { 
  SanitizedQuestionResponse, 
  SubmitAnswersRequest, 
  QuizEvaluationResult 
} from '@/types/api';

interface QuizPlayerProps {
  sessionId: string;
  timerMinutes: number;
  questions: SanitizedQuestionResponse[];
  /**
   * Callback fired when the user submits or the timer expires.
   * Hands off the evaluation payload to the parent component.
   */
  onComplete: (result: QuizEvaluationResult) => void;
}

export default function QuizPlayer({ sessionId, timerMinutes, questions, onComplete }: QuizPlayerProps) {
  // --- STATE ---
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [timeLeft, setTimeLeft] = useState<number>(timerMinutes * 60);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const currentQuestion = questions[currentIndex];
  const isLastQuestion = currentIndex === questions.length - 1;

  // --- TIMER & AUTO-SUBMISSION LOGIC ---
  const submitQuiz = useCallback(async (forced: boolean = false) => {
    if (isSubmitting) return; // Prevent double submission
    
    try {
      setIsSubmitting(true);
      setError(null);

      // Map Record<string, string> to AnswerSubmission[]
      const formattedAnswers = Object.entries(answers).map(([question_id, student_answer]) => ({
        question_id,
        student_answer: student_answer.trim()
      }));

      const payload: SubmitAnswersRequest = {
        answers: formattedAnswers,
        time_spent_seconds: (timerMinutes * 60) - timeLeft
      };

      const result = await quizApi.submitQuiz(sessionId, payload);
      onComplete(result); // Trigger transition to Results UI
      
    } catch (err: any) {
      const msg = err.response?.data?.detail || "Erreur de connexion lors de la soumission.";
      setError(msg);
      setIsSubmitting(false); // Only allow retry if it wasn't a forced auto-submit that succeeded
    }
  }, [answers, sessionId, timeLeft, timerMinutes, isSubmitting, onComplete]);

  useEffect(() => {
    // Stop countdown if submitting
    if (isSubmitting || timeLeft <= 0) return;

    const timerInterval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerInterval);
          // DEFENSIVE ARCHITECTURE: Trigger auto-submission out of the render loop
          setTimeout(() => submitQuiz(true), 0); 
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timerInterval);
  }, [isSubmitting, timeLeft, submitQuiz]);

  // --- HANDLERS ---
  const handleAnswerChange = (val: string) => {
    setAnswers(prev => ({
      ...prev,
      [currentQuestion.id]: val
    }));
  };

  const handleNext = () => {
    if (!isLastQuestion) setCurrentIndex(prev => prev + 1);
  };

  const handlePrev = () => {
    if (currentIndex > 0) setCurrentIndex(prev => prev - 1);
  };

  // --- FORMATTERS ---
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // --- DYNAMIC RENDERER ---
  const renderQuestionInput = (q: SanitizedQuestionResponse) => {
    const currentAnswer = answers[q.id] || '';

    switch (q.question_type) {
      case 'QCM':
      case 'Vrai/Faux':
        return (
          <div className="space-y-3 mt-6">
            {q.options.map((opt, idx) => (
              <label 
                key={idx} 
                className={`
                  flex items-center p-4 border rounded-lg cursor-pointer transition-colors
                  ${currentAnswer === opt ? 'border-blue-600 bg-blue-50 ring-1 ring-blue-600' : 'border-gray-200 hover:bg-gray-50'}
                `}
              >
                <input
                  type="radio"
                  name={`question-${q.id}`}
                  value={opt}
                  checked={currentAnswer === opt}
                  onChange={(e) => handleAnswerChange(e.target.value)}
                  className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-600"
                />
                <span className="ml-3 text-gray-700">{opt}</span>
              </label>
            ))}
          </div>
        );
      
      case 'Texte à trous':
        return (
          <div className="mt-6">
            <input
              type="text"
              placeholder="Votre réponse ici..."
              value={currentAnswer}
              onChange={(e) => handleAnswerChange(e.target.value)}
              className="w-full p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition-all"
            />
          </div>
        );

      case 'Correspondance':
        // Fallback multi-line input for complex matching if strictly structured options aren't available
        return (
          <div className="mt-6 space-y-2">
            <p className="text-sm text-gray-500">
              Associez les éléments ci-dessus (ex: A-1, B-2). Saisissez votre réponse ci-dessous :
            </p>
            <textarea
              rows={4}
              placeholder="Ex: 1 avec A, 2 avec B..."
              value={currentAnswer}
              onChange={(e) => handleAnswerChange(e.target.value)}
              className="w-full p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none resize-none"
            />
          </div>
        );

      default:
        return (
          <p className="text-red-500 mt-4">Type de question non pris en charge.</p>
        );
    }
  };

  return (
    <div className="max-w-3xl mx-auto w-full bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col min-h-[500px]">
      
      {/* HEADER: Progress & Timer */}
      <div className="bg-gray-50 border-b border-gray-200 p-4 flex justify-between items-center">
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
            Question {currentIndex + 1} / {questions.length}
          </span>
          {/* Progress Bar */}
          <div className="w-48 h-2 bg-gray-200 rounded-full mt-2 overflow-hidden">
            <div 
              className="h-full bg-blue-600 transition-all duration-300 ease-out" 
              style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
            />
          </div>
        </div>

        <div className={`flex items-center gap-2 px-4 py-2 rounded-lg font-mono text-lg font-bold border
          ${timeLeft < 300 ? 'bg-red-50 text-red-600 border-red-200 animate-pulse' : 'bg-white text-gray-700 border-gray-200'}
        `}>
          <Clock className="w-5 h-5" />
          {formatTime(timeLeft)}
        </div>
      </div>

      {/* BODY: Question Content */}
      <div className="flex-1 p-8 overflow-y-auto">
        {error && (
          <div className="mb-6 p-4 bg-red-50 text-red-700 border border-red-100 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
          <span className="inline-block px-3 py-1 mb-4 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-full">
            {currentQuestion.question_type}
          </span>
          <h2 className="text-xl font-medium text-gray-900 leading-relaxed">
            {currentQuestion.question_text}
          </h2>

          {renderQuestionInput(currentQuestion)}
        </div>
      </div>

      {/* FOOTER: Navigation */}
      <div className="bg-gray-50 border-t border-gray-200 p-4 flex justify-between items-center">
        <button
          onClick={handlePrev}
          disabled={currentIndex === 0 || isSubmitting}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="w-4 h-4" /> Précédent
        </button>

        {!isLastQuestion ? (
          <button
            onClick={handleNext}
            disabled={isSubmitting}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Suivant <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={() => submitQuiz(false)}
            disabled={isSubmitting}
            className="flex items-center gap-2 px-6 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 focus:ring-4 focus:ring-green-300 disabled:opacity-70 transition-all shadow-sm"
          >
            {isSubmitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CheckCircle className="w-4 h-4" />
            )}
            {isSubmitting ? 'Correction...' : 'Terminer l\'examen'}
          </button>
        )}
      </div>

      {/* SUBMISSION OVERLAY */}
      {isSubmitting && (
        <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center z-10">
          <Loader2 className="w-10 h-10 text-blue-600 animate-spin mb-4" />
          <p className="text-lg font-medium text-gray-900">Correction par l'IA en cours...</p>
          <p className="text-sm text-gray-500 mt-2">Génération des feedbacks personnalisés</p>
        </div>
      )}
    </div>
  );
}