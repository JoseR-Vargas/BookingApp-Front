import { describe, expect, it } from 'vitest';
import { describeResponseSchema } from '../../test/schemaCases.js';
import { brandingSchema } from './branding.schema.js';

const BRANDING = {
  businessName: 'Barbería Don Pepe',
  colors: { accent: '#c9a96e', background: '#0d0d0d', text: '#f5f0e8', button: null },
  logoUrl: '/api/branding/logo?v=1763300000000',
};

describeResponseSchema('brandingSchema (GET /api/branding)', brandingSchema, BRANDING, [
  'businessName',
  'colors',
  'colors.accent',
  'colors.background',
  'colors.text',
  'colors.button',
  'logoUrl',
]);

describe('brandingSchema nullable fields', () => {
  it('accepts the unbranded answer (null name and logo, no custom button)', () => {
    const unbranded = { businessName: null, colors: { ...BRANDING.colors, button: '#295294' }, logoUrl: null };
    expect(brandingSchema.safeParse(unbranded).success).toBe(true);
  });
});
