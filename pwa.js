let deferredPrompt;

// ১. ইন্সটল প্রম্পট ইভেন্ট ধরা
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    
    // বাটনটি স্ক্রিনে দেখানো
    const installButton = document.getElementById('custom-install-button');
    if (installButton) {
        installButton.style.display = 'block';
    }

    console.log("✅ PWA ইন্সটলের জন্য প্রস্তুত!");
});

// ২. ইন্সটল বাটনে ক্লিক ইভেন্ট যোগ করা
window.addEventListener('load', () => {
    const installButton = document.getElementById('custom-install-button');
    if (installButton) {
        installButton.addEventListener('click', async () => {
            // যদি ক্রোম প্রম্পট না দিয়ে থাকে, তবে ম্যানুয়াল গাইড দেখানো
            if (!deferredPrompt) {
                alert("মোবাইলের মেনু (৩টি ডট) থেকে 'Install App' বা 'Add to Home Screen' এ ক্লিক করুন।");
                return;
            }

            // প্রম্পট দেখানো
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;

            // ইউজার ইন্সটল করলে বাটন লুকিয়ে ফেলা
            if (outcome === 'accepted') {
                installButton.style.display = 'none';
                console.log('User installed the app');
            }
            
            deferredPrompt = null;
        });
    }
});

// ৩. অ্যাপ ইন্সটল হয়ে গেলে বাটন লুকিয়ে ফেলা
window.addEventListener('appinstalled', () => {
    const installButton = document.getElementById('custom-install-button');
    if (installButton) {
        installButton.style.display = 'none';
    }
    console.log('🎉 অ্যাপ সফলভাবে ইন্সটল হয়েছে!');
});

// ৪. সার্ভিস ওয়ার্কার রেজিস্ট্রেশন (আপনার আগের কোড অনুযায়ী)
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js')
        .then(reg => console.log('✅ Service Worker Registered'))
        .catch(err => console.error('❌ SW Registration Failed:', err));
}