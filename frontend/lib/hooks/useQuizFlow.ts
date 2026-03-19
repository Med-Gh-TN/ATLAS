import { useState, useCallback } from 'react';
import type { SanitizedQuestionResponse, QuizEvaluationResult } from '../../types/api';

export type QuizModeState = 'idle' | 'configuring' | 'playing' | 'results';

export interface QuizSessionData {
  sessionId: string;
  timerMinutes: number;
  questions: SanitizedQuestionResponse[];
}

export function useQuizFlow() {
  const [quizState, setQuizState] = useState<QuizModeState>('idle');
  const [quizSessionData, setQuizSessionData] = useState<QuizSessionData | null>(null);
  const [quizResult, setQuizResult] = useState<QuizEvaluationResult | null>(null);

  const openQuizConfig = useCallback(() => {
    setQuizState('configuring');
  }, []);

  const handleQuizReady = useCallback(
    (sessionId: string, timerMinutes: number, questions: SanitizedQuestionResponse[]) => {
      setQuizSessionData({ sessionId, timerMinutes, questions });
      setQuizState('playing');
    },
    []
  );

  const handleQuizComplete = useCallback((result: QuizEvaluationResult) => {
    setQuizResult(result);
    setQuizState('results');
  }, []);

  const handleCloseQuiz = useCallback(() => {
    setQuizState('idle');
    setQuizSessionData(null);
    setQuizResult(null);
  }, []);

  return {
    quizState,
    quizSessionData,
    quizResult,
    openQuizConfig,
    handleQuizReady,
    handleQuizComplete,
    handleCloseQuiz,
  };
}