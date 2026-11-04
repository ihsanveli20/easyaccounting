import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabaseAdmin() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    "https://qcndlfastbrezugknkho.supabase.co";

  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    "sb_publishable_v4dm0IbGdRMmClfmWWm-Rg_tVsDZwSJ";

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

const BUCKET_NAME = "qurban-media";

/**
 * Ensures the target storage bucket exists and is public
 */
async function ensureBucketExists(supabase: any) {
  try {
    const { data: buckets } = await supabase.storage.listBuckets();
    const exists = buckets?.some((b: any) => b.name === BUCKET_NAME);
    if (!exists) {
      await supabase.storage.createBucket(BUCKET_NAME, {
        public: true,
        fileSizeLimit: 10485760, // 10MB limit (compressed images are ~200KB)
        allowedMimeTypes: ["image/webp", "image/jpeg", "image/png", "application/pdf"],
      });
    }
  } catch (err) {
    // Non-fatal, bucket might already exist or service key might lack bucket admin
    console.warn("Storage bucket check warning:", err);
  }
}

/**
 * POST /api/upload
 * Optimized image upload to Supabase Storage with permanent CDN caching
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    await ensureBucketExists(supabase);

    const contentType = req.headers.get("content-type") || "";
    let buffer: Buffer;
    let fileName = "";
    let mimeType = "image/webp";
    let folder = "general";

    if (contentType.includes("application/json")) {
      const body = await req.json();
      const { dataUrl, fileName: customName, folder: targetFolder } = body;

      if (!dataUrl || !dataUrl.startsWith("data:")) {
        return NextResponse.json(
          { success: false, error: "Geçersiz dataUrl parametresi" },
          { status: 400 }
        );
      }

      if (targetFolder) folder = targetFolder.replace(/[^a-zA-Z0-9_-]/g, "");

      const matches = dataUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (!matches || matches.length !== 3) {
        return NextResponse.json(
          { success: false, error: "DataURL base64 formatı çözülemedi" },
          { status: 400 }
        );
      }

      mimeType = matches[1];
      buffer = Buffer.from(matches[2], "base64");
      const ext = mimeType.split("/")[1] || "webp";
      const cleanName = (customName || `img_${Date.now()}`)
        .replace(/\.[^/.]+$/, "")
        .replace(/[^a-zA-Z0-9_-]/g, "_");

      fileName = `${folder}/${cleanName}_${Date.now()}.${ext}`;
    } else if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      const targetFolder = formData.get("folder") as string | null;

      if (!file) {
        return NextResponse.json(
          { success: false, error: "Dosya bulunamadı" },
          { status: 400 }
        );
      }

      if (targetFolder) folder = targetFolder.replace(/[^a-zA-Z0-9_-]/g, "");

      mimeType = file.type || "image/webp";
      const arrayBuffer = await file.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
      const ext = mimeType.split("/")[1] || "webp";
      const cleanName = file.name
        .replace(/\.[^/.]+$/, "")
        .replace(/[^a-zA-Z0-9_-]/g, "_");

      fileName = `${folder}/${cleanName}_${Date.now()}.${ext}`;
    } else {
      return NextResponse.json(
        { success: false, error: "Desteklenmeyen içerik türü" },
        { status: 400 }
      );
    }

    // Upload to Supabase Storage with 1 YEAR immutable CDN Cache-Control
    // This reduces Supabase Egress bandwidth to near ZERO on repeat visits!
    const { error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(fileName, buffer, {
        contentType: mimeType,
        cacheControl: "31536000, public", // 1 year cache
        upsert: true,
      });

    if (uploadError) {
      console.warn("Supabase Storage upload error:", uploadError.message);
      return NextResponse.json(
        {
          success: false,
          error: `Storage yükleme hatası: ${uploadError.message}`,
        },
        { status: 500 }
      );
    }

    // Get public URL
    const { data: publicUrlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(fileName);

    const publicUrl = publicUrlData?.publicUrl || "";

    return NextResponse.json({
      success: true,
      url: publicUrl,
      path: fileName,
      size: buffer.length,
      mimeType,
      cacheControl: "31536000, public",
    });
  } catch (err: any) {
    console.error("Upload API error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Bilinmeyen sunucu hatası" },
      { status: 500 }
    );
  }
}
