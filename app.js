/* ============================================================
   1) ÜRÜN VERİ TABANI (Fotoğraftaki gerçek ürünler)
   ============================================================ */
const PRODUCTS = [
  { 
    barcode: "8690632041827", 
    name: "Toz Kahve", 
    brand: "Nescafe", 
    category: "Gıda", 
    price: 15.00, 
    quantity: "10 gram" 
  },
  { 
    barcode: "4015000090900", 
    name: "Stick Yapıştırıcı", 
    brand: "Pritt", 
    category: "Kırtasiye", 
    price: 80.00, 
    quantity: "43 gram" 
  },
  { 
    barcode: "8690857011964", 
    name: "10 Numara Zımba Teli", 
    brand: "3A", 
    category: "Kırtasiye", 
    price: 35.00, 
    quantity: "1000 adet" 
  }
];

/* ============================================================
   2) YARDIMCILAR
   ============================================================ */
const $ = (id) => document.getElementById(id);
const findProduct = (code) => PRODUCTS.find(p => p.barcode === String(code).trim());
const formatPrice = (n) => n.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' });

function showMessage(text, type = 'info') {
  const el = $('message');
  el.textContent = text;
  el.className = 'message ' + type;
  clearTimeout(showMessage._t);
  showMessage._t = setTimeout(() => { el.className = 'message'; }, 3000);
}

/* Aynı barkodun 1.5 sn içinde tekrar işlenmesini engelle */
const lastScan = { code: null, time: 0 };
const SCAN_COOLDOWN = 1500;
function shouldProcess(code) {
  const now = Date.now();
  if (lastScan.code === code && (now - lastScan.time) < SCAN_COOLDOWN) return false;
  lastScan.code = code;
  lastScan.time = now;
  return true;
}

/* ============================================================
   3) DURUM
   ============================================================ */
let mode = 'single';
let cart = loadCart();
let stream = null;
let detector = null;
let scanTimer = null;
let running = false;

/* ============================================================
   4) SEPET KALICILIĞI
   ============================================================ */
function saveCart() {
  try { localStorage.setItem('market_cart_v1', JSON.stringify(cart)); } catch {}
}
function loadCart() {
  try {
    const raw = localStorage.getItem('market_cart_v1');
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

/* ============================================================
   5) KAMERA + BARKOD
   ============================================================ */
async function startCamera() {
  if (running) return;

  if (!('BarcodeDetector' in window)) {
    showMessage('Bu tarayıcı BarcodeDetector API desteklemiyor. Elle giriş yapın.', 'error');
    return;
  }

  try {
    const supported = await BarcodeDetector.getSupportedFormats();
    const wanted = ['ean_13','ean_8','code_128','code_39','upc_a','upc_e','itf'];
    const formats = wanted.filter(f => supported.includes(f));
    if (formats.length === 0) {
      showMessage('Klasik barkod formatları desteklenmiyor.', 'error');
      return;
    }
    detector = new BarcodeDetector({ formats });

    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });

    const video = $('video');
    video.srcObject = stream;
    await video.play();
    $('camPlaceholder').style.display = 'none';

    running = true;
    $('btnStart').disabled = true;
    $('btnStop').disabled = false;
    showMessage('Kamera açıldı. Barkodu çerçeveye hizalayın.', 'info');

    scheduleScan();
  } catch (err) {
    console.error(err);
    const map = {
      NotAllowedError: 'Kamera izni reddedildi. Elle barkod girerek devam edebilirsiniz.',
      PermissionDeniedError: 'Kamera izni reddedildi.',
      NotFoundError: 'Cihazda kamera bulunamadı.',
      NotReadableError: 'Kamera başka bir uygulama tarafından kullanılıyor.',
      OverconstrainedError: 'Kamera istenen çözünürlüğü desteklemiyor.',
      SecurityError: 'Kamera erişimi güvenlik nedeniyle engellendi (HTTPS gerekli).'
    };
    showMessage(map[err.name] || ('Kamera hatası: ' + err.message), 'error');
  }
}

/* 120 ms aralıklı tarama — pil dostu */
function scheduleScan() {
  if (!running) return;
  scanTimer = setTimeout(async () => {
    const video = $('video');
    if (video.readyState >= 2 && detector) {
      try {
        const codes = await detector.detect(video);
        if (codes && codes.length > 0) handleBarcode(codes[0].rawValue);
      } catch {}
    }
    scheduleScan();
  }, 120);
}

function stopCamera() {
  running = false;
  if (scanTimer) { clearTimeout(scanTimer); scanTimer = null; }
  if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
  $('video').srcObject = null;
  $('camPlaceholder').style.display = '';
  $('btnStart').disabled = false;
  $('btnStop').disabled = true;
}

/* ============================================================
   6) BARKOD İŞLEME
   ============================================================ */
function handleBarcode(code) {
  if (!shouldProcess(code)) return;
  const product = findProduct(code);
  if (!product) {
    showMessage('Ürün bulunamadı.', 'error');
    if (mode === 'single') $('singleResult').innerHTML = '';
    return;
  }
  if (mode === 'single') {
    renderSingle(product);
    showMessage('Ürün bulundu: ' + product.name, 'info');
  } else {
    addToCart(product);
  }
}

function renderSingle(p) {
  $('singleResult').innerHTML = `
    <div class="card">
      <h3>📦 ${p.name}</h3>
      <div class="row"><span>Barkod</span><span>${p.barcode}</span></div>
      <div class="row"><span>Marka</span><span>${p.brand}</span></div>
      <div class="row"><span>Kategori</span><span>${p.category}</span></div>
      <div class="row"><span>Miktar</span><span>${p.quantity}</span></div>
      <div class="row"><span>Fiyat</span><span class="price">${formatPrice(p.price)}</span></div>
    </div>`;
}

function addToCart(p) {
  const existing = cart.find(c => c.barcode === p.barcode);
  if (existing) existing.qty += 1;
  else cart.push({ ...p, qty: 1 });
  saveCart();
  renderCart();
  showMessage('Sepete eklendi: ' + p.name, 'info');
}

function renderCart() {
  const list = $('cartList');
  const empty = $('cartEmpty');
  list.innerHTML = '';

  if (cart.length === 0) {
    empty.style.display = 'block';
    $('cartTotal').textContent = formatPrice(0);
    $('cartBadge').textContent = '0';
    return;
  }
  empty.style.display = 'none';

  let total = 0;
  let count = 0;
  cart.forEach(item => {
    const line = item.price * item.qty;
    total += line;
    count += item.qty;
    const li = document.createElement('li');
    li.innerHTML = `
      <div>
        <div class="item-name">${item.name}<span class="qty">×${item.qty}</span></div>
        <div class="item-meta">${item.brand} · ${item.quantity}</div>
      </div>
      <div class="price">${formatPrice(line)}</div>`;
    list.appendChild(li);
  });
  $('cartTotal').textContent = formatPrice(total);
  $('cartBadge').textContent = count;
}

/* ============================================================
   7) MOD DEĞİŞTİRME
   ============================================================ */
function setMode(m) {
  mode = m;
  $('tabSingle').classList.toggle('active', m === 'single');
  $('tabCart').classList.toggle('active', m === 'cart');
  $('panelSingle').classList.toggle('active', m === 'single');
  $('panelCart').classList.toggle('active', m === 'cart');
  lastScan.code = null; lastScan.time = 0;
  $('message').className = 'message';
}
$('tabSingle').addEventListener('click', () => setMode('single'));
$('tabCart').addEventListener('click', () => setMode('cart'));

/* ============================================================
   8) ELLE GİRİŞ
   ============================================================ */
$('btnManual').addEventListener('click', () => {
  const code = $('manualInput').value.trim();
  if (!code) { showMessage('Lütfen barkod girin.', 'error'); return; }
  handleBarcode(code);
  $('manualInput').value = '';
});
$('manualInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btnManual').click(); });

/* ============================================================
   9) KONTROLLER
   ============================================================ */
$('btnStart').addEventListener('click', startCamera);
$('btnStop').addEventListener('click', stopCamera);
$('btnClearCart').addEventListener('click', () => {
  if (cart.length === 0) return;
  if (confirm('Sepeti temizlemek istediğinize emin misiniz?')) {
    cart = [];
    saveCart();
    renderCart();
    showMessage('Sepet temizlendi.', 'info');
  }
});

/* ============================================================
   10) PWA / SW
   ============================================================ */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(err => console.warn('SW:', err));
  });
}
window.addEventListener('pagehide', stopCamera);

/* İlk render */
renderCart();
