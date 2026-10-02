import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { confirmCheckout } from "@/lib/billing.server";

function safeEq(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export const Route = createFileRoute("/api/public/bachs-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["BACHS_WEBHOOK_SECRET"];
        if (!secret) return new Response("Webhook not configured", { status: 503 });
        const raw = await request.text();
        const v2 = request.headers.get("x-bachs-signature-v2");
        let ts = request.headers.get("x-bachs-timestamp") ?? "";
        let sigs: string[] = [request.headers.get("x-bachs-signature") ?? ""];
        if (v2) {
          const parts = v2.split(",").map((p) => p.split("=", 2) as [string, string]);
          ts = parts.find(([k]) => k === "t")?.[1] ?? ts;
          sigs = parts.filter(([k]) => k === "v1").map(([, v]) => v);
        }
        if (!ts || Math.abs(Date.now() / 1000 - Number(ts)) > 300) return new Response("Stale", { status: 401 });
        const expected = createHmac("sha256", secret).update(`${ts}.${raw}`).digest("hex");
        if (!sigs.some((s) => s && safeEq(s, expected))) return new Response("Invalid signature", { status: 401 });

        const event = JSON.parse(raw) as { type?: string; data?: any };
        const d = event.data ?? {};
        const checkoutId: string | undefined = d.checkout_id ?? d.checkout?.id ?? d.checkout_session_id ?? (String(d.id ?? "").startsWith("chk_") ? d.id : undefined);
        if (checkoutId) {
          try { await confirmCheckout(checkoutId); } catch (e) { console.error("bachs webhook confirm failed", e); return new Response("retry", { status: 500 }); }
        }
        return new Response("ok");
      },
    },
  },
});
