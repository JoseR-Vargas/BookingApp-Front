import { afterEach, describe, expect, it } from 'vitest';
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

  // An <img> tag cannot send the X-Tenant header, so the business travels in the URL of the file.
  describe('the business of the file (spec 19)', () => {
    afterEach(() => {
      window.history.pushState({}, '', '/');
    });

    it('adds the business of the route to the URL', () => {
      window.history.pushState({}, '', '/n/sur/admin');
      expect(backendAssetUrl('/api/catalog/professionals/ana/photo?v=7')).toBe(
        `${APP_CONFIG.BACKEND_URL}/api/catalog/professionals/ana/photo?v=7&tenant=sur`,
      );
    });

    it('starts the query when the path has none', () => {
      window.history.pushState({}, '', '/n/sur');
      expect(backendAssetUrl('/api/branding/logo')).toBe(
        `${APP_CONFIG.BACKEND_URL}/api/branding/logo?tenant=sur`,
      );
    });

    it('adds nothing in the default business', () => {
      window.history.pushState({}, '', '/admin');
      expect(backendAssetUrl('/api/catalog/professionals/ana/photo?v=7')).toBe(
        `${APP_CONFIG.BACKEND_URL}/api/catalog/professionals/ana/photo?v=7`,
      );
    });

    it('never touches a data or blob URL', () => {
      window.history.pushState({}, '', '/n/sur');
      expect(backendAssetUrl('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
      expect(backendAssetUrl('blob:http://localhost/abc')).toBe('blob:http://localhost/abc');
    });
  });
});
