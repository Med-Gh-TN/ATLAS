'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Send, PlusCircle, Search, Bot, User, Loader2, FileSearch } from 'lucide-react';
import api from '../../lib/api'; // ARCHITECTURE FIX: Use centralized api instance
import CourseSearchModal from './CourseSearchModal';

export interface ChatInterfaceProps {
  documentVersionId: string;
  onSourceClick: (page: number, chunk: string) => void;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
}

export default function ChatInterface({ documentVersionId, onSourceClick }: ChatInterfaceProps) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isInitializing, setIsInitializing] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isThinking]);

  // ARCHITECTURE FIX: Initialize RAG Session using centralized Axios instance
  const initSession = async () => {
    setIsInitializing(true);
    try {
      const res = await api.post('/rag/sessions', { 
        document_version_id: documentVersionId 
      });
      
      setSessionId(res.data.session_id);
      setMessages([{
        id: 'welcome',
        role: 'assistant',
        content: "Bonjour ! Je suis l'assistant ATLAS. Posez-moi vos questions sur ce document.",
        timestamp: new Date()
      }]);
    } catch (error) {
      console.error('Session init error:', error);
      // Fallback UI to let user know it failed
      setMessages([{
        id: 'error',
        role: 'assistant',
        content: "Désolé, je n'ai pas pu initialiser la session. Le serveur IA est peut-être indisponible.",
        timestamp: new Date()
      }]);
    } finally {
      setIsInitializing(false);
    }
  };

  // Mount initialization
  useEffect(() => {
    if (documentVersionId && !sessionId) {
      initSession();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentVersionId]);

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || !sessionId || isThinking) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date()
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsThinking(true);

    const assistantMsgId = (Date.now() + 1).toString();
    setMessages((prev) => [
      ...prev,
      { id: assistantMsgId, role: 'assistant', content: '', timestamp: new Date(), isStreaming: true }
    ]);

    try {
      // ARCHITECTURE FIX: Using standard Fetch for Streaming, but pulling the token explicitly from localStorage to bypass Zustand hydration issues
      const authStorage = localStorage.getItem('auth-storage');
      let token = '';
      if (authStorage) {
        const parsed = JSON.parse(authStorage);
        token = parsed?.state?.token || '';
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1'}/rag/sessions/${sessionId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ content: userMsg.content })
      });

      setIsThinking(false); // Stream starts, turn off thinking indicator

      if (!response.body) throw new Error('No stream body');
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let done = false;

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          const chunkString = decoder.decode(value, { stream: true });
          
          // Defensive Parse: Backend yields raw JSON chunks or plain text depending on llm_stream implementation
          let textDelta = chunkString;
          try {
            const parsed = JSON.parse(chunkString);
            textDelta = parsed.delta || chunkString;
          } catch {
            // If it's not JSON, assume it's raw text stream
          }

          setMessages((prev) => 
            prev.map((msg) => 
              msg.id === assistantMsgId 
                ? { ...msg, content: msg.content + textDelta } 
                : msg
            )
          );
        }
      }

      // Stream complete
      setMessages((prev) => 
        prev.map((msg) => 
          msg.id === assistantMsgId ? { ...msg, isStreaming: false } : msg
        )
      );

    } catch (error) {
      console.error('Streaming error:', error);
      setIsThinking(false);
      setMessages((prev) => 
        prev.map((msg) => 
          msg.id === assistantMsgId 
            ? { ...msg, content: "Une erreur est survenue lors de la génération de la réponse.", isStreaming: false } 
            : msg
        )
      );
    }
  };

  /**
   * Parser to dynamically inject the clickable Chip for "Source: Page X"
   */
  const renderMessageContent = (content: string, isStreaming?: boolean) => {
    // Regex to find variations of "Source: Page X"
    const sourceRegex = /(Source\s*:\s*Page\s*\d+)/gi;
    const parts = content.split(sourceRegex);

    return (
      <div className="text-sm leading-relaxed whitespace-pre-wrap">
        {parts.map((part, index) => {
          const match = part.match(/Source\s*:\s*Page\s*(\d+)/i);
          if (match) {
            const pageNum = parseInt(match[1], 10);
            return (
              <button
                key={index}
                onClick={() => onSourceClick(pageNum, "")}
                className="inline-flex items-center gap-1 px-2 py-0.5 mt-1 mx-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-md text-xs font-bold transition-colors cursor-pointer shadow-sm group"
              >
                <FileSearch className="w-3 h-3 group-hover:scale-110 transition-transform" />
                {part}
              </button>
            );
          }
          return <span key={index}>{part}</span>;
        })}
        {isStreaming && (
          <span className="inline-block w-2 h-4 ml-1 bg-neutral-800 animate-pulse align-middle" />
        )}
      </div>
    );
  };

  const formatTime = (date: Date) => {
    return new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(date);
  };

  if (isInitializing) {
    return (
      <div className="flex-grow bg-white border border-neutral-200 rounded-2xl flex flex-col items-center justify-center p-8">
        <Loader2 className="w-8 h-8 animate-spin text-neutral-300 mb-4" />
        <p className="text-sm font-semibold text-neutral-500">Initialisation de la session RAG...</p>
      </div>
    );
  }

  return (
    <>
      <div className="flex-grow bg-white border border-neutral-200 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden flex flex-col relative h-[600px] lg:h-auto">
        
        {/* Header Actions */}
        <div className="px-4 py-3 border-b border-neutral-100 bg-neutral-50/50 flex items-center justify-between shrink-0">
          <button 
            onClick={initSession}
            className="flex items-center gap-1.5 text-xs font-bold text-neutral-600 hover:text-neutral-900 bg-white border border-neutral-200 hover:border-neutral-300 px-3 py-1.5 rounded-lg transition-all shadow-sm"
          >
            <PlusCircle className="w-3.5 h-3.5" /> Nouvelle Session
          </button>
          <button 
            onClick={() => setIsSearchModalOpen(true)}
            className="flex items-center gap-1.5 text-xs font-bold text-neutral-600 hover:text-neutral-900 bg-white border border-neutral-200 hover:border-neutral-300 px-3 py-1.5 rounded-lg transition-all shadow-sm"
          >
            <Search className="w-3.5 h-3.5" /> Choisir un autre cours
          </button>
        </div>

        {/* Message History Area */}
        <div className="flex-grow overflow-y-auto p-4 space-y-6 bg-white">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`flex gap-3 max-w-[85%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                
                {/* Avatar */}
                <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center border shadow-sm ${msg.role === 'user' ? 'bg-neutral-900 border-neutral-800 text-white' : 'bg-blue-50 border-blue-100 text-blue-600'}`}>
                  {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                </div>

                {/* Bubble */}
                <div className="flex flex-col gap-1">
                  <div className={`px-4 py-3 rounded-2xl shadow-sm ${msg.role === 'user' ? 'bg-neutral-900 text-white rounded-tr-sm' : 'bg-neutral-50 border border-neutral-100 text-neutral-800 rounded-tl-sm'}`}>
                    {renderMessageContent(msg.content, msg.isStreaming)}
                  </div>
                  <span className={`text-[10px] font-medium text-neutral-400 px-1 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
                    {formatTime(msg.timestamp)}
                  </span>
                </div>

              </div>
            </div>
          ))}

          {/* AI is thinking indicator */}
          {isThinking && (
            <div className="flex w-full justify-start">
              <div className="flex gap-3 max-w-[85%] flex-row">
                <div className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center border shadow-sm bg-blue-50 border-blue-100 text-blue-600">
                  <Bot className="w-4 h-4" />
                </div>
                <div className="px-4 py-3 rounded-2xl shadow-sm bg-neutral-50 border border-neutral-100 text-neutral-800 rounded-tl-sm flex items-center gap-1 h-[46px]">
                  <div className="w-1.5 h-1.5 bg-neutral-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-1.5 h-1.5 bg-neutral-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-1.5 h-1.5 bg-neutral-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-4 bg-white border-t border-neutral-100 shrink-0">
          <form onSubmit={handleSendMessage} className="relative flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder="Posez votre question sur le document..."
              className="w-full bg-neutral-50 border border-neutral-200 text-sm rounded-xl px-4 py-3 pr-12 focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:border-transparent resize-none max-h-32 min-h-[44px]"
              rows={1}
            />
            <button
              type="submit"
              disabled={!input.trim() || isThinking || !sessionId}
              className="absolute right-2 bottom-2 p-1.5 bg-neutral-900 text-white rounded-lg hover:bg-neutral-800 disabled:opacity-50 disabled:hover:bg-neutral-900 transition-colors"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
          <p className="text-[10px] text-center text-neutral-400 mt-2 font-medium">
            L'IA peut faire des erreurs. Vérifiez les informations dans le PDF.
          </p>
        </div>
      </div>

      <CourseSearchModal 
        isOpen={isSearchModalOpen} 
        onClose={() => setIsSearchModalOpen(false)} 
      />
    </>
  );
}