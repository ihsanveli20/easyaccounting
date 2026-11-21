import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { round2 } from "../../utils/currentAccountsEngine";

function getSupabaseServer() {
  const url =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    "https://qcndlfastbrezugknkho.supabase.co";
  const key =
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "sb_publishable_v4dm0IbGdRMmClfmWWm-Rg_tVsDZwSJ";
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function isTableMissing(msg?: string): boolean {
  const l = (msg || "").toLowerCase();
  return (
    l.includes("does not exist") ||
    l.includes("could not find the table") ||
    l.includes("schema cache")
  );
}

export async function GET() {
  const supabase = getSupabaseServer();
  if (!supabase) {
    return NextResponse.json({ success: false, tableMissing: false, contacts: [] });
  }

  try {
    const [
      contactsRes,
      txRes,
      cpRes,
      recRes,
      notesRes,
      docsRes,
      auditRes,
    ] = await Promise.all([
      supabase.from("contacts").select("*").order("name", { ascending: true }),
      supabase
        .from("account_transactions")
        .select("*")
        .order("transaction_date", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase
        .from("collections_payments")
        .select("*")
        .order("transaction_date", { ascending: false }),
      supabase
        .from("reconciliation_records")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase
        .from("contact_notes")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase
        .from("contact_documents")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase
        .from("cari_audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200),
    ]);

    if (contactsRes.error && isTableMissing(contactsRes.error.message)) {
      return NextResponse.json({
        success: false,
        tableMissing: true,
        error: contactsRes.error.message,
      });
    }

    return NextResponse.json({
      success: true,
      tableMissing: false,
      contacts: contactsRes.data || [],
      transactions: txRes.data || [],
      collectionsPayments: cpRes.data || [],
      reconciliations: recRes.data || [],
      notes: notesRes.data || [],
      documents: docsRes.data || [],
      auditLogs: auditRes.data || [],
    });
  } catch (err: unknown) {
    return NextResponse.json({
      success: false,
      error: err instanceof Error ? err.message : "Cari verileri alınamadı.",
    });
  }
}

export async function POST(request: Request) {
  const supabase = getSupabaseServer();
  if (!supabase) {
    return NextResponse.json(
      { success: false, error: "Supabase bağlantısı yok." },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    const action = String(body.action || "");
    const actor = String(body.actor || "Sistem");

    const writeAudit = async (
      contactId: string | null,
      act: string,
      entityType: string,
      entityId: string | null,
      details: string
    ) => {
      await supabase.from("cari_audit_logs").insert([
        {
          contact_id: contactId,
          action: act,
          entity_type: entityType,
          entity_id: entityId,
          details,
          performed_by: actor,
        },
      ]);
    };

    if (action === "upsert_contact") {
      const c = body.contact;
      if (!c?.name || !c?.code) {
        return NextResponse.json(
          { success: false, error: "Cari kodu ve firma adı zorunludur." },
          { status: 400 }
        );
      }

      // Duplicate check on code & tax_number
      const { data: existing } = await supabase
        .from("contacts")
        .select("id, code, name, tax_number");

      for (const row of existing || []) {
        if (c.id && row.id === c.id) continue;
        if (row.code.toLowerCase() === String(c.code).trim().toLowerCase()) {
          return NextResponse.json(
            { success: false, error: `Cari kodu (${c.code}) zaten "${row.name}" kartında mevcut.` },
            { status: 409 }
          );
        }
        if (c.tax_number && row.tax_number && row.tax_number.trim() === String(c.tax_number).trim()) {
          return NextResponse.json(
            { success: false, error: `Vergi/TCKN (${c.tax_number}) zaten "${row.name}" kartında mevcut.` },
            { status: 409 }
          );
        }
      }

      const payload = {
        ...(c.id ? { id: c.id } : {}),
        code: String(c.code).trim(),
        name: String(c.name).trim(),
        contact_type: c.contact_type || "both",
        company_type: c.company_type || "limited",
        tax_office: c.tax_office || null,
        tax_number: c.tax_number ? String(c.tax_number).trim() : null,
        authorized_person: c.authorized_person || null,
        phone: c.phone || null,
        email: c.email || null,
        website: c.website || null,
        country: c.country || "Türkiye",
        city: c.city || null,
        district: c.district || null,
        address: c.address || null,
        billing_address: c.billing_address || null,
        shipping_address: c.shipping_address || null,
        currency: c.currency || "TRY",
        payment_term_days: Number(c.payment_term_days) || 0,
        risk_limit: round2(Number(c.risk_limit) || 0),
        description: c.description || null,
        category: c.category || null,
        tags: Array.isArray(c.tags) ? c.tags : [],
        is_active: c.is_active !== false,
        created_by: c.created_by || actor,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from("contacts")
        .upsert(payload)
        .select()
        .single();

      if (error) {
        return NextResponse.json({
          success: false,
          tableMissing: isTableMissing(error.message),
          error: error.message,
        });
      }

      await writeAudit(
        data.id,
        c.id ? "UPDATE_CONTACT" : "CREATE_CONTACT",
        "contact",
        data.id,
        `${data.code} - ${data.name}`
      );

      return NextResponse.json({ success: true, contact: data });
    }

    if (action === "add_transaction") {
      const tx = body.transaction;
      const debit = round2(Number(tx.debit) || 0);
      const credit = round2(Number(tx.credit) || 0);
      const rate = Number(tx.exchange_rate) || 1;
      const tl_debit = round2(debit * rate);
      const tl_credit = round2(credit * rate);

      const { data, error } = await supabase
        .from("account_transactions")
        .insert([
          {
            contact_id: tx.contact_id,
            transaction_date: tx.transaction_date,
            document_date: tx.document_date || tx.transaction_date,
            due_date: tx.due_date || null,
            document_no: tx.document_no || null,
            transaction_type: tx.transaction_type,
            description: tx.description || "",
            debit,
            credit,
            currency: tx.currency || "TRY",
            exchange_rate: rate,
            tl_debit,
            tl_credit,
            attachment_name: tx.attachment_name || null,
            attachment_url: tx.attachment_url || null,
            created_by: actor,
          },
        ])
        .select()
        .single();

      if (error) {
        return NextResponse.json({ success: false, error: error.message });
      }

      await writeAudit(
        tx.contact_id,
        "ADD_TRANSACTION",
        "account_transaction",
        data.id,
        `${tx.transaction_type} | Borç: ${tl_debit} | Alacak: ${tl_credit}`
      );
      return NextResponse.json({ success: true, transaction: data });
    }

    if (action === "cancel_transaction") {
      const txId = String(body.transactionId || "");
      const { data: orig } = await supabase
        .from("account_transactions")
        .select("*")
        .eq("id", txId)
        .single();

      if (!orig || orig.is_cancelled) {
        return NextResponse.json(
          { success: false, error: "Hareket bulunamadı veya zaten iptal edilmiş." },
          { status: 400 }
        );
      }

      // Mark original as cancelled (audit trail preserved, never deleted)
      await supabase
        .from("account_transactions")
        .update({
          is_cancelled: true,
          cancelled_at: new Date().toISOString(),
          cancelled_by: actor,
        })
        .eq("id", txId);

      await writeAudit(
        orig.contact_id,
        "CANCEL_TRANSACTION",
        "account_transaction",
        txId,
        `Hareket iptal edildi: ${orig.description}`
      );
      return NextResponse.json({ success: true });
    }

    if (action === "add_collection_payment") {
      const cp = body.record;
      const amount = round2(Number(cp.amount) || 0);
      const rate = Number(cp.exchange_rate) || 1;
      const tl_amount = round2(amount * rate);

      if (amount <= 0) {
        return NextResponse.json(
          { success: false, error: "Tutar 0'dan büyük olmalıdır." },
          { status: 400 }
        );
      }

      // Idempotency / duplicate reference check
      if (cp.reference_no) {
        const { data: dup } = await supabase
          .from("collections_payments")
          .select("id")
          .eq("contact_id", cp.contact_id)
          .eq("kind", cp.kind)
          .eq("reference_no", String(cp.reference_no).trim())
          .eq("is_cancelled", false)
          .maybeSingle();

        if (dup) {
          return NextResponse.json(
            {
              success: false,
              error: `Bu referans numarası (${cp.reference_no}) ile daha önce işlem yapılmış.`,
            },
            { status: 409 }
          );
        }
      }

      // 1. Create corresponding ledger transaction
      // Tahsilat (collection) -> Alacak (credit), Ödeme (payment) -> Borç (debit)
      const isCollection = cp.kind === "collection";
      const { data: txData, error: txErr } = await supabase
        .from("account_transactions")
        .insert([
          {
            contact_id: cp.contact_id,
            transaction_date: cp.transaction_date,
            document_date: cp.transaction_date,
            document_no: cp.reference_no || null,
            transaction_type: isCollection ? "collection" : "payment",
            description:
              cp.description ||
              `${isCollection ? "Tahsilat" : "Ödeme"} (${cp.payment_method})`,
            debit: isCollection ? 0 : amount,
            credit: isCollection ? amount : 0,
            currency: cp.currency || "TRY",
            exchange_rate: rate,
            tl_debit: isCollection ? 0 : tl_amount,
            tl_credit: isCollection ? tl_amount : 0,
            created_by: actor,
          },
        ])
        .select()
        .single();

      if (txErr) {
        return NextResponse.json({ success: false, error: txErr.message });
      }

      // 2. Create collection/payment record linked to transaction
      const { data: cpData, error: cpErr } = await supabase
        .from("collections_payments")
        .insert([
          {
            contact_id: cp.contact_id,
            kind: cp.kind,
            transaction_date: cp.transaction_date,
            amount,
            currency: cp.currency || "TRY",
            exchange_rate: rate,
            tl_amount,
            payment_method: cp.payment_method,
            account_name: cp.account_name || null,
            reference_no: cp.reference_no || null,
            description: cp.description || null,
            linked_transaction_id: txData.id,
            created_by: actor,
          },
        ])
        .select()
        .single();

      if (cpErr) {
        return NextResponse.json({ success: false, error: cpErr.message });
      }

      await writeAudit(
        cp.contact_id,
        isCollection ? "ADD_COLLECTION" : "ADD_PAYMENT",
        "collections_payments",
        cpData.id,
        `${tl_amount} TL (${cp.payment_method})`
      );

      return NextResponse.json({ success: true, record: cpData, transaction: txData });
    }

    if (action === "upsert_reconciliation") {
      const rec = body.reconciliation;
      const { data, error } = await supabase
        .from("reconciliation_records")
        .upsert({
          ...(rec.id ? { id: rec.id } : {}),
          contact_id: rec.contact_id,
          start_date: rec.start_date,
          end_date: rec.end_date,
          balance_date: rec.balance_date,
          system_amount: round2(Number(rec.system_amount) || 0),
          system_direction: rec.system_direction || "Borç",
          counterparty_amount:
            rec.counterparty_amount !== null && rec.counterparty_amount !== undefined
              ? round2(Number(rec.counterparty_amount))
              : null,
          counterparty_direction: rec.counterparty_direction || null,
          difference_amount: round2(Number(rec.difference_amount) || 0),
          difference_note: rec.difference_note || null,
          status: rec.status || "preparing",
          shared_via: rec.shared_via || null,
          created_by: rec.created_by || actor,
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) {
        return NextResponse.json({ success: false, error: error.message });
      }

      await writeAudit(
        rec.contact_id,
        "RECONCILIATION_UPDATE",
        "reconciliation",
        data.id,
        `Durum: ${data.status}, Sistem: ${data.system_amount}`
      );
      return NextResponse.json({ success: true, reconciliation: data });
    }

    if (action === "add_note") {
      const n = body.note;
      const { data, error } = await supabase
        .from("contact_notes")
        .insert([
          {
            contact_id: n.contact_id,
            note_type: n.note_type || "note",
            content: n.content,
            created_by: actor,
          },
        ])
        .select()
        .single();
      if (error) return NextResponse.json({ success: false, error: error.message });
      return NextResponse.json({ success: true, note: data });
    }

    if (action === "add_document") {
      const d = body.document;
      const { data, error } = await supabase
        .from("contact_documents")
        .insert([
          {
            contact_id: d.contact_id,
            title: d.title,
            file_name: d.file_name,
            file_type: d.file_type || null,
            file_url: d.file_url || null,
            uploaded_by: actor,
          },
        ])
        .select()
        .single();
      if (error) return NextResponse.json({ success: false, error: error.message });
      return NextResponse.json({ success: true, document: data });
    }

    return NextResponse.json({ success: false, error: "Geçersiz işlem." }, { status: 400 });
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Sunucu hatası." },
      { status: 500 }
    );
  }
}
