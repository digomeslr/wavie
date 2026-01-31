// app/admin/AdminClient.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";

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
}: {
  initialBarraca: Barraca | null;
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

  // ---------- Categorias ----------
  const [cats, setCats] = useState<Categoria[]>([]);
  const [catsLoading, setCatsLoading] = useState(false);
  const [catsErr, setCatsErr] = useState<string | null>(null);

  const [newCatName, setNewCatName] = useState("");
  const [creatingCat, setCreatingCat] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  async function loadCategorias() {
    if (!initialBarraca?.id) return;
    setCatsLoading(true);
    setCatsErr(null);

    try {
      const res = await fetch(`/api/admin/categorias?b=${initialBarraca.id}`, {
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCatsErr(json?.error ?? "Falha ao carregar categorias.");
        return;
      }
      setCats(json?.categorias ?? []);
    } catch (e: any) {
      setCatsErr(e?.message ?? "Erro inesperado ao carregar categorias.");
    } finally {
      setCatsLoading(false);
    }
  }

  async function createCategoria() {
    if (!initialBarraca?.id) return;
    const nome = newCatName.trim();
    if (!nome) return;

    setCreatingCat(true);
    setCatsErr(null);

    try {
      const res = await fetch("/api/admin/categorias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          barracaId: initialBarraca.id,
          nome,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCatsErr(json?.error ?? "Falha ao criar categoria.");
        return;
      }

      setNewCatName("");
      await loadCategorias();
    } catch (e: any) {
      setCatsErr(e?.message ?? "Erro inesperado ao criar categoria.");
    } finally {
      setCreatingCat(false);
    }
  }

  function startEdit(cat: Categoria) {
    setEditingId(cat.id);
    setEditingName(cat.nome ?? "");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditingName("");
  }

  async function saveEdit(cat: Categoria) {
    if (!initialBarraca?.id) return;

    const nome = editingName.trim();
    if (!nome) return;

    try {
      const res = await fetch("/api/admin/categorias", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          barracaId: initialBarraca.id,
          id: cat.id,
          nome,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCatsErr(json?.error ?? "Falha ao salvar edição.");
        return;
      }

      cancelEdit();
      await loadCategorias();
    } catch (e: any) {
      setCatsErr(e?.message ?? "Erro inesperado ao salvar edição.");
    }
  }

  useEffect(() => {
    if (initialBarraca?.id) loadCategorias();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialBarraca?.id]);

  // ---------- Produtos ----------
  const [prodErr, setProdErr] = useState<string | null>(null);
  const [prodLoading, setProdLoading] = useState(false);
  const [produtos, setProdutos] = useState<Produto[]>([]);

  const [filterCatId, setFilterCatId] = useState<string>("");

  const [newProdCatId, setNewProdCatId] = useState<string>("");
  const [newProdNome, setNewProdNome] = useState<string>("");
  const [newProdPreco, setNewProdPreco] = useState<string>("");
  const [creatingProd, setCreatingProd] = useState(false);

  const [editProdId, setEditProdId] = useState<string | null>(null);
  const [editProdNome, setEditProdNome] = useState<string>("");
  const [editProdPreco, setEditProdPreco] = useState<string>("");
  const [editProdCatId, setEditProdCatId] = useState<string>("");

  async function loadProdutos() {
    if (!initialBarraca?.id) return;
    setProdLoading(true);
    setProdErr(null);

    try {
      const url =
        `/api/admin/produtos?b=${initialBarraca.id}` +
        (filterCatId ? `&categoria=${filterCatId}` : "");

      const res = await fetch(url, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        setProdErr(json?.error ?? "Falha ao carregar produtos.");
        return;
      }

      setProdutos(json?.produtos ?? []);
    } catch (e: any) {
      setProdErr(e?.message ?? "Erro inesperado ao carregar produtos.");
    } finally {
      setProdLoading(false);
    }
  }

  async function createProduto() {
    if (!initialBarraca?.id) return;

    setProdErr(null);

    const nome = newProdNome.trim();
    const precoNum = parsePrecoToNumber(newProdPreco);

    if (!newProdCatId) {
      setProdErr("Escolha uma categoria para o produto.");
      return;
    }
    if (!nome) {
      setProdErr("Nome do produto é obrigatório.");
      return;
    }
    if (precoNum === null) {
      setProdErr("Preço inválido. Ex: 12,50");
      return;
    }

    setCreatingProd(true);

    try {
      const res = await fetch("/api/admin/produtos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          barracaId: initialBarraca.id,
          categoriaId: newProdCatId,
          nome,
          preco: precoNum,
          ativo: true,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setProdErr(json?.error ?? "Falha ao criar produto.");
        return;
      }

      setNewProdNome("");
      setNewProdPreco("");
      await loadProdutos();
    } catch (e: any) {
      setProdErr(e?.message ?? "Erro inesperado ao criar produto.");
    } finally {
      setCreatingProd(false);
    }
  }

  function startEditProduto(p: Produto) {
    setEditProdId(p.id);
    setEditProdNome(p.nome ?? "");
    setEditProdCatId(p.categoria_id ?? "");
    const precoNum = parsePrecoToNumber(p.preco);
    setEditProdPreco(precoNum !== null ? String(precoNum).replace(".", ",") : "");
  }

  function cancelEditProduto() {
    setEditProdId(null);
    setEditProdNome("");
    setEditProdPreco("");
    setEditProdCatId("");
  }

  async function saveEditProduto(p: Produto) {
    if (!initialBarraca?.id) return;

    const nome = editProdNome.trim();
    const precoNum = parsePrecoToNumber(editProdPreco);

    if (!editProdCatId) {
      setProdErr("Escolha uma categoria.");
      return;
    }
    if (!nome) {
      setProdErr("Nome é obrigatório.");
      return;
    }
    if (precoNum === null) {
      setProdErr("Preço inválido.");
      return;
    }

    setProdErr(null);

    try {
      const res = await fetch("/api/admin/produtos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          barracaId: initialBarraca.id,
          id: p.id,
          categoriaId: editProdCatId,
          nome,
          preco: precoNum,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setProdErr(json?.error ?? "Falha ao salvar produto.");
        return;
      }

      cancelEditProduto();
      await loadProdutos();
    } catch (e: any) {
      setProdErr(e?.message ?? "Erro inesperado ao salvar produto.");
    }
  }

  async function toggleProdutoAtivo(p: Produto) {
    if (!initialBarraca?.id) return;

    const nextAtivo = !(p.ativo ?? true);

    setProdutos((prev) =>
      prev.map((x) => (x.id === p.id ? { ...x, ativo: nextAtivo } : x))
    );

    try {
      const res = await fetch("/api/admin/produtos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          barracaId: initialBarraca.id,
          id: p.id,
          ativo: nextAtivo,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setProdutos((prev) =>
          prev.map((x) => (x.id === p.id ? { ...x, ativo: p.ativo } : x))
        );
        setProdErr(json?.error ?? "Falha ao atualizar ativo.");
        return;
      }
    } catch (e: any) {
      setProdutos((prev) =>
        prev.map((x) => (x.id === p.id ? { ...x, ativo: p.ativo } : x))
      );
      setProdErr(e?.message ?? "Erro inesperado ao atualizar ativo.");
    }
  }

  useEffect(() => {
    if (initialBarraca?.id) loadProdutos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialBarraca?.id]);

  useEffect(() => {
    if (initialBarraca?.id) loadProdutos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterCatId]);

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

  const catsById = useMemo(() => {
    const m = new Map<string, Categoria>();
    for (const c of cats) m.set(c.id, c);
    return m;
  }, [cats]);

  const catsSorted = useMemo(() => {
    return [...cats].sort((a, b) => (a.nome ?? "").localeCompare(b.nome ?? ""));
  }, [cats]);

  const canCreateProduct = cats.length > 0;

  // ---------- UI ----------
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className="mb-6">
          <div className="text-sm text-zinc-400">Admin da Barraca</div>
          <h1 className="text-2xl font-semibold">{initialBarraca.nome ?? "Barraca"}</h1>
          <div className="mt-1 text-sm text-zinc-400">
            ID: <span className="text-zinc-200">{initialBarraca.id}</span>
          </div>
        </div>

        {/* Dados da barraca */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="text-lg font-semibold">Dados da barraca</h2>

          <div className="mt-4 grid gap-4">
            <div>
              <label className="text-sm text-zinc-300">Nome</label>
              <input
                className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-600"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex: Barraca do João"
              />
            </div>

            <div>
              <label className="text-sm text-zinc-300">Slug (URL)</label>
              <input
                className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm font-mono outline-none focus:border-zinc-600"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="Ex: barraca-do-joao"
              />
              <div className="mt-2 text-xs text-zinc-400">
                Prévia: <span className="font-mono text-zinc-200">/b/{slugPreview}</span>
              </div>
            </div>

            {err && (
              <div className="rounded-xl border border-red-900/40 bg-red-950/30 p-3 text-sm text-red-200">
                {err}
              </div>
            )}
            {msg && (
              <div className="rounded-xl border border-emerald-900/40 bg-emerald-950/30 p-3 text-sm text-emerald-200">
                {msg}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <button
                onClick={onSaveBarraca}
                disabled={saving}
                className="rounded-xl bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-900 disabled:opacity-60"
              >
                {saving ? "Salvando..." : "Salvar"}
              </button>

              <Link
                className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2 text-sm hover:bg-zinc-900"
                href={`/b/${savedSlug}/admin`}
              >
                Abrir admin pela URL (slug)
              </Link>

              <Link
                className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2 text-sm hover:bg-zinc-900"
                href={`/b/${savedSlug}`}
              >
                Abrir menu público
              </Link>

              <Link
                className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2 text-sm hover:bg-zinc-900"
                href={`/b/${savedSlug}/painel`}
              >
                Abrir painel operacional
              </Link>
            </div>
          </div>
        </div>

        {/* Categorias */}
        <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Categorias</h2>
            <button
              onClick={loadCategorias}
              className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs hover:bg-zinc-900"
            >
              Recarregar
            </button>
          </div>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <input
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-600"
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              placeholder="Nova categoria (ex: Bebidas)"
            />
            <button
              onClick={createCategoria}
              disabled={creatingCat || !newCatName.trim()}
              className="rounded-xl bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-900 disabled:opacity-60"
            >
              {creatingCat ? "Criando..." : "Criar"}
            </button>
          </div>

          {catsErr && (
            <div className="mt-3 rounded-xl border border-red-900/40 bg-red-950/30 p-3 text-sm text-red-200">
              {catsErr}
            </div>
          )}

          <div className="mt-4">
            {catsLoading ? (
              <div className="text-sm text-zinc-400">Carregando categorias...</div>
            ) : cats.length === 0 ? (
              <div className="text-sm text-zinc-400">Nenhuma categoria ainda. Crie a primeira acima.</div>
            ) : (
              <div className="space-y-2">
                {cats.map((cat) => {
                  const isEditing = editingId === cat.id;

                  return (
                    <div
                      key={cat.id}
                      className="flex flex-col gap-2 rounded-xl border border-zinc-800 bg-zinc-950/40 p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex-1">
                        {isEditing ? (
                          <input
                            className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-600"
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                          />
                        ) : (
                          <div className="text-sm text-zinc-100">{cat.nome ?? "Sem nome"}</div>
                        )}
                        <div className="mt-1 text-xs font-mono text-zinc-500">{cat.id}</div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {isEditing ? (
                          <>
                            <button
                              onClick={() => saveEdit(cat)}
                              disabled={!editingName.trim()}
                              className="rounded-xl bg-zinc-100 px-3 py-2 text-xs font-semibold text-zinc-900 disabled:opacity-60"
                            >
                              Salvar
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs hover:bg-zinc-900"
                            >
                              Cancelar
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => startEdit(cat)}
                            className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs hover:bg-zinc-900"
                          >
                            Editar
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="mt-4 text-xs text-zinc-500">
            (Ativar/desativar e ordenação entram em um próximo passo.)
          </div>
        </div>

        {/* Produtos */}
        <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Produtos</h2>
            <button
              onClick={loadProdutos}
              className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs hover:bg-zinc-900"
            >
              Recarregar
            </button>
          </div>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="text-sm text-zinc-300">Filtrar por categoria</div>
            <select
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-600 sm:w-72"
              value={filterCatId}
              onChange={(e) => setFilterCatId(e.target.value)}
            >
              <option value="">Todas</option>
              {catsSorted.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome ?? "Sem nome"}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
            <div className="text-sm font-semibold">Novo produto</div>

            {!canCreateProduct ? (
              <div className="mt-2 text-sm text-zinc-400">
                Crie pelo menos uma categoria antes de cadastrar produtos.
              </div>
            ) : (
              <div className="mt-3 grid gap-2 sm:grid-cols-4">
                <select
                  className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-600"
                  value={newProdCatId}
                  onChange={(e) => setNewProdCatId(e.target.value)}
                >
                  <option value="">Categoria</option>
                  {catsSorted.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome ?? "Sem nome"}
                    </option>
                  ))}
                </select>

                <input
                  className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-600 sm:col-span-2"
                  placeholder="Nome do produto (ex: Água 500ml)"
                  value={newProdNome}
                  onChange={(e) => setNewProdNome(e.target.value)}
                />

                <input
                  className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-600"
                  placeholder="Preço (ex: 12,50)"
                  value={newProdPreco}
                  onChange={(e) => setNewProdPreco(e.target.value)}
                />

                <div className="sm:col-span-4">
                  <button
                    onClick={createProduto}
                    disabled={creatingProd}
                    className="rounded-xl bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-900 disabled:opacity-60"
                  >
                    {creatingProd ? "Criando..." : "Criar produto"}
                  </button>
                </div>
              </div>
            )}
          </div>

          {prodErr && (
            <div className="mt-3 rounded-xl border border-red-900/40 bg-red-950/30 p-3 text-sm text-red-200">
              {prodErr}
            </div>
          )}

          <div className="mt-4">
            {prodLoading ? (
              <div className="text-sm text-zinc-400">Carregando produtos...</div>
            ) : produtos.length === 0 ? (
              <div className="text-sm text-zinc-400">Nenhum produto ainda.</div>
            ) : (
              <div className="space-y-2">
                {produtos.map((p) => {
                  const ativo = p.ativo ?? true;
                  const isEditing = editProdId === p.id;

                  const catName = catsById.get(p.categoria_id)?.nome ?? "Sem categoria";
                  const precoNum = parsePrecoToNumber(p.preco) ?? 0;

                  return (
                    <div key={p.id} className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex-1">
                          {isEditing ? (
                            <div className="grid gap-2 sm:grid-cols-4">
                              <select
                                className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-600"
                                value={editProdCatId}
                                onChange={(e) => setEditProdCatId(e.target.value)}
                              >
                                <option value="">Categoria</option>
                                {catsSorted.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.nome ?? "Sem nome"}
                                  </option>
                                ))}
                              </select>

                              <input
                                className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-600 sm:col-span-2"
                                value={editProdNome}
                                onChange={(e) => setEditProdNome(e.target.value)}
                              />

                              <input
                                className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-600"
                                value={editProdPreco}
                                onChange={(e) => setEditProdPreco(e.target.value)}
                              />
                            </div>
                          ) : (
                            <>
                              <div className="text-sm">
                                <span className={ativo ? "text-zinc-100" : "text-zinc-400 line-through"}>
                                  {p.nome ?? "Sem nome"}
                                </span>
                                {!ativo && <span className="ml-2 text-xs text-zinc-500">(inativo)</span>}
                              </div>
                              <div className="mt-1 text-xs text-zinc-400">
                                {catName} •{" "}
                                <span className="font-semibold text-zinc-200">{formatBRL(precoNum)}</span>
                              </div>
                            </>
                          )}
                          <div className="mt-1 text-xs font-mono text-zinc-500">{p.id}</div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {isEditing ? (
                            <>
                              <button
                                onClick={() => saveEditProduto(p)}
                                className="rounded-xl bg-zinc-100 px-3 py-2 text-xs font-semibold text-zinc-900"
                              >
                                Salvar
                              </button>
                              <button
                                onClick={cancelEditProduto}
                                className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs hover:bg-zinc-900"
                              >
                                Cancelar
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => startEditProduto(p)}
                                className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs hover:bg-zinc-900"
                              >
                                Editar
                              </button>
                              <button
                                onClick={() => toggleProdutoAtivo(p)}
                                className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs hover:bg-zinc-900"
                              >
                                {ativo ? "Desativar" : "Ativar"}
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="mt-4 text-xs text-zinc-500">
            Produtos inativos não aparecem no menu público.
          </div>
        </div>

        {/* QR Code */}
        <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="text-lg font-semibold">QR Code</h2>

          <div className="mt-2 text-sm text-zinc-300">
            URL pública da barraca:
            <div className="mt-2 rounded-xl border border-zinc-800 bg-zinc-950 p-3 font-mono text-xs text-zinc-200 break-all">
              {typeof window !== "undefined"
                ? `${window.location.origin}/b/${savedSlug}`
                : `/b/${savedSlug}`}
            </div>
          </div>

          <QrBox slug={savedSlug} />
        </div>

        {/* Próximos blocos */}
        <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="text-lg font-semibold">Próximos blocos</h2>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-zinc-300">
            <li>Ordenação de categorias e produtos</li>
            <li>Controle de acesso (login)</li>
            <li>Mapa do PraiaPay (super admin)</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function QrBox({ slug }: { slug: string }) {
  const [dataUrl, setDataUrl] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function run() {
      setErr(null);
      try {
        const origin = window.location.origin;
        const url = `${origin}/b/${slug}`;

        const png = await QRCode.toDataURL(url, {
          errorCorrectionLevel: "M",
          margin: 2,
          scale: 8,
        });

        if (mounted) setDataUrl(png);
      } catch (e: any) {
        if (mounted) setErr(e?.message ?? "Falha ao gerar QR Code");
      }
    }

    run();
    return () => {
      mounted = false;
    };
  }, [slug]);

  function download() {
    if (!dataUrl) return;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `praiapay-${slug}.png`;
    a.click();
  }

  return (
    <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="rounded-2xl border border-zinc-800 bg-white p-4 w-fit">
        {dataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={dataUrl} alt="QR Code" className="h-44 w-44" />
        ) : (
          <div className="h-44 w-44 flex items-center justify-center text-sm text-zinc-500">
            Gerando…
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <button
          onClick={download}
          disabled={!dataUrl}
          className="rounded-xl bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-900 disabled:opacity-60"
        >
          Baixar PNG
        </button>

        {err && (
          <div className="rounded-xl border border-red-900/40 bg-red-950/30 p-3 text-sm text-red-200">
            {err}
          </div>
        )}

        <div className="text-xs text-zinc-500">
          Dica: imprima e cole na mesa/guarda-sol. O cliente aponta a câmera e abre o cardápio.
        </div>
      </div>
    </div>
  );
}
