let deferredPrompt;

console.log("🚀 PWA Logic Initialized");

// ১. সার্ভিস ওয়ার্কার চেক
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistration().then(reg => {
        if (reg) console.log("✅ Active SW found:", reg.scope);
        else console.log("❌ No active SW found yet.");
    });
}

// ২. মেইন ইন্সটল ইভেন্ট (ক্রোম যখন পারমিশন দেয়)
window.addEventListener('beforeinstallprompt', (e) => {
    console.log('✨ Chrome triggered beforeinstallprompt event');
    // ব্রাউজারের ডিফল্ট পপআপ ব্লক করা
    e.preventDefault();
    // ইভেন্টটি সেভ করে রাখা
    deferredPrompt = e;
    
    // বাটন তৈরি এবং স্ক্রিনে দেখানো
    createInstallButton();
});

function createInstallButton() {
    if (document.getElementById('pwaInstallBtn')) return;

    console.log("🛠️ Creating Install Button...");
    const btn = document.createElement('button');
    btn.id = 'pwaInstallBtn';
    btn.innerHTML = '📱 অ্যাপ ইন্সটল করুন';
    btn.style.cssText = `
        position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%);
        background: linear-gradient(135deg, #27ae60, #2ecc71);
        color: white; border: none; padding: 15px 30px;
        border-radius: 50px; cursor: pointer; z-index: 100000;
        font-weight: bold; font-size: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.3);
        animation: slideUpPWA 0.5s ease-out;
    `;

    btn.onclick = async () => {
        if (!deferredPrompt) {
            alert("মোবাইলের ৩টি ডট মেনু থেকে 'Install App' এ ক্লিক করুন।");
            return;
        }
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`User response: ${outcome}`);
        if (outcome === 'accepted') {
            btn.remove();
            deferredPrompt = null;
        }
    };

    document.body.appendChild(btn);
}

// ৩. সিক্রেট ডিবাগার: স্ক্রিনে কয়েকবার ক্লিক করলে স্ট্যাটাস বলবে
let clickCount = 0;
window.onclick = () => {
    clickCount++;
    if (clickCount === 5) {
        alert(`PWA Status:\n- SW: ${navigator.serviceWorker.controller ? 'Active' : 'Offline'}\n- Prompt: ${deferredPrompt ? 'Ready' : 'Waiting for Chrome'}\n- Standalone: ${window.matchMedia('(display-mode: standalone)').matches}`);
        clickCount = 0;
    }
};

// CSS অ্যানিমেশন
const style = document.createElement('style');
style.innerHTML = `@keyframes slideUpPWA { from { bottom: -100px; } to { bottom: 30px; } }`;
document.head.appendChild(style);