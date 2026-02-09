"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

type BannerState = {
  state: "active" | "restricted" | "blocked";
  title: string | null;
  message: string | null;
  cta_label: string | null;
  cta_action: "open_billing" | "open_support" | null;
};

type Props = {
  clientId: string;
};

export function BillingBanner({ clientId }: Props) {
  const [data, setData] = useState<BannerState | null>(null);
  const [loading, setLoading] = useState(true);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);

      const { data, error } = await supabase.rpc(
        "get_client_billing_banner_state",
        { p_client_id: clientId }
      );

      if (!mounted) return;

      if (error) {
        console.error("BillingBanner error:", error.message);
        setData(null);
      } else {
        setData(Array.isArray(data) ? data[0] : data);
      }

      setLoading(false);
    }

    load();
    return () => {
      mounted = false;
    };
  }, [clientId]);

  if (loading || !data || data.state === "active") return null;

  function handleCTA() {
    if (data.cta_action === "open_billing") {
      // ajuste a rota se necessário
      window.location.href = "/admin/billing";
    }

    if (data.cta_action === "open_support") {
      window.location.href = "/admin/suporte";
    }
  }

  return (
    <div
      className={`w-full rounded-xl border p-4 mb-4 ${
        data.state === "restricted"
          ? "bg-yellow-50 border-yellow-300"
          : "bg-red-50 border-red-300"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">
            {data.title}
          </h3>
          <p className="mt-1 text-sm text-gray-700">
            {data.message}
          </p>
        </div>

        {data.cta_label && (
          <button
            onClick={handleCTA}
            className={`shrink-0 rounded-lg px-4 py-2 text-sm font-medium ${
              data.state === "restricted"
                ? "bg-yellow-600 text-white hover:bg-yellow-700"
                : "bg-red-600 text-white hover:bg-red-700"
            }`}
          >
            {data.cta_label}
          </button>
        )}
      </div>
    </div>
  );
}
