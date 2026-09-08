import { errorResponse, executeOperation } from "../../jimdur-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > 25 * 1024 * 1024) {
      return Response.json(
        { error: "El archivo supera el límite de 25 MB." },
        { status: 413 },
      );
    }
    return Response.json(await executeOperation(await request.json()));
  } catch (error) {
    return errorResponse(error);
  }
}
