# Plans, credits, Bachs payments, Gemini video + downloads

## 1. Video creation by Gemini + Nano Banana
- For each scene, Nano Banana first draws a character/keyframe picture (keeps characters looking the same), then the Gemini video model animates that scene from the picture.
- "Save to device" button on every clip and a "Download all" on the project page; My projects cards get a download button too.

## 2. Credits & plans (prices in USD, one-time payment = 30 days access)

| | Free trial | Sprout | Star | Galaxy |
|---|---|---|---|---|
| Price | $0 | $9.99 / month | $24.99 / month | $59.99 / month |
| Credits | 20 per day, resets every 24h | 300 / month | 1,000 / month | Unlimited |
| Videos | 2 per 24h | Unlimited (within credits) | Unlimited | Unlimited |
| Lasts | 7 days, then must buy a plan | 30 days | 30 days | 30 days |
| Clip quality | 720p | 720p | 1080p | 1080p |
| Re-make a scene (AI edit + regenerate) | No | 3 per video | Unlimited | Unlimited |
| Apply AI suggestions | View only | Yes | Yes | Yes |
| Custom intro upload | Default intro only | Yes | Yes | Yes |
| Vertical 9:16 videos | No | Yes | Yes | Yes |
| Priority generation, longer videos (up to 20 scenes) | No | No | No | Yes |

- Credit cost: 1 credit per clip-second. Free users: the app automatically splits the 20 daily credits across the 2 videos (about 10 seconds each) by fitting scene count/lengths to the budget.
- AI chat (Toonie), browsing and planning scenes are always free.
- Locked features show a small "Upgrade" badge; every limit is also enforced on the server, not just hidden.

## 3. Purchase flow (Bachs)
1. New "Plans" page (also linked from header + upgrade badges).
2. Pick a plan, then a popup shows the amount pre-filled in USD (read-only) and an email field for the receipt (pre-filled with account email), plus Confirm.
3. Confirm creates a Bachs checkout session on the server, then the Bachs payment page opens inside an in-app popup window (embedded frame), no leaving the app.
4. Bachs notifies the app when payment succeeds; the plan and credits switch on instantly and the popup closes with a success message.

## Technical details
- New tables: `subscriptions` (user_id, plan, credits_left, period_start, period_end, trial_started_at), `credit_ledger`, `payments` (bachs checkout id, amount, status, email). RLS: users read own rows only; writes happen only on the server.
- Plan config in one shared module; server fns `getMyPlan`, `createCheckout`; enforcement inside `startClip` / `editScene`.
- Bachs: `POST /v1/checkout-sessions` with secret key stored as `BACHS_SECRET_KEY` (never in code); webhook route `/api/public/bachs-webhook` verifies signature (needs `BACHS_WEBHOOK_SECRET`) before activating plans; status also re-checked by polling the session as fallback.
- If Bachs blocks being shown inside a frame, fallback is a small popup window that stays on top of the app.
