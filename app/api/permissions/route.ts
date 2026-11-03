import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import {
  AppPermissionsConfig,
  DEFAULT_PERMISSIONS_CONFIG,
  DEFAULT_ROLE_PERMISSIONS,
} from "../../utils/permissions";

const DATA_DIR = path.join(process.cwd(), "data");
const PERMISSIONS_FILE = path.join(DATA_DIR, "permissions.json");

async function ensurePermissionsFile(): Promise<AppPermissionsConfig> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    try {
      const data = await fs.readFile(PERMISSIONS_FILE, "utf-8");
      const parsed = JSON.parse(data);
      if (parsed && parsed.rolePermissions) {
        return {
          rolePermissions: {
            ...DEFAULT_ROLE_PERMISSIONS,
            ...parsed.rolePermissions,
          },
          userPermissions: parsed.userPermissions || {},
        };
      }
    } catch {
      // File doesn't exist or is invalid JSON, create with default
      await fs.writeFile(
        PERMISSIONS_FILE,
        JSON.stringify(DEFAULT_PERMISSIONS_CONFIG, null, 2),
        "utf-8"
      );
      return DEFAULT_PERMISSIONS_CONFIG;
    }
  } catch (err) {
    console.warn("Failed to ensure permissions file:", err);
  }
  return DEFAULT_PERMISSIONS_CONFIG;
}

export async function GET() {
  try {
    const permissions = await ensurePermissionsFile();
    return NextResponse.json({
      success: true,
      permissions,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: err?.message || "Failed to load permissions",
        permissions: DEFAULT_PERMISSIONS_CONFIG,
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { rolePermissions, userPermissions } = body;

    const current = await ensurePermissionsFile();

    // Admin safety check: ensure admin always retains admin-users
    const updatedRolePermissions = {
      ...current.rolePermissions,
      ...(rolePermissions || {}),
    };
    if (
      updatedRolePermissions.admin &&
      !updatedRolePermissions.admin.includes("admin-users")
    ) {
      updatedRolePermissions.admin.push("admin-users");
    }

    const updatedConfig: AppPermissionsConfig = {
      rolePermissions: updatedRolePermissions,
      userPermissions: userPermissions !== undefined ? userPermissions : current.userPermissions,
    };

    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(
      PERMISSIONS_FILE,
      JSON.stringify(updatedConfig, null, 2),
      "utf-8"
    );

    return NextResponse.json({
      success: true,
      message: "Menü yetkileri başarıyla güncellendi ve kaydedildi.",
      permissions: updatedConfig,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: err?.message || "Yetki ayarları kaydedilemedi.",
      },
      { status: 500 }
    );
  }
}
