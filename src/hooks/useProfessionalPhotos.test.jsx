import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/adminService.js', () => ({ getAdminCatalog: vi.fn() }));

import { getAdminCatalog } from '../services/adminService.js';
import { useProfessionalPhotos } from './useProfessionalPhotos.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useProfessionalPhotos', () => {
  it('maps each professional id, inactive ones included, to its photo URL', async () => {
    getAdminCatalog.mockResolvedValue({
      professionals: [
        { id: 'alex-garcia', name: 'Alex García', active: true, photoUrl: '/api/catalog/professionals/alex-garcia/photo?v=1' },
        { id: 'pedro', name: 'Pedro', active: false, photoUrl: '/api/catalog/professionals/pedro/photo?v=2' },
        { id: 'maria-lopez', name: 'María López', active: true, photoUrl: null },
        { id: 'legacy', name: 'Legacy', active: true },
      ],
    });

    const { result } = renderHook(() => useProfessionalPhotos());

    await waitFor(() => expect(result.current['alex-garcia']).toBeDefined());
    expect(result.current).toEqual({
      'alex-garcia': '/api/catalog/professionals/alex-garcia/photo?v=1',
      pedro: '/api/catalog/professionals/pedro/photo?v=2',
    });
    expect(getAdminCatalog).toHaveBeenCalledTimes(1);
  });

  it('stays empty (initials everywhere) when the catalog cannot be read', async () => {
    getAdminCatalog.mockRejectedValue(new Error('down'));

    const { result } = renderHook(() => useProfessionalPhotos());

    await waitFor(() => expect(getAdminCatalog).toHaveBeenCalled());
    expect(result.current).toEqual({});
  });

  it('does not update after unmount', async () => {
    let resolve;
    getAdminCatalog.mockReturnValue(new Promise((r) => { resolve = r; }));
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { unmount } = renderHook(() => useProfessionalPhotos());
    unmount();
    resolve({ professionals: [] });
    await Promise.resolve();

    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });
});
