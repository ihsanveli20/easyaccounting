import { NextResponse } from "next/server";
import crypto from "crypto";
import {
  getRawAccessToken,
  getSupabaseWaClient,
  loadWhatsAppBotState,
  matchBotRule,
  saveBotMessage,
  sendWhatsAppCloudText,
} from "../../../utils/whatsappBotStore";

// Meta Webhook Verification (GET)
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const { verifyToken } = await getRawAccessToken();
  const expectedToken = verifyToken || process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || "";

  if (mode === "subscribe" && expectedToken && token === expectedToken && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: "Webhook verification failed" }, { status: 403 });
}

async function lookupContactBalanceReply(phone: string): Promise<string | null> {
  const supabase = getSupabaseWaClient();
  if (!supabase) return null;

  const digits = phone.replace(/\D/g, "").slice(-10);
  if (digits.length < 7) return null;

  const { data: contacts } = await supabase
    .from("contacts")
    .select("id, name, phone")
    .ilike("phone", `%${digits}%`)
    .limit(1);

  const contact = contacts?.[0];
  if (!contact) return null;

  const { data: txs } = await supabase
    .from("account_transactions")
    .select("tl_debit, tl_credit, is_cancelled")
    .eq("contact_id", contact.id)
    .eq("is_cancelled", false);

  let net = 0;
  for (const t of txs || []) {
    net += (Number(t.tl_debit) || 0) - (Number(t.tl_credit) || 0);
  }

  const absBal = Math.abs(net).toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const dir = net > 0 ? "Borç" : net < 0 ? "Alacak" : "Dengede";
  return `Sayın *${contact.name}*,\nGüncel cari hesap bakiyeniz: *₺${absBal} (${dir})*.`;
}

// Incoming Meta WhatsApp Business Cloud API Webhook (POST)
export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const appSecret = process.env.WHATSAPP_APP_SECRET || "";
    const sigHeader = request.headers.get("x-hub-signature-256") || "";

    if (appSecret && sigHeader) {
      const expected =
        "sha256=" + crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
      const sigBuf = Buffer.from(sigHeader);
      const expBuf = Buffer.from(expected);
      if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }
    }

    const payload = JSON.parse(rawBody);
    const entries = Array.isArray(payload?.entry) ? payload.entry : [];
    const state = await loadWhatsAppBotState();

    for (const entry of entries) {
      const changes = Array.isArray(entry?.changes) ? entry.changes : [];
      for (const change of changes) {
        const value = change?.value;
        const contactsMap = new Map<string, string>();
        for (const c of value?.contacts || []) {
          if (c?.wa_id) contactsMap.set(c.wa_id, c?.profile?.name || c.wa_id);
        }

        const messages = Array.isArray(value?.messages) ? value.messages : [];
        for (const msg of messages) {
          const fromPhone = String(msg?.from || "");
          const msgId = String(msg?.id || "");
          const textBody =
            msg?.type === "text"
              ? String(msg?.text?.body || "")
              : `[${msg?.type || "medya"} mesajı]`;
          const contactName = contactsMap.get(fromPhone) || fromPhone;

          if (!fromPhone || !textBody) continue;

          await saveBotMessage({
            wa_message_id: msgId,
            direction: "inbound",
            phone: fromPhone,
            contact_name: contactName,
            message_text: textBody,
            message_type: msg?.type || "text",
            status: "received",
            is_bot_reply: false,
          });

          // Auto-reply if bot is active & auto_reply_enabled
          if (state.settings.is_active && state.settings.auto_reply_enabled) {
            const matched = matchBotRule(textBody, state.rules);
            let replyText = matched ? matched.reply_text : state.settings.fallback_message;

            if (matched?.action_type === "check_balance") {
              const balMsg = await lookupContactBalanceReply(fromPhone);
              if (balMsg) replyText = balMsg;
            }

            if (replyText) {
              const sendRes = await sendWhatsAppCloudText({
                toPhone: fromPhone,
                text: replyText,
              });
              await saveBotMessage({
                wa_message_id: sendRes.waMessageId || null,
                direction: "outbound",
                phone: fromPhone,
                contact_name: contactName,
                message_text: replyText,
                message_type: "text",
                status: sendRes.ok ? "sent" : "failed",
                matched_rule_id: matched?.id || null,
                is_bot_reply: true,
              });
            }
          }
        }
      }
    }

    return NextResponse.json({ status: "ok" });
  } catch (err) {
    console.error("WhatsApp webhook error:", err);
    return NextResponse.json({ status: "ok" });
  }
}

