import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadSub, createBachsCheckout, confirmCheckout } from "./billing.server";
import { PLANS } from "./plans";

export const getMyPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await loadSub(context.userId)).info);

export const createCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ plan: z.enum(["sprout", "star", "galaxy"]), email: z.string().email().max(255), origin: z.string().url() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const plan = PLANS[data.plan];
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: pay, error } = await supabaseAdmin
      .from("payments")
      .insert({ user_id: context.userId, plan: plan.id, amount: plan.price, currency: "USD", email: data.email })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const origin = new URL(data.origin).origin;
    const session = await createBachsCheckout({
      pricing: { currency: "USD", amount: plan.price.toFixed(2) },
      customer: { email: data.email },
      success_url: `${origin}/plans?paid=1`,
      cancel_url: `${origin}/plans`,
      reference: pay.id,
    });
    await supabaseAdmin.from("payments").update({ checkout_id: session.checkout_id }).eq("id", pay.id);
    return { checkoutId: session.checkout_id, url: session.checkout_url };
  });

export const checkPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ checkoutId: z.string().min(3).max(100) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: pay } = await context.supabase.from("payments").select("id").eq("checkout_id", data.checkoutId).maybeSingle();
    if (!pay) throw new Error("Payment not found");
    return { status: await confirmCheckout(data.checkoutId) };
  });
