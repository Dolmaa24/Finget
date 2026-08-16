import { cn } from '../lib/cn';
import React, { useEffect, useRef, useState } from 'react';
import { Sparkles, SendHorizontal, Trash2, Info } from 'lucide-react';
import { useAuth } from '../context/authStore';
import type { CoachMessage } from '../hooks/useFinget';
import { Avatar, Button } from './ui';

const TypingDots = () => (
  <span className="flex gap-1 py-1.5" aria-label="Coach is typing">
    {[0, 0.16, 0.32].map((delay, i) => (
      <span
        key={i}
        className="w-1.5 h-1.5 rounded-full bg-ink-4 animate-bounce"
        style={{ animationDelay: `${delay}s` }}
      />
    ))}
  </span>
);

const SUGGESTIONS = [
  'Can I afford ₹4,000 for dinner?',
  'Where is my money leaking?',
  'How do I hit my goal faster?',
];

export const AiMoneyCoach: React.FC<{
  messages: CoachMessage[];
  onSend: (text: string) => void;
  onClear?: () => void;
  isTyping?: boolean;
  aiEnabled?: boolean;
  isGroup?: boolean;
  className?: string;
}> = ({ messages, onSend, onClear, isTyping, aiEnabled = true, isGroup, className }) => {
  const { user } = useAuth();
  const [input, setInput] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, isTyping]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || isTyping) return;
    onSend(text);
    setInput('');
  };

  return (
    <div className={cn('glass glass-sheen rounded-lg flex flex-col overflow-hidden', className)}>
      <div className="px-5 py-4 border-b border-white/55 flex items-center gap-3">
        <span className="w-9 h-9 rounded-md bg-[var(--accent-wash)] text-accent flex items-center justify-center shrink-0">
          <Sparkles className="w-[18px] h-[18px]" />
        </span>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-ink leading-tight">
            {isGroup ? 'Group money coach' : 'AI money coach'}
          </h3>
          <p className="text-[12px] text-ink-3">
            {aiEnabled
              ? isGroup
                ? 'Advises on the shared wallet'
                : 'Knows your real numbers'
              : 'Not connected'}
          </p>
        </div>
        {onClear && messages.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            aria-label="Clear conversation"
            className="p-2 rounded-pill text-ink-4 hover:text-risk hover:bg-white/50 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {!aiEnabled && (
        <div className="mx-4 mt-4 flex items-start gap-2.5 rounded-sm bg-[var(--warn-wash)] px-3.5 py-3">
          <Info className="w-4 h-4 text-warn mt-0.5 shrink-0" />
          <p className="text-[12px] text-ink-2 leading-relaxed">
            Add a <code className="font-mono text-[11px]">GROQ_API_KEY</code> to the backend
            <code className="font-mono text-[11px]"> .env</code> to enable live coaching. Everything
            else keeps working.
          </p>
        </div>
      )}

      <div className="flex-1 overflow-y-auto scroll-slim p-4 space-y-4 min-h-[240px]">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center gap-4 py-6">
            <span className="w-12 h-12 rounded-full glass flex items-center justify-center text-accent">
              <Sparkles className="w-5 h-5" />
            </span>
            <p className="text-sm text-ink-3 max-w-[240px]">
              Ask anything about {isGroup ? "the group's money" : 'your money'}.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onSend(s)}
                  disabled={isTyping}
                  className="text-[12px] px-3 py-1.5 rounded-pill glass-well text-ink-2 hover:bg-white/60 transition-colors disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => {
          const mine = msg.role === 'user';
          return (
            <div
              key={i}
              className={cn(
                'flex items-end gap-2.5 max-w-[88%]',
                mine ? 'ml-auto flex-row-reverse' : 'mr-auto'
              )}
            >
              {mine ? (
                <Avatar name={user?.name} size={28} />
              ) : (
                <span className="w-7 h-7 rounded-full bg-[var(--accent-wash)] text-accent flex items-center justify-center shrink-0">
                  <Sparkles className="w-3.5 h-3.5" />
                </span>
              )}
              <div
                className={cn(
                  'px-4 py-2.5 text-[13.5px] leading-relaxed whitespace-pre-wrap rounded-md',
                  mine
                    ? 'bg-[var(--accent)] text-white rounded-br-xs'
                    : 'glass-well text-ink rounded-bl-xs'
                )}
              >
                {msg.content === '' ? <TypingDots /> : msg.content}
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <form onSubmit={submit} className="p-3.5 border-t border-white/55">
        <div className="glass-well rounded-pill flex items-center pr-1.5 focus-within:ring-2 focus-within:ring-[var(--accent-wash)] transition-shadow">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isTyping}
            placeholder={isTyping ? 'Coach is thinking…' : 'Ask about your money…'}
            className="flex-1 bg-transparent h-11 px-4 text-sm outline-none placeholder:text-ink-4 disabled:opacity-60"
          />
          <Button
            type="submit"
            size="sm"
            disabled={!input.trim() || isTyping}
            className="!h-9 !w-9 !px-0 rounded-full"
            aria-label="Send"
          >
            <SendHorizontal className="w-4 h-4" />
          </Button>
        </div>
      </form>
    </div>
  );
};
