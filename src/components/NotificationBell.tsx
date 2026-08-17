import { cn } from '../lib/cn';
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, HandCoins, Sparkles, Trophy, Info } from 'lucide-react';
import { notificationApi, type Notification } from '../api';
import { inr, relativeDate } from '../lib/format';
import { Button, EmptyState } from './ui';

const ICON: Record<Notification['kind'], React.ReactNode> = {
  reminder: <HandCoins className="w-4 h-4" />,
  settlement: <Sparkles className="w-4 h-4" />,
  wrapped: <Trophy className="w-4 h-4" />,
  system: <Info className="w-4 h-4" />,
};

/** Often enough to feel live, rare enough to be invisible on a phone plan. */
const POLL_MS = 90_000;

/**
 * The notification bell.
 *
 * Finget had no way to tell anyone anything until Milestone 5 — the Silent
 * Collector needed somewhere to put a reminder, and Wrapped had been quietly
 * unable to announce itself since Milestone 3. This is that place.
 *
 * Polled rather than pushed on purpose. There is already a Socket.IO channel,
 * but it is scoped to a group room, and notifications are personal — wiring
 * per-user sockets to save a request every ninety seconds is a lot of moving
 * parts for a badge.
 */
export const NotificationBell: React.FC = () => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [anchor, setAnchor] = useState({ top: 0, right: 0 });
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await notificationApi.list();
      setItems(res.notifications);
      setUnread(res.unreadCount);
    } catch {
      // A failed poll is not worth a toast. The next one picks it up.
    }
  }, []);

  useEffect(() => {
    // Both the first fetch and the poll go through timers rather than running
    // inline: an effect body that sets state synchronously triggers a cascading
    // render, and this one has no reason to.
    const first = setTimeout(load, 0);
    const timer = setInterval(load, POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [load]);

  /**
   * Where to pin the portalled panel, in viewport coordinates.
   *
   * Recomputed on open and on any resize/scroll while open, because the panel
   * no longer lives next to its button in the DOM and nothing else would keep
   * the two together.
   */
  useLayoutEffect(() => {
    if (!open) return;

    const place = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      setAnchor({ top: rect.bottom + 8, right: Math.max(12, window.innerWidth - rect.right) });
    };

    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  // Close on an outside click or Escape, the way every other popover here does.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      // The panel is portalled out of this component's subtree, so both it and
      // the button have to be checked explicitly — `panelRef` alone no longer
      // covers the button that opened it.
      if (panelRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const markAllRead = async () => {
    setUnread(0);
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    try {
      await notificationApi.markRead();
    } catch {
      load();
    }
  };

  const openItem = async (item: Notification) => {
    if (!item.read) {
      setUnread((n) => Math.max(0, n - 1));
      setItems((prev) => prev.map((n) => (n._id === item._id ? { ...n, read: true } : n)));
      notificationApi.markRead([item._id]).catch(() => load());
    }
    if (item.href) {
      setOpen(false);
      navigate(item.href);
    }
  };

  /**
   * PORTALLED, and it has to be.
   *
   * The top bar is a `rounded-pill` with `overflow: hidden` — it clips its
   * children to a 64px-tall bar, which silently swallowed all 400px of this
   * panel. `position: fixed` does not escape it either: the bar carries a
   * `backdrop-filter`, and that makes it a containing block for fixed
   * descendants. Rendering into `document.body` is the only thing that gets
   * the panel out from under both.
   */
  const panel = (
    <div
      ref={panelRef}
      style={{ position: 'fixed', top: anchor.top, right: anchor.right }}
      className="w-[min(360px,calc(100vw-1.5rem))] z-[80] glass-modal glass-sheen rounded-lg p-4 animate-pop"
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-ink text-[15px]">Notifications</h3>
        {unread > 0 && (
          <button
            type="button"
            onClick={markAllRead}
            className="inline-flex items-center gap-1.5 text-[12px] font-medium text-ink-3 hover:text-accent transition-colors"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            Mark all read
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={<Bell className="w-6 h-6" />}
          title="Nothing to catch up on"
          body="Settle-up reminders and group updates land here."
          className="!py-8"
        />
      ) : (
        <ul className="space-y-2 max-h-[min(60vh,460px)] overflow-y-auto scroll-slim pr-1">
          {items.map((item) => (
            <li key={item._id}>
              <div
                className={cn(
                  'rounded-md p-3 transition-colors',
                  item.read ? 'bg-white/30' : 'glass-well ring-1 ring-[var(--accent-wash)]'
                )}
              >
                <button
                  type="button"
                  onClick={() => openItem(item)}
                  className="flex items-start gap-2.5 text-left w-full"
                >
                  <span
                    className={cn(
                      'w-7 h-7 rounded-sm flex items-center justify-center shrink-0 mt-0.5',
                      item.read ? 'bg-white/50 text-ink-3' : 'bg-[var(--accent-wash)] text-accent'
                    )}
                  >
                    {ICON[item.kind]}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium text-ink leading-snug">
                      {item.title}
                    </span>
                    <span className="block text-[12px] text-ink-2 leading-relaxed mt-0.5">
                      {item.body}
                    </span>
                    <span className="block text-[11px] text-ink-3 mt-1">
                      {relativeDate(item.createdAt)}
                    </span>
                  </span>
                </button>

                {item.payIntent && (
                  <div className="mt-2.5 pl-[38px]">
                    {/*
                      A plain link, not a fetch. It hands off to the UPI app
                      installed on this device; Finget neither sees nor moves
                      the money, and the debt stays open in the ledger until
                      somebody records the settlement on the Split page.
                    */}
                    <a
                      href={item.payIntent}
                      className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-pill bg-[var(--accent)]
                                 text-white text-[12.5px] font-semibold shadow-soft
                                 hover:bg-[var(--accent-soft)] transition-all duration-200 active:scale-[0.97]"
                    >
                      <HandCoins className="w-3.5 h-3.5" />
                      Pay {item.amount != null ? inr(item.amount) : ''} in your UPI app
                    </a>
                    <p className="text-[11px] text-ink-3 mt-1.5 leading-relaxed">
                      Opens your own UPI app. Finget never holds or moves the money — mark it paid
                      on Split &amp; settle once it goes through.
                    </p>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 pt-3 border-t border-white/50 flex justify-end">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setOpen(false);
            navigate('/settings');
          }}
        >
          Reminder settings
        </Button>
      </div>
    </div>
  );

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        className="relative shrink-0 p-2.5 rounded-pill text-ink-2 hover:bg-white/50 transition-colors"
      >
        <Bell className="w-[19px] h-[19px]" />
        {unread > 0 && (
          <span
            className="absolute top-1 right-1 min-w-[17px] h-[17px] px-1 rounded-pill bg-[var(--accent)]
                       text-white text-[10px] font-bold leading-[17px] text-center"
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && createPortal(panel, document.body)}
    </>
  );
};
