let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    console.log('✅ PWA Install Prompt Ready');
    
    // বাটন তৈরি
    const installBtn = document.createElement('div');
    installBtn.innerHTML = `
        <div id="pwa-layer" style="position:fixed; bottom:0; left:0; width:100%; background:white; padding:20px; box-shadow:0 -5px 20px rgba(0,0,0,0.2); z-index:999999; border-radius:20px 20px 0 0; text-align:center; font-family:sans-serif; animation: slideUp 0.5s ease;">
            <p style="margin:0 0 15px 0; color:#2c3e50; font-weight:bold;">সহজে ব্যবহারের জন্য অ্যাপটি ইন্সটল করুন</p>
            <button id="realInstallBtn" style="background:#27ae60; color:white; border:none; padding:12px 40px; border-radius:10px; font-weight:bold; font-size:16px; width:100%; cursor:pointer;">📲 ইন্সটল করুন</button>
            <button onclick="document.getElementById('pwa-layer').remove()" style="background:none; border:none; color:#95a5a6; margin-top:10px; cursor:pointer;">পরে করবো</button>
        </div>
        <style>@keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }</style>
    `;
    document.body.appendChild(installBtn);

    document.getElementById('realInstallBtn').addEventListener('click', async () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === 'accepted') installBtn.remove();
            deferredPrompt = null;
        }
    });
});