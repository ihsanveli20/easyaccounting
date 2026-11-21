import { NextResponse } from "next/server";
import crypto from "crypto";

// Meta WhatsApp Webhook Verification (GET)
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const expectedToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || "";

  if (mode === "subscribe" && expectedToken && token === expectedToken && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: "Webhook verification failed" }, { status: 403 });
}

// Incoming Webhook Receiver with HMAC-SHA256 Signature Check (POST)
export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const sigHeader =
      request.headers.get("x-hub-signature-256") ||
      request.headers.get("x-webhook-signature") ||
      "";
    const appSecret = process.env.WEBHOOK_SIGNING_SECRET || "";

    if (appSecret) {
      const expected =
        "sha256=" +
        crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
      const sigBuf = Buffer.from(sigHeader);
      const expBuf = Buffer.from(expected);
      if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
        return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
      }
    }

    return NextResponse.json({ received: true });
  } catch {
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 400 });
  }
}

