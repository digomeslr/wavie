import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(req: Request) {
  // segurança básica: precisa estar logado e ser wavie_admin
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle<{ role: string | null }>();

  if (profile?.role !== "wavie_admin") {
    return new NextResponse("Forbidden", { status: 403 });
  }

  // parâmetros
  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month"); // YYYY-MM

  let q = supabase
    .from("invoices")
    .select(
      `
      month,
      orders_count,
      gross_cents,
      wavie_fee_cents,
      status,
      clients (
        name,
        slug,
        service_type
      )
    `
    )
    .order("month", { ascending: false });

  if (month) {
    q = q.eq("month", `${month}-01`);
  }

  const { data, error } = await q;

  if (error) {
    return new NextResponse(error.message, { status: 500 });
  }

  // montar CSV
  const header = [
    "month",
    "client_name",
    "client_slug",
    "service_type",
    "orders_count",
    "gross_brl",
    "wavie_fee_brl",
    "status",
  ];

  const rows =
    data?.map((r: any) => [
      r.month,
      r.clients?.name ?? "",
      r.clients?.slug ?? "",
      r.clients?.service_type ?? "",
      r.orders_count,
      (Number(r.gross_cents) / 100).toFixed(2),
      (Number(r.wavie_fee_cents) / 100).toFixed(2),
      r.status,
    ]) ?? [];

  const csv =
    [header, ...rows]
      .map((row) =>
        row
          .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
          .join(",")
      )
      .join("\n") + "\n";

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="wavie-invoices-${
        month ?? "all"
      }.csv"`,
    },
  });
}
