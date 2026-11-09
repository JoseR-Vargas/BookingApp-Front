import { describe, it, expect } from 'vitest';
import {
  getRecentBookings,
  filterByDate,
  sumConfirmedRevenue,
  getMonthlyCounts,
  getServiceCounts,
  getProfessionalName,
  filterByProfessional,
  getProfessionalNames,
} from './adminStats.js';

const year = new Date().getFullYear();

const mk = (over) => ({
  _id: 'x',
  date: `${year}-01-10`,
  status: 'confirmed',
  createdAt: '2030-01-01T00:00:00Z',
  services: [{ id: 's1', name: 'Servicio Básico', price: 1200, duration: 60 }],
  totalPrice: 1200,
  totalDuration: 60,
  professional: { name: 'Alex García' },
  ...over,
});

describe('getRecentBookings', () => {
  it('sorts by createdAt desc and limits to n without mutating the input', () => {
    const input = [
      mk({ _id: 'a', createdAt: '2030-01-01T00:00:00Z' }),
      mk({ _id: 'b', createdAt: '2030-03-01T00:00:00Z' }),
      mk({ _id: 'c', createdAt: '2030-02-01T00:00:00Z' }),
    ];
    const snapshot = input.map((b) => b._id);

    const result = getRecentBookings(input, 2);

    expect(result.map((b) => b._id)).toEqual(['b', 'c']);
    expect(input.map((b) => b._id)).toEqual(snapshot);
    expect(result).not.toBe(input);
  });

  it('defaults to 5 items', () => {
    const input = Array.from({ length: 8 }, (_, i) => mk({ _id: String(i) }));
    expect(getRecentBookings(input)).toHaveLength(5);
  });
});

describe('filterByDate', () => {
  const input = [mk({ date: '2030-01-10' }), mk({ date: '2030-01-11' })];

  it('returns only bookings of that exact date', () => {
    expect(filterByDate(input, '2030-01-10')).toHaveLength(1);
  });

  it('returns all bookings when no date is selected', () => {
    expect(filterByDate(input, '')).toHaveLength(2);
  });
});

describe('sumConfirmedRevenue', () => {
  it('sums only confirmed bookings', () => {
    const input = [
      mk({ status: 'confirmed', totalPrice: 500 }),
      mk({ status: 'cancelled', totalPrice: 9999 }),
      mk({ status: 'confirmed', totalPrice: 700 }),
      mk({ status: 'pending', totalPrice: 1 }),
    ];
    expect(sumConfirmedRevenue(input)).toBe(1200);
  });

  it('uses the booking totalPrice, so a multi-service booking counts all its lines once', () => {
    const multi = mk({
      services: [
        { id: 'a', name: 'A', price: 500, duration: 60 },
        { id: 'b', name: 'B', price: 1200, duration: 60 },
        { id: 'c', name: 'C', price: 2500, duration: 60 },
      ],
      totalPrice: 4200,
    });
    expect(sumConfirmedRevenue([multi, mk({ totalPrice: 1200 })])).toBe(5400);
  });

  it('ignores bookings without totalPrice', () => {
    expect(sumConfirmedRevenue([mk({ totalPrice: undefined })])).toBe(0);
  });

  it('is 0 for an empty list', () => {
    expect(sumConfirmedRevenue([])).toBe(0);
  });
});

describe('getMonthlyCounts', () => {
  it('returns 12 buckets counting only the current year', () => {
    const input = [
      mk({ date: `${year}-01-05` }),
      mk({ date: `${year}-01-20` }),
      mk({ date: `${year}-12-31` }),
      mk({ date: `${year - 1}-01-05` }),
      mk({ date: undefined }),
    ];
    const counts = getMonthlyCounts(input);
    expect(counts).toHaveLength(12);
    expect(counts[0]).toBe(2);
    expect(counts[11]).toBe(1);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(3);
  });

  it('accepts an explicit year and tolerates null input', () => {
    expect(getMonthlyCounts([mk({ date: '2020-03-01' })], 2020)[2]).toBe(1);
    expect(getMonthlyCounts(null)).toEqual(Array(12).fill(0));
  });
});

describe('getServiceCounts', () => {
  it('groups by service name preserving first-seen order', () => {
    const input = [
      mk({ services: [{ name: 'A' }] }),
      mk({ services: [{ name: 'B' }] }),
      mk({ services: [{ name: 'A' }] }),
      mk({ services: [{}] }),
    ];
    expect(getServiceCounts(input)).toEqual({ labels: ['A', 'B'], data: [2, 1] });
  });

  it('counts per service line: a booking with 3 services adds 1 to each of them', () => {
    const input = [
      mk({ services: [{ name: 'A' }, { name: 'B' }, { name: 'C' }] }),
      mk({ services: [{ name: 'B' }] }),
    ];
    expect(getServiceCounts(input)).toEqual({ labels: ['A', 'B', 'C'], data: [1, 2, 1] });
  });

  it('returns empty arrays for no data', () => {
    expect(getServiceCounts([])).toEqual({ labels: [], data: [] });
  });
});

describe('getProfessionalName', () => {
  it('prefers professional, then legacy barber, then N/A', () => {
    expect(getProfessionalName({ professional: { name: 'P' }, barber: { name: 'B' } })).toBe('P');
    expect(getProfessionalName({ barber: { name: 'B' } })).toBe('B');
    expect(getProfessionalName({})).toBe('N/A');
  });
});

describe('filterByProfessional', () => {
  const list = [
    mk({ _id: 'a', professional: { name: 'Alex García' } }),
    mk({ _id: 'b', professional: { name: 'María López' } }),
    mk({ _id: 'c', professional: undefined, barber: { name: 'Alex García' } }),
    mk({ _id: 'd', professional: undefined }),
  ];

  it('keeps only the bookings of that professional, legacy `barber` records included', () => {
    expect(filterByProfessional(list, 'Alex García').map((b) => b._id)).toEqual(['a', 'c']);
  });

  it('treats an empty name as "no filter" and returns every booking', () => {
    expect(filterByProfessional(list, '')).toEqual(list);
    expect(filterByProfessional(undefined, '')).toEqual([]);
  });

  it('matches the exact name only', () => {
    expect(filterByProfessional(list, 'Alex')).toEqual([]);
  });
});

describe('getProfessionalNames', () => {
  it('lists each professional once, sorted, and skips bookings without one', () => {
    const names = getProfessionalNames([
      mk({ professional: { name: 'María López' } }),
      mk({ professional: { name: 'Alex García' } }),
      mk({ professional: { name: 'María López' } }),
      mk({ professional: undefined, barber: { name: 'Carlos' } }),
      mk({ professional: undefined }),
    ]);

    expect(names).toEqual(['Alex García', 'Carlos', 'María López']);
  });

  it('returns an empty list for no bookings', () => {
    expect(getProfessionalNames([])).toEqual([]);
    expect(getProfessionalNames(undefined)).toEqual([]);
  });
});
