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
- Check the live deploy after ZeptoMail is approved and login testing can proceed.

## Next Build Work

- Prepare Zoho Books invoice flow and required Books environment variables.
