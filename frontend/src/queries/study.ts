import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  flashcardsApi,
  mindmapsApi,
  quizApi,
  summariesApi,
} from "@/lib/api";
import type { QuizSubmitRequest, ReviewRating } from "@/types/api.types";

export function useFlashcardDecksQuery() {
  return useQuery({
    queryKey: ["flashcards", "decks"],
    queryFn: () => flashcardsApi.listDecks(),
    staleTime: 2 * 60 * 1000,
  });
}

export function useFlashcardDeckQuery(deckId: string) {
  return useQuery({
    queryKey: ["flashcards", "deck", deckId],
    queryFn: () => flashcardsApi.getDeck(deckId),
    enabled: Boolean(deckId),
    staleTime: 2 * 60 * 1000,
  });
}

export function useFlashcardDueQuery() {
  return useQuery({
    queryKey: ["flashcards", "due"],
    queryFn: () => flashcardsApi.getDue(),
    staleTime: 30 * 1000,
  });
}

export function useGenerateFlashcardsMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      courseId,
      numCards = 20,
    }: {
      courseId: string;
      numCards?: number;
    }) => flashcardsApi.generate(courseId, numCards),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["flashcards"] });
    },
  });
}

export function useReviewFlashcardMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      cardId,
      rating,
    }: {
      cardId: string;
      rating: ReviewRating;
    }) => flashcardsApi.review(cardId, rating),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["flashcards"] });
    },
  });
}

export function useShareFlashcardDeckMutation() {
  return useMutation({
    mutationFn: (deckId: string) => flashcardsApi.shareDeck(deckId),
  });
}

export function useQuizSessionsQuery() {
  return useQuery({
    queryKey: ["quiz", "sessions"],
    queryFn: () => quizApi.listSessions(),
    staleTime: 60 * 1000,
  });
}

export function useGenerateQuizMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      courseId,
      numQuestions = 10,
      timeMinutes = 15,
    }: {
      courseId: string;
      numQuestions?: number;
      timeMinutes?: number;
    }) => quizApi.generate(courseId, numQuestions, timeMinutes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quiz"] });
    },
  });
}

export function useQuizQuery(quizId: string) {
  return useQuery({
    queryKey: ["quiz", quizId],
    queryFn: () => quizApi.getQuiz(quizId),
    enabled: Boolean(quizId),
  });
}

export function useSubmitQuizMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      quizId,
      data,
    }: {
      quizId: string;
      data: QuizSubmitRequest;
    }) => quizApi.submit(quizId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quiz"] });
    },
  });
}

export function useQuizHistoryQuery() {
  return useQuery({
    queryKey: ["quiz", "history"],
    queryFn: () => quizApi.getHistory(),
    staleTime: 60 * 1000,
  });
}

export function useGenerateSummaryMutation() {
  return useMutation({
    mutationFn: ({
      courseId,
      formatType = "markdown",
      targetLang = "fr",
    }: {
      courseId: string;
      formatType?: string;
      targetLang?: string;
    }) => summariesApi.generate(courseId, formatType, targetLang),
  });
}

export function useSummaryQuery(summaryId: string) {
  return useQuery({
    queryKey: ["summary", summaryId],
    queryFn: () => summariesApi.get(summaryId),
    enabled: Boolean(summaryId),
  });
}

export function useGenerateMindmapMutation() {
  return useMutation({
    mutationFn: ({
      courseId,
      targetLang = "fr",
    }: {
      courseId: string;
      targetLang?: string;
    }) => mindmapsApi.generate(courseId, targetLang),
  });
}

export function useMindmapQuery(mindmapId: string) {
  return useQuery({
    queryKey: ["mindmap", mindmapId],
    queryFn: () => mindmapsApi.get(mindmapId),
    enabled: Boolean(mindmapId),
  });
}
