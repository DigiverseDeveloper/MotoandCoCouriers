# Moto & Co Launch Checklist

## Deferred Tests

- Test email-code login after ZeptoMail account review is complete.
- Test full Zoho CRM loop after email login is working:
  - Website pickup request creates a Zoho CRM Deal.
  - Deal appears in the Couriers pipeline at Order Placed.
  - Zoho stage changes pull back into the app for the right customer.
  - Driver/admin updates push stage changes back to Zoho.

## Built Locally - Needs Live Retest

- Align app job statuses to the Zoho Deal stages:
  - Order Placed
  - Picked Up
  - In Transit
  - Delivered
  - Invoiced
  - Paid - future use
- Check the live deploy after GitHub/Netlify accepts the update.

## Next Build Work

- Tighten customer view so customers only see their own pickup requests.
- Tighten admin/driver views around the live deal pipeline.
