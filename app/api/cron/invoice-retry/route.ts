import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({
    ok: true,
    worker: "invoice-retry",
    status: "idle",
  });
}
