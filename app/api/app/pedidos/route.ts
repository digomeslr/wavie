/**
 * GET /api/app/pedidos?barraca_id=<uuid>&limit=50
 * Painel operacional — pedidos + itens com nome real do produto
 */
export async function GET(req: Request) {
    try {
      const supabase = supabaseAdmin();
      const { searchParams } = new URL(req.url);
  
      const barraca_id = searchParams.get("barraca_id");
      const limitRaw = searchParams.get("limit");
      const limit = Math.max(1, Math.min(Number(limitRaw ?? 50) || 50, 200));
  
      if (!barraca_id) {
        return NextResponse.json({ error: "barraca_id obrigatório" }, { status: 400 });
      }
  
      // 1) pedidos
      const { data: pedidos, error: pedidosErr } = await supabase
        .from("pedidos")
        .select("id,status,local,created_at,barraca_id")
        .eq("barraca_id", barraca_id)
        .order("created_at", { ascending: false })
        .limit(limit);
  
      if (pedidosErr) {
        return NextResponse.json({ error: pedidosErr.message }, { status: 500 });
      }
  
      if (!pedidos || pedidos.length === 0) {
        return NextResponse.json({ data: [] }, { status: 200 });
      }
  
      const pedidoIds = pedidos.map((p) => p.id);
  
      // 2) itens + nome do produto (JOIN correto)
      const { data: itens, error: itensErr } = await supabase
        .from("itens_pedido")
        .select(
          `
          pedido_id,
          quantidade,
          produtos (
            nome
          )
        `
        )
        .in("pedido_id", pedidoIds);
  
      if (itensErr) {
        return NextResponse.json({ error: itensErr.message }, { status: 500 });
      }
  
      // 3) agrupar itens por pedido
      const byPedido: Record<string, { name: string; quantity: number }[]> = {};
  
      for (const it of itens ?? []) {
        // 👇 produtos vem como ARRAY
        const produtoNome =
          Array.isArray(it.produtos) && it.produtos.length > 0
            ? it.produtos[0].nome
            : "Produto";
  
        const item = {
          name: produtoNome,
          quantity: it.quantidade ?? 1,
        };
  
        if (!byPedido[it.pedido_id]) byPedido[it.pedido_id] = [];
        byPedido[it.pedido_id].push(item);
      }
  
      // 4) payload final
      const enriched = pedidos.map((p) => ({
        ...p,
        items: byPedido[p.id] ?? [],
      }));
  
      return NextResponse.json({ data: enriched }, { status: 200 });
    } catch (e: any) {
      return NextResponse.json({ error: e?.message ?? "Erro inesperado" }, { status: 500 });
    }
  }
  