export async function GET() {
  // Public map keys are intentionally browser visible; provider-side domain restrictions are required.
  return Response.json({airlineDetails:Boolean(process.env.FLIGHTAWARE_API_KEY && process.env.ENABLE_FLIGHTAWARE==='true'),maptilerKey:process.env.MAPTILER_PUBLIC_KEY || null},{headers:{'Cache-Control':'private, max-age=60'}});
}
