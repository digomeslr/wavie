"use client";

import { useMemo, useState, useTransition } from "react";

function centsToBRLString(cents: number) {
  const v = (cents ?? 0) / 100;
  // retorna "123,45"
  return v.toFixed(2).replace(".", ",");
}

export default function RegisterPaymentModalClient({
  invoiceId,
  defaultAmountCents,
  action,
}: {
  invoiceId: string;
  defaultAmountCents: number;
  action: (formData: FormData) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const defaultAmount = useMemo(() => centsToBRLString(defaultAmountCents), [defaultAmountCents]);

  function close() {
    setOpen(false);
    setError(null);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          padding: "10px 12px",
          borderRadius: 12,
          border: "1px solid rgba(0,0,0,0.15)",
          background: "black",
          color: "white",
          cursor: "pointer",
          fontSize: 13,
        }}
      >
        Registrar pagamento
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "grid",
            placeItems: "center",
            padding: 16,
            zIndex: 50,
          }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div
            style={{
              width: "min(560px, 100%)",
              background: "white",
              borderRadius: 18,
              padding: 14,
              border: "1px solid rgba(0,0,0,0.12)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800 }}>Registrar pagamento</div>
                <div style={{ fontSize: 12, opacity: 0.75 }}>Invoice: {invoiceId}</div>
              </div>
              <button
                onClick={close}
                style={{
                  padding: "8px 10px",
                  borderRadius: 12,
                  border: "1px solid rgba(0,0,0,0.15)",
                  background: "white",
                  cursor: "pointer",
                }}
              >
                Fechar
              </button>
            </div>

            <div style={{ height: 10 }} />

            <form
              action={(formData) => {
                setError(null);
                startTransition(async () => {
                  const res = await action(formData);
                  if (!res.ok) {
                    setError(res.error ?? "Erro ao registrar pagamento.");
                    return;
                  }
                  close();
                });
              }}
              style={{ display: "grid", gap: 10 }}
            >
              <input type="hidden" name="invoice_id" value={invoiceId} />

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 12, opacity: 0.75 }}>Método</span>
                  <select
                    name="method"
                    defaultValue="pix"
                    style={{
                      padding: "10px 10px",
                      borderRadius: 12,
                      border: "1px solid rgba(0,0,0,0.15)",
                      background: "white",
                    }}
                  >
                    <option value="pix">PIX</option>
                    <option value="transfer">Transferência</option>
                    <option value="cash">Dinheiro</option>
                    <option value="card_manual">Cartão (manual)</option>
                    <option value="other">Outro</option>
                    <option value="stripe">Stripe (futuro)</option>
                  </select>
                </label>

                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 12, opacity: 0.75 }}>Valor (R$)</span>
                  <input
                    name="amount"
                    defaultValue={defaultAmount}
                    placeholder="Ex: 199,90"
                    style={{
                      padding: "10px 10px",
                      borderRadius: 12,
                      border: "1px solid rgba(0,0,0,0.15)",
                    }}
                  />
                </label>
              </div>

              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, opacity: 0.75 }}>Data/hora do pagamento (opcional)</span>
                <input
                  name="paid_at"
                  type="datetime-local"
                  style={{
                    padding: "10px 10px",
                    borderRadius: 12,
                    border: "1px solid rgba(0,0,0,0.15)",
                  }}
                />
              </label>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 12, opacity: 0.75 }}>Referência (txid/NSU/comprovante)</span>
                  <input
                    name="reference"
                    placeholder="Opcional"
                    style={{
                      padding: "10px 10px",
                      borderRadius: 12,
                      border: "1px solid rgba(0,0,0,0.15)",
                    }}
                  />
                </label>

                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 12, opacity: 0.75 }}>Notas</span>
                  <input
                    name="notes"
                    placeholder="Opcional"
                    style={{
                      padding: "10px 10px",
                      borderRadius: 12,
                      border: "1px solid rgba(0,0,0,0.15)",
                    }}
                  />
                </label>
              </div>

              {error && (
                <div
                  style={{
                    padding: 10,
                    borderRadius: 12,
                    border: "1px solid rgba(255,0,0,0.25)",
                    background: "rgba(255,0,0,0.06)",
                    color: "rgba(120,0,0,1)",
                    fontSize: 13,
                  }}
                >
                  {error}
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button
                  type="button"
                  onClick={close}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid rgba(0,0,0,0.15)",
                    background: "white",
                    cursor: "pointer",
                  }}
                  disabled={isPending}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  style={{
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid rgba(0,0,0,0.15)",
                    background: "black",
                    color: "white",
                    cursor: "pointer",
                  }}
                  disabled={isPending}
                >
                  {isPending ? "Salvando..." : "Confirmar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
