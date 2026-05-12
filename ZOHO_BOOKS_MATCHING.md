# Zoho Books Customer Matching

The monthly invoice flow must not guess the billing customer.

## Matching Order

When an invoice is created, `netlify/functions/books-invoice.mjs` resolves the Zoho Books Customer in this order:

1. Explicit customer id on the app customer record:
   - `zohoBooksCustomerId`
   - `booksCustomerId`
   - `zoho_books_customer_id`
2. One exact Books Customer match by business/account name.
3. One exact Books Customer match by billing/contact email.
4. Create a Books Customer only if `ZOHO_BOOKS_CREATE_CUSTOMERS=true` and no match exists.

If none of those are true, the invoice is not created and the function returns `customer-match-required`.

## Optional Overrides

These are deliberately off by default:

- `ZOHO_BOOKS_ALLOW_LOOSE_CUSTOMER_MATCH=true`: allows one single Books search result to be accepted even if it is not an exact name/email match.
- `ZOHO_BOOKS_ALLOW_FALLBACK_CUSTOMER=true`: allows `ZOHO_BOOKS_FALLBACK_CUSTOMER_ID` to be used for test invoices.

Do not enable either for real production billing unless there is a clear operational reason.

## Best Production Pattern

The safest final setup is to store the Zoho Books Customer ID on the CRM Account/business. Then invoice creation uses the explicit ID and does not need to search by name.
