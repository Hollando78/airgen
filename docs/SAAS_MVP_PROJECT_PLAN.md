# AIRGen SaaS MVP Project Plan

**Version:** 1.0
**Date:** 2025-10-23
**Owner:** Engineering Team
**Target Completion:** 6 weeks from start
**Status:** Ready to Execute

## Executive Summary

This project plan outlines the implementation of core SaaS billing features for AIRGen to enable paid subscriptions and monetization. The goal is to launch with a freemium model (Free, Pro, Enterprise tiers) integrated with Stripe payment processing.

**Current State:** AIRGen has authentication, multi-tenancy, and production deployment at airgen.studio. ~60% of SaaS infrastructure exists.

**Target State:** Fully functional SaaS platform with Stripe billing, plan enforcement, and self-service upgrade flows.

**Timeline:** 6 weeks (4 weeks implementation + 2 weeks testing/polish)

**Risk Level:** Medium - Stripe integration is well-documented but webhooks require careful testing.

---

## Table of Contents

1. [Project Scope](#project-scope)
2. [Timeline & Milestones](#timeline--milestones)
3. [Phase 1: Stripe Integration](#phase-1-stripe-integration)
4. [Phase 2: Plan Enforcement](#phase-2-plan-enforcement)
5. [Phase 3: UI & User Experience](#phase-3-ui--user-experience)
6. [Phase 4: Email & Notifications](#phase-4-email--notifications)
7. [Phase 5: Testing & Launch Prep](#phase-5-testing--launch-prep)
8. [Phase 6: Launch & Monitor](#phase-6-launch--monitor)
9. [Success Metrics](#success-metrics)
10. [Risk Mitigation](#risk-mitigation)
11. [Post-Launch Roadmap](#post-launch-roadmap)

---

## Project Scope

### In Scope

✅ Stripe Checkout integration for subscriptions
✅ Plan enforcement (Free, Pro, Enterprise tiers)
✅ Usage limits and tracking
✅ Pricing page and billing UI
✅ Email notifications for billing events
✅ Basic admin dashboard
✅ Legal pages (Terms, Privacy, Refund Policy)
✅ Webhook handling for subscription lifecycle
✅ Customer Portal integration

### Out of Scope (Post-MVP)

❌ Annual billing (monthly only for MVP)
❌ Usage-based metering (flat pricing only)
❌ Multi-currency support (USD only)
❌ Tax calculation (defer to Stripe Tax later)
❌ Complex team seat management
❌ Proration handling (Stripe handles automatically)
❌ Affiliate/referral program
❌ Free trial with credit card requirement

### Success Criteria

- [ ] User can sign up for free tier without payment
- [ ] User can upgrade to Pro tier via Stripe Checkout
- [ ] Subscription status is enforced across all features
- [ ] Webhooks reliably update subscription state
- [ ] Billing emails are sent for all critical events
- [ ] Users can manage billing via Stripe Customer Portal
- [ ] Zero payment-related bugs in testing
- [ ] Legal pages published and linked

---

## Timeline & Milestones

### Overview (6 Weeks)

```
Week 1-2: Stripe Integration (Backend)
Week 3:   Plan Enforcement & Limits
Week 4:   UI & Pricing Page (Frontend)
Week 5:   Email Notifications & Legal
Week 6:   Testing, Beta, Launch
```

### Detailed Milestones

| Milestone | Target Date | Deliverables |
|-----------|-------------|--------------|
| **M1: Stripe Connected** | End of Week 2 | Checkout working, webhooks handling events |
| **M2: Plans Enforced** | End of Week 3 | Feature limits enforced, upgrade prompts shown |
| **M3: UI Complete** | End of Week 4 | Pricing page live, billing settings functional |
| **M4: Emails Sending** | End of Week 5 | All billing emails tested and sent |
| **M5: Beta Launch** | Week 5, Day 5 | 5-10 beta testers on paid plans |
| **M6: Public Launch** | End of Week 6 | Payments live for all users |

---

## Phase 1: Stripe Integration

**Duration:** 2 weeks
**Priority:** Critical
**Owner:** Backend Engineer

### Objectives

- Integrate Stripe for subscription payments
- Handle subscription lifecycle via webhooks
- Store subscription data in database

### Tasks

#### Week 1: Setup & Basic Integration

**Day 1-2: Stripe Account & Configuration**
- [ ] Create Stripe account (or use existing)
- [ ] Get API keys (test and live)
- [ ] Install Stripe SDK: `pnpm add stripe`
- [ ] Add environment variables to `.env`:
  ```bash
  STRIPE_SECRET_KEY=sk_test_...
  STRIPE_PUBLISHABLE_KEY=pk_test_...
  STRIPE_WEBHOOK_SECRET=whsec_...
  ```
- [ ] Create Stripe service wrapper: `backend/src/services/stripe.ts`

**Code Template:**
```typescript
// backend/src/services/stripe.ts
import Stripe from 'stripe';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-10-28',
  typescript: true,
});

export const STRIPE_CONFIG = {
  plans: {
    pro: {
      priceId: process.env.STRIPE_PRO_PRICE_ID!,
      name: 'Professional',
      amount: 7500, // $75.00
    },
  },
};
```

**Day 3-4: Product & Price Setup in Stripe**
- [ ] Create products in Stripe Dashboard:
  - Product: "AIRGen Professional"
  - Price: $75/user/month, recurring
- [ ] Copy price IDs to environment config
- [ ] Document pricing structure in project wiki

**Day 5: Checkout Session Endpoint**
- [ ] Create `backend/src/routes/billing.ts`
- [ ] Implement `POST /api/billing/create-checkout-session`
- [ ] Test checkout redirect flow

**Code Template:**
```typescript
// backend/src/routes/billing.ts
import { FastifyInstance } from 'fastify';
import { stripe, STRIPE_CONFIG } from '../services/stripe';

export async function billingRoutes(app: FastifyInstance) {
  // Create checkout session
  app.post('/billing/create-checkout-session', {
    onRequest: [app.authenticate], // Require auth
  }, async (req, reply) => {
    const { priceId, tenantId } = req.body as { priceId: string; tenantId: string };

    // Validate user owns tenant
    if (req.user.tenantId !== tenantId) {
      return reply.status(403).send({ error: 'Unauthorized' });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_email: req.user.email,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${process.env.APP_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.APP_URL}/pricing`,
      metadata: {
        tenantId,
        userId: req.user.id,
      },
    });

    return { url: session.url };
  });

  // Customer portal
  app.post('/billing/create-portal-session', {
    onRequest: [app.authenticate],
  }, async (req, reply) => {
    const tenant = await getTenant(req.user.tenantId);

    if (!tenant.stripeCustomerId) {
      return reply.status(400).send({ error: 'No subscription found' });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: tenant.stripeCustomerId,
      return_url: `${process.env.APP_URL}/settings/billing`,
    });

    return { url: session.url };
  });
}
```

#### Week 2: Webhook Handling & Data Persistence

**Day 1-2: Database Schema Updates**
- [ ] Add subscription fields to Tenant model in Neo4j:
  ```cypher
  // Add properties to Tenant nodes
  stripeCustomerId: String
  stripeSubscriptionId: String
  subscriptionTier: String (free|pro|enterprise)
  subscriptionStatus: String (active|cancelled|past_due|trialing)
  currentPeriodEnd: DateTime
  ```
- [ ] Create migration script to add fields to existing tenants
- [ ] Test schema changes in development

**Day 3-5: Webhook Endpoint**
- [ ] Create `backend/src/routes/webhooks.ts`
- [ ] Implement webhook signature verification
- [ ] Handle key subscription events:
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.payment_succeeded`
  - `invoice.payment_failed`

**Code Template:**
```typescript
// backend/src/routes/webhooks.ts
import { FastifyInstance } from 'fastify';
import { stripe } from '../services/stripe';

export async function webhookRoutes(app: FastifyInstance) {
  app.post('/webhooks/stripe', {
    config: {
      rawBody: true, // Need raw body for signature verification
    },
  }, async (req, reply) => {
    const sig = req.headers['stripe-signature'] as string;

    let event;
    try {
      event = stripe.webhooks.constructEvent(
        req.rawBody!,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET!
      );
    } catch (err) {
      app.log.error({ err }, 'Webhook signature verification failed');
      return reply.status(400).send({ error: 'Invalid signature' });
    }

    app.log.info({ type: event.type, id: event.id }, 'Processing webhook event');

    try {
      switch (event.type) {
        case 'checkout.session.completed':
          await handleCheckoutCompleted(event.data.object);
          break;

        case 'customer.subscription.updated':
          await handleSubscriptionUpdated(event.data.object);
          break;

        case 'customer.subscription.deleted':
          await handleSubscriptionDeleted(event.data.object);
          break;

        case 'invoice.payment_failed':
          await handlePaymentFailed(event.data.object);
          break;

        default:
          app.log.info({ type: event.type }, 'Unhandled webhook event type');
      }
    } catch (err) {
      app.log.error({ err, event }, 'Error processing webhook');
      return reply.status(500).send({ error: 'Webhook processing failed' });
    }

    return reply.send({ received: true });
  });
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const { tenantId } = session.metadata!;

  // Get subscription details
  const subscription = await stripe.subscriptions.retrieve(
    session.subscription as string
  );

  // Update tenant in database
  await updateTenantSubscription(tenantId, {
    stripeCustomerId: session.customer as string,
    stripeSubscriptionId: subscription.id,
    subscriptionTier: 'pro',
    subscriptionStatus: subscription.status,
    currentPeriodEnd: new Date(subscription.current_period_end * 1000),
  });
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  // Find tenant by stripeCustomerId
  const tenant = await findTenantByStripeCustomerId(subscription.customer as string);

  if (!tenant) {
    throw new Error(`Tenant not found for customer ${subscription.customer}`);
  }

  await updateTenantSubscription(tenant.id, {
    subscriptionStatus: subscription.status,
    currentPeriodEnd: new Date(subscription.current_period_end * 1000),
  });
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const tenant = await findTenantByStripeCustomerId(subscription.customer as string);

  if (!tenant) return;

  // Downgrade to free tier
  await updateTenantSubscription(tenant.id, {
    subscriptionTier: 'free',
    subscriptionStatus: 'cancelled',
    stripeSubscriptionId: null,
  });
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const tenant = await findTenantByStripeCustomerId(invoice.customer as string);

  if (!tenant) return;

  // Mark as past_due, send notification
  await updateTenantSubscription(tenant.id, {
    subscriptionStatus: 'past_due',
  });

  // TODO: Send email notification
}
```

**Day 6-7: Testing & Refinement**
- [ ] Test webhook locally with Stripe CLI: `stripe listen --forward-to localhost:8787/webhooks/stripe`
- [ ] Test checkout flow end-to-end
- [ ] Verify database updates correctly
- [ ] Test error scenarios (payment failure, cancellation)
- [ ] Document webhook retry behavior

### Deliverables

- [x] Stripe SDK integrated
- [x] Checkout session creation endpoint
- [x] Webhook handler with all key events
- [x] Database schema updated with subscription fields
- [x] Local testing completed
- [x] Documentation updated

### Testing Checklist

- [ ] User can initiate checkout
- [ ] Checkout redirects to Stripe hosted page
- [ ] Payment success triggers webhook
- [ ] Tenant record updates with subscription data
- [ ] Cancellation webhook downgrades tenant
- [ ] Payment failure webhook marks account past_due
- [ ] Customer portal link works

---

## Phase 2: Plan Enforcement

**Duration:** 1 week
**Priority:** Critical
**Owner:** Backend Engineer

### Objectives

- Define plan limits (Free, Pro, Enterprise)
- Enforce limits across all features
- Implement graceful degradation for expired accounts

### Tasks

#### Day 1-2: Plan Configuration

**Define Plan Limits**
- [ ] Create `backend/src/config/plans.ts`
- [ ] Document what each tier includes

**Code Template:**
```typescript
// backend/src/config/plans.ts
export type SubscriptionTier = 'free' | 'pro' | 'enterprise';

export interface PlanLimits {
  projects: number;
  users: number;
  requirements: number;
  aiDraftsPerMonth: number;
  storage: number; // MB
  features: {
    versionHistory: boolean;
    baselines: boolean;
    traceLinks: boolean;
    architectureDiagrams: boolean;
    sso: boolean;
    prioritySupport: boolean;
    selfHosting: boolean;
  };
}

export const PLAN_LIMITS: Record<SubscriptionTier, PlanLimits> = {
  free: {
    projects: 1,
    users: 2,
    requirements: 50,
    aiDraftsPerMonth: 10,
    storage: 100, // 100 MB
    features: {
      versionHistory: false,
      baselines: false,
      traceLinks: true,
      architectureDiagrams: false,
      sso: false,
      prioritySupport: false,
      selfHosting: false,
    },
  },
  pro: {
    projects: Infinity,
    users: 20,
    requirements: Infinity,
    aiDraftsPerMonth: 500,
    storage: 10000, // 10 GB
    features: {
      versionHistory: true,
      baselines: true,
      traceLinks: true,
      architectureDiagrams: true,
      sso: false,
      prioritySupport: true,
      selfHosting: false,
    },
  },
  enterprise: {
    projects: Infinity,
    users: Infinity,
    requirements: Infinity,
    aiDraftsPerMonth: Infinity,
    storage: Infinity,
    features: {
      versionHistory: true,
      baselines: true,
      traceLinks: true,
      architectureDiagrams: true,
      sso: true,
      prioritySupport: true,
      selfHosting: true,
    },
  },
};

export function getPlanLimits(tier: SubscriptionTier): PlanLimits {
  return PLAN_LIMITS[tier];
}
```

#### Day 3-4: Usage Tracking

**Implement Usage Service**
- [ ] Create `backend/src/services/usage.ts`
- [ ] Implement counters for each resource type
- [ ] Add Redis caching for performance

**Code Template:**
```typescript
// backend/src/services/usage.ts
import { getPlanLimits } from '../config/plans';

export async function getCurrentUsage(tenantId: string) {
  // Check cache first
  const cached = await redis.get(`usage:${tenantId}`);
  if (cached) return JSON.parse(cached);

  // Query database
  const [projects, users, requirements] = await Promise.all([
    countProjects(tenantId),
    countUsers(tenantId),
    countRequirements(tenantId),
  ]);

  const usage = { projects, users, requirements };

  // Cache for 5 minutes
  await redis.setex(`usage:${tenantId}`, 300, JSON.stringify(usage));

  return usage;
}

export async function checkLimit(
  tenantId: string,
  resource: keyof Pick<PlanLimits, 'projects' | 'users' | 'requirements'>
): Promise<{ allowed: boolean; current: number; limit: number }> {
  const tenant = await getTenant(tenantId);
  const limits = getPlanLimits(tenant.subscriptionTier);
  const usage = await getCurrentUsage(tenantId);

  const limit = limits[resource];
  const current = usage[resource];

  return {
    allowed: current < limit,
    current,
    limit,
  };
}

export async function incrementAiDraftCount(tenantId: string): Promise<void> {
  const key = `ai_drafts:${tenantId}:${getCurrentMonth()}`;
  await redis.incr(key);
  await redis.expire(key, 60 * 60 * 24 * 31); // Expire after 31 days
}

export async function getAiDraftCount(tenantId: string): Promise<number> {
  const key = `ai_drafts:${tenantId}:${getCurrentMonth()}`;
  const count = await redis.get(key);
  return count ? parseInt(count, 10) : 0;
}

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
```

#### Day 5-7: Enforcement Middleware

**Create Enforcement Middleware**
- [ ] Create `backend/src/middleware/checkLimits.ts`
- [ ] Add middleware to protected routes
- [ ] Implement graceful error responses

**Code Template:**
```typescript
// backend/src/middleware/checkLimits.ts
import { FastifyRequest, FastifyReply } from 'fastify';
import { checkLimit, getCurrentUsage, getPlanLimits } from '../services/usage';

export async function requirePaidPlan(req: FastifyRequest, reply: FastifyReply) {
  const tenant = await getTenant(req.user.tenantId);

  if (tenant.subscriptionTier === 'free') {
    return reply.status(402).send({
      error: 'UPGRADE_REQUIRED',
      message: 'This feature requires a paid plan',
      upgradeUrl: '/pricing',
    });
  }

  if (tenant.subscriptionStatus !== 'active') {
    return reply.status(403).send({
      error: 'SUBSCRIPTION_INACTIVE',
      message: 'Your subscription is inactive. Please update your payment method.',
      billingUrl: '/settings/billing',
    });
  }
}

export function checkResourceLimit(resource: 'projects' | 'users' | 'requirements') {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const check = await checkLimit(req.user.tenantId, resource);

    if (!check.allowed) {
      return reply.status(402).send({
        error: 'LIMIT_REACHED',
        message: `You've reached your ${resource} limit (${check.limit})`,
        current: check.current,
        limit: check.limit,
        upgradeUrl: '/pricing',
      });
    }
  };
}

export async function checkFeatureAccess(feature: string) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const tenant = await getTenant(req.user.tenantId);
    const limits = getPlanLimits(tenant.subscriptionTier);

    if (!limits.features[feature]) {
      return reply.status(402).send({
        error: 'FEATURE_NOT_AVAILABLE',
        message: `This feature is not available on your current plan`,
        upgradeUrl: '/pricing',
      });
    }
  };
}
```

**Apply Middleware to Routes**
```typescript
// Example: Protect project creation
app.post('/tenants/:tenant/projects', {
  onRequest: [
    app.authenticate,
    checkResourceLimit('projects'),
  ],
}, async (req, reply) => {
  // Create project...
});

// Example: Protect baseline creation
app.post('/baseline', {
  onRequest: [
    app.authenticate,
    checkFeatureAccess('baselines'),
  ],
}, async (req, reply) => {
  // Create baseline...
});

// Example: AI drafts with monthly limit
app.post('/draft', {
  onRequest: [app.authenticate],
}, async (req, reply) => {
  if (req.body.useLlm) {
    const tenant = await getTenant(req.user.tenantId);
    const limits = getPlanLimits(tenant.subscriptionTier);
    const currentCount = await getAiDraftCount(tenant.id);

    if (currentCount >= limits.aiDraftsPerMonth) {
      return reply.status(402).send({
        error: 'AI_DRAFT_LIMIT_REACHED',
        message: `You've used all ${limits.aiDraftsPerMonth} AI drafts this month`,
        upgradeUrl: '/pricing',
      });
    }

    await incrementAiDraftCount(tenant.id);
  }

  // Generate draft...
});
```

### Deliverables

- [x] Plan limits defined in configuration
- [x] Usage tracking service implemented
- [x] Enforcement middleware created
- [x] All protected routes updated with middleware
- [x] Error responses standardized
- [x] Grace period logic for expired subscriptions

### Testing Checklist

- [ ] Free tier user hits project limit, sees upgrade prompt
- [ ] Pro tier user can create unlimited projects
- [ ] AI draft counter increments correctly
- [ ] Monthly AI draft limits reset on new month
- [ ] Expired subscription enters read-only mode
- [ ] Feature access properly enforced (baselines, SSO, etc.)

---

## Phase 3: UI & User Experience

**Duration:** 1 week
**Priority:** Critical
**Owner:** Frontend Engineer

### Objectives

- Create public pricing page
- Build billing settings page
- Add upgrade prompts throughout app
- Implement Stripe Checkout integration

### Tasks

#### Day 1-3: Pricing Page

**Create Pricing Route**
- [ ] Create `frontend/src/routes/PricingRoute.tsx`
- [ ] Design responsive 3-tier pricing layout
- [ ] Add feature comparison table
- [ ] Implement FAQ section

**Code Template:**
```tsx
// frontend/src/routes/PricingRoute.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const PLANS = [
  {
    name: 'Free',
    price: 0,
    period: 'forever',
    description: 'Perfect for trying AIRGen',
    features: [
      '1 project',
      '2 users',
      '50 requirements',
      '10 AI drafts/month',
      'Community support',
    ],
    cta: 'Start Free',
    highlighted: false,
  },
  {
    name: 'Professional',
    price: 75,
    period: 'per user/month',
    description: 'For engineering teams',
    features: [
      'Unlimited projects',
      'Up to 20 users',
      'Unlimited requirements',
      '500 AI drafts/month',
      'Version history & baselines',
      'Traceability & linking',
      'Architecture diagrams',
      'Email support',
    ],
    cta: 'Start 14-day Trial',
    highlighted: true,
    priceId: 'price_xxx', // From Stripe
  },
  {
    name: 'Enterprise',
    price: null,
    period: 'custom',
    description: 'For large organizations',
    features: [
      'Everything in Pro',
      'Unlimited users',
      'SSO/SAML',
      'Self-hosting option',
      'Priority support & SLA',
      'Custom integrations',
      'Compliance features',
      'Dedicated account manager',
    ],
    cta: 'Contact Sales',
    highlighted: false,
  },
];

export function PricingRoute() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState<string | null>(null);

  const handleSelectPlan = async (plan: typeof PLANS[0]) => {
    if (plan.name === 'Free') {
      navigate('/signup');
      return;
    }

    if (plan.name === 'Enterprise') {
      window.location.href = 'mailto:sales@airgen.studio?subject=Enterprise Inquiry';
      return;
    }

    // Initiate Stripe Checkout
    setLoading(plan.name);
    try {
      const res = await fetch('/api/billing/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          priceId: plan.priceId,
          tenantId: 'current-tenant-id', // Get from auth context
        }),
      });

      const { url } = await res.json();
      window.location.href = url;
    } catch (err) {
      console.error('Checkout error:', err);
      alert('Failed to start checkout. Please try again.');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="pricing-page">
      <div className="pricing-header">
        <h1>Choose Your Plan</h1>
        <p>Start with a free account. Upgrade anytime.</p>
      </div>

      <div className="pricing-grid">
        {PLANS.map((plan) => (
          <div
            key={plan.name}
            className={`pricing-card ${plan.highlighted ? 'highlighted' : ''}`}
          >
            <div className="plan-header">
              <h3>{plan.name}</h3>
              <div className="plan-price">
                {plan.price === null ? (
                  <span className="price-custom">Custom</span>
                ) : (
                  <>
                    <span className="price-amount">${plan.price}</span>
                    <span className="price-period">/{plan.period}</span>
                  </>
                )}
              </div>
              <p className="plan-description">{plan.description}</p>
            </div>

            <ul className="plan-features">
              {plan.features.map((feature, i) => (
                <li key={i}>
                  <CheckIcon /> {feature}
                </li>
              ))}
            </ul>

            <button
              className={`plan-cta ${plan.highlighted ? 'primary' : 'secondary'}`}
              onClick={() => handleSelectPlan(plan)}
              disabled={loading === plan.name}
            >
              {loading === plan.name ? 'Loading...' : plan.cta}
            </button>
          </div>
        ))}
      </div>

      <PricingFAQ />
    </div>
  );
}

function PricingFAQ() {
  return (
    <div className="pricing-faq">
      <h2>Frequently Asked Questions</h2>

      <div className="faq-item">
        <h4>Can I change plans later?</h4>
        <p>Yes! You can upgrade or downgrade anytime from your billing settings.</p>
      </div>

      <div className="faq-item">
        <h4>What happens if I exceed my limits?</h4>
        <p>You'll see a prompt to upgrade. Your data is safe and accessible in read-only mode.</p>
      </div>

      <div className="faq-item">
        <h4>Do you offer refunds?</h4>
        <p>Yes, we offer a 30-day money-back guarantee on all paid plans.</p>
      </div>

      <div className="faq-item">
        <h4>Is my data secure?</h4>
        <p>Absolutely. We use bank-level encryption and are SOC 2 compliant.</p>
      </div>
    </div>
  );
}
```

**Styling**
- [ ] Create `frontend/src/routes/PricingRoute.css`
- [ ] Implement responsive design (mobile, tablet, desktop)
- [ ] Add hover states and animations
- [ ] Highlight recommended plan

#### Day 4-5: Billing Settings Page

**Create Billing Route**
- [ ] Create `frontend/src/routes/BillingRoute.tsx`
- [ ] Show current subscription status
- [ ] Display usage vs. limits
- [ ] Add "Manage Billing" button (Stripe Portal)
- [ ] Add "Upgrade Plan" button

**Code Template:**
```tsx
// frontend/src/routes/BillingRoute.tsx
import { useEffect, useState } from 'react';
import { useTenant } from '../contexts/TenantContext';

interface SubscriptionInfo {
  tier: 'free' | 'pro' | 'enterprise';
  status: 'active' | 'cancelled' | 'past_due' | 'trialing';
  currentPeriodEnd?: string;
  usage: {
    projects: { current: number; limit: number };
    users: { current: number; limit: number };
    requirements: { current: number; limit: number };
    aiDrafts: { current: number; limit: number };
  };
}

export function BillingRoute() {
  const { currentTenant } = useTenant();
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSubscriptionInfo();
  }, []);

  const fetchSubscriptionInfo = async () => {
    try {
      const res = await fetch('/api/billing/subscription');
      const data = await res.json();
      setSubscription(data);
    } catch (err) {
      console.error('Failed to fetch subscription:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleManageBilling = async () => {
    try {
      const res = await fetch('/api/billing/create-portal-session', {
        method: 'POST',
      });
      const { url } = await res.json();
      window.location.href = url;
    } catch (err) {
      console.error('Failed to open billing portal:', err);
    }
  };

  if (loading) return <div>Loading...</div>;
  if (!subscription) return <div>Failed to load subscription</div>;

  return (
    <div className="billing-page">
      <h1>Billing & Subscription</h1>

      <div className="subscription-card">
        <div className="subscription-header">
          <div>
            <h3>Current Plan: {subscription.tier}</h3>
            <span className={`status-badge status-${subscription.status}`}>
              {subscription.status}
            </span>
          </div>

          {subscription.tier !== 'free' && subscription.currentPeriodEnd && (
            <p className="next-billing">
              Next billing: {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
            </p>
          )}
        </div>

        <div className="usage-section">
          <h4>Current Usage</h4>

          <UsageBar
            label="Projects"
            current={subscription.usage.projects.current}
            limit={subscription.usage.projects.limit}
          />

          <UsageBar
            label="Users"
            current={subscription.usage.users.current}
            limit={subscription.usage.users.limit}
          />

          <UsageBar
            label="Requirements"
            current={subscription.usage.requirements.current}
            limit={subscription.usage.requirements.limit}
          />

          <UsageBar
            label="AI Drafts (this month)"
            current={subscription.usage.aiDrafts.current}
            limit={subscription.usage.aiDrafts.limit}
          />
        </div>

        <div className="billing-actions">
          {subscription.tier === 'free' ? (
            <a href="/pricing" className="btn btn-primary">
              Upgrade Plan
            </a>
          ) : (
            <button onClick={handleManageBilling} className="btn btn-secondary">
              Manage Billing
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function UsageBar({ label, current, limit }: { label: string; current: number; limit: number }) {
  const isUnlimited = limit === Infinity;
  const percentage = isUnlimited ? 0 : Math.min((current / limit) * 100, 100);
  const isNearLimit = percentage > 80;

  return (
    <div className="usage-bar">
      <div className="usage-label">
        <span>{label}</span>
        <span className={isNearLimit ? 'text-warning' : ''}>
          {current} / {isUnlimited ? '∞' : limit}
        </span>
      </div>
      {!isUnlimited && (
        <div className="progress-bar">
          <div
            className={`progress-fill ${isNearLimit ? 'near-limit' : ''}`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      )}
    </div>
  );
}
```

#### Day 6-7: Upgrade Prompts

**Create Upgrade Prompt Component**
- [ ] Create `frontend/src/components/UpgradePrompt.tsx`
- [ ] Add inline prompts when hitting limits
- [ ] Add banner for expired subscriptions
- [ ] Add tooltips on locked features

**Code Template:**
```tsx
// frontend/src/components/UpgradePrompt.tsx
import { XIcon } from 'lucide-react';

interface UpgradePromptProps {
  reason: 'limit_reached' | 'feature_locked' | 'subscription_expired';
  resource?: string;
  current?: number;
  limit?: number;
  onDismiss?: () => void;
}

export function UpgradePrompt({ reason, resource, current, limit, onDismiss }: UpgradePromptProps) {
  const messages = {
    limit_reached: `You've reached your ${resource} limit (${limit}). Upgrade to add more.`,
    feature_locked: 'This feature is available on paid plans.',
    subscription_expired: 'Your subscription has expired. Please update your payment method.',
  };

  return (
    <div className={`upgrade-prompt upgrade-prompt-${reason}`}>
      <div className="upgrade-content">
        <p>{messages[reason]}</p>
        <a href="/pricing" className="btn btn-primary btn-sm">
          {reason === 'subscription_expired' ? 'Update Payment' : 'Upgrade Now'}
        </a>
      </div>
      {onDismiss && (
        <button onClick={onDismiss} className="dismiss-btn">
          <XIcon size={16} />
        </button>
      )}
    </div>
  );
}

// Usage in components
export function ProjectList() {
  const { projects, canCreateProject } = useProjects();

  return (
    <div>
      <div className="list-header">
        <h2>Projects</h2>
        <button
          onClick={handleCreateProject}
          disabled={!canCreateProject}
        >
          Create Project
        </button>
      </div>

      {!canCreateProject && (
        <UpgradePrompt
          reason="limit_reached"
          resource="projects"
          current={projects.length}
          limit={1}
        />
      )}

      {/* Project list... */}
    </div>
  );
}
```

### Deliverables

- [x] Pricing page with 3 tiers
- [x] Billing settings page
- [x] Stripe Checkout integration
- [x] Stripe Customer Portal integration
- [x] Upgrade prompts component
- [x] Responsive design
- [x] Usage visualization

### Testing Checklist

- [ ] Pricing page renders correctly on mobile/desktop
- [ ] Clicking "Start Trial" redirects to Stripe Checkout
- [ ] Billing page shows accurate subscription status
- [ ] Usage bars display correctly
- [ ] "Manage Billing" opens Stripe Customer Portal
- [ ] Upgrade prompts appear when hitting limits
- [ ] All links and buttons work

---

## Phase 4: Email & Notifications

**Duration:** 1 week
**Priority:** High
**Owner:** Backend Engineer

### Objectives

- Set up email service (Resend)
- Create email templates for billing events
- Implement notification triggers

### Tasks

#### Day 1-2: Email Service Setup

**Choose and Configure Email Provider**
- [ ] Create Resend account (or SendGrid/Postmark)
- [ ] Verify domain for sending
- [ ] Get API key
- [ ] Install SDK: `pnpm add resend`
- [ ] Add to environment: `RESEND_API_KEY=re_xxx`

**Create Email Service**
- [ ] Create `backend/src/services/email.ts`
- [ ] Implement email templates
- [ ] Add logging and error handling

**Code Template:**
```typescript
// backend/src/services/email.ts
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY!);

const FROM_EMAIL = 'AIRGen <billing@airgen.studio>';

export async function sendPaymentSuccessEmail(user: User, amount: number) {
  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: user.email,
      subject: 'Payment Received - Thank You!',
      html: `
        <h2>Payment Successful</h2>
        <p>Hi ${user.name},</p>
        <p>Your payment of $${(amount / 100).toFixed(2)} was processed successfully.</p>
        <p>Your Professional plan is now active and ready to use.</p>
        <p><a href="${process.env.APP_URL}/settings/billing">View billing details</a></p>
        <p>Thank you for choosing AIRGen!</p>
        <p>—The AIRGen Team</p>
      `,
    });
  } catch (err) {
    console.error('Failed to send payment success email:', err);
    // Don't throw - email failure shouldn't break payment flow
  }
}

export async function sendPaymentFailedEmail(user: User, invoiceUrl: string) {
  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: user.email,
      subject: 'Payment Failed - Action Required',
      html: `
        <h2>Payment Failed</h2>
        <p>Hi ${user.name},</p>
        <p>We were unable to process your payment for AIRGen Professional.</p>
        <p>Please update your payment method to avoid service interruption.</p>
        <p><a href="${process.env.APP_URL}/settings/billing">Update payment method</a></p>
        <p>If you have questions, reply to this email or contact support@airgen.studio.</p>
        <p>—The AIRGen Team</p>
      `,
    });
  } catch (err) {
    console.error('Failed to send payment failed email:', err);
  }
}

export async function sendSubscriptionCancelledEmail(user: User) {
  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: user.email,
      subject: 'Subscription Cancelled',
      html: `
        <h2>Subscription Cancelled</h2>
        <p>Hi ${user.name},</p>
        <p>Your AIRGen Professional subscription has been cancelled.</p>
        <p>You'll continue to have access until the end of your current billing period.</p>
        <p>After that, your account will be downgraded to the Free plan.</p>
        <p>Changed your mind? <a href="${process.env.APP_URL}/pricing">Reactivate your subscription</a></p>
        <p>—The AIRGen Team</p>
      `,
    });
  } catch (err) {
    console.error('Failed to send cancellation email:', err);
  }
}

export async function sendTrialEndingEmail(user: User, daysLeft: number) {
  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: user.email,
      subject: `Your Trial Ends in ${daysLeft} Days`,
      html: `
        <h2>Your Trial is Ending Soon</h2>
        <p>Hi ${user.name},</p>
        <p>Your 14-day trial of AIRGen Professional ends in ${daysLeft} days.</p>
        <p>To continue using Pro features, add a payment method before your trial expires.</p>
        <p><a href="${process.env.APP_URL}/settings/billing">Add payment method</a></p>
        <p>If you don't add payment, you'll automatically be moved to the Free plan.</p>
        <p>—The AIRGen Team</p>
      `,
    });
  } catch (err) {
    console.error('Failed to send trial ending email:', err);
  }
}

export async function sendUsageLimitWarningEmail(user: User, resource: string, percentage: number) {
  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: user.email,
      subject: `You're using ${percentage}% of your ${resource} limit`,
      html: `
        <h2>Usage Limit Warning</h2>
        <p>Hi ${user.name},</p>
        <p>You've used ${percentage}% of your ${resource} limit on the Free plan.</p>
        <p>Upgrade to Professional for unlimited ${resource}.</p>
        <p><a href="${process.env.APP_URL}/pricing">View plans</a></p>
        <p>—The AIRGen Team</p>
      `,
    });
  } catch (err) {
    console.error('Failed to send usage warning email:', err);
  }
}
```

#### Day 3-5: Integrate Email Triggers

**Add Email Calls to Webhooks**
- [ ] Update webhook handlers to send emails
- [ ] Add email calls to usage limit checks
- [ ] Implement trial ending cron job

**Update Webhook Handlers:**
```typescript
// In handleCheckoutCompleted
async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  // ... existing code ...

  // Send confirmation email
  const user = await getUser(session.metadata!.userId);
  await sendPaymentSuccessEmail(user, session.amount_total!);
}

// In handlePaymentFailed
async function handlePaymentFailed(invoice: Stripe.Invoice) {
  // ... existing code ...

  // Send failure notification
  const user = await getUserByStripeCustomerId(invoice.customer as string);
  await sendPaymentFailedEmail(user, invoice.hosted_invoice_url!);
}

// In handleSubscriptionDeleted
async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  // ... existing code ...

  // Send cancellation confirmation
  const user = await getUserByStripeCustomerId(subscription.customer as string);
  await sendSubscriptionCancelledEmail(user);
}
```

**Add Usage Warning Trigger:**
```typescript
// In checkLimit function
export async function checkLimit(tenantId: string, resource: string) {
  // ... existing code ...

  const percentage = (current / limit) * 100;

  // Send warning at 80% and 95%
  if (percentage >= 80 && percentage < 95) {
    const lastWarning = await getLastWarningTime(tenantId, resource);
    const daysSinceWarning = (Date.now() - lastWarning) / (1000 * 60 * 60 * 24);

    if (daysSinceWarning > 7) {
      const user = await getTenantOwner(tenantId);
      await sendUsageLimitWarningEmail(user, resource, 80);
      await recordWarningTime(tenantId, resource);
    }
  }

  return { allowed, current, limit };
}
```

#### Day 6-7: Trial Ending Cron Job

**Create Scheduled Task**
- [ ] Create `backend/src/jobs/trial-reminders.ts`
- [ ] Set up cron job (runs daily)
- [ ] Send reminders 3 days before trial ends

**Code Template:**
```typescript
// backend/src/jobs/trial-reminders.ts
import cron from 'node-cron';

export function startTrialReminderJob() {
  // Run daily at 9:00 AM
  cron.schedule('0 9 * * *', async () => {
    console.log('Running trial reminder job...');

    try {
      // Find trials ending in 3 days
      const trials = await findTrialsEndingInDays(3);

      for (const trial of trials) {
        const user = await getUser(trial.userId);
        await sendTrialEndingEmail(user, 3);
      }

      console.log(`Sent ${trials.length} trial ending reminders`);
    } catch (err) {
      console.error('Trial reminder job failed:', err);
    }
  });
}

async function findTrialsEndingInDays(days: number) {
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + days);

  // Query subscriptions in trial status ending on targetDate
  // Implementation depends on your database
  return [];
}
```

### Deliverables

- [x] Email service configured (Resend)
- [x] 5 email templates created
- [x] Email triggers integrated in webhooks
- [x] Usage warning emails implemented
- [x] Trial reminder cron job
- [x] Error handling for email failures

### Testing Checklist

- [ ] Payment success email sends after checkout
- [ ] Payment failure email sends on failed payment
- [ ] Cancellation email sends when subscription cancelled
- [ ] Usage warning email sends at 80% limit
- [ ] Trial ending email sends 3 days before expiry
- [ ] Emails render correctly in Gmail, Outlook, Apple Mail
- [ ] Unsubscribe link works (if required)

---

## Phase 5: Testing & Launch Prep

**Duration:** 1 week
**Priority:** Critical
**Owner:** Full Team

### Objectives

- Comprehensive testing of all billing flows
- Beta testing with 5-10 real users
- Legal pages published
- Documentation updated

### Tasks

#### Day 1-2: End-to-End Testing

**Test All User Flows**
- [ ] Sign up for free tier → Works without payment
- [ ] Upgrade to Pro → Stripe Checkout → Payment → Subscription activates
- [ ] Hit usage limits → See upgrade prompt → Upgrade → Limits lifted
- [ ] Cancel subscription → Downgrade to free → Data preserved
- [ ] Payment failure → Account marked past_due → Email sent → Update payment → Reactivates
- [ ] Manage billing → Stripe Portal → Update card → Portal closes → Back to app

**Test Edge Cases**
- [ ] Webhook arrives before checkout redirect completes
- [ ] User closes browser during checkout
- [ ] Duplicate webhook events (Stripe retries)
- [ ] Subscription update during active session
- [ ] Downgrade with data exceeding free tier limits

**Performance Testing**
- [ ] Webhook processing time < 500ms
- [ ] Usage check (with cache) < 50ms
- [ ] Pricing page loads < 1s
- [ ] No memory leaks in webhook handler

#### Day 3-4: Legal Pages

**Create Legal Pages**
- [ ] Generate Terms of Service using Termly
- [ ] Generate Privacy Policy using Termly
- [ ] Write Refund Policy (30-day money back)
- [ ] Create routes: `/legal/terms`, `/legal/privacy`, `/legal/refund`
- [ ] Link in footer of all pages

**Refund Policy Template:**
```markdown
# Refund Policy

Last updated: [Date]

## 30-Day Money-Back Guarantee

We offer a 30-day money-back guarantee on all paid plans. If you're not satisfied with AIRGen for any reason, contact support@airgen.studio within 30 days of your purchase for a full refund.

## How to Request a Refund

Email support@airgen.studio with:
- Your account email
- Reason for refund (optional, helps us improve)
- Any feedback

We'll process your refund within 5-7 business days.

## Exclusions

- Refunds only apply to first-time purchases
- Enterprise contracts have separate terms
- After 30 days, no refunds are available
- Partial month refunds are not available

## Questions?

Contact support@airgen.studio
```

#### Day 5: Beta Testing

**Recruit Beta Testers**
- [ ] Email 10-15 existing users
- [ ] Offer 3 months free Pro tier in exchange for feedback
- [ ] Create feedback form: https://forms.gle/xxx

**Beta Checklist:**
- [ ] 5+ users complete full upgrade flow
- [ ] 2+ users test cancellation flow
- [ ] 1+ user tests payment failure recovery
- [ ] Collect feedback on pricing perception
- [ ] Collect feedback on upgrade prompts (too aggressive?)

**Beta Feedback Questions:**
- Was the pricing clear and fair?
- Was the upgrade process smooth?
- Did you understand what features each tier includes?
- Were upgrade prompts helpful or annoying?
- What would make you upgrade (or not upgrade)?

#### Day 6-7: Documentation & Admin Tools

**Update Documentation**
- [ ] Add "Billing" section to user docs
- [ ] Create internal runbook for handling billing issues
- [ ] Document manual refund process
- [ ] Create FAQ for common billing questions

**Admin Dashboard**
- [ ] Create `/admin/subscriptions` page
- [ ] Show list of all subscriptions with status
- [ ] Calculate and display MRR (Monthly Recurring Revenue)
- [ ] Add quick actions (cancel, refund)

**Admin Dashboard Code:**
```tsx
// frontend/src/routes/AdminSubscriptionsRoute.tsx
export function AdminSubscriptionsRoute() {
  const [subscriptions, setSubscriptions] = useState([]);
  const [metrics, setMetrics] = useState({ mrr: 0, active: 0, trial: 0 });

  useEffect(() => {
    fetchSubscriptions();
  }, []);

  const fetchSubscriptions = async () => {
    const res = await fetch('/api/admin/subscriptions');
    const data = await res.json();
    setSubscriptions(data.subscriptions);
    setMetrics(data.metrics);
  };

  return (
    <div className="admin-subscriptions">
      <h1>Subscriptions</h1>

      <div className="metrics-grid">
        <MetricCard label="MRR" value={`$${metrics.mrr.toLocaleString()}`} />
        <MetricCard label="Active" value={metrics.active} />
        <MetricCard label="Trials" value={metrics.trial} />
      </div>

      <table className="subscriptions-table">
        <thead>
          <tr>
            <th>Tenant</th>
            <th>Plan</th>
            <th>Status</th>
            <th>MRR</th>
            <th>Users</th>
            <th>Created</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {subscriptions.map((sub) => (
            <tr key={sub.id}>
              <td>{sub.tenantName}</td>
              <td>{sub.tier}</td>
              <td><StatusBadge status={sub.status} /></td>
              <td>${sub.mrr}</td>
              <td>{sub.userCount}</td>
              <td>{new Date(sub.createdAt).toLocaleDateString()}</td>
              <td>
                <button onClick={() => viewInStripe(sub.stripeSubscriptionId)}>
                  View in Stripe
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

### Deliverables

- [x] All user flows tested and working
- [x] Edge cases handled
- [x] Beta testing completed with 5+ users
- [x] Legal pages published
- [x] Admin dashboard built
- [x] Documentation updated
- [x] Bug list triaged and fixed

### Testing Checklist

- [ ] Free signup works
- [ ] Paid upgrade works end-to-end
- [ ] Subscription status enforced
- [ ] Webhooks reliable (test with Stripe CLI)
- [ ] Emails send correctly
- [ ] Customer Portal works
- [ ] Legal pages linked
- [ ] Admin dashboard shows correct data
- [ ] Zero critical bugs

---

## Phase 6: Launch & Monitor

**Duration:** 1 week
**Priority:** Critical
**Owner:** Full Team

### Objectives

- Switch from test mode to live mode
- Launch paid plans to all users
- Monitor for issues
- Support early customers

### Tasks

#### Day 1: Production Deployment

**Switch to Live Mode**
- [ ] Update environment with live Stripe keys:
  ```bash
  STRIPE_SECRET_KEY=sk_live_xxx
  STRIPE_PUBLISHABLE_KEY=pk_live_xxx
  STRIPE_WEBHOOK_SECRET=whsec_live_xxx
  ```
- [ ] Create products and prices in live Stripe account
- [ ] Update frontend with live price IDs
- [ ] Test one complete flow in production
- [ ] Deploy to production

**Monitoring Setup**
- [ ] Set up error tracking (Sentry) for billing routes
- [ ] Create Stripe webhook monitoring dashboard
- [ ] Set up alerts for failed webhooks
- [ ] Monitor email delivery rates
- [ ] Create Slack channel for billing alerts

#### Day 2-3: Soft Launch

**Announce to Existing Users**
- [ ] Email all existing free users about paid plans
- [ ] Offer early adopter discount (20% off for 3 months)
- [ ] Create launch announcement blog post
- [ ] Share on social media (Twitter, LinkedIn)

**Email Template:**
```markdown
Subject: Introducing AIRGen Professional 🚀

Hi [Name],

We're excited to announce the launch of AIRGen Professional!

After months of building features you've requested, we're ready to help you scale your requirements management with:

✓ Unlimited projects and requirements
✓ AI-powered drafting (500/month)
✓ Version history and baselines
✓ Priority support

**Early Adopter Offer**
As a thank-you for being an early user, get 20% off Professional for your first 3 months.

[Claim Your Discount]

Your free tier account stays exactly as is - no changes unless you choose to upgrade.

Questions? Just reply to this email.

—[Your Name]
AIRGen Team
```

#### Day 4-7: Monitor & Support

**Daily Checks**
- [ ] Review Stripe dashboard for successful payments
- [ ] Check webhook delivery success rate (should be >99%)
- [ ] Monitor error logs for billing-related errors
- [ ] Review customer support emails
- [ ] Track conversion rate (free → paid)

**Support Readiness**
- [ ] Create canned responses for common billing questions
- [ ] Set up support@ email forwarding
- [ ] Document manual refund process
- [ ] Create escalation path for payment issues

**Metrics to Track**
- [ ] Free tier signups per day
- [ ] Free → Pro conversion rate
- [ ] MRR (Monthly Recurring Revenue)
- [ ] Churn rate
- [ ] Average revenue per account (ARPA)
- [ ] Customer support tickets related to billing

**Success Thresholds (Week 1)**
- 5+ paying customers
- $500+ MRR
- 99%+ webhook success rate
- <5% payment failure rate
- <3 critical bugs

### Deliverables

- [x] Live Stripe account configured
- [x] Production deployment completed
- [x] Launch announcement sent
- [x] Monitoring dashboards created
- [x] Support system ready
- [x] First paying customers

### Launch Day Checklist

- [ ] Live Stripe keys in production
- [ ] Products and prices created in live mode
- [ ] Webhook endpoint configured in live mode
- [ ] Test payment completed successfully
- [ ] Legal pages linked in footer
- [ ] Support email monitored
- [ ] Monitoring dashboards ready
- [ ] Team on standby for issues
- [ ] Launch announcement scheduled
- [ ] Backup plan if issues arise

---

## Success Metrics

### Week 1 Targets

- **Revenue:** 5+ paying customers, $500+ MRR
- **Technical:** 99%+ webhook success, <1% error rate
- **Support:** <24hr response time, <5 billing tickets
- **Conversion:** 3-5% free → paid

### Month 1 Targets

- **Revenue:** 20+ paying customers, $2,000+ MRR
- **Retention:** <10% churn
- **Growth:** 20% week-over-week MRR growth
- **Product:** Net Promoter Score >30

### Quarter 1 Targets

- **Revenue:** 100+ paying customers, $10,000+ MRR
- **Unit Economics:** LTV:CAC > 3:1
- **Retention:** >90% net revenue retention
- **Product:** >50% of paid users are active weekly

---

## Risk Mitigation

### High-Risk Areas

#### 1. Webhook Reliability
**Risk:** Webhooks fail, subscriptions not updated correctly

**Mitigation:**
- Idempotency keys on all database updates
- Webhook retry logic (Stripe retries for 3 days)
- Manual reconciliation script to catch missed webhooks
- Monitoring alerts for failed webhooks
- Weekly manual audit of subscriptions vs. Stripe dashboard

#### 2. Payment Failures
**Risk:** Legitimate customers' payments fail, causing churn

**Mitigation:**
- Grace period (7 days) before disabling account
- Multiple email reminders before suspension
- Clear instructions on how to update payment method
- Stripe Smart Retries enabled
- Support ready to help with payment issues

#### 3. Pricing Perception
**Risk:** Users think pricing is too high or unclear

**Mitigation:**
- Beta test pricing with 10+ users first
- Clear feature comparison on pricing page
- 30-day money-back guarantee
- Monitor feedback and adjust if needed
- Transparent about what's included

#### 4. Technical Bugs
**Risk:** Billing bugs cause customer trust issues

**Mitigation:**
- Extensive testing before launch
- Beta period with real money transactions
- Error monitoring with Sentry
- Feature flags to disable billing if needed
- Clear rollback plan

### Rollback Plan

If critical issues arise:

1. **Disable new signups** via feature flag
2. **Pause marketing** of paid plans
3. **Fix issue** in development
4. **Test fix** thoroughly
5. **Re-enable** gradually

Code for feature flag:
```typescript
// backend/src/config/features.ts
export const FEATURES = {
  BILLING_ENABLED: process.env.ENABLE_BILLING === 'true',
};

// Use in routes
if (!FEATURES.BILLING_ENABLED) {
  return reply.status(503).send({
    error: 'Billing temporarily unavailable',
    message: 'We are performing maintenance. Please try again later.',
  });
}
```

---

## Post-Launch Roadmap

### Month 2-3 Enhancements

**Based on feedback, consider:**

- [ ] Annual billing (offer 2 months free)
- [ ] Team seat management (add/remove users)
- [ ] Usage-based pricing for AI drafts
- [ ] Enterprise SSO/SAML
- [ ] Multi-currency support
- [ ] Tax calculation (Stripe Tax)
- [ ] Invoicing customization
- [ ] Referral program
- [ ] Partner/affiliate program

**Prioritize based on:**
- Customer requests (3+ customers want it)
- Revenue impact (expands existing accounts)
- Competitive pressure (competitors have it)
- Implementation effort (quick wins first)

### Pricing Optimization

**After 3 months, review:**
- Conversion rate by plan
- Upgrade patterns (which features drive upgrades?)
- Churn reasons
- Price sensitivity feedback
- Competitive pricing changes

**Potential adjustments:**
- Add middle tier between Free and Pro
- Adjust Pro price based on willingness to pay
- Add AI draft add-on packs
- Experiment with discounts for annual billing

---

## Appendix A: Code Repository Structure

```
backend/
├── src/
│   ├── routes/
│   │   ├── billing.ts          # NEW: Checkout, portal
│   │   └── webhooks.ts         # NEW: Stripe webhooks
│   ├── services/
│   │   ├── stripe.ts           # NEW: Stripe client
│   │   ├── subscription.ts     # NEW: Subscription logic
│   │   ├── usage.ts            # NEW: Usage tracking
│   │   └── email.ts            # NEW: Email service
│   ├── middleware/
│   │   └── checkLimits.ts      # NEW: Plan enforcement
│   ├── config/
│   │   ├── plans.ts            # NEW: Plan definitions
│   │   └── features.ts         # NEW: Feature flags
│   └── jobs/
│       └── trial-reminders.ts  # NEW: Cron jobs
│
frontend/
├── src/
│   ├── routes/
│   │   ├── PricingRoute.tsx    # NEW: Pricing page
│   │   └── BillingRoute.tsx    # NEW: Billing settings
│   └── components/
│       └── UpgradePrompt.tsx   # NEW: Upgrade CTAs
```

---

## Appendix B: Environment Variables

```bash
# Stripe (Test Mode)
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_PUBLISHABLE_KEY=pk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_test_xxx

# Stripe (Live Mode - use in production)
STRIPE_SECRET_KEY=sk_live_xxx
STRIPE_PUBLISHABLE_KEY=pk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_live_xxx

# Stripe Product IDs
STRIPE_PRO_PRICE_ID=price_xxx

# Email
RESEND_API_KEY=re_xxx

# Application
APP_URL=https://airgen.studio
ENABLE_BILLING=true
```

---

## Appendix C: Stripe Dashboard Setup

**Products to Create:**

1. **AIRGen Professional**
   - Type: Subscription
   - Billing period: Monthly
   - Price: $75.00 USD
   - Tax behavior: Exclusive
   - Trial period: 14 days (optional)

**Webhooks to Configure:**

- Endpoint URL: `https://airgen.studio/api/webhooks/stripe`
- Events to listen for:
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.payment_succeeded`
  - `invoice.payment_failed`

**Customer Portal Settings:**

- Enable: Update payment method
- Enable: Cancel subscription
- Enable: View invoices
- Disable: Update subscription (manually manage for now)

---

## Appendix D: Support Runbook

### Common Billing Issues

**Issue: Payment failed**
1. Check Stripe dashboard for error details
2. Email customer with specific reason (expired card, insufficient funds, etc.)
3. Guide them to `/settings/billing` to update payment
4. Offer grace period if needed

**Issue: Want to cancel**
1. Confirm reason (collect feedback)
2. Offer to help with any product issues
3. If still want to cancel, direct to Customer Portal
4. Confirm they understand access continues until period end
5. Send cancellation email

**Issue: Want refund**
1. Check if within 30 days
2. Confirm account details
3. Process refund in Stripe dashboard
4. Send confirmation email
5. Optionally collect feedback on why

**Issue: Billing question**
1. Check subscription status in admin dashboard
2. Cross-reference with Stripe dashboard
3. Provide clear answer with screenshots if needed
4. Document if it's a common question (add to FAQ)

---

## Document History

- **v1.0** (2025-10-23): Initial project plan created based on SaaS MVP requirements analysis

---

**Next Steps:**

1. Review this plan with team
2. Assign owners to each phase
3. Set up project tracking (GitHub Projects, Linear, etc.)
4. Schedule kickoff meeting
5. Begin Phase 1: Stripe Integration

**Questions or concerns? Discuss before starting implementation.**
