# LifeKS - \\ Made with Shafin's Thinking, Diagram and Vibe Coding.

**Manage Your Time. Track Your Money. Own Your Life.**

A personal life-management web app by Ks Shafin, built the same way as MY DTI: plain HTML, CSS and JavaScript. No install, no build step, no server.

**Current version: v0.1.0**

## Run it

Open `index.html` in a modern browser. To deploy, upload the folder to Vercel (or any static host) as is. Keep the app on one address, because the browser stores data per address.

Lucide icons and the DM Sans, Manrope and Dancing Script fonts load from CDNs. The app still works with system fonts if they are unavailable; icons would be missing.

## What is inside

| Page | What it does |
|---|---|
| Dashboard | Greeting, Bangladesh date/time, now and next activity with countdown, task counts, today's progress, sleep, and expandable transaction history |
| Schedule | Day, week and month views, recurring activities, overlap warning, in-app reminders while the app is open |
| Tasks | Priority, category, deadline, status, search and filters, overdue detection, progress |
| Sleep | Start and wake-up in one tap, several sessions per day, sessions that cross midnight, manual entries, overlap checks, daily, 7-day and 30-day summaries |
| Personal finance | Income, expense, internal transfer, lend, borrow, repayment, daily money timeline |
| Wallets | Cash, bKash, Nagad, Bank Account by default; add, edit, archive, delete; balance breakdown |
| Transactions | Full history with filters, edit and delete, CSV export |
| Debt records | Track money owed to you or by you, repayments and outstanding balances separately from wallet transactions |
| University fees | Set your university name and track monthly, semester and custom fees with payment history separately from wallet transactions |
| Notes | Pin, tags, search, created and updated times |
| Goals and habits | Daily habits with streaks and history, weekly and monthly goals |
| 30-day challenges | Run multiple challenges at once, track start dates and progress on the dashboard, and keep ended challenges in your history |
| Reports | Income vs expense, category spending, balance history, sleep and productivity, with date ranges |
| Settings | Theme, name, currency symbol, categories, download/transfer backup, add previous data, restore, clear data |

## How money is calculated

Amounts are stored as whole paisa, never as decimals, so there are no floating-point errors. The ledger of transactions is the source of truth and wallet balances are always calculated from it (opening balance plus every transaction), so editing or deleting a transaction can never leave a wrong balance behind.

Only `income` and `expense` entries count as income and expenses in reports. Transfers, loan principal and repayments never do.

## Where your data is stored (read this)

All data is saved in **this browser's LocalStorage**, in keys named `lifeKS.<name>.v1`, exactly the approach MY DTI uses. Nothing is sent to a server.

- It does **not** sync between devices or browsers.
- Clearing site data, using another browser or address, or losing the device removes it.
- Use **Settings > Download / transfer data** regularly. Move the JSON file to another device and choose **Add previous data** to merge its records without replacing existing ones; matching record IDs are skipped. **Restore from backup** replaces current data (a safety copy is kept first).
- The dashboard reminds you when your last backup is over a week old.

Protection rules built into the code (same spirit as MY DTI):

1. `localStorage.clear()` is never called.
2. Every write is read back and compared. "Saved" is only shown after that check.
3. If a stored value is unreadable, a copy is kept as `<key>.unreadable` and LifeKS refuses to overwrite it, so a bug can't wipe it.
4. Changes that touch several collections (for example a loan and its transaction) succeed together or are rolled back together.
5. Do not rename the storage keys or change a data format without a tested, non-destructive migration.

## Differences from the original brief

The brief planned Supabase, sign-in and Row Level Security. This version has **no accounts and no cloud**, per the decision to build it like MY DTI, so there is no cross-device sync and no multi-user security model. The data layer is isolated in `js/storage.js` and `commit()` in `js/core.js`, so a cloud backend can be added later. Other honest limits:

- All dates and times use Bangladesh Standard Time (Asia/Dhaka, UTC+6), with 12-hour clock formatting.
- Reminders appear inside the app while it is open. There are no push notifications.
- The currency setting changes the symbol only; amounts are not converted.
- Dashboard uses a clean URL without a hash; other pages keep their page hash for direct links.

## Files

- `index.html` page structure and dialogs
- `css/style.css` design tokens, layout, components, footer
- `js/storage.js` safe LocalStorage layer
- `js/core.js` config, data loading, `commit()`, helpers, dialogs, routing
- `js/dashboard.js`, `schedule.js`, `tasks.js`, `sleep.js`, `finance.js`, `workspace.js`, `reports.js`, `settings.js` one file per area
- `js/challenges.js` 30-day challenge tracking and history
- `js/script.js` start-up
- `docs/` original project brief and diagrams

Edit defaults (version, footer text, default wallets, default categories, currencies) in `CONFIG` at the top of `js/core.js`.

## Security notes

User text is HTML-escaped before display, CSV export neutralises spreadsheet formulas, and the repository contains no keys, passwords or personal data.
