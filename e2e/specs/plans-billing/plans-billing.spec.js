// SPEC 23: plans and billing. The owner sees the plans, contracts one, the fake gateway confirms the payment
// through a signed webhook, the limits of the plan apply, and canceling keeps the site alive until the period ends.
import { createHmac } from 'node:crypto';
import { test, expect } from '../../fixtures/test.js';
import { mongosh } from '../../support/mongo.js';
import { ADMIN_KEY, BACKEND_ORIGIN, FAKE_EMAIL_DOMAIN } from '../../support/env.js';

const KEY = { Authorization: `Bearer ${ADMIN_KEY}` };
const SECRET = 'e2e-payment-secret';
const SLUG = 'plan-e2e';
const PASSWORD = 'e2e-password-123';

const sign = (body) => createHmac('sha256', SECRET).update(body).digest('hex');

async function pay(request, event) {
  const body = JSON.stringify(event);
  return request.post(`${BACKEND_ORIGIN}/api/webhooks/payments`, {
    headers: { 'x-payment-signature': sign(body), 'Content-Type': 'application/json' },
    data: body,
  });
}

async function createBusiness(request) {
  const created = await request.post(`${BACKEND_ORIGIN}/api/signup`, {
    data: {
      businessName: '[TEST] Plan E2E', adminName: 'Ana', email: `plan@${FAKE_EMAIL_DOMAIN}`,
      password: PASSWORD, slug: SLUG,
    },
  });
  expect(created.status()).toBe(201);
  return created.json();
}

test.describe.configure({ mode: 'serial' });
test.describe('plans and billing, end to end', () => {
  test.beforeAll(async () => {
    const found = mongosh(`const t = db.tenants.findOne({ slug: '${SLUG}' }); print(t ? t._id.toHexString() : '')`);
    if (found) {
      for (const c of ['branding', 'business_settings', 'locations', 'professionals', 'services', 'bookings', 'admin_users', 'admin_sessions', 'subscriptions']) {
        mongosh(`db.${c}.deleteMany({ tenantId: ObjectId('${found}') })`);
      }
      mongosh(`db.tenants.deleteMany({ slug: '${SLUG}' })`);
    }
    mongosh('db.payment_events.deleteMany({})');
  });

  test.afterAll(async () => {
    const found = mongosh(`const t = db.tenants.findOne({ slug: '${SLUG}' }); print(t ? t._id.toHexString() : '')`);
    if (found) {
      for (const c of ['branding', 'business_settings', 'locations', 'professionals', 'services', 'bookings', 'admin_users', 'admin_sessions', 'subscriptions']) {
        mongosh(`db.${c}.deleteMany({ tenantId: ObjectId('${found}') })`);
      }
      mongosh(`db.tenants.deleteMany({ slug: '${SLUG}' })`);
    }
    mongosh('db.payment_events.deleteMany({})');
  });

  test('a webhook without a valid signature is rejected and changes nothing', async ({ request }) => {
    const body = JSON.stringify({ id: 'evt-fake-1', type: 'payment.succeeded', tenantSlug: SLUG, planId: 'pro' });
    const unsigned = await request.post(`${BACKEND_ORIGIN}/api/webhooks/payments`, {
      headers: { 'Content-Type': 'application/json' }, data: body,
    });
    expect(unsigned.status()).toBeGreaterThanOrEqual(400);

    const wrong = await request.post(`${BACKEND_ORIGIN}/api/webhooks/payments`, {
      headers: { 'x-payment-signature': 'deadbeef', 'Content-Type': 'application/json' }, data: body,
    });
    expect(wrong.status()).toBeGreaterThanOrEqual(400);
    expect(mongosh('print(db.payment_events.countDocuments({}))')).toBe('0');
  });

  test('the owner sees the plans, contracts one and the signed webhook activates it', async ({ request }) => {
    await createBusiness(request);
    // The account session of the new business (the signup set the cookie in this browser context).
    const as = { 'X-Tenant': SLUG };

    const before = JSON.parse(await (await request.get(`${BACKEND_ORIGIN}/api/admin/subscription`, { headers: { ...KEY, ...as } })).text());
    expect(before.plans.map((plan) => plan.id)).toEqual(['gratis', 'pro', 'negocio']);
    expect(before.subscription).toBeNull();

    const checkout = await request.post(`${BACKEND_ORIGIN}/api/admin/subscription/checkout`, {
      headers: { ...KEY, ...as }, data: { planId: 'pro' },
    });
    expect(checkout.status()).toBe(200);
    const checkoutBody = JSON.parse(await checkout.text());
    expect(checkoutBody.checkoutUrl).toContain('payment=fake_pay_');

    const paid = await pay(request, {
      id: 'evt-e2e-1', type: 'payment.succeeded', tenantSlug: SLUG, planId: 'pro',
      externalPaymentId: 'fake_pay_plan-e2e_pro', currentPeriodEnd: '2030-06-01T00:00:00.000Z',
    });
    expect(paid.status()).toBe(200);

    const after = JSON.parse(await (await request.get(`${BACKEND_ORIGIN}/api/admin/subscription`, { headers: { ...KEY, ...as } })).text());
    expect(after.subscription.planId).toBe('pro');
    expect(after.subscription.status).toBe('active');
    expect(after.subscription.limits.professionals).toBe(3);

    // The same event twice changes nothing.
    await pay(request, {
      id: 'evt-e2e-1', type: 'payment.succeeded', tenantSlug: SLUG, planId: 'negocio',
      externalPaymentId: 'fake_pay_plan-e2e_pro', currentPeriodEnd: '2030-06-01T00:00:00.000Z',
    });
    const again = JSON.parse(await (await request.get(`${BACKEND_ORIGIN}/api/admin/subscription`, { headers: { ...KEY, ...as } })).text());
    expect(again.subscription.planId).toBe('pro');
  });

  test('the limits of the plan are enforced and reading never is', async ({ request }) => {
    const as = { 'X-Tenant': SLUG };
    // The plan "pro" allows 3 professionals.
    for (const name of ['Pro A', 'Pro B', 'Pro C']) {
      const created = await request.post(`${BACKEND_ORIGIN}/api/admin/professionals`, {
        headers: { ...KEY, ...as }, data: { name, specialty: 'Barber', experience: '3 años' },
      });
      expect(created.status()).toBe(201);
    }
    const fourth = await request.post(`${BACKEND_ORIGIN}/api/admin/professionals`, {
      headers: { ...KEY, ...as }, data: { name: 'Pro D', specialty: 'Barber', experience: '3 años' },
    });
    expect(fourth.status()).toBe(403);
    expect((await fourth.text()).length).toBeGreaterThan(0);

    // Reading keeps working.
    expect((await request.get(`${BACKEND_ORIGIN}/api/catalog`, { headers: as })).status()).toBe(200);
    expect((await request.get(`${BACKEND_ORIGIN}/api/admin/catalog`, { headers: { ...KEY, ...as } })).status()).toBe(200);
  });

  test('canceling keeps the site alive until the period ends', async ({ request }) => {
    const as = { 'X-Tenant': SLUG };
    const canceled = await request.post(`${BACKEND_ORIGIN}/api/admin/subscription/cancel`, {
      headers: { ...KEY, ...as },
    });
    const canceledBody = JSON.parse(await canceled.text());
    expect(canceled.status()).toBe(200);
    expect(canceledBody.subscription.cancelAtPeriodEnd).toBe(true);
    expect(canceledBody.subscription.status).toBe('active');

    // The site still works.
    expect((await request.get(`${BACKEND_ORIGIN}/api/catalog`, { headers: as })).status()).toBe(200);

    const resumed = await request.post(`${BACKEND_ORIGIN}/api/admin/subscription/resume`, {
      headers: { ...KEY, ...as },
    });
    expect(JSON.parse(await resumed.text()).subscription.cancelAtPeriodEnd).toBe(false);
  });

  test('an overdue payment warns but does not block the business', async ({ request }) => {
    const as = { 'X-Tenant': SLUG };
    await pay(request, {
      id: 'evt-e2e-2', type: 'payment.failed', tenantSlug: SLUG, planId: 'pro',
      externalPaymentId: 'fake_pay_plan-e2e_pro', currentPeriodEnd: '2030-06-01T00:00:00.000Z',
    });
    const state = JSON.parse(await (await request.get(`${BACKEND_ORIGIN}/api/admin/subscription`, { headers: { ...KEY, ...as } })).text());
    expect(state.subscription.status).toBe('past_due');
    expect((await request.get(`${BACKEND_ORIGIN}/api/catalog`, { headers: as })).status()).toBe(200);
  });
});
