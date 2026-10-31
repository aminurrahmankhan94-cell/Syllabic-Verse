// ====== Book Shop (public side). Load after app.js, which provides db, currentUser and escapeHtml. ======
let shopBooks = [];
let activeBook = null;

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

function renderShop() {
  const grid = document.getElementById('shopGrid');
  const list = shopBooks.filter(b => b.isAvailable !== false);

  if (!list.length) {
    grid.innerHTML = '<p class="empty">No books are on sale right now. Please check back soon.</p>';
    return;
  }

  grid.innerHTML = list.map(b => `
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
        <div class="book-foot">
          <strong>৳ ${Number(b.price) || 0}</strong>
          <button class="btn-primary" onclick="openOrder('${b.id}')">Order now</button>
        </div>
      </div>
    </article>
  `).join('');
}

// ====== Order modal ======
function openOrder(id) {
  activeBook = shopBooks.find(b => b.id === id);
  if (!activeBook) return;

  const form = document.getElementById('orderForm');
  form.reset();
  form.qty.value = 1;
  document.getElementById('orderBookTitle').textContent = activeBook.title || '';
  document.getElementById('orderMsg').textContent = '';
  document.getElementById('orderFormWrap').hidden = false;
  document.getElementById('orderDone').hidden = true;
  updateTotal();
  document.getElementById('orderModal').style.display = 'flex';
}

function closeOrder() {
  document.getElementById('orderModal').style.display = 'none';
}

function updateTotal() {
  if (!activeBook) return;
  const qty = Math.max(1, parseInt(document.getElementById('orderForm').qty.value, 10) || 1);
  const price = Number(activeBook.price) || 0;
  document.getElementById('orderTotal').textContent = '৳ ' + (qty * price);
}

async function submitOrder(e) {
  e.preventDefault();
  if (!activeBook) return;

  const form = e.target;
  const msg = document.getElementById('orderMsg');
  const qty = Math.max(1, Math.min(50, parseInt(form.qty.value, 10) || 1));
  const customerName = form.customerName.value.trim();
  const phone = form.phone.value.trim();
  const address = form.address.value.trim();
  const price = Number(activeBook.price) || 0;

  if (!customerName || !address) {
    msg.textContent = 'Please enter your name and delivery address.';
    return;
  }
  if (!/^[+0-9\s-]{7,20}$/.test(phone)) {
    msg.textContent = 'Please enter a valid phone number.';
    return;
  }

  const btn = form.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = 'Sending...';

  try {
    await db.collection('orders').add({
      bookId: activeBook.id,
      bookTitle: activeBook.title || '',
      price,
      quantity: qty,
      total: qty * price,
      customerName,
      phone,
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
