// ==================== PWA অটো আপডেট চেকার ====================

function setupPWAUpdateChecker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready.then(registration => {
      // প্রতি 30 মিনিট পর পর চেক করুন
      setInterval(() => {
        registration.update();
        console.log('🔍 Checking for PWA updates...');
      }, 30 * 60 * 1000); // 30 minutes
      
      // নতুন SW ইনস্টল হলে নোটিফিকেশন দেখান
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        console.log('🆕 New Service Worker found!');
        
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              console.log('✨ Update available!');
              showPWAUpdateNotification();
            }
          });
        }
      });
    }).catch(error => {
      console.log('Service Worker not ready:', error);
    });
    
    // কন্ট্রোল চেঞ্জ হলে রিলোড
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      console.log('🔄 Reloading to apply update...');
      window.location.reload();
    });
  } else {
    console.log('Service Worker not supported in this browser');
  }
}

function showPWAUpdateNotification() {
  // চেক করুন নোটিফিকেশন ইতিমধ্যে আছে কিনা
  if (document.querySelector('.pwa-update-notification')) return;
  
  const notificationHTML = `
    <div class="pwa-update-notification" style="
      position: fixed;
      bottom: 20px;
      left: 20px;
      right: 20px;
      max-width: 400px;
      margin: 0 auto;
      background: linear-gradient(135deg, #667eea, #764ba2);
      color: white;
      padding: 15px 20px;
      border-radius: 12px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.3);
      z-index: 10000;
      display: flex;
      align-items: center;
      gap: 15px;
      animation: slideUp 0.5s ease;
    ">
      <div style="font-size: 24px;">🔄</div>
      <div style="flex: 1;">
        <div style="font-weight: bold; margin-bottom: 3px;">নতুন আপডেট পাওয়া গেছে!</div>
        <div style="font-size: 12px; opacity: 0.9;">নতুন ফিচার পেতে আপডেট করুন</div>
      </div>
      <button onclick="applyPWAUpdate()" style="
        background: white;
        color: #667eea;
        border: none;
        padding: 8px 20px;
        border-radius: 25px;
        cursor: pointer;
        font-weight: bold;
        transition: all 0.3s ease;
      " onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
        আপডেট
      </button>
    </div>
  `;
  
  const notificationDiv = document.createElement('div');
  notificationDiv.innerHTML = notificationHTML;
  document.body.appendChild(notificationDiv);
  
  // 1 মিনিট পর অটো হাইড
  setTimeout(() => {
    if (notificationDiv && notificationDiv.parentElement) {
      notificationDiv.style.opacity = '0';
      notificationDiv.style.transition = 'opacity 0.5s ease';
      setTimeout(() => {
        if (notificationDiv && notificationDiv.parentElement) {
          notificationDiv.remove();
        }
      }, 500);
    }
  }, 60000);
}

function applyPWAUpdate() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready.then(registration => {
      if (registration.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        if (typeof showNotification === 'function') {
          showNotification('✅ আপডেট করা হচ্ছে... পেজ রিলোড হবে', 'success');
        } else {
          alert('✅ আপডেট করা হচ্ছে... পেজ রিলোড হবে');
        }
      } else {
        window.location.reload();
      }
    }).catch(error => {
      console.log('Update error:', error);
      window.location.reload();
    });
  } else {
    window.location.reload();
  }
}

// পেজ লোড হলে সেটআপ করুন
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function() {
    setTimeout(setupPWAUpdateChecker, 3000);
  });
} else {
  setTimeout(setupPWAUpdateChecker, 3000);
}

// CSS অ্যানিমেশন
if (!document.querySelector('#pwa-update-style')) {
  const style = document.createElement('style');
  style.id = 'pwa-update-style';
  style.textContent = `
    @keyframes slideUp {
      from {
        opacity: 0;
        transform: translateY(100px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
  `;
  document.head.appendChild(style);
}

// গ্লোবাল ফাংশন এক্সপোজ
window.applyPWAUpdate = applyPWAUpdate;
window.setupPWAUpdateChecker = setupPWAUpdateChecker;

console.log('✅ PWA Auto Update Checker Loaded');