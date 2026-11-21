"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  Bell,
  BellOff,
  BellRing,
  CheckCircle2,
  Loader2,
  Phone,
  Send,
  X,
} from "lucide-react";

interface SubscribedDevice {
  user_id: string;
  user_name: string;
  phone: string;
  endpoint: string;
}

interface WebPushControlProps {
  userId?: string;
  userName?: string;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export default function WebPushControl({
  userId = "anonymous",
  userName = "Kullanıcı",
}: WebPushControlProps) {
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [phoneInput, setPhoneInput] = useState("");
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Send notification form
  const [devices, setDevices] = useState<SubscribedDevice[]>([]);
  const [tableMissing, setTableMissing] = useState(false);
  const [targetEndpointFilter, setTargetEndpointFilter] = useState<string>("all");
  const [notifTitle, setNotifTitle] = useState("Hesap Planı Bildirimi");
  const [notifBody, setNotifBody] = useState("");
  const [isSending, setIsSending] = useState(false);

  const loadDevices = async () => {
    try {
      const res = await fetch("/api/push/subscribe");
      const data = await res.json();
      if (data?.success && Array.isArray(data.subscriptions)) {
        setDevices(data.subscriptions);
        setTableMissing(Boolean(data.tableMissing));
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window)
    ) {
      return;
    }
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        setIsSupported(true);
        return reg.pushManager.getSubscription();
      })
      .then((sub) => {
        setIsSubscribed(Boolean(sub));
      })
      .catch(() => {
        // ignore SW registration errors
      });
  }, []);

  const handleOpenModal = () => {
    setIsModalOpen(true);
    setStatusMsg(null);
    setErrorMsg(null);
    loadDevices();
  };

  const handleSubscribe = async () => {
    setErrorMsg(null);
    setStatusMsg(null);
    const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
    if (!vapidPublicKey) {
      setErrorMsg("VAPID public key tanımlanmamış.");
      return;
    }

    setIsBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setErrorMsg("Tarayıcı bildirim izni reddedildi.");
        setIsBusy(false);
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });

      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscription: subscription.toJSON(),
          userId,
          userName,
          phone: phoneInput.trim(),
        }),
      });
      const data = await res.json();
      if (data?.success) {
        setIsSubscribed(true);
        setStatusMsg("Bu cihaz bildirim almaya hazır!");
        loadDevices();
      } else {
        setErrorMsg(data?.error || "Abonelik kaydedilemedi.");
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Bildirim açılamadı.");
    } finally {
      setIsBusy(false);
    }
  };

  const handleUnsubscribe = async () => {
    setErrorMsg(null);
    setStatusMsg(null);
    setIsBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint }),
        });
      }
      setIsSubscribed(false);
      setStatusMsg("Bu cihaz için bildirimler kapatıldı.");
      loadDevices();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Bildirim kapatılamadı.");
    } finally {
      setIsBusy(false);
    }
  };

  const handleSendPush = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!notifBody.trim()) return;

    setErrorMsg(null);
    setStatusMsg(null);
    setIsSending(true);

    try {
      const selectedDevice = devices.find((d) => d.endpoint === targetEndpointFilter);
      const res = await fetch("/api/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: notifTitle.trim() || "Bildirim",
          body: notifBody.trim(),
          url: "/",
          targetPhone: selectedDevice?.phone || undefined,
          targetUserId:
            !selectedDevice?.phone && selectedDevice?.user_id
              ? selectedDevice.user_id
              : undefined,
        }),
      });
      const data = await res.json();
      if (data?.success) {
        setStatusMsg(`${data.sentCount || 0} cihaza bildirim gönderildi.`);
        setNotifBody("");
      } else {
        setErrorMsg(data?.error || "Bildirim gönderilemedi.");
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Gönderim hatası.");
    } finally {
      setIsSending(false);
    }
  };

  if (!isSupported) return null;

  return (
    <>
      <button
        type="button"
        onClick={handleOpenModal}
        className={`relative inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-bold transition-colors ${isSubscribed
          ? "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100"
          : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
          }`}
        title="Web Push Bildirimleri"
      >
        {isSubscribed ? (
          <BellRing className="w-3.5 h-3.5 text-emerald-600" />
        ) : (
          <Bell className="w-3.5 h-3.5" />
        )}
        <span className="hidden sm:inline">Bildirimler</span>
        {isSubscribed && (
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
        )}
      </button>

      {isModalOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl max-w-md w-full max-h-[90dvh] flex flex-col overflow-hidden shadow-2xl border border-slate-200">
              <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50 shrink-0">
                <div className="flex items-center gap-2 font-black text-sm text-slate-900">
                  <BellRing className="w-4 h-4 text-emerald-600" />
                  <span>Web Push Bildirim Merkezi</span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="p-1 rounded-lg hover:bg-slate-200 text-slate-500"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 space-y-5 overflow-y-auto">
              {statusMsg && (
                <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs font-bold text-emerald-800 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{statusMsg}</span>
                </div>
              )}

              {errorMsg && (
                <div className="rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-xs font-bold text-rose-700">
                  {errorMsg}
                </div>
              )}

              {tableMissing && (
                <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-[11px] font-semibold text-amber-800">
                  Supabase &quot;push_subscriptions&quot; tablosu henüz oluşturulmamış! Cihazlar arası (Mac → iPhone) bildirim için <code>data/push_subscriptions_schema.sql</code> dosyasını Supabase SQL Editor&apos;de çalıştırın.
                </div>
              )}

              {/* Device Subscription Section */}
              <div className="rounded-2xl border border-slate-200 p-4 space-y-3 bg-slate-50/50">
                <div className="text-xs font-black text-slate-800">
                  Bu Cihazın Bildirim Durumu:{" "}
                  <span className={isSubscribed ? "text-emerald-600" : "text-amber-600"}>
                    {isSubscribed ? "Aktif" : "Kapalı"}
                  </span>
                </div>

                {!isSubscribed ? (
                  <>
                    <div className="relative">
                      <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="tel"
                        value={phoneInput}
                        onChange={(e) => setPhoneInput(e.target.value)}
                        placeholder="Telefon numaranız (Örn: 0532 123 45 67)"
                        className="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleSubscribe}
                      disabled={isBusy}
                      className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-xs font-bold"
                    >
                      {isBusy ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <BellRing className="w-4 h-4" />
                      )}
                      <span>Bu Cihazda Bildirimleri Aç</span>
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={handleUnsubscribe}
                    disabled={isBusy}
                    className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold"
                  >
                    <BellOff className="w-4 h-4" />
                    <span>Bildirimleri Kapat</span>
                  </button>
                )}
              </div>

              {/* Send Notification Section */}
              <form onSubmit={handleSendPush} className="space-y-3 border-t border-slate-100 pt-4">
                <div className="text-xs font-black text-slate-800">
                  Ekibe / Kişiye Bildirim Gönder ({devices.length} Kayıtlı Cihaz)
                </div>

                <select
                  value={targetEndpointFilter}
                  onChange={(e) => setTargetEndpointFilter(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-semibold"
                >
                  <option value="all">Tüm Kayıtlı Cihazlar ({devices.length})</option>
                  {devices.map((d) => (
                    <option key={d.endpoint} value={d.endpoint}>
                      {d.user_name} {d.phone ? `(${d.phone})` : ""}
                    </option>
                  ))}
                </select>

                <input
                  type="text"
                  value={notifTitle}
                  onChange={(e) => setNotifTitle(e.target.value)}
                  placeholder="Bildirim başlığı"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold"
                />

                <textarea
                  rows={3}
                  value={notifBody}
                  onChange={(e) => setNotifBody(e.target.value)}
                  placeholder="Gönderilecek bildirim mesajı..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
                />

                <button
                  type="submit"
                  disabled={isSending || !notifBody.trim()}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-xs font-bold shadow-sm"
                >
                  {isSending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                  <span>Anlık Bildirim Gönder</span>
                </button>
              </form>
            </div>
          </div>
        </div>,
          document.body
        )}
    </>
  );
}
