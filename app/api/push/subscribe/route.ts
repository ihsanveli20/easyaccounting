import { NextResponse } from "next/server";
import {
  listPushSubscriptions,
  removePushSubscription,
  upsertPushSubscription,
} from "../../../utils/pushStore";

export async function GET() {
  try {
    const { subscriptions, tableMissing } = await listPushSubscriptions();
    return NextResponse.json({
      success: true,
      tableMissing,
      vapidPublicKey:
        process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
        process.env.VAPID_PUBLIC_KEY ||
        "",
      count: subscriptions.length,
      subscriptions: subscriptions.map((s) => ({
        user_id: s.user_id,
        user_name: s.user_name || "Kullanıcı",
        phone: s.phone || "",
        endpoint: s.endpoint,
        updated_at: s.updated_at,
      })),
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Liste alınamadı." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const subscription = body?.subscription;
    const endpoint = String(subscription?.endpoint || "").trim();
    const p256dh = String(subscription?.keys?.p256dh || "").trim();
    const auth = String(subscription?.keys?.auth || "").trim();

    if (!endpoint || !p256dh || !auth) {
      return NextResponse.json(
        { success: false, error: "Geçersiz Web Push abonelik verisi." },
        { status: 400 }
      );
    }

    const res = await upsertPushSubscription({
      user_id: String(body.userId || "anonymous"),
      user_name: body.userName ? String(body.userName).trim() : null,
      phone: body.phone ? String(body.phone).trim() : null,
      endpoint,
      p256dh,
      auth,
    });

    return NextResponse.json({
      success: true,
      tableMissing: res.tableMissing,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Abonelik kaydedilemedi." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const endpoint = String(body?.endpoint || "").trim();
    if (!endpoint) {
      return NextResponse.json({ success: false, error: "Endpoint eksik." }, { status: 400 });
    }
    await removePushSubscription(endpoint);
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Abonelik silinemedi." },
      { status: 500 }
    );
  }
}

