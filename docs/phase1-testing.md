# Carfacts 2.0 — fase 1

Scope: alleen GitHub-branch test/vwe-interdata en preview test.car-facts.nl. De bestaande HTML/CSS/JavaScript-app blijft in gebruik. Geen productiepromotie of echte VWE-aanvragen.

## Nieuw

- src/contracts/vwe.ts — strikte TypeScript-typen voor datasetresultaten, foutcodes en voertuigen.
- api/_vwe-validation.js — Zod-validatie van inkomende VWE-responses en OAuth-tokens. Extra velden blijven behouden voor toekomstige uitbreiding. Een bekend veld met een verkeerd type veroorzaakt een veilige, niet-gedetailleerde 502-fout (VWE_INVALID_DATA).
- tests/unit/vwe-validation.test.cjs — offline tests voor tokenvormen, bekende en onbekende velden en lege datasets.
- tests/fixtures/static-server.cjs — statische lokale server die /api/ altijd blokkeert.
- tests/e2e/vehicle.spec.ts — Playwright-tests met gesimuleerde VWE-antwoorden en afbeeldingen; externe netwerkverbindingen worden geblokkeerd.
- .github/workflows/preview-quality.yml — offline kwaliteitscontrole voor de testbranch zonder API-sleutels.

## Lokaal gebruiken

Vereist Node.js 20+.

1. npm install
2. npm run typecheck
3. npm run test:contracts
4. npx playwright install chromium
5. npm run test:e2e

Let op: npm test voert alle bovenstaande controles uit (behalve de eenmalige browserinstallatie).

## Belangrijke beperkingen

- TypeScript is eerst als contractlaag toegevoegd; een volledige frontend-migratie is bewust niet gedaan.
- Zod bewaakt gedeclareerde veldtypen, niet de feitelijke juistheid of volledigheid van VWE-informatie.
- Lege historie betekent niet automatisch dat het voertuig nooit reparaties had.
- Fototests gebruiken synthetische afbeeldingen en verrichten geen Wikimedia-verzoeken.
- Chromium-runs via de lokale testserver zijn niet hetzelfde als een ingelogde test van het echte Vercel-domein.
- Het GitHub-workflow gebruikt geen VWE-, Redis- of betaalprovidergeheimen en wijzigt productie niet.
