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

// ==================== PWA ডায়াগনস্টিক টুল ====================

async function debugPWA() {
    let report = [];
    
    // ১. প্রোটোকল চেক
    const isHttps = window.location.protocol === 'https:';
    report.push(isHttps ? "✅ প্রোটোকল: HTTPS" : "❌ প্রোটোকল: HTTPS নয় (অবশ্যই HTTPS হতে হবে)");

    // ২. ম্যানিফেস্ট চেক
    const manifestLink = document.querySelector('link[rel="manifest"]');
    report.push(manifestLink ? "✅ ম্যানিফেস্ট লিঙ্ক: পাওয়া গেছে" : "❌ ম্যানিফেস্ট লিঙ্ক: পাওয়া যায়নি");

    // ৩. সার্ভিস ওয়ার্কার চেক
    if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        if (regs.length > 0) {
            report.push(`✅ সার্ভিস ওয়ার্কার: রেজিস্টার্ড (${regs[0].state || 'Active'})`);
        } else {
            report.push("❌ সার্ভিস ওয়ার্কার: রেজিস্টার্ড নয়");
        }
    } else {
        report.push("❌ সার্ভিস ওয়ার্কার: এই ব্রাউজারে সাপোর্ট করে না");
    }

    // ৪. আইকন চেক (Manifest থেকে)
    try {
        const response = await fetch('manifest.json');
        const manifest = await response.json();
        const has192 = manifest.icons.some(i => i.sizes.includes('192x192'));
        const has512 = manifest.icons.some(i => i.sizes.includes('512x512'));
        report.push(has192 ? "✅ ১৯২ আইকন: আছে" : "❌ ১৯২ আইকন: নেই");
        report.push(has512 ? "✅ ৫১২ আইকন: আছে" : "❌ ৫১২ আইকন: নেই");
    } catch (e) {
        report.push("❌ ম্যানিফেস্ট ফাইল: পড়া যাচ্ছে না বা পাথ ভুল");
    }

    // ৫. ইন্সটল প্রম্পট ইভেন্ট চেক
    report.push(deferredPrompt ? "✅ ইন্সটল প্রম্পট: ক্রোম অনুমতি দিয়েছে" : "❌ ইন্সটল প্রম্পট: এখনো আসেনি (ব্রাউজার এখনো সিগন্যাল দেয়নি)");

    // পপ-আপ তৈরি করা
    const debugDiv = document.createElement('div');
    debugDiv.style.cssText = "position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); background:white; padding:20px; border-radius:15px; box-shadow:0 0 50px rgba(0,0,0,0.5); z-index:99999; width:90%; max-width:400px; font-family:sans-serif; border:3px solid #3498db;";
    
    debugDiv.innerHTML = `
        <h3 style="margin-top:0; color:#2c3e50; text-align:center;">🔍 PWA ডায়াগনস্টিক টুল</h3>
        <ul style="list-style:none; padding:0; line-height:2;">
            ${report.map(r => `<li style="border-bottom:1px solid #eee;">${r}</li>`).join('')}
        </ul>
        <p style="font-size:11px; color:#666; margin-top:10px;">
            <b>টিপস:</b> যদি সব সবুজ থাকে কিন্তু শেষটা লাল থাকে, তবে ৩০ সেকেন্ড অপেক্ষা করুন এবং স্ক্রিনে টাচ করুন।
        </p>
        <button onclick="this.parentElement.remove()" style="width:100%; padding:10px; background:#3498db; color:white; border:none; border-radius:5px; cursor:pointer; font-weight:bold;">বন্ধ করুন</button>
    `;

    document.body.appendChild(debugDiv);
}

// ৩ সেকেন্ড পর অটো রান হবে চেক করার জন্য
setTimeout(debugPWA, 3000);