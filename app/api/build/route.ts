import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      commit:
        process.env.VERCEL_GIT_COMMIT_SHA ||
        process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ||
        null,
      branch: process.env.VERCEL_GIT_COMMIT_REF || null,
      repo: process.env.VERCEL_GIT_REPO_SLUG || null,
      env: process.env.VERCEL_ENV || null, // production / preview / development
      buildId: process.env.NEXT_BUILD_ID || null,
      now: new Date().toISOString(),
    },
    { headers: { "cache-control": "no-store" } }
  );
}
