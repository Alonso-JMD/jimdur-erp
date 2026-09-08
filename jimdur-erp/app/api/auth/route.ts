import {
  changeOwnPassword,
  createRecoveryKey,
  errorResponse,
  getAuthStatus,
  loginUser,
  logoutUser,
  recoverPassword,
  setupAdmin,
} from "../../jimdur-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    return Response.json(await getAuthStatus(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    switch (payload.action) {
      case "setup":
        return Response.json(await setupAdmin(payload, request));
      case "login":
        return Response.json(await loginUser(payload, request));
      case "recover_password":
        return Response.json(await recoverPassword(payload, request));
      case "logout":
        return Response.json(await logoutUser());
      case "change_password":
        return Response.json(await changeOwnPassword(payload));
      case "create_recovery_key":
        return Response.json(await createRecoveryKey(payload));
      default:
        return Response.json(
          { error: "Acción de acceso no reconocida." },
          { status: 400 },
        );
    }
  } catch (error) {
    return errorResponse(error);
  }
}
