let deferredPrompt;

// সার্ভিস ওয়ার্কার চেক
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js');
}

// ১. ব্রাউজারের সিগন্যাল ধরা
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    console.log("✅ ব্রাউজার ইন্সটলের জন্য সিগন্যাল দিয়েছে");
});

// ২. অ্যাপ ইতিমধ্যে ইন্সটলড কি না চেক করা
const isInstalled = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;

// ৩. ৫ সেকেন্ড পর বাটন দেখানো (যদি ইন্সটল করা না থাকে)
window.addEventListener('load', () => {
    if (!isInstalled) {
        setTimeout(() => {
            const container = document.getElementById('pwa-install-container');
            if (container) container.style.display = 'block';
        }, 5000); // ৫ সেকেন্ড পর বাটনটি ভেসে উঠবে
    }
});

// ৪. বাটনে ক্লিক করলে যা হবে
document.getElementById('pwa-install-btn')?.addEventListener('click', async () => {
    if (deferredPrompt) {
        // যদি ব্রাউজার পারমিশন দিয়ে থাকে
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
            document.getElementById('pwa-install-container').remove();
        }
        deferredPrompt = null;
    } else {
        // যদি ব্রাউজার পারমিশন না দেয় (ম্যানুয়াল গাইড)
        alert("ইন্সটল করার জন্য:\n১. ব্রাউজারের উপরে ডানে ৩টি ডট (⋮) এ ক্লিক করুন।\n২. 'Install app' অথবা 'Add to Home screen' এ ক্লিক করুন।");
    }
});