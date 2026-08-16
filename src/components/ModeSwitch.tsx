import { cn } from '../lib/cn';
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Users, Check, Plus, ChevronDown } from 'lucide-react';
import { useScope } from '../context/scopeStore';


/**
 * The Personal ⇄ Friends switch.
 *
 * A physical-feeling segmented control: the pill slides between the two modes
 * and the Friends half doubles as a group picker.
 */
export const ModeSwitch: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { context, groupId, group, groups, setScope } = useScope();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const isFriends = context === 'group';

  const chooseFriends = () => {
    if (groups.length === 0) {
      navigate('/friends');
      return;
    }
    if (!isFriends) setScope('group', groups[0]._id);
    setOpen((v) => !v);
  };

  return (
    <div ref={ref} className="relative">
      <div className="glass-well rounded-pill p-1 flex items-center gap-1 relative">
        {/* Sliding indicator */}
        <span
          aria-hidden
          className="absolute top-1 bottom-1 rounded-pill bg-white/85 shadow-soft transition-all duration-350 ease-spatial"
          style={{
            left: isFriends ? '50%' : '4px',
            width: 'calc(50% - 4px)',
          }}
        />

        <button
          type="button"
          onClick={() => setScope('user')}
          aria-pressed={!isFriends}
          className={cn(
            'relative z-10 flex-1 inline-flex items-center justify-center gap-1.5 rounded-pill h-8 px-3.5',
            'text-[13px] font-semibold transition-colors duration-250',
            !isFriends ? 'text-ink' : 'text-ink-3 hover:text-ink-2'
          )}
        >
          <User className="w-3.5 h-3.5" strokeWidth={2.2} />
          <span className={compact ? 'hidden md:inline' : ''}>Personal</span>
        </button>

        <button
          type="button"
          onClick={chooseFriends}
          aria-pressed={isFriends}
          aria-haspopup="menu"
          aria-expanded={open}
          title={groups.length === 0 ? 'Create a group to use Friends mode' : 'Switch group'}
          className={cn(
            'relative z-10 flex-1 inline-flex items-center justify-center gap-1.5 rounded-pill h-8 px-3.5',
            'text-[13px] font-semibold transition-colors duration-250',
            isFriends ? 'text-ink' : 'text-ink-3 hover:text-ink-2'
          )}
        >
          <Users className="w-3.5 h-3.5" strokeWidth={2.2} />
          <span className={compact ? 'hidden md:inline' : ''}>
            {isFriends && group ? group.name.slice(0, 14) : 'Friends'}
          </span>
          {isFriends && groups.length > 0 && (
            <ChevronDown className="w-3 h-3 opacity-60 shrink-0" />
          )}
        </button>
      </div>

      {open && groups.length > 0 && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 w-60 glass-strong glass-sheen rounded-md p-1.5 z-50 animate-pop"
        >
          <p className="eyebrow px-3 py-2">Your groups</p>
          {groups.map((g) => (
            <button
              key={g._id}
              role="menuitem"
              onClick={() => {
                setScope('group', g._id);
                setOpen(false);
              }}
              className={cn(
                'w-full flex items-center gap-2.5 px-3 py-2.5 rounded-sm text-left transition-colors',
                groupId === g._id ? 'bg-white/70' : 'hover:bg-white/45'
              )}
            >
              <span className="text-base leading-none">{g.emoji || '👥'}</span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium text-ink truncate">{g.name}</span>
                <span className="block text-[11px] text-ink-3">
                  {g.members.length} member{g.members.length === 1 ? '' : 's'}
                </span>
              </span>
              {groupId === g._id && <Check className="w-4 h-4 text-accent shrink-0" />}
            </button>
          ))}
          <button
            role="menuitem"
            onClick={() => {
              navigate('/friends');
              setOpen(false);
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-sm text-left hover:bg-white/45 transition-colors mt-1 border-t border-white/50"
          >
            <Plus className="w-4 h-4 text-accent" />
            <span className="text-sm font-medium text-ink">New or join a group</span>
          </button>
        </div>
      )}
    </div>
  );
};
