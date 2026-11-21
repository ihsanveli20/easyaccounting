import { NextResponse } from "next/server";
import {
  computeAgingAndRisk,
  computeChronologicalLedger,
  computeContactBalance,
} from "../../../utils/currentAccountsEngine";
import {
  AccountTransaction,
  CollectionPaymentRecord,
  ContactCard,
} from "../../../types/currentAccounts";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const contact = body?.contact as ContactCard | undefined;
    const transactions = (body?.transactions || []) as AccountTransaction[];
    const collectionsPayments = (body?.collectionsPayments || []) as CollectionPaymentRecord[];

    if (!contact?.id) {
      return NextResponse.json(
        { success: false, error: "Geçersiz cari kartı." },
        { status: 400 }
      );
    }

    const contactTx = transactions.filter((t) => t.contact_id === contact.id);
    const ledger = computeChronologicalLedger(contactTx);
    const balance = computeContactBalance(contact.id, contactTx, collectionsPayments);
    const agingAndRisk = computeAgingAndRisk(contact, contactTx);

    return NextResponse.json({
      success: true,
      ledger,
      balance,
      agingAndRisk,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Bakiye doğrulanamadı.",
      },
      { status: 500 }
    );
  }
}

