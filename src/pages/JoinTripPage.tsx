import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CalendarDays } from 'lucide-react';
import { fetchTripPreview, groupApi, type TripPreview } from '../api';
import { useAuth } from '../context/authStore';
import { useScope } from '../context/scopeStore';
import { useToast } from '../context/toastStore';
import { AuthModal } from '../components/AuthModal';
import { Button, SkeletonPanel } from '../components/ui';

/**
 * The pre-signup trip landing page.
 *
 * Deliberately readable while logged out — a join flow that demands a signup
 * before showing what you are joining does not get used. What it shows comes
 * from the server's redacted preview, which excludes the trip total on
 * purpose: that is the figure that would make a leaked link worth having.
 *
 * Once signed in, the same page swaps the sign-up prompt for a join button and
 * the token is exchanged for membership.
 */
export const JoinTripPage: React.FC = () => {
  const { previewToken = '' } = useParams();
  const { token } = useAuth();
  const { reloadGroups, setScope } = useScope();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [preview, setPreview] = useState<TripPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchTripPreview(previewToken)
      .then((p) => !cancelled && setPreview(p))
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : 'Invite not found'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [previewToken]);

  const join = async () => {
    setJoining(true);
    try {
      const group = await groupApi.joinByToken(previewToken);
      // Load the group list before switching, so Friends mode has the group
      // it is about to select.
      await reloadGroups();
      setScope('group', group._id);
      toast(`You're in — welcome to ${group.name}.`, 'success');
      navigate('/dashboard');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not join.', 'error');
    } finally {
      setJoining(false);
    }
  };

  /** Signing in from here should land back on the join, not the dashboard. */
  useEffect(() => {
    if (token && authOpen) {
      setAuthOpen(false);
      join();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const dates =
    preview?.startDate && preview?.endDate
      ? `${new Date(preview.startDate).toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'short',
        })} – ${new Date(preview.endDate).toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'short',
        })}`
      : null;

  return (
    <div className="min-h-screen grid place-items-center p-6">
      <div className="glass-strong glass-sheen rounded-xl p-8 sm:p-10 max-w-md w-full text-center animate-rise">
        {loading ? (
          <SkeletonPanel height={220} />
        ) : error || !preview ? (
          <>
            <h1 className="display text-3xl mb-3">Link not available</h1>
            <p className="text-[14px] text-ink-2 mb-7">
              {error || 'This invite has expired or been turned off.'} Ask whoever sent it for a
              fresh one.
            </p>
            <Button onClick={() => navigate('/')}>Go to Finget</Button>
          </>
        ) : (
          <>
            <p className="eyebrow mb-5">You're invited</p>
            <p className="text-[52px] leading-none mb-4">{preview.emoji}</p>
            <h1 className="display text-3xl sm:text-4xl mb-3">{preview.name}</h1>

            <p className="text-[14px] text-ink-2 mb-2">
              <strong className="text-ink">{preview.inviterName}</strong>
              {preview.memberCount > 1 && (
                <>
                  {' '}
                  and {preview.memberCount - 1} other
                  {preview.memberCount - 1 === 1 ? '' : 's'}
                </>
              )}{' '}
              are splitting this{preview.kind === 'trip' ? ' trip' : ''}.
            </p>

            {dates && (
              <p className="text-[13px] text-ink-3 flex items-center justify-center gap-1.5 mb-5">
                <CalendarDays className="w-3.5 h-3.5" />
                {dates}
              </p>
            )}

            <div className="flex justify-center gap-2 mb-7 flex-wrap">
              {preview.initials.map((initial, i) => (
                <span
                  key={`${initial}-${i}`}
                  className="w-10 h-10 rounded-full bg-[var(--accent-wash)] text-accent grid place-items-center font-semibold text-[15px]"
                >
                  {initial}
                </span>
              ))}
            </div>

            {token ? (
              <Button onClick={join} loading={joining} className="w-full">
                Join {preview.name}
              </Button>
            ) : (
              <>
                <Button onClick={() => setAuthOpen(true)} className="w-full">
                  Sign up to join
                </Button>
                <p className="text-[12.5px] text-ink-3 mt-4">
                  Free. No ads, no selling data, and Finget never holds your money.
                </p>
              </>
            )}
          </>
        )}
      </div>

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} defaultTab="signup" />
    </div>
  );
};
