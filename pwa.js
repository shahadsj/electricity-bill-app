/**
 * PWA.JS - IMPROVED VERSION
 */
let deferredPrompt = null;
let installButton = null;

// ১. চেক করা যে অ্যাপটি অলরেডি ইন্সটলড কি না (Standalone Mode)
const isAppInstalled = () => {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
};

// ২. ইন্সটল বাটন তৈরির ফাংশন
function showInstallButton() {
    // যদি অলরেডি ইন্সটলড থাকে তবে বাটন দেখাবে না
    if (isAppInstalled()) {
        console.log('✅ App is already installed and running in standalone mode.');
        return;
    }

    const existingBtn = document.querySelector('.install-btn');
    if (existingBtn) existingBtn.remove();
    
    installButton = document.createElement('button');
    installButton.className = 'install-btn';
    installButton.innerHTML = '📱 অ্যাপ ইন্সটল করুন';
    installButton.style.cssText = `
        position: fixed;
        bottom: 25px;
        right: 20px;
        background: linear-gradient(135deg, #27ae60, #2ecc71);
        color: white;
        border: none;
        padding: 14px 24px;
        border-radius: 50px;
        cursor: pointer;
        z-index: 9999;
        font-size: 15px;
        font-weight: bold;
        box-shadow: 0 8px 20px rgba(39, 174, 96, 0.4);
        transition: all 0.3s ease;
        display: block;
    `;
    
    installButton.onclick = installApp;
    document.body.appendChild(installButton);
}

// ৩. ইন্সটল প্রম্পট ইভেন্ট লিসেনার
window.addEventListener('beforeinstallprompt', (e) => {
    console.log('✅ beforeinstallprompt event captured');
    // ব্রাউজারের ডিফল্ট পপ-আপ বন্ধ করা
    e.preventDefault();
    // ইভেন্টটি সেভ করে রাখা
    deferredPrompt = e;
    
    // ২ সেকেন্ড পর বাটনটি দেখানো (নিশ্চিত হওয়ার জন্য যে পেজ লোড হয়েছে)
    setTimeout(showInstallButton, 2000);
});

// ৪. ইন্সটল করার মেইন ফাংশন
async function installApp() {
    if (!deferredPrompt) {
        // যদি প্রম্পট না থাকে তবে ইউজারকে ম্যানুয়ালি ইন্সটল করার উপায় জানানো
        showNotification('📱 মোবাইলের ব্রাউজার মেনু (তিনটি ডট) থেকে "Install App" সিলেক্ট করুন।', 'info');
        return;
    }
    
    // প্রম্পট দেখানো
    deferredPrompt.prompt();
    
    // ইউজার কি ডিসিশন নিল তা চেক করা
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User response to the install prompt: ${outcome}`);
    
    if (outcome === 'accepted') {
        console.log('✅ User accepted');
        if (installButton) installButton.remove();
    } else {
        console.log('❌ User dismissed');
    }
    
    // প্রম্পট রিসেট করা
    deferredPrompt = null;
}

// ৫. সাকসেসফুল ইন্সটলেশন চেক
window.addEventListener('appinstalled', (evt) => {
    console.log('🎉 PWA was installed successfully');
    if (installButton) installButton.remove();
    showNotification('🎉 অ্যাপটি সফলভাবে হোম স্ক্রিনে যোগ হয়েছে!', 'success');
});

// ৬. সার্ভিস ওয়ার্কার (Service Worker) - অফলাইন সাপোর্ট
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        // সার্ভিস ওয়ার্কার ফাইলের পাথ ঠিক আছে কি না চেক করুন
        navigator.serviceWorker.register('./service-worker.js')
            .then(reg => console.log('🚀 Service Worker Active:', reg.scope))
            .catch(err => console.error('❌ SW Registration failed:', err));
    });
}