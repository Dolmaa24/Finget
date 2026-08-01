import React, { useState, useRef, useEffect } from 'react';
import { Bot, SendHorizontal, User, Sparkles } from 'lucide-react';
import type { Message } from '../hooks/useAiCoach';

interface Props {
  messages: Message[];
  onSendMessage: (text: string) => void;
  isTyping?: boolean;
}

export const AiMoneyCoach: React.FC<Props> = ({ messages, onSendMessage, isTyping }) => {
  const [input, setInput] = useState('');
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const isFirstRender = useRef(true);

  const quickPrompts = [
    'Can I afford ₹3,500 dinner tonight?',
    'What is my monthly burn rate?',
    'Where am I leaking subscription money?',
  ];

  const scrollToBottom = () => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
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
    <div className="flex flex-col h-full min-h-[440px] glass-card-frosted rounded-3xl border border-white/15 shadow-[0_12px_40px_rgba(0,0,0,0.6)] overflow-hidden text-white">
      {/* Header */}
      <div className="bg-slate-950/40 backdrop-blur-xl border-b border-white/10 p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center shadow-xs">
            <Bot className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold font-display text-white leading-tight">AI Money Coach</h3>
            <p className="text-[10px] font-semibold text-slate-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>ONLINE ADVISOR</span>
            </p>
          </div>
        </div>
      </div>

      {/* Messages Area */}
      <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-4 space-y-3.5 pr-2 custom-scrollbar max-h-[360px]">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex items-end gap-2.5 max-w-[90%] ${
              msg.role === 'user' ? 'ml-auto flex-row-reverse' : 'mr-auto'
            }`}
          >
            <div
              className={`w-7 h-7 rounded-2xl flex items-center justify-center shrink-0 ${
                msg.role === 'user'
                  ? 'bg-gradient-to-tr from-amber-500 to-rose-500 text-white'
                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
              }`}
            >
              {msg.role === 'user' ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
            </div>

            <div
              className={`p-3.5 rounded-3xl text-xs leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-gradient-to-r from-amber-500 via-rose-500 to-purple-600 text-white rounded-br-none shadow-md font-medium'
                  : 'bg-slate-900/70 border border-white/15 text-slate-200 rounded-bl-none shadow-xs backdrop-blur-md'
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {isTyping && (
          <div className="flex items-center gap-2 text-slate-400 text-xs font-semibold p-2">
            <Sparkles className="w-3.5 h-3.5 animate-spin text-amber-400" />
            <span>Coach is analyzing ledger...</span>
          </div>
        )}
      </div>

      {/* Quick Prompt Chips */}
      <div className="p-3 border-t border-white/10 bg-slate-950/30 backdrop-blur-md flex flex-wrap gap-1.5">
        {quickPrompts.map((p, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => onSendMessage(p)}
            className="text-[10px] font-medium bg-slate-900/70 hover:bg-slate-800 text-slate-300 hover:text-white px-2.5 py-1 rounded-full border border-white/15 transition-all shadow-xs"
          >
            {p}
          </button>
        ))}
      </div>

      {/* Input Box */}
      <form onSubmit={handleSubmit} className="p-3 bg-slate-950/40 border-t border-white/10 flex items-center gap-2">
        <div className="relative flex-1 flex items-center bg-slate-900/80 rounded-2xl border border-white/15 shadow-xs">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask AI Coach a financial question..."
            disabled={isTyping}
            className="flex-1 bg-transparent py-2.5 pl-4 pr-10 text-xs text-white placeholder:text-slate-500 focus:outline-none disabled:opacity-50 font-medium"
          />
          <button
            type="submit"
            disabled={isTyping || !input.trim()}
            className="absolute right-2 p-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-rose-500 hover:from-amber-400 hover:to-rose-400 disabled:opacity-30 text-white transition-all shadow-xs"
          >
            <SendHorizontal className="w-3.5 h-3.5" />
          </button>
        </div>
      </form>
    </div>
  );
};
