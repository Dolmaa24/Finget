import React, { useState, useRef, useEffect } from 'react';
import { BotMessageSquare, SendHorizontal, User } from 'lucide-react';
import type { Message } from '../hooks/useAiCoach';

interface Props {
  messages: Message[];
  onSendMessage: (text: string) => void;
  isTyping?: boolean;
}

export const AiMoneyCoach: React.FC<Props> = ({ messages, onSendMessage, isTyping }) => {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      onSendMessage(input.trim());
      setInput('');
    }
  };

  return (
    <div className="flex flex-col h-full min-h-[400px] bg-navy-800 rounded-3xl border border-slate-700/50 shadow-lg overflow-hidden">
      {/* Header */}
      <div className="bg-navy-900/80 backdrop-blur-md border-b border-slate-700/50 p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
          <BotMessageSquare className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h3 className="text-slate-100 font-semibold leading-tight">AI Money Coach</h3>
          <p className="text-xs text-slate-400">Context-aware financial assistant</p>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 pr-2 custom-scrollbar">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex items-end gap-2 max-w-[85%] ${
              msg.role === 'user' ? 'ml-auto flex-row-reverse' : 'mr-auto'
            }`}
          >
            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
              msg.role === 'user' ? 'bg-slate-700 text-slate-300' : 'bg-primary/20 text-primary'
            }`}>
              {msg.role === 'user' ? <User className="w-4 h-4" /> : <BotMessageSquare className="w-4 h-4" />}
            </div>
            <div
              className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-primary text-white rounded-br-sm'
                  : 'bg-navy-900 border border-slate-700 text-slate-200 rounded-bl-sm'
              }`}
            >
              {/* If streaming response is still empty, show bubble */}
              {msg.content === "" ? (
                 <span className="flex gap-1 py-1">
                   <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce"></span>
                   <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></span>
                   <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></span>
                 </span>
              ) : msg.content}
            </div>
          </div>
        ))}
        {/* Loading Indicator when we haven't created the assistant bubble yet */}
        {isTyping && messages.length > 0 && messages[messages.length - 1].role === 'user' && (
          <div className="flex items-center gap-2 max-w-[85%] mr-auto">
             <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
               <BotMessageSquare className="w-4 h-4 text-primary" />
             </div>
             <div className="px-4 py-3 rounded-2xl bg-navy-900 border border-slate-700 text-slate-400 rounded-bl-sm flex gap-1">
               <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce"></span>
               <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></span>
               <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></span>
             </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <form onSubmit={handleSubmit} className="p-4 bg-navy-900/50 border-t border-slate-700/50">
        <div className="relative flex items-center bg-navy-900 rounded-full border border-slate-600 focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/50 transition-all">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isTyping}
            placeholder={isTyping ? "Coach is typing..." : "Ask 'Can I afford 4,000 for dinner?'"}
            className="flex-1 bg-transparent py-3 pl-5 pr-12 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!input.trim() || isTyping}
            className="absolute right-2 p-2 rounded-full text-slate-400 hover:text-primary hover:bg-primary/10 transition-colors disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-slate-400"
          >
            <SendHorizontal className="w-5 h-5" />
          </button>
        </div>
      </form>
    </div>
  );
};
