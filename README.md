# Moto & Co Logistics Portal

This project is now using the correct file:

`src/app/MotoCoLogistics.jsx`

The old courier booking prototype is still in the folder, but `src/app/App.tsx` now opens the Moto & Co logistics portal instead.

## Current Status

Done:

- Switched the visible app to `moto-co-logistics (3).jsx`.
- Updated the primary colours:
  - cream: `#f3f3e8`
  - rose: `#e11d48`
- Added a small live API server so the app no longer relies on browser-only storage.
- Moved Zoho calls behind the server. When Zoho credentials are added, it can push CRM Accounts/Contacts, pull CRM Contacts, and create Zoho Books invoices.
- Removed front-end password storage from the Moto & Co portal.

Important:

This is now a live-ready local build, not a finished public Zoho deployment. While testing, records are saved to:

`server/data/motoco-store.json`

For production, Zoho should become the source of truth and login should be handled by Zoho/portal authentication.

To connect real Zoho data, copy `.env.example` to `.env` and add the Zoho values there. The important live values are:

- `ZOHO_CRM_ACCESS_TOKEN`
- `ZOHO_BOOKS_ACCESS_TOKEN`
- `ZOHO_CLIENT_ID`
- `ZOHO_CLIENT_SECRET`
- `ZOHO_CRM_REFRESH_TOKEN` or `ZOHO_REFRESH_TOKEN`
- `ZOHO_BOOKS_REFRESH_TOKEN` or `ZOHO_REFRESH_TOKEN`
- `ZOHO_BOOKS_ORGANIZATION_ID`
- `ZOHO_BOOKS_SERVICE_ITEM_ID`
- `ZOHO_BOOKS_GST_TAX_ID` if GST should be applied by Zoho Books
- `ZOHO_BOOKS_CREATE_CUSTOMERS=true` only if the app should create missing Zoho Books business customers automatically

## How To Run It

Open two PowerShell windows.

Window 1 starts the live data/Zoho bridge:

```powershell
cd "C:\Users\User\Documents\New project"
npm.cmd run live:api
```

Window 2 starts the app:

```powershell
cd "C:\Users\User\Documents\New project"
npm.cmd run dev
```

Open the local address it prints, usually:

```text
http://localhost:5173
```

Test logins:

- Admin: `admin@motoandco.com.au`
- Driver: `jake@motoandco.com.au`
- Client: register a new client, then log in with that email

## Deploy To Netlify

Yes, the web-facing app can go on Netlify.

Important rule:

Do not put Zoho credentials into any `VITE_` variable. Anything beginning with `VITE_` is treated as website-facing app config and can end up in the browser bundle.

Netlify build settings:

- Build command: `npm run build`
- Publish directory: `dist`
- Functions directory: `netlify/functions`

This repo includes `netlify.toml`, so Netlify should pick those settings up automatically.

Add the Zoho credentials in Netlify:

1. Open the Netlify site.
2. Go to Site configuration -> Environment variables.
3. Add the Zoho values as environment variables.
4. Make sure the variables are available to Functions.
5. Redeploy the site after changing credentials.

Use these names:

- `ZOHO_API_DOMAIN=https://www.zohoapis.com.au`
- `ZOHO_ACCOUNTS_URL=https://accounts.zoho.com.au`
- `ZOHO_CRM_VERSION=v8`
- `ZOHO_CLIENT_ID`
- `ZOHO_CLIENT_SECRET`
- `ZOHO_CRM_REFRESH_TOKEN` or `ZOHO_REFRESH_TOKEN`
- `ZOHO_BOOKS_REFRESH_TOKEN` or `ZOHO_REFRESH_TOKEN`
- `ZOHO_BOOKS_ORGANIZATION_ID`
- `ZOHO_BOOKS_SERVICE_ITEM_ID`
- `ZOHO_BOOKS_GST_TAX_ID` if GST should be applied by Zoho Books
- `ZOHO_BOOKS_CREATE_CUSTOMERS=true` only if missing Zoho Books business customers should be created automatically
- `ZOHO_BOOKS_FALLBACK_CUSTOMER_ID` only for testing invoices before each CRM Account/business has a Books customer id
- `LOGIN_EMAIL_FROM` for sending login codes
- `ZEPTO_MAIL_TOKEN` for Zoho ZeptoMail login-code email

Netlify Functions can keep secrets private, but they are not a long-term database. For a real public launch, orders and delivery sign-offs should be saved into Zoho Creator or Zoho CRM custom modules, not only the function fallback memory.

Client login uses a one-time 6-digit email code. The code expires after 10 minutes and is only sent to a client email that exists in Zoho CRM. Add `LOGIN_EMAIL_FROM` and `ZEPTO_MAIL_TOKEN` in Netlify before relying on this in production.

## Zoho Books Invoice Setup

Invoice creation is routed through `netlify/functions/books-invoice.mjs` so private Books credentials never reach the browser.

Billing rule:

Invoices should bill the business/workshop account, not the individual contact person. The invoice function resolves the Zoho Books Customer from the CRM Account/business name first. The contact email is used as recipient/contact information only.

Required Books variables:

- `ZOHO_BOOKS_REFRESH_TOKEN`: OAuth refresh token with Zoho Books invoice/customer/item access.
- `ZOHO_BOOKS_ORGANIZATION_ID`: the Zoho Books organisation id for Moto & Co.
- `ZOHO_BOOKS_SERVICE_ITEM_ID`: the Books item used for courier service invoice lines.

Optional Books variables:

- `ZOHO_BOOKS_GST_TAX_ID`: use this if Zoho Books should attach the GST tax code to each invoice line.
- `ZOHO_BOOKS_CREATE_CUSTOMERS`: set this to `true` only if the app should create a Zoho Books Customer for a CRM Account/business when no matching Books customer is found.
- `ZOHO_BOOKS_FALLBACK_CUSTOMER_ID`: temporary setup helper only. It lets invoice creation work before each CRM Account/business is mapped to a Books customer id.

Safety rule:

If any required Books value is missing, the invoice function returns `success: false`. That means the app will not mark CRM deals as `Invoiced` unless Zoho Books actually creates the invoice.

## How This Should Be Added To Zoho

Do not upload this React file directly into Zoho as the final system.

The production version should use Zoho as the record keeper:

- Zoho CRM: clients, contacts, accounts
- Zoho Creator or CRM custom module: pickup orders and delivery sign-offs
- Zoho Books: end-of-month invoices billed to the business account
- This React app: the mobile-friendly front end only
- A small server/proxy: keeps Zoho API keys out of the browser

## What Needs Rewriting Next

Replace browser storage with Zoho-backed actions:

- Register client -> create/update Zoho CRM Account and Contact
- New order -> create a Zoho order record
- Driver pickup -> update order status
- Driver sign-off -> create delivery/sign-off record
- Admin invoice button -> create Zoho Books invoice for the account/business
- Login -> use Zoho/portal authentication, not local credentials

See `ZOHO_CREATOR_GUIDE.md` for the Zoho-side structure.
