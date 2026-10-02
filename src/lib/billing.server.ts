import { PLANS, type MyPlan, type PlanId } from "./plans";

const DAY = 24 * 3600 * 1000;
const BACHS = "https://api.bachs.io";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

type SubRow = { user_id: string; plan: string; credits_left: number; credits_reset_at: string; trial_started_at: string; period_end: string | null };

/** Loads (or creates) the user's subscription, applying daily refills and expiry. */
export async function loadSub(userId: string): Promise<{ row: SubRow; info: MyPlan }> {
  const db = await admin();
  let { data: row } = await db.from("subscriptions").select("*").eq("user_id", userId).maybeSingle();
  if (!row) {
    const ins = await db.from("subscriptions").insert({ user_id: userId }).select("*").single();
    if (ins.error) throw new Error(ins.error.message);
    row = ins.data;
  }
  const now = Date.now();
  // Paid plan ran out -> back to (possibly expired) free
  if (row.plan !== "free" && row.period_end && new Date(row.period_end).getTime() < now) {
    const up = await db.from("subscriptions").update({ plan: "free", credits_left: 0, period_end: null, updated_at: new Date().toISOString() }).eq("user_id", userId).select("*").single();
    row = up.data ?? row;
  }
  const trialEnds = new Date(row.trial_started_at).getTime() + 7 * DAY;
  if (row.plan === "free" && now < trialEnds && new Date(row.credits_reset_at).getTime() + DAY <= now) {
    const up = await db.from("subscriptions").update({ credits_left: PLANS.free.credits!, credits_reset_at: new Date().toISOString() }).eq("user_id", userId).select("*").single();
    row = up.data ?? row;
  }
  const since = new Date(now - DAY).toISOString();
  const { data: starts } = await db.from("credit_ledger").select("project_id").eq("user_id", userId).eq("kind", "clip").gte("created_at", since);
  const videosToday = new Set((starts ?? []).map((s) => s.project_id)).size;

  const plan = row.plan as PlanId;
  const freeExpired = plan === "free" && now >= trialEnds;
  const info: MyPlan = {
    plan,
    active: !freeExpired,
    expiredReason: freeExpired ? "Your 7-day free trial has ended. Pick a plan to keep making videos." : null,
    creditsLeft: plan === "galaxy" ? null : freeExpired ? 0 : row.credits_left,
    resetAt: plan === "free" && !freeExpired ? new Date(new Date(row.credits_reset_at).getTime() + DAY).toISOString() : null,
    periodEnd: row.period_end,
    trialEndsAt: plan === "free" ? new Date(trialEnds).toISOString() : null,
    videosToday,
  };
  return { row, info };
}

export async function recordUse(userId: string, projectId: string, sceneId: string, kind: "clip" | "remake", amount: number, unlimited: boolean) {
  const db = await admin();
  await db.from("credit_ledger").insert({ user_id: userId, project_id: projectId, scene_id: sceneId, kind, amount });
  if (!unlimited && amount > 0) {
    const { data } = await db.from("subscriptions").select("credits_left").eq("user_id", userId).single();
    await db.from("subscriptions").update({ credits_left: Math.max(0, (data?.credits_left ?? 0) - amount) }).eq("user_id", userId);
  }
}

export async function countRemakes(userId: string, projectId: string) {
  const db = await admin();
  const { count } = await db.from("credit_ledger").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("project_id", projectId).eq("kind", "remake");
  return count ?? 0;
}

export async function projectStartedToday(userId: string, projectId: string) {
  const db = await admin();
  const { count } = await db.from("credit_ledger").select("id", { count: "exact", head: true })
    .eq("user_id", userId).eq("project_id", projectId).eq("kind", "clip").gte("created_at", new Date(Date.now() - DAY).toISOString());
  return (count ?? 0) > 0;
}

// ---------- Bachs ----------
function bachsKey() {
  const k = process.env["BACHS_SECRET_KEY"];
  if (!k) throw new Error("Payments are not set up yet.");
  return k;
}

async function bachsError(res: Response) {
  const b = (await res.json().catch(() => null)) as { detail?: string } | null;
  console.error("Bachs error", res.status, b);
  return new Error(b?.detail ? `Payment provider: ${b.detail}` : `Payment provider error (${res.status})`);
}

export async function createBachsCheckout(body: Record<string, unknown>) {
  const send = (b: Record<string, unknown>) =>
    fetch(`${BACHS}/v1/checkout-sessions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${bachsKey()}`, "Content-Type": "application/json", "Idempotency-Key": String(b["reference"] ?? crypto.randomUUID()) },
      body: JSON.stringify(b),
    });
  let res = await send(body);
  if (res.status === 400 && body["reference"]) {
    const { reference: _r, ...rest } = body;
    res = await send(rest);
  }
  if (!res.ok) throw await bachsError(res);
  return (await res.json()) as { checkout_id: string; checkout_url: string; status: string };
}

export async function getBachsCheckout(id: string) {
  const res = await fetch(`${BACHS}/v1/checkout-sessions/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${bachsKey()}` } });
  if (!res.ok) throw await bachsError(res);
  return (await res.json()) as any;
}

function isPaid(s: any) {
  const st = String(s?.status ?? "").toLowerCase();
  const ps = String(s?.payment_status ?? s?.payment?.status ?? "").toLowerCase();
  return ["complete", "completed", "paid", "succeeded"].includes(st) || ["paid", "succeeded", "completed"].includes(ps);
}

/** Verifies a checkout with Bachs and, if paid, activates the plan (idempotent). */
export async function confirmCheckout(checkoutId: string): Promise<"paid" | "pending" | "failed"> {
  const db = await admin();
  const { data: pay } = await db.from("payments").select("*").eq("checkout_id", checkoutId).maybeSingle();
  if (!pay) return "failed";
  if (pay.status === "paid") return "paid";
  const session = await getBachsCheckout(checkoutId);
  if (!isPaid(session)) {
    const st = String(session?.status ?? "").toLowerCase();
    if (st === "expired" || st === "failed") {
      await db.from("payments").update({ status: st }).eq("id", pay.id);
      return "failed";
    }
    return "pending";
  }
  // claim the payment once
  const { data: claimed } = await db.from("payments").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", pay.id).neq("status", "paid").select("id");
  if (claimed?.length) {
    const plan = PLANS[pay.plan as PlanId];
    await loadSub(pay.user_id);
    await db.from("subscriptions").update({
      plan: plan.id,
      credits_left: plan.credits ?? 0,
      period_end: new Date(Date.now() + 30 * DAY).toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("user_id", pay.user_id);
  }
  return "paid";
}
