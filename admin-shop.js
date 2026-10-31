// ====== Admin: Book Sales (PDF + physical copy, preview pages) and Orders ======
// admin.html loads this after its inline script. Uses db, switchAdminTab,
// convertImageToBase64 and handleLogin from admin.html.

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ORDER_STATUSES = ['pending', 'confirmed', 'delivered', 'cancelled'];
const PDF_JS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const PDF_WORKER_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
const PREVIEW_PAGES = 5;            // free preview pages per book
const PREVIEW_MAX_CHARS = 700000;   // keeps one book document well under Firestore's 1 MB limit
const booksById = {};
let formPreview = [];               // preview page images for the book in the form
let previewBusy = false;
let shopAdminStarted = false;

// ---- Inject the two tabs and their panels ----
(function injectShopTabs() {
  const nav = document.querySelector('.admin-tab-nav');
  const panel = document.getElementById('adminPanel');
  if (!nav || !panel) return;

  nav.insertAdjacentHTML('beforeend', `
    <button class="admin-tab-btn" onclick="switchAdminTab(event, 'tab-books')">Book Sales</button>
    <button class="admin-tab-btn" onclick="switchAdminTab(event, 'tab-orders')">Orders</button>`);

  panel.insertAdjacentHTML('beforeend', `
    <div id="tab-books" class="admin-tab-content">
      <div class="article-card">
        <h2 id="bookFormHeading" style="margin-bottom:20px;">Add a book for sale</h2>
        <input type="hidden" id="bookEditId">
        <div class="form-group"><label>Title</label><input id="bookTitle" class="form-control"></div>
        <div class="form-group"><label>Author</label><input id="bookAuthor" class="form-control" placeholder="Mahfuja"></div>
        <div class="form-group">
          <label>Cover image (optional)</label>
          <input type="file" id="bookImgFile" accept="image/*" class="form-control" onchange="convertImageToBase64(this, 'bookImgPreview', 'bookImgData', 500)">
          <input type="hidden" id="bookImgData">
          <img id="bookImgPreview" alt="" style="max-height:140px; display:none; margin-top:10px; border-radius:6px;">
        </div>
        <div class="form-group"><label>Description</label><textarea id="bookDesc" class="form-control" rows="4"></textarea></div>

        <div class="form-group"><label>Sale options</label>
          <div style="display:grid; grid-template-columns:170px 1fr; gap:10px; align-items:center; margin-bottom:8px;">
            <label style="margin:0;"><input type="checkbox" id="bookPdfOn"> PDF</label>
            <input type="number" id="bookPdfPrice" min="0" class="form-control" placeholder="PDF price (৳)">
          </div>
          <div style="display:grid; grid-template-columns:170px 1fr; gap:10px; align-items:center;">
            <label style="margin:0;"><input type="checkbox" id="bookPhysOn" checked> Physical copy</label>
            <input type="number" id="bookPhysPrice" min="0" class="form-control" placeholder="Physical price (৳)">
          </div>
        </div>

        <div class="form-group">
          <label>Full PDF (only used to make the preview; it is not uploaded to the site)</label>
          <input type="file" id="bookPdfFile" accept="application/pdf" class="form-control" onchange="onPdfChosen(this)">
          <p id="previewStatus" style="font-size:13px; color:var(--text-muted); margin-top:8px;"></p>
          <div id="previewStrip" style="display:flex; gap:8px; overflow-x:auto; margin-top:8px;"></div>
          <button type="button" class="btn-outline btn-sm" style="margin-top:8px;" onclick="clearPreview()">Remove preview</button>
        </div>

        <label style="display:flex; gap:8px; align-items:center; margin-bottom:16px;">
          <input type="checkbox" id="bookAvail" checked> Show in Book Shop
        </label>
        <div style="display:flex; gap:10px;">
          <button id="bookSaveBtn" class="btn-primary" style="flex:1;" onclick="saveBook()">Save book</button>
          <button id="bookCancelBtn" class="btn-outline" style="display:none;" onclick="resetBookForm()">Cancel</button>
        </div>
      </div>

      <div class="article-card">
        <h3 style="margin-bottom:10px;">Books</h3>
        <div style="overflow-x:auto;">
          <table class="admin-table">
            <thead><tr><th>Book</th><th>Options</th><th>Shop</th><th>Actions</th></tr></thead>
            <tbody id="bookTableBody"></tbody>
          </table>
        </div>
      </div>
    </div>

    <div id="tab-orders" class="admin-tab-content">
      <div class="article-card">
        <h2 style="margin-bottom:8px;">Book orders</h2>
        <p style="font-size:13px; color:var(--text-muted); margin-bottom:16px;">For PDF orders, send the PDF yourself (WhatsApp or email), then mark the order as delivered.</p>
        <div style="overflow-x:auto;">
          <table class="admin-table">
            <thead><tr><th>Customer</th><th>Book</th><th>Format</th><th>Qty &amp; total</th><th>Status</th><th>Action</th></tr></thead>
            <tbody id="orderTableBody"></tbody>
          </table>
        </div>
      </div>
    </div>`);
})();

// ---- Start the live lists once the admin has logged in ----
const _adminLogin = window.handleLogin;
window.handleLogin = function () {
  _adminLogin();
  if (document.getElementById('adminPanel').style.display === 'block') loadShopAdmin();
};

function loadShopAdmin() {
  if (shopAdminStarted) return;
  shopAdminStarted = true;

  // Books
  db.collection('books').onSnapshot(snapshot => {
    Object.keys(booksById).forEach(k => delete booksById[k]);
    let rows = '';
    snapshot.forEach(doc => {
      const b = { id: doc.id, ...doc.data() };
      booksById[doc.id] = b;
      const legacy = b.pdfEnabled === undefined && b.physicalEnabled === undefined;
      const options = [];
      if (b.pdfEnabled === true) options.push(`PDF ৳${Number(b.pdfPrice) || 0}`);
      if (legacy || b.physicalEnabled === true) options.push(`Physical ৳${Number(legacy ? b.price : b.physicalPrice) || 0}`);
      const on = b.isAvailable !== false;
      const pages = Array.isArray(b.previewPages) ? b.previewPages.length : 0;
      rows += `
        <tr>
          <td><strong>${esc(b.title)}</strong><br><small style="color:var(--text-muted);">${esc(b.author || 'Mahfuja')} · ${pages} preview page(s)</small></td>
          <td>${options.map(esc).join('<br>')}</td>
          <td><button class="${on ? 'btn-primary' : 'btn-outline'} btn-sm" onclick="toggleBookShop('${doc.id}', ${on})">${on ? 'On sale' : 'Hidden'}</button></td>
          <td>
            <button class="btn-outline btn-sm" onclick="editBook('${doc.id}')">Edit</button>
            <button class="btn-danger btn-sm" onclick="deleteBook('${doc.id}')">Delete</button>
          </td>
        </tr>`;
    });
    document.getElementById('bookTableBody').innerHTML =
      rows || '<tr><td colspan="4" style="color:var(--text-muted);">No books yet.</td></tr>';
  }, err => console.error('Books admin error:', err));

  // Orders
  db.collection('orders').onSnapshot(snapshot => {
    const list = [];
    snapshot.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
    list.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

    document.getElementById('orderTableBody').innerHTML = list.length ? list.map(o => `
      <tr>
        <td>
          <strong>${esc(o.customerName)}</strong><br>
          <small style="color:var(--text-muted);">${esc(o.phone)}${o.email ? ' · ' + esc(o.email) : ''}</small>
          ${o.address ? `<br><small style="color:var(--text-muted);">${esc(o.address)}</small>` : ''}
          ${o.note ? `<br><small>Note: ${esc(o.note)}</small>` : ''}
        </td>
        <td>${esc(o.bookTitle)}</td>
        <td>${o.format === 'pdf' ? 'PDF' : 'Physical copy'}</td>
        <td>${Number(o.quantity) || 1} × ৳${Number(o.price) || 0}<br><strong>৳ ${Number(o.total) || 0}</strong></td>
        <td>
          <select class="form-control" style="padding:6px 8px; font-size:13px; width:auto;" onchange="setOrderStatus('${o.id}', this.value)">
            ${ORDER_STATUSES.map(s => `<option value="${s}" ${o.status === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </td>
        <td><button class="btn-danger btn-sm" onclick="deleteOrder('${o.id}')">Delete</button></td>
      </tr>`).join('')
      : '<tr><td colspan="6" style="color:var(--text-muted);">No orders yet.</td></tr>';
  }, err => console.error('Orders admin error:', err));
}

// ====== PDF preview (made in the browser; the full PDF is never uploaded) ======
function loadPdfJs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = PDF_JS_URL;
    s.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER_URL;
      resolve(window.pdfjsLib);
    };
    s.onerror = () => reject(new Error('PDF library could not load. Check your internet connection.'));
    document.head.appendChild(s);
  });
}

async function onPdfChosen(input) {
  const status = document.getElementById('previewStatus');
  const file = input.files[0];
  if (!file) return;

  previewBusy = true;
  status.textContent = 'Preparing preview...';
  try {
    const pdfjs = await loadPdfJs();
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const pages = [];
    let chars = 0;
    const count = Math.min(PREVIEW_PAGES, pdf.numPages);
    for (let i = 1; i <= count; i++) {
      status.textContent = `Preparing preview page ${i} of ${count}...`;
      const page = await pdf.getPage(i);
      const scale = 720 / page.getViewport({ scale: 1 }).width;
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      const img = canvas.toDataURL('image/jpeg', 0.6);
      if (chars + img.length > PREVIEW_MAX_CHARS) break;
      chars += img.length;
      pages.push(img);
    }
    formPreview = pages;
    renderPreviewStrip();
    status.textContent = `Preview ready: ${pages.length} page(s) of ${pdf.numPages}. The full PDF is not uploaded.`;
  } catch (err) {
    status.textContent = 'Preview could not be made: ' + err.message;
  } finally {
    previewBusy = false;
  }
}

function renderPreviewStrip() {
  document.getElementById('previewStrip').innerHTML = formPreview
    .map((src, i) => `<img src="${src}" alt="Preview page ${i + 1}" style="height:110px; border:1px solid var(--card-border); border-radius:4px;">`)
    .join('');
}

function clearPreview() {
  formPreview = [];
  document.getElementById('bookPdfFile').value = '';
  document.getElementById('previewStatus').textContent = 'Preview removed.';
  renderPreviewStrip();
}

// ====== Book form ======
function saveBook() {
  if (previewBusy) return alert('The preview is still being prepared. Please wait a moment.');

  const val = id => document.getElementById(id).value.trim();
  const title = val('bookTitle');
  const pdfOn = document.getElementById('bookPdfOn').checked;
  const physOn = document.getElementById('bookPhysOn').checked;
  const pdfPrice = Number(val('bookPdfPrice'));
  const physPrice = Number(val('bookPhysPrice'));

  if (!title) return alert('Book title is required.');
  if (!pdfOn && !physOn) return alert('Choose at least one option: PDF or physical copy.');
  if (pdfOn && (val('bookPdfPrice') === '' || pdfPrice < 0)) return alert('Enter a valid PDF price.');
  if (physOn && (val('bookPhysPrice') === '' || physPrice < 0)) return alert('Enter a valid physical copy price.');

  const data = {
    title,
    author: val('bookAuthor') || 'Mahfuja',
    description: val('bookDesc'),
    imageUrl: document.getElementById('bookImgData').value,
    pdfEnabled: pdfOn,
    pdfPrice: pdfOn ? pdfPrice : 0,
    physicalEnabled: physOn,
    physicalPrice: physOn ? physPrice : 0,
    previewPages: formPreview,
    isAvailable: document.getElementById('bookAvail').checked
  };

  const editId = val('bookEditId');
  const btn = document.getElementById('bookSaveBtn');
  btn.disabled = true;
  btn.textContent = 'Saving...';

  const task = editId
    ? db.collection('books').doc(editId).update(data)
    : db.collection('books').add({ ...data, createdAt: new Date().toISOString() });

  task.then(() => {
    alert(editId ? 'Book updated.' : 'Book added to the shop.');
    resetBookForm();
  }).catch(err => {
    alert('Error: ' + err.message);
  }).finally(() => {
    btn.disabled = false;
    btn.textContent = document.getElementById('bookEditId').value ? 'Update book' : 'Save book';
  });
}

function editBook(id) {
  const b = booksById[id];
  if (!b) return;
  document.querySelector('[onclick*="tab-books"]').click();

  const legacy = b.pdfEnabled === undefined && b.physicalEnabled === undefined;
  document.getElementById('bookEditId').value = id;
  document.getElementById('bookTitle').value = b.title || '';
  document.getElementById('bookAuthor').value = b.author || '';
  document.getElementById('bookDesc').value = b.description || '';
  document.getElementById('bookPdfOn').checked = b.pdfEnabled === true;
  document.getElementById('bookPdfPrice').value = b.pdfPrice ?? '';
  document.getElementById('bookPhysOn').checked = legacy || b.physicalEnabled === true;
  document.getElementById('bookPhysPrice').value = legacy ? (b.price ?? '') : (b.physicalPrice ?? '');
  document.getElementById('bookAvail').checked = b.isAvailable !== false;
  document.getElementById('bookImgData').value = b.imageUrl || '';

  const img = document.getElementById('bookImgPreview');
  img.src = b.imageUrl || '';
  img.style.display = b.imageUrl ? 'block' : 'none';

  formPreview = Array.isArray(b.previewPages) ? [...b.previewPages] : [];
  renderPreviewStrip();
  document.getElementById('previewStatus').textContent = formPreview.length
    ? `${formPreview.length} preview page(s) saved. Choose a new PDF only if you want to replace them.`
    : '';

  document.getElementById('bookFormHeading').textContent = 'Edit book';
  document.getElementById('bookSaveBtn').textContent = 'Update book';
  document.getElementById('bookCancelBtn').style.display = 'inline-block';
}

function resetBookForm() {
  ['bookEditId', 'bookTitle', 'bookAuthor', 'bookDesc', 'bookImgData', 'bookPdfPrice', 'bookPhysPrice']
    .forEach(id => { document.getElementById(id).value = ''; });
  document.getElementById('bookImgFile').value = '';
  document.getElementById('bookPdfFile').value = '';
  document.getElementById('bookImgPreview').style.display = 'none';
  document.getElementById('bookPdfOn').checked = false;
  document.getElementById('bookPhysOn').checked = true;
  document.getElementById('bookAvail').checked = true;
  formPreview = [];
  renderPreviewStrip();
  document.getElementById('previewStatus').textContent = '';
  document.getElementById('bookFormHeading').textContent = 'Add a book for sale';
  document.getElementById('bookSaveBtn').textContent = 'Save book';
  document.getElementById('bookCancelBtn').style.display = 'none';
}

function toggleBookShop(id, currentlyOn) {
  db.collection('books').doc(id).update({ isAvailable: !currentlyOn });
}

function deleteBook(id) {
  if (confirm('Delete this book from the shop?')) db.collection('books').doc(id).delete();
}

// ====== Orders ======
function setOrderStatus(id, status) {
  db.collection('orders').doc(id).update({ status });
}

function deleteOrder(id) {
  if (confirm('Delete this order?')) db.collection('orders').doc(id).delete();
}
