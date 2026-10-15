// Same-origin RDW lookup: avoid browser-to-Worker CORS and provide a direct RDW fallback.
const RDW_SOURCE = "https://opendata.rdw.nl/resource/m9d7-ebf2.json";
const FUEL_SOURCE = "https://opendata.rdw.nl/resource/8ys7-d773.json";
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
  // Keep the legacy enriched vehicle data, with a direct RDW fallback.
  let data = [];
  try {
    data = await getJson(LEGACY_WORKER + "?kenteken=" + encoded, 3500);
  } catch (error) { console.warn("Legacy RDW worker unavailable:", error.message); }
  if (!data.length) {
    try {
      data = await getJson(RDW_SOURCE + "?kenteken=" + encoded + "&%24limit=1", 8500);
    } catch (error) {
      console.error("RDW lookup unavailable:", error.message);
      return res.status(502).json({ error: "RDW is tijdelijk niet bereikbaar. Probeer het later opnieuw." });
    }
  }
  if (!data.length) return res.status(200).json([]);
  // The base register usually has no fuel or engine power. Enrich it using
  // RDW's separate public fuel register; never guess missing specifications.
  try {
    const fuels = await getJson(FUEL_SOURCE + "?kenteken=" + encoded + "&%24limit=10", 5000);
    if (fuels.length) {
      const ordered = fuels.slice().sort((a,b)=>Number(a.brandstof_volgnummer||0)-Number(b.brandstof_volgnummer||0));
      const names = [...new Set(ordered.map(f=>f.brandstof_omschrijving).filter(Boolean))];
      const combustion = ordered.find(f=>f.nettomaximumvermogen && Number(f.nettomaximumvermogen)>0);
      const electric = ordered.find(f=>f.nominaal_continu_maximumvermogen && Number(f.nominaal_continu_maximumvermogen)>0);
      const fuel = ordered.find(f=>f.emissiecode_omschrijving||f.brandstofverbruik_gecombineerd||f.co2_uitstoot_gecombineerd);
      data[0] = {
        ...data[0],
        brandstof: names.join(" + ") || data[0].brandstof,
        brandstoffen: names,
        vermogen: data[0].vermogen || (combustion && combustion.nettomaximumvermogen) || null,
        elektrisch_vermogen: electric && electric.nominaal_continu_maximumvermogen || null,
        emissieklasse: data[0].emissieklasse || (fuel && fuel.emissiecode_omschrijving) || null,
        brandstofverbruik_gecombineerd: fuel && fuel.brandstofverbruik_gecombineerd || null,
        co2_emissie: data[0].co2_emissie || (fuel && fuel.co2_uitstoot_gecombineerd) || null,
        brandstof_bron: "RDW Open Data - Gekentekende voertuigen brandstof"
      };
    }
  } catch (error) {
    console.warn("RDW fuel data unavailable:", error.message);
  }
  return res.status(200).json(data);
};
