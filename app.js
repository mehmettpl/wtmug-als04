/* ============================================================
   1) ÜRÜN VERİ TABANI (JSON DOSYASINDAN YÜKLENECEK)
   ============================================================ */
let PRODUCTS = []; 
let isLoaded = false; 

async function loadProducts() {
  try {
    const response = await fetch('./urunler.json');
    if (!response.ok) throw new Error("JSON dosyası okunamadı.");
    PRODUCTS = await response.json();
    isLoaded = true;
    console.log("✅ Ürünler urunler.json'dan başarıyla yüklendi:", PRODUCTS);
  } catch (error) {
    console.error("❌ JSON Yükleme Hatası:", error);
    showMessage('Ürün listesi yüklenemedi! (Sunucu kullanmalısınız)', 'error');
  }
}
loadProducts();

/* ============================================================
   2) YARDIMCILAR VE ARAMA
   ============================================================ */
const $ = (id) => document.getElementById(id);

const findProduct = (code) => {
  if (!isLoaded) return null;
  const cleanCode = String(code).replace(/\D/g, ''); 
  if (!cleanCode) return null;
  
  return PRODUCTS.find(p => {
    const pCode = String(p.barcode).replace(/\D/g, '');
    return pCode === cleanCode || pCode.includes(cleanCode) || cleanCode.includes(pCode);
  });
};

const formatPrice = (n) => n.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' });

function showMessage(text, type = 'info') {
  const el = $('message');
  if(!el) { alert(text); return; }
  el.textContent = text;
  el.className = 'message ' + type;
  clearTimeout(showMessage._t);
  showMessage._t = setTimeout(() => { el.className = 'message'; }, 4000);
}

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
let videoTrack = null; // Flaş için eklendi
let isFlashOn = false; // Flaş durumu

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
   5) KAMERA + BARKOD + FLAŞ
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

    // --- FLAŞ İÇİN KAMERA İZİNİ ALINDI ---
    videoTrack = stream.getVideoTracks()[0];
    if($('btnFlash')) $('btnFlash').disabled = false;

    const video = $('video');
    video.srcObject = stream;
    await video.play();
    if($('camPlaceholder')) $('camPlaceholder').style.display = 'none';
    running = true;
    $('btnStart').disabled = true;
    $('btnStop').disabled = false;
    showMessage('Kamera açıldı. Barkodu çerçeveye hizalayın.', 'info');
    scheduleScan();
  } catch (err) {
    console.error(err);
    showMessage('Kamera hatası: ' + err.message, 'error');
  }
}

function scheduleScan() {
  if (!running) return;
  scanTimer = setTimeout(async () => {
    const video = $('video');
    if (video && video.readyState >= 2 && detector) {
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
  
  // FLAŞ SIFIRLAMA
  videoTrack = null;
  isFlashOn = false;
  if($('btnFlash')) {
    $('btnFlash').disabled = true;
    $('btnFlash').textContent = '🔦 Flaş Aç';
    $('btnFlash').classList.add('secondary');
    $('btnFlash').style.background = '';
    $('btnFlash').style.color = '';
  }

  const video = $('video');
  if(video) video.srcObject = null;
  if($('camPlaceholder')) $('camPlaceholder').style.display = '';
  if($('btnStart')) $('btnStart').disabled = false;
  if($('btnStop')) $('btnStop').disabled = true;
}

/* ============================================================
   FLAŞI AÇ / KAPAT
   ============================================================ */
async function toggleFlash() {
  if (!videoTrack) {
    showMessage('Kamera açık değil.', 'error');
    return;
  }
  try {
    isFlashOn = !isFlashOn;
    await videoTrack.applyConstraints({
      advanced: [{ torch: isFlashOn }]
    });
    
    if (isFlashOn) {
      $('btnFlash').textContent = '🔦 Flaş Kapat';
      $('btnFlash').classList.remove('secondary');
      $('btnFlash').style.background = '#fbbc04';
      $('btnFlash').style.color = '#000';
    } else {
      $('btnFlash').textContent = '🔦 Flaş Aç';
      $('btnFlash').classList.add('secondary');
      $('btnFlash').style.background = '';
      $('btnFlash').style.color = '';
    }
  } catch (err) {
    console.error("Flaş hatası:", err);
    showMessage('Cihaz flaşı desteklemiyor veya izin vermedi.', 'error');
    isFlashOn = false;
  }
}

/* ============================================================
   6) BARKOD İŞLEME
   ============================================================ */
function handleBarcode(code) {
  if (!isLoaded) {
    showMessage('Ürün listesi henüz yüklenmedi. Lütfen bekleyin...', 'error');
    return;
  }
  if (!shouldProcess(code)) return;
  
  const product = findProduct(code);

  if (!product) {
    showMessage('Ürün bulunamadı. (Girilen: ' + code + ')', 'error');
    if (mode === 'single' && $('singleResult')) $('singleResult').innerHTML = '';
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
  if(!$('singleResult')) return;
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
  if(!$('cartList')) return;
  const list = $('cartList');
  const empty = $('cartEmpty');
  list.innerHTML = '';
  if (cart.length === 0) {
    if(empty) empty.style.display = 'block';
    if($('cartTotal')) $('cartTotal').textContent = formatPrice(0);
    if($('cartBadge')) $('cartBadge').textContent = '0';
    return;
  }
  if(empty) empty.style.display = 'none';
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
  if($('cartTotal')) $('cartTotal').textContent = formatPrice(total);
  if($('cartBadge')) $('cartBadge').textContent = count;
}

/* ============================================================
   7) MOD VE OLAYLAR
   ============================================================ */
function setMode(m) {
  mode = m;
  if($('tabSingle')) $('tabSingle').classList.toggle('active', m === 'single');
  if($('tabCart')) $('tabCart').classList.toggle('active', m === 'cart');
  if($('panelSingle')) $('panelSingle').classList.toggle('active', m === 'single');
  if($('panelCart')) $('panelCart').classList.toggle('active', m === 'cart');
  lastScan.code = null; lastScan.time = 0;
}
if($('tabSingle')) $('tabSingle').addEventListener('click', () => setMode('single'));
if($('tabCart')) $('tabCart').addEventListener('click', () => setMode('cart'));

if($('btnManual')) {
  $('btnManual').addEventListener('click', () => {
    const code = $('manualInput').value.trim();
    if (!code) { showMessage('Lütfen barkod girin.', 'error'); return; }
    handleBarcode(code);
    $('manualInput').value = '';
  });
}
if($('manualInput')) {
  $('manualInput').addEventListener('keydown', (e) => { if (e.key === 'Enter' && $('btnManual')) $('btnManual').click(); });
}

if($('btnStart')) $('btnStart').addEventListener('click', startCamera);
if($('btnStop')) $('btnStop').addEventListener('click', stopCamera);
if($('btnFlash')) $('btnFlash').addEventListener('click', toggleFlash); // Flaş butonu dinleyicisi

if($('btnClearCart')) {
  $('btnClearCart').addEventListener('click', () => {
    if (cart.length === 0) return;
    if (confirm('Sepeti temizlemek istediğinize emin misiniz?')) {
      cart = [];
      saveCart();
      renderCart();
      showMessage('Sepet temizlendi.', 'info');
    }
  });
}

/* ============================================================
   8) SERVICE WORKER
   ============================================================ */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(function(registrations) {
    for(let registration of registrations) {
      registration.unregister();
    } 
  });
}
window.addEventListener('pagehide', stopCamera);
renderCart();
