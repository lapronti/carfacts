# Mijn Carfacts 2.0 — Preview MVP

## Scope

Branch: test/vwe-interdata.
Pagina: https://test.car-facts.nl/mijn-carfacts/
API-routes: /api/mycarfacts-auth, /api/mycarfacts-vehicles en /api/mycarfacts-reports.

Alle klant-API's zijn uitsluitend actief wanneer VERCEL_ENV=preview. In productie reageren ze met 404. Geen betaalde VWE-requests, rapportgeneratie, betaalintegraties of wijzigingen aan de bestaande live site.

Er is geen Supabase-database voor Carfacts aangesloten. Het enige gekoppelde Supabase-project hoort bij MAE Safety en wordt niet gebruikt of veranderd.

## Functionaliteit

1. Passwordless accounttoegang via eenmalige zescijferige e-mailcode, tien minuten geldig.
2. Persoonlijke sessie via een willekeurig 256-bit HttpOnly + Secure + SameSite=Strict-cookie, scope /api/mycarfacts, server-side TTL maximaal 14 dagen.
3. Per gebruiker geïsoleerde voertuigopslag met gehashte tenant-ID op basis van e-mail en een servergeheim.
4. Bewaren, bekijken en wissen van maximaal 25 zelf ingevoerde kentekens en beschrijvingen.
5. Alle eigen opslag wissen en uitloggen.
6. Alleen-lezen toekomstig PRO-archief (geen aankopen mogelijk).
7. Knop in het kentekendashboard om een voertuig na het ophalen op te slaan.
8. Fictieve, alleen-lezen voorbeeldmodus zonder account; geen opslag of acties.

## Vercel Preview-configuratie

Voor de opslag:
- KV_REST_API_URL of UPSTASH_REDIS_REST_URL
- KV_REST_API_TOKEN of UPSTASH_REDIS_REST_TOKEN
- CARFACTS_PORTAL_SECRET (aanbevolen: afzonderlijk willekeurig geheim van minstens 24 tekens). De bestaande preview-adminsecret kan tijdelijk dienen als fallback, uitsluitend via cryptografisch domeingescheiden HMAC.

Voor de mailcode-login:
- SMTP_HOST
- SMTP_PORT: 465 (TLS) of 587 (STARTTLS)
- MAIL_USER
- MAIL_PASSWORD
- CARFACTS_PORTAL_MAIL_FROM (optioneel; afzender moet toegestaan zijn).

Deze SMTP-instellingen zijn alleen bij het Vercel Production-target gevonden en bewust niet gekopieerd. Daardoor is aanmelden in Preview nog niet actief. De pagina laat dit zien en biedt een voorbeeldmodus. Configureer bij voorkeur een apart testpostvak met eigen e-mailcredentials, SPF/DKIM en mailquota. Gebruik geen echte klantgegevens bij testen.

## Beveiliging en privacy

- Admin- en klantensessies zijn volledig gescheiden.
- De client bewaart geen sessietokens in localStorage of sessionStorage.
- Alle mutaties vereisen een geverifieerde klantensessie plus gelijke HTTPS-Origin.
- E-mail- en IP-rate limiting voor OTP, beperkte codepogingen.
- Een OTP wordt na correcte controle met Redis GETDEL atomair opgebruikt.
- Geen e-mailadressen in Redis-sleutelnamen of beveiligingslogs.
- API neemt gebruiker-ID alleen uit de geverifieerde sessie; niet uit query/body.
- Klanten kunnen uitsluitend hun eigen opgeslagen voertuigen ophalen.
- Kenteken, merk, model en label worden op de server gevalideerd.
- Opslag bevat geen VWE-voertuigdata, VIN, eigendomsbewijs, onderhoudshistorie of betaalinformatie.
- Eigengemaakte namen worden als tekst getoond, niet als HTML uitgevoerd.
- PRO-rapporten zijn nog niet te bestellen of aan te maken door klanten.
- Accountdata blijven bewaard totdat de eigenaar ze wist; OTP maximaal 10 minuten en sessies maximaal 14 dagen. Login-rate-limits verlopen binnen een uur.

## Automatisch testen

Gebruik Node.js 20+:
1. npm install
2. npm run typecheck
3. npm run test:contracts
4. npx playwright install chromium
5. npm run test:e2e

GitHub Actions voert deze controles uit op de testbranch. Tests gebruiken uitsluitend een lokale static server met mock API's, mock SMTP en mock Redis; ze verzenden geen echte e-mail en doen geen VWE-requests.

## Nog nodig voor een live klantentest

Stel de eigen Preview-SMTP-variabelen in Vercel in. Test dan een echte e-mailcode en controleer de mailbox-/domeininstellingen. Voor PRO-rapporten zijn later expliciet geverifieerde betaalrechten, rapporttoegang en een aparte Carfacts-database nodig.
