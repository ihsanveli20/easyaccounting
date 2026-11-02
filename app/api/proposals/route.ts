import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabaseServerClient() {
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

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

// Helper to unpack proposal_number and metadata
export function unpackProposalNumber(raw: string | null | undefined): {
  displayNumber: string;
  metadata?: any;
} {
  if (!raw) return { displayNumber: "TEK-0000" };
  const separatorIndex = raw.indexOf("::");
  if (separatorIndex === -1) {
    return { displayNumber: raw };
  }
  const displayNumber = raw.substring(0, separatorIndex).trim();
  const metaStr = raw.substring(separatorIndex + 2).trim();
  try {
    const metadata = JSON.parse(metaStr);
    return { displayNumber, metadata };
  } catch {
    return { displayNumber };
  }
}

// Helper to pack proposal_number and metadata
export function packProposalNumber(displayNumber: string, metadata?: any): string {
  const cleanNumber = (displayNumber || "TEK-0000").trim();
  if (!metadata || Object.keys(metadata).length === 0) {
    return cleanNumber;
  }
  return `${cleanNumber}::${JSON.stringify(metadata)}`;
}

// GET all proposals with customers and items
export async function GET(request: Request) {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { success: false, message: "Supabase connection not configured", proposals: [] },
      { status: 200 }
    );
  }

  try {
    const { data, error } = await supabase
      .from("proposals")
      .select(`
        id,
        customer_id,
        proposal_number,
        status,
        total_amount,
        created_at,
        customer:customers(id, name),
        items:proposal_items(
          id,
          proposal_id,
          product_id,
          quantity,
          unit_price,
          total_price,
          created_at,
          product:products(id, name, unit_of_measure, sale_price, internal_reference)
        )
      `)
      .order("id", { ascending: false });

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message, proposals: [] },
        { status: 200 }
      );
    }

    const proposals = (data || []).map((p) => {
      const { displayNumber, metadata } = unpackProposalNumber(p.proposal_number);
      return {
        id: p.id,
        customer_id: p.customer_id,
        proposal_number: displayNumber,
        raw_proposal_number: p.proposal_number,
        status: p.status || "draft",
        total_amount: Number(p.total_amount) || 0,
        created_at: p.created_at,
        customer: p.customer || null,
        items: (p.items || []).map((item: any) => ({
          id: item.id,
          proposal_id: item.proposal_id,
          product_id: item.product_id,
          quantity: Number(item.quantity) || 0,
          unit_price: Number(item.unit_price) || 0,
          total_price: Number(item.total_price) || 0,
          product: item.product || null,
        })),
        metadata: metadata || null,
      };
    });

    return NextResponse.json({
      success: true,
      count: proposals.length,
      proposals,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Proposals fetch failed", proposals: [] },
      { status: 500 }
    );
  }
}

// POST create proposal
export async function POST(request: Request) {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { success: false, message: "Supabase connection not configured" },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    const {
      customer_id,
      proposal_number,
      status = "draft",
      total_amount = 0,
      items = [],
      metadata = {},
    } = body;

    // Generate proposal number if not provided
    let finalProposalNumber = (proposal_number || "").trim();
    if (!finalProposalNumber) {
      const year = new Date().getFullYear();
      const { count } = await supabase
        .from("proposals")
        .select("id", { count: "exact", head: true });
      const nextSeq = String((count || 0) + 1).padStart(4, "0");
      finalProposalNumber = `TEK-${year}-${nextSeq}`;
    }

    const packedNumber = packProposalNumber(finalProposalNumber, metadata);

    // 1. Insert proposal
    const { data: propData, error: propErr } = await supabase
      .from("proposals")
      .insert({
        customer_id: customer_id ? Number(customer_id) : null,
        proposal_number: packedNumber,
        status: status || "draft",
        total_amount: Number(total_amount) || 0,
      })
      .select()
      .single();

    if (propErr || !propData) {
      return NextResponse.json(
        { success: false, error: propErr?.message || "Failed to create proposal" },
        { status: 400 }
      );
    }

    const proposalId = propData.id;

    // 2. Insert items if any (note: total_price is a generated column in DB, do not include!)
    if (Array.isArray(items) && items.length > 0) {
      const itemsToInsert = items.map((item: any) => ({
        proposal_id: proposalId,
        product_id: item.product_id ? Number(item.product_id) : null,
        quantity: typeof item.quantity === "number" ? item.quantity : parseFloat(String(item.quantity)) || 1,
        unit_price: typeof item.unit_price === "number" ? item.unit_price : parseFloat(String(item.unit_price)) || 0,
      }));

      const { error: itemsErr } = await supabase
        .from("proposal_items")
        .insert(itemsToInsert);

      if (itemsErr) {
        console.warn("Error inserting proposal items:", itemsErr);
      }
    }

    return NextResponse.json({
      success: true,
      proposal: {
        id: propData.id,
        proposal_number: finalProposalNumber,
        status: propData.status,
        total_amount: propData.total_amount,
        created_at: propData.created_at,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Proposal create failed" },
      { status: 500 }
    );
  }
}

// PUT update proposal
export async function PUT(request: Request) {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { success: false, message: "Supabase connection not configured" },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    const {
      id,
      customer_id,
      proposal_number,
      status,
      total_amount,
      items,
      metadata,
    } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Proposal ID is required for update" },
        { status: 400 }
      );
    }

    const cleanDisplayNumber = (proposal_number || `TEK-${id}`).trim();
    const packedNumber = packProposalNumber(cleanDisplayNumber, metadata);

    // 1. Update proposal row
    const updatePayload: Record<string, any> = {
      proposal_number: packedNumber,
    };
    if (customer_id !== undefined) {
      updatePayload.customer_id = customer_id ? Number(customer_id) : null;
    }
    if (status !== undefined) {
      updatePayload.status = status;
    }
    if (total_amount !== undefined) {
      updatePayload.total_amount = Number(total_amount) || 0;
    }

    const { data: updatedProp, error: propErr } = await supabase
      .from("proposals")
      .update(updatePayload)
      .eq("id", id)
      .select()
      .single();

    if (propErr) {
      return NextResponse.json(
        { success: false, error: propErr.message },
        { status: 400 }
      );
    }

    // 2. Replace items if provided
    if (Array.isArray(items)) {
      // Delete old items
      await supabase.from("proposal_items").delete().eq("proposal_id", id);

      if (items.length > 0) {
        const itemsToInsert = items.map((item: any) => ({
          proposal_id: id,
          product_id: item.product_id ? Number(item.product_id) : null,
          quantity: typeof item.quantity === "number" ? item.quantity : parseFloat(String(item.quantity)) || 1,
          unit_price: typeof item.unit_price === "number" ? item.unit_price : parseFloat(String(item.unit_price)) || 0,
        }));

        const { error: itemsErr } = await supabase
          .from("proposal_items")
          .insert(itemsToInsert);

        if (itemsErr) {
          console.warn("Error inserting updated proposal items:", itemsErr);
        }
      }
    }

    return NextResponse.json({
      success: true,
      proposal: {
        id: updatedProp.id,
        proposal_number: cleanDisplayNumber,
        status: updatedProp.status,
        total_amount: updatedProp.total_amount,
        created_at: updatedProp.created_at,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Proposal update failed" },
      { status: 500 }
    );
  }
}

// DELETE proposal
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const idStr = searchParams.get("id");
  const id = idStr ? Number(idStr) : null;

  if (!id) {
    return NextResponse.json(
      { success: false, error: "Valid proposal ID is required" },
      { status: 400 }
    );
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { success: false, message: "Supabase connection not configured" },
      { status: 500 }
    );
  }

  try {
    // 1. Delete proposal items
    await supabase.from("proposal_items").delete().eq("proposal_id", id);

    // 2. Delete proposal
    const { error: propErr } = await supabase
      .from("proposals")
      .delete()
      .eq("id", id);

    if (propErr) {
      return NextResponse.json(
        { success: false, error: propErr.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Proposal deleted successfully",
      id,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Proposal delete failed" },
      { status: 500 }
    );
  }
}
