import { useEffect, useState } from 'react';
import { backendAssetUrl } from '../../utils/assetUrl.js';

const SIZES = {
  sm: { box: 'size-8', text: 'text-xs' },
  md: { box: 'size-12', text: 'text-base' },
  lg: { box: 'size-20', text: 'text-2xl' },
};

/** Up to two initials of a name ('Alex García' -> 'AG'); '?' when there is no name. */
export function initialsOf(name) {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  return words.slice(0, 2).map((word) => word.charAt(0).toLocaleUpperCase('es')).join('');
}

/**
 * Round profile picture of a professional (SPEC 04). `photoUrl` is the backend-relative URL from
 * the catalog; without a photo (or when it fails to load) a circle with the initials takes its
 * place. Decorative on purpose: the name always sits next to it.
 */
export default function ProfessionalAvatar({ name, photoUrl = null, size = 'md', className = '' }) {
  const [failed, setFailed] = useState(false);
  const { box, text } = SIZES[size] || SIZES.md;

  // A new URL (the admin uploaded another photo) deserves a fresh attempt.
  useEffect(() => setFailed(false), [photoUrl]);

  const src = failed ? null : backendAssetUrl(photoUrl);

  if (src) {
    return (
      <img
        src={src}
        alt=""
        aria-hidden="true"
        loading="lazy"
        onError={() => setFailed(true)}
        className={`${box} shrink-0 rounded-full object-cover ${className}`.trim()}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={`${box} ${text} inline-flex shrink-0 items-center justify-center rounded-full bg-accent font-semibold text-text-inverse ${className}`.trim()}
    >
      {initialsOf(name)}
    </span>
  );
}
