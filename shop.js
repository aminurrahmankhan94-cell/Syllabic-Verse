// ====== Book Shop (public side). Loads after app.js, which provides db, currentUser and escapeHtml. ======
let shopBooks = [];
let activeBook = null;
let readerPages = [];
let readerIndex = 0;

// Switch between the Literature and Book Shop views
function showView(name) {
  document.getElementById('viewLiterature').hidden = name !== 'literature';
  document.getElementById('viewShop').hidden = name !== 'shop';
  document.querySelectorAll('.nav-link').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === name);
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Live list of books. Only the admin panel creates, edits or deletes these.
db.collection('books').onSnapshot(snapshot => {
  shopBooks = [];
  snapshot.forEach(doc => shopBooks.push({ id: doc.id, ...doc.data() }));
  shopBooks.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  document.getElementById('shopLoader').hidden = true;
  renderShop();
}, err => {
  console.error('Books error:', err);
  document.getElementById('shopLoader').hidden = true;
  document.getElementById('shopGrid').innerHTML = '<p class="empty">Books could not be loaded right now.</p>';
});

// Books saved before the PDF/physical options existed are treated as physical copies
function formatsOf(b) {
  const legacy = b.pdfEnabled === undefined && b.physicalEnabled === undefined;
  return {
    pdf: b.pdfEnabled === true,
    physical: legacy || b.physicalEnabled === true,
    pdfPrice: Number(b.pdfPrice) || 0,
    physicalPrice: Number(legacy ? b.price : b.physicalPrice) || 0
  };
}

function renderShop() {
  const grid = document.getElementById('shopGrid');
  const list = shopBooks.filter(b => b.isAvailable !== false);

  if (!list.length) {
    grid.innerHTML = '<p class="empty">No books are on sale right now. Please check back soon.</p>';
    return;
  }

  grid.innerHTML = list.map(b => {
    const f = formatsOf(b);
    const hasPreview = Array.isArray(b.previewPages) && b.previewPages.length > 0;
    return `
    <article class="book-card">
      <div class="book-cover">
        ${b.imageUrl
          ? `<img src="${escapeHtml(b.imageUrl)}" alt="Cover of ${escapeHtml(b.title)}" loading="lazy">`
          : `<span>${escapeHtml((b.title || '?').charAt(0))}</span>`}
      </div>
      <div class="book-info">
        <h3>${escapeHtml(b.title)}</h3>
        <p class="book-author">By ${escapeHtml(b.author || 'Mahfuja')}</p>
        <p class="book-desc">${escapeHtml(b.description || '')}</p>
        <div class="fmt-row">
          ${f.pdf ? `<span class="fmt">PDF · ৳ ${f.pdfPrice}</span>` : ''}
          ${f.physical ? `<span class="fmt">Physical · ৳ ${f.physicalPrice}</span>` : ''}
        </div>
        <div class="book-foot">
          ${hasPreview ? `<button class="btn-outline btn-sm" onclick="openReader('${b.id}')">Read preview</button>` : '<span></span>'}
          <button class="btn-primary btn-sm" onclick="openOrder('${b.id}')">Order</button>
        </div>
      </div>
    </article>`;
  }).join('');
}

// ====== Preview reader ======
function openReader(id) {
  const b = shopBooks.find(x => x.id === id);
  if (!b || !Array.isArray(b.previewPages) || !b.previewPages.length) return;
  readerPages = b.previewPages;
  readerIndex = 0;
  document.getElementById('readerTitle').textContent = b.title || '';
  renderReader();
  document.getElementById('readerModal').style.display = 'flex';
}

function renderReader() {
  document.getElementById('readerImg').src = readerPages[readerIndex];
  document.getElementById('readerCount').textContent = `Page ${readerIndex + 1} of ${readerPages.length}`;
  document.getElementById('readerPrev').disabled = readerIndex === 0;
  document.getElementById('readerNext').disabled = readerIndex === readerPages.length - 1;
}

function turnPage(step) {
  if (!readerPages.length) return;
  readerIndex = Math.min(readerPages.length - 1, Math.max(0, readerIndex + step));
  renderReader();
}

function closeReader() {
  document.getElementById('readerModal').style.display = 'none';
  document.getElementById('readerImg').removeAttribute('src');
  readerPages = [];
}

document.addEventListener('keydown', e => {
  if (document.getElementById('readerModal').style.display !== 'flex') return;
  if (e.key === 'ArrowRight') turnPage(1);
  if (e.key === 'ArrowLeft') turnPage(-1);
  if (e.key === 'Escape') closeReader();
});

// ====== Order modal ======
function selectedFormat() {
  return document.querySelector('#orderForm input[name="format"]:checked')?.value || 'physical';
}

function openOrder(id) {
  activeBook = shopBooks.find(b => b.id === id);
  if (!activeBook) return;

  const f = formatsOf(activeBook);
  const form = document.getElementById('orderForm');
  form.reset();
  document.getElementById('orderBookTitle').textContent = activeBook.title || '';
  document.getElementById('fmtPdf').hidden = !f.pdf;
  document.getElementById('fmtPhysical').hidden = !f.physical;
  form.querySelector(`input[name="format"][value="${f.pdf ? 'pdf' : 'physical'}"]`).checked = true;
  form.qty.value = 1;
  document.getElementById('orderMsg').textContent = '';
  document.getElementById('orderFormWrap').hidden = false;
  document.getElementById('orderDone').hidden = true;
  onFormatChange();
  document.getElementById('orderModal').style.display = 'flex';
}

function closeOrder() {
  document.getElementById('orderModal').style.display = 'none';
}

// Runs when the buyer picks PDF or physical copy
function onFormatChange() {
  const form = document.getElementById('orderForm');
  const isPdf = selectedFormat() === 'pdf';
  form.qty.disabled = isPdf;
  if (isPdf) form.qty.value = 1;
  form.address.required = !isPdf;
  updateTotal();
}

function updateTotal() {
  if (!activeBook) return;
  const f = formatsOf(activeBook);
  const isPdf = selectedFormat() === 'pdf';
  const qty = isPdf ? 1 : Math.max(1, parseInt(document.getElementById('orderForm').qty.value, 10) || 1);
  document.getElementById('orderTotal').textContent = '৳ ' + qty * (isPdf ? f.pdfPrice : f.physicalPrice);
}

async function submitOrder(e) {
  e.preventDefault();
  if (!activeBook) return;

  const form = e.target;
  const msg = document.getElementById('orderMsg');
  const f = formatsOf(activeBook);
  const format = selectedFormat();
  const isPdf = format === 'pdf';
  const price = isPdf ? f.pdfPrice : f.physicalPrice;
  const qty = isPdf ? 1 : Math.max(1, Math.min(50, parseInt(form.qty.value, 10) || 1));
  const customerName = form.customerName.value.trim();
  const phone = form.phone.value.trim();
  const email = form.email.value.trim();
  const address = isPdf ? '' : form.address.value.trim();

  if (!customerName) { msg.textContent = 'Please enter your name.'; return; }
  if (!/^[+0-9\s-]{7,20}$/.test(phone)) { msg.textContent = 'Please enter a valid phone number.'; return; }
  if (!isPdf && !address) { msg.textContent = 'Please enter your delivery address.'; return; }

  const btn = form.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = 'Sending...';

  try {
    await db.collection('orders').add({
      bookId: activeBook.id,
      bookTitle: activeBook.title || '',
      format,
      price,
      quantity: qty,
      total: qty * price,
      customerName,
      phone,
      email,
      address,
      note: form.note.value.trim().slice(0, 300),
      status: 'pending',
      uid: currentUser ? currentUser.uid : null,
      createdAt: new Date().toISOString()
    });
    document.getElementById('orderFormWrap').hidden = true;
    document.getElementById('orderDone').hidden = false;
  } catch (err) {
    msg.textContent = 'Order could not be sent: ' + err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Place order';
  }
}
