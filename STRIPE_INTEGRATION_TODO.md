# Stripe Integration TODO

This file is the single source of truth for remaining Stripe setup steps.

## Values to Replace

The following values are placeholders and must be updated before going live.

**Files containing placeholders:**
- [.env](.env)
- [src/App.tsx](src/App.tsx)

| Field | Current Value | What to Set |
|-------|---------------|-------------|
| `STRIPE_SECRET_KEY` | `sk_test_...` | Your actual Stripe secret key from the Dashboard: https://dashboard.stripe.com/test/apikeys |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` | Your actual webhook signing secret from: https://dashboard.stripe.com/workbench/webhooks |
| `SUBSCRIPTION_PLANS[].priceId` (Aficionado) | `price_...` | Your actual Stripe Price ID for the Aficionado plan (3,99€/mes). Create it at https://dashboard.stripe.com/prices |
| `SUBSCRIPTION_PLANS[].priceId` (Limpieza Total) | `price_...` | Your actual Stripe Price ID for the Limpieza Total plan (7,99€/mes). Create it at https://dashboard.stripe.com/prices |

## Configured Parameters

These parameters were configured in Checkout Studio and are already set correctly in the edge function.

**Files containing these parameters:**
- [supabase/functions/stripe-checkout/index.ts](supabase/functions/stripe-checkout/index.ts)

| Parameter | Value |
|-----------|-------|
| `ui_mode` | `hosted` (SDK version 17.7.0 is below 21.0.0; uses `hosted` instead of `hosted_page`) |
| `billing_address_collection` | `auto` |
| `phone_number_collection` | `{ enabled: false }` |
| `automatic_tax` | `{ enabled: false }` |
| `allow_promotion_codes` | `false` |
| `payment_method_collection` | `always` (only included when `mode` is `subscription`) |
| `submit_type` | `auto` |

## Setup and Next Steps

### 1. Environment Variables

Add your Stripe keys to the `.env` file. The edge function reads `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` from the Supabase project's edge function secrets — these are deployed automatically when you set them.

To configure Stripe secrets for the edge functions, set them in the Supabase dashboard or contact support:
- `STRIPE_SECRET_KEY` — your Stripe secret key (`sk_test_...` for test mode)
- `STRIPE_WEBHOOK_SECRET` — your webhook endpoint signing secret

### 2. Create Stripe Products and Prices

In your Stripe Dashboard (https://dashboard.stripe.com/prices), create two recurring products:

1. **Aficionado** — 3,99€/month recurring subscription
2. **Limpieza Total** — 7,99€/month recurring subscription

Copy each Price ID (starts with `price_...`) and replace the `price_...` placeholders in `src/App.tsx` in the `SUBSCRIPTION_PLANS` array.

### 3. Configure the Webhook Endpoint

Create a webhook endpoint in your Stripe Dashboard (https://dashboard.stripe.com/workbench/webhooks) pointing to:

```
https://wnfjuwcdcwkdulstkkfy.supabase.co/functions/v1/stripe-webhook
```

Subscribe to these events:
- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

Copy the signing secret (`whsec_...`) and set it as the `STRIPE_WEBHOOK_SECRET` secret.

### 4. Project Structure

New/modified files:
- `supabase/functions/stripe-checkout/index.ts` — Edge function that creates Stripe Checkout Sessions
- `supabase/functions/stripe-webhook/index.ts` — Edge function that processes Stripe webhooks
- `supabase/config.toml` — Added `[functions.stripe-checkout]` and `[functions.stripe-webhook]` entries
- `src/App.tsx` — Updated `StripeCheckoutCard` to redirect to Stripe-hosted Checkout
- `.env` — Added `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` placeholders

### 5. How the Integration Works

1. User clicks "Suscribirme ahora" on a paid plan
2. The `StripeCheckoutCard` sends a POST request to the `stripe-checkout` edge function with the price ID, mode, user email, and success/cancel URLs
3. The edge function creates or retrieves a Stripe customer, then creates a Checkout Session
4. The user is redirected to Stripe's hosted Checkout page to enter payment details
5. After payment, Stripe redirects back to the app's success URL
6. Stripe sends a webhook to the `stripe-webhook` edge function, which records the subscription in the `stripe_subscriptions` table

### 6. Testing

Use these test card numbers in Stripe's test mode:
- **Successful payment:** `4242 4242 4242 4242`
- **Declined payment:** `4000 0000 0000 0002`
- **Requires 3D Secure:** `4000 0027 6000 3184`

Use any future expiry date and any 3-digit CVC.

### 7. ui_mode Version Note

The Stripe SDK version is `17.7.0` (pinned in the edge function as `npm:stripe@17.7.0`). Since this is below `21.0.0`, `ui_mode` is set to `hosted`. If you upgrade the Stripe SDK to `21.0.0` or above, change `ui_mode` to `hosted_page`.

### Resources

- Stripe Support: https://support.stripe.com
- Stripe Docs: https://docs.stripe.com/mcp
