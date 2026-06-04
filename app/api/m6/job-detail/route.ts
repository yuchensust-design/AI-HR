/**
 * POST /api/m6/job-detail — 单岗位详情(JD 全文)
 *
 * Body: { jobId: string, platform: 'boss' | '51job' }
 * Resp: { jdText: string, job: Job, cached?: boolean }
 */

import { NextRequest, NextResponse } from "next/server";

const CRAWLER_BASE_URL = process.env.CRAWLER_BASE_URL ?? "http://localhost:3030";
const CRAWLER_API_KEY = process.env.CRAWLER_API_KEY ?? "dev-secret-change-me";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const jobId = typeof body.jobId === "string" ? body.jobId : "";
    const platform = body.platform as string;

    if (!jobId || !platform) {
      return NextResponse.json(
        { error: "jobId and platform required" },
        { status: 400 }
      );
    }

    const upstream = await fetch(`${CRAWLER_BASE_URL}/detail`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": CRAWLER_API_KEY,
      },
      body: JSON.stringify({ jobId, platform }),
      signal: AbortSignal.timeout(55_000),
    });

    if (!upstream.ok) {
      const text = await upstream.text();
      return NextResponse.json(
        {
          error: "crawler unavailable",
          status: upstream.status,
          detail: text.slice(0, 500),
        },
        { status: 503 }
      );
    }

    const data = await upstream.json();
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("/api/m6/job-detail error:", err);
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
