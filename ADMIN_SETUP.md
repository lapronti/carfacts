# Carfacts Admin — configuratie

De pagina `/admin/` en serverless endpoints zijn toegevoegd. **Er worden pas statistieken opgeslagen zodra een Upstash Redis REST-database en de onderstaande Vercel environment variables zijn ingesteld.** Zonder configuratie geeft `/api/track` HTTP 503 terug; de openbare website blijft werken.

Stel in bij Vercel → Project carfacts → Settings → Environment Variables (Production):
- `UPSTASH_REDIS_REST_URL`: REST endpoint van de eigen Upstash Redis-database.
- `UPSTASH_REDIS_REST_TOKEN`: geheime REST token voor die database.
- `CARFACTS_ADMIN_PASSWORD`: uniek, lang wachtwoord voor de beheerder.
- `CARFACTS_ADMIN_SECRET`: willekeurige geheime sleutel van minimaal 32 bytes.

Ook de alternatieve variabelen `KV_REST_API_URL` en `KV_REST_API_TOKEN` worden ondersteund. **Geen van deze waarden in GitHub committen.** Herdeploy daarna de production-versie.

Open `https://car-facts.nl/admin/` en log in. De sessiecookie is HttpOnly, Secure, SameSite Strict en verloopt na 8 uur. Loginpogingen zijn beperkt tot 8 mislukte pogingen per IP-adres per 15 minuten. Gebruik voor productie bij voorkeur een extra Vercel/identity access layer met MFA; deze versie heeft **nog geen 2FA**.

## Verzameling en privacy
- De registratie gebeurt uitsluitend na de bestaande opt-in voor analytics.
- Dagelijkse tellers voor page_view, plate_search, parts_search, outbound_click en pro_interest (voor PRO-interesse moet nog een specifieke CTA worden aangesloten).
- Kentekens worden genormaliseerd en per dag als teller opgeslagen. VIN-nummers en IP-adressen worden niet als analytics-events opgeslagen.
- De dagelijkse Redis-sleutels krijgen een vervaltijd van 100 dagen.
- Externe links naar aanbieders worden alleen als broncategorie geteld; geen bestemmings-URL of individuele bezoekers-ID.
- Voeg deze gegevensverwerking en bewaartermijn toe aan de privacyverklaring vóór activering. Overweeg of volledige kentekens nodig zijn; die kunnen persoonsgegevens zijn.
- Het dashboard toont aantallen gebeurtenissen, **geen unieke bezoekers**. 'Paginabezoeken' zijn geen unieke gebruikers.
- Bestaande data van vóór activatie kan niet worden gereconstrueerd.

## Test na configuratie
1. Bezoek de site in een privévenster en weiger analytics: er mogen geen requests naar `/api/track` plaatsvinden.
2. Geef toestemming en herlaad: `page_view` moet in het dashboard zichtbaar worden.
3. Zoek een kenteken en onderdeel, klik op een externe aanbieder, controleer de drie tellers.
4. Test dat `/api/admin` zonder login HTTP 401 geeft en dat de admin-cookie niet beschikbaar is via JavaScript.
5. Controleer de weergave op mobiel.

Deze integratie is **niet live end-to-end getest** zolang de database en secrets ontbreken.
