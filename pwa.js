let deferredPrompt;

// সার্ভিস ওয়ার্কার রেজিস্ট্রেশন
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js')
    .then(reg => console.log('SW Active'))
    .catch(err => console.error('SW Error', err));
}

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    console.log('✅ ইন্সটল প্রম্পট তৈরি');
    showMyInstallUI();
});

function showMyInstallUI() {
    if (document.getElementById('pwa-modal')) return;

    const modal = document.createElement('div');
    modal.id = 'pwa-modal';
    modal.style.cssText = "position:fixed; bottom:20px; left:10px; right:10px; background:#fff; padding:20px; border-radius:15px; box-shadow:0 0 20px rgba(0,0,0,0.3); z-index:1000000; text-align:center; border:2px solid #27ae60;";
    
    modal.innerHTML = `
        <h3 style="margin:0 0 10px; color:#2c3e50;">📲 অ্যাপটি ইন্সটল করুন</h3>
        <p style="font-size:14px; color:#666; margin-bottom:15px;">সহজে ব্যবহার করতে আপনার স্ক্রিনে শর্টকাট যোগ করুন।</p>
        <button id="pwa-ok" style="background:#27ae60; color:#fff; border:none; padding:10px 30px; border-radius:10px; font-weight:bold; width:100%; font-size:16px;">এখনই ইন্সটল করুন</button>
        <button onclick="document.getElementById('pwa-modal').remove()" style="background:none; border:none; color:#999; margin-top:10px; font-size:12px;">পরে করবো</button>
    `;
    document.body.appendChild(modal);

    document.getElementById('pwa-ok').addEventListener('click', async () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === 'accepted') modal.remove();
            deferredPrompt = null;
        } else {
            alert("আপনার ব্রাউজারের ৩টি ডট মেনু থেকে 'Install App' এ ক্লিক করুন।");
        }
    });
}

// পপ-আপ না আসলে স্ক্রিনের যেকোনো জায়গায় ক্লিক করলে এটি চেক করবে
window.addEventListener('click', () => {
    if (deferredPrompt) {
        showMyInstallUI(); // বাটন দেখানোর ফাংশন
    }
});