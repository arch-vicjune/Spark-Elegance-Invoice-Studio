/* Spark Elegance Invoice Studio — plain JavaScript, no build tools.
   Data stays in this browser. OCR, email and reconciliation are simulations. */
'use strict';

const STORAGE_KEY = 'folio-v1';
const COMPANY = {
  name: 'Spark Elegance Event Management FZE LLC',
  address: '26th Floor, Amber Gem Tower',
  location: 'Ajman, United Arab Emirates',
  trn: '105587182400001', phone: '+971561358054',
  email: 'ariel25dxb@gmail.com', website: 'www.sparkelegance.ae'
};
const CATEGORIES = ['Software', 'Travel', 'Meals', 'Office', 'Other'];
const CURRENCIES = ['AED', 'USD', 'EUR', 'GBP'];
const STATUSES = ['Draft', 'Sent', 'Paid', 'Overdue'];
const PALETTE = ['#68849e', '#142440', '#d2bea0', '#9cb5c7', '#dbe4ed'];
const $ = selector => document.querySelector(selector);
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
}[c]));
const amount = (value, currency = 'AED') => new Intl.NumberFormat('en-AE', {
  style:'currency', currency, currencyDisplay:'code'
}).format(value);
const round = value => Math.round((value + Number.EPSILON) * 100) / 100;
const subtotal = invoice => round(invoice.items.reduce((sum, item) => sum + item.qty * item.price, 0));
const invoiceTotal = invoice => round(subtotal(invoice) * (1 + invoice.tax / 100));
const currencyOf = record => record.currency || 'USD'; // Compatibility with old backups.

function uaeDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone:'Asia/Dubai', year:'numeric', month:'2-digit', day:'2-digit'
  }).formatToParts(date);
  return ['year','month','day'].map(type => parts.find(p => p.type === type).value).join('-');
}
function dateLabel(date) {
  return new Date(date + 'T12:00:00').toLocaleDateString('en-GB', {
    day:'2-digit', month:'short', year:'numeric'
  });
}
function uniqueID() {
  return globalThis.crypto?.randomUUID?.() || 'r-' + Date.now() + '-' + Math.random().toString(16).slice(2);
}
function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
}
function validData(data) {
  const finite = n => typeof n === 'number' && Number.isFinite(n) && n >= 0;
  const text = x => typeof x === 'string';
  if (!data || !Array.isArray(data.invoices) || !Array.isArray(data.receipts)) return false;
  if (!data.invoices.every(i => text(i.id) && text(i.client) && text(i.email) &&
      validDate(i.date) && validDate(i.due) && STATUSES.includes(i.status) &&
      finite(i.tax) && i.tax <= 100 && (!i.currency || CURRENCIES.includes(i.currency)) &&
      Array.isArray(i.items) && i.items.every(x => text(x.name) && finite(x.qty) && finite(x.price) &&
      (x.unit == null || text(x.unit)) && (x.description == null || text(x.description))))) return false;
  if (!data.receipts.every(r => text(r.id) && text(r.vendor) && validDate(r.date) &&
      CATEGORIES.includes(r.category) && CURRENCIES.includes(r.currency) && finite(r.tax) &&
      finite(r.total) && r.tax <= r.total && text(r.fileName) &&
      (!r.fileData || /^data:(application\/pdf|image\/(png|jpeg));base64,[A-Za-z0-9+/=]+$/.test(r.fileData)))) return false;
  return new Set(data.invoices.map(i => i.id)).size === data.invoices.length &&
    new Set(data.receipts.map(r => r.id)).size === data.receipts.length;
}
function loadData() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return {invoices:[], receipts:[]};
    const parsed = JSON.parse(stored);
    if (!validData(parsed)) throw new Error('Invalid saved records');
    return parsed;
  } catch (error) {
    console.warn('Workspace could not be loaded:', error.message);
    return {invoices:[], receipts:[]};
  }
}
let data = loadData();
let page = 'overview';
let editor = null;
let reviewingReceipt = null;
let receiptBusy = false;
let receiptOperation = 0;
let selectedInvoice = null;
let toastTimer;

function notify(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 5000);
}
function commit(next) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    data = next;
    return true;
  } catch {
    notify('Unable to save: browser storage is full or unavailable. Export a backup and try a smaller document.');
    return false;
  }
}
function options(values, selected) {
  return values.map(value => `<option value="${escapeHTML(value)}" ${value === selected ? 'selected' : ''}>${escapeHTML(value)}</option>`).join('');
}
function nextInvoiceNumber(storage = localStorage, invoices = data.invoices, createdAt = new Date()) {
  const yearMonth = uaeDate(createdAt).slice(0,7);
  const prefix = 'INV-' + yearMonth + '-';
  const key = 'spark-invoice-series-' + yearMonth;
  let next = invoices.reduce((n, invoice) => {
    const suffix = invoice.id.startsWith(prefix) ? invoice.id.slice(prefix.length) : '';
    return /^\d{5}$/.test(suffix) ? Math.max(n, Number(suffix) + 1) : n;
  }, 1);
  try {
    const reserved = Number(storage.getItem(key));
    if (Number.isSafeInteger(reserved) && reserved >= 1) next = Math.max(next, reserved);
  } catch { /* The saved invoice list still prevents duplicates in this session. */ }
  if (next > 99999) throw new Error('The five-digit monthly invoice series is full.');
  try { storage.setItem(key, String(next + 1)); } catch { /* Saving is checked separately. */ }
  return prefix + String(next).padStart(5, '0');
}

// ---------- Dashboard and list rendering ----------
function renderPage() {
  const titles = {
    overview:['Business at a glance.','A clear view of your business finances.'],
    invoices:['Invoices.','From your first draft to your next payment.'],
    receipts:['Receipt inbox.','Turn your documents into organized expenses.'],
    expenses:['Expense ledger.','Every expense accounted for, in one place.']
  };
  $('#page-title').textContent = titles[page][0];
  $('#page-description').textContent = titles[page][1];
  $('#breadcrumb').textContent = page[0].toUpperCase() + page.slice(1);
  document.querySelectorAll('[data-page]').forEach(button => {
    const active = button.dataset.page === page;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
  });
  $('#screen').innerHTML = page === 'overview' ? dashboardHTML() + invoiceListHTML(true) :
    page === 'invoices' ? invoiceListHTML(false) : expenseListHTML();
  if (page === 'overview' || page === 'invoices') renderInvoiceRows();
  else renderExpenseRows();
}
function dashboardHTML() {
  const invoices = data.invoices.filter(i => currencyOf(i) === 'AED');
  const paid = invoices.filter(i => i.status === 'Paid').reduce((sum,i) => sum + invoiceTotal(i), 0);
  const invoiced = invoices.reduce((sum,i) => sum + invoiceTotal(i), 0);
  const month = uaeDate().slice(0,7);
  const expenses = data.receipts.filter(r => r.currency === 'AED' && r.date.startsWith(month))
    .reduce((sum,r) => sum + r.total, 0);
  const cards = [
    ['Total invoiced',invoiced,'Across AED invoices'], ['Paid amount',paid,'Payments received'],
    ['Outstanding balance',invoiced-paid,'Awaiting payment'], ['Monthly expenses',expenses,'Current month · AED']
  ];
  return `<div class="section-label">Financial overview <span>Live workspace data · AED only</span></div>
    <div class="metrics">${cards.map(([title,value,note]) => `<article class="metric"><div class="metric-title">${title}</div><div class="metric-value">${amount(value)}</div><small>${note}</small></article>`).join('')}</div>
    <div class="charts"><section class="card"><div class="card-header"><div><h2>Cash flow</h2><p>Monthly paid income and expenses · AED</p></div><span class="muted" style="font-size:10px">Last 6 months</span></div><div class="legend"><span><i class="dot" style="background:#142440"></i>Income</span><span><i class="dot" style="background:#b5c7d7"></i>Expenses</span></div>${cashFlowSVG()}</section><section class="card"><div class="card-header"><div><h2>Expense breakdown</h2><p>All recorded AED expenses by category.</p></div></div>${expenseDonutHTML()}</section></div>`;
}
function cashFlowSVG() {
  const today = uaeDate();
  const months = Array.from({length:6}, (_, index) => {
    const d = new Date(Date.UTC(Number(today.slice(0,4)), Number(today.slice(5,7))-6+index, 1));
    const key = d.toISOString().slice(0,7);
    return {
      label:d.toLocaleDateString('en',{month:'short',timeZone:'UTC'}),
      income:data.invoices.filter(i => currencyOf(i)==='AED' && i.status==='Paid' && i.date.startsWith(key)).reduce((sum,i)=>sum+invoiceTotal(i),0),
      expense:data.receipts.filter(r=>r.currency==='AED' && r.date.startsWith(key)).reduce((sum,r)=>sum+r.total,0)
    };
  });
  const max = Math.max(100, ...months.flatMap(m => [m.income,m.expense]));
  const ceiling = Math.ceil(max / 100) * 100;
  let svg = '<svg class="chart" viewBox="0 0 600 240" role="img" aria-label="Monthly AED income and expenses over six months">';
  for (let step=0; step<=4; step++) {
    const y=195-step*44;
    const v=ceiling*step/4;
    const label=v>=1000 ? (v/1000).toFixed(1)+'k' : Math.round(v);
    svg += `<line x1="77" y1="${y}" x2="590" y2="${y}" stroke="#e4eaf0" stroke-dasharray="3 4"/><text x="67" y="${y+4}" text-anchor="end">AED ${label}</text>`;
  }
  months.forEach((m,index) => {
    const x=95+index*82;
    const ih=m.income/ceiling*176, eh=m.expense/ceiling*176;
    svg += `<rect x="${x}" y="${195-ih}" width="22" height="${ih}" rx="3" fill="#142440"><title>${m.label} income: ${amount(m.income)}</title></rect><rect x="${x+27}" y="${195-eh}" width="22" height="${eh}" rx="3" fill="#b5c7d7"><title>${m.label} expenses: ${amount(m.expense)}</title></rect><text x="${x+24}" y="222" text-anchor="middle">${m.label}</text>`;
  });
  return svg + '</svg>';
}
function expenseDonutHTML() {
  const values = CATEGORIES.map((category,index) => ({category,color:PALETTE[index],value:data.receipts
    .filter(r=>r.currency==='AED' && r.category===category).reduce((sum,r)=>sum+r.total,0)})).filter(x=>x.value>0);
  const total = values.reduce((sum,x)=>sum+x.value,0);
  let degree = 0;
  const gradient = values.map(x => { const start=degree; degree+=x.value/total*360; return `${x.color} ${start}deg ${degree}deg`; }).join(',');
  return `<div class="donut-wrap"><div class="donut" ${total?`style="background:conic-gradient(${gradient})"`:''}></div><div class="donut-label"><small>Total expenses</small><strong>${amount(total)}</strong></div></div><div class="categories">${values.length?values.map(x=>`<div class="category"><i class="dot" style="background:${x.color}"></i>${x.category}<b>${amount(x.value)}</b><small>${Math.round(x.value/total*100)}%</small></div>`).join(''):'<p class="muted">No expenses recorded yet.</p>'}</div>`;
}
function invoiceListHTML(recent) {
  return `<section class="card"><div class="card-header"><div><h2>${recent?'Recent invoices':'All invoices'} <span class="muted">(${data.invoices.length})</span></h2><p>Keep your projects moving and your payments on track.</p></div>${recent?'<button class="button small" data-action="all-invoices">View all invoices →</button>':''}</div><div class="table-controls"><input class="search" id="invoice-search" aria-label="Search invoices" placeholder="Search invoice number or client…"><select id="status-filter" aria-label="Filter status">${options(['All statuses',...STATUSES],'All statuses')}</select></div><div class="table-scroll"><table><thead><tr><th>INVOICE</th><th>CLIENT</th><th>DUE DATE</th><th>AMOUNT</th><th>STATUS</th><th>ACTIONS</th></tr></thead><tbody id="invoice-rows"></tbody></table></div><div class="table-footer"><span id="invoice-count"></span><span>Saved in this browser</span></div></section>`;
}
function renderInvoiceRows() {
  const query = ($('#invoice-search')?.value || '').toLowerCase();
  const status = $('#status-filter')?.value || 'All statuses';
  let invoices = data.invoices.filter(i => (i.id+' '+i.client).toLowerCase().includes(query) &&
    (status==='All statuses' || i.status===status));
  if (page==='overview') invoices=invoices.slice(0,5);
  $('#invoice-rows').innerHTML = invoices.length ? invoices.map(i=>`<tr><td><button class="invoice-link" data-action="preview" data-id="${escapeHTML(i.id)}">${escapeHTML(i.id)}</button></td><td>${escapeHTML(i.client)}${i.email?`<small>${escapeHTML(i.email)}</small>`:''}</td><td>${dateLabel(i.due)}</td><td><b>${amount(invoiceTotal(i),currencyOf(i))}</b></td><td><span class="badge ${i.status}">${i.status}</span></td><td><div class="row-actions"><button class="button small" data-action="edit" data-id="${escapeHTML(i.id)}">Edit</button><button class="button small" data-action="invoice-actions" data-id="${escapeHTML(i.id)}">More</button></div></td></tr>`).join('') : '<tr><td colspan="6" class="empty">No invoices to show. Create your first invoice.</td></tr>';
  $('#invoice-count').textContent = invoices.length + ' invoices shown';
}
function expenseListHTML() {
  return `<div class="banner"><h2>${page==='receipts'?'Less paperwork. More clarity.':'Bring your books together.'}</h2><p>${page==='receipts'?'Upload a PDF, PNG or JPG, review the simulated extraction, and save your expense.':'Link an expense to an open invoice to simulate settlement. This does not transfer money.'}</p></div><section class="card"><div class="card-header"><h2>${page==='receipts'?'Saved receipts':'All expenses'} (${data.receipts.length})</h2><input class="search" id="expense-search" aria-label="Search vendors" placeholder="Search vendors…"></div><div class="table-scroll"><table><thead><tr><th>VENDOR / DOCUMENT</th><th>DATE</th><th>CATEGORY</th><th>TOTAL / TAX</th><th>RECONCILIATION</th><th></th></tr></thead><tbody id="expense-rows"></tbody></table></div><div class="table-footer"><span>${data.receipts.length} expense records</span><span>Original currency retained</span></div></section><p class="footnote">Overview totals include AED records only. Other currencies are not converted.</p>`;
}
function renderExpenseRows() {
  const query=($('#expense-search')?.value||'').toLowerCase();
  const receipts=data.receipts.filter(r=>r.vendor.toLowerCase().includes(query));
  $('#expense-rows').innerHTML=receipts.length?receipts.map(r=>`<tr><td><b>${escapeHTML(r.vendor)}</b><small>${r.fileData?`<a href="${r.fileData}" download="${escapeHTML(r.fileName)}">${escapeHTML(r.fileName)}</a>`:escapeHTML(r.fileName)}</small></td><td>${dateLabel(r.date)}</td><td><span class="badge">${escapeHTML(r.category)}</span></td><td><b>${amount(r.total,r.currency)}</b><small>Tax: ${amount(r.tax,r.currency)}</small></td><td>${r.invoiceId?`<span class="badge Paid">${escapeHTML(r.invoiceId)}</span>`:`<button class="button small" data-action="match" data-id="${escapeHTML(r.id)}">Match invoice</button>`}</td><td><button class="button small danger" data-action="delete-expense" data-id="${escapeHTML(r.id)}">Delete</button></td></tr>`).join(''):'<tr><td colspan="6" class="empty">No expenses recorded yet.</td></tr>';
}

// ---------- Dialogs: typing never replaces the focused input ----------
function openDialog(content, className='') {
  const dialog=$('#dialog');
  dialog.className=className;
  $('#dialog-content').innerHTML=content;
  if (!dialog.open) dialog.showModal();
  // Focus once when opening/changing the dialog, never on field input.
  const first=dialog.querySelector('form input,form select,form button,.print-tools button');
  if(first) first.focus();
}
function closeDialog() {
  $('#dialog').close();
  receiptOperation++; // Cancel any pending simulated extraction.
  receiptBusy=false;
}
function fieldHTML(label,name,value='',type='text',required=false,extra='') {
  return `<label class="field">${label}<input name="${name}" type="${type}" value="${escapeHTML(value)}" ${required?'required':''} ${extra}></label>`;
}
function showInvoiceEditor(id) {
  if(id) editor=structuredClone(data.invoices.find(i=>i.id===id));
  else {
    let number;
    try { number=nextInvoiceNumber(); } catch(error) { notify(error.message); return; }
    editor={id:number,client:'',email:'',date:uaeDate(),due:uaeDate(),status:'Draft',currency:'AED',tax:5,
      clientAddress:'',clientVat:'',terms:'',items:[{name:'',description:'',unit:'',qty:1,price:0}]};
  }
  openDialog(`<form id="invoice-form"><div class="eyebrow">INVOICE STUDIO</div><h2 id="dialog-title">${id?'Edit invoice':'Create an invoice'}</h2><p class="subtitle">${escapeHTML(editor.id)}</p><div class="form-grid">
    ${fieldHTML('Client name','client',editor.client,'text',true)}
    ${fieldHTML('Client email (optional)','email',editor.email,'email')}
    ${fieldHTML('Issue date','date',editor.date,'date',true)}
    ${fieldHTML('Due date','due',editor.due,'date',true)}
    <label class="field">Currency<select name="currency">${options(CURRENCIES,currencyOf(editor))}</select></label>
    ${fieldHTML('Payment terms','terms',editor.terms)}
    ${fieldHTML('Client address','clientAddress',editor.clientAddress)}
    ${fieldHTML('Client VAT number (optional)','clientVat',editor.clientVat)}
    <label class="field">Status<select name="status">${options(STATUSES,editor.status)}</select></label>
    ${fieldHTML('Tax (%)','tax',editor.tax,'number',true,'min="0" max="100" step="0.01"')}
    </div><div class="line-heading"><h3>Line items</h3><button type="button" class="button small" data-action="add-line">＋ Add item</button></div><div id="line-items"></div><div class="totals"><div>Subtotal<b id="subtotal"></b></div><div>Tax<b id="tax-total"></b></div><div class="grand">Grand total<b id="grand-total"></b></div></div><p class="error" id="form-error" role="alert" hidden></p><div class="dialog-actions"><button type="button" class="button" data-action="close">Cancel</button><button class="button primary" type="submit">Save invoice</button></div></form>`, 'wide');
  renderEditorLines();
  updateEditorTotals();
}
function renderEditorLines() {
  $('#line-items').innerHTML=editor.items.map((item,index)=>`<div class="line-item" data-line="${index}"><label class="field">Item<input data-key="name" value="${escapeHTML(item.name)}" required placeholder="Item name"><input class="description" data-key="description" value="${escapeHTML(item.description)}" aria-label="Item description" placeholder="Description (optional)"></label><label class="field">Unit<input data-key="unit" value="${escapeHTML(item.unit)}" placeholder="pcs / box"></label><label class="field">Qty<input data-key="qty" type="number" min="0.01" step="0.01" required value="${item.qty}"></label><label class="field">Unit price<input data-key="price" type="number" min="0" step="0.01" required value="${item.price}"></label><button type="button" class="icon-button remove-line" data-action="remove-line" data-index="${index}" aria-label="Remove item ${index+1}" ${editor.items.length===1?'disabled':''}>×</button></div>`).join('');
}
function updateEditorTotals() {
  $('#subtotal').textContent=amount(subtotal(editor),currencyOf(editor));
  $('#tax-total').textContent=amount(round(invoiceTotal(editor)-subtotal(editor)),currencyOf(editor));
  $('#grand-total').textContent=amount(invoiceTotal(editor),currencyOf(editor));
}
function formError(message) {
  const error=$('#form-error');error.textContent=message;error.hidden=false;
}
function saveInvoice(event) {
  event.preventDefault();
  if (!editor.client.trim()) { formError('Enter a client name.');return; }
  if (!validDate(editor.date)||!validDate(editor.due)||editor.due<editor.date) { formError('The due date must be on or after the issue date.');return; }
  if (invoiceTotal(editor)<=0 || !Number.isFinite(invoiceTotal(editor))) { formError('Add a positive invoice total.');return; }
  if(editor.items.some(i=>!i.name.trim()||i.qty<=0||i.price<0)) { formError('Check the item names, quantities and prices.');return; }
  const exists=data.invoices.some(i=>i.id===editor.id);
  const next={...data,invoices:exists?data.invoices.map(i=>i.id===editor.id?structuredClone(editor):i):[structuredClone(editor),...data.invoices]};
  if(commit(next)){closeDialog();renderPage();notify('Invoice saved.');}
}
function invoiceActions(id) {
  selectedInvoice=data.invoices.find(i=>i.id===id);
  if(!selectedInvoice)return;
  openDialog(`<h2 id="dialog-title">${escapeHTML(id)}</h2><p class="subtitle">${escapeHTML(selectedInvoice.client)} · ${amount(invoiceTotal(selectedInvoice),currencyOf(selectedInvoice))}</p><div class="action-list" style="display:grid;gap:10px;margin-top:23px"><button class="button primary" data-action="preview" data-id="${escapeHTML(id)}">View / Print invoice</button><button class="button" data-action="edit" data-id="${escapeHTML(id)}">Edit invoice</button><button class="button" data-action="paid" data-id="${escapeHTML(id)}" ${selectedInvoice.status==='Paid'?'disabled':''}>Mark as paid</button><button class="button" data-action="email" data-id="${escapeHTML(id)}" ${selectedInvoice.email.trim()?'':'disabled'}>Email client (simulation)</button><button class="button danger" data-action="delete-invoice" data-id="${escapeHTML(id)}">Delete invoice</button></div>`);
}
function confirmAction(title,message,onConfirm) {
  openDialog(`<h2 id="dialog-title">${escapeHTML(title)}</h2><p class="subtitle">${escapeHTML(message)}</p><div class="dialog-actions"><button class="button" data-action="close">Cancel</button><button class="button primary" id="confirm-action">Confirm</button></div>`);
  $('#confirm-action').onclick=onConfirm;
}

// ---------- Invoice document: ten rows, unit, tax summary, A4 ----------
function invoiceDocument(invoice) {
  const c=currencyOf(invoice), sub=subtotal(invoice), total=invoiceTotal(invoice), tax=round(total-sub);
  const fmt=n=>amount(n,c), balance=invoice.status==='Paid'?0:total;
  const rows=invoice.items.map((item,index)=>{
    const base=round(item.qty*item.price), lineTax=round(base*invoice.tax/100);
    return `<tr><td>${index+1}</td><td><b>${escapeHTML(item.name)}</b>${item.description?`<small>${escapeHTML(item.description)}</small>`:''}</td><td>${item.qty.toFixed(2)}</td><td>${escapeHTML(item.unit||'—')}</td><td>${item.price.toFixed(2)}</td><td>${base.toFixed(2)}</td><td>${lineTax.toFixed(2)}<small>${invoice.tax.toFixed(2)}%</small></td><td>${round(base+lineTax).toFixed(2)}</td></tr>`;
  }).join('');
  const blanks=Array.from({length:Math.max(0,10-invoice.items.length)},()=>'<tr class="invoice-empty">'+Array.from({length:8},()=>'<td>&nbsp;</td>').join('')+'</tr>').join('');
  return `<article class="invoice-paper"><div class="invoice-top"><div class="invoice-brand"><img src="${window.SPARK_LOGO}" alt="Spark Elegance logo"><strong>${COMPANY.name}</strong><p>${COMPANY.address}<br>${COMPANY.location}<br>TRN ${COMPANY.trn}<br>${COMPANY.phone}<br>${COMPANY.email}<br>${COMPANY.website}</p></div><div class="invoice-title"><h1>${invoice.tax>0?'TAX INVOICE':'INVOICE'}</h1><div class="invoice-number"># ${escapeHTML(invoice.id)}</div><div class="invoice-balance">Balance Due<b>${fmt(balance)}</b></div><div class="invoice-status">${invoice.status}</div></div></div>
    <div class="invoice-parties"><div class="invoice-bill"><span>Bill To</span><b>${escapeHTML(invoice.client)}</b>${invoice.email?`<p>${escapeHTML(invoice.email)}</p>`:''}${invoice.clientAddress?`<p style="white-space:pre-line">${escapeHTML(invoice.clientAddress)}</p>`:''}${invoice.clientVat?`<p>VAT No.: ${escapeHTML(invoice.clientVat)}</p>`:''}</div><div class="invoice-meta"><div><span>Invoice Date:</span><b>${dateLabel(invoice.date)}</b></div><div><span>Terms:</span><b>${escapeHTML(invoice.terms||'Due by due date')}</b></div><div><span>Due Date:</span><b>${dateLabel(invoice.due)}</b></div><div><span>Currency:</span><b>${c}</b></div></div></div>
    <table><colgroup>${[4,29,7,8,11,14,12,15].map(w=>`<col style="width:${w}%">`).join('')}</colgroup><thead><tr>${['#','Item & Description','Qty','Unit','Rate','Taxable Amount','Tax','Amount'].map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows}${blanks}<tr class="invoice-subtotal"><td colspan="5">Sub Total</td><td>${sub.toFixed(2)}</td><td>${tax.toFixed(2)}</td><td>${total.toFixed(2)}</td></tr></tbody></table>
    <div class="invoice-totals"><div><b>Total</b><b>${fmt(total)}</b></div>${invoice.status==='Paid'?`<div><span>Payment received</span><span>${fmt(total)}</span></div>`:''}<div class="balance"><span>Balance Due</span><span>${fmt(balance)}</span></div></div>
    <div class="invoice-tax-title">Tax Summary</div><table class="invoice-tax"><colgroup><col style="width:50%"><col style="width:25%"><col style="width:25%"></colgroup><thead><tr><th>Tax Details</th><th>Taxable Amount (${c})</th><th>Tax Amount (${c})</th></tr></thead><tbody><tr><td>Standard Rate (${invoice.tax}%)</td><td>${sub.toFixed(2)}</td><td>${tax.toFixed(2)}</td></tr><tr><td>Total</td><td>${fmt(sub)}</td><td>${fmt(tax)}</td></tr></tbody></table><div class="invoice-footer">© ${uaeDate().slice(0,4)} Spark Elegance. All rights reserved. · ${COMPANY.name} · ${COMPANY.location} · ${COMPANY.website}</div></article>`;
}
function previewInvoice(id) {
  selectedInvoice=data.invoices.find(i=>i.id===id);
  if(!selectedInvoice)return;
  openDialog(`<h2 id="dialog-title" class="screen-only">Invoice preview</h2><div class="print-tools"><button class="button primary" data-action="print">Print / Save PDF</button><button class="button" data-action="download-invoice">Download invoice HTML</button><span class="invoice-toolbar-note">A4 portrait · Scale 100% · Turn off browser headers and footers.</span></div><div class="print-scroll">${invoiceDocument(selectedInvoice)}</div>`,'invoice-preview');
}
function downloadBlob(contents,type,filename) {
  const url=URL.createObjectURL(new Blob([contents],{type}));
  const link=document.createElement('a');link.href=url;link.download=filename;
  document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function downloadInvoice() {
  if(!selectedInvoice)return;
  const html='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+escapeHTML(selectedInvoice.id)+'</title><style>body{margin:0}'+window.SPARK_PRINT_CSS+'</style></head><body>'+invoiceDocument(selectedInvoice)+'</body></html>';
  downloadBlob(html,'text/html',selectedInvoice.id.replace(/[^a-z0-9-]/gi,'')+'.html');
}

// ---------- Receipt upload and simulated extraction ----------
function showUpload() {
  receiptBusy=false;
  openDialog(`<div class="eyebrow">RECEIPT INBOX</div><h2 id="dialog-title">Make paperwork effortless.</h2><p class="subtitle">Upload a document to start a simulated extraction.</p><label class="drop-zone" id="drop-zone"><span id="upload-symbol" style="font-size:30px">↑</span><strong id="upload-title">Drop a receipt here</strong><small>or tap to browse<br>PDF, PNG or JPG · up to 2 MB</small><input id="receipt-file" type="file" accept="application/pdf,image/png,image/jpeg"></label><div class="notice"><b>Extraction simulation</b><br>This demo uses the filename for a suggested vendor and prefills sample amounts. Review and correct every field before saving.</div><p id="form-error" class="error" hidden role="alert"></p>`);
}
async function parseReceipt(file) {
  if(!file||receiptBusy)return;
  if(!['application/pdf','image/png','image/jpeg'].includes(file.type)){formError('Choose a PDF, PNG or JPG.');return;}
  if(file.size>2*1024*1024){formError('Choose a document under 2 MB.');return;}
  receiptBusy=true;
  const operation=++receiptOperation;
  $('#receipt-file').disabled=true;
  $('#upload-symbol').innerHTML='<span class="spinner"></span>';
  $('#upload-title').textContent='Reading your document…';
  try {
    const fileData=await new Promise((resolve,reject)=>{
      const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);
    });
    await new Promise(resolve=>setTimeout(resolve,1400));
    if(operation!==receiptOperation || !$('#dialog').open)return;
    reviewingReceipt={id:uniqueID(),vendor:file.name.replace(/\.[^.]+$/,'').replace(/[-_]/g,' '),date:uaeDate(),category:'Other',currency:'AED',tax:5,total:105,fileName:file.name,fileData};
    showReceiptReview();
  } catch { if(operation===receiptOperation)formError('Unable to read this file. Close and try again.'); }
  finally { receiptBusy=false; }
}
function showReceiptReview() {
  const r=reviewingReceipt;
  openDialog(`<form id="receipt-form"><div class="eyebrow">SIMULATED EXTRACTION</div><h2 id="dialog-title">Review your receipt</h2><p class="subtitle">${escapeHTML(r.fileName)}</p><div class="notice">Sample values are shown. Replace them with the actual document details.</div><div class="form-grid">${fieldHTML('Vendor name','vendor',r.vendor,'text',true)}${fieldHTML('Receipt date','date',r.date,'date',true)}<label class="field">Category<select name="category">${options(CATEGORIES,r.category)}</select></label><label class="field">Currency<select name="currency">${options(CURRENCIES,r.currency)}</select></label>${fieldHTML('Tax amount (included)','tax',r.tax,'number',true,'min="0" step="0.01"')}${fieldHTML('Total amount','total',r.total,'number',true,'min="0.01" step="0.01"')}</div><p class="error" id="form-error" role="alert" hidden></p><div class="dialog-actions"><button type="button" class="button" data-action="close">Cancel</button><button class="button primary">Save expense</button></div></form>`);
}
function saveReceipt(event) {
  event.preventDefault();
  const fields=new FormData(event.target);
  const receipt={...reviewingReceipt,...Object.fromEntries(fields)};
  receipt.tax=Number(receipt.tax);receipt.total=Number(receipt.total);
  if(!receipt.vendor.trim()||!validDate(receipt.date)||receipt.total<=0||receipt.tax>receipt.total){formError('Enter vendor details and a positive total. Tax cannot exceed total.');return;}
  if(commit({...data,receipts:[receipt,...data.receipts]})){closeDialog();renderPage();notify('Receipt and expense saved.');}
}
function showMatch(id) {
  const receipt=data.receipts.find(r=>r.id===id);
  const available=data.invoices.filter(i=>['Draft','Sent'].includes(i.status));
  openDialog(`<form id="match-form" data-receipt="${escapeHTML(id)}"><div class="eyebrow">RECONCILIATION SIMULATION</div><h2 id="dialog-title">Match to an invoice</h2><p class="subtitle">${escapeHTML(receipt.vendor)} · ${amount(receipt.total,receipt.currency)}</p><div class="notice">This demo marks the entire selected invoice as paid, regardless of receipt amount or currency. It does not process a payment.</div><label class="field" style="margin-top:20px">Open invoice<select name="invoiceId" required><option value="">Select an invoice</option>${available.map(i=>`<option value="${escapeHTML(i.id)}">${escapeHTML(i.id)} · ${escapeHTML(i.client)} · ${amount(invoiceTotal(i),currencyOf(i))}</option>`).join('')}</select></label>${available.length?'':'<p class="subtitle">Create a Draft or Sent invoice first.</p>'}<div class="dialog-actions"><button class="button" type="button" data-action="close">Cancel</button><button class="button primary" ${available.length?'':'disabled'}>Confirm match</button></div></form>`);
}

// ---------- Backups: compatible with previous Folio exports ----------
function exportData() {
  const series={};
  try { for(let index=0;index<localStorage.length;index++){
    const key=localStorage.key(index);
    if(/^spark-invoice-series-\d{4}-\d{2}$/.test(key))series[key]=localStorage.getItem(key);
  }} catch { /* Records can still be exported. */ }
  downloadBlob(JSON.stringify({format:'folio-backup-v1',data,series},null,2),'application/json','spark-elegance-backup-'+uaeDate()+'.json');
  notify('Backup downloaded. Keep it somewhere safe.');
}
async function importData(file) {
  if(!file)return;
  try {
    if(file.size>10*1024*1024)throw new Error();
    const backup=JSON.parse(await file.text());
    if(backup.format!=='folio-backup-v1'||!validData(backup.data))throw new Error();
    confirmAction('Restore this backup?',`Replace current records with ${backup.data.invoices.length} invoices and ${backup.data.receipts.length} receipts? Export your current data first if you want to keep it.`,()=>{
      if(commit(backup.data)){
        try { Object.entries(backup.series||{}).forEach(([key,value])=>{
          if(/^spark-invoice-series-\d{4}-\d{2}$/.test(key)&&/^\d+$/.test(String(value))&&Number(value)<=100000){
            localStorage.setItem(key,String(Math.max(Number(value),Number(localStorage.getItem(key))||1)));
          }
        }); } catch { /* Invoice IDs are also checked when allocating numbers. */ }
        closeDialog();renderPage();notify('Backup restored.');
      }
    });
  } catch { notify('Choose a valid Folio / Spark Elegance JSON backup under 10 MB.'); }
}

// ---------- Event wiring ----------
$('#new-invoice').onclick=()=>showInvoiceEditor();
$('#upload-receipt').onclick=showUpload;
$('#export-data').onclick=exportData;
$('#import-file').onchange=event=>{importData(event.target.files[0]);event.target.value='';};
$('#close-dialog').onclick=closeDialog;
$('#menu-toggle').onclick=()=>$('#sidebar').classList.toggle('open');
$('#dialog').addEventListener('cancel',()=>{receiptOperation++;receiptBusy=false;});
$('#dialog').addEventListener('click',event=>{
  if(event.target!==$('#dialog'))return;
  const rect=event.target.getBoundingClientRect();
  if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)closeDialog();
});
document.querySelectorAll('[data-page]').forEach(button=>button.onclick=()=>{
  page=button.dataset.page;$('#sidebar').classList.remove('open');renderPage();
});
document.addEventListener('input',event=>{
  if(event.target.id==='invoice-search'){renderInvoiceRows();return;}
  if(event.target.id==='expense-search'){renderExpenseRows();return;}
  if(!event.target.closest('#invoice-form'))return;
  const row=event.target.closest('[data-line]');
  if(row){
    const key=event.target.dataset.key;
    editor.items[Number(row.dataset.line)][key]=['qty','price'].includes(key)?Number(event.target.value):event.target.value;
  } else if(event.target.name) editor[event.target.name]=event.target.name==='tax'?Number(event.target.value):event.target.value;
  updateEditorTotals();
});
document.addEventListener('change',event=>{
  if(event.target.id==='status-filter')renderInvoiceRows();
  if(event.target.id==='receipt-file')parseReceipt(event.target.files[0]);
  if(event.target.closest('#invoice-form')&&event.target.name){
    editor[event.target.name]=event.target.name==='tax'?Number(event.target.value):event.target.value;updateEditorTotals();
  }
});
document.addEventListener('dragover',event=>{if(event.target.closest('#drop-zone'))event.preventDefault();});
document.addEventListener('drop',event=>{if(event.target.closest('#drop-zone')){event.preventDefault();parseReceipt(event.dataTransfer.files[0]);}});
document.addEventListener('submit',event=>{
  if(event.target.id==='invoice-form')saveInvoice(event);
  if(event.target.id==='receipt-form')saveReceipt(event);
  if(event.target.id==='match-form'){
    event.preventDefault();
    const invoiceId=new FormData(event.target).get('invoiceId');
    if(!data.invoices.some(i=>i.id===invoiceId&&['Draft','Sent'].includes(i.status)))return;
    if(commit({...data,invoices:data.invoices.map(i=>i.id===invoiceId?{...i,status:'Paid'}:i),receipts:data.receipts.map(r=>r.id===event.target.dataset.receipt?{...r,invoiceId}:r)})){
      closeDialog();renderPage();notify('Receipt linked. Invoice settled in this simulation.');
    }
  }
});
document.addEventListener('click',event=>{
  const button=event.target.closest('[data-action]');
  if(!button||button.disabled)return;
  const action=button.dataset.action,id=button.dataset.id;
  if(action==='close')closeDialog();
  if(action==='all-invoices'){page='invoices';renderPage();}
  if(action==='edit')showInvoiceEditor(id);
  if(action==='preview')previewInvoice(id);
  if(action==='invoice-actions')invoiceActions(id);
  if(action==='print')window.print();
  if(action==='download-invoice')downloadInvoice();
  if(action==='add-line'){
    editor.items.push({name:'',description:'',unit:'',qty:1,price:0});renderEditorLines();updateEditorTotals();
    $('#line-items').lastElementChild.querySelector('input').focus();
  }
  if(action==='remove-line'&&editor.items.length>1){editor.items.splice(Number(button.dataset.index),1);renderEditorLines();updateEditorTotals();}
  if(action==='paid'){
    if(commit({...data,invoices:data.invoices.map(i=>i.id===id?{...i,status:'Paid'}:i)})){closeDialog();renderPage();notify('Invoice marked as paid.');}
  }
  if(action==='email'){
    const invoice=data.invoices.find(i=>i.id===id);
    if(!invoice?.email)return;
    const next={...data,invoices:data.invoices.map(i=>i.id===id&&i.status==='Draft'?{...i,status:'Sent'}:i)};
    if(commit(next)){closeDialog();renderPage();notify('Demo email prepared for '+invoice.email+'. No email was sent.');}
  }
  if(action==='delete-invoice')confirmAction('Delete this invoice?',id+' will be removed. Any receipts linked to it will be unlinked.',()=>{
    if(commit({...data,invoices:data.invoices.filter(i=>i.id!==id),receipts:data.receipts.map(r=>r.invoiceId===id?{...r,invoiceId:null}:r)})){closeDialog();renderPage();notify('Invoice deleted.');}
  });
  if(action==='delete-expense')confirmAction('Delete this expense?','The expense and its stored receipt will be removed. This does not change the status of a matched invoice.',()=>{
    if(commit({...data,receipts:data.receipts.filter(r=>r.id!==id)})){closeDialog();renderPage();notify('Expense deleted.');}
  });
  if(action==='match')showMatch(id);
});
renderPage();
