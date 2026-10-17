SPARK ELEGANCE INVOICE STUDIO
Plain HTML + CSS + JavaScript. No React, Node.js, npm or server required.

OPEN THE APP
1. Extract the complete ZIP into a folder.
2. Double-click index.html and open it in a modern Chrome, Edge or Firefox.
3. Keep the assets folder beside the HTML, CSS and JavaScript files.
Alternatively, open Spark-Elegance-Standalone.html for a single-file version.

EDIT THE CODE
index.html     Page structure, navigation, dialog and script/style links.
styles.css     Responsive app styling and compact A4 invoice print styling.
app.js         Readable, commented JavaScript: state, calculations, invoice
               CRUD, charts, receipt simulation, matching and backups.
assets/logo.js Embedded company logo and standalone invoice print CSS.
assets/company-logo.png  Supplied company logo.

Edit index.html, styles.css and app.js with a text editor. Refresh the browser
to see changes. The standalone file is a snapshot of those three source files;
changes to the separate files do not automatically update the snapshot.
If you change invoice-document CSS, update the corresponding
window.SPARK_PRINT_CSS string in assets/logo.js to match downloaded invoices.

FEATURES
- Responsive dashboard with AED totals and six months of actual saved data.
- Plain SVG bar chart and CSS expense breakdown: no external libraries.
- Create, edit, search, filter, mark paid and delete invoices.
- Dynamic line items: item, description, unit, quantity and unit price.
- Optional client email. Valid email format checked if an address is entered.
- Subtotal, percentage tax, total and balance due calculated automatically.
- Invoice number: INV-YYYY-MM-00001, with automatic UAE year/month and a
  five-digit monthly series. Existing numbers remain unchanged.
- Invoice preview, HTML download and Print / Save PDF.
- PDF / PNG / JPG receipt upload, simulated extraction and editable review.
- Receipt document stored with the corresponding expense, up to 2 MB each.
- Expense ledger, category summary, deletion and manual invoice matching.
- Local saving, JSON backup export/import and prior Folio backup support.
- Empty initial invoice and expense lists; no sample financial records.

COMPANY DETAILS
Spark Elegance Event Management FZE LLC
26th Floor, Amber Gem Tower
Ajman, United Arab Emirates
TRN 105587182400001
+971561358054
ariel25dxb@gmail.com
www.sparkelegance.ae

DATA AND PORTABILITY
Records save in this browser profile, not inside the source files.
Use Export data regularly. Move your backup to another computer or phone,
open the app there and choose Import data. Import replaces current records.
Previous Folio JSON backups are supported. Data does not automatically sync.
Keep the app at the same location and use the same browser for continuity.
File-based storage behavior depends on browser settings. A storage failure is
reported before a save is accepted. Clearing browser storage erases records.

PRINTING
Open an invoice number, choose Print / Save PDF, and use:
A4 paper, portrait, 100% scale, browser headers and footers off.
Ten rows with normal item descriptions fit on one A4 page. Very long text
or more than ten items can require extra pages; content is not clipped.

SIMULATIONS
Receipt parsing uses a filename suggestion and sample values; it does not
perform real OCR or call an AI service. Correct every field before saving.
Email is simulated: no messages are sent. A draft becomes Sent when the
simulated email action is used. An email address is needed for that action.
Matching marks the full selected Draft/Sent invoice as Paid regardless of
amount or currency. It does not process payments or bank reconciliation.
The AED dashboard counts only AED records and does not convert currencies.
Cash flow allocates paid invoices to their invoice issue month.
Canceled invoice forms may leave gaps in the reserved number series.

TESTING
DOM regression checks cover typing focus, optional email, invoice CRUD,
units and totals, monthly/yearly numbering, receipt parsing and storage,
invoice matching/unlinking, persistence and backup validation.
A rendered test PDF with ten populated rows fits on one A4 page.
Physical Android device behavior and browser print engines can differ.
