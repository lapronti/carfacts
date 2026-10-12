const MARKETPLACES = {
  NL: "EBAY_NL",
  DE: "EBAY_DE",
  PL: "EBAY_PL",
  BE: "EBAY_BE",
  GB: "EBAY_GB",
  FR: "EBAY_FR",
  IT: "EBAY_IT",
  ES: "EBAY_ES",
  US: "EBAY_US"
};

function send(res, status, payload) {
  res.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  return res.json(payload);
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return send(res, 405, { error: "Alleen GET-verzoeken zijn toegestaan." });
  }

  const q = String(req.query.q || "").trim().slice(0, 180);
  const country = String(req.query.country || "NL").toUpperCase();
  const marketplace = MARKETPLACES[country];

  if (!q) return send(res, 400, { error: "Vul een onderdeel of OEM-nummer in." });
  if (!marketplace) return send(res, 400, { error: "Dit eBay-land wordt nog niet ondersteund." });

  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  const environment = (process.env.EBAY_ENVIRONMENT || "sandbox").toLowerCase();
  const apiHost = environment === "production"
    ? "https://api.ebay.com"
    : "https://api.sandbox.ebay.com";

  if (!clientId || !clientSecret) {
    return send(res, 503, {
      error: "eBay is nog niet volledig ingesteld. Controleer de EBAY_CLIENT_ID en EBAY_CLIENT_SECRET-variabelen in Vercel."
    });
  }

  try {
    const credentials = Buffer.from(clientId + ":" + clientSecret).toString("base64");
    const tokenResponse = await fetch(apiHost + "/identity/v1/oauth2/token", {
      method: "POST",
      headers: {
        Authorization: "Basic " + credentials,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        scope: "https://api.ebay.com/oauth/api_scope"
      })
    });

    if (!tokenResponse.ok) {
      const details = await tokenResponse.text();
      console.error("eBay OAuth failed:", tokenResponse.status, details.slice(0, 500));
      return send(res, 502, {
        error: "eBay kon geen toegangstoken geven. Controleer of de Production- of Sandbox-sleutels bij de gekozen API-omgeving horen."
      });
    }

    const token = await tokenResponse.json();
    const searchUrl = new URL(apiHost + "/buy/browse/v1/item_summary/search");
    searchUrl.searchParams.set("q", q);
    searchUrl.searchParams.set("limit", "12");
    // Keep the selected eBay marketplace separate from the actual item location.
    // This ensures choosing NL returns items located in the Netherlands, not merely listings visible on eBay NL.
    searchUrl.searchParams.set("filter", "buyingOptions:{FIXED_PRICE},itemLocationCountry:" + country);
    const requestedSort = String(req.query.sort || "relevance");
    const apiSort = {
      "price-asc": "price",
      "price-desc": "-price",
      "newest": "newlyListed",
      "relevance": "bestMatch"
    }[requestedSort];
    if (apiSort) searchUrl.searchParams.set("sort", apiSort);

    const searchResponse = await fetch(searchUrl, {
      headers: {
        Authorization: "Bearer " + token.access_token,
        "X-EBAY-C-MARKETPLACE-ID": marketplace,
        "Accept": "application/json"
      }
    });

    if (!searchResponse.ok) {
      const details = await searchResponse.text();
      console.error("eBay Browse API failed:", searchResponse.status, details.slice(0, 500));
      return send(res, 502, {
        error: "eBay heeft de zoekopdracht geweigerd. Controleer API-toegang en marketplace-instellingen."
      });
    }

    const data = await searchResponse.json();
    const items = (data.itemSummaries || []).map(item => ({
      title: item.title || "eBay-aanbieding",
      url: item.itemWebUrl || "",
      image: item.image && item.image.imageUrl ? item.image.imageUrl : "",
      price: item.price && item.price.value ? item.price.value : "",
      currency: item.price && item.price.currency ? item.price.currency : "",
      condition: item.condition || "",
      seller: item.seller && item.seller.username ? item.seller.username : "",
      uploadedAt: item.itemCreationDate || item.itemOriginDate || ""
    })).filter(item => item.url);

    return send(res, 200, {
      items,
      total: Number(data.total || items.length),
      message: items.length ? "" : "Geen aanbiedingen gevonden. Probeer een andere zoekterm."
    });
  } catch (error) {
    console.error("eBay search error:", error && error.message ? error.message : error);
    return send(res, 500, { error: "Er ging iets mis bij het ophalen van eBay-resultaten." });
  }
};
