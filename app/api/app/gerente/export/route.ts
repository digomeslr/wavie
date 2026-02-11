import { supabaseAdmin } from "@/lib/supabaseAdmin";

function startOfTodayISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function sinceHoursISO(hours: number) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function sinceDaysISO(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function csvEscape(v: any) {
  const s = String(v ?? "");
  if (s.includes('"') || s.includes(",") || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const barraca_id = searchParams.get("barraca_id");
  const range = (searchParams.get("range") ?? "today").toLowerCase() as "today" | "24h" | "7d";

  if (!barraca_id) {
    return new Response("barraca_id obrigatório", { status: 400 });
  }

  const since =
    range === "24h" ? sinceHoursISO(24) : range === "7d" ? sinceDaysISO(7) : startOfTodayISO();

  const supabase = supabaseAdmin();

  const { data: pedidos, error } = await supabase
    .from("pedidos")
    .select("id,status,local,total,created_at")
    .eq("barraca_id", barraca_id)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(10000);

  if (error) {
    return new Response(error.message, { status: 500 });
  }

  const header = ["id", "status", "local", "total", "created_at"];
  const lines = [header.join(",")];

  for (const p of (pedidos ?? []) as any[]) {
    lines.push(
      [
        csvEscape(p.id),
        csvEscape(p.status),
        csvEscape(p.local),
        csvEscape(p.total),
        csvEscape(p.created_at),
      ].join(",")
    );
  }

  const csv = lines.join("\n");
  const filename = `wavie_pedidos_${range}_${new Date().toISOString().slice(0, 10)}.csv`;

  return new Response(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
