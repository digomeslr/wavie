"use client";

export default function UnlockButtonClient({
  invoiceId,
  action,
}: {
  invoiceId: string;
  action: (formData: FormData) => Promise<void>;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        const reason = window.prompt("Motivo para desbloquear esta fatura (obrigatório):");
        if (!reason || reason.trim().length < 5) {
          e.preventDefault();
          alert("Motivo obrigatório (mínimo 5 caracteres).");
          return;
        }

        const form = e.currentTarget as HTMLFormElement;
        const input = form.querySelector('input[name="reason"]') as HTMLInputElement | null;
        if (input) input.value = reason.trim();
      }}
    >
      <input type="hidden" name="invoice_id" value={invoiceId} />
      <input type="hidden" name="reason" value="" />

      <button
        type="submit"
        style={{
          padding: "10px 14px",
          borderRadius: 12,
          border: "1px solid rgba(0,0,0,0.15)",
          background: "white",
          cursor: "pointer",
          fontWeight: 900,
          minWidth: 200,
        }}
        title="Override auditável: exige motivo e registra log"
      >
        🔓 Desbloquear (override)
      </button>
    </form>
  );
}
