// app/api/app/pedidos/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PedidoRow = {
  id: string;
  status: string;
  local: string | null;
  total: number | null;
  created_at: string;
  barraca_id: string;
};

function getEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const barracaId = url.searchParams.get("barraca_id");
    const limitRaw = url.searchParams.get("limit");
    const limit = Math.min(Math.max(Number(limitRaw ?? 20), 1), 50);

    if (!barracaId) {
      return NextResponse.json(
        { error: "barraca_id is required" },
        { status: 400 }
      );
    }

    const supabaseUrl = getEnv("NEXT_PUBLIC_SUPABASE_URL");
    const serviceRole = getEnv("SUPABASE_SERVICE_ROLE_KEY");

    const supabase = createClient(supabaseUrl, serviceRole, {
      auth: { persistSession: false },
    });

    const { data, error } = await supabase
      .from("pedidos")
      .select("id,status,local,total,created_at,barraca_id")
      .eq("barraca_id", barracaId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: (data ?? []) as PedidoRow[] });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "unknown error" },
      { status: 500 }
    );
  }
}
