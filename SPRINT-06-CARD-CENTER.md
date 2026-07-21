# Sprint-06 Card Center acceptance

The FastLink wallet Card Center runs against deterministic Sandbox data while the backend remains switchable between Mock, Thredd UAT and Production.

Delivered interactions:

- create virtual and physical cards;
- select and inspect multiple cards;
- freeze and unfreeze;
- card balance and masked card details;
- four-digit PIN update flow without displaying or retaining the PIN;
- CVV reveal with automatic timeout;
- card transaction search, status filter and CSV export;
- responsive desktop and mobile layouts.

Verification:

```text
npm run build: passed
TypeScript validation: passed
Vite production bundle: passed
```

No Thredd credential or real cardholder data is stored in the frontend.
