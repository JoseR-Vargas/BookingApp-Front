import { describe, expect, it } from 'vitest';
import { APP_CONFIG } from '../config/appConfig.js';
import { brandLogoSrc } from '../services/brandingService.js';
import { backendAssetUrl } from './assetUrl.js';

describe('backendAssetUrl', () => {
  it('points a backend-relative path at the backend', () => {
    expect(backendAssetUrl('/api/catalog/professionals/ana/photo?v=7')).toBe(
      `${APP_CONFIG.BACKEND_URL}/api/catalog/professionals/ana/photo?v=7`,
    );
  });

  it('leaves data and blob URLs alone (previews before upload)', () => {
    expect(backendAssetUrl('data:image/jpeg;base64,AAAA')).toBe('data:image/jpeg;base64,AAAA');
    expect(backendAssetUrl('blob:http://localhost/abc')).toBe('blob:http://localhost/abc');
  });

  it('returns null for an empty path', () => {
    expect(backendAssetUrl(null)).toBeNull();
    expect(backendAssetUrl(undefined)).toBeNull();
    expect(backendAssetUrl('')).toBeNull();
  });

  it('keeps brandLogoSrc working through it', () => {
    expect(brandLogoSrc('/api/branding/logo?v=1')).toBe(backendAssetUrl('/api/branding/logo?v=1'));
    expect(brandLogoSrc(null)).toBeNull();
  });
});
