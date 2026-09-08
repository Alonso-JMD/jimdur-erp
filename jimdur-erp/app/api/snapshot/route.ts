import { errorResponse, getSnapshot, requireAppUser } from "../../jimdur-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireAppUser();
    return Response.json(await getSnapshot(user), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
