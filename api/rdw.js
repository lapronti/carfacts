// Same-origin RDW lookup: avoid browser-to-Worker CORS and provide a direct RDW fallback.
const RDW_SOURCE = "https://opendata.rdw.nl/resource/m9d7-ebf2.json";
const LEGACY_WORKER = "https://carfacts-rdw.nlaghmiri.workers.dev/api/rdw";
async function getJson(url, timeout = 8500) {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeout), headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("Upstream HTTP " + response.status);
  const data = await response.json();
  if (!Array.isArray(data)) throw new Error("Unexpected RDW response");
  return data;
}
module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "public, s-maxage=120, stale-while-revalidate=300");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (req.method !== "GET") { res.setHeader("Allow", "GET"); return res.status(405).json({ error: "Alleen GET toegestaan" }); }
  const plate = String(req.query.kenteken || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!/^[A-Z0-9]{4,8}$/.test(plate)) return res.status(400).json({ error: "Ongeldig kenteken" });
  const encoded = encodeURIComponent(plate);
  // Prefer the existing enriched response, but fall back to the official RDW register.
  try {
    const data = await getJson(LEGACY_WORKER + "?kenteken=" + encoded, 3500);
    if (data.length) return res.status(200).json(data);
  } catch (error) { console.warn("Legacy RDW worker unavailable:", error.message); }
  try {
    const url = RDW_SOURCE + "?kenteken=" + encoded + "&%24limit=1";
    const data = await getJson(url, 8500);
    return res.status(200).json(data);
  } catch (error) {
    console.error("RDW lookup unavailable:", error.message);
    return res.status(502).json({ error: "RDW is tijdelijk niet bereikbaar. Probeer het later opnieuw." });
  }
};
