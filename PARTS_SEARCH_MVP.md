# PartFinder — international used-parts search MVP

## What is included

- A responsive standalone frontend at `parts/index.html`.
- Search term / OEM number input.
- Country scope: Netherlands, Germany, Poland, Lithuania, Belgium, Europe, international, or custom countries.
- Source selection for Onderdelenlijn, Schadeautos.nl, Marktplaats, Eurostock, RRR.lt, Kleinanzeigen, eBay and Allegro.pl.
- Search links for selected sources. The current prototype uses Google-indexed domain queries to avoid scraping or falsely presenting unverified listings as live results.
- Optional Supabase SQL schema for users' saved search preferences.

## Important MVP limitation

This is **not yet a live aggregated listing search**. It creates links that open indexed search results on a per-source basis. It does not retrieve, store, deduplicate or claim availability/prices for third-party advertisements. The Eurostock domain and all source-specific search behavior must be verified with the relevant provider before launch.

A true combined-results search needs official API/feed/partner access and permission to display the returned fields, images, prices, links and cached data.

## Project structure

```text
parts/
  index.html
supabase/
  parts-search-schema.sql
PARTS_SEARCH_MVP.md
```

## Test locally

1. Open `parts/index.html` directly in a browser.
2. Search for an example such as `VW Golf 7 koplamp links` or an OEM number.
3. Select countries and sources.
4. Open the generated source search links.

No API keys or secrets are needed for this static prototype.

## Deploy to the existing Vercel project

1. Review this branch: `feature/international-parts-search-mvp`.
2. If the `lapronti/carfacts` GitHub repository is connected to Vercel and Preview Deployments are enabled, Vercel should create a preview for the branch. Check the Vercel dashboard for the generated URL; do not assume a URL before Vercel confirms it.
3. If the project deploys the repository root as a static site, the page should be available at `/parts/`. If the current Vercel build settings do not serve static subdirectories, adjust the project output configuration or deploy this folder as a separate project.
4. Do not merge into `main` until the preview has been checked.
5. Vercel Hobby is for personal, non-commercial use under its current terms. Use an appropriate paid plan before operating this as a commercial service.

## Optional Supabase setup

1. Open the Supabase project intended for this application.
2. Go to SQL Editor.
3. Review and run `supabase/parts-search-schema.sql`.
4. This creates `public.parts_saved_searches` with row-level security. Users can only access their own saved searches.
5. The frontend does not connect to Supabase yet. Do not add service-role keys to frontend code. When authentication is added, use the publishable/anon key with RLS, and keep any privileged key server-side only.

## Provider access checklist

| Source | Next step before live aggregation |
|---|---|
| Onderdelenlijn | Ask about Autonet XML webservices, commercial display, limits, pricing, and caching. |
| eBay | Apply for the relevant production API access and check affiliate / display rules. Production access is not guaranteed. |
| Schadeautos.nl | Ask whether a supported API, feed, or partner integration exists for the parts section. |
| Marktplaats | Confirm API access and permission for commercial metasearch display. |
| Eurostock | Verify the exact provider/domain and request API/partner documentation. |
| RRR.lt | Request approved search/feed/partner access. |
| Kleinanzeigen | Verify current official API or partnership options. |
| Allegro.pl | Review the official API scopes and terms for a commercial comparison service. |

## Next development milestone

Add one real source adapter only after written access and credentials are available. Normalize returned items into a shared schema (source, external_id, title, price, currency, country, item_url, image_url, last_seen) and obey the provider's caching and attribution requirements.
