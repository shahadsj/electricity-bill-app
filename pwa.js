// pwa.js
let deferredPrompt = null;
let installButton = null;

window.addEventListener('beforeinstallprompt', (e) => {
    console.log('✅ PWA install prompt available');
    e.preventDefault();
    deferredPrompt = e;
    showInstallButton();
});

function showInstallButton() {
    // Remove existing button
    const existingBtn = document.querySelector('.install-btn');
    if (existingBtn) existingBtn.remove();
    
    // Create install button
    installButton = document.createElement('button');
    installButton.className = 'install-btn';
    installButton.innerHTML = '📱 অ্যাপ ইন্সটল করুন';
    installButton.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: linear-gradient(135deg, #27ae60, #2ecc71);
        color: white;
        border: none;
        padding: 12px 20px;
        border-radius: 25px;
        cursor: pointer;
        z-index: 1000;
        font-size: 14px;
        font-weight: bold;
        box-shadow: 0 4px 15px rgba(39, 174, 96, 0.3);
        transition: all 0.3s ease;
    `;
    
    installButton.onmouseover = () => {
        installButton.style.transform = 'scale(1.05)';
        installButton.style.boxShadow = '0 6px 20px rgba(39, 174, 96, 0.4)';
    };
    
    installButton.onmouseout = () => {
        installButton.style.transform = 'scale(1)';
        installButton.style.boxShadow = '0 4px 15px rgba(39, 174, 96, 0.3)';
    };
    
    installButton.onclick = installApp;
    document.body.appendChild(installButton);
}

function installApp() {
    if (!deferredPrompt) {
        alert('অ্যাপ ইন্সটল সুবিধা এখন উপলব্ধ নেই। ব্রাউজার মেনু থেকে ইন্সটল করুন।');
        return;
    }
    
    deferredPrompt.prompt();
    
    deferredPrompt.userChoice.then((choiceResult) => {
        if (choiceResult.outcome === 'accepted') {
            console.log('✅ User accepted the install prompt');
            showNotification('✅ অ্যাপ সফলভাবে ইন্সটল হয়েছে!', 'success');
        } else {
            console.log('❌ User dismissed the install prompt');
        }
        deferredPrompt = null;
        if (installButton) {
            installButton.style.display = 'none';
        }
    });
}

// Check if already installed
window.addEventListener('appinstalled', (evt) => {
    console.log('🎉 PWA installed successfully');
    if (installButton) {
        installButton.style.display = 'none';
    }
});

// Register service worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./service-worker.js')
            .then(registration => {
                console.log('✅ Service Worker registered:', registration);
            })
            .catch(error => {
                console.log('❌ Service Worker registration failed:', error);
            });
    });
}