# Moto & Co Zoho Setup Guide

This guide matches the real Moto & Co logistics app in `src/app/MotoCoLogistics.jsx`.

## The Plain-English Version

You do not add the JSX file into Zoho as-is.

Zoho should hold the business records. The React app should be the front counter people use on phones and laptops.

The current prototype must be rewired so:

- the browser stops keeping the main data
- passwords are not stored in the app
- Zoho CRM stores clients
- Zoho Creator or a CRM custom module stores pickup orders and delivery sign-offs
- Zoho Books creates invoices

## Recommended Zoho Apps

### Zoho CRM

Use CRM for client/business records.

Suggested records:

- Account: workshop/business
- Contact: person at that workshop

Useful fields:

- Business name
- Contact name
- Email
- Phone
- Delivery address
- Preferred vendors
- Source: Moto & Co Portal

Use CRM upsert by email/business name so registration updates an existing customer instead of creating duplicates.

CRM Deals can be used for the Couriers pipeline:

- Order Placed
- Picked Up
- In Transit
- Delivered
- Invoiced
- Paid - future use

The current interim build writes pickup details and delivery proof summaries into the matching CRM Deal description. That keeps the pipeline useful now, while leaving the final signature-image storage decision open.

### Zoho Creator

Use Creator for operational dispatch records if CRM feels too sales-focused.

Forms:

- Clients
- Vendors
- Pickup_Orders
- Delivery_Signoffs
- Pricing_Rules

Pickup_Orders fields:

- Client
- Vendor
- Consignment note
- Drop location
- Urgency
- Preferred date
- Preferred time
- Notes
- Status: Pending, In Transit, Delivered, Cancelled
- Submitted at

Delivery_Signoffs fields:

- Pickup order
- Driver
- Receiver name
- Receiver phone
- Tyre quantity
- Parts quantities
- Returns quantity
- Total GST-inclusive
- Signature image
- Completed at

A proper Delivery_Signoffs form is still the cleanest long-term place for signature images, receiver details, and sign-off retention rules. The CRM Deal should only carry the summary needed for dispatch visibility.

### Zoho Books

Use Books for invoicing.

Create service/items such as:

- Tyre delivery
- Parts delivery up to 5kg
- Parts delivery 5-10kg
- Parts delivery 10kg+
- Return to supplier
- Oversized/bulk by approval

The EOM invoice button should send completed delivery lines to Zoho Books and create an invoice for the selected client.

## API Connection

The current JSX has direct browser calls. Replace those with a server-side proxy.

Minimum API actions:

- CRM upsert Account/Contact
- CRM or Creator create Pickup Order
- CRM or Creator update Pickup Order status
- CRM or Creator attach or store Delivery Signoff
- Books create invoice
- Books mark/send invoice if required

Keep OAuth client secrets and refresh tokens on the server only.

## OAuth Scopes

Use least-privilege scopes. Likely starting point:

```text
ZohoCRM.modules.Accounts.CREATE
ZohoCRM.modules.Accounts.UPDATE
ZohoCRM.modules.Contacts.CREATE
ZohoCRM.modules.Contacts.UPDATE
ZohoCRM.modules.Contacts.READ
ZohoBooks.invoices.CREATE
ZohoBooks.contacts.READ
```

If using Creator for operations, add the Creator create/read/update scopes for the relevant forms/reports.

## Australian Privacy Position

This is not legal advice, but the build should follow these principles:

- collect only what is needed for the job
- avoid storing passwords in app data
- do not keep signatures or phone numbers in browser storage
- avoid sending full addresses or sign-off data into logs
- restrict driver screens to jobs they need to see
- set a retention rule for old delivery records and signatures
- keep invoice history in Books, not copied everywhere

## Next Build Step

Rewrite `src/app/MotoCoLogistics.jsx` so each action calls the Zoho proxy instead of `localStorage`:

- `gs()` becomes `fetchWorkspace()`
- `mut()` becomes specific API calls
- `zohoCRMSync()` becomes a server endpoint
- `zohoBooksInvoice()` becomes a server endpoint
- local demo passwords are removed
