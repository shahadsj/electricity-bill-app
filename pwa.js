let deferredPrompt;

// সার্ভিস ওয়ার্কার সচল করা
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js')
    .then(() => console.log("✅ SW Active"))
    .catch(err => console.log("❌ SW Error", err));
}

// ক্রোম থেকে সিগন্যাল ধরা
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    console.log("✅ ব্রাউজার রেডি");
    // যদি ব্রাউজার রেডি থাকে, বাটনটি সবুজ করে দাও
    const btn = document.getElementById('pwa-force-btn');
    if (btn) {
        btn.style.display = 'block';
        btn.querySelector('button').style.background = '#27ae60';
    }
});

// ৫ সেকেন্ড পর বাটনটি জোর করে স্ক্রিনে আনা (যদি ইনস্টলড না থাকে)
window.addEventListener('DOMContentLoaded', () => {
    if (!window.matchMedia('(display-mode: standalone)').matches) {
        setTimeout(() => {
            const btn = document.getElementById('pwa-force-btn');
            if (btn) btn.style.display = 'block';
        }, 5000);
    }
});

async function installPWA() {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
            document.getElementById('pwa-force-btn').style.display = 'none';
        }
        deferredPrompt = null;
    } else {
        // যদি ব্রাউজার সাপোর্ট না দেয়, তবে ম্যানুয়াল গাইড দেখাও
        alert("ইন্সটল করতে নিচের ধাপগুলো অনুসরণ করুন:\n\n১. ব্রাউজারের উপরে ডানে ৩টি ডট (⋮) ক্লিক করুন।\n২. 'Install app' বা 'Add to Home screen' এ ক্লিক করুন।");
    }
}