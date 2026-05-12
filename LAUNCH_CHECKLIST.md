# Moto & Co Launch Checklist

## Testing Hold

- All live workflow testing is paused until ZeptoMail account review is complete and login-code emails can be sent.
- Do not mark CRM, customer visibility, driver stage changes, or invoice testing as complete until email login is working.

## Deferred Tests

- Test email-code login after ZeptoMail account review is complete.
- Test full Zoho CRM loop after email login is working:
  - Website pickup request creates a Zoho CRM Deal.
  - Deal appears in the Couriers pipeline at Order Placed.
  - Zoho stage changes pull back into the app for the right customer.
  - Driver/admin updates push stage changes back to Zoho.
  - Admin/driver workspace sees the full live Couriers pipeline while customers see only their own deals.
- Test Zoho Books invoice creation after Books variables are configured and login testing can proceed.
- Confirm invoices bill the Zoho Books Customer linked to the CRM Account/business, with the contact email used only as recipient/contact information.
- Confirm invoice lines use the correct Zoho Books service items: Tyre 1, Tyre 2, Tyre 3+, Up to 5kg, and 5-10kg.
- Confirm 3+ tyre orders do not split into smaller tyre bundles.

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
- Route invoice lines to the correct Zoho Books service items instead of one generic courier item.
- Check the live deploy after ZeptoMail is approved and login testing can proceed.

## Next Build Work

- Configure the Zoho Books variables in Netlify.
- Decide whether `ZOHO_BOOKS_CREATE_CUSTOMERS=true` should be enabled, or whether Books customers should be created/matched manually first.
- Add Books items for 10kg+ and returns to supplier if those should be invoiceable services.
- Add a persistent CRM Account -> Zoho Books Customer id field when ready, so invoices do not need the temporary fallback customer.
