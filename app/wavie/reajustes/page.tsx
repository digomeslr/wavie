"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type ServiceType = "" | "praia" | "restaurante"; // "" = todos
type SubStatus = "" | "trial" | "active" | "past_due" | "canceled"; // "" = todos

export default function WavieAdjustmentsPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  // form
  const [note, setNote] = useState("");
  const [serviceType, setServiceType] = useState<ServiceType>("");
  const [subStatus, setSubStatus] = useState<SubStatus>("active"); // default útil

  // ajustes (string para permitir vazio)
  const [priceMultiplier, setPriceMultiplier] = useState<string>("");
  const [priceAddCents, setPriceAddCents] = useState<string>("");
  const [commissionMultiplier, setCommissionMultiplier] = useState<string>("");
  const [commissionAddBps, setCommissionAddBps] = useState<string>("");

  // state
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);

  // Guard wavie_admin
  useEffect(() => {
    let alive = true;

    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const user = userRes?.user;

      if (!alive) return;

      if (!user) {
        router.replace("/wavie/login");
        return;
      }

      const { data: profile, error: profErr } = await supabase
        .from("profiles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle<{ role: string | null }>();

      if (!alive) return;

      if (profErr || profile?.role !== "wavie_admin") {
        router.replace("/");
        return;
      }

      setChecking(false);
    })();

    return () => {
      alive = false;
    };
  }, [router]);

  const hasAnyAdjustment = useMemo(() => {
    return (
      priceMultiplier.trim() !== "" ||
      priceAddCents.trim() !== "" ||
      commissionMultiplier.trim() !== "" ||
      commissionAddBps.trim() !== ""
    );
  }, [priceMultiplier, priceAddCents, commissionMultiplier, commissionAddBps]);

  function parseOptionalNumber(s: string): number | null {
    const t = s.trim();
    if (!t) return null;
    const n = Number(t);
    if (!Number.isFinite(n)) return null;
    return n;
  }

  function parseOptionalInt(s: string): number | null {
    const t = s.trim();
    if (!t) return null;
    const n = Number(t);
    if (!Number.isFinite(n)) return null;
    return Math.trunc(n);
  }

  const preview = useMemo(() => {
    const pm = parseOptionalNumber(priceMultiplier);
    const pa = parseOptionalInt(priceAddCents);
    const cm = parseOptionalNumber(commissionMultiplier);
    const ca = parseOptionalInt(commissionAddBps);

    return { pm, pa, cm, ca };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceMultiplier, priceAddCents, commissionMultiplier, commissionAddBps]);

  async function apply() {
    setErr(null);
    setResult(null);

    if (!hasAnyAdjustment) {
      setErr("Preencha ao menos um ajuste (multiplicador ou incremento).");
      return;
    }

    // validação leve
    if (preview.pm !== null && preview.pm <= 0) {
      setErr("Multiplicador de mensalidade deve ser > 0.");
      return;
    }
    if (preview.cm !== null && preview.cm <= 0) {
      setErr("Multiplicador de comissão deve ser > 0.");
      return;
    }

    const ok = window.confirm(
      `Aplicar reajuste?\n\nEscopo:\n- Serviço: ${serviceType || "todos"}\n- Status: ${subStatus || "todos"}\n\nAjustes:\n` +
        `- Mensalidade: ${preview.pm ? `x${preview.pm}` : ""} ${preview.pa ? `+${preview.pa} cents` : ""}\n` +
        `- Comissão: ${preview.cm ? `x${preview.cm}` : ""} ${preview.ca ? `+${preview.ca} bps` : ""}\n\n` +
        `Isso altera os snapshots das subscriptions selecionadas.`
    );
    if (!ok) return;

    setRunning(true);

    const { data, error } = await supabase.rpc("apply_billing_adjustment", {
      p_note: note.trim() || null,
      p_service_type: serviceType || null,
      p_subscription_status: subStatus || null,
      p_price_multiplier: preview.pm,
      p_commission_multiplier: preview.cm,
      p_price_add_cents: preview.pa,
      p_commission_add_bps: preview.ca,
    });

    setRunning(false);

    if (error) {
      setErr(error.message);
      return;
    }

    setResult(data ?? null);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace("/wavie/login");
  }

  if (checking) {
    return (
      <main className="min-h-screen bg-neutral-50 flex items-center justify-center p-6">
        <div className="text-sm text-neutral-600">Verificando acesso…</div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Reajuste geral</h1>
          <p className="mt-1 text-sm text-neutral-600">
            Aplica ajustes em massa nas <span className="font-medium">subscriptions</span> (snapshots).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/wavie"
            className="rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm hover:border-neutral-900"
          >
            Voltar
          </Link>
          <button
            onClick={handleLogout}
            className="rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm hover:border-neutral-900"
          >
            Sair
          </button>
        </div>
      </div>

      <section className="mt-6 rounded-2xl border border-neutral-200 bg-white p-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-neutral-800">Serviço</label>
            <select
              className="mt-1 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm"
              value={serviceType}
              onChange={(e) => setServiceType(e.target.value as ServiceType)}
            >
              <option value="">Todos</option>
              <option value="praia">Praia</option>
              <option value="restaurante">Restaurante</option>
            </select>
            <p className="mt-1 text-xs text-neutral-500">Filtra pelo service_type do client.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-800">Status da subscription</label>
            <select
              className="mt-1 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm"
              value={subStatus}
              onChange={(e) => setSubStatus(e.target.value as SubStatus)}
            >
              <option value="">Todos</option>
              <option value="active">active</option>
              <option value="trial">trial</option>
              <option value="past_due">past_due</option>
              <option value="canceled">canceled</option>
            </select>
            <p className="mt-1 text-xs text-neutral-500">Recomendado: active (padrão).</p>
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-neutral-800">Nota (opcional)</label>
            <input
              className="mt-1 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm"
              placeholder="Ex: reajuste anual 2026"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl border border-neutral-200 p-4">
            <h2 className="text-sm font-semibold text-neutral-900">Mensalidade (snapshot)</h2>
            <p className="mt-1 text-xs text-neutral-600">
              Use multiplicador (ex: 1.10) e/ou incremento em centavos.
            </p>

            <div className="mt-3 space-y-3">
              <div>
                <label className="block text-xs font-medium text-neutral-700">Multiplicador</label>
                <input
                  className="mt-1 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm"
                  placeholder="ex: 1.10"
                  value={priceMultiplier}
                  onChange={(e) => setPriceMultiplier(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-700">+ Centavos</label>
                <input
                  className="mt-1 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm"
                  placeholder="ex: 1000 (R$10,00)"
                  value={priceAddCents}
                  onChange={(e) => setPriceAddCents(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-neutral-200 p-4">
            <h2 className="text-sm font-semibold text-neutral-900">Comissão (snapshot)</h2>
            <p className="mt-1 text-xs text-neutral-600">
              Em bps: 100 = 1.00%. Ex: +25 bps = +0.25%.
            </p>

            <div className="mt-3 space-y-3">
              <div>
                <label className="block text-xs font-medium text-neutral-700">Multiplicador</label>
                <input
                  className="mt-1 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm"
                  placeholder="ex: 1.05"
                  value={commissionMultiplier}
                  onChange={(e) => setCommissionMultiplier(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-700">+ Bps</label>
                <input
                  className="mt-1 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm"
                  placeholder="ex: 25"
                  value={commissionAddBps}
                  onChange={(e) => setCommissionAddBps(e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Preview */}
        <div className="mt-6 rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
          <div className="text-sm font-medium text-neutral-900">Preview</div>
          <div className="mt-2 text-sm text-neutral-700">
            <div>Serviço: <span className="font-medium">{serviceType || "todos"}</span></div>
            <div>Status: <span className="font-medium">{subStatus || "todos"}</span></div>
            <div className="mt-2">
              Mensalidade:{" "}
              <span className="font-medium">
                {preview.pm ? `x${preview.pm}` : "—"}{" "}
                {preview.pa ? `+${preview.pa} cents` : ""}
              </span>
            </div>
            <div>
              Comissão:{" "}
              <span className="font-medium">
                {preview.cm ? `x${preview.cm}` : "—"}{" "}
                {preview.ca ? `+${preview.ca} bps` : ""}
              </span>
            </div>
          </div>
        </div>

        {err ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {err}
          </div>
        ) : null}

        {result ? (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            <div className="font-medium">Aplicado com sucesso</div>
            <div className="mt-1 text-xs">
              adjustment_id: <span className="font-mono">{String(result.adjustment_id)}</span>
              {" • "}
              updated_subscriptions: <span className="font-mono">{String(result.updated_subscriptions)}</span>
            </div>
          </div>
        ) : null}

        <button
          onClick={apply}
          disabled={running || !hasAnyAdjustment}
          className="mt-6 w-full rounded-xl bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {running ? "Aplicando…" : "Aplicar reajuste"}
        </button>

        <p className="mt-3 text-xs text-neutral-500">
          Segurança: esta ação altera os snapshots em massa. Use com cuidado.
        </p>
      </section>
    </main>
  );
}
