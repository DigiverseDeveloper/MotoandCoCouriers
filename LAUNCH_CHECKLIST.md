# Moto & Co Launch Checklist

## Testing Hold

- All live workflow testing is paused until ZeptoMail account review is complete and login-code emails can be sent.
- Do not mark CRM, customer visibility, driver stage changes, delivery proof, or invoice testing as complete until email login is working.

## Deferred Tests

- Test email-code login after ZeptoMail account review is complete.
- Test full Zoho CRM loop after email login is working:
  - Website pickup request creates a Zoho CRM Deal.
  - Deal appears in the Couriers pipeline at Order Placed.
  - Zoho CRM Deal description includes con note, account/contact, supplier, pickup/drop address, item summary, urgency, preferred window, and quoted total.
  - Deal stage changes pull back into the app for the right customer.
  - Driver/admin updates push stage changes back to Zoho.
  - Admin/driver workspace sees the full live Couriers pipeline while customers see only their own deals.
- Test delivery proof sync after email login is working:
  - Complete a delivery/sign-off in the app.
  - Confirm the matching CRM Deal moves to Delivered.
  - Confirm the CRM Deal description includes delivery proof id, receiver, delivered timestamp, signature captured status, item summary, and total.
  - Confirm repeated snapshots do not duplicate the same proof block.
  - Confirm where the actual signature image should live before public launch: CRM attachment, CRM custom module, or Zoho Creator Delivery_Signoffs.
- Test monthly/account Zoho Books invoice creation after Books variables are configured and login testing can proceed:
  - Select a business account and invoice month.
  - Confirm only uninvoiced billable deliveries are included.
  - Confirm the invoice is created against the Zoho Books Customer linked to the CRM Account/business, not the individual contact.
  - Confirm invoice lines auto-match the correct Zoho Books service items by SKU: Tyre 1, Tyre 2, Tyre 3+, Up to 5kg, and 5-10kg.
  - Confirm 3+ tyre orders do not split into smaller tyre bundles.
  - Confirm Zoho Books treats line rates as GST-inclusive and does not add GST on top.
  - Confirm linked CRM Deals move to Invoiced only after the Books invoice succeeds.
  - Confirm trying the same account/month again skips CRM Deals already marked Invoiced.
- Confirm visible app pricing and invoice labels say GST-inclusive and do not show old ex-GST totals.

## Built Locally - Needs Live Retest

- Align app job statuses to the Zoho Deal stages:
  - Order Placed
  - Picked Up
  - In Transit
  - Delivered
  - Invoiced
  - Paid - future use
- Tighten customer view so customers only see their own pickup requests.
- Tighten admin/driver views around the live deal pipeline.
- Prepare Zoho Books invoice flow and required Books environment variables.
- Route invoice billing to the CRM Account/business instead of the individual contact person.
- Route invoice lines to the correct Zoho Books service items by SKU instead of one generic courier item.
- Treat Zoho Books invoice line rates as GST-inclusive.
- Clean up visible app pricing and invoice wording so it says GST-inclusive.
- Enrich pickup request Deal creation so CRM records carry supplier, pickup/drop, item, urgency, and quote details.
- Sync completed delivery proof details back to the matching CRM Deal from app snapshots.
- Create monthly/account invoice flow that skips already-invoiced Deals and marks linked CRM Deals as Invoiced only after Books succeeds.
- Check the live deploy after ZeptoMail is approved and login testing can proceed.

## Next Build Work

- Configure the Zoho Books variables in Netlify.
- Confirm the Books refresh token includes `ZohoBooks.items.READ` so SKU lookup works.
- Decide whether `ZOHO_BOOKS_CREATE_CUSTOMERS=true` should be enabled, or whether Books customers should be created/matched manually first.
- Add Books items for 10kg+ and returns to supplier if those should be invoiceable services.
- Add a persistent CRM Account -> Zoho Books Customer id field when ready, so invoices do not need the temporary fallback customer.
- Decide where the real signature image should live: CRM attachment, CRM custom module, or Zoho Creator Delivery_Signoffs.
- Keep password creation/auth hardening until the end, after the Zoho data flow is settled.
