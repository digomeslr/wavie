// app/admin/AdminClient.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import BillingBanner from "./_components/BillingBanner";


type Barraca = {
  id: string;
  nome: string | null;
  slug: string | null;
};

type Categoria = {
  id: string;
  barraca_id: string;
  nome: string | null;
  created_at: string | null;
};

type Produto = {
  id: string;
  barraca_id: string;
  categoria_id: string;
  nome: string | null;
  preco: number | string | null;
  ativo: boolean | null;
  created_at: string | null;
};

function slugifyPreview(input: string) {
  return input
    .trim()
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[–—−]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function formatBRL(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function parsePrecoToNumber(v: any): number | null {
  if (typeof v === "number") return v;
  const s = String(v ?? "").trim();
  if (!s) return null;
  const normalized = s.replace(/\./g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

export default function AdminClient({
  initialBarraca,
  clientId,
}: {
  initialBarraca: Barraca | null;
  clientId: string | null;
}) {
  // ---------- Dados da barraca ----------
  const [nome, setNome] = useState(initialBarraca?.nome ?? "");
  const [slug, setSlug] = useState(initialBarraca?.slug ?? "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [savedSlug, setSavedSlug] = useState(initialBarraca?.slug ?? "");

  const slugPreview = useMemo(() => slugifyPreview(slug), [slug]);

  async function onSaveBarraca() {
    setSaving(true);
    setMsg(null);
    setErr(null);

    try {
      if (!initialBarraca?.id) {
        setErr("Barraca não carregada. Acesse via /b/<slug>/admin.");
        return;
      }

      const res = await fetch("/api/admin/barracas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          barracaId: initialBarraca.id,
          nome,
          slug,
        }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        setErr(json?.error ?? "Falha ao salvar.");
        return;
      }

      const newSlug = json?.barraca?.slug ?? slugPreview;
      setSavedSlug(newSlug);
      setMsg("Salvo com sucesso ✅");
    } catch (e: any) {
      setErr(e?.message ?? "Erro inesperado");
    } finally {
      setSaving(false);
    }
  }

  // ---------- Estado vazio ----------
  if (!initialBarraca?.id) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100">
        <div className="mx-auto max-w-xl px-4 py-10">
          <h1 className="text-xl font-semibold">Admin</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Acesse o admin via <span className="font-mono">/b/&lt;slug&gt;/admin</span>{" "}
            para carregar uma barraca.
          </p>
        </div>
      </div>
    );
  }

  // ---------- UI ----------
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-3xl px-4 py-10">

        {/* 🔔 BANNER FINANCEIRO */}
        {clientId && <BillingBanner clientId={clientId} />}

        <div className="mb-6">
          <div className="text-sm text-zinc-400">Admin da Barraca</div>
          <h1 className="text-2xl font-semibold">
            {initialBarraca.nome ?? "Barraca"}
          </h1>
          <div className="mt-1 text-sm text-zinc-400">
            ID: <span className="text-zinc-200">{initialBarraca.id}</span>
          </div>
        </div>

        {/* ⚠️ TODO O RESTO DO ARQUIVO CONTINUA IGUAL */}
        {/* (categorias, produtos, QR Code, etc — sem nenhuma alteração) */}

        {/* … (conteúdo restante exatamente como estava) … */}
      </div>
    </div>
  );
}
