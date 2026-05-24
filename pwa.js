let deferredPrompt = null;

// ১. সার্ভিস ওয়ার্কার রেজিস্ট্রেশন এবং আপডেট চেক
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').then(reg => {
      console.log('🚀 SW Registered');
      
      // প্রতি ৩০ মিনিট পর পর আপডেট চেক
      setInterval(() => { reg.update(); }, 30 * 60 * 1000);

      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            showPWAUpdateNotification();
          }
        });
      });
    });
  });

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload();
  });
}

// ২. কাস্টম ইন্সটল বাটন লজিক
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  showInstallButton(); // বাটন দেখাও
});

function showInstallButton() {
  if (document.querySelector('.install-btn')) return;
  
  const btn = document.createElement('button');
  btn.className = 'install-btn';
  btn.innerHTML = '📱 অ্যাপ ইন্সটল করুন';
  btn.style.cssText = `
    position: fixed; bottom: 25px; right: 20px;
    background: linear-gradient(135deg, #27ae60, #2ecc71);
    color: white; border: none; padding: 12px 24px;
    border-radius: 50px; cursor: pointer; z-index: 10000;
    font-weight: bold; box-shadow: 0 4px 15px rgba(0,0,0,0.3);
  `;
  
  btn.onclick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') btn.remove();
    deferredPrompt = null;
  };
  document.body.appendChild(btn);
}

// ৩. আপডেট নোটিফিকেশন UI
function showPWAUpdateNotification() {
  const div = document.createElement('div');
  div.innerHTML = `
    <div style="position:fixed; bottom:20px; left:20px; right:20px; background:#34495e; color:white; padding:15px; border-radius:10px; z-index:10001; display:flex; justify-content:space-between; align-items:center; box-shadow:0 5px 15px rgba(0,0,0,0.5);">
      <span>নতুন আপডেট পাওয়া গেছে!</span>
      <button onclick="applyPWAUpdate()" style="background:#2ecc71; color:white; border:none; padding:8px 15px; border-radius:5px; cursor:pointer; font-weight:bold;">আপডেট করুন</button>
    </div>
  `;
  document.body.appendChild(div);
}

function applyPWAUpdate() {
  navigator.serviceWorker.ready.then(reg => {
    if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
    else window.location.reload();
  });
}

window.applyPWAUpdate = applyPWAUpdate;