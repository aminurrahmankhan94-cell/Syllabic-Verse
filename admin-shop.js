// ====== Admin: Book Sales & Orders. Add <script src="admin-shop.js"></script> just before </body> in admin.html ======
// Uses db, switchAdminTab, convertImageToBase64 and handleLogin from admin.html's inline script.

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ORDER_STATUSES = ['pending', 'confirmed', 'delivered', 'cancelled'];
const booksById = {};
let shopAdminStarted = false;

// Inject the two new tabs and their panels
(function injectShopTabs() {
  const nav = document.querySelector('.admin-tab-nav');
  const panel = document.getElementById('adminPanel');
  if (!nav || !panel) return;

  nav.insertAdjacentHTML('beforeend', `
    <button class="admin-tab-btn" onclick="switchAdminTab(event, 'tab-books')">Book Sales</button>
    <button class="admin-tab-btn" onclick="switchAdminTab(event, 'tab-orders')">Orders</button>
  `);

  panel.insertAdjacentHTML('beforeend', `
    <div id="tab-books" class="admin-tab-content">
      <div class="article-card">
        <h2 id="bookFormHeading" style="margin-bottom:20px;">Add a book for sale</h2>
        <input type="hidden" id="bookEditId">
        <div class="form-group"><label>Title</label><input id="bookTitle" class="form-control"></div>
        <div class="form-group"><label>Author</label><input id="bookAuthor" class="form-control" placeholder="Mahfuja"></div>
        <div class="form-group"><label>Price (৳)</label><input id="bookPrice" type="number" min="0" class="form-control"></div>
        <div class="form-group">
          <label>Cover image (optional)</label>
          <input type="file" id="bookImgFile" accept="image/*" class="form-control" onchange="convertImageToBase64(this, 'bookImgPreview', 'bookImgData', 500)">
          <input type="hidden" id="bookImgData">
          <img id="bookImgPreview" alt="" style="max-height:140px; display:none; margin-top:10px; border-radius:6px;">
        </div>
        <div class="form-group"><label>Description</label><textarea id="bookDesc" class="form-control" rows="4"></textarea></div>
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
            <thead><tr><th>Book</th><th>Price</th><th>Shop</th><th>Actions</th></tr></thead>
            <tbody id="bookTableBody"></tbody>
          </table>
        </div>
      </div>
    </div>

    <div id="tab-orders" class="admin-tab-content">
      <div class="article-card">
        <h2 style="margin-bottom:20px;">Book orders</h2>
        <div style="overflow-x:auto;">
          <table class="admin-table">
            <thead><tr><th>Customer</th><th>Book</th><th>Qty &amp; total</th><th>Status</th><th>Action</th></tr></thead>
            <tbody id="orderTableBody"></tbody>
          </table>
        </div>
      </div>
    </div>
  `);
})();

// Start the live listeners once, after a successful login
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
      const on = b.isAvailable !== false;
      rows += `
        <tr>
          <td><strong>${esc(b.title)}</strong><br><small style="color:var(--text-muted);">${esc(b.author || 'Mahfuja')}</small></td>
          <td>৳ ${Number(b.price) || 0}</td>
          <td><button class="${on ? 'btn-primary' : 'btn-outline'} btn-sm" onclick="toggleBookShop('${doc.id}', ${on})">${on ? 'On sale' : 'Hidden'}</button></td>
          <td>
            <button class="btn-outline btn-sm" onclick="editBook('${doc.id}')">Edit</button>
            <button class="btn-danger btn-sm" onclick="deleteBook('${doc.id}')">Delete</button>
          </td>
        </tr>`;
    });
    document.getElementById('bookTableBody').innerHTML =
      rows || '<tr><td colspan="4" style="color:var(--text-muted);">No books added yet.</td></tr>';
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
          <small style="color:var(--text-muted);">${esc(o.phone)}</small><br>
          <small style="color:var(--text-muted);">${esc(o.address)}</small>
          ${o.note ? `<br><small>Note: ${esc(o.note)}</small>` : ''}
        </td>
        <td>${esc(o.bookTitle)}</td>
        <td>${Number(o.quantity) || 1} × ৳${Number(o.price) || 0}<br><strong>৳ ${Number(o.total) || 0}</strong></td>
        <td>
          <select class="form-control" style="padding:6px 8px; font-size:13px; width:auto;" onchange="setOrderStatus('${o.id}', this.value)">
            ${ORDER_STATUSES.map(s => `<option value="${s}" ${o.status === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </td>
        <td><button class="btn-danger btn-sm" onclick="deleteOrder('${o.id}')">Delete</button></td>
      </tr>`).join('')
      : '<tr><td colspan="5" style="color:var(--text-muted);">No orders yet.</td></tr>';
  }, err => console.error('Orders admin error:', err));
}

// ====== Book form ======
function saveBook() {
  const val = id => document.getElementById(id).value.trim();
  const title = val('bookTitle');
  const editId = val('bookEditId');
  const price = Math.max(0, Number(val('bookPrice')) || 0);

  if (!title) return alert('Book title is required.');

  const data = {
    title,
    price,
    author: val('bookAuthor') || 'Mahfuja',
    description: val('bookDesc'),
    imageUrl: document.getElementById('bookImgData').value,
    isAvailable: document.getElementById('bookAvail').checked
  };

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
  document.getElementById('bookEditId').value = id;
  document.getElementById('bookTitle').value = b.title || '';
  document.getElementById('bookAuthor').value = b.author || '';
  document.getElementById('bookPrice').value = b.price || 0;
  document.getElementById('bookDesc').value = b.description || '';
  document.getElementById('bookAvail').checked = b.isAvailable !== false;
  document.getElementById('bookImgData').value = b.imageUrl || '';

  const img = document.getElementById('bookImgPreview');
  img.src = b.imageUrl || '';
  img.style.display = b.imageUrl ? 'block' : 'none';

  document.getElementById('bookFormHeading').textContent = 'Edit book';
  document.getElementById('bookSaveBtn').textContent = 'Update book';
  document.getElementById('bookCancelBtn').style.display = 'inline-block';
}

function resetBookForm() {
  ['bookEditId', 'bookTitle', 'bookAuthor', 'bookPrice', 'bookDesc', 'bookImgData'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('bookImgFile').value = '';
  document.getElementById('bookImgPreview').style.display = 'none';
  document.getElementById('bookAvail').checked = true;
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
