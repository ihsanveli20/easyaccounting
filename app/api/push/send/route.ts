import { NextResponse } from "next/server";
import { sendNotification, setVapidDetails } from "web-push";
import {
  listPushSubscriptions,
  removePushSubscription,
} from "../../../utils/pushStore";

function normalizeDigits(phone: string): string {
  return (phone || "").replace(/\D/g, "").replace(/^0+/, "");
}

export async function POST(request: Request) {
  const publicKey =
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const rawSubject = process.env.VAPID_SUBJECT || "mailto:bildirim@hesapplani.com";
  const subject = rawSubject.endsWith(".local")
    ? "mailto:bildirim@hesapplani.com"
    : rawSubject;

  if (!publicKey || !privateKey) {
    return NextResponse.json(
      { success: false, error: "VAPID anahtarları (.env.local) yapılandırılmamış." },
      { status: 500 }
    );
  }

  setVapidDetails(subject, publicKey, privateKey);

  try {
    const body = await request.json();
    const title = String(body.title || "Yeni Bildirim").trim();
    const message = String(body.body || "").trim();
    const url = String(body.url || "/").trim();
    const targetUserId = body.targetUserId ? String(body.targetUserId).trim() : "";
    const targetPhone = body.targetPhone ? String(body.targetPhone).trim() : "";

    if (!message) {
      return NextResponse.json(
        { success: false, error: "Bildirim mesajı boş olamaz." },
        { status: 400 }
      );
    }

    const { subscriptions } = await listPushSubscriptions();
    let targets = subscriptions;

    if (targetUserId) {
      targets = targets.filter((s) => s.user_id === targetUserId);
    } else if (targetPhone) {
      const targetDigits = normalizeDigits(targetPhone);
      targets = targets.filter((s) => {
        const subDigits = normalizeDigits(s.phone || "");
        return subDigits && (subDigits.endsWith(targetDigits) || targetDigits.endsWith(subDigits));
      });
    }

    if (targets.length === 0) {
      return NextResponse.json({
        success: true,
        sentCount: 0,
        failedCount: 0,
        message: "Bildirim gönderilecek aktif abone cihaz bulunamadı.",
      });
    }

    const payload = JSON.stringify({
      title,
      body: message,
      url,
      tag: `push-${Date.now()}`,
    });

    let sentCount = 0;
    let failedCount = 0;

    await Promise.all(
      targets.map(async (sub) => {
        try {
          await sendNotification(
            {
              endpoint: sub.endpoint,
              keys: {
                p256dh: sub.p256dh,
                auth: sub.auth,
              },
            },
            payload
          );
          sentCount++;
        } catch (err: unknown) {
          failedCount++;
          const statusCode =
            (err as { statusCode?: number })?.statusCode ?? 0;
          if (statusCode === 404 || statusCode === 410) {
            await removePushSubscription(sub.endpoint);
          }
        }
      })
    );

    return NextResponse.json({
      success: true,
      sentCount,
      failedCount,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Bildirim gönderilemedi.",
      },
      { status: 500 }
    );
  }
}

