import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getAuth, signOut, onAuthStateChanged, EmailAuthProvider, reauthenticateWithCredential 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
  getFirestore, doc, getDoc, getDocs, collection, addDoc, onSnapshot, deleteDoc, updateDoc, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// FIREBASE CONFIGURATION
const firebaseConfig = {
  apiKey: "AIzaSyCfK9twZsQmU_Q109JnqT11FmwG5zI3g8w",
  authDomain: "echoserve.firebaseapp.com",
  projectId: "echoserve",
  storageBucket: "echoserve.firebasestorage.app",
  messagingSenderId: "965112489324",
  appId: "1:965112489324:web:c4eb4c2746715c8829ff49",
  measurementId: "G-WJ7CY6H8EX"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Quick UI fallback in case auth or Firestore take long
try{
  const quickShop = document.getElementById('nav-shop-name');
  if (quickShop) quickShop.innerText = 'EchoServe';
}catch(e){}

// Application State
let currentCompanyId = null;
let menuItems = [];
let cart = [];
let selectedMenuCategory = 'all';
let menuSearchTerm = '';
let currentUser = null;
let menuUnsubscribe = null;
let ordersUnsubscribe = null;

// Admin access state and helpers
let adminUnlocked = false;
let pendingAdminTab = null;

function setActiveNav(view){
  const navPos = document.getElementById('nav-pos-btn');
  const navAdmin = document.getElementById('nav-admin-btn');
  if (navPos) navPos.classList.toggle('active', view === 'pos');
  if (navAdmin) navAdmin.classList.toggle('active', view === 'admin');
}

window.switchView = function switchView(view){
  const pos = document.getElementById('view-pos');
  const admin = document.getElementById('view-admin');
  if (pos) pos.classList.toggle('hidden', view !== 'pos');
  if (admin) admin.classList.toggle('hidden', view !== 'admin');
  setActiveNav(view);
};

async function checkAdminRole(){
  try{
    if (!currentCompanyId || !currentUser) return false;
    const userRef = doc(db, 'companies', currentCompanyId, 'users', currentUser.uid);
    const snap = await getDoc(userRef);
    if (snap.exists()){
      const data = snap.data() || {};
      if (data.role && data.role.toLowerCase() === 'admin'){
        adminUnlocked = true;
        return true;
      }
    }
  }catch(e){ console.warn('checkAdminRole failed', e); }
  return false;
}

function showAdminModal(){
  const modal = document.getElementById('admin-password-modal');
  if (!modal) return;
  modal.classList.remove('hidden');
}

function hideAdminModal(){
  const modal = document.getElementById('admin-password-modal');
  if (!modal) return;
  modal.classList.add('hidden');
}

async function requestAdminAccess(){
  // If already unlocked, open admin view immediately without re-prompt
  if (adminUnlocked){
    if (pendingAdminTab) setAdminTab(pendingAdminTab);
    window.switchView('admin');
    return;
  }
  // otherwise show password prompt
  showAdminModal();
}

function exitManagement(){
  // Explicitly exit admin area and require re-auth next time
  adminUnlocked = false;
  pendingAdminTab = null;
  window.switchView('pos');
  hideAdminModal();
  addMessage && addMessage('Exited admin management. You will be asked to re-authenticate next time.', 'bot');
}

function setAdminTab(tab){
  const menuSection = document.getElementById('admin-menu-section');
  const salesSection = document.getElementById('admin-sales-section');
  const btns = document.querySelectorAll('.admin-tab-btn');
  btns.forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  if (menuSection) menuSection.classList.toggle('hidden', tab !== 'menu');
  if (salesSection) salesSection.classList.toggle('hidden', tab !== 'sales');
}

// wire nav buttons and modal form once DOM is ready
function initAdminUI(){
  const menuSearch = document.getElementById('menu-search-input');
  menuSearch?.addEventListener('input', () => {
    menuSearchTerm = menuSearch.value;
    if (typeof window.renderMenu === 'function') window.renderMenu();
  });

  const checkoutButton = document.getElementById('checkout-btn');
  const checkoutModal = document.getElementById('checkout-modal');
  const checkoutForm = document.getElementById('checkout-form');
  const checkoutSummary = document.getElementById('checkout-summary');
  const checkoutTotal = document.getElementById('checkout-total');
  const checkoutError = document.getElementById('checkout-error');
  const checkoutOrderType = document.getElementById('checkout-order-type');
  const checkoutTableGroup = document.getElementById('checkout-table-group');
  const checkoutTableNumber = document.getElementById('checkout-table-number');
  const checkoutCashReceived = document.getElementById('checkout-cash-received');
  const checkoutChange = document.getElementById('checkout-change');
  const checkoutFormView = document.getElementById('checkout-form-view');
  const checkoutReceiptView = document.getElementById('checkout-receipt-view');
  const checkoutReceipt = document.getElementById('checkout-receipt');

  const closeCheckout = () => {
    checkoutModal?.classList.add('hidden');
    if (checkoutForm) checkoutForm.reset();
    checkoutFormView?.classList.remove('hidden');
    checkoutReceiptView?.classList.add('hidden');
    checkoutError?.classList.add('hidden');
  };

  checkoutButton?.addEventListener('click', () => {
    if (!cart.length){
      alert('Your cart is empty. Add items before checking out.');
      return;
    }
    const orderType = checkoutOrderType?.value || 'dine-in';
    if (checkoutTableGroup) checkoutTableGroup.classList.toggle('hidden', orderType !== 'dine-in');
    if (checkoutTableNumber) checkoutTableNumber.required = orderType === 'dine-in';
    if (checkoutSummary) checkoutSummary.textContent = cart
      .map(item => `${item.quantity} x ${item.name} — ${formatCurrency(item.price * item.quantity)}`)
      .join('\n');
    const totalCents = cart.reduce((sum, item) => sum + Math.round(Number(item.price) * 100) * item.quantity, 0);
    const total = totalCents / 100;
    if (checkoutTotal) checkoutTotal.textContent = formatCurrency(total);
    if (checkoutCashReceived){
      checkoutCashReceived.min = total.toFixed(2);
      checkoutCashReceived.value = '';
      checkoutCashReceived.placeholder = total.toFixed(2);
    }
    if (checkoutChange) checkoutChange.textContent = `Change due: ${formatCurrency(0)}`;
    checkoutModal?.classList.remove('hidden');
  });

  checkoutCashReceived?.addEventListener('input', () => {
    const totalCents = cart.reduce((sum, item) => sum + Math.round(Number(item.price) * 100) * item.quantity, 0);
    const receivedCents = Math.round((Number(checkoutCashReceived.value) || 0) * 100);
    const changeCents = Math.max(0, receivedCents - totalCents);
    if (checkoutChange) checkoutChange.textContent = `Change due: ${formatCurrency(changeCents / 100)}`;
  });

  checkoutOrderType?.addEventListener('change', () => {
    const isDineIn = checkoutOrderType.value === 'dine-in';
    checkoutTableGroup?.classList.toggle('hidden', !isDineIn);
    if (checkoutTableNumber) checkoutTableNumber.required = isDineIn;
  });
  document.getElementById('checkout-cancel')?.addEventListener('click', closeCheckout);
  document.getElementById('checkout-done')?.addEventListener('click', closeCheckout);
  checkoutForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!cart.length) {
      if (checkoutError){
        checkoutError.textContent = 'Your cart is empty. Add items before confirming the order.';
        checkoutError.classList.remove('hidden');
      }
      return;
    }
    if (!currentCompanyId || !currentUser) {
      if (checkoutError){
        checkoutError.textContent = 'Your account is not ready. Please try again in a moment.';
        checkoutError.classList.remove('hidden');
      }
      return;
    }

    const orderType = checkoutOrderType?.value || 'dine-in';
    const tableNumber = orderType === 'dine-in' ? checkoutTableNumber?.value.trim() || '' : '';
    const confirmButton = document.getElementById('checkout-confirm');
    if (confirmButton) confirmButton.disabled = true;
    checkoutError?.classList.add('hidden');
    const items = cart.map(item => {
      const priceCents = Math.round(Number(item.price) * 100);
      return {
        menuItemId: item.id,
        name: item.name,
        price: priceCents / 100,
        quantity: item.quantity,
        lineTotal: priceCents * item.quantity / 100
      };
    });
    const totalCents = items.reduce((sum, item) => sum + Math.round(item.lineTotal * 100), 0);
    const total = totalCents / 100;
    const cashReceivedCents = Math.round(Number(checkoutCashReceived?.value) * 100);
    if (!Number.isFinite(cashReceivedCents) || cashReceivedCents < totalCents){
      if (checkoutError){
        checkoutError.textContent = 'Cash received must be at least the order total.';
        checkoutError.classList.remove('hidden');
      }
      if (confirmButton) confirmButton.disabled = false;
      return;
    }
    if (typeof window.renderCart !== 'function'){
      if (checkoutError){
        checkoutError.textContent = 'The order screen is still loading. Please try again.';
        checkoutError.classList.remove('hidden');
      }
      if (confirmButton) confirmButton.disabled = false;
      return;
    }
    const cashReceived = cashReceivedCents / 100;
    const changeDue = (cashReceivedCents - totalCents) / 100;
    let orderRef;

    try {
      orderRef = await addDoc(collection(db, 'companies', currentCompanyId, 'orders'), {
        items,
        total,
        orderType,
        tableNumber: tableNumber || null,
        paymentMethod: 'cash',
        paymentStatus: 'paid',
        cashReceived,
        changeDue,
        orderStatus: 'received',
        createdAt: serverTimestamp(),
        paidAt: serverTimestamp(),
        createdBy: currentUser.uid
      });
    } catch (error) {
      console.error('Failed to place order:', error);
      if (checkoutError){
        checkoutError.textContent = 'Could not save your order. Your cart is unchanged; please try again.';
        checkoutError.classList.remove('hidden');
      }
      if (confirmButton) confirmButton.disabled = false;
      return;
    }

    cart = [];
    window.renderCart();
    if (checkoutReceipt){
      checkoutReceipt.textContent = [
        `Order number: ${orderRef.id}`,
        ...items.map(item => `${item.quantity} x ${item.name} — ${formatCurrency(item.lineTotal)}`),
        `Total: ${formatCurrency(total)}`,
        `Order type: ${orderType === 'dine-in' ? `Dine in (Table ${tableNumber})` : 'Takeaway'}`,
        `Cash received: ${formatCurrency(cashReceived)}`,
        `Change due: ${formatCurrency(changeDue)}`
      ].join('\n');
    }
    checkoutFormView?.classList.add('hidden');
    checkoutReceiptView?.classList.remove('hidden');
    if (confirmButton) confirmButton.disabled = false;
    window.dispatchEvent(new CustomEvent('echoserve:order-complete', { detail: { orderId: orderRef.id, total } }));
  });

  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) logoutBtn.addEventListener('click', async () => {
    logoutBtn.disabled = true;
    logoutBtn.textContent = 'Logging out…';
    try {
      await signOut(auth);
      window.location.replace('login.html');
    } catch (error) {
      console.error('Logout failed:', error);
      logoutBtn.disabled = false;
      logoutBtn.textContent = 'Logout';
      alert('Could not log out. Please try again.');
    }
  });

  const navAdmin = document.getElementById('nav-admin-btn');
  const navPos = document.getElementById('nav-pos-btn');
  if (navAdmin) navAdmin.addEventListener('click', () => {
    pendingAdminTab = 'menu'; requestAdminAccess();
  });
  if (navPos) navPos.addEventListener('click', () => {
    const adminView = document.getElementById('view-admin');
    const isAdminVisible = adminView && !adminView.classList.contains('hidden');
    if (isAdminVisible && adminUnlocked) exitManagement();
    else window.switchView('pos');
  });

  const adminForm = document.getElementById('admin-password-form');
  const adminCancel = document.getElementById('admin-password-cancel');
  const adminError = document.getElementById('admin-password-error');
  if (adminCancel) adminCancel.addEventListener('click', () => hideAdminModal());
  if (adminForm) adminForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (adminError) { adminError.classList.add('hidden'); adminError.innerText = ''; }
    const pwdInput = document.getElementById('admin-password-input');
    const pwd = pwdInput ? pwdInput.value : '';
    try{
      // attempt to validate against company doc field `adminPassword` if present
      if (currentCompanyId){
        const compRef = doc(db, 'companies', currentCompanyId);
        const compSnap = await getDoc(compRef);
        if (compSnap.exists()){
          const compData = compSnap.data() || {};
          if (compData.adminPassword && pwd && compData.adminPassword === pwd){
            adminUnlocked = true; hideAdminModal(); if (pendingAdminTab) setAdminTab(pendingAdminTab); window.switchView('admin'); return;
          }
        }
      }
      // require password match in company doc
      // if matched, open admin view
      // final fallback: re-run role check after form (if no adminPassword stored)
      const ok = await checkAdminRole();
      if (ok && !adminUnlocked){
        // role check only bypasses password if desired; we still require password, so only use role as fallback when no adminPassword exists
      }
      if (adminUnlocked){ hideAdminModal(); if (pendingAdminTab) setAdminTab(pendingAdminTab); window.switchView('admin'); return; }
      if (adminError) { adminError.classList.remove('hidden'); adminError.innerText = 'Invalid admin password or insufficient privileges.'; }
    }catch(err){ console.error('admin unlock failed', err); if (adminError) { adminError.classList.remove('hidden'); adminError.innerText = 'Error validating admin access.'; } }
  });

  // admin tab buttons
  const tabBtns = document.querySelectorAll('.admin-tab-btn');
  tabBtns.forEach(b => b.addEventListener('click', (e) => { setAdminTab(b.dataset.tab); }));

  // admin add menu handler
  const addMenuForm = document.getElementById('add-menu-form');
  if (addMenuForm) addMenuForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('menu-item-name')?.value?.trim();
    const price = parseFloat(document.getElementById('menu-item-price')?.value) || 0;
    const category = document.getElementById('menu-item-category')?.value?.trim() || 'General';
    if (!name) return alert('Please enter an item name');
    try{
      await addDoc(collection(db, 'companies', currentCompanyId, 'menu'), { name, price, category, available: true, createdAt: serverTimestamp(), createdBy: currentUser?.uid || null });
      // clear form
      addMenuForm.reset();
    }catch(err){ console.error('Failed to add menu item', err); alert('Failed to add menu item'); }
  });

  // admin menu list renderer + delete handler
  window.renderAdminMenuList = function renderAdminMenuList(){
    const tbody = document.getElementById('admin-menu-list');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (!menuItems || menuItems.length === 0){
      tbody.innerHTML = '<tr><td colspan="4" style="color:var(--text-muted); padding:1rem; text-align:center;">No menu items</td></tr>';
      return;
    }
    menuItems.forEach(it => {
      const tr = document.createElement('tr');
      const nameCell = document.createElement('td');
      nameCell.textContent = it.name || '';
      const categoryCell = document.createElement('td');
      categoryCell.textContent = it.category || '';
      const priceCell = document.createElement('td');
      priceCell.textContent = formatCurrency(it.price || 0);
      const actionsCell = document.createElement('td');
      actionsCell.style.textAlign = 'right';
      const editButton = document.createElement('button');
      editButton.className = 'btn-secondary admin-edit';
      editButton.dataset.id = it.id;
      editButton.textContent = 'Edit';
      const deleteButton = document.createElement('button');
      deleteButton.className = 'btn-danger admin-delete';
      deleteButton.dataset.id = it.id;
      deleteButton.textContent = 'Delete';
      actionsCell.append(editButton, deleteButton);
      tr.append(nameCell, categoryCell, priceCell, actionsCell);
      tbody.appendChild(tr);
    });
    // attach delete handlers
    const dels = tbody.querySelectorAll('.admin-delete');
    dels.forEach(b => b.addEventListener('click', async (e) => {
      const id = b.dataset.id;
      if (!confirm('Delete this menu item?')) return;
      try{ await deleteDoc(doc(db, 'companies', currentCompanyId, 'menu', id)); }catch(err){ console.error('delete failed', err); alert('Delete failed'); }
    }));
  };
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initAdminUI);
else initAdminUI();

function formatCurrency(amount){
  const n = Number(amount || 0);
  return 'RM' + n.toFixed(2);
}

function normalizeName(s){
  if (!s) return '';
  return s.toString().toLowerCase().replace(/[^a-z0-9]/g,'');
}

function levenshtein(a, b){
  const an = a.length, bn = b.length;
  if (an === 0) return bn;
  if (bn === 0) return an;
  const matrix = [];
  for (let i = 0; i <= bn; i++) matrix[i] = [i];
  for (let j = 0; j <= an; j++) matrix[0][j] = j;
  for (let i = 1; i <= bn; i++){
    for (let j = 1; j <= an; j++){
      if (b.charAt(i-1) === a.charAt(j-1)) matrix[i][j] = matrix[i-1][j-1];
      else matrix[i][j] = Math.min(matrix[i-1][j] + 1, matrix[i][j-1] + 1, matrix[i-1][j-1] + 1);
    }
  }
  return matrix[bn][an];
}

function similarity(a,b){
  a = normalizeName(a); b = normalizeName(b);
  if (!a && !b) return 0;
  const dist = levenshtein(a,b);
  const maxLen = Math.max(a.length, b.length) || 1;
  return 1 - (dist / maxLen);
}

function normalizeCommand(s){
  if (!s) return '';
  return s.toString().toLowerCase().replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
}

function matchTrigger(input, triggers, threshold=0.55){
  const norm = normalizeCommand(input);
  for (const trg of triggers){
    const ntr = normalizeCommand(trg);
    if (!ntr) continue;
    if (norm.includes(ntr) || ntr.includes(norm)) return true;
    const sim = similarity(norm, ntr);
    if (sim >= threshold) return true;
  }
  return false;
}

function findMenuItemByName(name){
  if (!menuItems || menuItems.length === 0) return null;
  const normalizedTarget = normalizeName(name);
  const exactMatch = menuItems.find(item => normalizeName(item.name) === normalizedTarget);
  if (exactMatch) return exactMatch;
  const targetWithoutArticle = normalizeName((name || '').toString().replace(/^(?:a|an|the)\s+/i, ''));
  return menuItems.find(item => normalizeName(item.name) === targetWithoutArticle) || null;
}

// Auth Guard & Subscription
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  currentUser = user;
  window.echoServeAuthenticated = true;
  window.dispatchEvent(new Event('echoserve:authenticated'));
  console.log('Authenticated user:', user.uid, user.email);
  // Minimal initialization to avoid UI hanging when data is missing or loading slowly
  try {
    let indexData = {};
    try {
      const indexDoc = await getDoc(doc(db, 'user_index', user.uid));
      indexData = indexDoc.exists() ? (indexDoc.data() || {}) : {};
      console.log('user_index exists:', indexDoc.exists(), 'data:', indexData);
    } catch (indexError) {
      console.warn('Could not load user_index; using fallback company settings:', indexError);
    }
    console.log('user_index resolved:', indexData);
    console.log('resolved companyId (pre):', indexData.companyId);
    currentCompanyId = indexData.companyId || 'demo_company';
    // Try to load company document to get the official display name
    let shopName = 'EchoServe';
    try {
      const compRef = doc(db, 'companies', currentCompanyId);
      console.log('Fetching company doc at', compRef.path || ('companies/' + currentCompanyId));
      const compSnap = await getDoc(compRef);
      console.log('company doc exists:', compSnap.exists());
      if (compSnap.exists()) {
        const compData = compSnap.data() || {};
        console.log('company data sample:', compData);
        shopName = compData.name || indexData.companyName || shopName;
      } else {
        console.log('company doc not found, falling back to user_index companyName');
        shopName = indexData.companyName || shopName;
      }
    } catch (e) {
      console.error('Failed to load company document (exception):', e && e.stack ? e.stack : e);
      shopName = indexData.companyName || shopName;
    }
    const shopEl = document.getElementById('nav-shop-name');
    if (shopEl) shopEl.innerText = shopName;

    // load menu items (best-effort). If firestore access is slow, continue with empty menu.
    try {
      // use realtime listener so admin UI reflects DB changes immediately
      const menuRef = collection(db, 'companies', currentCompanyId, 'menu');
      console.log('Subscribing to menu collection at', menuRef.path || ('companies/' + currentCompanyId + '/menu'));
      if (menuUnsubscribe) menuUnsubscribe();
      menuUnsubscribe = onSnapshot(menuRef, (snapshot) => {
        console.log('menu snapshot size:', snapshot.size);
        menuItems = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        console.log('loaded menu items count:', menuItems.length, menuItems.slice(0,5));
        try{ renderMenu(); renderCart(); renderAdminMenuList && renderAdminMenuList(); }catch(e){}
      }, (err)=>{
        console.error('menu onSnapshot error', err);
      });
    } catch (e) {
      console.error('Failed to subscribe to menu items (will continue):', e && e.stack ? e.stack : e);
      menuItems = [];
    }

    const salesList = document.getElementById('sales-report-list');
    try {
      const ordersRef = collection(db, 'companies', currentCompanyId, 'orders');
      if (ordersUnsubscribe) ordersUnsubscribe();
      ordersUnsubscribe = onSnapshot(ordersRef, snapshot => {
        const orders = snapshot.docs
          .map(orderDoc => ({ id: orderDoc.id, ...orderDoc.data() }))
          .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
        const countEl = document.getElementById('sales-order-count');
        const revenueEl = document.getElementById('sales-total-revenue');
        if (countEl) countEl.textContent = String(orders.length);
        const paidTotal = orders.reduce((sum, order) =>
          order.paymentStatus === 'paid' ? sum + (Number(order.total) || 0) : sum, 0);
        if (revenueEl) revenueEl.textContent = formatCurrency(paidTotal);
        if (!salesList) return;
        salesList.innerHTML = '';
        if (!orders.length){
          const emptyMessage = document.createElement('p');
          emptyMessage.className = 'empty-state';
          emptyMessage.textContent = 'No orders yet.';
          salesList.appendChild(emptyMessage);
          return;
        }
        orders.forEach(order => {
          const card = document.createElement('article');
          card.className = 'sales-order-card';
          const heading = document.createElement('strong');
          heading.textContent = `Order ${order.id}`;
          const details = document.createElement('p');
          const orderLocation = order.orderType === 'dine-in'
            ? `Dine in${order.tableNumber ? ` — Table ${order.tableNumber}` : ''}`
            : 'Takeaway';
          const itemDetails = Array.isArray(order.items)
            ? order.items.map(item => `${item.quantity} x ${item.name}`).join(', ')
            : '';
          details.textContent = `${orderLocation} | ${order.paymentMethod || 'Cash'} (${order.paymentStatus || 'pending'}) | ${itemDetails}`;
          const total = document.createElement('strong');
          total.textContent = formatCurrency(order.total);
          card.append(heading, details, total);
          salesList.appendChild(card);
        });
      }, error => {
        console.error('Failed to load sales orders:', error);
        if (salesList) salesList.textContent = 'Could not load orders. Please try again later.';
      });
    } catch (error) {
      console.error('Failed to subscribe to sales orders:', error);
      if (salesList) salesList.textContent = 'Could not load orders. Please try again later.';
    }

    // Minimal render functions so UI becomes interactive
    window.addToCart = function addToCart(itemId){
      const item = menuItems.find(m => m.id === itemId);
      if (!item) return;
      const existing = cart.find(c => c.id === itemId);
      if (existing) existing.quantity += 1;
      else cart.push({ id: itemId, name: item.name, price: item.price || 0, quantity: 1 });
      renderCart();
    };

    window.changeCartQuantity = function changeCartQuantity(itemId, change){
      const entry = cart.find(item => item.id === itemId);
      if (!entry) return;
      entry.quantity += change;
      if (entry.quantity <= 0) cart = cart.filter(item => item.id !== itemId);
      renderCart();
    };

    window.renderCart = function renderCart(){
      const container = document.getElementById('cart-items');
      if (!container) return;
      container.innerHTML = '';
      const countEl = document.getElementById('cart-count');
      const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);
      if (countEl) countEl.textContent = `${itemCount} ${itemCount === 1 ? 'item' : 'items'}`;

      if (!cart || cart.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'empty-state';
        empty.textContent = 'Your order is empty';
        container.appendChild(empty);
        const totalEl = document.getElementById('cart-total');
        if (totalEl) totalEl.innerText = formatCurrency(0);
        return;
      }

      cart.forEach(item => {
        const row = document.createElement('div');
        row.className = 'cart-entry';

        const details = document.createElement('div');
        const name = document.createElement('span');
        name.className = 'cart-entry-name';
        name.textContent = item.name;
        const price = document.createElement('span');
        price.className = 'cart-entry-price';
        price.textContent = formatCurrency(item.price * item.quantity);
        details.append(name, price);

        const controls = document.createElement('div');
        controls.className = 'quantity-controls';
        const decrease = document.createElement('button');
        decrease.type = 'button';
        decrease.textContent = '−';
        decrease.setAttribute('aria-label', `Decrease ${item.name}`);
        decrease.addEventListener('click', () => window.changeCartQuantity(item.id, -1));
        const quantity = document.createElement('span');
        quantity.textContent = item.quantity;
        const increase = document.createElement('button');
        increase.type = 'button';
        increase.textContent = '+';
        increase.setAttribute('aria-label', `Increase ${item.name}`);
        increase.addEventListener('click', () => window.changeCartQuantity(item.id, 1));
        controls.append(decrease, quantity, increase);
        row.append(details, controls);
        container.appendChild(row);
      });

      const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      const totalEl = document.getElementById('cart-total');
      if (totalEl) totalEl.innerText = formatCurrency(total);
    };

    const menuIconFor = (item) => {
      const text = `${item.category || ''} ${item.name || ''}`.toLowerCase();
      if (/coffee|latte|espresso|drink|tea|juice/.test(text)) return '☕';
      if (/cake|pastry|dessert|cookie|bread/.test(text)) return '🧁';
      if (/sandwich|burger|toast/.test(text)) return '🥪';
      if (/rice|noodle|pasta|meal|lunch/.test(text)) return '🍽️';
      return '🍴';
    };

    window.renderMenu = function renderMenu(){
      const grid = document.getElementById('pos-menu-grid');
      if (!grid) return;
      grid.innerHTML = '';
      const toRender = (menuItems && menuItems.length > 0) ? menuItems : [
        { id: 'demo-coffee', name: 'House Coffee', category: 'Drinks', price: 3.50 },
        { id: 'demo-sandwich', name: 'Chicken Sandwich', category: 'Food', price: 5.00 },
        { id: 'demo-cake', name: 'Signature Cake', category: 'Dessert', price: 2.75 }
      ];

      const categories = [...new Set(toRender.map(item => item.category || 'Other'))].sort();
      const filter = document.getElementById('menu-category-filter');
      if (filter) {
        const chips = ['all', ...categories];
        filter.innerHTML = '';
        chips.forEach(category => {
          const chip = document.createElement('button');
          chip.type = 'button';
          chip.className = `category-chip${selectedMenuCategory === category ? ' active' : ''}`;
          chip.dataset.category = category;
          chip.textContent = category === 'all' ? 'All items' : category;
          chip.addEventListener('click', () => {
            selectedMenuCategory = category;
            renderMenu();
          });
          filter.appendChild(chip);
        });
      }

      const query = menuSearchTerm.trim().toLowerCase();
      const visibleItems = toRender.filter(item => {
        const category = item.category || 'Other';
        const matchesCategory = selectedMenuCategory === 'all' || category === selectedMenuCategory;
        const matchesSearch = !query || `${item.name} ${category}`.toLowerCase().includes(query);
        return matchesCategory && matchesSearch;
      });

      if (!visibleItems.length) {
        const empty = document.createElement('p');
        empty.className = 'empty-state';
        empty.textContent = 'No menu items match your search.';
        grid.appendChild(empty);
        return;
      }

      visibleItems.forEach(item => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'menu-card';

        const icon = document.createElement('span');
        icon.className = 'item-icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = menuIconFor(item);
        const category = document.createElement('span');
        category.className = 'item-category';
        category.textContent = item.category || 'Other';
        const name = document.createElement('strong');
        name.className = 'item-title';
        name.textContent = item.name || '';
        const price = document.createElement('div');
        price.className = 'item-price';
        price.textContent = formatCurrency(item.price || 0);

        button.append(icon, category, name, price);
        button.addEventListener('click', () => window.addToCart(item.id));
        grid.appendChild(button);
      });
    };

    // simple view switcher
    // initial UI render
    renderMenu();
    renderCart();
  } catch (e) {
    console.warn('Initialization warning:', e);
  }
});
((function setupChatbot(){
  const toggle = document.getElementById('chatbot-toggle');
  const panel = document.getElementById('chatbot-panel');
  const closeBtn = document.getElementById('chatbot-close');
  const form = document.getElementById('chatbot-form');
  const input = document.getElementById('chatbot-input');
  const messages = document.getElementById('chatbot-messages');
  const micBtn = document.getElementById('chatbot-mic');
  const listeningIndicator = document.getElementById('chatbot-listening');
  const captionUser = document.getElementById('caption-user');
  const captionAssistant = document.getElementById('caption-assistant');

  let greeted = false;
  let recognition = null;
  let recognizing = false;
  let recognitionEnabled = false;
  let recognitionStarting = false;
  let assistantSpeaking = false;
  let microphonePermissionDenied = false;
  let microphonePermissionRequest = null;
  let itemAwaitingQuantity = null;
  const welcomeMessage = 'Hi! I can help you order from the menu. Say "show menu", "add [quantity] [item]" or "order [item]", "show cart", or "checkout". Checkout records your cash payment. You can also ask whether an item is available. What would you like?';
  let assistantSession = 0;
  let speechGeneration = 0;
  let activeAiRequest = null;
  let absenceClosePending = false;

  function parseQuantity(text){
    const quantityWords = {
      one: 1, two: 2, three: 3, four: 4, five: 5,
      six: 6, seven: 7, eight: 8, nine: 9, ten: 10
    };
    const match = (text || '').trim().toLowerCase().match(/^(?:(?:just|only)\s+)?(\d+|one|two|three|four|five|six|seven|eight|nine|ten)(?:\s+(?:please|of them|items?|pieces?))?[.!?]*$/);
    if (!match) return null;
    const quantity = Number(match[1]) || quantityWords[match[1]];
    return Number.isInteger(quantity) && quantity > 0 && quantity <= 99 ? quantity : null;
  }

  function getPendingQuantityItem(){
    if (itemAwaitingQuantity) return itemAwaitingQuantity;
    const botMessages = messages.querySelectorAll('.chat-bot');
    const lastMessage = botMessages[botMessages.length - 1]?.innerText || '';
    const prompt = lastMessage.match(/^How many (.+) would you like\?$/i);
    return prompt ? findMenuItemByName(prompt[1]) : null;
  }

  function addMenuQuantity(item, quantity){
    for (let i = 0; i < quantity; i++) window.addToCart(item.id);
    addMessage(`Added ${quantity} x ${item.name} to the cart. Anything else?`, 'bot');
  }

  function unavailableMenuMessage(itemName){
    if (!menuItems || menuItems.length === 0){
      return 'Sorry, the menu is not available right now. Please choose an item from the menu once it is available.';
    }
    const availableItems = menuItems.map(item => item.name).filter(Boolean);
    const menuOptions = availableItems.length ? ` Available items include: ${availableItems.join(', ')}.` : '';
    return `Sorry, we don't have "${itemName}" on our menu. Please choose an item from our menu instead.${menuOptions}`;
  }

  function startListening(){
    if (!recognition || !recognitionEnabled || assistantSpeaking || recognizing || recognitionStarting || !panel || panel.classList.contains('hidden') || !window.echoServeUserPresent) return;
    recognitionStarting = true;
    try { recognition.start(); }
    catch(e){
      recognitionStarting = false;
      if (e.name !== 'InvalidStateError') console.warn('Could not start speech recognition:', e);
    }
  }

  function stopListening(){
    recognitionEnabled = false;
    const shouldStop = recognizing || recognitionStarting;
    recognitionStarting = false;
    if (recognition && shouldStop){
      try { recognition.stop(); } catch(e){ console.warn('Could not stop speech recognition:', e); }
    }
  }

  function requestMicrophonePermission(){
    if (!recognition || !navigator.mediaDevices?.getUserMedia) return Promise.resolve(false);
    if (!microphonePermissionRequest){
      microphonePermissionRequest = navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
          stream.getTracks().forEach(track => track.stop());
          microphonePermissionDenied = false;
          if (micBtn) micBtn.title = 'Pause voice input';
          return true;
        })
        .catch(error => {
          console.warn('Microphone permission unavailable:', error);
          microphonePermissionDenied = true;
          if (micBtn){
            micBtn.innerText = '🎤 Allow mic';
            micBtn.title = 'Allow microphone access, then voice input starts automatically';
          }
          if (captionUser) captionUser.innerText = 'Allow microphone access to use voice commands.';
          microphonePermissionRequest = null;
          return false;
        });
    }
    return microphonePermissionRequest;
  }

  function isCloseAssistantCommand(text){
    const command = normalizeCommand(text);
    return /^(?:(?:please|okay|ok) )?(?:close|exit|quit|hide|dismiss|stop)(?: (?:the )?(?:assistant|chat|chatbot))?(?: please)?$/.test(command)
      || /^(?:goodbye|good bye|bye for now)$/.test(command);
  }

  function speak(text){
    if (!text) return;
    const currentSpeech = ++speechGeneration;
    assistantSpeaking = true;
    if (recognition && (recognizing || recognitionStarting)){
      recognitionStarting = false;
      try { recognition.stop(); } catch(e){}
    }

    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'en-US';
    utter.onend = () => {
      if (currentSpeech !== speechGeneration) return;
      assistantSpeaking = false;
      startListening();
    };
    utter.onerror = () => {
      if (currentSpeech !== speechGeneration) return;
      assistantSpeaking = false;
      startListening();
    };
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
    if (captionAssistant) captionAssistant.innerText = text;
  }

  function addMessage(text, sender='bot'){
    const el = document.createElement('div');
    el.className = 'chat-msg ' + (sender === 'user' ? 'chat-user' : 'chat-bot');
    el.innerText = text;
    messages.appendChild(el);
    // render suggestion chips for common assistant prompts
    if (sender === 'bot'){
      const suggestions = [];
      const t = (text||'').toLowerCase();
      if (t.includes('access management') || t.includes('open menu management') || t.includes('open management')) suggestions.push('Access management');
      if (t.includes('exit management') || t.includes('close management') || t.includes('close admin')) suggestions.push('Exit management');
      if (t.includes('show sales') || t.includes('sales report')) suggestions.push('Show sales');
      if (t.includes('show menu') || t.includes('menu')) suggestions.push('Show menu');
      if (suggestions.length){
        const cont = document.createElement('div');
        cont.className = 'suggestion-row';
        suggestions.forEach(s => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'suggestion-chip';
          btn.innerText = s;
          btn.addEventListener('click', () => {
            addMessage(s, 'user');
            // let the handler process the plain text
            handleAssistantAction(s);
          });
          cont.appendChild(btn);
        });
        messages.appendChild(cont);
      }
    }
    messages.scrollTop = messages.scrollHeight;

    if (sender === 'bot') {
      if (captionAssistant) captionAssistant.innerText = text;
      setTimeout(() => speak(text), 50);
    } else {
      if (captionUser) captionUser.innerText = text;
    }
  }

  window.addEventListener('echoserve:order-complete', event => {
    const { orderId, total } = event.detail || {};
    addMessage(`Order ${orderId} placed for ${formatCurrency(total)}. Cash payment recorded. Anything else?`, 'bot');
  });

  async function handleAssistantAction(text){
    if (!text) return false;
    console.log('handleAssistantAction received:', text);
    const t = text.toLowerCase();
    if (t.includes('[action:create_menu_item')){
      const match = text.match(/\[ACTION:CREATE_MENU_ITEM\s+name="([^"]+)"\s+price=(\d+(?:\.\d{1,2})?)\s+category="([^"]*)"\]/i);
      if (!match){
        addMessage('I could not read the proposed menu item. Please specify its name, price, and category.','bot');
        return true;
      }
      const name = match[1].trim();
      const price = Number(match[2]);
      const category = match[3].trim() || 'General';
      if (!name || name.length > 80 || category.length > 40 || !Number.isFinite(price) || price <= 0 || price > 100000){
        addMessage('That menu item has invalid details. Check the name, category, and positive price, then try again.','bot');
        return true;
      }
      if (!currentCompanyId || !currentUser || !(await checkAdminRole())){
        addMessage('Only a signed-in company admin can create permanent menu items.','bot');
        return true;
      }
      if (!window.confirm(`Add ${name} to the permanent menu for ${formatCurrency(price)} in ${category}?`)){
        addMessage('Cancelled. The menu was not changed.','bot');
        return true;
      }
      try{
        await addDoc(collection(db, 'companies', currentCompanyId, 'menu'), {
          name, price, category, available: true, createdAt: serverTimestamp(), createdBy: currentUser.uid
        });
        addMessage(`Added ${name} to the permanent menu for ${formatCurrency(price)}.`, 'bot');
      }catch(err){
        console.error('AI menu item creation failed', err);
        addMessage('I could not save that menu item. Please try again.','bot');
      }
      return true;
    }
    if (t.includes('[action:checkout]')){
      document.getElementById('checkout-btn').click();
      return true;
    }
    // AI explicit action token
    if (t.includes('[action:open_admin]') || t.includes('[action:open_management]') || t.includes('[action:open_menu]')){
      pendingAdminTab = 'menu';
      if (adminUnlocked){
        setAdminTab('menu');
        window.switchView('admin');
      } else {
        requestAdminAccess();
        addMessage('The assistant requests access to Menu Management. Please enter the admin password in the modal or type "admin password <your-password>" here to unlock.','bot');
      }
      return true;
    }
    // AI plain-language triggers (allow AI to say "Open Menu Management" etc.)
    if (matchTrigger(t, ['open menu management','access menu management','open management','open admin','access management'])){
      pendingAdminTab = 'menu';
      if (adminUnlocked){ setAdminTab('menu'); window.switchView('admin'); }
      else { requestAdminAccess(); addMessage('Assistant requested Menu Management. Enter admin password or type "admin password <pw>" in chat.','bot'); }
      return true;
    }
    if (matchTrigger(t, ['open sales','show sales','sales report','view sales'])){
      // sales requires admin as well
      pendingAdminTab = 'sales';
      if (adminUnlocked){ setAdminTab('sales'); window.switchView('admin'); }
      else { requestAdminAccess(); addMessage('Assistant requested Sales Report. Enter admin password or type "admin password <pw>" in chat.','bot'); }
      return true;
    }
    if (t.includes('[action:open_sales]') || t.includes('[action:show_sales]')){
      if (!adminUnlocked){
        pendingAdminTab = 'sales';
        requestAdminAccess();
        return true;
      }
      setAdminTab('sales');
      window.switchView('admin');
      return true;
    }
    if (t.includes('[action:close_admin]') || t.includes('[action:exit_management]')){
      console.log('handleAssistantAction: explicit close token detected');
      exitManagement();
      return true;
    }
    // plain-language close (primary)
    if (matchTrigger(t, ['close management','exit management','close admin','back to pos','go back'])){
      console.log('handleAssistantAction: plain-language close matched');
      exitManagement();
      return true;
    }

    // fallback: try a lower-threshold fuzzy match specifically for exit phrases
    if (matchTrigger(t, ['exit management','close admin','go back to pos','leave admin'], 0.45)){
      console.log('handleAssistantAction: fallback low-threshold close matched');
      exitManagement();
      return true;
    }
    return false;
  }

  async function botRespond(text){
    const t = (text || '').toLowerCase();
    if (/^a user has arrived\.\s*greet them briefly(?: and ask how you can help)?\.?$/i.test(text.trim())){
      return addMessage(welcomeMessage, 'bot');
    }
    if (itemAwaitingQuantity){
      const quantity = parseQuantity(text);
      if (quantity !== null){
        const item = itemAwaitingQuantity;
        itemAwaitingQuantity = null;
        return addMenuQuantity(item, quantity);
      }
      if (/^(?:cancel|never mind|nevermind|stop)[.!?]*$/i.test(text.trim())){
        itemAwaitingQuantity = null;
        return addMessage('Okay, I cancelled adding that item.', 'bot');
      }
    }

    const availabilityRequest = text.match(/^\s*(?:do you have|do you sell|have you got|is there|can i order)\s+(.+?)(?:\s+(?:available|on the menu))?[?.!]*\s*$/i)
      || text.match(/^\s*is\s+(.+?)\s+(?:available|on the menu)[?.!]*\s*$/i);
    if (availabilityRequest){
      const itemName = availabilityRequest[1].replace(/\s+(?:available|on the menu)$/i, '').trim();
      const item = findMenuItemByName(itemName);
      return item
        ? addMessage(`Yes, ${item.name} is on our menu. Would you like to order it?`, 'bot')
        : addMessage(unavailableMenuMessage(itemName), 'bot');
    }

    // allow unlocking admin via chat: "admin password 1234" or "unlock admin 1234"
    const adminPw = t.match(/(?:admin\s*password|unlock\s*admin|admin\s*pass)\s+(.+)/i);
    if (adminPw){
      const pw = adminPw[1].trim();
      try{
        if (!currentCompanyId) return addMessage('Company not loaded yet.','bot');
        const compRef = doc(db, 'companies', currentCompanyId);
        const compSnap = await getDoc(compRef);
        if (compSnap.exists()){
          const compData = compSnap.data() || {};
          if (compData.adminPassword && pw === compData.adminPassword){
            adminUnlocked = true;
            hideAdminModal();
            if (pendingAdminTab) setAdminTab(pendingAdminTab);
            window.switchView('admin');
            return addMessage('Admin unlocked via chat. Opening Menu Management.','bot');
          }
        }
        return addMessage('Admin password incorrect.','bot');
      }catch(e){ console.error('admin unlock chat failed', e); return addMessage('Failed to validate admin password.','bot'); }
    }

    const addRequest = text.match(/^\s*(?:please\s+)?(?:add|put|order|buy|get|\bi want\b|\bi(?:'d| would) like\b|\bcan i (?:get|have)\b|\bmay i have\b)\s+(.+?)\s*$/i);
    if (addRequest){
      let request = addRequest[1].replace(/\s+to\s+(?:the\s+)?cart[.!?]*$/i, '').trim();
      const quantityMatch = request.match(/^(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(.+)$/i);
      const quantity = quantityMatch ? parseQuantity(quantityMatch[1]) : null;
      const itemName = (quantityMatch ? quantityMatch[2] : request).replace(/[.!?]+$/, '').trim();
      const item = findMenuItemByName(itemName);
      if (!item) return addMessage(unavailableMenuMessage(itemName), 'bot');
      if (quantity === null){
        itemAwaitingQuantity = item;
        return addMessage(`How many ${item.name} would you like?`, 'bot');
      }
      return addMenuQuantity(item, quantity);
    }

    // handle add/remove commands spoken by the user
    // support multi-item commands, e.g. "Add 1 Laksa Sarawak, 2 beef burger, 3 Ice lemon tea."
    const listSeparators = /\s*(?:,|;|\band\b)\s*/i;
    const likelyList = t.match(listSeparators);
    if (likelyList){
      const parts = text.split(listSeparators).map(p => p.trim()).filter(Boolean);
      const results = [];
      for (const part of parts){
        // try to extract qty and name from each part
        const m = part.match(/(?:add|put|add to cart)?\s*(\d+)?\s*(.+)/i);
        if (!m) continue;
        const qty = parseInt(m[1]) || 1;
        const rawName = (m[2] || '').trim();
        if (!menuItems || menuItems.length === 0){
          results.push({ ok: false, msg: `Menu not loaded yet for "${rawName}".` });
          continue;
        }
        const item = findMenuItemByName(rawName);
        if (!item){
          results.push({ ok: false, msg: unavailableMenuMessage(rawName) });
          continue;
        }
        for (let i=0;i<qty;i++) window.addToCart(item.id);
        results.push({ ok: true, msg: `Added ${qty} x ${item.name}` });
      }
      if (results.length === 0) return addMessage('I could not parse that command. Try simpler phrases like "Add 1 Laksa Sarawak".','bot');
      const ok = results.filter(r=>r.ok).map(r=>r.msg);
      const nok = results.filter(r=>!r.ok).map(r=>r.msg);
      if (ok.length) addMessage(`${ok.join('; ')}. Anything else?`, 'bot');
      if (nok.length) addMessage(nok.join('; ') + '.', 'bot');
      return;
    }

    const removeMatch = t.match(/(?:remove|delete|remove from cart)\s+(\d+)?\s*(.+)/i);
    if (removeMatch){
      const qty = parseInt(removeMatch[1]) || 1;
      const rawName = (removeMatch[2] || '').trim();
      if (!cart || cart.length === 0) return addMessage('Your cart is empty.','bot');
      // try to find matching cart entry by fuzzy match against menu item names
      const menuItem = findMenuItemByName(rawName);
      let idx = -1;
      if (menuItem) idx = cart.findIndex(c => c.id === menuItem.id || normalizeName(c.name) === normalizeName(menuItem.name));
      if (idx === -1) idx = cart.findIndex(c => normalizeName(c.name).includes(normalizeName(rawName)));
      if (idx === -1) return addMessage(`No matching item in cart to remove.`, 'bot');
      const entry = cart[idx];
      entry.quantity -= qty;
      if (entry.quantity <= 0) cart.splice(idx,1);
      renderCart();
      return addMessage(`Removed ${qty} x ${entry.name} from cart.`, 'bot');
    }
    if (t.includes('menu') || t.includes('show menu')){
      if (!menuItems || menuItems.length === 0) return addMessage('No menu items available right now.','bot');
      const list = menuItems.slice(0,6).map(i => `${i.name} — ${formatCurrency(i.price||0)}`).join('\n');
      return addMessage('Here are some items:\n' + list,'bot');
    }
    if (t.includes('cart') || t.includes("what's in") || t.includes('show cart')){
      if (!cart || cart.length === 0) return addMessage('Your cart is empty.','bot');
      const lines = cart.map(c => `${c.quantity} x ${c.name} — ${formatCurrency(c.price*c.quantity)}`);
      const total = cart.reduce((s,i) => s + (i.price*i.quantity), 0);
      return addMessage(lines.join('\n') + '\nTotal: ' + formatCurrency(total),'bot');
    }
    if (t.includes('checkout') || t.includes('check out') || t.includes('check-out') || t.includes('complete order') || t.includes('pay')){
      document.getElementById('checkout-btn')?.click();
      if (!cart.length) return addMessage('Your cart is empty. Add items before checking out.','bot');
      return addMessage('Review your order in the checkout window and confirm it when you are ready.','bot');
    }
    addMessage('I can help: ask to "show menu", "add [qty] [item]", "show cart", or "checkout".','bot');
  }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition || null;
  if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      recognitionStarting = false;
      recognizing = true;
      microphonePermissionDenied = false;
      if (listeningIndicator) listeningIndicator.classList.remove('hidden');
      if (micBtn) micBtn.innerText = '⏹ Stop';
    };

    recognition.onend = () => {
      recognitionStarting = false;
      recognizing = false;
      if (listeningIndicator) listeningIndicator.classList.add('hidden');
      if (micBtn) micBtn.innerText = microphonePermissionDenied ? '🎤 Allow mic' : (recognitionEnabled ? '⏹ Stop' : '🎤 Start');
      if (recognitionEnabled && !assistantSpeaking) window.setTimeout(startListening, 150);
    };

    recognition.onerror = (e) => {
      console.warn('Speech recognition error', e);
      recognitionStarting = false;
      recognizing = false;
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed'){
        recognitionEnabled = false;
        microphonePermissionDenied = true;
        if (micBtn){
          micBtn.innerText = '🎤 Allow mic';
          micBtn.title = 'Allow microphone access, then voice input starts automatically';
        }
        if (captionUser) captionUser.innerText = 'Allow microphone access to use voice commands.';
      }
      if (listeningIndicator) listeningIndicator.classList.add('hidden');
      if (micBtn && !microphonePermissionDenied) micBtn.innerText = '🎤 Start';
    };

    recognition.onresult = (event) => {
      let interim = '';
      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const res = event.results[i];
        if (res.isFinal) finalTranscript += res[0].transcript;
        else interim += res[0].transcript;
      }
      if (captionUser) captionUser.innerText = finalTranscript || interim;
      if (finalTranscript) {
        if (isCloseAssistantCommand(finalTranscript)){
          addMessage(finalTranscript.trim(), 'user');
          stopAssistantForAbsence();
          return;
        }
        input.value = finalTranscript.trim();
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      }
    };
  } else {
    if (micBtn) micBtn.style.display = 'none';
  }

  if (micBtn) micBtn.addEventListener('click', () => {
    if (!recognition) return;
    if (recognitionEnabled) {
      stopListening();
    } else {
      recognitionEnabled = true;
      startListening();
    }
  });

  function activateAssistantForPresence() {
    if (!panel || !form || !input) return;
    absenceClosePending = false;

    if (panel.classList.contains('hidden')) {
      panel.classList.remove('hidden');
      if (!greeted) {
        greeted = true;
        addMessage(welcomeMessage, 'bot');
      }
    }

    input.value = 'A user has arrived. Greet them briefly and ask how you can help.';
    recognitionEnabled = true;
    requestMicrophonePermission().then(granted => {
      if (granted && recognitionEnabled) startListening();
    });
    if (typeof form.requestSubmit === 'function') form.requestSubmit();
    else form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  }

  function closeAssistantWithFarewell() {
    addMessage('Goodbye — feel free to reopen the assistant anytime.', 'bot');
    setTimeout(() => {
      panel.classList.add('hidden');
      absenceClosePending = false;
    }, 250);
  }

  function stopAssistantForAbsence() {
    if (absenceClosePending) return;
    const shouldSayFarewell = panel && !panel.classList.contains('hidden');
    if (shouldSayFarewell) absenceClosePending = true;
    assistantSession += 1;
    if (activeAiRequest) {
      activeAiRequest.abort();
      activeAiRequest = null;
    }
    speechGeneration += 1;
    stopListening();
    try { window.speechSynthesis.cancel(); } catch (error) { console.warn('Could not stop assistant speech:', error); }
    assistantSpeaking = false;
    if (listeningIndicator) listeningIndicator.classList.add('hidden');
    if (shouldSayFarewell) closeAssistantWithFarewell();
    else if (panel) panel.classList.add('hidden');
  }

  window.addEventListener('echoserve:presence-change', (event) => {
    if (event.detail?.present) activateAssistantForPresence();
    else stopAssistantForAbsence();
  });
  window.setInterval(() => {
    if (!window.echoServeUserPresent && panel && !panel.classList.contains('hidden')) {
      stopAssistantForAbsence();
    }
  }, 500);
  if (window.echoServeUserPresent) {
    setTimeout(activateAssistantForPresence, 0);
  }

  toggle.addEventListener('click', () => {
    if (!window.echoServeUserPresent) {
      stopAssistantForAbsence();
      return;
    }
    const nowHidden = panel.classList.toggle('hidden');
    if (!panel.classList.contains('hidden') && !greeted) {
      greeted = true;
      addMessage(welcomeMessage, 'bot');
    }
  });

  closeBtn.addEventListener('click', () => {
    stopAssistantForAbsence();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!window.echoServeUserPresent) {
      stopAssistantForAbsence();
      return;
    }
    const val = input.value.trim();
    if (!val) return;
    const requestSession = assistantSession;
    addMessage(val, 'user');
    input.value = '';
    // process local short-circuit commands before calling AI proxy
    try{
      const handled = await (async function processLocalCommand(text){
        const t = (text||'').toLowerCase();
        if (isCloseAssistantCommand(t)){
          stopAssistantForAbsence();
          return true;
        }
        const pendingItem = getPendingQuantityItem();
        const requestedQuantity = parseQuantity(text);
        if (pendingItem && requestedQuantity !== null){
          itemAwaitingQuantity = null;
          addMenuQuantity(pendingItem, requestedQuantity);
          return true;
        }
        // admin password via chat
        const adminPw = t.match(/(?:admin\s*password|unlock\s*admin|admin\s*pass)\s+(.+)/i);
        if (adminPw){
          const pw = adminPw[1].trim();
          console.log('Chat admin unlock attempt');
          try{
            if (!currentCompanyId) { addMessage('Company not loaded yet.','bot'); return true; }
            const compRef = doc(db, 'companies', currentCompanyId);
            const compSnap = await getDoc(compRef);
            if (compSnap.exists()){
              const compData = compSnap.data() || {};
              if (compData.adminPassword && pw === compData.adminPassword){
                adminUnlocked = true; hideAdminModal(); if (pendingAdminTab) setAdminTab(pendingAdminTab); window.switchView('admin'); addMessage('Admin unlocked via chat. Opening Menu Management.','bot'); return true;
              }
            }
            addMessage('Admin password incorrect.','bot');
            return true;
          }catch(err){ console.error('admin unlock chat failed', err); addMessage('Failed to validate admin password.','bot'); return true; }
        }

        // admin access phrases (open/access menu management) - require password flow
        if (matchTrigger(t, ['access menu management','open menu management','open management','access management','open admin','access admin','open sales','show sales','sales report','view sales'])){
          if (matchTrigger(t, ['open sales','show sales','sales report','view sales'])) pendingAdminTab = 'sales'; else pendingAdminTab = 'menu';
          requestAdminAccess();
          return true;
        }
        if (/\b(?:add|create)\b.*\b(?:to\s+(?:the\s+)?menu|menu\s+item)\b/i.test(text)) return false;
        // simple local bot commands (show menu, add/remove, checkout, cart)
        if (/^\s*(show menu|menu)\b/.test(t) || /^\s*(?:do you have|do you sell|have you got|is there|can i order)\b/i.test(t) || /^\s*is\s+.+\s+(?:available|on the menu)[?.!]*\s*$/i.test(t) || /^(?:please\s+)?(?:add|put|order|buy|get|i want\b|i(?:'d| would) like\b|can i (?:get|have)\b|may i have\b|remove|checkout|check out|show cart|cart)\b/i.test(t) || (itemAwaitingQuantity && parseQuantity(text) !== null)){
          botRespond(text);
          return true;
        }
        return false;
      })(val);

      if (handled) return;
    }catch(e){ console.error('local command processing failed', e); }
    if (requestSession !== assistantSession) return;

    let requestController = null;
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('You must be signed in to use the AI assistant.');
      const idToken = await user.getIdToken();
      if (requestSession !== assistantSession) return;
      requestController = new AbortController();
      activeAiRequest = requestController;
      const res = await fetch('http://127.0.0.1:3000/api/ai', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        signal: requestController.signal,
        body: JSON.stringify({ messages: [{ role: 'user', content: val }] })
      });
      if (!res.ok) throw new Error('AI proxy error: ' + await res.text());
      const data = await res.json();
      if (requestSession !== assistantSession) return;
      const assistantText = data.assistant || (data.raw && data.raw.choices && data.raw.choices[0] && data.raw.choices[0].message && data.raw.choices[0].message.content) || '';
      const acted = await handleAssistantAction(assistantText);
      if (!acted) addMessage(assistantText || 'No response from AI.', 'bot');
      return;
    } catch (err) {
      if (requestSession !== assistantSession || err.name === 'AbortError') return;
      console.warn('AI proxy failed, falling back to local bot:', err);
    } finally {
      if (activeAiRequest === requestController) activeAiRequest = null;
    }

    setTimeout(() => botRespond(val), 250);
  });

})());
