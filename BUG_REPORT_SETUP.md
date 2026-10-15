# Bugmeldingen Carfacts

Bezoekers kunnen op de kentekencheck, onderdelenzoeker en PRO-pagina een probleem melden. De melding wordt in Upstash Redis bewaard en in het beveiligde dashboard onder **Gemelde problemen** weergegeven. Maximaal 500 meldingen worden bewaard; de admin toont de nieuwste 100. Er is nog geen automatische bewaartermijn of verwijderfunctie; configureer dit vóór grootschalig gebruik.

## E-mailmeldingen (optioneel, niet standaard actief)
Stel in Vercel Production (en desgewenst Preview) de volgende environment variables in:
- `RESEND_API_KEY`: API-sleutel van Resend.
- `CARFACTS_BUG_FROM`: afzender op een bij Resend geverifieerd domein.
- `CARFACTS_BUG_TO`: eigen e-mailadres voor notificaties.

Zonder deze instellingen wordt de melding **wel opgeslagen in Admin**, maar **geen e-mail verzonden**. De API probeert de e-mail als extra notificatie; het succes van opslaan betekent niet dat een mail is afgeleverd. Voor betrouwbare notificaties zijn retries en leveringsmonitoring nodig.

## Privacy en juridische teksten
Publiceer vóór verdere uitrol een juridisch correcte privacyverklaring met de **daadwerkelijke verwerkingsverantwoordelijke**, contactgegevens, grondslagen, ontvangers/verwerkers (waaronder hosting, Redis, analytics en eventueel Resend), bewaartermijnen, rechten van betrokkenen en internationale doorgifte waar relevant. Vraag de eigenaar om de juiste juridische bedrijfsnaam, vestigingsland, privacycontact en beoogde bewaartermijn. De huidige formuliermelding is slechts een korte toelichting en vervangt de privacyverklaring niet.

Voorkom gevoelige gegevens in de beschrijving. Geen VIN, kenteken, browser-URL of IP wordt expliciet meegestuurd door de widget; bezoekers kunnen wel zelf identificerende gegevens typen. De server past rate limiting toe per gehashte IP voor spamcontrole. Voor een productieklare oplossing zijn aanvullend een verwijderfunctie, bewaartermijn en privacybeoordeling nodig.
