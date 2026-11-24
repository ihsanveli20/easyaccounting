import { NextResponse } from "next/server";
import QRCode from "qrcode";
import {
  getMemRulesStore,
  getRawAccessToken,
  getSupabaseWaClient,
  loadWhatsAppBotState,
  matchBotRule,
  saveBotMessage,
  saveBotSettings,
  sendWhatsAppCloudText,
  WhatsAppBotRule,
} from "../../utils/whatsappBotStore";

export async function GET() {
  try {
    const state = await loadWhatsAppBotState();
    return NextResponse.json({ success: true, ...state });
  } catch (err: unknown) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "WhatsApp Bot verileri alınamadı.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const action = String(body.action || "");
    const actor = String(body.actor || "Admin");
    const supabase = getSupabaseWaClient();

    if (action === "save_settings") {
      const updated = await saveBotSettings({
        settings: body.settings || {},
        newAccessToken: body.accessToken,
        newBridgeApiKey: body.bridgeApiKey,
        actor,
      });
      return NextResponse.json({ success: true, settings: updated });
    }

    if (action === "fetch_qr") {
      const { bridgeUrl, bridgeInstance, bridgeApiKey } = await getRawAccessToken();
      const targetUrl = String(body.bridgeUrl || bridgeUrl || "").trim().replace(/\/+$/, "");
      const instance = String(body.bridgeInstance || bridgeInstance || "anadolu_yapi").trim();
      const apiKey = String(body.bridgeApiKey || bridgeApiKey || "").trim();

      if (!targetUrl) {
        return NextResponse.json({
          success: false,
          error:
            "QR ile bağlanmak için bir WhatsApp Web Köprü Sunucusu (Evolution API / Baileys URL) girmelisiniz. Not: Resmî Meta Cloud API QR kod ile token vermez; QR okutma için köprü sunucusu gerekir.",
        });
      }

      try {
        const headers: Record<string, string> = {
          Accept: "application/json",
          ...(apiKey ? { apikey: apiKey, Authorization: `Bearer ${apiKey}` } : {}),
        };

        // Try Evolution API /instance/connect/{instance} first, then /qr fallback
        let res = await fetch(
          `${targetUrl}/instance/connect/${encodeURIComponent(instance)}`,
          { method: "GET", headers, signal: AbortSignal.timeout(8000) }
        );
        if (res.status === 404) {
          res = await fetch(`${targetUrl}/qr`, {
            method: "GET",
            headers,
            signal: AbortSignal.timeout(8000),
          });
        }

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          return NextResponse.json({
            success: false,
            error: data?.message || `Köprü sunucusu HTTP ${res.status} döndürdü.`,
          });
        }

        // Check if already connected
        if (data?.instance?.state === "open" || data?.connected === true) {
          const updated = await saveBotSettings({
            settings: {
              connection_mode: "qr_bridge",
              bridge_url: targetUrl,
              bridge_instance: instance,
              bridge_connected: true,
              is_active: true,
            },
            newBridgeApiKey: apiKey || undefined,
            actor,
          });
          return NextResponse.json({
            success: true,
            connected: true,
            settings: updated,
            message: "Telefon zaten WhatsApp Web köprüsüne bağlı!",
          });
        }

        let qrDataUrl = "";
        if (typeof data?.base64 === "string" && data.base64.startsWith("data:image")) {
          qrDataUrl = data.base64;
        } else if (typeof data?.qrcode?.base64 === "string") {
          qrDataUrl = data.qrcode.base64;
        } else if (typeof data?.code === "string" || typeof data?.qr === "string") {
          qrDataUrl = await QRCode.toDataURL(data.code || data.qr, { width: 260, margin: 2 });
        }

        if (!qrDataUrl) {
          return NextResponse.json({
            success: false,
            error: "Köprü sunucusundan QR kodu alınamadı.",
          });
        }

        // Save bridge config so polling works
        await saveBotSettings({
          settings: {
            connection_mode: "qr_bridge",
            bridge_url: targetUrl,
            bridge_instance: instance,
          },
          newBridgeApiKey: apiKey || undefined,
          actor,
        });

        return NextResponse.json({
          success: true,
          connected: false,
          qrDataUrl,
        });
      } catch (err: unknown) {
        return NextResponse.json({
          success: false,
          error:
            err instanceof Error
              ? `Köprü sunucusuna ulaşılamadı: ${err.message}`
              : "QR alınırken bağlantı hatası.",
        });
      }
    }

    if (action === "check_qr_status") {
      const { bridgeUrl, bridgeInstance, bridgeApiKey } = await getRawAccessToken();
      if (!bridgeUrl) {
        return NextResponse.json({ success: false, connected: false });
      }
      const base = bridgeUrl.trim().replace(/\/+$/, "");
      try {
        const res = await fetch(
          `${base}/instance/connectionState/${encodeURIComponent(bridgeInstance || "anadolu_yapi")}`,
          {
            method: "GET",
            headers: {
              ...(bridgeApiKey ? { apikey: bridgeApiKey, Authorization: `Bearer ${bridgeApiKey}` } : {}),
            },
            signal: AbortSignal.timeout(6000),
          }
        );
        const data = await res.json().catch(() => ({}));
        const isConnected =
          data?.instance?.state === "open" ||
          data?.state === "open" ||
          data?.connected === true;

        if (isConnected) {
          const updated = await saveBotSettings({
            settings: {
              connection_mode: "qr_bridge",
              bridge_connected: true,
              bridge_phone: data?.instance?.owner || data?.phone || "",
              is_active: true,
            },
            newAccessToken: data?.token || undefined,
            actor,
          });
          return NextResponse.json({
            success: true,
            connected: true,
            settings: updated,
          });
        }
        return NextResponse.json({ success: true, connected: false });
      } catch {
        return NextResponse.json({ success: false, connected: false });
      }
    }

    if (action === "test_connection") {
      const { phoneNumberId, accessToken } = await getRawAccessToken();
      if (!phoneNumberId || !accessToken) {
        return NextResponse.json({
          success: false,
          message: "Phone Number ID ve Permanent Access Token zorunludur.",
        });
      }

      const res = await fetch(
        `https://graph.facebook.com/v20.0/${encodeURIComponent(
          phoneNumberId
        )}?fields=display_phone_number,verified_name`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: AbortSignal.timeout(8000),
        }
      );
      const data = await res.json();
      if (res.ok && data?.id) {
        return NextResponse.json({
          success: true,
          message: `WhatsApp Business bağlandı: ${data.verified_name || ""} (${data.display_phone_number || data.id})`,
        });
      }
      return NextResponse.json({
        success: false,
        message: data?.error?.message || `Meta API HTTP ${res.status}`,
      });
    }

    if (action === "upsert_rule") {
      const r = body.rule as Partial<WhatsAppBotRule>;
      if (!r?.keyword?.trim() || !r?.reply_text?.trim()) {
        return NextResponse.json(
          { success: false, error: "Anahtar kelime ve yanıt metni zorunludur." },
          { status: 400 }
        );
      }

      const memRules = getMemRulesStore();
      const ruleObj: WhatsAppBotRule = {
        id: r.id || `rule-${Date.now()}`,
        keyword: r.keyword.trim(),
        match_type: r.match_type || "contains",
        reply_text: r.reply_text.trim(),
        action_type: r.action_type || "text",
        is_active: r.is_active !== false,
        priority: Number(r.priority) || 10,
        created_at: r.created_at || new Date().toISOString(),
      };

      const existingIdx = memRules.findIndex((x) => x.id === ruleObj.id);
      if (existingIdx >= 0) memRules[existingIdx] = ruleObj;
      else memRules.push(ruleObj);

      if (supabase) {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(ruleObj.id);
        const { data } = await supabase
          .from("whatsapp_bot_rules")
          .upsert({
            ...(isUuid ? { id: ruleObj.id } : {}),
            keyword: ruleObj.keyword,
            match_type: ruleObj.match_type,
            reply_text: ruleObj.reply_text,
            action_type: ruleObj.action_type,
            is_active: ruleObj.is_active,
            priority: ruleObj.priority,
          })
          .select()
          .single();
        if (data) return NextResponse.json({ success: true, rule: data });
      }

      return NextResponse.json({ success: true, rule: ruleObj });
    }

    if (action === "delete_rule") {
      const ruleId = String(body.ruleId || "");
      const memRules = getMemRulesStore();
      const idx = memRules.findIndex((x) => x.id === ruleId);
      if (idx >= 0) memRules.splice(idx, 1);

      if (supabase && /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(ruleId)) {
        await supabase.from("whatsapp_bot_rules").delete().eq("id", ruleId);
      }
      return NextResponse.json({ success: true });
    }

    if (action === "send_manual_reply") {
      const phone = String(body.phone || "").trim();
      const text = String(body.text || "").trim();
      if (!phone || !text) {
        return NextResponse.json(
          { success: false, error: "Telefon ve mesaj metni zorunludur." },
          { status: 400 }
        );
      }

      const sendRes = await sendWhatsAppCloudText({ toPhone: phone, text });
      const saved = await saveBotMessage({
        wa_message_id: sendRes.waMessageId || null,
        direction: "outbound",
        phone,
        contact_name: body.contactName || null,
        message_text: text,
        message_type: "text",
        status: sendRes.ok ? "sent" : "failed",
        is_bot_reply: false,
      });

      return NextResponse.json({
        success: sendRes.ok,
        error: sendRes.error,
        message: saved,
      });
    }

    if (action === "simulate_incoming") {
      const phone = String(body.phone || "0532 000 00 00").trim();
      const text = String(body.text || "").trim();
      if (!text) {
        return NextResponse.json({ success: false, error: "Test mesajı boş." }, { status: 400 });
      }

      const state = await loadWhatsAppBotState();
      const inbound = await saveBotMessage({
        direction: "inbound",
        phone,
        contact_name: body.contactName || "Test Müşterisi",
        message_text: text,
        message_type: "text",
        status: "received",
        is_bot_reply: false,
      });

      const matched = matchBotRule(text, state.rules);
      const replyText = matched ? matched.reply_text : state.settings.fallback_message;

      const outbound = await saveBotMessage({
        direction: "outbound",
        phone,
        contact_name: body.contactName || "Test Müşterisi",
        message_text: replyText,
        message_type: "text",
        status: "sent",
        matched_rule_id: matched?.id || null,
        is_bot_reply: true,
      });

      return NextResponse.json({
        success: true,
        inbound,
        outbound,
        matchedRule: matched,
      });
    }

    return NextResponse.json({ success: false, error: "Geçersiz işlem." }, { status: 400 });
  } catch (err: unknown) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Sunucu hatası.",
      },
      { status: 500 }
    );
  }
}

