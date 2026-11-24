"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Bot,
  CheckCircle2,
  Copy,
  Database,
  KeyRound,
  Loader2,
  MessageCircle,
  MessageSquare,
  Plus,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  Webhook,
  Zap,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import type {
  WhatsAppBotMessage,
  WhatsAppBotRule,
  WhatsAppBotSettings,
} from "../utils/whatsappBotStore";

type BotTab = "inbox" | "rules" | "settings" | "logs";

const ACTION_LABELS: Record<WhatsAppBotRule["action_type"], string> = {
  text: "Sabit Metin Yanıtı",
  check_balance: "Cari Bakiye Sorgula (Otomatik)",
  create_quote_lead: "Teklif Talebi Oluştur",
  handoff_human: "Yetkiliye Aktar",
};

export default function WhatsAppBotView() {
  const { profile, user } = useAuth();
  const actorName =
    profile?.full_name || profile?.user_name || user?.email?.split("@")[0] || "Admin";

  const [activeTab, setActiveTab] = useState<BotTab>("inbox");
  const [settings, setSettings] = useState<WhatsAppBotSettings | null>(null);
  const [rules, setRules] = useState<WhatsAppBotRule[]>([]);
  const [messages, setMessages] = useState<WhatsAppBotMessage[]>([]);
  const [tableMissing, setTableMissing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // Settings form
  const [accessTokenInput, setAccessTokenInput] = useState("");
  const [copiedWebhook, setCopiedWebhook] = useState(false);

  // Inbox & simulation state
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [manualReplyText, setManualReplyText] = useState("");
  const [simPhone, setSimPhone] = useState("0532 123 45 67");
  const [simText, setSimText] = useState("");

  // New rule form
  const [newKeyword, setNewKeyword] = useState("");
  const [newMatchType, setNewMatchType] = useState<WhatsAppBotRule["match_type"]>("contains");
  const [newActionType, setNewActionType] = useState<WhatsAppBotRule["action_type"]>("text");
  const [newReplyText, setNewReplyText] = useState("");

  const loadBotState = async () => {
    try {
      const res = await fetch("/api/whatsapp-bot");
      const data = await res.json();
      if (data?.success) {
        setSettings(data.settings);
        setRules(data.rules || []);
        setMessages(data.messages || []);
        setTableMissing(Boolean(data.tableMissing));
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadBotState();
  }, []);

  // Group messages by phone for inbox conversation list
  const conversations = useMemo(() => {
    const map = new Map<
      string,
      { phone: string; contactName: string; lastMsg: WhatsAppBotMessage; count: number }
    >();
    for (const m of messages) {
      const existing = map.get(m.phone);
      if (!existing) {
        map.set(m.phone, {
          phone: m.phone,
          contactName: m.contact_name || m.phone,
          lastMsg: m,
          count: 1,
        });
      } else {
        existing.count++;
      }
    }
    return Array.from(map.values());
  }, [messages]);

  const activeThread = useMemo(() => {
    const target = selectedPhone || conversations[0]?.phone;
    if (!target) return [];
    return messages
      .filter((m) => m.phone === target)
      .slice()
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }, [messages, selectedPhone, conversations]);

  const activeThreadPhone = selectedPhone || conversations[0]?.phone || null;

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setIsSavingSettings(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/whatsapp-bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_settings",
          actor: actorName,
          settings,
          accessToken: accessTokenInput,
        }),
      });
      const data = await res.json();
      if (data?.success) {
        setSettings(data.settings);
        setAccessTokenInput("");
        setFeedback({ ok: true, msg: "WhatsApp Bot ayarları şifreli olarak kaydedildi." });
      } else {
        setFeedback({ ok: false, msg: data?.error || "Ayarlar kaydedilemedi." });
      }
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/whatsapp-bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test_connection" }),
      });
      const data = await res.json();
      setFeedback({ ok: Boolean(data?.success), msg: data?.message || "Test tamamlandı." });
    } finally {
      setIsTesting(false);
    }
  };

  const handleAddRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyword.trim() || !newReplyText.trim()) return;
    const res = await fetch("/api/whatsapp-bot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "upsert_rule",
        rule: {
          keyword: newKeyword.trim(),
          match_type: newMatchType,
          action_type: newActionType,
          reply_text: newReplyText.trim(),
          is_active: true,
          priority: rules.length + 1,
        },
      }),
    });
    const data = await res.json();
    if (data?.success && data.rule) {
      setRules((prev) => [...prev, data.rule]);
      setNewKeyword("");
      setNewReplyText("");
      setFeedback({ ok: true, msg: "Yeni bot kuralı eklendi." });
    }
  };

  const handleDeleteRule = async (ruleId: string) => {
    setRules((prev) => prev.filter((r) => r.id !== ruleId));
    await fetch("/api/whatsapp-bot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete_rule", ruleId }),
    });
  };

  const handleSimulateIncoming = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!simText.trim()) return;
    const res = await fetch("/api/whatsapp-bot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "simulate_incoming",
        phone: simPhone,
        text: simText,
      }),
    });
    const data = await res.json();
    if (data?.success) {
      setSimText("");
      setSelectedPhone(simPhone);
      await loadBotState();
    }
  };

  const handleSendManualReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeThreadPhone || !manualReplyText.trim()) return;
    const res = await fetch("/api/whatsapp-bot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "send_manual_reply",
        phone: activeThreadPhone,
        text: manualReplyText,
      }),
    });
    const data = await res.json();
    setManualReplyText("");
    if (!data?.success) {
      setFeedback({ ok: false, msg: data?.error || "Mesaj gönderilemedi." });
    }
    await loadBotState();
  };

  const webhookUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/whatsapp-bot/webhook`
      : "/api/whatsapp-bot/webhook";

  return (
    <div className="space-y-5">
      {tableMissing && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
          <Database className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-900">
            <div className="font-bold">
              Supabase &quot;whatsapp_bot_*&quot; tabloları henüz oluşturulmamış
            </div>
            <p className="text-amber-700 mt-0.5">
              Kalıcı bot kuralları ve mesaj geçmişi için{" "}
              <code>data/whatsapp_bot_schema.sql</code> dosyasını Supabase SQL Editor&apos;de çalıştırın.
            </p>
          </div>
        </div>
      )}

      {feedback && (
        <div
          className={`rounded-2xl border px-4 py-3 text-xs font-bold flex items-center gap-2 ${
            feedback.ok
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-rose-50 border-rose-200 text-rose-700"
          }`}
        >
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{feedback.msg}</span>
        </div>
      )}

      {/* Header & KPI Bar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase text-slate-400">Bot Durumu</div>
          <div className="text-lg font-black mt-1 text-slate-900">
            {settings?.is_active ? (
              <span className="text-emerald-600">Aktif (Otomatik Yanıt)</span>
            ) : (
              <span className="text-amber-600">Beklemede / Pasif</span>
            )}
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase text-slate-400">Gelen Mesaj</div>
          <div className="text-2xl font-black text-slate-900 mt-1">
            {messages.filter((m) => m.direction === "inbound").length}
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase text-slate-400">Bot Yanıtı</div>
          <div className="text-2xl font-black text-emerald-700 mt-1">
            {messages.filter((m) => m.is_bot_reply).length}
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase text-slate-400">Aktif Kural</div>
          <div className="text-2xl font-black text-indigo-700 mt-1">
            {rules.filter((r) => r.is_active).length}
          </div>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-2 shadow-sm flex flex-wrap gap-1.5">
        {(
          [
            ["inbox", "Gelen Kutusu & Test", MessageCircle],
            ["rules", "Otomatik Yanıt Kuralları", Zap],
            ["settings", "Meta Cloud API & Webhook", Settings],
            ["logs", "Mesaj Geçmişi", MessageSquare],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors ${
              activeTab === id
                ? "bg-[#25D366] text-white shadow-xs"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>WhatsApp Bot yükleniyor...</span>
        </div>
      ) : (
        <>
          {/* TAB 1: INBOX & SIMULATION */}
          {activeTab === "inbox" && (
            <div className="space-y-4">
              {/* Quick Bot Simulator */}
              <form
                onSubmit={handleSimulateIncoming}
                className="bg-indigo-50/70 border border-indigo-200 rounded-2xl p-4 flex flex-wrap items-center gap-2 text-xs"
              >
                <div className="font-black text-indigo-900 flex items-center gap-1.5 mr-2">
                  <Sparkles className="w-4 h-4 text-indigo-600" />
                  <span>Bot Test Simülasyonu:</span>
                </div>
                <input
                  type="text"
                  value={simPhone}
                  onChange={(e) => setSimPhone(e.target.value)}
                  placeholder="Telefon"
                  className="w-36 px-2.5 py-1.5 rounded-xl border border-indigo-200 bg-white font-semibold"
                />
                <input
                  type="text"
                  value={simText}
                  onChange={(e) => setSimText(e.target.value)}
                  placeholder='Örnek mesaj yazın (örn: "merhaba", "bakiye", "tuğla teklif")'
                  className="flex-1 min-w-[200px] px-3 py-1.5 rounded-xl border border-indigo-200 bg-white"
                />
                <button
                  type="submit"
                  className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold"
                >
                  Test Et
                </button>
              </form>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden min-h-[420px]">
                {/* Left: Contacts / Conversations */}
                <div className="lg:col-span-4 border-b lg:border-b-0 lg:border-r border-slate-200 divide-y divide-slate-100">
                  {conversations.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-400">
                      Henüz WhatsApp mesajı yok. Yukarıdan test simülasyonu yapabilir veya Webhook bağlayabilirsiniz.
                    </div>
                  ) : (
                    conversations.map((c) => (
                      <button
                        key={c.phone}
                        type="button"
                        onClick={() => setSelectedPhone(c.phone)}
                        className={`w-full text-left p-3.5 hover:bg-slate-50 transition-colors ${
                          activeThreadPhone === c.phone ? "bg-emerald-50/70" : ""
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-black text-xs text-slate-900">{c.contactName}</span>
                          <span className="text-[10px] text-slate-400">{c.count} mesaj</span>
                        </div>
                        <div className="text-[11px] text-slate-500 truncate mt-0.5">
                          {c.lastMsg.message_text}
                        </div>
                      </button>
                    ))
                  )}
                </div>

                {/* Right: Active Chat Thread */}
                <div className="lg:col-span-8 flex flex-col justify-between bg-slate-50/40">
                  <div className="p-4 space-y-2.5 overflow-y-auto max-h-[360px]">
                    {activeThread.map((m) => (
                      <div
                        key={m.id}
                        className={`flex ${
                          m.direction === "outbound" ? "justify-end" : "justify-start"
                        }`}
                      >
                        <div
                          className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-xs shadow-2xs ${
                            m.direction === "outbound"
                              ? "bg-emerald-600 text-white"
                              : "bg-white border border-slate-200 text-slate-800"
                          }`}
                        >
                          {m.is_bot_reply && (
                            <div className="text-[10px] font-bold opacity-80 flex items-center gap-1 mb-0.5">
                              <Bot className="w-3 h-3" /> Otomatik Bot Yanıtı
                            </div>
                          )}
                          <div className="whitespace-pre-wrap">{m.message_text}</div>
                          <div className="text-[9px] opacity-70 text-right mt-1">
                            {m.created_at.slice(11, 16)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {activeThreadPhone && (
                    <form
                      onSubmit={handleSendManualReply}
                      className="p-3 border-t border-slate-200 bg-white flex gap-2"
                    >
                      <input
                        type="text"
                        value={manualReplyText}
                        onChange={(e) => setManualReplyText(e.target.value)}
                        placeholder={`${activeThreadPhone} numarasına manuel yanıt yaz...`}
                        className="flex-1 px-3 py-2 rounded-xl border border-slate-300 text-xs"
                      />
                      <button
                        type="submit"
                        className="px-4 py-2 rounded-xl bg-[#25D366] hover:bg-[#1fb858] text-white text-xs font-bold inline-flex items-center gap-1"
                      >
                        <Send className="w-3.5 h-3.5" /> Gönder
                      </button>
                    </form>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: BOT RULES */}
          {activeTab === "rules" && (
            <div className="space-y-4">
              <form
                onSubmit={handleAddRule}
                className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3 text-xs"
              >
                <h3 className="text-sm font-black text-slate-900">Yeni Bot Yanıt Kuralı Ekle</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block font-bold text-slate-600 mb-1">
                      Anahtar Kelimeler (virgülle ayırın) *
                    </label>
                    <input
                      type="text"
                      required
                      value={newKeyword}
                      onChange={(e) => setNewKeyword(e.target.value)}
                      placeholder="Örn: fiyat, teklif, palet"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-600 mb-1">Eşleşme Türü</label>
                    <select
                      value={newMatchType}
                      onChange={(e) =>
                        setNewMatchType(e.target.value as WhatsAppBotRule["match_type"])
                      }
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white"
                    >
                      <option value="contains">İçeriyorsa</option>
                      <option value="exact">Birebir Aynıysa</option>
                      <option value="starts_with">İle Başlıyorsa</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-bold text-slate-600 mb-1">Bot Aksiyonu</label>
                    <select
                      value={newActionType}
                      onChange={(e) =>
                        setNewActionType(e.target.value as WhatsAppBotRule["action_type"])
                      }
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-semibold"
                    >
                      <option value="text">Sabit Metin Yanıtı</option>
                      <option value="check_balance">Cari Bakiye Sorgula (Otomatik)</option>
                      <option value="create_quote_lead">Teklif Talebi Oluştur</option>
                      <option value="handoff_human">Yetkiliye Aktar</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block font-bold text-slate-600 mb-1">Bot Yanıt Metni *</label>
                  <textarea
                    rows={2}
                    required
                    value={newReplyText}
                    onChange={(e) => setNewReplyText(e.target.value)}
                    placeholder="Müşteriye otomatik gönderilecek mesaj..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold inline-flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Kural Ekle
                  </button>
                </div>
              </form>

              <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100">
                {rules.map((r) => (
                  <div key={r.id} className="p-4 flex items-start justify-between gap-3 text-xs">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-2 py-0.5 rounded-lg bg-indigo-50 text-indigo-700 font-bold">
                          {r.keyword}
                        </span>
                        <span className="text-[10px] font-bold text-slate-500">
                          {ACTION_LABELS[r.action_type]}
                        </span>
                      </div>
                      <p className="text-slate-700 whitespace-pre-wrap">{r.reply_text}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteRule(r.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: META CLOUD API & WEBHOOK SETTINGS */}
          {activeTab === "settings" && settings && (
            <form
              onSubmit={handleSaveSettings}
              className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-6 space-y-5 text-xs"
            >
              <div className="flex items-center gap-2 text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl p-3 font-semibold">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span>
                  Meta WhatsApp Business Cloud API anahtarınız AES-256-GCM ile şifrelenerek saklanır.
                </span>
              </div>

              {/* Webhook URL Copy Box */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="font-black text-slate-800 flex items-center gap-1.5">
                  <Webhook className="w-4 h-4 text-indigo-600" />
                  <span>Meta Developer Paneli Webhook Adresi (Callback URL)</span>
                </div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 p-2.5 rounded-xl bg-white border border-slate-200 font-mono text-[11px] select-all">
                    {webhookUrl}
                  </code>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(webhookUrl);
                      setCopiedWebhook(true);
                      setTimeout(() => setCopiedWebhook(false), 2000);
                    }}
                    className="px-3 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 font-bold inline-flex items-center gap-1"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>{copiedWebhook ? "Kopyalandı" : "Kopyala"}</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Phone Number ID *</label>
                  <input
                    type="text"
                    value={settings.phone_number_id}
                    onChange={(e) =>
                      setSettings({ ...settings, phone_number_id: e.target.value })
                    }
                    placeholder="Meta Developer -> WhatsApp -> API Setup"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    WhatsApp Business Account ID (WABA)
                  </label>
                  <input
                    type="text"
                    value={settings.waba_id}
                    onChange={(e) => setSettings({ ...settings, waba_id: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Permanent Access Token{" "}
                    {settings.has_access_token && (
                      <span className="text-emerald-600">(Kayıtlı ✓)</span>
                    )}
                  </label>
                  <input
                    type="password"
                    value={accessTokenInput}
                    onChange={(e) => setAccessTokenInput(e.target.value)}
                    placeholder={
                      settings.has_access_token ? "•••••••• (Değiştirmek için yazın)" : "EAA..."
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Webhook Verify Token
                  </label>
                  <input
                    type="text"
                    value={settings.verify_token}
                    onChange={(e) =>
                      setSettings({ ...settings, verify_token: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Karşılama Mesajı</label>
                  <textarea
                    rows={2}
                    value={settings.welcome_message}
                    onChange={(e) =>
                      setSettings({ ...settings, welcome_message: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Eşleşme Olmadığında Yanıt (Fallback)
                  </label>
                  <textarea
                    rows={2}
                    value={settings.fallback_message}
                    onChange={(e) =>
                      setSettings({ ...settings, fallback_message: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-4">
                <label className="inline-flex items-center gap-2 font-bold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.is_active}
                    onChange={(e) => setSettings({ ...settings, is_active: e.target.checked })}
                  />
                  <span>Bot Aktif</span>
                </label>
                <label className="inline-flex items-center gap-2 font-bold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.auto_reply_enabled}
                    onChange={(e) =>
                      setSettings({ ...settings, auto_reply_enabled: e.target.checked })
                    }
                  />
                  <span>Otomatik Yanıt Açık</span>
                </label>
                <label className="inline-flex items-center gap-2 font-bold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.notify_push_on_incoming}
                    onChange={(e) =>
                      setSettings({ ...settings, notify_push_on_incoming: e.target.checked })
                    }
                  />
                  <span>Gelen Mesajda Ekibe Push Bildirimi</span>
                </label>
              </div>

              <div className="flex flex-wrap justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={isTesting}
                  className="px-4 py-2 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold inline-flex items-center gap-1.5"
                >
                  {isTesting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Activity className="w-3.5 h-3.5" />
                  )}
                  <span>Meta Bağlantısını Test Et</span>
                </button>
                <button
                  type="submit"
                  disabled={isSavingSettings}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold inline-flex items-center gap-1.5"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>{isSavingSettings ? "Kaydediliyor..." : "Ayarları Kaydet"}</span>
                </button>
              </div>
            </form>
          )}

          {/* TAB 4: MESSAGE LOGS */}
          {activeTab === "logs" && (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto text-xs">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                    <th className="py-2.5 px-4">Tarih</th>
                    <th className="py-2.5 px-3">Yön</th>
                    <th className="py-2.5 px-3">Telefon</th>
                    <th className="py-2.5 px-4">Mesaj</th>
                    <th className="py-2.5 px-3">Durum</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {messages.map((m) => (
                    <tr key={m.id}>
                      <td className="py-2.5 px-4 font-mono text-[11px] text-slate-500">
                        {m.created_at.slice(0, 19).replace("T", " ")}
                      </td>
                      <td className="py-2.5 px-3 font-bold">
                        {m.direction === "inbound"
                          ? "Gelen"
                          : m.is_bot_reply
                            ? "Bot Yanıtı"
                            : "Manuel Yanıt"}
                      </td>
                      <td className="py-2.5 px-3">{m.phone}</td>
                      <td className="py-2.5 px-4">{m.message_text}</td>
                      <td className="py-2.5 px-3 font-bold">{m.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

