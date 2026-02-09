"use client";

import { useEffect, useState } from "react";

type BannerState = {
  state: "restricted" | "blocked" | "active";
  title: string | null;
  message: string | null;
  cta_label: string | null;
  cta_action: "open_billing" | "open_support" | null;
};

export function BillingBanner({ clientId }: { clientId: string }) {
  const [data, setData] = useState<BannerState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const res = await fetch(
          `/api/admin/billing-banner-state?client_id=${clientId}`,
          { cache: "no-store" }
        );

        if (!res.ok) return;

        const json = await res.json();
        if (mounted) setData(json ?? null);
      } catch {
        // silêncio: banner não pode quebrar o admin
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, [clientId]);

  // 🔒 Guards de segurança
  if (loading) return null;
  if (!data) return null;
  if (!data.title || !data.message) return null;

  function handleCTA() {
    if (!data?.cta_action) return;

    if (data.cta_action === "open_billing") {
      window.location.href = "/admin/billing";
      return;
    }

    if (data.cta_action === "open_support") {
      window.location.href = "/admin/support";
      return;
    }
  }

  return (
    <div className="mb-6 rounded-2xl border border-yellow-900/40 bg-yellow-950/40 p-4 text-yellow-100">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-semibold">{data.title}</div>
          <div className="mt-1 text-sm text-yellow-200/90">{data.message}</div>
        </div>

        {data.cta_label && data.cta_action && (
          <button
            onClick={handleCTA}
            className="rounded-xl bg-yellow-400 px-4 py-2 text-sm font-semibold text-yellow-950 hover:bg-yellow-300"
          >
            {data.cta_label}
          </button>
        )}
      </div>
    </div>
  );
}
