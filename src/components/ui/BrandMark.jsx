import { useEffect, useState } from 'react';
import { brandLogoSrc } from '../../services/brandingService.js';
import { useBranding } from '../../state/brandingState.jsx';

/**
 * The app name with the business logo on its left (SPEC 03). Without a logo, or when the logo
 * cannot be loaded, only "BookingApp" is shown. Renders inline content so the caller's element
 * keeps its own layout (the navbar link, for one, truncates its text with an ellipsis).
 */
export default function BrandMark({ textClassName = '', logoClassName = 'h-7 w-7', hideText = false }) {
  const { logoUrl, businessName } = useBranding();
  const [failed, setFailed] = useState(false);

  // A new logo URL (the admin uploaded another one) deserves a fresh attempt.
  useEffect(() => setFailed(false), [logoUrl]);

  const src = failed ? null : brandLogoSrc(logoUrl);

  return (
    <>
      {src && (
        <img
          src={src}
          alt={businessName || 'Logo'}
          onError={() => setFailed(true)}
          className={`inline-block shrink-0 rounded-full object-cover align-middle ${hideText ? '' : 'mr-2'} ${logoClassName}`}
        />
      )}
      <span className={`${textClassName} ${hideText ? 'hidden' : ''}`.trim()}>BookingApp</span>
    </>
  );
}
