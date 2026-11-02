# Mozambique customer delivery fees

The owner set these local delivery charges on 2 November 2026:

| Delivery area                                | Customer fee |
| -------------------------------------------- | -----------: |
| Maputo city, except the specific areas below |      100 MZN |
| Costa do Sol (also accepts “Costa de Sol”)   |      200 MZN |
| Albasine (also accepts “Albasini”)           |      500 MZN |
| Matola                                       |      500 MZN |

The backend matches the delivery country, province, city and suburb. Specific areas take precedence over the general Maputo city price. The province alone does not qualify: Other Mozambique destinations use the official Portador Diário domestic calculator, from Maputo to a served destination city, using the packed weight. A courier outage or unrecognized destination never falls back to a cheap Maputo fee. Internet Express is not queried for new delivery quotes because the goods are already in Mozambique. International destinations require a separately configured store-approved service; no South African collection charge is silently substituted. Historical quotes and orders keep their records.

The four `SC_MZ_*` methods are stored in `shipping_methods`. Local coverage returns exactly one applicable configured method and does not also request international courier rates from the South African collection address. Actual fulfillment costs remain separate from the customer's charge. These are store-arranged deliveries, with timing confirmed by the store; no courier booking or delivery deadline is promised by the fee itself.

The quote-provider checks are extended by migration `20261102153627_portador_diario_quotes.sql` to support server-owned Portador Diário quotes in MZN with no exchange conversion. Existing constraints for configured rates and Internet Express remain intact, as do ownership, quote expiry, immutability and address binding. Insert the four methods inactive, deploy the destination filter, then activate them. Back up affected rows before changes. Existing paid orders and immutable quotes retain their recorded charges; changing the delivery address requires a new quote. Do not modify historical orders to apply these new prices.

The Portador Diário contract was verified against its public [calculator](https://www.portadordiario.co.mz/) on 2 November 2026: GET `/api/domestico/scales` and POST `/api/domestico/quote` on `https://api.portadordiario.co.mz`, with origin and destination scale IDs and weight. Scale IDs differ from administrative province IDs; the response route and weight are verified. The current site returns an estimate, not a shipment booking. No carrier account is created and no collection is scheduled. The existing configurable parcel-weight basis is shown to the customer; actual packed weight and carrier costs must be verified during fulfillment.
