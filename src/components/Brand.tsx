import React from 'react';

/**
 * Finget mark — a coin arc inside a rounded aperture. Drawn inline so it
 * inherits the accent token and stays crisp at any size.
 */
export const BrandMark: React.FC<{ size?: number; className?: string }> = ({
  size = 34,
  className,
}) => (
  <span
    className={className}
    style={{
      width: size,
      height: size,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: size * 0.32,
      background: 'linear-gradient(145deg, var(--accent-soft), var(--accent))',
      boxShadow: '0 1px 1px rgb(255 255 255 / 0.5) inset, 0 6px 16px -8px rgb(91 84 214 / 0.8)',
      flexShrink: 0,
    }}
  >
    <svg
      width={size * 0.58}
      height={size * 0.58}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      {/* Downward arc — money flowing into a safe place */}
      <path
        d="M5 6.5h11.5a3.5 3.5 0 0 1 0 7H9l6 6"
        stroke="white"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M5 10.2h9" stroke="white" strokeWidth="2.4" strokeLinecap="round" opacity="0.75" />
    </svg>
  </span>
);

export const Wordmark: React.FC<{ className?: string }> = ({ className }) => (
  <span
    className={className}
    style={{
      fontWeight: 600,
      letterSpacing: '0.18em',
      fontSize: 15,
      color: 'var(--ink)',
    }}
  >
    FINGET
  </span>
);

export const BrandLockup: React.FC<{ size?: number; className?: string }> = ({
  size = 34,
  className,
}) => (
  <div className={`flex items-center gap-2.5 ${className || ''}`}>
    <BrandMark size={size} />
    <Wordmark />
  </div>
);
