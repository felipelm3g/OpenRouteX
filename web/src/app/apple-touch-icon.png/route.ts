export const runtime = 'edge';

export async function GET(req: Request) {
  const url = new URL('/favicon_OpenRouteX.png', req.url);
  return Response.redirect(url, 307);
}
