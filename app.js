const firebaseConfig = {
  apiKey: "AIzaSyBzvxeq6feVCSdcDVywh7mWikxbD3RryuU",
  authDomain: "my-writer-gallery-2cd87.firebaseapp.com",
  projectId: "my-writer-gallery-2cd87",
  storageBucket: "my-writer-gallery-2cd87.firebasestorage.app",
  messagingSenderId: "233413550719",
  appId: "1:233413550719:web:fe5e2eae246ee601a3d54a"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();
const googleProvider = new firebase.auth.GoogleAuthProvider();

// Enable offline persistence
db.enablePersistence({ synchronizeTabs: true }).catch((err) => {
  if (err.code == 'failed-precondition') {
    console.warn('Multiple tabs open, persistence active in first tab.');
  } else if (err.code == 'unimplemented') {
    console.warn('Browser does not support persistence.');
  }
});

let currentUser = null;
let allArticles = [];
let currentCategory = 'All';
let currentSort = 'newest';
let currentPage = 1;
const postsPerPage = 5;
let bookmarkedIds = JSON.parse(localStorage.getItem('savedArticles') || '[]');

// ====== Splash Screen Time (5 Seconds Duration) ======
setTimeout(() => {
  const splash = document.getElementById('splashScreen');
  if (splash) {
    splash.style.opacity = '0';
    setTimeout(() => splash.remove(), 800);
  }
}, 5000);

// ====== Theme Switcher Feature ======
function toggleTheme() {
  document.body.classList.toggle('light-mode');
  const btn = document.getElementById('themeToggleBtn');
  if (document.body.classList.contains('light-mode')) {
    if (btn) btn.innerText = "Dark Mode";
  } else {
    if (btn) btn.innerText = "Light Mode";
  }
}

// ====== Author Profile Sync ======
db.collection("settings").doc("authorProfile").onSnapshot((doc) => {
  if (doc.exists) {
    const data = doc.data();
    if (document.getElementById('modalAuthorName')) document.getElementById('modalAuthorName').innerText = data.name || "Mahfuja";
    if (document.getElementById('modalAuthorBio')) document.getElementById('modalAuthorBio').innerText = data.bio || "No biography available.";
    if (data.image && document.getElementById('modalAuthorImg')) document.getElementById('modalAuthorImg').src = data.image;

    // Bottom Author Sync
    if (document.getElementById('bottomAuthorName')) document.getElementById('bottomAuthorName').innerText = data.name || "Mahfuja";
    if (document.getElementById('bottomAuthorBio')) document.getElementById('bottomAuthorBio').innerText = data.bio || "No biography available.";
    if (data.image && document.getElementById('bottomAuthorImg')) document.getElementById('bottomAuthorImg').src = data.image;
  }
}, (error) => {
  console.log("Author profile notice:", error);
});

function openAuthorModal() {
  const modal = document.getElementById('authorModal');
  if (modal) modal.style.display = 'flex';
}

function closeAuthorModal() {
  const modal = document.getElementById('authorModal');
  if (modal) modal.style.display = 'none';
}

function toggleAuthorBottomDetails() {
  const details = document.getElementById('authorBottomDetails');
  if (details) {
    details.style.display = details.style.display === 'block' ? 'none' : 'block';
  }
}

// ====== Auth State & Google Sign In ======
auth.onAuthStateChanged(async (user) => {
  currentUser = user;
  const loginBtn = document.getElementById('loginBtn');
  const userBadge = document.getElementById('userBadge');

  if (user) {
    const userRef = db.collection("users").doc(user.uid);
    try {
      const doc = await userRef.get();
      if (doc.exists && doc.data().isBanned) {
        alert("Your account has been suspended by the admin.");
        auth.signOut();
        return;
      }
      await userRef.set({
        uid: user.uid,
        name: user.displayName || 'Reader',
        email: user.email,
        photo: user.photoURL || '',
        lastLogin: new Date().toISOString()
      }, { merge: true });
    } catch(e) {
      console.log("User sync warning:", e);
    }

    if (loginBtn) loginBtn.style.display = 'none';
    if (userBadge) userBadge.style.display = 'flex';
    if (document.getElementById('userName')) document.getElementById('userName').innerText = (user.displayName || 'Reader').split(' ')[0];
    if (document.getElementById('userAvatar')) document.getElementById('userAvatar').src = user.photoURL || 'https://via.placeholder.com/30';
  } else {
    if (loginBtn) loginBtn.style.display = 'inline-block';
    if (userBadge) userBadge.style.display = 'none';
  }
  renderArticles();
});

function googleSignIn() {
  auth.signInWithPopup(googleProvider).catch(err => alert("Sign in failed: " + err.message));
}

function googleSignOut() { auth.signOut(); }

// ====== Fetch & Render Articles with Pagination ======
let dataLoadedOnce = false;
setTimeout(() => {
  if (!dataLoadedOnce) {
    const loader = document.getElementById('bookLoader');
    if (loader && loader.style.display !== 'none') {
      loader.style.display = 'none';
    }
  }
}, 4000);

db.collection("articles").onSnapshot({ includeMetadataChanges: true }, (snapshot) => {
  dataLoadedOnce = true;
  allArticles = [];
  snapshot.forEach((doc) => { allArticles.push({ id: doc.id, ...doc.data() }); });

  const loader = document.getElementById('bookLoader');
  if (loader) loader.style.display = 'none';
  renderArticles();
}, (error) => {
  console.error("Firestore error:", error);
  const loader = document.getElementById('bookLoader');
  if (loader) loader.style.display = 'none';
});

function changeSort(val) {
  currentSort = val;
  currentPage = 1;
  renderArticles();
}

function renderArticles() {
  const container = document.getElementById('articlesGrid');
  if (!container) return;
  const searchInput = document.getElementById('searchInput');
  const searchText = searchInput ? searchInput.value.toLowerCase() : '';

  container.innerHTML = '';

  // Filter Logic
  let filtered = allArticles.filter(art => {
    if (currentCategory === 'Saved') {
      return bookmarkedIds.includes(art.id);
    }
    const matchesCat = currentCategory === 'All' || (art.subject && art.subject.toLowerCase() === currentCategory.toLowerCase());
    const matchesSearch = (art.title && art.title.toLowerCase().includes(searchText)) || 
                          (art.author && art.author.toLowerCase().includes(searchText)) ||
                          (art.content && art.content.toLowerCase().includes(searchText));
    return matchesCat && matchesSearch;
  });

  // Sort Logic
  filtered.sort((a, b) => {
    if (b.isPinned !== a.isPinned) return (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0);
    if (currentSort === 'oldest') {
      return new Date(a.createdAt) - new Date(b.createdAt);
    } else if (currentSort === 'likes') {
      const likesA = Array.isArray(a.likes) ? a.likes.length : 0;
      const likesB = Array.isArray(b.likes) ? b.likes.length : 0;
      return likesB - likesA;
    } else {
      return new Date(b.createdAt) - new Date(a.createdAt);
    }
  });

  if (filtered.length === 0) {
    container.innerHTML = '<p style="text-align:center; color:var(--text-muted); margin:40px 0; letter-spacing:1px;">NO WRITINGS FOUND</p>';
    renderPagination(0);
    return;
  }

  // Pagination Slice Logic
  const totalPages = Math.ceil(filtered.length / postsPerPage);
  if (currentPage > totalPages) currentPage = 1;

  const startIndex = (currentPage - 1) * postsPerPage;
  const pageArticles = filtered.slice(startIndex, startIndex + postsPerPage);

  pageArticles.forEach(art => {
    const likesList = Array.isArray(art.likes) ? art.likes : [];
    const hasLiked = currentUser && likesList.some(l => (typeof l === 'string' ? l === currentUser.uid : l.uid === currentUser.uid));
    const isBookmarked = bookmarkedIds.includes(art.id);
    const comments = Array.isArray(art.comments) ? art.comments : [];
    const formattedDate = formatDate(art.createdAt);

    // Reading time feature
    const fullContent = art.content || '';
    const wordCount = fullContent.split(/\s+/).filter(w => w.length > 0).length;
    const readTime = Math.max(1, Math.ceil(wordCount / 180));

    // Content Truncate logic
    const isLong = fullContent.length > 250;
    const shortContent = isLong ? fullContent.substring(0, 250) + '...' : fullContent;

    container.innerHTML += `
      <div class="article-card ${art.isPinned ? 'pinned-card' : ''}">
        ${art.isPinned ? '<div class="pinned-tag">PINNED WORK</div>' : ''}
        <div class="card-header">
          <h2 class="article-title">${escapeHtml(art.title)}</h2>
          <span class="category-badge">${escapeHtml(art.subject || 'General')}</span>
        </div>
        <div class="author-meta">
          <span>By ${escapeHtml(art.author || 'Anonymous')} ${formattedDate ? ' | ' + formattedDate : ''}</span>
          <span>${readTime} min read</span>
        </div>
        
        ${art.imageUrl ? `<img src="${escapeHtml(art.imageUrl)}" class="post-image" alt="Post Image">` : ''}

        <div id="body-short-${art.id}" class="article-body">${escapeHtml(shortContent)}</div>
        ${isLong ? `<div id="body-full-${art.id}" class="article-body" style="display:none;">${escapeHtml(fullContent)}</div>` : ''}
        
        ${isLong ? `<button id="btn-more-${art.id}" class="read-more-btn" onclick="toggleReadMore('${art.id}')">Read More</button>` : ''}
        
        <div class="card-actions">
          <button class="action-btn ${hasLiked ? 'active-like' : ''}" onclick="likePost('${art.id}')">
            ${hasLiked ? 'LIKED' : 'LIKE'} (${likesList.length})
          </button>
          <button class="action-btn" onclick="toggleComments('${art.id}')">COMMENTS (${comments.length})</button>
          <button class="action-btn ${isBookmarked ? 'active-bookmark' : ''}" onclick="toggleBookmark('${art.id}')">
            ${isBookmarked ? 'SAVED' : 'SAVE'}
          </button>
        </div>

        <div id="comments-${art.id}" style="display:none; margin-top:15px; background:var(--bg-color); padding:15px; border-radius:8px; border:1px solid var(--card-border);">
          <div style="display:flex; gap:10px; margin-bottom:15px;">
            <input type="text" id="input-text-${art.id}" placeholder="Write a comment..." class="form-control" style="flex:1;">
            <button class="btn-primary" onclick="addComment('${art.id}')">POST</button>
          </div>
          <div>
            ${comments.map(c => `
              <div style="margin-bottom:12px; font-size:13px; border-bottom:1px dashed var(--card-border); padding-bottom:8px; color:var(--text-main);">
                <strong>${escapeHtml(c.name)}:</strong> ${escapeHtml(c.text)}${(c.replies && c.replies.length > 0) ? c.replies.map(r => `
                  <div style="margin-top:6px; margin-left:15px; font-size:12px; color:var(--text-muted); border-left:2px solid var(--accent-gold); padding-left:10px;">
                    <strong>Admin Reply:</strong> ${escapeHtml(r.text)}
                  </div>
                `).join('') : ''}
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  });

  renderPagination(totalPages);
}

// ====== Render Pagination Numbers (1, 2, 3, 4...) ======
function renderPagination(totalPages) {
  const pagContainer = document.getElementById('pagination');
  if (!pagContainer) return;

  if (totalPages <= 1) {
    pagContainer.innerHTML = '';
    return;
  }

  let html = '';
  for (let i = 1; i <= totalPages; i++) {
    html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" onclick="goToPage(${i})">${i}</button>`;
  }
  pagContainer.innerHTML = html;
}

function goToPage(pageNum) {
  currentPage = pageNum;
  renderArticles();
  window.scrollTo({ top: document.getElementById('articlesGrid').offsetTop - 80, behavior: 'smooth' });
}

function toggleBookmark(id) {
  if (bookmarkedIds.includes(id)) {
    bookmarkedIds = bookmarkedIds.filter(b => b !== id);
  } else {
    bookmarkedIds.push(id);
  }
  localStorage.setItem('savedArticles', JSON.stringify(bookmarkedIds));
  renderArticles();
}

function toggleReadMore(id) {
  const shortBody = document.getElementById(`body-short-${id}`);
  const fullBody = document.getElementById(`body-full-${id}`);
  const btn = document.getElementById(`btn-more-${id}`);

  if (fullBody.style.display === 'none') {
    fullBody.style.display = 'block';
    shortBody.style.display = 'none';
    btn.innerText = 'Read Less';
  } else {
    fullBody.style.display = 'none';
    shortBody.style.display = 'block';
    btn.innerText = 'Read More';
  }
}

function filterCategory(cat) {
  currentCategory = cat;
  currentPage = 1;
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  if (event && event.target) event.target.classList.add('active');
  renderArticles();
}

if (document.getElementById('searchInput')) {
  document.getElementById('searchInput').addEventListener('input', () => {
    currentPage = 1;
    renderArticles();
  });
}

// ====== Toggle Like Logic ======
async function likePost(id) {
  if (!currentUser) return alert("Please sign in to like this post.");

  const userDoc = await db.collection("users").doc(currentUser.uid).get();
  if (userDoc.exists && userDoc.data().isBanned) return alert("Your account has been suspended.");

  const articleRef = db.collection("articles").doc(id);
  const doc = await articleRef.get();
  if (!doc.exists) return;

  let likesList = Array.isArray(doc.data().likes) ? doc.data().likes : [];
  const existingIndex = likesList.findIndex(l => (typeof l === 'string' ? l === currentUser.uid : l.uid === currentUser.uid));

  if (existingIndex > -1) {
    likesList.splice(existingIndex, 1);
  } else {
    likesList.push({
      uid: currentUser.uid,
      name: currentUser.displayName || 'Reader',
      email: currentUser.email || 'N/A'
    });
  }

  articleRef.update({ likes: likesList });
}

function toggleComments(id) {
  const box = document.getElementById(`comments-${id}`);
  box.style.display = box.style.display === 'block' ? 'none' : 'block';
}

async function addComment(id) {
  if (!currentUser) return alert("Please sign in to comment.");

  const userDoc = await db.collection("users").doc(currentUser.uid).get();
  if (userDoc.exists && userDoc.data().isBanned) return alert("Your account has been suspended.");

  const textInput = document.getElementById(`input-text-${id}`);
  const text = textInput.value.trim();
  if (!text) return;

  const newComment = {
    id: 'cmt_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
    uid: currentUser.uid,
    name: currentUser.displayName || 'Reader',
    email: currentUser.email || 'N/A',
    text: text,
    replies: [],
    createdAt: new Date().toISOString()
  };

  db.collection("articles").doc(id).update({
    comments: firebase.firestore.FieldValue.arrayUnion(newComment)
  }).then(() => textInput.value = '');
}

function formatDate(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function escapeHtml(t) { return t ? t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") : ''; }

// ====== Offline AI Chatbot ======
function toggleAIChat() {
  const box = document.getElementById('aiChatBox');
  box.style.display = box.style.display === 'flex' ? 'none' : 'flex';
}

function handleChatKey(e) { if (e.key === 'Enter') sendChatMessage(); }

function sendChatMessage() {
  const input = document.getElementById('chatInput');
  const body = document.getElementById('chatBody');
  const query = input.value.trim();
  if (!query) return;

  body.innerHTML += `<div class="chat-msg user">${escapeHtml(query)}</div>`;
  input.value = '';

  const typingId = 'typing-' + Date.now();
  body.innerHTML += `<div id="${typingId}" class="chat-msg bot">Thinking...</div>`;
  body.scrollTop = body.scrollHeight;

  setTimeout(() => {
    const el = document.getElementById(typingId);
    if (el) el.remove();
    body.innerHTML += `<div class="chat-msg bot">${getOfflineAIResponse(query)}</div>`;
    body.scrollTop = body.scrollHeight;
  }, 600);
}

function getOfflineAIResponse(q) {
  q = q.toLowerCase();
  if (q.includes("hello") || q.includes("hi")) return "Hello! Welcome to Onukto literature portal.";
  if (q.includes("mahfuja") || q.includes("onukto")) return "Onukto is a literature portal created by Mahfuja, featuring poems, stories, and novels.";
  if (q.includes("raflido")) return "Raflido Studios is the developer studio behind Onukto Portal.";
  return "Thank you for asking! Explore writings using categories or search above.";
}
