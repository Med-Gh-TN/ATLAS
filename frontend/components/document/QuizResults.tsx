import React, { useEffect, useState } from 'react';
import { 
  CheckCircle, 
  XCircle, 
  BookOpen, 
  TrendingUp, 
  BrainCircuit,
  ArrowRight
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';
import { quizApi } from '@/lib/api';
import { QuizEvaluationResult, HistoryDataPoint } from '@/types/api';

interface QuizResultsProps {
  result: QuizEvaluationResult;
  onClose: () => void;
}

/**
 * QuizResults Component
 * Displays the immediate score, targeted AI feedback for errors, 
 * and a Recharts LineChart for 30-day historical progression (US-17).
 */
export default function QuizResults({ result, onClose }: QuizResultsProps) {
  const [historyData, setHistoryData] = useState<HistoryDataPoint[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(true);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const isPassing = result.percentage >= 50;

  // Fetch 30-day history on mount
  useEffect(() => {
    let isMounted = true;

    const fetchHistory = async () => {
      try {
        setIsLoadingHistory(true);
        const data = await quizApi.getHistory();
        if (isMounted) {
          setHistoryData(data);
          setHistoryError(null);
        }
      } catch (err) {
        if (isMounted) {
          console.error("Failed to fetch quiz history:", err);
          setHistoryError("Impossible de charger l'historique des scores.");
        }
      } finally {
        if (isMounted) {
          setIsLoadingHistory(false);
        }
      }
    };

    fetchHistory();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="max-w-4xl mx-auto w-full space-y-8 pb-12">
      
      {/* SECTION 1: Score Summary Card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden text-center p-8 relative">
        <div className={`absolute top-0 left-0 w-full h-2 ${isPassing ? 'bg-green-500' : 'bg-red-500'}`} />
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Résultats de la Simulation</h2>
        <p className="text-gray-500 mb-6">Examen terminé et corrigé par l'IA</p>
        
        <div className="flex flex-col items-center justify-center">
          <div className={`text-6xl font-black mb-2 ${isPassing ? 'text-green-600' : 'text-red-600'}`}>
            {result.percentage.toFixed(0)}%
          </div>
          <p className="text-lg font-medium text-gray-700">
            Score: {result.score} / {result.total_questions}
          </p>
        </div>
      </div>

      {/* SECTION 2: 30-Day Evolution Chart (Recharts) */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-6 border-b border-gray-100 pb-4">
          <TrendingUp className="w-6 h-6 text-blue-600" />
          <h3 className="text-lg font-bold text-gray-900">Évolution de vos scores (30 derniers jours)</h3>
        </div>
        
        <div className="h-64 w-full">
          {isLoadingHistory ? (
            <div className="w-full h-full flex items-center justify-center text-gray-400">
              Chargement du graphique...
            </div>
          ) : historyError ? (
            <div className="w-full h-full flex items-center justify-center text-red-500 text-sm">
              {historyError}
            </div>
          ) : historyData.length < 2 ? (
            <div className="w-full h-full flex items-center justify-center text-gray-500 text-sm italic">
              Pas assez de données pour afficher une tendance. Continuez à vous entraîner !
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={historyData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis 
                  dataKey="date" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#6B7280', fontSize: 12 }} 
                  dy={10}
                />
                <YAxis 
                  domain={[0, 100]} 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#6B7280', fontSize: 12 }} 
                  dx={-10}
                />
                <Tooltip 
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  formatter={(value: number) => [`${value}%`, 'Score']}
                />
                <Line 
                  type="monotone" 
                  dataKey="score" 
                  stroke="#2563EB" 
                  strokeWidth={3}
                  dot={{ r: 4, fill: '#2563EB', strokeWidth: 0 }}
                  activeDot={{ r: 6, strokeWidth: 0 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* SECTION 3: Detailed AI Feedback */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="flex items-center gap-2 p-6 border-b border-gray-100 bg-gray-50">
          <BrainCircuit className="w-6 h-6 text-indigo-600" />
          <h3 className="text-lg font-bold text-gray-900">Correction Détaillée & Feedback IA</h3>
        </div>

        <div className="divide-y divide-gray-100">
          {result.feedbacks.map((item, index) => (
            <div key={item.question_id} className={`p-6 transition-colors ${!item.is_correct ? 'bg-red-50/30' : ''}`}>
              
              <div className="flex items-start gap-3">
                <div className="mt-1">
                  {item.is_correct ? (
                    <CheckCircle className="w-5 h-5 text-green-500" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-500" />
                  )}
                </div>
                
                <div className="flex-1 space-y-3">
                  <h4 className="font-semibold text-gray-900">Question {index + 1}</h4>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                      <span className="block text-xs font-medium text-gray-500 uppercase mb-1">Votre réponse</span>
                      <span className={item.is_correct ? 'text-gray-900' : 'text-red-700 font-medium'}>
                        {item.student_answer || "Aucune réponse fournie"}
                      </span>
                    </div>
                    
                    {!item.is_correct && (
                      <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                        <span className="block text-xs font-medium text-green-700 uppercase mb-1">Bonne réponse</span>
                        <span className="text-green-800 font-medium">{item.correct_answer}</span>
                      </div>
                    )}
                  </div>

                  {/* AI Targeted Feedback (Only for incorrect answers) */}
                  {!item.is_correct && item.ai_feedback && (
                    <div className="mt-4 p-4 bg-indigo-50 border border-indigo-100 rounded-lg text-sm text-indigo-900">
                      <div className="flex gap-2 font-medium mb-1 items-center">
                        <BrainCircuit className="w-4 h-4" />
                        Explication de l'IA :
                      </div>
                      <p className="leading-relaxed whitespace-pre-wrap">{item.ai_feedback}</p>
                      
                      {item.source_page && (
                        <div className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-indigo-700 bg-indigo-100 px-2 py-1 rounded">
                          <BookOpen className="w-3 h-3" />
                          Source : Page {item.source_page}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Action Footer */}
      <div className="flex justify-center pt-4">
        <button
          onClick={onClose}
          className="flex items-center gap-2 px-6 py-3 text-base font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800 transition-colors shadow-sm"
        >
          Retour au document <ArrowRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}