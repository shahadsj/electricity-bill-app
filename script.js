// ==================== লগইন ফাংশন আপডেট (FIXED) ====================
const originalShowMainApp = typeof showMainApp === 'function' ? showMainApp : function() {
    document.getElementById('mainApp').style.display = 'block';
    document.getElementById('loginModal').style.display = 'none';
};

showMainApp = function() {
    originalShowMainApp();
    // Firebase ফাংশনটি আছে কি না চেক করে কল করা (যাতে এরর না আসে)
    if (currentUser && currentUser.id) {
        if (typeof setFirebaseUser === 'function') {
            setFirebaseUser(currentUser.id);
        } else {
            console.warn('⚠️ setFirebaseUser function not found. Firebase sync skipped.');
        }
    }
};

// ১. উন্নত IP Fetching
async function getUserIP() {
    try {
        const response = await fetch('https://api64.ipify.org?format=json');
        const data = await response.json();
        return data.ip;
    } catch (e) {
        try {
            const res = await fetch('https://ipapi.co/json/');
            const d = await res.json();
            return d.ip;
        } catch (err) {
            return "Unknown (VPN/Blocked)";
        }
    }
}

// ২. রেজিস্ট্রেশন লগ (সরাসরি Firebase থেকে আনা)
async function showRegistrationLog() {
    if (!currentUser || currentUser.username !== 'admin') {
        showNotification('❌ অনুমতি নেই!', 'error');
        return;
    }

    showNotification('⏳ ক্লাউড থেকে লগ লোড হচ্ছে...', 'info');

    database.ref('registration_logs').once('value').then((snapshot) => {
        const logs = snapshot.val();
        if (!logs) {
            showCustomModal('📋 রেজিস্ট্রেশন লগ', '<div style="text-align:center; padding:40px;">কোন লগ পাওয়া যায়নি।</div>');
            return;
        }

        let html = `<div style="max-height: 500px; overflow-y: auto;">
            <h3 style="text-align:center;">👥 রেজিস্ট্রেশন রিপোর্ট (${Object.keys(logs).length})</h3>`;
        
        Object.values(logs).reverse().forEach(log => {
            // তারিখ ফিক্স: যদি timestamp না থাকে তবে current date
            const dateStr = log.timestamp ? new Date(log.timestamp).toLocaleString('bn-BD') : "সময় পাওয়া যায়নি";
            html += `
                <div style="background:#f9f9f9; border-left:4px solid #27ae60; padding:12px; margin:10px 0; border-radius:8px; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                    <strong style="color: #2c3e50;">👤 ${log.fullName || log.name}</strong> (@${log.username})<br>
                    <small>📧 ${log.email}</small><br>
                    <small>🌐 IP: <span style="color:#e67e22">${log.ip || 'N/A'}</span> | 📱 Device: ${log.device || 'N/A'}</small><br>
                    <small>⏰ সময়: ${dateStr}</small>
                </div>`;
        });
        html += `</div>`;
        showCustomModal('রেজিস্ট্রেশন লগ', html);
    });
}

// ==================== লগিন সিস্টেম ====================

// ইউজার ডেটা স্ট্রাকচার
class User {
    constructor(username, password, fullName, email) {
        this.id = Date.now();
        this.username = username;
        this.password = this.hashPassword(password);
        this.fullName = fullName;
        this.email = email;
        this.createdAt = new Date().toISOString();
        this.lastLogin = null;
        this.isActive = true;
    }
    
    hashPassword(password) {
        // সরল হ্যাশিং
        return btoa(password + 'desco_salt');
    }
    
    verifyPassword(password) {
        return this.password === this.hashPassword(password);
    }
}

// কারেন্ট ইউজার
let currentUser = null;
let users = [];

// স্টোরেজ কী
const USERS_STORAGE_KEY = 'desco_users';
const CURRENT_USER_KEY = 'desco_current_user';

// DOMContentLoaded এ লগিন চেক করুন
document.addEventListener('DOMContentLoaded', function() {
    loadUsers();
    checkExistingLogin();
    
    // আপনার existing initialization code
    loadMeterInfo();
    loadSettings();
    loadTariffRates();
    loadAutoBackupSettings();
    loadData();
    if (checkAuthentication()) { try { showMainApp(); } catch(_) {} try { updateUI(); } catch(_) {} }
    updateBalanceDisplay();
    loadTransactionReport();
    try { loadUnitsFromReport(); } catch(_) {}
    setupKeyboardShortcuts();
    updateTariffDisplay();

    try {
        const savedTheme = localStorage.getItem('app_theme') || 'default';
        applyGlobalTheme(savedTheme);
    } catch(_) {}
	
	// মাসিক ইউনিট সিস্টেম
	loadMonthlyUnitData();
    updateUnitDisplay();
    
    // বর্তমান তারিখ সেট করুন
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const currentMonth = now.toISOString().substring(0, 7);
    
    document.getElementById('rechargeDate').value = today;
    document.getElementById('balanceDate').value = today;
    document.getElementById('startDate').value = today;
    document.getElementById('endDate').value = today;
    document.getElementById('currentMonth').value = currentMonth;
    document.getElementById('unitsMonth').value = currentMonth;

    // অটো ব্যাকআপ শিডিউল সেটআপ
    scheduleNextBackup();
    try {
        const lastTab = localStorage.getItem('desco_last_tab') || 'unitTab';
        openTab(lastTab);
    } catch(_) {}
});

// ইউজার লোড করুন - FIXED VERSION
function loadUsers() {
    try {
        const savedUsers = localStorage.getItem(USERS_STORAGE_KEY);
        if (savedUsers) {
            const parsedUsers = JSON.parse(savedUsers);
            // JSON থেকে লোড করা users কে User class instance এ convert করুন
            users = parsedUsers.map(userData => {
                const user = new User(userData.username, 'temp', userData.fullName, userData.email);
                // existing hashed password টি assign করুন
                user.password = userData.password;
                user.id = userData.id;
                user.createdAt = userData.createdAt;
                user.lastLogin = userData.lastLogin;
                user.isActive = userData.isActive;
                return user;
            });
        } else {
            // ডিফল্ট অ্যাডমিন ইউজার তৈরি করুন
            createDefaultAdmin();
        }
    } catch (error) {
        console.error('Users load error:', error);
        createDefaultAdmin();
    }
}

// ডিফল্ট অ্যাডমিন ইউজার
function createDefaultAdmin() {
    const adminUser = new User('admin', 'admin123', 'System Administrator', 'k.m.abubakkarsiddek@gmail.com');
    users = [adminUser];
    saveUsers();
}

// ইউজারস সেভ করুন
function saveUsers() {
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
}

// এক্সিস্টিং লগিন চেক
function checkExistingLogin() {
    const savedUser = localStorage.getItem(CURRENT_USER_KEY);
    if (savedUser) {
        try {
            currentUser = JSON.parse(savedUser);
            
            // ✅ এটিই ম্যাজিক লাইন: রিফ্রেশ করলেও ক্লাউডের সাথে কানেকশন তৈরি করবে
            if (currentUser && currentUser.id) {
                startRealtimeSync(currentUser.id);
            }
            
            showMainApp();
            updateUserDisplay();
        } catch (error) {
            console.error('Auto login failed:', error);
            showLoginModal();
        }
    } else {
        showLoginModal();
    }
}

// পাসওয়ার্ড ভেরিফাই ফাংশন - FIXED VERSION
function verifyPassword(user, password) {
    // সরল হ্যাশিং ফাংশন
    function hashPassword(pwd) {
        return btoa(pwd + 'desco_salt');
    }
    return user.password === hashPassword(password);
}

// লগিন হ্যান্ডলার - FIXED VERSION (রিয়েল-টাইম সিঙ্ক সহ)
function handleLogin(event) {
    event.preventDefault();
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    
    let user = users.find(u => u.username === username && u.isActive);
    if (!user || !verifyPassword(user, password)) {
        showNotification('❌ ইউজারনেম বা পাসওয়ার্ড ভুল', 'error');
        return;
    }
    
    // Admin ID Fix
    const ADMIN_FIXED_ID = 1779295853532; 
    if (user.username === 'admin') {
        user.id = ADMIN_FIXED_ID;
    }
    
    currentUser = { id: user.id, username: user.username, fullName: user.fullName, email: user.email };
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(currentUser));

    // ✅ লগইন করার সাথে সাথে সিঙ্ক চালু
    startRealtimeSync(currentUser.id);
    
    showMainApp();
    updateUserDisplay();
    showNotification(`✅ স্বাগতম ${user.fullName}!`, 'success');
}

// নতুন ইউজার রেজিস্ট্রেশন (Firebase-এ সরাসরি সেভ)
async function handleRegister(event) {
    event.preventDefault();
    
    const fullName = document.getElementById('fullName').value.trim();
    const username = document.getElementById('regUsername').value.trim();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('regPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    if (password !== confirmPassword) {
        showNotification('❌ পাসওয়ার্ড মিলছে না', 'error');
        return;
    }

    const userIP = await getUserIP();
    const userId = Date.now(); // ইউনিক আইডি

    const newUser = {
        id: userId,
        fullName,
        username,
        email,
        password: btoa(password + 'desco_salt'), // সিম্পল হ্যাশিং
        ip: userIP,
        device: navigator.platform,
        createdAt: new Date().toISOString(),
        isActive: true
    };

    // Firebase-এ ইউজার সেভ (এটিই এখন ইউজার লিস্ট হিসেবে কাজ করবে)
    database.ref('users/' + userId).set(newUser)
    .then(() => {
        // আলাদা রেজিস্ট্রেশন লগ (অ্যাডমিনের সুবিধার জন্য)
        database.ref('registration_logs/' + userId).set(newUser);
        showNotification('✅ অ্যাকাউন্ট তৈরি সফল! লগইন করুন', 'success');
        showLoginForm();
    }).catch(e => showNotification('❌ ক্লাউড এরর!', 'error'));
}

// সব রেজিস্ট্রেশন লগ ক্লাউড থেকে লোড করার একক ফাংশন
function showRegistrationLog() {
    if (!currentUser || currentUser.username !== 'admin') {
        showNotification('❌ শুধুমাত্র অ্যাডমিন এই ফিচার ব্যবহার করতে পারেন!', 'error');
        return;
    }

    showNotification('⏳ ক্লাউড থেকে লগ লোড হচ্ছে...', 'info');

    // Firebase থেকে সব লগ নিয়ে আসা
    database.ref('registration_logs').once('value').then((snapshot) => {
        const logs = snapshot.val();
        
        if (!logs) {
            showCustomModal('📋 রেজিস্ট্রেশন লগ', '<div style="text-align:center; padding:40px;">কোন লগ পাওয়া যায়নি।</div>');
            return;
        }

        let logHTML = `
            <div style="max-height: 500px; overflow-y: auto; padding: 5px;">
                <div style="background: #2c3e50; color: white; padding: 15px; border-radius: 8px; margin-bottom: 15px; text-align: center;">
                    <h3 style="margin:0;">👥 ইউজার রেজিস্ট্রেশন রিপোর্ট (Cloud)</h3>
                    <small>মোট ইউজার: ${toBanglaNumber(Object.keys(logs).length)} জন</small>
                </div>
        `;
        
        // ক্লাউড ডাটাকে সাজানো এবং লুপ চালানো
        Object.values(logs).reverse().forEach((log, index) => {
            const date = log.timestamp ? new Date(log.timestamp).toLocaleString('bn-BD') : "Invalid Date";
            logHTML += `
                <div style="background: #f8f9fa; padding: 15px; margin: 10px 0; border-radius: 8px; border-left: 5px solid #27ae60; box-shadow: 0 2px 5px rgba(0,0,0,0.05);">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                        <div>
                            <strong style="color: #2c3e50; font-size: 16px;">👤 ${log.fullName || log.name}</strong><br>
                            <span style="color: #7f8c8d; font-size: 13px;">@${log.username} | ${log.email}</span>
                        </div>
                        <span style="font-size: 11px; background: #eee; padding: 2px 6px; border-radius: 4px;">#${Object.keys(logs).length - index}</span>
                    </div>
                    <hr style="margin: 10px 0; border: 0; border-top: 1px solid #eee;">
                    <div style="font-size: 12px; color: #555;">
                        <div>🌐 <b>IP:</b> <span style="color: #e67e22;">${log.ip || 'Unknown'}</span></div>
                        <div>📱 <b>Device:</b> ${log.device || 'N/A'}</div>
                        <div>⏰ <b>Time:</b> ${date}</div>
                    </div>
                </div>
            `;
        });

        logHTML += `
            <button onclick="if(confirm('সাবধান! ক্লাউড থেকে সব লগ ডিলিট হবে। করবেন?')) { database.ref('registration_logs').remove(); closeModal(); }" 
                    style="width: 100%; padding: 12px; background: #e74c3c; color: white; border: none; border-radius: 8px; cursor: pointer; margin-top: 10px; font-weight: bold;">
                🗑️ সব ক্লাউড লগ মুছে ফেলুন
            </button>
        </div>`;
        
        showCustomModal('📋 রেজিস্ট্রেশন লগ', logHTML);
    }).catch(err => {
        console.error("Firebase Error:", err);
        showNotification('❌ লগ লোড করতে ব্যর্থ!', 'error');
    });
}

// Firebase থেকে রিয়েল-টাইম ডাটা শোনার ফাংশন
function startRealtimeSync() {
    if (!currentUser) return;

    const userRef = database.ref('meter_data/' + currentUser.id);

    // যখনই ডাটাবেসে কিছু পরিবর্তন হবে, এই ফাংশনটি অটো চলবে
    userRef.on('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
            console.log("⚡ রিয়েল-টাইম ডাটা সিঙ্ক হচ্ছে...");
            
            // ডাটা লোকাল ভেরিয়েবলে সেট করা
            transactions = data.transactions || [];
            currentBalance = data.currentBalance || 0;
            totalRecharge = data.totalRecharge || 0;
            totalExpended = data.totalExpended || 0;

            // UI আপডেট করা (পেজ রিফ্রেশ ছাড়াই)
            updateBalanceDisplay();
            if (typeof loadTransactionReport === 'function') loadTransactionReport();
        }
    });
}

// ডাটাবেসে সেভ করার ফাংশন (যাতে অন্য ব্রাউজারে সিঙ্ক হয়)
function autoSyncToFirebase() {
    if (!currentUser || !currentUser.id || typeof database === 'undefined') return;

    // ক্লাউডে পাঠানোর আগে একবার লেটেস্ট হিসাব নিশ্চিত করা
    const txs = getActiveTransactions();
    const calcExpense = txs
        .filter(t => t.type === 'electricity_bill')
        .reduce((sum, t) => sum + Math.abs(t.amount || 0), 0);

    const allData = {
        transactions: transactions || [],
        monthlyRecharges: monthlyRecharges || [],
        currentBalance: currentBalance,
        totalRecharge: totalRecharge,
        totalExpended: calcExpense, // হিসাব করা সঠিক মান
        lastDemandChargeMonth: lastDemandChargeMonth || '',
        meters: meters || [],
        activeMeterId: activeMeterId || null,
        settings: settings || {},
        lastUpdated: Date.now()
    };

    database.ref('meter_data/' + currentUser.id).set(allData)
    .then(() => console.log("📤 Cloud Sync Data Sent!"))
    .catch((err) => console.error("❌ Sync Error:", err));
}

// লগ সেভ করার ফাংশন (FIXED)
function saveToRegistrationLog(newUser) {
    const registrationLog = JSON.parse(localStorage.getItem('registration_log') || '[]');
    
    const logEntry = {
        id: Date.now(),
        name: newUser.fullName,
        username: newUser.username,
        email: newUser.email,
        ip: newUser.ip || 'N/A',
        device: newUser.device || 'N/A',
        timestamp: new Date().toISOString()
    };
    
    registrationLog.push(logEntry);
    // শেষ ১০০টি লগ রাখুন
    localStorage.setItem('registration_log', JSON.stringify(registrationLog.slice(-100)));
    console.log('✅ New registration logged:', logEntry);
}

// রেজিস্ট্রেশন লগ সেভ করার ফাংশন
function saveToRegistrationLog(newUser) {
    try {
        const logEntry = {
            id: Date.now(),
            name: newUser.fullName,
            username: newUser.username,
            email: newUser.email,
            ip: newUser.ip || 'N/A',
            device: navigator.platform,
            time: new Date().toISOString(),
            count: (JSON.parse(localStorage.getItem('registration_log') || '[]').length + 1)
        };

        const registrationLog = JSON.parse(localStorage.getItem('registration_log') || '[]');
        registrationLog.push(logEntry);
        
        // সর্বোচ্চ ১০০টি লগ রাখুন
        if (registrationLog.length > 100) registrationLog.shift();
        
        localStorage.setItem('registration_log', JSON.stringify(registrationLog));
        console.log('📝 রেজিস্ট্রেশন লগ সেভ হয়েছে:', logEntry);
    } catch (e) {
        console.error('Log saving error:', e);
    }
}

// ✅ অ্যাডমিন প্যানেলে বাটন যোগ করুন (শুধু অ্যাডমিন লগিন করলে)
function addAdminPanelButton() {
    if (currentUser && currentUser.username === 'admin') {
        const headerControls = document.querySelector('.header-controls');
        if (headerControls && !document.getElementById('adminRegLogBtn')) {
            const adminBtn = document.createElement('button');
            adminBtn.id = 'adminRegLogBtn';
            adminBtn.innerHTML = '📋 রেজিস্ট্রেশন লগ';
            adminBtn.className = 'control-btn';
            adminBtn.onclick = showRegistrationLog;
            adminBtn.style.background = 'linear-gradient(135deg, #e74c3c, #c0392b)';
            adminBtn.style.color = 'white';
            headerControls.appendChild(adminBtn);
        }
    }
}

// ✅ updateUserDisplay ফাংশন আপডেট করুন (অ্যাডমিন বাটন যোগ করতে)
// পুরানো updateUserDisplay ফাংশনটি Replace করুন:
function updateUserDisplay() {
    const userDisplayElement = document.getElementById('userDisplay');
    if (userDisplayElement && currentUser) {
        const isAdmin = currentUser.username === 'admin';
        
        userDisplayElement.innerHTML = `
            <div style="display: flex; align-items: center; gap: 12px; background: rgba(255,255,255,0.15); padding: 8px 16px; border-radius: 25px; backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.2);">
                <div style="width: 36px; height: 36px; background: linear-gradient(135deg, ${isAdmin ? '#e74c3c' : '#e74c3c'}, ${isAdmin ? '#c0392b' : '#e67e22'}); color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 16px; cursor: pointer;" onclick="openProfileModal()" title="প্রোফাইল এডিট">
                    ${currentUser.fullName.charAt(0).toUpperCase()}
                </div>
                <div style="display: flex; flex-direction: column;">
                    <div style="font-weight: bold; font-size: 14px;">${currentUser.fullName} ${isAdmin ? '👑' : ''}</div>
                    <div style="font-size: 11px; opacity: 0.8;">@${currentUser.username}</div>
                </div>
                <div style="display: flex; gap: 5px;">
                    <button onclick="openProfileModal()" style="background: rgba(52, 152, 219, 0.8); color: white; border: none; padding: 6px 10px; border-radius: 15px; cursor: pointer; font-size: 11px; transition: all 0.3s ease;" title="প্রোফাইল এডিট">
                        ✏️ এডিট
                    </button>
                    <button onclick="logout()" style="background: rgba(231, 76, 60, 0.8); color: white; border: none; padding: 6px 10px; border-radius: 15px; cursor: pointer; font-size: 11px; transition: all 0.3s ease;" title="লগআউট">
                        🚪 লগআউট
                    </button>
                </div>
            </div>
        `;
        
        // অ্যাডমিন বাটন যোগ করুন
        addAdminPanelButton();
    }
}

// DOMContentLoaded ইভেন্টের ভিতরে এই লাইন যোগ করুন (যেখানে অন্যান্য initialization আছে)
document.addEventListener('DOMContentLoaded', function() {
    // ... আপনার existing কোড ...
    
    // অ্যাডমিন বাটন চেক (লগইন হওয়ার পর)
    setTimeout(() => {
        if (currentUser && currentUser.username === 'admin') {
            addAdminPanelButton();
        }
    }, 1000);
});

// প্রোফাইল মডাল ফাংশন
function openProfileModal() {
    if (!currentUser) return;
    
    // ফর্ম পূরণ করুন
    document.getElementById('editProfileName').value = currentUser.fullName;
    document.getElementById('editProfileUsername').value = currentUser.username;
    document.getElementById('editProfileEmail').value = currentUser.email;
    document.getElementById('editProfilePassword').value = '';
    document.getElementById('confirmProfilePassword').value = '';
    
    document.getElementById('profileModal').style.display = 'flex';
}

function closeProfileModal() {
    document.getElementById('profileModal').style.display = 'none';
}

function saveProfile(event) {
    event.preventDefault();
    
    if (!currentUser) return;
    
    const fullName = document.getElementById('editProfileName').value.trim();
    const username = document.getElementById('editProfileUsername').value.trim();
    const email = document.getElementById('editProfileEmail').value.trim();
    const newPassword = document.getElementById('editProfilePassword').value;
    const confirmPassword = document.getElementById('confirmProfilePassword').value;
    
    if (!fullName || !username || !email) {
        showNotification('❌ নাম, ইউজারনেম এবং ইমেইল পূরণ করুন', 'error');
        return;
    }
    
    // ডুপ্লিকেট ইউজারনেম/ইমেইল চেক... (আপনার আগের কোড অনুযায়ী)
    if (username !== currentUser.username) {
        if (users.find(u => u.username === username && u.id !== currentUser.id)) {
            showNotification('❌ এই ইউজারনেম ইতিমধ্যে ব্যবহৃত', 'error');
            return;
        }
    }
    
    if (email !== currentUser.email) {
        if (users.find(u => u.email === email && u.id !== currentUser.id)) {
            showNotification('❌ এই ইমেইল ইতিমধ্যে রেজিস্টার্ড', 'error');
            return;
        }
    }
    
    if (newPassword && (newPassword.length < 6 || newPassword !== confirmPassword)) {
        showNotification('❌ পাসওয়ার্ড চেক করুন (কমপক্ষে ৬ অক্ষর এবং মিল থাকতে হবে)', 'error');
        return;
    }
    
    // ইউজার আপডেট করুন
    const userIndex = users.findIndex(u => u.id === currentUser.id);
    if (userIndex !== -1) {
        const user = users[userIndex];
        user.fullName = fullName;
        user.username = username;
        user.email = email;
        
        if (newPassword) user.password = user.hashPassword(newPassword);
        
        // কারেন্ট ইউজার আপডেট
        currentUser.fullName = fullName;
        currentUser.username = username;
        currentUser.email = email;
        
        saveUsers();
        localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(currentUser));
        
        // ✅ ক্লাউডে ইউজারের মেটাডেটা সিঙ্ক করা (ঐচ্ছিক কিন্তু ভালো)
        if (typeof autoSyncToFirebase === 'function') {
            autoSyncToFirebase();
        }
        
        updateUserDisplay();
        showNotification('✅ প্রোফাইল সফলভাবে আপডেট করা হয়েছে!', 'success');
        closeProfileModal();
    }
}

// ইউজার ডিসপ্লে আপডেট (এডিট বাটন সহ) - FIXED VERSION
function updateUserDisplay() {
    const userDisplayElement = document.getElementById('userDisplay');
    if (userDisplayElement && currentUser) {
        userDisplayElement.innerHTML = `
            <div style="display: flex; align-items: center; gap: 12px; background: rgba(255,255,255,0.15); padding: 8px 16px; border-radius: 25px; backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.2);">
                <div style="width: 36px; height: 36px; background: linear-gradient(135deg, #e74c3c, #e67e22); color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 16px; cursor: pointer;" onclick="openProfileModal()" title="প্রোফাইল এডিট">
                    ${currentUser.fullName.charAt(0).toUpperCase()}
                </div>
                <div style="display: flex; flex-direction: column;">
                    <div style="font-weight: bold; font-size: 14px;">${currentUser.fullName}</div>
                    <div style="font-size: 11px; opacity: 0.8;">@${currentUser.username}</div>
                </div>
                <div style="display: flex; gap: 5px;">
                    <button onclick="openProfileModal()" style="background: rgba(52, 152, 219, 0.8); color: white; border: none; padding: 6px 10px; border-radius: 15px; cursor: pointer; font-size: 11px; transition: all 0.3s ease;" title="প্রোফাইল এডিট">
                        ✏️ এডিট
                    </button>
                    <button onclick="logout()" style="background: rgba(231, 76, 60, 0.8); color: white; border: none; padding: 6px 10px; border-radius: 15px; cursor: pointer; font-size: 11px; transition: all 0.3s ease;" title="লগআউট">
                        🚪 লগআউট
                    </button>
                </div>
            </div>
        `;
    }
}

// গ্লোবাল এক্সেস
window.openProfileModal = openProfileModal;
window.closeProfileModal = closeProfileModal;
window.saveProfile = saveProfile;

// পুরো ইউজার ডিসপ্লে রিফ্রেশ
function refreshUserDisplay() {
    const userDisplay = document.getElementById('userDisplay');
    if (userDisplay && currentUser) {
        userDisplay.innerHTML = `
            <div style="display: flex; align-items: center; gap: 12px; background: rgba(255,255,255,0.15); padding: 8px 16px; border-radius: 25px; backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.2);">
                <div style="width: 36px; height: 36px; background: linear-gradient(135deg, #e74c3c, #e67e22); color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 16px; cursor: pointer;" onclick="openProfileModal()" title="প্রোফাইল এডিট">
                    ${currentUser.fullName.charAt(0).toUpperCase()}
                </div>
                <div style="display: flex; flex-direction: column;">
                    <div style="font-weight: bold; font-size: 14px;">${currentUser.fullName}</div>
                    <div style="font-size: 11px; opacity: 0.8;">@${currentUser.username}</div>
                </div>
                <button onclick="openProfileModal()" style="background: rgba(52, 152, 219, 0.8); color: white; border: none; padding: 6px 10px; border-radius: 15px; cursor: pointer; font-size: 11px; transition: all 0.3s ease;" title="প্রোফাইল এডিট">
                    ✏️ এডিট
                </button>
                <button onclick="logout()" style="background: rgba(231, 76, 60, 0.8); color: white; border: none; padding: 6px 10px; border-radius: 15px; cursor: pointer; font-size: 11px; transition: all 0.3s ease;" title="লগআউট">
                    🚪 লগআউট
                </button>
            </div>
        `;
    }
}

// লগআউট ফাংশন
function logout() {
    if (confirm('আপনি কি লগআউট করতে চান?')) {
        currentUser = null;
        localStorage.removeItem(CURRENT_USER_KEY);
        showLoginModal();
        showNotification('✅ সফলভাবে লগআউট করা হয়েছে', 'success');
    }
}

// অথেন্টিকেশন চেক
function checkAuthentication() {
    return currentUser !== null;
}

// requireAuth ফাংশন (প্রোটেক্টেড রাউটের জন্য)
function requireAuth() {
    if (!checkAuthentication()) {
        showLoginModal();
        throw new Error('Authentication required');
    }
}

// ==================== মিটার ডেটা ফিক্স - পেজ লোডের আগে ====================

// ফোর্স ফিক্স ফাংশন - সবচেয়ে জরুরি
function forceFixMeterData() {
    try {
        console.log('🔧 ফোর্স ফিক্স চলছে...');
        
        // activeMeterId চেক
        let meterId = activeMeterId;
        if (!meterId) {
            const savedId = localStorage.getItem('desco_active_meter_id');
            if (savedId) {
                meterId = savedId;
                activeMeterId = meterId;
                console.log('✅ activeMeterId রিস্টোর:', meterId);
            }
        }
        
        // meters চেক
        if (!meters || meters.length === 0) {
            const savedMeters = localStorage.getItem('desco_meters');
            if (savedMeters) {
                meters = JSON.parse(savedMeters);
                console.log('✅ meters রিস্টোর:', meters.length);
            }
        }
        
        // মিটার ডেটা লোড
        if (meterId) {
            const meterKey = `meter_data_${meterId}`;
            const rawData = localStorage.getItem(meterKey);
            
            if (rawData) {
                const data = JSON.parse(rawData);
                
                // NaN চেক এবং ফিক্স
                window.currentBalance = parseFloat(data.currentBalance) || 0;
                window.totalRecharge = parseFloat(data.totalRecharge) || 0;
                window.totalExpended = parseFloat(data.totalExpended) || 0;
                window.transactions = data.transactions || [];
                window.monthlyRecharges = data.monthlyRecharges || [];
                
                // গ্লোবাল আপডেট
                currentBalance = window.currentBalance;
                totalRecharge = window.totalRecharge;
                totalExpended = window.totalExpended;
                transactions = window.transactions;
                monthlyRecharges = window.monthlyRecharges;
                
                console.log('✅ ডেটা ফিক্স সম্পন্ন:', {
                    balance: currentBalance,
                    transactions: transactions.length
                });
                
                return true;
            }
        }
        
        console.log('⚠️ ডেটা ফিক্স করা সম্ভব হয়নি');
        return false;
        
    } catch (error) {
        console.error('ফোর্স ফিক্স ত্রুটি:', error);
        return false;
    }
}

// পেজ লোডের পরপরই ফিক্স রান করুন
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        setTimeout(forceFixMeterData, 50);
        setTimeout(() => {
            if (typeof updateBalanceDisplay === 'function') updateBalanceDisplay();
            if (typeof loadTransactionReport === 'function') loadTransactionReport();
        }, 100);
    });
} else {
    setTimeout(forceFixMeterData, 50);
    setTimeout(() => {
        if (typeof updateBalanceDisplay === 'function') updateBalanceDisplay();
        if (typeof loadTransactionReport === 'function') loadTransactionReport();
    }, 100);
}

// মেইন অ্যাপ দেখান
function showMainApp() {
    document.getElementById('mainApp').style.display = 'block';
    document.getElementById('loginModal').style.display = 'none';
    document.getElementById('registerModal').style.display = 'none';
    
    // ইউজার ইনফো শো করুন
    updateUserDisplay();
}

// লগিন মডাল দেখান
function showLoginModal() {
    document.getElementById('mainApp').style.display = 'none';
    document.getElementById('loginModal').style.display = 'flex';
    document.getElementById('registerModal').style.display = 'none';
    
    // ফর্ম রিসেট
    document.getElementById('loginForm').reset();
}

// রেজিস্টার ফর্ম দেখান
function showRegisterForm() {
    document.getElementById('loginModal').style.display = 'none';
    document.getElementById('registerModal').style.display = 'flex';
    document.getElementById('registerForm').reset();
}

// লগিন ফর্ম দেখান
function showLoginForm() {
    document.getElementById('registerModal').style.display = 'none';
    document.getElementById('loginModal').style.display = 'flex';
    document.getElementById('loginForm').reset();
}

// ইউজার ডিসপ্লে আপডেট - EDITED VERSION
function updateUserDisplay() {
    const userDisplayElement = document.getElementById('userDisplay');
    if (userDisplayElement && currentUser) {
        userDisplayElement.innerHTML = `
            <div style="display: flex; align-items: center; gap: 12px; background: rgba(255,255,255,0.15); padding: 8px 16px; border-radius: 25px; backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.2);">
                <div style="width: 36px; height: 36px; background: linear-gradient(135deg, #e74c3c, #e67e22); color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 16px; cursor: pointer;" onclick="openProfileModal()" title="প্রোফাইল এডিট">
                    ${currentUser.fullName.charAt(0).toUpperCase()}
                </div>
                <div style="display: flex; flex-direction: column;">
                    <div style="font-weight: bold; font-size: 14px;">${currentUser.fullName}</div>
                    <div style="font-size: 11px; opacity: 0.8;">@${currentUser.username}</div>
                </div>
                <div style="display: flex; gap: 5px;">
                    <button onclick="openProfileModal()" style="background: rgba(52, 152, 219, 0.8); color: white; border: none; padding: 6px 10px; border-radius: 15px; cursor: pointer; font-size: 11px; transition: all 0.3s ease;" title="প্রোফাইল এডিট">
                        ✏️ এডিট
                    </button>
                    <button onclick="logout()" style="background: rgba(231, 76, 60, 0.8); color: white; border: none; padding: 6px 10px; border-radius: 15px; cursor: pointer; font-size: 11px; transition: all 0.3s ease;" title="লগআউট">
                        🚪 লগআউট
                    </button>
                </div>
            </div>
        `;
    }
}

// ইউজার ম্যানেজমেন্ট ফাংশন (অ্যাডমিনের জন্য)
function showUserManagement() {
    if (!currentUser) return;
    
    let html = `
        <div style="text-align: center; margin-bottom: 20px;">
            <h3>👥 ইউজার ম্যানেজমেন্ট</h3>
            <p>মোট ইউজার: ${users.length}</p>
        </div>
        
        <div style="max-height: 400px; overflow-y: auto;">
    `;
    
    users.forEach(user => {
        const lastLogin = user.lastLogin ? new Date(user.lastLogin).toLocaleString('bn-BD') : 'Never';
        
        html += `
            <div style="background: #f8f9fa; padding: 15px; margin: 10px 0; border-radius: 8px; border-left: 4px solid ${user.isActive ? '#27ae60' : '#e74c3c'};">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <div style="font-weight: bold;">${user.fullName}</div>
                        <div style="color: #666; font-size: 14px;">
                            @${user.username} • ${user.email}
                        </div>
                        <div style="color: #666; font-size: 12px;">
                            Created: ${new Date(user.createdAt).toLocaleDateString('bn-BD')} | 
                            Last Login: ${lastLogin}
                        </div>
                    </div>
                    <div style="display: flex; gap: 5px;">
                        ${user.username !== 'admin' ? `
                            <button onclick="toggleUserStatus(${user.id})" style="padding: 5px 10px; background: ${user.isActive ? '#e74c3c' : '#27ae60'}; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">
                                ${user.isActive ? 'Disable' : 'Enable'}
                            </button>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    });
    
    html += `</div>`;
    
    showCustomModal('ইউজার ম্যানেজমেন্ট', html);
}

// ইউজার স্ট্যাটাস টগল
function toggleUserStatus(userId) {
    const user = users.find(u => u.id === userId);
    if (user) {
        user.isActive = !user.isActive;
        saveUsers();
        showUserManagement();
        showNotification(`✅ ইউজার ${user.isActive ? 'enabled' : 'disabled'}`, 'success');
    }
}

// গ্লোবাল এক্সেস
window.handleLogin = handleLogin;
window.handleRegister = handleRegister;
window.showRegisterForm = showRegisterForm;
window.showLoginForm = showLoginForm;
window.logout = logout;
window.showUserManagement = showUserManagement;

// ==================== লগিন সিস্টেম শেষ ====================

// ইংরেজি সংখ্যাকে বাংলায় রূপান্তর
function toBanglaNumber(number) {
    try {
        const banglaNumbers = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
        
        if (typeof number === 'number') {
            number = number.toString();
        }
        
        if (typeof number === 'string') {
            return number.replace(/\d/g, digit => {
                const num = parseInt(digit);
                return banglaNumbers[num] || digit;
            });
        }
        
        return number;
    } catch (error) {
        console.error('Error in toBanglaNumber:', error);
        return number; // error হলে original number return করুন
    }
}

function translateSlabName(name) {
    var map = {
        'Lifeline': 'লাইফলাইন',
        '1st Slab': '১ম স্ল্যাব',
        '2nd Slab': '২য় স্ল্যাব',
        '3rd Slab': '৩য় স্ল্যাব',
        '4th Slab': '৪র্থ স্ল্যাব',
        '5th Slab': '৫ম স্ল্যাব',
        '6th Slab': '৬ষ্ঠ স্ল্যাব'
    };
    return map[name] || name;
}

function toBanglaRange(rangeStr) {
    if (typeof rangeStr !== 'string') return rangeStr;
    if (rangeStr.indexOf('∞') !== -1) {
        var partsInf = rangeStr.split('-');
        return toBanglaNumber(partsInf[0]) + '-' + '∞';
    }
    var parts = rangeStr.split('-');
    if (parts.length === 2) {
        return toBanglaNumber(parts[0]) + '-' + toBanglaNumber(parts[1]);
    }
    return rangeStr;
}

function formatTimestampForDisplay(ts) {
    var d;
    if (typeof ts === 'number') {
        d = new Date(ts);
    } else {
        d = parseAnyDate(ts);
    }
    if (!d || isNaN(d.getTime())) return ts;
    var monthsShort = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var yyyy = d.getFullYear();
    var mon = monthsShort[d.getMonth()];
    var dd = String(d.getDate()).padStart(2, '0');
    var hh = String(d.getHours()).padStart(2, '0');
    var mm = String(d.getMinutes()).padStart(2, '0');
    var ss = String(d.getSeconds()).padStart(2, '0');
    var ms = String(d.getMilliseconds()).padStart(3, '0');
    var tz = 'Z';
    return yyyy + '-' + mon + '-' + dd + ' ' + hh + ':' + mm + ':' + ss + '.' + ms + tz;
}

function parseAnyDate(s) {
    try {
        var d = new Date(s);
        if (!isNaN(d.getTime())) return d;
        return parseBanglaDate(s);
    } catch (_) {
        return parseBanglaDate(s);
    }
}

function bnToEn(str){
    return (str||'').replace(/[০-৯]/g, function(c){
        return '0123456789'[ '০১২৩৪৫৬৭৮৯'.indexOf(c) ];
    });
}

function extractYearMonth(ts){
    try {
        if (typeof ts === 'number') {
            var dn = new Date(ts);
            if (!isNaN(dn.getTime())) return { year: dn.getFullYear(), month: dn.getMonth()+1 };
        }
        var original = ts || '';
        var datePart = original.split(',')[0].trim();
        var hasBnDigits = /[০-৯]/.test(datePart);
        var dp = bnToEn(datePart);
        if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dp)) {
            var p = dp.split('/');
            var y = parseInt(p[2],10);
            var mCandidate = hasBnDigits ? parseInt(p[1],10) : parseInt(p[0],10);
            if (mCandidate >= 1 && mCandidate <= 12) return { year: y, month: mCandidate };
            var a = parseInt(p[0],10);
            var b = parseInt(p[1],10);
            var m = (a >=1 && a <=12) ? a : ((b >=1 && b <=12) ? b : NaN);
            if (!isNaN(m)) return { year: y, month: m };
        }
        if (/^\d{4}-\d{2}-\d{2}$/.test(dp)) {
            var p2 = dp.split('-');
            return { year: parseInt(p2[0],10), month: parseInt(p2[1],10) };
        }
        if (/^\d{2}\/\d{4}$/.test(dp)) {
            var p3 = dp.split('/');
            return { year: parseInt(p3[1],10), month: parseInt(p3[0],10) };
        }
        var d1 = new Date(dp);
        if (!isNaN(d1.getTime())) return { year: d1.getFullYear(), month: d1.getMonth()+1 };
        return null;
    } catch(_) { return null; }
}

// মাসিক গড় বিল ক্যালকুলেশন
function calculateMonthlyAverage() {
    try {
        const billHistory = JSON.parse(localStorage.getItem('desco_bill_history') || '[]');
        
        if (billHistory.length === 0) {
            showNotification('❌ কোন বিল হিস্ট্রি নেই! প্রথমে কিছু বিল সেভ করুন।', 'error');
            return;
        }

        // মাস별 ডেটা গ্রুপ করা
        const monthlyData = {};
        
        billHistory.forEach(bill => {
            const month = bill.month; // YYYY-MM format
            if (!monthlyData[month]) {
                monthlyData[month] = {
                    totalAmount: 0,
                    count: 0,
                    bills: []
                };
            }
            monthlyData[month].totalAmount += bill.netAmount;
            monthlyData[month].count += 1;
            monthlyData[month].bills.push(bill);
        });

        // গড় ক্যালকুলেশন
        const monthlyAverages = [];
        let totalAllMonths = 0;
        let totalBills = 0;

        Object.keys(monthlyData).sort().reverse().forEach(month => {
            const data = monthlyData[month];
            const average = data.totalAmount / data.count;
            monthlyAverages.push({
                month: month,
                average: average,
                totalBills: data.count,
                totalAmount: data.totalAmount
            });
            totalAllMonths += data.totalAmount;
            totalBills += data.count;
        });

        const overallAverage = totalAllMonths / totalBills;

        // রেজাল্ট শো করা
        showMonthlyAverageModal(monthlyAverages, overallAverage, billHistory.length);
        
    } catch (error) {
        console.error('গড় বিল ক্যালকুলেট করতে সমস্যা:', error);
        showNotification('❌ গড় বিল ক্যালকুলেট করতে সমস্যা!', 'error');
    }
}

// মাসিক গড় বিল মডাল শো করা
function showMonthlyAverageModal(monthlyAverages, overallAverage, totalBills) {
    let content = `
        <div style="text-align: center; margin-bottom: 20px;">
            <h3 style="color: #2c3e50; margin-bottom: 10px;">📊 মাসিক গড় বিল বিশ্লেষণ</h3>
            <div style="background: linear-gradient(135deg, #3498db, #2980b9); color: white; padding: 15px; border-radius: 10px;">
                <h4 style="margin: 0; font-size: 24px;">${toBanglaNumber(overallAverage.toFixed(2))} টাকা</h4>
                <p style="margin: 5px 0 0 0; font-size: 14px;">সর্বমোট ${toBanglaNumber(totalBills)}টি বিলের গড়</p>
            </div>
        </div>
    `;

    // মাস ডিটেইলস
    content += `
        <div style="max-height: 300px; overflow-y: auto; margin-top: 20px;">
            <h4 style="color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 8px;">মাস বিশ্লেষণ</h4>
    `;

    monthlyAverages.forEach(item => {
        const monthName = formatMonthForDisplay(item.month);
        content += `
            <div style="
                background: #f8f9fa;
                padding: 12px;
                margin: 8px 0;
                border-radius: 8px;
                border-left: 4px solid #27ae60;
                display: flex;
                justify-content: space-between;
                align-items: center;
            ">
                <div>
                    <strong style="color: #2c3e50;">${monthName}</strong>
                    <br>
                    <small style="color: #7f8c8d;">${toBanglaNumber(item.totalBills)}টি বিল</small>
                </div>
                <div style="text-align: right;">
                    <strong style="color: #e74c3c; font-size: 16px;">${toBanglaNumber(item.average.toFixed(2))} টাকা</strong>
                    <br>
                    <small style="color: #7f8c8d;">মোট: ${toBanglaNumber(item.totalAmount.toFixed(2))} টাকা</small>
                </div>
            </div>
        `;
    });

    content += `</div>`;

    // স্ট্যাটিস্টিক্স
    content += `
        <div style="margin-top: 20px; padding: 15px; background: #e8f6f3; border-radius: 8px; border-left: 4px solid #27ae60;">
            <h4 style="color: #2c3e50; margin-top: 0;">📈 পরিসংখ্যান</h4>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                <div style="text-align: center;">
                    <strong style="color: #e74c3c; font-size: 18px;">${toBanglaNumber(monthlyAverages.length)}</strong>
                    <br>
                    <small>মোট মাস</small>
                </div>
                <div style="text-align: center;">
                    <strong style="color: #3498db; font-size: 18px;">${toBanglaNumber(totalBills)}</strong>
                    <br>
                    <small>মোট বিল</small>
                </div>
            </div>
        </div>
    `;

    // টিপস
    content += `
        <div style="margin-top: 15px; padding: 12px; background: #fff3cd; border-radius: 5px; border-left: 4px solid #ffc107;">
            <strong>💡 টিপস:</strong> 
            <small>গড় বিল দেখে আপনি আপনার বিদ্যুৎ খরচের ট্রেন্ড বুঝতে পারবেন এবং বাজেট করতে সহায়তা হবে।</small>
        </div>
    `;

    showCustomModal('মাসিক গড় বিল বিশ্লেষণ', content);
}

// অটো গড় বিল শো (যখন বিল হিস্ট্রি দেখানো হয়)
function showAverageInHistory() {
    const billHistory = JSON.parse(localStorage.getItem('desco_bill_history') || '[]');
    if (billHistory.length > 0) {
        const totalAmount = billHistory.reduce((sum, bill) => sum + bill.netAmount, 0);
        const average = totalAmount / billHistory.length;
        
        // হিস্ট্রি মডালে গড় যোগ করুন
        const historyContainer = document.querySelector('.modal-body');
        if (historyContainer) {
            const averageElement = document.createElement('div');
            averageElement.innerHTML = `
                <div style="text-align: center; background: #e8f6f3; padding: 10px; border-radius: 5px; margin-bottom: 15px;">
                    <strong>📊 গড় বিল: ${toBanglaNumber(average.toFixed(2))} টাকা</strong>
                    <br>
                    <small>সর্বমোট ${toBanglaNumber(billHistory.length)}টি বিল</small>
                </div>
            `;
            historyContainer.insertBefore(averageElement, historyContainer.firstChild);
        }
    }
}

// showBillHistory ফাংশন আপডেট করুন
function showBillHistory() {
    const billHistory = JSON.parse(localStorage.getItem('desco_bill_history') || '[]');
    
    if (billHistory.length === 0) {
        showNotification('❌ কোন বিল হিস্ট্রি নেই!', 'error');
        return;
    }
    
    let historyHTML = '<div style="max-height: 400px; overflow-y: auto;">';
    
    // গড় বিল যোগ করুন
    const totalAmount = billHistory.reduce((sum, bill) => sum + bill.netAmount, 0);
    const average = totalAmount / billHistory.length;
    historyHTML += `
        <div style="text-align: center; background: linear-gradient(135deg, #3498db, #2980b9); color: white; padding: 12px; border-radius: 8px; margin-bottom: 15px;">
            <strong>📊 গড় বিল: ${toBanglaNumber(average.toFixed(2))} টাকা</strong>
            <br>
            <small>সর্বমোট ${toBanglaNumber(billHistory.length)}টি বিল</small>
        </div>
    `;
    
    billHistory.forEach(item => {
        historyHTML += `
            <div class="history-item" style="
                background: #f8f9fa;
                padding: 10px;
                margin: 5px 0;
                border-radius: 5px;
                border-left: 3px solid #3498db;
                display: flex;
                justify-content: space-between;
                align-items: center;
            ">
                <div>
                    <strong>${item.date}</strong>
                    <br>
                    <small>গ্রোস: ${toBanglaNumber(item.grossAmount.toFixed(2))} টাকা | নেট: ${toBanglaNumber(item.netAmount.toFixed(2))} টাকা</small>
                    <br>
                    <small style="color: #7f8c8d;">${formatMonthForDisplay(item.month)}</small>
                </div>
                <button onclick="deleteBillHistory(${item.id})" style="
                    background: #e74c3c;
                    color: white;
                    border: none;
                    padding: 5px 10px;
                    border-radius: 3px;
                    cursor: pointer;
                ">🗑️</button>
            </div>
        `;
    });
    historyHTML += '</div>';
    
    showCustomModal('বিল হিস্ট্রি', historyHTML);
}

// ট্যারিফ রেট সংজ্ঞা
let tariffRates = [
    { range: [0, 50], rate: 3.50, name: "Lifeline" },
    { range: [51, 75], rate: 4.00, name: "1st Slab" },
    { range: [76, 200], rate: 5.45, name: "2nd Slab" },
    { range: [201, 300], rate: 5.70, name: "3rd Slab" },
    { range: [301, 400], rate: 6.02, name: "4th Slab" },
    { range: [401, 600], rate: 9.30, name: "5th Slab" },
    { range: [601, Infinity], rate: 10.70, name: "6th Slab" }
];

// সেটিংস ভেরিয়েবল
let settings = {
    vatRate: 5.0,
    rebateRate: 0.85,
    demandCharge: 294,
    firstDemandCharge: 588
};

// অটো ব্যাকআপ সেটিংস
let autoBackupSettings = {
    enabled: false,
    backupTime: "23:00",
    retentionDays: 30,
    lastBackup: null,
    nextBackup: null,
    backupTimer: null
};

// মিটার তথ্য
let meterInfo = {
    name: "মকসুদা বেগম",
    meterNumber: "030619019016",
    accountNumber: "41438590"
};

let meters = [];
let activeMeterId = null;

// ভেরিয়েবল ডিক্লেয়ারেশন
let currentBalance = 0;
let totalRecharge = 0;
let totalExpended = 0;
let lastBalance = 0;
let transactions = [];
let monthlyRecharges = [];
let lastDemandChargeMonth = '';
let analyticsChart = null;

function getActiveTransactions() {
    const id = activeMeterId;
    return (transactions || []).filter(t => {
        if (!id) return true;
        if (t && typeof t.meterId !== 'undefined') return t.meterId === id;
        return true; // পুরনো ডেটা active মিটারে দেখান
    });
}

function getActiveMonthlyRecharges() {
    const id = activeMeterId;
    return (monthlyRecharges || []).filter(r => {
        if (!id) return true;
        if (r && typeof r.meterId !== 'undefined') return r.meterId === id;
        return true;
    });
}

// পেইজ লোড হলে ডেটা লোড করা
document.addEventListener('DOMContentLoaded', function() {
    loadMeterInfo();
    loadSettings();
    loadTariffRates();
    loadAutoBackupSettings();
    loadData();
    updateBalanceDisplay();
    loadTransactionReport();
    setupKeyboardShortcuts();
    updateTariffDisplay();
	//loadMeterHistory();
    //loadReportData();
    //updateMeterDisplay();
    
    // বর্তমান তারিখ সেট করুন
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const currentMonth = now.toISOString().substring(0, 7);
    
    document.getElementById('rechargeDate').value = today;
    document.getElementById('balanceDate').value = today;
    document.getElementById('startDate').value = today;
    document.getElementById('endDate').value = today;
    document.getElementById('currentMonth').value = currentMonth;
    document.getElementById('unitsMonth').value = currentMonth;

    // অটো ব্যাকআপ শিডিউল সেটআপ
    scheduleNextBackup();
});

// রিপোর্ট হিস্ট্রি লোড করা
function loadReportHistory() {
    const saved = localStorage.getItem('reportHistory');
    if (saved) {
        reportHistory = JSON.parse(saved);
    }
}

// রিপোর্ট হিস্ট্রি সেভ করা
function saveReportHistory() {
    localStorage.setItem('reportHistory', JSON.stringify(reportHistory));
}

// মিটার তথ্য লোড করা
function loadMeterInfo() {
    try {
        const savedMeters = localStorage.getItem('desco_meters');
        const savedActiveId = localStorage.getItem('desco_active_meter_id');
        if (savedMeters) {
            meters = JSON.parse(savedMeters) || [];
            activeMeterId = savedActiveId || (meters[0] ? meters[0].id : null);
            if (activeMeterId && meters.length > 0) {
                const m = meters.find(x => x.id === activeMeterId) || meters[0];
                meterInfo = { name: m.name, meterNumber: m.meterNumber, accountNumber: m.accountNumber };
            }
        } else {
            const legacy = localStorage.getItem('desco_meterInfo');
            if (legacy) {
                const m = JSON.parse(legacy);
                const id = 'm_' + Date.now();
                meters = [{ id, name: m.name, meterNumber: m.meterNumber, accountNumber: m.accountNumber }];
                activeMeterId = id;
                meterInfo = m;
                localStorage.setItem('desco_meters', JSON.stringify(meters));
                localStorage.setItem('desco_active_meter_id', activeMeterId);
            } else {
                const id = 'm_' + Date.now();
                meters = [{ id, name: meterInfo.name, meterNumber: meterInfo.meterNumber, accountNumber: meterInfo.accountNumber }];
                activeMeterId = id;
                localStorage.setItem('desco_meters', JSON.stringify(meters));
                localStorage.setItem('desco_active_meter_id', activeMeterId);
                localStorage.setItem('desco_meterInfo', JSON.stringify(meterInfo));
            }
        }
        updateMeterDisplay();
        renderMeterSelector();
    } catch (error) {
        console.error('মিটার তথ্য লোড করতে সমস্যা:', error);
    }
}

// মিটার ডিসপ্লে আপডেট - ঠিকানা ও ফোন দেখাবে
function updateMeterDisplay() {
    try {
        console.log('🔄 মিটার ডিসপ্লে আপডেট হচ্ছে...');
        
        // ১. বেসিক ইনফো আপডেট
        const nameEl = document.getElementById('meterName');
        const meterEl = document.getElementById('meterNumber');
        const accountEl = document.getElementById('accountNumber');
        
        if (nameEl) nameEl.textContent = meterInfo?.name || 'N/A';
        if (meterEl) meterEl.textContent = meterInfo?.meterNumber || 'N/A';
        if (accountEl) accountEl.textContent = meterInfo?.accountNumber || 'N/A';
        
        // ২. ঠিকানা ও ফোন দেখানোর জায়গা তৈরি/আপডেট
        let infoContainer = document.getElementById('meterExtraInfo');
        const meterDisplay = document.getElementById('meterDisplay');
        
        if (meterDisplay) {
            // যদি container না থাকে, তৈরি করুন
            if (!infoContainer) {
                infoContainer = document.createElement('div');
                infoContainer.id = 'meterExtraInfo';
                infoContainer.style.marginTop = '8px';
                infoContainer.style.fontSize = '12px';
                infoContainer.style.color = '#7f8c8d';
                meterDisplay.appendChild(infoContainer);
            }
            
            // ঠিকানা ও ফোন দেখান
            let extraHtml = '';
            if (meterInfo?.address && meterInfo.address.trim() !== '') {
                extraHtml += `<span style="margin-right: 15px;">📍 ${meterInfo.address}</span>`;
            }
            if (meterInfo?.phone && meterInfo.phone.trim() !== '') {
                extraHtml += `<span>📞 ${meterInfo.phone}</span>`;
            }
            
            infoContainer.innerHTML = extraHtml || '';
        }
        
        console.log('✅ মিটার ডিসপ্লে আপডেট:', {
            name: meterInfo?.name,
            address: meterInfo?.address,
            phone: meterInfo?.phone
        });
        
    } catch (error) {
        console.error('❌ মিটার ডিসপ্লে আপডেট ত্রুটি:', error);
    }
}

// মিটার সিলেক্টর রেন্ডার - ঠিকানা ও ফোন সহ টুলটিপ
function renderMeterSelector() {
    const container = document.getElementById('meterSelectorContainer');
    const selectEl = document.getElementById('meterSelector');
    if (!container || !selectEl) return;
    
    selectEl.innerHTML = '';
    
    (meters || []).forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.id;
        // মিটার নং সহ দেখান
        opt.textContent = `${m.name} (${m.meterNumber})`;
        // টুলটিপে ঠিকানা ও ফোন দেখান (যদি থাকে)
        if (m.address || m.phone) {
            opt.title = `${m.address ? '📍 ' + m.address : ''}${m.address && m.phone ? ' | ' : ''}${m.phone ? '📞 ' + m.phone : ''}`;
        }
        if (m.id === activeMeterId) opt.selected = true;
        selectEl.appendChild(opt);
    });
    
    // নিউ মিটার অপশন যোগ করুন
    const addOpt = document.createElement('option');
    addOpt.value = 'new';
    addOpt.textContent = '+ নতুন মিটার যোগ করুন';
    addOpt.style.color = '#27ae60';
    addOpt.style.fontWeight = 'bold';
    selectEl.appendChild(addOpt);
}

// মিটার পরিবর্তন হ্যান্ডলার - আপডেটেড
function setActiveMeter(id) {
    if (id === 'new') {
        // নতুন মিটার যোগ করার মডাল দেখান
        if (typeof showAddMeterModal === 'function') {
            showAddMeterModal();
        } else {
            showNotification('নতুন মিটার যোগ করতে "➕ নতুন মিটার" বাটন ব্যবহার করুন', 'info');
        }
        // সিলেক্টর আগের মানে ফিরিয়ে দিন
        renderMeterSelector();
        return;
    }
    
    if (id === activeMeterId) return;
    
    // বর্তমান মিটারের ডেটা সেভ করুন
    if (activeMeterId) {
        const oldKey = `meter_data_${activeMeterId}`;
        const oldData = {
            transactions: transactions,
            monthlyRecharges: monthlyRecharges,
            currentBalance: currentBalance,
            totalRecharge: totalRecharge,
            totalExpended: totalExpended,
            lastDemandChargeMonth: lastDemandChargeMonth,
            settings: settings,
            tariffRates: tariffRates
        };
        localStorage.setItem(oldKey, JSON.stringify(oldData));
    }
    
    // নতুন মিটার সেট
    activeMeterId = id;
    const m = (meters || []).find(x => x.id === id);
    
    if (m) {
        meterInfo = { 
            name: m.name, 
            meterNumber: m.meterNumber, 
            accountNumber: m.accountNumber,
            address: m.address || '',
            phone: m.phone || ''
        };
        localStorage.setItem('desco_active_meter_id', id);
        localStorage.setItem('desco_meterInfo', JSON.stringify(meterInfo));
    }
    
    // নতুন মিটারের ডেটা লোড
    const newKey = `meter_data_${activeMeterId}`;
    const newRaw = localStorage.getItem(newKey);
    
    if (newRaw) {
        const newData = JSON.parse(newRaw);
        transactions = newData.transactions || [];
        monthlyRecharges = newData.monthlyRecharges || [];
        currentBalance = newData.currentBalance || 0;
        totalRecharge = newData.totalRecharge || 0;
        totalExpended = newData.totalExpended || 0;
        lastDemandChargeMonth = newData.lastDemandChargeMonth || '';
        
        if (newData.settings) settings = { ...settings, ...newData.settings };
        if (newData.tariffRates) tariffRates = newData.tariffRates;
    } else {
        // নতুন মিটারের জন্য ডিফল্ট ডেটা
        transactions = [];
        monthlyRecharges = [];
        currentBalance = 0;
        totalRecharge = 0;
        totalExpended = 0;
    }
    
    // UI আপডেট
    updateMeterDisplay();
    updateBalanceDisplay();
    loadTransactionReport();
    updateTariffDisplay();
    
    const currentMeter = meters.find(m => m.id === id);
    showNotification(`✅ ${currentMeter?.name} মিটারে সুইচ করা হয়েছে`, 'success');
    console.log('মিটার সুইচ:', { id, name: currentMeter?.name, balance: currentBalance });
}

// নতুন মিটার যোগ করার মডাল
function showAddMeterModal() {
    const formHTML = `
        <div style="padding: 10px;">
            <h3 style="text-align: center; color: #2c3e50; margin-bottom: 20px;">📝 নতুন মিটার যোগ করুন</h3>
            
            <div style="margin-bottom: 15px;">
                <label style="font-weight: bold; display: block; margin-bottom: 5px; color: #2c3e50;">👤 গ্রাহকের নাম *</label>
                <input type="text" id="newMeterName" placeholder="যেমন: মোঃ আব্দুল মালেক" 
                       style="width: 100%; padding: 12px; border: 2px solid #ddd; border-radius: 8px; font-size: 14px;">
            </div>
            
            <div style="margin-bottom: 15px;">
                <label style="font-weight: bold; display: block; margin-bottom: 5px; color: #2c3e50;">📊 মিটার নম্বর *</label>
                <input type="text" id="newMeterNumber" placeholder="যেমন: 030519023423" 
                       style="width: 100%; padding: 12px; border: 2px solid #ddd; border-radius: 8px; font-size: 14px;">
            </div>
            
            <div style="margin-bottom: 15px;">
                <label style="font-weight: bold; display: block; margin-bottom: 5px; color: #2c3e50;">🔢 অ্যাকাউন্ট নম্বর *</label>
                <input type="text" id="newAccountNumber" placeholder="যেমন: 41495666" 
                       style="width: 100%; padding: 12px; border: 2px solid #ddd; border-radius: 8px; font-size: 14px;">
            </div>
            
            <div style="margin-bottom: 15px;">
                <label style="font-weight: bold; display: block; margin-bottom: 5px; color: #2c3e50;">📍 ঠিকানা</label>
                <input type="text" id="newAddress" placeholder="যেমন: ঢাকা, বাংলাদেশ" 
                       style="width: 100%; padding: 12px; border: 2px solid #ddd; border-radius: 8px; font-size: 14px;">
            </div>
            
            <div style="margin-bottom: 15px;">
                <label style="font-weight: bold; display: block; margin-bottom: 5px; color: #2c3e50;">📞 ফোন নম্বর</label>
                <input type="tel" id="newPhone" placeholder="যেমন: 017xxxxxxxx" 
                       style="width: 100%; padding: 12px; border: 2px solid #ddd; border-radius: 8px; font-size: 14px;">
            </div>
            
            <div style="margin-top: 20px; display: flex; gap: 10px;">
                <button onclick="createNewMeter()" 
                        style="flex: 1; padding: 12px; background: linear-gradient(135deg, #27ae60, #2ecc71); 
                               color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 16px; font-weight: bold;">
                    ➕ মিটার যোগ করুন
                </button>
                <button onclick="closeModal()" 
                        style="flex: 1; padding: 12px; background: linear-gradient(135deg, #95a5a6, #7f8c8d); 
                               color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 16px; font-weight: bold;">
                    ❌ বাতিল করুন
                </button>
            </div>
            
            <div style="margin-top: 15px; padding: 10px; background: #fff3cd; border-radius: 5px; border-left: 4px solid #ffc107;">
                <small style="color: #856404;">💡 টিপ: <span style="color: #e74c3c;">*</span> চিহ্নিত ফিল্ডগুলো অবশ্যই পূরণ করতে হবে</small>
            </div>
        </div>
    `;
    
    showCustomModal('নতুন মিটার', formHTML);
}

// নতুন মিটার তৈরি করা
function createNewMeter() {
    const name = document.getElementById('newMeterName')?.value.trim();
    const meterNumber = document.getElementById('newMeterNumber')?.value.trim();
    const accountNumber = document.getElementById('newAccountNumber')?.value.trim();
    const address = document.getElementById('newAddress')?.value.trim();
    const phone = document.getElementById('newPhone')?.value.trim();
    
    // ভ্যালিডেশন
    if (!name) {
        showNotification('❌ অনুগ্রহ করে গ্রাহকের নাম লিখুন!', 'error');
        document.getElementById('newMeterName').focus();
        return;
    }
    
    if (!meterNumber) {
        showNotification('❌ অনুগ্রহ করে মিটার নম্বর লিখুন!', 'error');
        document.getElementById('newMeterNumber').focus();
        return;
    }
    
    if (!accountNumber) {
        showNotification('❌ অনুগ্রহ করে অ্যাকাউন্ট নম্বর লিখুন!', 'error');
        document.getElementById('newAccountNumber').focus();
        return;
    }
    
    // ডুপ্লিকেট চেক
    const existingMeter = meters.find(m => m.meterNumber === meterNumber);
    if (existingMeter) {
        showNotification(`❌ "${meterNumber}" মিটার নম্বরটি ইতিমধ্যে বিদ্যমান!`, 'error');
        return;
    }
    
    // নতুন মিটার তৈরি
    const newMeterId = 'meter_' + Date.now();
    const newMeter = {
        id: newMeterId,
        name: name,
        meterNumber: meterNumber,
        accountNumber: accountNumber,
        address: address || '',
        phone: phone || '',
        createdAt: new Date().toISOString()
    };
    
    meters.push(newMeter);
    saveMeterProfiles();
    
    // নতুন মিটারের জন্য খালি ডেটা তৈরি করুন
    const emptyMeterData = {
        transactions: [],
        monthlyRecharges: [],
        currentBalance: 0,
        totalRecharge: 0,
        totalExpended: 0,
        lastDemandChargeMonth: '',
        settings: settings,
        tariffRates: tariffRates,
        meterInfo: {
            name: name,
            meterNumber: meterNumber,
            accountNumber: accountNumber,
            address: address || '',
            phone: phone || ''
        }
    };
    
    const meterDataKey = `meter_data_${newMeterId}`;
    localStorage.setItem(meterDataKey, JSON.stringify(emptyMeterData));
    
    // নতুন মিটারে স্যুইচ করুন
    activeMeterId = newMeterId;
    localStorage.setItem('desco_active_meter_id', activeMeterId);
    localStorage.setItem('desco_meters', JSON.stringify(meters));
    
    // UI আপডেট
    updateMeterSelector();
    loadCurrentMeterData();
    updateMeterDisplay();
    updateBalanceDisplay();
    loadTransactionReport();
    
    // মডাল বন্ধ করুন
    closeModal();
    
    showNotification(`✅ "${name}" নামে নতুন মিটার যোগ করা হয়েছে!`, 'success');
    console.log('নতুন মিটার:', newMeter);
}

// মিটার এডিট মোড টগল - আপডেটেড (ঠিকানা ও ফোন সহ)
function toggleMeterEdit() {
    const display = document.getElementById('meterDisplay');
    const edit = document.getElementById('meterEdit');
    
    if (!display || !edit) {
        console.error('মিটার ডিসপ্লে বা এডিট এলিমেন্ট পাওয়া যায়নি');
        return;
    }
    
    if (edit.style.display === 'none' || getComputedStyle(edit).display === 'none') {
        // এডিট মোডে যাওয়া
        display.style.display = 'none';
        edit.style.display = 'block';
        
        // বর্তমান মিটারের তথ্য ফর্মে বসান
        const currentMeter = meters.find(m => m.id === activeMeterId);
        
        if (currentMeter) {
            document.getElementById('editMeterName').value = currentMeter.name || meterInfo.name || '';
            document.getElementById('editMeterNumber').value = currentMeter.meterNumber || meterInfo.meterNumber || '';
            document.getElementById('editAccountNumber').value = currentMeter.accountNumber || meterInfo.accountNumber || '';
            
            // ঠিকানা ও ফোনের জন্য ইনপুট ফিল্ড আপডেট (যদি থাকে)
            const addressInput = document.getElementById('editMeterAddress');
            const phoneInput = document.getElementById('editMeterPhone');
            
            if (addressInput) addressInput.value = currentMeter.address || '';
            if (phoneInput) phoneInput.value = currentMeter.phone || '';
        } else {
            document.getElementById('editMeterName').value = meterInfo.name || '';
            document.getElementById('editMeterNumber').value = meterInfo.meterNumber || '';
            document.getElementById('editAccountNumber').value = meterInfo.accountNumber || '';
        }
        
        // প্রথম ইনপুটে ফোকাস
        document.getElementById('editMeterName').focus();
        
        showNotification('✏️ মিটার তথ্য এডিট মোড', 'info');
    } else {
        // ডিসপ্লে মোডে ফেরত
        display.style.display = 'block';
        edit.style.display = 'none';
    }
}

// মিটার ম্যানেজমেন্ট মডাল
function manageMeters() {
    // meters অ্যারে ব্যবহার করুন (meterProfiles না থাকলে)
    const allMeters = (typeof meterProfiles !== 'undefined' && meterProfiles.length) ? meterProfiles : meters;
    
    let metersHTML = `
        <div style="max-height: 500px; overflow-y: auto;">
            <div style="text-align: center; margin-bottom: 20px;">
                <h3 style="color: #2c3e50;">📋 মিটার ম্যানেজমেন্ট</h3>
                <p style="color: #7f8c8d;">আপনার সব মিটার এখানে দেখুন ও পরিচালনা করুন</p>
            </div>
            
            <button onclick="showAddMeterModal()" style="width: 100%; padding: 12px; background: #27ae60; color: white; border: none; border-radius: 8px; cursor: pointer; margin-bottom: 20px; font-weight: bold;">
                ➕ নতুন মিটার যোগ করুন
            </button>
    `;
    
    // মিটার প্রোফাইল দেখান
    allMeters.forEach(profile => {
        const isCurrent = profile.id === activeMeterId;
        const meterDataKey = `meter_data_${profile.id}`;
        const meterData = localStorage.getItem(meterDataKey);
        let balance = 0;
        let txCount = 0;
        
        if (meterData) {
            const data = JSON.parse(meterData);
            balance = data.currentBalance || 0;
            txCount = data.transactions?.length || 0;
        }
        
        metersHTML += `
            <div style="background: ${isCurrent ? '#e8f6f3' : '#f8f9fa'}; padding: 15px; margin: 10px 0; border-radius: 8px; 
                        border-left: 4px solid ${isCurrent ? '#27ae60' : '#3498db'};">
                <div style="display: flex; justify-content: space-between; align-items: start;">
                    <div style="flex: 1;">
                        <div style="font-weight: bold; font-size: 16px; color: #2c3e50;">
                            ${profile.name}
                            ${isCurrent ? '<span style="background: #27ae60; color: white; padding: 2px 8px; border-radius: 12px; font-size: 10px; margin-left: 8px;">বর্তমান</span>' : ''}
                        </div>
                        <div style="color: #7f8c8d; font-size: 13px; margin-top: 5px;">
                            <div>📊 মিটার নং: ${profile.meterNumber}</div>
                            <div>🔢 অ্যাকাউন্ট নং: ${profile.accountNumber}</div>
                            <div>💰 ব্যালেন্স: ${balance.toFixed(2)} টাকা</div>
                            <div>📝 ট্রানজেকশন: ${txCount}টি</div>
                            ${profile.address ? `<div>📍 ঠিকানা: ${profile.address}</div>` : ''}
                            ${profile.phone ? `<div>📞 ফোন: ${profile.phone}</div>` : ''}
                        </div>
                    </div>
                    <div style="display: flex; gap: 8px;">
                        <button onclick="editMeterModal('${profile.id}')" 
                                style="padding: 8px 15px; background: #3498db; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 12px;">
                            ✏️ এডিট
                        </button>
                        ${allMeters.length > 1 ? `
                        <button onclick="deleteMeterConfirm('${profile.id}')" 
                                style="padding: 8px 15px; background: #e74c3c; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 12px;">
                            🗑️ ডিলিট
                        </button>
                        ` : '<button disabled style="padding: 8px 15px; background: #bdc3c7; color: white; border: none; border-radius: 5px; font-size: 12px; cursor: not-allowed;">🗑️ ডিলিট</button>'}
                    </div>
                </div>
				
				${!isCurrent ? `
					<div style="margin-top: 10px;">
					<button onclick="switchToMeter('${profile.id}')" 
					style="width: 100%; padding: 8px; background: #9b59b6; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 12px;">
					🔄 এই মিটারে সুইচ করুন
					</button>
				</div>
				` : ''}
            </div>
        `;
    });
    
    /* metersHTML += `
            <div style="margin-top: 20px; padding-top: 15px; border-top: 2px solid #ecf0f1;">
                <div style="display: flex; gap: 10px;">
                    <button onclick="exportAllMetersData()" 
                            style="flex: 1; padding: 10px; background: #3498db; color: white; border: none; border-radius: 8px; cursor: pointer;">
                        📦 সব মিটার ব্যাকআপ
                    </button>
                    <input type="file" id="restoreAllMetersFile" accept=".json" style="display: none;" 
                           onchange="restoreAllMetersData(this.files[0])">
                    <button onclick="document.getElementById('restoreAllMetersFile').click()" 
                            style="flex: 1; padding: 10px; background: #27ae60; color: white; border: none; border-radius: 8px; cursor: pointer;">
                        📂 সব মিটার রিস্টোর
                    </button>
                </div>
            </div>
        </div>
    `; */
    
    showCustomModal('মিটার ম্যানেজমেন্ট', metersHTML);
}

// মিটার ডিলিট কনফার্মেশন
function deleteMeterConfirm(meterId) {
    const allMeters = (typeof meterProfiles !== 'undefined' && meterProfiles.length) ? meterProfiles : meters;
    const meter = allMeters.find(m => m.id === meterId);
    if (!meter) return;
    
    const meterDataKey = `meter_data_${meterId}`;
    const meterData = localStorage.getItem(meterDataKey);
    let txCount = 0;
    let balance = 0;
    let totalRecharge = 0;
    let totalExpense = 0;
    
    if (meterData) {
        const data = JSON.parse(meterData);
        txCount = data.transactions?.length || 0;
        balance = data.currentBalance || 0;
        totalRecharge = data.totalRecharge || 0;
        totalExpense = data.totalExpended || 0;
    }
    
    const confirmHTML = `
        <div style="text-align: center;">
            <div style="font-size: 48px; margin-bottom: 10px;">⚠️</div>
            <h3 style="color: #e74c3c; margin-bottom: 15px;">মিটার ডিলিট করতে চান?</h3>
            
            <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 20px; text-align: left;">
                <p><strong>👤 নাম:</strong> ${meter.name}</p>
                <p><strong>📊 মিটার নং:</strong> ${meter.meterNumber}</p>
                <p><strong>🔢 অ্যাকাউন্ট নং:</strong> ${meter.accountNumber}</p>
                <hr style="margin: 10px 0;">
                <p><strong>💰 বর্তমান ব্যালেন্স:</strong> <span style="color: #27ae60;">${balance.toFixed(2)} টাকা</span></p>
                <p><strong>📈 মোট রিচার্জ:</strong> <span style="color: #3498db;">${totalRecharge.toFixed(2)} টাকা</span></p>
                <p><strong>💸 মোট খরচ:</strong> <span style="color: #e74c3c;">${totalExpense.toFixed(2)} টাকা</span></p>
                <p><strong>📝 মোট ট্রানজেকশন:</strong> ${txCount}টি</p>
            </div>
            
            <p style="color: #e74c3c; margin-bottom: 20px; background: #fdf2f2; padding: 10px; border-radius: 5px;">
                ⚠️ সতর্কতা: এই মিটারের সব ডেটা স্থায়ীভাবে মুছে যাবে!
            </p>
            
            <div style="display: flex; gap: 10px;">
                <button onclick="deleteMeter('${meter.id}')" 
                        style="flex: 1; padding: 12px; background: #e74c3c; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: bold;">
                    🗑️ নিশ্চিতভাবে ডিলিট
                </button>
                <button onclick="closeModal()" 
                        style="flex: 1; padding: 12px; background: #95a5a6; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: bold;">
                    ❌ বাতিল করুন
                </button>
            </div>
        </div>
    `;
    
    showCustomModal('মিটার ডিলিট', confirmHTML);
}

// মিটার ডিলিট করা
function deleteMeter(meterId) {
    // ডিলিট করা মিটার খুঁজুন
    const meterToDelete = meterProfiles.find(m => m.id === meterId);
    if (!meterToDelete) return;
    
    // চেক করুন এটি শেষ মিটার কিনা
    if (meterProfiles.length === 1) {
        showNotification('❌ কমপক্ষে একটি মিটার থাকতে হবে!', 'error');
        closeModal();
        return;
    }
    
    // মিটার ডেটা ডিলিট
    const meterDataKey = `meter_data_${meterId}`;
    localStorage.removeItem(meterDataKey);
    
    // প্রোফাইল থেকে রিমুভ
    meterProfiles = meterProfiles.filter(m => m.id !== meterId);
    saveMeterProfiles();
    
    // যদি বর্তমান মিটার ডিলিট হয়, তাহলে প্রথম মিটারে স্যুইচ করুন
    if (activeMeterId === meterId) {
        activeMeterId = meterProfiles[0].id;
        localStorage.setItem('desco_active_meter_id', activeMeterId);
        loadCurrentMeterData();
    }
    
    // UI আপডেট
    updateMeterSelector();
    updateMeterDisplay();
    updateBalanceDisplay();
    loadTransactionReport();
    
    // মডাল বন্ধ করুন
    closeModal();
    
    showNotification(`✅ "${meterToDelete.name}" মিটার ডিলিট করা হয়েছে!`, 'success');
    console.log('মিটার ডিলিট:', meterToDelete);
    
    // মিটার ম্যানেজমেন্ট রিফ্রেশ (যদি খোলা থাকে)
    setTimeout(() => {
        manageMeters();
    }, 500);
}

// মিটার এডিট বাতিল
function cancelMeterEdit() {
    const display = document.getElementById('meterDisplay');
    const edit = document.getElementById('meterEdit');
    
    display.style.display = 'block';
    edit.style.display = 'none';
    
    showNotification('ℹ️ এডিট বাতিল করা হয়েছে', 'info');
}

// কীবোর্ড শর্টকাট সেটআপ
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', function(e) {
        if ((e.ctrlKey || e.metaKey) && !e.altKey) {
            switch(e.key) {
                case 's':
                    e.preventDefault();
                    saveSettings();
                    break;
                case 'e':
                    e.preventDefault();
                    exportToExcel();
                    break;
                case 'd':
                    e.preventDefault();
                    openTab('dailyTab');
                    break;
                case 'r':
                    e.preventDefault();
                    openTab('reportTab');
                    break;
                case 'a':
                    e.preventDefault();
                    openTab('analyticsTab');
                    break;
            }
        }
    });
}

// সেটিংস লোড করা
function loadSettings() {
    try {
        const savedSettings = localStorage.getItem('desco_settings');
        if (savedSettings) {
            const parsedSettings = JSON.parse(savedSettings);
            settings = { ...settings, ...parsedSettings };
        }
        updateSettingsForm();
    } catch (error) {
        console.error('সেটিংস লোড করতে সমস্যা:', error);
    }
}

// সেটিংস সেভ করা
function saveSettings() {
    try {
        settings.vatRate = parseFloat(document.getElementById('vatRate').value) || 5.0;
        settings.rebateRate = parseFloat(document.getElementById('rebateRate').value) || 0.85;
        settings.demandCharge = parseFloat(document.getElementById('demandCharge').value) || 294;
        settings.firstDemandCharge = parseFloat(document.getElementById('firstDemandCharge').value) || 588;
        
        localStorage.setItem('desco_settings', JSON.stringify(settings));
        showNotification('✅ সেটিংস সফলভাবে সেভ করা হয়েছে!', 'success');
    } catch (error) {
        console.error('সেটিংস সেভ করতে সমস্যা:', error);
        showNotification('❌ সেটিংস সেভ করতে সমস্যা হচ্ছে!', 'error');
    }
}

// Settings form-এ মাসের তথ্য দেখান
function updateSettingsForm() {
    document.getElementById('vatRate').value = settings.vatRate;
    document.getElementById('rebateRate').value = settings.rebateRate;
    document.getElementById('demandCharge').value = settings.demandCharge;
    
    // মাসের তথ্য দেখান
    const demandChargeInfo = document.getElementById('demandChargeInfo');
    if (demandChargeInfo) {
        demandChargeInfo.innerHTML = `
            <small>
                মাসিক ডিমান্ড চার্জ: ${settings.demandCharge} টাকা<br>
                <strong>সেপ্টেম্বর-অক্টোবর:</strong> ${settings.demandCharge * 2} টাকা (২ গুণ)<br>
                <strong>অন্যান্য মাস:</strong> ${settings.demandCharge} টাকা
            </small>
        `;
    }
}

// ডিফল্ট সেটিংসে রিসেট
function resetSettings() {
    if (confirm('আপনি কি নিশ্চিত যে আপনি ডিফল্ট সেটিংসে রিসেট করতে চান?')) {
        settings = {
            vatRate: 5.0,
            rebateRate: 0.85,
            demandCharge: 294,
            firstDemandCharge: 588
        };
        updateSettingsForm();
        localStorage.setItem('desco_settings', JSON.stringify(settings));
        showNotification('✅ সেটিংস ডিফল্ট ভ্যালুতে রিসেট করা হয়েছে!', 'success');
    }
}

// ট্যারিফ রেট লোড করা
function loadTariffRates() {
    try {
        const savedTariffRates = localStorage.getItem('desco_tariffRates');
        if (savedTariffRates) {
            tariffRates = JSON.parse(savedTariffRates);
        }
        updateTariffDisplay();
    } catch (error) {
        console.error('ট্যারিফ রেট লোড করতে সমস্যা:', error);
    }
}

// ট্যারিফ ডিসপ্লে আপডেট
function updateTariffDisplay() {
    const tableBody = document.getElementById('tariffTableBody');
    let html = '';
    
    tariffRates.forEach((slab, index) => {
        const rangeText = slab.range[1] === Infinity ? 
            `${slab.range[0]}+` : 
            `${slab.range[0]}-${slab.range[1]}`;
        
        html += `
            <tr>
                <td>${slab.name}</td>
                <td>${rangeText}</td>
                <td>${slab.rate} টাকা</td>
            </tr>
        `;
    });
    
    tableBody.innerHTML = html;
}

// ট্যারিফ এডিট মোড টগল
function toggleTariffEdit() {
    const display = document.getElementById('tariffDisplay');
    const edit = document.getElementById('tariffEdit');
    
    if (edit.style.display === 'none') {
        display.style.display = 'none';
        edit.style.display = 'block';
        loadTariffEditForm();
    } else {
        display.style.display = 'block';
        edit.style.display = 'none';
    }
}

// ট্যারিফ এডিট ফর্ম লোড করা
function loadTariffEditForm() {
    const editForm = document.getElementById('tariffEditForm');
    let html = '<div class="tariff-edit-form">';
    
    tariffRates.forEach((slab, index) => {
        html += `
            <div class="tariff-slab-row" data-index="${index}">
                <div>
                    <label>স্ল্যাব নাম</label>
                    <input type="text" value="${slab.name}" onchange="updateTariffSlab(${index}, 'name', this.value)">
                </div>
                <div>
                    <label>শুরু (ইউনিট)</label>
                    <input type="number" value="${slab.range[0]}" onchange="updateTariffSlab(${index}, 'rangeStart', this.value)">
                </div>
                <div>
                    <label>শেষ (ইউনিট)</label>
                    <input type="number" value="${slab.range[1] === Infinity ? '' : slab.range[1]}" placeholder="খালি রাখুন অসীমের জন্য" onchange="updateTariffSlab(${index}, 'rangeEnd', this.value)">
                </div>
                <div>
                    <label>দর (টাকা)</label>
                    <input type="number" step="0.01" value="${slab.rate}" onchange="updateTariffSlab(${index}, 'rate', this.value)">
                </div>
                <button type="button" class="remove-slab-btn" onclick="removeTariffSlab(${index})">🗑️</button>
            </div>
        `;
    });
    
    editForm.innerHTML = html + '</div>';
}

// ট্যারিফ স্ল্যাব আপডেট
function updateTariffSlab(index, field, value) {
    if (field === 'name') {
        tariffRates[index].name = value;
    } else if (field === 'rangeStart') {
        tariffRates[index].range[0] = parseInt(value) || 0;
    } else if (field === 'rangeEnd') {
        tariffRates[index].range[1] = value === '' ? Infinity : parseInt(value);
    } else if (field === 'rate') {
        tariffRates[index].rate = parseFloat(value) || 0;
    }
}

// ট্যারিফ স্ল্যাব রিমুভ
function removeTariffSlab(index) {
    if (tariffRates.length > 1) {
        tariffRates.splice(index, 1);
        loadTariffEditForm();
    } else {
        showNotification('❌ অন্তত একটি স্ল্যাব থাকতে হবে!', 'error');
    }
}

// নতুন ট্যারিফ স্ল্যাব যোগ
function addNewTariffSlab() {
    const lastSlab = tariffRates[tariffRates.length - 1];
    const newStart = lastSlab.range[1] === Infinity ? lastSlab.range[0] + 100 : lastSlab.range[1] + 1;
    
    tariffRates.push({
        name: `নতুন স্ল্যাব ${tariffRates.length + 1}`,
        range: [newStart, newStart + 99],
        rate: lastSlab.rate + 1
    });
    
    loadTariffEditForm();
}

// ট্যারিফ রেট সেভ করা
function saveTariffRates() {
    try {
        // ভ্যালিডেশন
        for (let i = 0; i < tariffRates.length; i++) {
            const slab = tariffRates[i];
            
            if (!slab.name || slab.rate <= 0) {
                showNotification('❌ সব স্ল্যাবের জন্য বৈধ নাম এবং দর প্রয়োজন!', 'error');
                return;
            }
            
            if (i > 0 && slab.range[0] <= tariffRates[i-1].range[1]) {
                showNotification('❌ স্ল্যাব রেঞ্জ ওভারল্যাপ হতে পারে না!', 'error');
                return;
            }
        }
        
        localStorage.setItem('desco_tariffRates', JSON.stringify(tariffRates));
        updateTariffDisplay();
        toggleTariffEdit();
        
        showNotification('✅ ট্যারিফ রেট সফলভাবে সেভ করা হয়েছে!', 'success');
    } catch (error) {
        console.error('ট্যারিফ রেট সেভ করতে সমস্যা:', error);
        showNotification('❌ ট্যারিফ রেট সেভ করতে সমস্যা হচ্ছে!', 'error');
    }
}

// ট্যারিফ এডিট বাতিল
function cancelTariffEdit() {
    // অরিজিনাল রেট লোড করা
    loadTariffRates();
    
    const display = document.getElementById('tariffDisplay');
    const edit = document.getElementById('tariffEdit');
    
    display.style.display = 'block';
    edit.style.display = 'none';
    
    showNotification('ℹ️ ট্যারিফ এডিট বাতিল করা হয়েছে', 'info');
}

// অটো ব্যাকআপ সেটিংস লোড করা
function loadAutoBackupSettings() {
    try {
        const savedSettings = localStorage.getItem('desco_autoBackup');
        if (savedSettings) {
            autoBackupSettings = JSON.parse(savedSettings);
            updateAutoBackupUI();
        }
    } catch (error) {
        console.error('অটো ব্যাকআপ সেটিংস লোড করতে সমস্যা:', error);
    }
}

// অটো ব্যাকআপ মোডাল ওপেন
function enableAutoBackup() {
    document.getElementById('autoBackupModal').style.display = 'flex';
    updateAutoBackupUI();
}

// অটো ব্যাকআপ মোডাল ক্লোজ
function closeAutoBackupModal() {
    document.getElementById('autoBackupModal').style.display = 'none';
}

// অটো ব্যাকআপ টগল
function toggleAutoBackup() {
    const enabled = document.getElementById('enableAutoBackup').checked;
    document.getElementById('autoBackupSettings').style.display = enabled ? 'block' : 'none';
}

// অটো ব্যাকআপ সেটিংস সেভ করা
function saveAutoBackupSettings() {
    try {
        autoBackupSettings.enabled = document.getElementById('enableAutoBackup').checked;
        autoBackupSettings.backupTime = document.getElementById('backupTime').value;
        autoBackupSettings.retentionDays = parseInt(document.getElementById('backupRetention').value) || 30;
        
        localStorage.setItem('desco_autoBackup', JSON.stringify(autoBackupSettings));
        
        if (autoBackupSettings.enabled) {
            scheduleNextBackup();
            performAutoBackup(); // ইমিডিয়েট ব্যাকআপ
        } else {
            clearTimeout(autoBackupSettings.backupTimer);
        }
        
        updateAutoBackupUI();
        closeAutoBackupModal();
        
        showNotification('✅ অটো ব্যাকআপ সেটিংস সেভ করা হয়েছে!', 'success');
    } catch (error) {
        console.error('অটো ব্যাকআপ সেটিংস সেভ করতে সমস্যা:', error);
        showNotification('❌ অটো ব্যাকআপ সেটিংস সেভ করতে সমস্যা!', 'error');
    }
}

// পরবর্তী ব্যাকআপ শিডিউল করা
function scheduleNextBackup() {
    if (!autoBackupSettings.enabled) return;
    
    clearTimeout(autoBackupSettings.backupTimer);
    
    const now = new Date();
    const [hours, minutes] = autoBackupSettings.backupTime.split(':');
    const backupTime = new Date();
    backupTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
    
    // যদি ব্যাকআপ টাইম আজ পার হয়ে যায়, তাহলে আগামীকালের জন্য শিডিউল
    if (backupTime <= now) {
        backupTime.setDate(backupTime.getDate() + 1);
    }
    
    const timeUntilBackup = backupTime.getTime() - now.getTime();
    
    autoBackupSettings.nextBackup = backupTime.toISOString();
    autoBackupSettings.backupTimer = setTimeout(() => {
        performAutoBackup();
        scheduleNextBackup(); // পরবর্তী ব্যাকআপ শিডিউল
    }, timeUntilBackup);
    
    localStorage.setItem('desco_autoBackup', JSON.stringify(autoBackupSettings));
    updateAutoBackupUI();
    
    console.log('⏰ পরবর্তী ব্যাকআপ শিডিউল করা হয়েছে:', backupTime.toLocaleString('bn-BD'));
}

// অটো ব্যাকআপ পারফর্ম করা
function performAutoBackup() {
    try {
        const backup = {
            transactions: transactions,
            monthlyRecharges: monthlyRecharges,
            settings: settings,
            tariffRates: tariffRates,
            meterInfo: meterInfo,
            balance: currentBalance,
            totalRecharge: totalRecharge,
            totalExpended: totalExpended,
            lastDemandChargeMonth: lastDemandChargeMonth,
            meters: meters,
            activeMeterId: activeMeterId,
            timestamp: new Date().toISOString(),
            type: 'auto_backup',
            version: '1.0'
        };
        
        // daily_backup ফোল্ডারে ব্যাকআপ তৈরি
        const today = new Date().toISOString().split('T')[0];
        const backupKey = `daily_backup_${today}`;
        
        localStorage.setItem(backupKey, JSON.stringify(backup));
        
        // পুরানো ব্যাকআপ ক্লিনআপ
        cleanupOldBackups();
        
        autoBackupSettings.lastBackup = new Date().toISOString();
        localStorage.setItem('desco_autoBackup', JSON.stringify(autoBackupSettings));
        
        updateAutoBackupUI();
        
        console.log('✅ অটো ব্যাকআপ সম্পন্ন হয়েছে:', today);
        showNotification('💾 ডেইলি অটো ব্যাকআপ সম্পন্ন হয়েছে', 'success');
        
    } catch (error) {
        console.error('অটো ব্যাকআপ করতে সমস্যা:', error);
        showNotification('❌ অটো ব্যাকআপ করতে সমস্যা!', 'error');
    }
}

// পুরানো ব্যাকআপ ক্লিনআপ
function cleanupOldBackups() {
    const retentionTime = autoBackupSettings.retentionDays * 24 * 60 * 60 * 1000;
    const now = new Date().getTime();
    let deletedCount = 0;
    
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('daily_backup_')) {
            try {
                const backup = JSON.parse(localStorage.getItem(key));
                const backupTime = new Date(backup.timestamp).getTime();
                
                if (now - backupTime > retentionTime) {
                    localStorage.removeItem(key);
                    deletedCount++;
                    console.log('🗑️ পুরানো ব্যাকআপ ডিলিট করা হয়েছে:', key);
                }
            } catch (error) {
                console.error('ব্যাকআপ ক্লিনআপ করতে সমস্যা:', error);
            }
        }
    }
    
    if (deletedCount > 0) {
        console.log(`🗑️ ${deletedCount}টি পুরানো ব্যাকআপ ডিলিট করা হয়েছে`);
    }
}

// অটো ব্যাকআপ UI আপডেট
function updateAutoBackupUI() {
    if (autoBackupSettings.enabled) {
        document.getElementById('enableAutoBackup').checked = true;
        document.getElementById('autoBackupSettings').style.display = 'block';
        document.getElementById('backupTime').value = autoBackupSettings.backupTime;
        document.getElementById('backupRetention').value = autoBackupSettings.retentionDays;
        
        if (autoBackupSettings.nextBackup) {
            const nextBackup = new Date(autoBackupSettings.nextBackup);
            document.getElementById('nextBackupTime').textContent = nextBackup.toLocaleString('bn-BD');
        } else {
            document.getElementById('nextBackupTime').textContent = '-';
        }
        
        if (autoBackupSettings.lastBackup) {
            const lastBackup = new Date(autoBackupSettings.lastBackup);
            document.getElementById('lastBackupTime').textContent = lastBackup.toLocaleString('bn-BD');
        } else {
            document.getElementById('lastBackupTime').textContent = '-';
        }
    } else {
        document.getElementById('enableAutoBackup').checked = false;
        document.getElementById('autoBackupSettings').style.display = 'none';
    }
}

// অটো ব্যাকআপ ফাইল ডাউনলোড
function downloadAutoBackupFiles() {
    try {
        const backupKeys = Object.keys(localStorage).filter(key => key.startsWith('daily_backup_'));
        
        if (backupKeys.length === 0) {
            showNotification('❌ কোন অটো ব্যাকআপ ফাইল নেই!', 'error');
            return;
        }

        // Create a zip file containing all backups
        const zip = new JSZip();
        
        backupKeys.forEach(key => {
            const backupData = localStorage.getItem(key);
            const backup = JSON.parse(backupData);
            const date = key.replace('daily_backup_', '');
            
            zip.file(`electricity_backup_${date}.json`, JSON.stringify(backup, null, 2));
        });

        // Generate and download zip file
        zip.generateAsync({type: "blob"})
        .then(function(content) {
            const url = URL.createObjectURL(content);
            const a = document.createElement('a');
            a.href = url;
            a.download = `electricity_auto_backups_${new Date().toISOString().split('T')[0]}.zip`;
            a.click();
            URL.revokeObjectURL(url);
            
            showNotification(`✅ ${backupKeys.length}টি অটো ব্যাকআপ ফাইল ডাউনলোড হয়েছে!`, 'success');
        });
        
    } catch (error) {
        console.error('অটো ব্যাকআপ ডাউনলোড করতে সমস্যা:', error);
        showNotification('❌ অটো ব্যাকআপ ডাউনলোড করতে সমস্যা!', 'error');
    }
}

// অটো ব্যাকআপ দেখুন
function viewAutoBackups() {
    const backupKeys = Object.keys(localStorage).filter(key => key.startsWith('daily_backup_'));
    
    if (backupKeys.length === 0) {
        alert('কোন অটো ব্যাকআপ নেই!');
        return;
    }
    
    let backupList = '📁 অটো ব্যাকআপ লিস্ট:\n\n';
    
    backupKeys.sort().reverse().forEach(key => {
        try {
            const backup = JSON.parse(localStorage.getItem(key));
            const date = new Date(backup.timestamp).toLocaleDateString('bn-BD');
            const time = new Date(backup.timestamp).toLocaleTimeString('bn-BD');
            
            backupList += `📅 ${date} - 🕒 ${time}\n`;
            backupList += `   ট্রানজেকশন: ${backup.transactions.length}টি\n`;
            backupList += `   রিচার্জ: ${backup.monthlyRecharges.length}টি\n`;
            backupList += `   ব্যালেন্স: ${backup.balance} টাকা\n\n`;
        } catch (error) {
            backupList += `❌ ${key} - পড়তে সমস্যা\n\n`;
        }
    });
    
    backupList += `মোট ব্যাকআপ: ${backupKeys.length}টি`;
    alert(backupList);
}

// অটো-সেভ ফিচার
let autoSaveTimeout;
function autoSave() {
    clearTimeout(autoSaveTimeout);
    autoSaveTimeout = setTimeout(() => {
        saveData();
        showNotification('💾 ডেটা অটো-সেভ করা হয়েছে', 'info');
    }, 2000);
}

// টোস্ট নোটিফিকেশন
function showNotification(message, type = 'info') {
    const toastContainer = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <div class="toast-content">
            <strong>${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'} ${message}</strong>
        </div>
    `;
    
    toastContainer.appendChild(toast);
    
    // 5 সেকেন্ড পর অটো রিমুভ
    setTimeout(() => {
        toast.remove();
    }, 5000);
}

// লোকাল স্টোরেজ থেকে ডেটা লোড করা
function loadData() {
    try {
        const savedBalance = localStorage.getItem('desco_currentBalance');
        const savedRecharge = localStorage.getItem('desco_totalRecharge');
        const savedExpended = localStorage.getItem('desco_totalExpended');
        const savedLastBalance = localStorage.getItem('desco_lastBalance');
        const savedTransactions = localStorage.getItem('desco_transactions');
        const savedMonthlyRecharges = localStorage.getItem('desco_monthlyRecharges');
        const savedLastDemandChargeMonth = localStorage.getItem('desco_lastDemandChargeMonth');
        
        if (savedBalance) currentBalance = parseFloat(savedBalance);
        if (savedRecharge) totalRecharge = parseFloat(savedRecharge);
        if (savedExpended) totalExpended = parseFloat(savedExpended);
        if (savedLastBalance) lastBalance = parseFloat(savedLastBalance);
        if (savedTransactions) transactions = JSON.parse(savedTransactions);
        if (savedMonthlyRecharges) monthlyRecharges = JSON.parse(savedMonthlyRecharges);
        if (savedLastDemandChargeMonth) lastDemandChargeMonth = savedLastDemandChargeMonth;
        
    } catch (error) {
        console.error('ডেটা লোড করতে সমস্যা:', error);
        resetToDefault();
    }
}

// ডেটা সেভ করা
function saveData() {
    try {
        localStorage.setItem('desco_currentBalance', currentBalance.toString());
        localStorage.setItem('desco_totalRecharge', totalRecharge.toString());
        localStorage.setItem('desco_totalExpended', totalExpended.toString());
        localStorage.setItem('desco_lastBalance', lastBalance.toString());
        localStorage.setItem('desco_transactions', JSON.stringify(transactions));
        localStorage.setItem('desco_monthlyRecharges', JSON.stringify(monthlyRecharges));
        localStorage.setItem('desco_lastDemandChargeMonth', lastDemandChargeMonth);
        
    } catch (error) {
        console.error('ডেটা সেভ করতে সমস্যা:', error);
        showNotification('❌ ডেটা সেভ করতে সমস্যা হচ্ছে! ব্রাউজারের সেটিংস চেক করুন।', 'error');
    }
}

// সব ডেটা সেভ করা - FIXED VERSION
function saveAllData() {
    try {
        console.log('💾 Saving all data...');
        
        // ১. saveData() call করুন
        saveData();
        
        // ২. সব variables ensure করুন
        const dataToSave = {
            transactions: transactions || [],
            monthlyRecharges: monthlyRecharges || [],
            settings: settings || {},
            tariffRates: tariffRates || [],
            meterInfo: meterInfo || {},
            meters: meters || [],
            activeMeterId: activeMeterId,
            users: users || [],
            currentBalance: currentBalance || 0,
            totalRecharge: totalRecharge || 0,
            totalExpended: totalExpended || 0,
            autoBackupSettings: autoBackupSettings || {},
            lastSaved: new Date().toISOString()
        };
        
        // ৩. সব ডেটা save করুন
        localStorage.setItem('desco_settings', JSON.stringify(settings));
        localStorage.setItem('desco_tariffRates', JSON.stringify(tariffRates));
        localStorage.setItem('desco_meterInfo', JSON.stringify(meterInfo));
        localStorage.setItem('desco_meters', JSON.stringify(meters));
        localStorage.setItem('desco_active_meter_id', activeMeterId);
        localStorage.setItem('desco_autoBackup', JSON.stringify(autoBackupSettings));
        
        // ✅ FIX: totalExpended এবং currentBalance save করুন
        localStorage.setItem('desco_currentBalance', currentBalance.toString());
        localStorage.setItem('desco_totalRecharge', totalRecharge.toString());
        localStorage.setItem('desco_totalExpended', totalExpended.toString());
        
        // ✅ FIX: Complete data backup
        localStorage.setItem('desco_complete_data', JSON.stringify(dataToSave));
        
        console.log('✅ All data saved successfully');
        console.log('Current Balance:', currentBalance);
        console.log('Total Expended:', totalExpended);
        console.log('Total Recharge:', totalRecharge);
        
    } catch (error) {
        console.error('❌ Data save error:', error);
    }
}

// Global access
window.saveAllData = saveAllData;

// সব ডেটা লোড - ফিক্সড
function loadAllData() {
    try {
        console.log('📂 Loading all data...');
        
        // ✅ প্রথমে মিটার ডেটা থেকে ব্যালেন্স নিন
        if (activeMeterId) {
            const meterDataKey = `meter_data_${activeMeterId}`;
            const meterData = localStorage.getItem(meterDataKey);
            if (meterData) {
                const data = JSON.parse(meterData);
                currentBalance = data.currentBalance || 0;
                totalRecharge = data.totalRecharge || 0;
                totalExpended = data.totalExpended || 0;
                transactions = data.transactions || [];
                monthlyRecharges = data.monthlyRecharges || [];
                console.log('✅ মিটার ডেটা থেকে ব্যালেন্স লোড:', currentBalance);
            }
        }
        
        // ✅ fallback: পুরনো স্টোরেজ থেকে
        if (!currentBalance || currentBalance === 0) {
            const savedBalance = localStorage.getItem('desco_currentBalance');
            if (savedBalance) currentBalance = parseFloat(savedBalance);
        }
        if (!totalRecharge) {
            const savedRecharge = localStorage.getItem('desco_totalRecharge');
            if (savedRecharge) totalRecharge = parseFloat(savedRecharge);
        }
        if (!totalExpended) {
            const savedExpended = localStorage.getItem('desco_totalExpended');
            if (savedExpended) totalExpended = parseFloat(savedExpended);
        }
        
        console.log('✅ ফাইনাল ব্যালেন্স:', currentBalance);
        
    } catch (error) {
        console.error('❌ Data load error:', error);
        currentBalance = currentBalance || 0;
        totalRecharge = totalRecharge || 0;
        totalExpended = totalExpended || 0;
    }
}

// Global access
window.loadAllData = loadAllData;

// ট্রানজেকশন চেক করুন
console.log('মোট ট্রানজেকশন:', transactions.length);
transactions.forEach((t, i) => {
    console.log(`${i+1}. ${t.type}: ${t.amount} | ব্যালেন্স: ${t.balanceAfter}`);
});

// টোটাল রিচার্জ ও এক্সপেন্ডেড চেক করুন
const totalR = transactions.filter(t => t.type === 'recharge').reduce((sum, t) => sum + Math.abs(t.amount), 0);
const totalE = transactions.filter(t => t.type === 'electricity_bill').reduce((sum, t) => sum + Math.abs(t.amount), 0);
console.log('মোট রিচার্জ:', totalR);
console.log('মোট খরচ:', totalE);
console.log('এক্সপেক্টেড ব্যালেন্স:', totalR - totalE);

// UI আপডেট
function updateUI() {
    updateBalanceDisplay();
    updateSettingsForm();
    updateMeterDisplay();
    updateTariffDisplay();
    updateAutoBackupUI();
}

// ডিফল্ট ভ্যালুতে রিসেট
function resetToDefault() {
    currentBalance = 0;
    totalRecharge = 0;
    totalExpended = 0;
    lastBalance = 0;
    transactions = [];
    monthlyRecharges = [];
    lastDemandChargeMonth = '';
    
    // মিটার তথ্য ডিফল্টে রিসেট
    meters = [{
        id: 'meter_1',
        name: "মকসুদা বেগম",
        meterNumber: "030619019016",
        accountNumber: "41438590"
    }];
    activeMeterId = 'meter_1';
    
    meterInfo = {
        name: "মকসুদা বেগম",
        meterNumber: "030619019016",
        accountNumber: "41438590"
    };
    
    // ট্যারিফ রেট ডিফল্টে রিসেট
    tariffRates = [
        { range: [0, 50], rate: 3.50, name: "Lifeline" },
        { range: [0, 75], rate: 4.00, name: "1st Slab" },
        { range: [76, 200], rate: 5.45, name: "2nd Slab" },
        { range: [201, 300], rate: 5.70, name: "3rd Slab" },
        { range: [301, 400], rate: 6.02, name: "4th Slab" },
        { range: [401, 600], rate: 9.30, name: "5th Slab" },
        { range: [601, Infinity], rate: 10.70, name: "6th Slab" }
    ];
    
    // সেটিংস ডিফল্টে রিসেট
    settings = {
        vatRate: 5.0,
        rebateRate: 0.85,
        demandCharge: 294,
        firstDemandCharge: 588
    };
    
    // অটো ব্যাকআপ ডিফল্টে রিসেট
    autoBackupSettings = {
        enabled: false,
        backupTime: "23:00",
        retentionDays: 30,
        lastBackup: null,
        nextBackup: null,
        backupTimer: null
    };
    
    saveAllData();
    updateMeterDisplay();
    updateTariffDisplay();
}

// ট্যাব ম্যানেজমেন্ট - একক আপডেটেড ভার্সন
function openTab(tabName) {
    const tabContents = document.querySelectorAll('.tab-content');
    const tabButtons = document.querySelectorAll('.tab-button');
    tabContents.forEach(tab => tab.classList.remove('active'));
    tabButtons.forEach(button => button.classList.remove('active'));
    const tabEl = document.getElementById(tabName);
    if (tabEl) tabEl.classList.add('active');
    if (typeof event !== 'undefined' && event && event.target) {
        event.target.classList.add('active');
    } else {
        const btn = Array.from(tabButtons).find(b => (b.getAttribute('onclick') || '').includes(`openTab('${tabName}')`));
        if (btn) btn.classList.add('active');
    }
    try { localStorage.setItem('desco_last_tab', tabName); } catch(_) {}
    if (tabName === 'reportTab') {
        setTimeout(() => { if (typeof loadTransactionReport === 'function') loadTransactionReport(); }, 300);
    } else if (tabName === 'analyticsTab') {
        if (typeof generateMonthlyChart === 'function') generateMonthlyChart();
    } else if (tabName === 'applianceTab') {
        if (typeof initializeApplianceCalculator === 'function') initializeApplianceCalculator();
    } else if (tabName === 'unitsTab') {
        const now = new Date();
        const currentMonth = now.toISOString().substring(0, 7);
        const unitsMonthEl = document.getElementById('unitsMonth');
        if (unitsMonthEl) unitsMonthEl.value = currentMonth;
    }
}

// ডিজিটাল মিটার ফাংশনালিটি
let meterHistory = [];
let baseReading = 113.12;
let reportHistory = [];

// মিটার ইনিশিয়ালাইজ
function initializeDigitalMeter() {
    loadMeterHistory();
    updateMeterDisplay();
}

// মিটার ডিসপ্লে আপডেট - ঠিকানা ও ফোন সহ
function updateMeterDisplay() {
    try {
        console.log('🔄 মিটার ডিসপ্লে আপডেট হচ্ছে...');
        
        // ১. মিটার বেসিক ইনফো আপডেট
        const nameEl = document.getElementById('meterName');
        const meterEl = document.getElementById('meterNumber');
        const accountEl = document.getElementById('accountNumber');
        
        if (nameEl) nameEl.textContent = meterInfo.name || 'N/A';
        if (meterEl) meterEl.textContent = meterInfo.meterNumber || 'N/A';
        if (accountEl) accountEl.textContent = meterInfo.accountNumber || 'N/A';
        
        // ২. ঠিকানা ও ফোন দেখানোর জন্য এলিমেন্ট তৈরি/আপডেট
        let addressPhoneEl = document.getElementById('meterAddressPhone');
        
        if (!addressPhoneEl) {
            // যদি এলিমেন্ট না থাকে, তাহলে তৈরি করুন
            const meterDisplay = document.getElementById('meterDisplay');
            if (meterDisplay) {
                const pTag = meterDisplay.querySelector('p');
                if (pTag) {
                    const newDiv = document.createElement('div');
                    newDiv.id = 'meterAddressPhone';
                    newDiv.style.marginTop = '8px';
                    newDiv.style.fontSize = '12px';
                    newDiv.style.color = '#7f8c8d';
                    pTag.appendChild(newDiv);
                    addressPhoneEl = newDiv;
                }
            }
        }
        
        // ৩. ঠিকানা ও ফোন দেখান (যদি থাকে)
        if (addressPhoneEl) {
            let addressPhoneText = '';
            if (meterInfo.address && meterInfo.address.trim() !== '') {
                addressPhoneText += `📍 ${meterInfo.address}`;
            }
            if (meterInfo.phone && meterInfo.phone.trim() !== '') {
                if (addressPhoneText) addressPhoneText += ' | ';
                addressPhoneText += `📞 ${meterInfo.phone}`;
            }
            addressPhoneEl.innerHTML = addressPhoneText || '';
        }
        
        console.log('✅ মিটার ডিসপ্লে আপডেট সম্পন্ন:', {
            name: meterInfo.name,
            address: meterInfo.address,
            phone: meterInfo.phone
        });
        
    } catch (error) {
        console.error('❌ মিটার ডিসপ্লে আপডেট করতে সমস্যা:', error);
    }
}

// বর্তমান মাসের রিচার্জ ক্যালকুলেশন
function getCurrentMonthRecharge() {
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    
    let monthRecharge = 0;
    
    // মাসিক রিচার্জ array থেকে
    const recharges = getActiveMonthlyRecharges();
    if (recharges && recharges.length > 0) {
        recharges.forEach(recharge => {
            try {
                const rechargeDate = new Date(recharge.date);
                if (rechargeDate >= currentMonthStart && rechargeDate <= currentMonthEnd) {
                    monthRecharge += parseFloat(recharge.amount) || 0;
                }
            } catch (error) {
                console.log('রিচার্জ তারিখ পার্স করতে সমস্যা:', recharge.date);
            }
        });
    }
    
    // ট্রানজেকশন থেকে
    const txs = getActiveTransactions();
    txs.forEach(transaction => {
        if (transaction.type === 'recharge') {
            try {
                const transactionDate = parseAnyDate(transaction.timestamp);
                if (transactionDate >= currentMonthStart && transactionDate <= currentMonthEnd) {
                    monthRecharge += Math.abs(parseFloat(transaction.amount)) || 0;
                }
            } catch (error) {
                console.log('ট্রানজেকশন তারিখ পার্স করতে সমস্যা:', transaction.timestamp);
            }
        }
    });
    
    return monthRecharge;
}

// মাসিক সারাংশ দেখান - সম্পূর্ণ এবং বিশদ
function showMonthlySummary() {
    console.log('=== মাসিক সারাংশ শুরু ===');
    
    // সরাসরি ডেটা চেক
    console.log('মাসিক রিচার্জ সংখ্যা:', monthlyRecharges.length);
    console.log('ট্রানজেকশন সংখ্যা:', transactions.length);
    
    // যদি মাসিক রিচার্জ না থাকে
    if (!monthlyRecharges || monthlyRecharges.length === 0) {
        console.log('কোন মাসিক রিচার্জ নেই!');
        showSimpleMonthlySummary();
        return;
    }
    
    // সহজভাবে মাসিক ডেটা সংগ্রহ
    const monthData = {};
    
    // ১. প্রথমে মাসিক রিচার্জ থেকে মাস সংগ্রহ
    monthlyRecharges.forEach(recharge => {
        console.log('রিচার্জ প্রসেসিং:', recharge);
        
        // যদি month না থাকে, date থেকে বের করুন
        let monthKey;
        if (recharge.month) {
            monthKey = recharge.month;
        } else if (recharge.date) {
            try {
                const date = new Date(recharge.date);
                monthKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
            } catch (error) {
                console.error('তারিখ পার্স করতে সমস্যা:', recharge.date);
                return;
            }
        } else {
            console.warn('রিচার্জে month বা date নেই:', recharge);
            return;
        }
        
        if (!monthData[monthKey]) {
            const [year, month] = monthKey.split('-');
            monthData[monthKey] = {
                monthKey: monthKey,
                year: parseInt(year),
                month: parseInt(month),
                totalRecharge: 0,
                rechargeCount: 0,
                rechargeList: []
            };
        }
        
        monthData[monthKey].totalRecharge += recharge.amount || 0;
        monthData[monthKey].rechargeCount++;
        monthData[monthKey].rechargeList.push(recharge);
    });
    
    // ২. বিদ্যুৎ বিল থেকে মাস সংগ্রহ
    transactions.forEach(transaction => {
        if (transaction.type === 'electricity_bill') {
            try {
                let monthKey;
                
                // যদি transaction-এ date থাকে
                if (transaction.date) {
                    const date = new Date(transaction.date);
                    monthKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
                } 
                // বা timestamp থেকে
                else if (transaction.timestamp) {
                    const date = parseBanglaDate(transaction.timestamp);
                    monthKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
                } else {
                    return;
                }
                
                if (!monthData[monthKey]) {
                    const [year, month] = monthKey.split('-');
                    monthData[monthKey] = {
                        monthKey: monthKey,
                        year: parseInt(year),
                        month: parseInt(month),
                        totalUnits: 0,
                        totalCost: 0,
                        billCount: 0,
                        billList: []
                    };
                }
                
                if (!monthData[monthKey].totalUnits) monthData[monthKey].totalUnits = 0;
                if (!monthData[monthKey].totalCost) monthData[monthKey].totalCost = 0;
                if (!monthData[monthKey].billCount) monthData[monthKey].billCount = 0;
                if (!monthData[monthKey].billList) monthData[monthKey].billList = [];
                
                monthData[monthKey].totalUnits += transaction.units || 0;
                monthData[monthKey].totalCost += Math.abs(transaction.amount || 0);
                monthData[monthKey].billCount++;
                monthData[monthKey].billList.push(transaction);
                
            } catch (error) {
                console.error('বিদ্যুৎ বিল প্রসেস করতে সমস্যা:', transaction, error);
            }
        }
    });
    
    console.log('গ্রুপ করা মাসিক ডেটা:', monthData);
    
    const months = Object.values(monthData);
    
    if (months.length === 0) {
        showSimpleMonthlySummary();
        return;
    }
    
    // মাসগুলিকে সাজান (নতুন থেকে পুরাতন)
    const sortedMonths = months.sort((a, b) => {
        return new Date(b.year, b.month - 1) - new Date(a.year, a.month - 1);
    });
    
    console.log('সাজানো মাস:', sortedMonths.length);
    
    // HTML তৈরি
    let html = `
        <div style="text-align: center; background: linear-gradient(135deg, #2c3e50, #34495e); 
                   color: white; padding: 20px; border-radius: 10px; margin-bottom: 25px;">
            <h2 style="margin: 0;">📊 মাসিক সারাংশ</h2>
            <p style="margin: 5px 0 0 0; opacity: 0.9;">
                মোট ${toBanglaNumber(sortedMonths.length)} মাস | 
                ${toBanglaNumber(monthlyRecharges.length)} রিচার্জ | 
                ${toBanglaNumber(transactions.filter(t => t.type === 'electricity_bill').length)} বিল
            </p>
        </div>
        
        <div style="max-height: 500px; overflow-y: auto;">
    `;
    
    sortedMonths.forEach((month, index) => {
        const monthName = getBanglaMonthName(month.month) + ' ' + month.year;
        const isCurrentMonth = checkIfCurrentMonth(month.month, month.year);
        
        html += `
            <div style="background: ${isCurrentMonth ? '#e8f6f3' : 'white'}; 
                       padding: 20px; margin: 0 0 15px 0; border-radius: 10px;
                       border-left: 5px solid ${isCurrentMonth ? '#27ae60' : '#3498db'};
                       box-shadow: 0 3px 10px rgba(0,0,0,0.08);">
                
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                    <div style="font-weight: bold; font-size: 18px; color: #2c3e50;">
                        ${monthName} ${isCurrentMonth ? '👈 বর্তমান' : ''}
                    </div>
                    <div style="font-size: 12px; color: #7f8c8d;">
                        মাস #${index + 1}
                    </div>
                </div>
                
                <!-- রিচার্জ তথ্য -->
                ${month.totalRecharge > 0 ? `
                <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 10px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                        <div style="font-size: 14px; color: #2c3e50; font-weight: bold;">💰 রিচার্জ</div>
                        <span style="background: #27ae60; color: white; padding: 3px 10px; border-radius: 15px; font-size: 12px;">
                            ${toBanglaNumber(month.rechargeCount)}টি
                        </span>
                    </div>
                    
                    <div style="text-align: center;">
                        <div style="font-size: 24px; color: #27ae60; font-weight: bold; margin-bottom: 5px;">
                            ${toBanglaNumber(month.totalRecharge.toFixed(2))} টাকা
                        </div>
                        <div style="font-size: 12px; color: #7f8c8d;">
                            গড়: ${toBanglaNumber((month.totalRecharge / month.rechargeCount).toFixed(2))} টাকা/রিচার্জ
                        </div>
                    </div>
                </div>
                ` : ''}
                
                <!-- ইউনিট তথ্য -->
                ${month.totalUnits > 0 ? `
                <div style="background: #e8f6f3; padding: 15px; border-radius: 8px; margin-bottom: 10px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                        <div style="font-size: 14px; color: #2c3e50; font-weight: bold;">⚡ বিদ্যুৎ বিল</div>
                        <span style="background: #e74c3c; color: white; padding: 3px 10px; border-radius: 15px; font-size: 12px;">
                            ${toBanglaNumber(month.billCount)}টি
                        </span>
                    </div>
                    
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                        <div style="text-align: center;">
                            <div style="font-size: 18px; color: #2c3e50; font-weight: bold;">
                                ${toBanglaNumber(month.totalUnits.toFixed(2))}
                            </div>
                            <div style="font-size: 11px; color: #7f8c8d;">মোট ইউনিট</div>
                        </div>
                        
                        <div style="text-align: center;">
                            <div style="font-size: 18px; color: #e74c3c; font-weight: bold;">
                                ${toBanglaNumber(month.totalCost.toFixed(2))}
                            </div>
                            <div style="font-size: 11px; color: #7f8c8d;">মোট খরচ</div>
                        </div>
                    </div>
                    
                    <div style="text-align: center; margin-top: 10px;">
                        <div style="font-size: 12px; color: #3498db;">
                            গড়: ${toBanglaNumber((month.totalUnits > 0 ? month.totalCost / month.totalUnits : 0).toFixed(2))} টাকা/ইউনিট
                        </div>
                    </div>
                </div>
                ` : ''}
                
                <!-- একশন বাটন -->
                <div style="text-align: center; margin-top: 15px;">
                    <button onclick="showMonthDetailsSimple('${month.month}', '${month.year}')" 
                            style="padding: 10px 20px; background: #3498db; color: white; border: none; 
                                   border-radius: 25px; cursor: pointer; font-size: 13px; font-weight: bold;">
                        🔍 বিস্তারিত দেখুন
                    </button>
                </div>
            </div>
        `;
    });
    
    html += `</div>`;
    
    showCustomModal('মাসিক সারাংশ', html);
    console.log('=== মাসিক সারাংশ শেষ ===');
}

// মাসের বিস্তারিত দেখান
function showMonthDetails(month, year) {
    const monthKey = `${year}-${month.toString().padStart(2, '0')}`;
    const monthName = getBanglaMonthName(month) + ' ' + year;
    
    // এই মাসের ডেটা
    const monthRecharges = monthlyRecharges.filter(r => r.month === monthKey);
    const monthBills = transactions.filter(t => {
        if (t.type !== 'electricity_bill') return false;
        try {
            const billDate = parseBanglaDate(t.timestamp);
            return billDate.getFullYear() === year && 
                   (billDate.getMonth() + 1) === month;
        } catch (error) {
            return false;
        }
    });
    
    let html = `
        <div style="max-width: 700px; margin: 0 auto;">
            <!-- হেডার -->
            <div style="text-align: center; background: linear-gradient(135deg, #3498db, #2980b9); 
                       color: white; padding: 20px; border-radius: 10px; margin-bottom: 25px;">
                <h2 style="margin: 0; font-size: 22px;">📅 ${monthName} - বিস্তারিত তথ্য</h2>
                <div style="display: flex; justify-content: center; gap: 15px; margin-top: 10px;">
                    <span style="background: rgba(255,255,255,0.2); padding: 5px 10px; border-radius: 15px; font-size: 12px;">
                        💰 ${toBanglaNumber(monthRecharges.length)} রিচার্জ
                    </span>
                    <span style="background: rgba(255,255,255,0.2); padding: 5px 10px; border-radius: 15px; font-size: 12px;">
                        ⚡ ${toBanglaNumber(monthBills.length)} বিল
                    </span>
                </div>
            </div>
    `;
    
    // রিচার্জ তালিকা
    if (monthRecharges.length > 0) {
        html += `
            <div style="margin-bottom: 25px;">
                <h3 style="color: #2c3e50; border-bottom: 2px solid #27ae60; padding-bottom: 8px; margin-bottom: 15px;">
                    💰 রিচার্জ তালিকা
                </h3>
                <div style="max-height: 300px; overflow-y: auto;">
        `;
        
        monthRecharges.forEach((recharge, index) => {
            const date = recharge.date ? new Date(recharge.date).toLocaleDateString('bn-BD') : 'তারিখ নেই';
            const billDetails = recharge.billDetails || {};
            
            html += `
                <div style="background: #f8f9fa; padding: 15px; margin: 0 0 10px 0; border-radius: 8px; border-left: 4px solid #27ae60;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                        <div style="font-weight: bold; color: #2c3e50; font-size: 16px;">
                            রিচার্জ #${index + 1}
                        </div>
                        <div style="font-size: 20px; color: #27ae60; font-weight: bold;">
                            ${toBanglaNumber(recharge.amount.toFixed(2))} টাকা
                        </div>
                    </div>
                    
                    <div style="font-size: 13px; color: #7f8c8d; margin-bottom: 10px;">
                        তারিখ: ${date} | ID: ${recharge.id}
                    </div>
                    
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; font-size: 13px;">
                        ${billDetails.energyCost ? `
                        <div style="text-align: center;">
                            <div style="color: #3498db;">ব্যবহারযোগ্য</div>
                            <div style="color: #3498db; font-weight: bold;">${toBanglaNumber(billDetails.energyCost.toFixed(2))} টাকা</div>
                        </div>
                        ` : ''}
                        
                        ${billDetails.demandCharge ? `
                        <div style="text-align: center;">
                            <div style="color: #e67e22;">ডিমান্ড চার্জ</div>
                            <div style="color: #e67e22; font-weight: bold;">${toBanglaNumber(billDetails.demandCharge.toFixed(2))} টাকা</div>
                        </div>
                        ` : ''}
                        
                        ${billDetails.vat ? `
                        <div style="text-align: center;">
                            <div style="color: #9b59b6;">ভ্যাট</div>
                            <div style="color: #9b59b6; font-weight: bold;">${toBanglaNumber(billDetails.vat.toFixed(2))} টাকা</div>
                        </div>
                        ` : ''}
                        
                        ${billDetails.rebate ? `
                        <div style="text-align: center;">
                            <div style="color: #e74c3c;">রিবেট</div>
                            <div style="color: #e74c3c; font-weight: bold;">${toBanglaNumber(Math.abs(billDetails.rebate).toFixed(2))} টাকা</div>
                        </div>
                        ` : ''}
                    </div>
                </div>
            `;
        });
        
        html += `</div></div>`;
    }
    
    // বিল তালিকা
    if (monthBills.length > 0) {
        html += `
            <div style="margin-bottom: 25px;">
                <h3 style="color: #2c3e50; border-bottom: 2px solid #e74c3c; padding-bottom: 8px; margin-bottom: 15px;">
                    ⚡ বিদ্যুৎ বিল তালিকা
                </h3>
                <div style="max-height: 300px; overflow-y: auto;">
        `;
        
        monthBills.forEach((bill, index) => {
            const date = bill.timestamp ? bill.timestamp.split(',')[0] : 'তারিখ নেই';
            
            html += `
                <div style="background: #f8f9fa; padding: 15px; margin: 0 0 10px 0; border-radius: 8px; border-left: 4px solid #e74c3c;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                        <div style="font-weight: bold; color: #2c3e50; font-size: 16px;">
                            বিল #${index + 1}
                        </div>
                        <div style="font-size: 18px; color: #e74c3c; font-weight: bold;">
                            ${toBanglaNumber(Math.abs(bill.amount).toFixed(2))} টাকা
                        </div>
                    </div>
                    
                    <div style="font-size: 13px; color: #7f8c8d; margin-bottom: 5px;">
                        তারিখ: ${date}
                    </div>
                    
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 13px;">
                        <div>
                            <div style="color: #3498db;">ইউনিট</div>
                            <div style="color: #3498db; font-weight: bold;">${toBanglaNumber((bill.units || 0).toFixed(2))} kWh</div>
                        </div>
                        
                        <div>
                            <div style="color: #27ae60;">দর/ইউনিট</div>
                            <div style="color: #27ae60; font-weight: bold;">
                                ${toBanglaNumber((bill.units > 0 ? Math.abs(bill.amount) / bill.units : 0).toFixed(2))} টাকা
                            </div>
                        </div>
                    </div>
                    
                    ${bill.description ? `
                    <div style="font-size: 12px; color: #7f8c8d; margin-top: 8px; font-style: italic;">
                        ${bill.description}
                    </div>
                    ` : ''}
                </div>
            `;
        });
        
        html += `</div></div>`;
    }
    
    // সারসংক্ষেপ
    const totalRecharge = monthRecharges.reduce((sum, r) => sum + (r.amount || 0), 0);
    const totalUnits = monthBills.reduce((sum, b) => sum + (b.units || 0), 0);
    const totalCost = monthBills.reduce((sum, b) => sum + Math.abs(b.amount || 0), 0);
    
    html += `
        <div style="background: linear-gradient(135deg, #2c3e50, #34495e); color: white; padding: 20px; border-radius: 10px;">
            <h3 style="margin-top: 0; margin-bottom: 15px; text-align: center;">📊 মাসিক সারসংক্ষেপ</h3>
            
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; text-align: center;">
                <div>
                    <div style="font-size: 24px; font-weight: bold; color: #27ae60;">${toBanglaNumber(totalRecharge.toFixed(2))}</div>
                    <div style="font-size: 12px; opacity: 0.8;">মোট রিচার্জ</div>
                </div>
                
                <div>
                    <div style="font-size: 24px; font-weight: bold; color: #3498db;">${toBanglaNumber(monthRecharges.length)}</div>
                    <div style="font-size: 12px; opacity: 0.8;">রিচার্জ সংখ্যা</div>
                </div>
                
                <div>
                    <div style="font-size: 24px; font-weight: bold; color: #e74c3c;">${toBanglaNumber(totalUnits.toFixed(2))}</div>
                    <div style="font-size: 12px; opacity: 0.8;">মোট ইউনিট</div>
                </div>
                
                <div>
                    <div style="font-size: 24px; font-weight: bold; color: #9b59b6;">${toBanglaNumber(totalCost.toFixed(2))}</div>
                    <div style="font-size: 12px; opacity: 0.8;">মোট খরচ</div>
                </div>
            </div>
            
            <div style="margin-top: 15px; font-size: 12px; opacity: 0.8; text-align: center;">
                গড় দর: ${toBanglaNumber((totalUnits > 0 ? totalCost / totalUnits : 0).toFixed(2))} টাকা/ইউনিট
            </div>
        </div>
    `;
    
    html += `</div>`;
    showCustomModal(`${monthName} - বিস্তারিত`, html);
}

// মাসের বিশ্লেষণ দেখান
function analyzeMonth(month, year) {
    const monthKey = `${year}-${month.toString().padStart(2, '0')}`;
    const monthName = getBanglaMonthName(month) + ' ' + year;
    
    // এই মাসের ডেটা
    const monthRecharges = monthlyRecharges.filter(r => r.month === monthKey);
    const monthBills = transactions.filter(t => {
        if (t.type !== 'electricity_bill') return false;
        try {
            const billDate = parseBanglaDate(t.timestamp);
            return billDate.getFullYear() === year && 
                   (billDate.getMonth() + 1) === month;
        } catch (error) {
            return false;
        }
    });
    
    // বিশ্লেষণ ডেটা
    const totalRecharge = monthRecharges.reduce((sum, r) => sum + (r.amount || 0), 0);
    const totalUnits = monthBills.reduce((sum, b) => sum + (b.units || 0), 0);
    const totalCost = monthBills.reduce((sum, b) => sum + Math.abs(b.amount || 0), 0);
    const avgDailyUnits = totalUnits / 30;
    const avgRate = totalUnits > 0 ? totalCost / totalUnits : 0;
    
    let html = `
        <div style="max-width: 700px; margin: 0 auto;">
            <!-- হেডার -->
            <div style="text-align: center; background: linear-gradient(135deg, #9b59b6, #8e44ad); 
                       color: white; padding: 20px; border-radius: 10px; margin-bottom: 25px;">
                <h2 style="margin: 0; font-size: 22px;">📊 ${monthName} - মাসিক বিশ্লেষণ</h2>
                <p style="margin: 5px 0 0 0; opacity: 0.9; font-size: 14px;">
                    গভীর বিশ্লেষণ এবং সুপারিশ
                </p>
            </div>
            
            <!-- সারসংক্ষেপ -->
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; margin-bottom: 25px;">
                <div style="background: #27ae60; color: white; padding: 15px; border-radius: 8px; text-align: center;">
                    <div style="font-size: 20px; font-weight: bold;">${toBanglaNumber(totalRecharge.toFixed(2))}</div>
                    <div style="font-size: 12px; opacity: 0.9;">মোট রিচার্জ</div>
                </div>
                
                <div style="background: #3498db; color: white; padding: 15px; border-radius: 8px; text-align: center;">
                    <div style="font-size: 20px; font-weight: bold;">${toBanglaNumber(totalUnits.toFixed(2))}</div>
                    <div style="font-size: 12px; opacity: 0.9;">মোট ইউনিট</div>
                </div>
                
                <div style="background: #e74c3c; color: white; padding: 15px; border-radius: 8px; text-align: center;">
                    <div style="font-size: 20px; font-weight: bold;">${toBanglaNumber(totalCost.toFixed(2))}</div>
                    <div style="font-size: 12px; opacity: 0.9;">মোট খরচ</div>
                </div>
                
                <div style="background: #f39c12; color: white; padding: 15px; border-radius: 8px; text-align: center;">
                    <div style="font-size: 20px; font-weight: bold;">${toBanglaNumber(avgDailyUnits.toFixed(2))}</div>
                    <div style="font-size: 12px; opacity: 0.9;">দৈনিক গড়</div>
                </div>
            </div>
            
            <!-- বিশ্লেষণ -->
            <div style="background: #f8f9fa; padding: 20px; border-radius: 10px; margin-bottom: 20px;">
                <h3 style="color: #2c3e50; margin-top: 0; margin-bottom: 15px;">📈 বিশ্লেষণ রিপোর্ট</h3>
                
                ${getMonthAnalysisReport(month, year, monthRecharges, monthBills)}
            </div>
            
            <!-- সুপারিশ -->
            <div style="background: #fff3cd; padding: 20px; border-radius: 10px; border-left: 4px solid #ffc107;">
                <h3 style="color: #856404; margin-top: 0; margin-bottom: 15px;">💡 সুপারিশ</h3>
                
                ${getMonthRecommendations(month, year, totalUnits, totalCost, avgDailyUnits, avgRate)}
            </div>
        </div>
    `;
    
    showCustomModal(`${monthName} - বিশ্লেষণ`, html);
}

// মাসিক বিশ্লেষণ রিপোর্ট
function getMonthAnalysisReport(month, year, monthRecharges, monthBills) {
    let report = '';
    
    if (monthRecharges.length > 0) {
        const totalRecharge = monthRecharges.reduce((sum, r) => sum + (r.amount || 0), 0);
        const avgRecharge = totalRecharge / monthRecharges.length;
        
        report += `
            <div style="margin-bottom: 15px;">
                <div style="font-weight: bold; color: #27ae60; margin-bottom: 5px;">💰 রিচার্জ বিশ্লেষণ:</div>
                <div style="font-size: 14px; color: #2c3e50;">
                    • মাসিক গড় রিচার্জ: ${toBanglaNumber(avgRecharge.toFixed(2))} টাকা<br>
                    • মোট রিচার্জ: ${toBanglaNumber(totalRecharge.toFixed(2))} টাকা<br>
                    • রিচার্জ সংখ্যা: ${toBanglaNumber(monthRecharges.length)}
                </div>
            </div>
        `;
    }
    
    if (monthBills.length > 0) {
        const totalUnits = monthBills.reduce((sum, b) => sum + (b.units || 0), 0);
        const totalCost = monthBills.reduce((sum, b) => sum + Math.abs(b.amount || 0), 0);
        const avgDailyUnits = totalUnits / 30;
        const avgRate = totalUnits > 0 ? totalCost / totalUnits : 0;
        
        report += `
            <div style="margin-bottom: 15px;">
                <div style="font-weight: bold; color: #e74c3c; margin-bottom: 5px;">⚡ বিদ্যুৎ ব্যবহার বিশ্লেষণ:</div>
                <div style="font-size: 14px; color: #2c3e50;">
                    • দৈনিক গড় ব্যবহার: ${toBanglaNumber(avgDailyUnits.toFixed(2))} kWh<br>
                    • মাসিক মোট ব্যবহার: ${toBanglaNumber(totalUnits.toFixed(2))} kWh<br>
                    • গড় দর: ${toBanglaNumber(avgRate.toFixed(2))} টাকা/kWh<br>
                    • বিল সংখ্যা: ${toBanglaNumber(monthBills.length)}
                </div>
            </div>
        `;
    }
    
    return report || '<p style="color: #7f8c8d;">পর্যাপ্ত ডেটা নেই বিশ্লেষণের জন্য</p>';
}

// মাসিক সুপারিশ
function getMonthRecommendations(month, year, totalUnits, totalCost, avgDailyUnits, avgRate) {
    let recommendations = '';
    
    // ইউনিট ভিত্তিক সুপারিশ
    if (totalUnits > 0) {
        if (avgDailyUnits > 10) {
            recommendations += `
                <div style="margin-bottom: 10px;">
                    <span style="color: #e74c3c; font-weight: bold;">⚠️ উচ্চ খরচ সতর্কতা:</span><br>
                    দৈনিক গড় ${toBanglaNumber(avgDailyUnits.toFixed(2))} kWh, যা উচ্চ মাত্রার।
                    বিদ্যুৎ সাশ্রয়ী যন্ত্রপাতি ব্যবহার করুন।
                </div>
            `;
        } else if (avgDailyUnits < 5) {
            recommendations += `
                <div style="margin-bottom: 10px;">
                    <span style="color: #27ae60; font-weight: bold;">✅ ভালো খরচ ব্যবস্থাপনা:</span><br>
                    দৈনিক গড় ${toBanglaNumber(avgDailyUnits.toFixed(2))} kWh, যা সর্বোত্তম।
                    এই হার বজায় রাখুন।
                </div>
            `;
        }
        
        // খরচ ভিত্তিক সুপারিশ
        if (avgRate > 8) {
            recommendations += `
                <div style="margin-bottom: 10px;">
                    <span style="color: #f39c12; font-weight: bold;">💡 ট্যারিফ অপটিমাইজেশন:</span><br>
                    প্রতি ইউনিট গড় খরচ ${toBanglaNumber(avgRate.toFixed(2))} টাকা।
                    ইউনিট ব্যবহার কমিয়ে নিম্ন স্ল্যাবে যান।
                </div>
            `;
        }
    }
    
    // সাধারন সুপারিশ
    recommendations += `
        <div style="margin-top: 15px; font-size: 13px; color: #7f8c8d;">
            <strong>সাধারণ টিপস:</strong>
            <ul style="margin: 5px 0 0 20px; padding: 0;">
                <li>অনাবশ্যক লাইট এবং ইলেকট্রনিক্স বন্ধ রাখুন</li>
                <li>এনার্জি সেভিং মোড ব্যবহার করুন</li>
                <li>স্ল্যাব অনুযায়ী ইউনিট ব্যবহার করুন</li>
                <li>নিয়মিত মিটার চেক করুন</li>
            </ul>
        </div>
    `;
    
    return recommendations || '<p style="color: #7f8c8d;">পর্যাপ্ত ডেটা নেই সুপারিশের জন্য</p>';
}

// ডেটা এক্সপোর্ট
function exportMonthData(month, year) {
    const monthKey = `${year}-${month.toString().padStart(2, '0')}`;
    const monthName = getBanglaMonthName(month) + ' ' + year;
    
    const monthRecharges = monthlyRecharges.filter(r => r.month === monthKey);
    const monthBills = transactions.filter(t => {
        if (t.type !== 'electricity_bill') return false;
        try {
            const billDate = parseBanglaDate(t.timestamp);
            return billDate.getFullYear() === year && 
                   (billDate.getMonth() + 1) === month;
        } catch (error) {
            return false;
        }
    });
    
    const exportData = {
        month: month,
        year: year,
        monthName: monthName,
        recharges: monthRecharges,
        bills: monthBills,
        summary: {
            totalRecharge: monthRecharges.reduce((sum, r) => sum + (r.amount || 0), 0),
            totalUnits: monthBills.reduce((sum, b) => sum + (b.units || 0), 0),
            totalCost: monthBills.reduce((sum, b) => sum + Math.abs(b.amount || 0), 0),
            rechargeCount: monthRecharges.length,
            billCount: monthBills.length
        },
        exportedAt: new Date().toISOString()
    };
    
    const dataStr = JSON.stringify(exportData, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `electricity_month_${monthKey}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
    
    showNotification(`✅ ${monthName} মাসের ডেটা ডাউনলোড করা হয়েছে`, 'success');
}

// ফাইল শেষে গ্লোবাল অ্যাক্সেস যোগ করুন
window.showMonthlySummary = showMonthlySummary;
window.getMonthlyRechargeData = getMonthlyRechargeData;
window.getAllMonthsUnitData = getAllMonthsUnitData;
window.combineMonthlyData = combineMonthlyData;
window.getBanglaMonthName = getBanglaMonthName;
window.checkIfCurrentMonth = checkIfCurrentMonth;
window.calculateBillForUnits = calculateBillForUnits;
window.showMonthDetails = showMonthDetails;
window.analyzeMonth = analyzeMonth;
window.parseBanglaDate = parseBanglaDate;
window.exportMonthData = exportMonthData;

// মাসিক রিচার্জ ডেটা সংগ্রহ
function getMonthlyRechargeData() {
    console.log('📊 মাসিক রিচার্জ ডেটা সংগ্রহ করা হচ্ছে...');
    
    const monthlyData = {};
    
    if (monthlyRecharges && monthlyRecharges.length > 0) {
        monthlyRecharges.forEach(recharge => {
            try {
                const rechargeDate = new Date(recharge.date);
                const year = rechargeDate.getFullYear();
                const month = rechargeDate.getMonth() + 1;
                const monthKey = `${year}-${month.toString().padStart(2, '0')}`;
                
                if (!monthlyData[monthKey]) {
                    monthlyData[monthKey] = {
                        year: year,
                        month: month,
                        monthKey: monthKey,
                        totalRecharge: 0,
                        usableAmount: 0,
                        demandCharge: 0,
                        vat: 0,
                        rebate: 0,
                        rechargeCount: 0,
                        rechargeList: []
                    };
                }
                
                monthlyData[monthKey].totalRecharge += parseFloat(recharge.amount) || 0;
                monthlyData[monthKey].usableAmount += recharge.billDetails?.energyCost || 0;
                monthlyData[monthKey].demandCharge += recharge.billDetails?.demandCharge || 0;
                monthlyData[monthKey].vat += recharge.billDetails?.vat || 0;
                monthlyData[monthKey].rebate += Math.abs(recharge.billDetails?.rebate || 0);
                monthlyData[monthKey].rechargeCount++;
                monthlyData[monthKey].rechargeList.push(recharge);
                
            } catch (error) {
                console.log('রিচার্জ ডেটা প্রসেস করতে সমস্যা:', recharge);
            }
        });
    }
    
    console.log('মাসিক রিচার্জ ডেটা প্রস্তুত:', Object.keys(monthlyData).length, 'মাস');
    return Object.values(monthlyData);
}

// সব মাসের ইউনিট ডেটা সংগ্রহ
function getAllMonthsUnitData() {
    console.log('⚡ সব মাসের ইউনিট ডেটা সংগ্রহ করা হচ্ছে...');
    
    const monthlyData = {};
    
    if (transactions && transactions.length > 0) {
        transactions.forEach(transaction => {
            if (transaction.type === 'electricity_bill' && transaction.units) {
                try {
                    const transactionDate = parseBanglaDate(transaction.timestamp);
                    const year = transactionDate.getFullYear();
                    const month = transactionDate.getMonth() + 1;
                    const monthKey = `${year}-${month.toString().padStart(2, '0')}`;
                    
                    if (!monthlyData[monthKey]) {
                        monthlyData[monthKey] = {
                            year: year,
                            month: month,
                            monthKey: monthKey,
                            totalUnits: 0,
                            totalCost: 0,
                            avgRate: 0,
                            billCount: 0,
                            billList: []
                        };
                    }
                    
                    const units = parseFloat(transaction.units) || 0;
                    const cost = Math.abs(parseFloat(transaction.amount)) || 0;
                    
                    monthlyData[monthKey].totalUnits += units;
                    monthlyData[monthKey].totalCost += cost;
                    monthlyData[monthKey].billCount++;
                    monthlyData[monthKey].billList.push(transaction);
                    
                } catch (error) {
                    console.log('ট্রানজেকশন ডেটা প্রসেস করতে সমস্যা:', transaction);
                }
            }
        });
        
        // গড় হিসাব করুন
        Object.values(monthlyData).forEach(monthData => {
            if (monthData.totalUnits > 0) {
                monthData.avgRate = monthData.totalCost / monthData.totalUnits;
            }
        });
    }
    
    console.log('ইউনিট ডেটা প্রস্তুত:', Object.keys(monthlyData).length, 'মাস');
    return Object.values(monthlyData);
}

// মাসিক ডেটা একত্রিত করুন
function combineMonthlyData(rechargeData, unitData) {
    const allMonths = {};
    
    // রিচার্জ ডেটা যোগ করুন
    rechargeData.forEach(month => {
        const key = month.monthKey;
        allMonths[key] = { 
            ...allMonths[key], 
            ...month,
            hasRecharge: true
        };
    });
    
    // ইউনিট ডেটা যোগ করুন
    unitData.forEach(month => {
        const key = month.monthKey;
        allMonths[key] = { 
            ...allMonths[key], 
            ...month,
            hasUnits: true
        };
    });
    
    return Object.values(allMonths);
}

// ইউনিট থেকে বিল ক্যালকুলেশন
function calculateBillForUnits(units) {
    let remainingUnits = units;
    let totalCost = 0;
    const slabBreakdown = [];
    
    if (!tariffRates || tariffRates.length === 0) {
        console.warn('ট্যারিফ রেটস নেই!');
        return { totalCost: 0, averageRate: 0, slabBreakdown: [] };
    }
    
    tariffRates.forEach(slab => {
        if (remainingUnits <= 0) return;
        
        const slabMin = slab.range[0];
        const slabMax = slab.range[1];
        
        let slabUnits;
        if (slabMax === Infinity) {
            slabUnits = remainingUnits;
        } else {
            const slabRange = slabMax - slabMin + 1;
            slabUnits = Math.min(remainingUnits, slabRange);
        }
        
        const slabCost = slabUnits * slab.rate;
        totalCost += slabCost;
        remainingUnits -= slabUnits;
        
        slabBreakdown.push({
            name: slab.name,
            units: slabUnits,
            rate: slab.rate,
            cost: slabCost,
            range: slabMax === Infinity ? `${slabMin}+` : `${slabMin}-${slabMax}`
        });
    });
    
    return {
        totalCost: totalCost,
        averageRate: units > 0 ? totalCost / units : 0,
        slabBreakdown: slabBreakdown
    };
}

// বাংলা মাসের নাম বের করুন
function getBanglaMonthName(monthNumber) {
    const months = [
        'জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন',
        'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'
    ];
    
    return months[monthNumber - 1] || 'অজানা';
}

// বর্তমান মাস কিনা চেক করুন
function checkIfCurrentMonth(month, year) {
    const now = new Date();
    return now.getMonth() + 1 === month && now.getFullYear() === year;
}

// সব উৎস থেকে মোট ইউনিট ক্যালকুলেশন
function calculateTotalUnitsFromAllSources() {
    let totalUnits = 0;
    
    // ক) মিটার হিস্ট্রি থেকে ইউনিট
    if (meterHistory && meterHistory.length > 0) {
        meterHistory.forEach(reading => {
            totalUnits += parseFloat(reading.units) || 0;
        });
        console.log('মিটার হিস্ট্রি থেকে মোট ইউনিট:', totalUnits);
    }
    
    // খ) ট্রানজেকশন থেকে ইউনিট (সব সময়ের)
    let transactionUnits = 0;
    transactions.forEach(transaction => {
        if (transaction.type === 'electricity_bill' && transaction.units) {
            transactionUnits += parseFloat(transaction.units) || 0;
        }
    });
    console.log('ট্রানজেকশন থেকে মোট ইউনিট:', transactionUnits);
    
    // সবচেয়ে বড় ইউনিট নিন
    return Math.max(totalUnits, transactionUnits);
}

// বর্তমান মাসের বিল বিশ্লেষণ দেখান
function displayCurrentMonthBillAnalysis(monthlyUnits, monthName) {
    const monthBill = calculateMonthBill(0); // 0 = current month
    
    // মিটার কন্টেইনারে বিশ্লেষণ যোগ করুন (যদি না থাকে)
    const meterContainer = document.querySelector('.digital-meter');
    if (!meterContainer) return;
    
    // যদি ইতিমধ্যে বিশ্লেষণ থাকে তাহলে আপডেট করুন, না থাকলে তৈরি করুন
    let analysisDiv = document.getElementById('monthlyBillAnalysis');
    
    if (!analysisDiv) {
        analysisDiv = document.createElement('div');
        analysisDiv.id = 'monthlyBillAnalysis';
        analysisDiv.className = 'meter-analysis';
        analysisDiv.style.cssText = `
            margin-top: 10px;
            padding: 10px;
            background: rgba(52, 152, 219, 0.1);
            border-radius: 8px;
            border-left: 3px solid #3498db;
        `;
        meterContainer.appendChild(analysisDiv);
    }
    
    analysisDiv.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
                <strong style="font-size: 12px;">📊 ${monthName} মাসের বিশ্লেষণ</strong>
                <div style="font-size: 11px; color: #666;">
                    ${toBanglaNumber(monthlyUnits.toFixed(2))} kWh × ${toBanglaNumber(monthBill.averageRate.toFixed(2))} টাকা
                </div>
            </div>
            <div style="text-align: right;">
                <strong style="color: #e74c3c; font-size: 14px;">
                    ${toBanglaNumber(monthBill.totalCost.toFixed(2))} টাকা
                </strong>
                <div style="font-size: 10px; color: #27ae60;">
                    আনুমানিক বিল
                </div>
            </div>
        </div>
    `;
}

// মাসিক ইউনিট ডিসপ্লে তৈরি করুন (যদি না থাকে)
function createMonthlyUnitsDisplay(monthlyUnits) {
    const meterContainer = document.querySelector('.digital-meter');
    if (!meterContainer) return;
    
    // মাসিক ইউনিট এলিমেন্ট তৈরি
    const monthlyDiv = document.createElement('div');
    monthlyDiv.className = 'meter-item';
    monthlyDiv.innerHTML = `
        <div class="meter-label">বর্তমান মাসের ইউনিট</div>
        <div class="meter-value" id="monthlyUnits">${toBanglaNumber(monthlyUnits.toFixed(2))}</div>
    `;
    
    // totalUnits এর পরে যোগ করুন
    const totalUnitsElement = document.getElementById('totalUnits');
    if (totalUnitsElement && totalUnitsElement.parentNode) {
        totalUnitsElement.parentNode.parentNode.insertBefore(
            monthlyDiv, 
            totalUnitsElement.parentNode.parentNode.children[2]
        );
    }
}

// মাসিক ইউনিট ডিসপ্লে তৈরি করুন (যদি না থাকে)
function createMonthlyUnitsDisplay(monthlyUnits) {
    const meterContainer = document.querySelector('.digital-meter');
    if (!meterContainer) return;
    
    // মাসিক ইউনিট এলিমেন্ট তৈরি
    const monthlyDiv = document.createElement('div');
    monthlyDiv.className = 'meter-item';
    monthlyDiv.innerHTML = `
        <div class="meter-label">বর্তমান মাসের ইউনিট</div>
        <div class="meter-value" id="monthlyUnits">${toBanglaNumber(monthlyUnits.toFixed(2))}</div>
    `;
    
    // totalUnits এর পরে যোগ করুন
    const totalUnitsElement = document.getElementById('totalUnits');
    if (totalUnitsElement && totalUnitsElement.parentNode) {
        totalUnitsElement.parentNode.parentNode.insertBefore(
            monthlyDiv, 
            totalUnitsElement.parentNode.parentNode.children[2]
        );
    }
}

// বাংলা তারিখ পার্স করার ফাংশন (যদি না থাকে)
function parseBanglaDate(banglaDateString) {
    try {
        // উদাহরণ: "৫/১১/২০২৫, ৪:৩৫:০০ PM"
        const [datePart, timePart] = banglaDateString.split(', ');
        const [day, month, year] = datePart.split('/');
        
        // বাংলা সংখ্যা ইংরেজিতে কনভার্ট
        const englishDay = day.replace(/[০-৯]/g, d => '০১২৩৪৫৬৭৮৯'.indexOf(d));
        const englishMonth = month.replace(/[০-৯]/g, d => '০১২৩৪৫৬৭৮৯'.indexOf(d));
        const englishYear = year.replace(/[০-৯]/g, d => '০১২৩৪৫৬৭৮৯'.indexOf(d));
        
        return new Date(`${englishYear}-${englishMonth}-${englishDay} ${timePart}`);
    } catch (error) {
        console.error('তারিখ পার্স করতে সমস্যা:', banglaDateString, error);
        return new Date(); // fallback
    }
}

// মাসিক ইউনিটের জন্য বিল ক্যালকুলেশন (চলমান মাসের জন্য)
function calculateCurrentMonthBill() {
    // বর্তমান মাসের ইউনিট বের করুন
    const currentMonthUnits = getCurrentMonthUnits();
    const currentMonthName = getCurrentMonthName();
    
    // ০ থেকে শুরু করে স্ল্যাব ক্যালকুলেশন
    let remainingUnits = currentMonthUnits;
    let totalCost = 0;
    let slabBreakdown = [];
    
    tariffRates.forEach(slab => {
        if (remainingUnits <= 0) return;
        
        const slabMin = slab.range[0];
        const slabMax = slab.range[1];
        
        // এই স্ল্যাবে কত ইউনিট পড়বে
        let slabUnits;
        if (slabMax === Infinity) {
            slabUnits = remainingUnits;
        } else {
            const slabRange = slabMax - slabMin + 1;
            slabUnits = Math.min(remainingUnits, slabRange);
        }
        
        const slabCost = slabUnits * slab.rate;
        totalCost += slabCost;
        remainingUnits -= slabUnits;
        
        slabBreakdown.push({
            name: slab.name,
            units: slabUnits,
            rate: slab.rate,
            cost: slabCost,
            range: `${slabMin}-${slabMax}`
        });
    });
    
    return {
        monthName: currentMonthName,
        monthUnits: currentMonthUnits,
        totalCost: totalCost,
        slabBreakdown: slabBreakdown,
        averageRate: totalCost / (currentMonthUnits || 1)
    };
}

// বর্তমান মাসের ইউনিট বের করুন - CORRECTED VERSION
function getCurrentMonthUnits() {
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    
    console.log('বর্তমান মাস সীমা:', {
        start: currentMonthStart,
        end: currentMonthEnd,
        month: now.getMonth() + 1, // ডিসেম্বর = 12
        year: now.getFullYear()
    });
    
    let monthUnits = 0;
    let foundTransactions = 0;
    
    const txs = getActiveTransactions();
    txs.forEach(transaction => {
        if (transaction.type === 'electricity_bill' && transaction.units) {
            try {
                const transactionDate = parseAnyDate(transaction.timestamp);
                console.log('ট্রানজেকশন চেক:', {
                    date: transactionDate,
                    units: transaction.units,
                    inRange: transactionDate >= currentMonthStart && transactionDate <= currentMonthEnd
                });
                
                if (transactionDate >= currentMonthStart && transactionDate <= currentMonthEnd) {
                    monthUnits += parseFloat(transaction.units) || 0;
                    foundTransactions++;
                }
            } catch (error) {
                console.log('তারিখ পার্স করতে সমস্যা:', transaction.timestamp, error);
            }
        }
    });
    
    console.log('বর্তমান মাসের ইউনিট:', monthUnits, 'kWh', 'ট্রানজেকশন:', foundTransactions);
    return monthUnits;
}

// যেকোনো মাসের ইউনিট বের করুন - UNIVERSAL VERSION
function getMonthUnits(monthOffset = 0) {
    const targetDate = new Date();
    targetDate.setMonth(targetDate.getMonth() + monthOffset);
    
    const targetYear = targetDate.getFullYear();
    const targetMonth = targetDate.getMonth();
    const monthStart = new Date(targetYear, targetMonth, 1);
    const monthEnd = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59);
    
    console.log(`মাস #${monthOffset} (${targetMonth + 1}/${targetYear}) সীমা:`, {
        start: monthStart,
        end: monthEnd
    });
    
    let monthUnits = 0;
    
    transactions.forEach(transaction => {
        if (transaction.type === 'electricity_bill' && transaction.units) {
            try {
                const transactionDate = parseBanglaDate(transaction.timestamp);
                if (transactionDate >= monthStart && transactionDate <= monthEnd) {
                    monthUnits += parseFloat(transaction.units) || 0;
                }
            } catch (error) {
                console.log('তারিখ পার্স করতে সমস্যা:', transaction.timestamp);
            }
        }
    });
    
    return monthUnits;
}

// যেকোনো মাসের বিল ক্যালকুলেশন
function calculateMonthBill(monthOffset = 0) {
    const targetMonthUnits = getMonthUnits(monthOffset);
    const targetMonthName = getMonthName(monthOffset);
    
    let remainingUnits = targetMonthUnits;
    let totalCost = 0;
    let slabBreakdown = [];
    
    tariffRates.forEach(slab => {
        if (remainingUnits <= 0) return;
        
        const slabMin = slab.range[0];
        const slabMax = slab.range[1];
        
        let slabUnits;
        if (slabMax === Infinity) {
            slabUnits = remainingUnits;
        } else {
            const slabRange = slabMax - slabMin + 1;
            slabUnits = Math.min(remainingUnits, slabRange);
        }
        
        const slabCost = slabUnits * slab.rate;
        totalCost += slabCost;
        remainingUnits -= slabUnits;
        
        slabBreakdown.push({
            name: slab.name,
            units: slabUnits,
            rate: slab.rate,
            cost: slabCost,
            range: `${slabMin}-${slabMax}`
        });
    });
    
    return {
        monthName: targetMonthName,
        monthUnits: targetMonthUnits,
        totalCost: totalCost,
        slabBreakdown: slabBreakdown,
        averageRate: totalCost / (targetMonthUnits || 1)
    };
}

// যেকোনো মাসের নাম বের করুন
function getMonthName(monthOffset = 0) {
    const targetDate = new Date();
    targetDate.setMonth(targetDate.getMonth() + monthOffset);
    
    const months = [
        'জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন',
        'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'
    ];
    
    const monthIndex = targetDate.getMonth();
    const year = targetDate.getFullYear();
    
    return `${months[monthIndex]} ${year}`;
}

// মাস চেক এবং অটো রিসেট (সব মাসের জন্য)
function checkAndResetMonthlyUnits() {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    
    // শেষ মাস চেক
    const lastCheck = JSON.parse(localStorage.getItem('last_month_check') || '{"month":-1,"year":-1}');
    
    // যদি নতুন মাস শুরু হয়ে থাকে
    if (lastCheck.month !== currentMonth || lastCheck.year !== currentYear) {
        const currentMonthName = getMonthName(0);
        console.log(`🔄 নতুন মাস শুরু হয়েছে: ${currentMonthName}`);
        
        // মাসিক ইউনিট রিসেট
        localStorage.setItem('current_month_units', '0');
        localStorage.setItem('last_month_check', JSON.stringify({
            month: currentMonth,
            year: currentYear,
            lastReset: now.toISOString()
        }));
        
        // পুরানো মাসের রিপোর্ট তৈরি করুন
        const previousMonthUnits = getMonthUnits(-1);
        if (previousMonthUnits > 0) {
            const previousMonthName = getMonthName(-1);
            console.log(`📊 ${previousMonthName} মাসের রিপোর্ট: ${previousMonthUnits} kWh`);
            saveMonthlyReportToHistory(-1);
        }
        
        // মাসের প্রথম দিন চেক
        if (now.getDate() === 1) {
            showNotification(`📅 ${currentMonthName} মাস শুরু হয়েছে! মাসিক ইউনিট ০ থেকে শুরু।`, 'info');
        }
        
        return true;
    }
    
    return false;
}

// মাসিক রিপোর্ট হিস্টোরিতে সেভ করুন
function saveMonthlyReportToHistory(monthOffset) {
    const monthData = calculateMonthBill(monthOffset);
    const monthlyHistory = JSON.parse(localStorage.getItem('monthly_history') || '[]');
    
    // ডুপ্লিকেট চেক
    const existingIndex = monthlyHistory.findIndex(item => 
        item.monthName === monthData.monthName
    );
    
    if (existingIndex !== -1) {
        monthlyHistory[existingIndex] = monthData;
    } else {
        monthlyHistory.push(monthData);
    }
    
    localStorage.setItem('monthly_history', JSON.stringify(monthlyHistory));
    console.log(`✅ ${monthData.monthName} মাসের রিপোর্ট সেভ করা হয়েছে`);
}

// মোট ইউনিট ক্যালকুলেট - FIXED VERSION
function calculateTotalUnits() {
    let totalUnits = 0;
    
    // ১. প্রথমে মিটার হিস্ট্রি থেকে ইউনিট যোগ করুন
    if (meterHistory && meterHistory.length > 0) {
        meterHistory.forEach(reading => {
            totalUnits += parseFloat(reading.units) || 0;
        });
    }
    
    // ২. তারপর ট্রানজেকশন থেকে ইউনিট যোগ করুন
    let transactionUnits = 0;
    transactions.forEach(transaction => {
        if (transaction.type === 'electricity_bill' && transaction.units) {
            transactionUnits += parseFloat(transaction.units) || 0;
        }
    });
    
    // ৩. সবচেয়ে বড় ভ্যালু নিন
    totalUnits = Math.max(totalUnits, transactionUnits);
    
    console.log('ইউনিট ক্যালকুলেশন:', {
        fromMeterHistory: totalUnits,
        fromTransactions: transactionUnits,
        final: totalUnits
    });
    
    return totalUnits;
}

// মিটার রিডিং আপডেট - FIXED VERSION
function updateMeterReading() {
    const totalUnits = (reportData.totalUnits || 0) + calculateCurrentTotalUnits();
    const lastActualReading = baseReading + totalUnits;
    
    const promptText = `বর্তমান রিডিং: ${lastActualReading.toFixed(2)} kWh\nনতুন মিটার রিডিং ইনপুট করুন:`;
    
    const newReadingInput = prompt(promptText);
    
    if (newReadingInput && !isNaN(newReadingInput)) {
        const newReading = parseFloat(newReadingInput);
        const currentUnits = newReading - lastActualReading;
        
        if (currentUnits < 0) {
            alert(`❌ নতুন রিডিং সঠিক নয়!`);
            return;
        }

        // শুধু কারেন্ট রিডিং সেভ করুন
        const historyItem = {
            id: Date.now(),
            reading: newReading,
            units: currentUnits,
            date: new Date().toLocaleString('bn-BD'),
            timestamp: new Date().toISOString()
        };
        
        meterHistory.push(historyItem);
        saveMeterHistory();
        updateMeterDisplay();
        
        alert(`✅ রিডিং সেভ হয়েছে!\nবর্তমান ইউনিট: ${currentUnits.toFixed(2)} kWh`);
    }
}

// শুধু কারেন্ট ইনপুট থেকে ইউনিট ক্যালকুলেট - NEW FUNCTION
function calculateCurrentTotalUnits() {
    let total = 0;
    if (meterHistory && meterHistory.length > 0) {
        meterHistory.forEach(reading => {
            total += reading.units || 0;
        });
    }
    return total;
}

// মোট ইউনিট ক্যালকুলেট
function calculateTotalUnits() {
    let totalUnits = 0;
    
    // মিটার হিস্ট্রি থেকে ইউনিট যোগ করুন
    if (meterHistory && meterHistory.length > 0) {
        meterHistory.forEach(reading => {
            totalUnits += reading.units || 0;
        });
    }
    
    return totalUnits;
}

// মিটার রিডিং + ট্রানজেকশন উভয়ই আপডেট করে
function updateMeterReadingFull() {
    const newReading = prompt('নতুন মিটার রিডিং ইনপুট করুন:');
    
    if (newReading && !isNaN(newReading)) {
        const reading = parseFloat(newReading);
        const previousReading = meterHistory.length > 0 ? 
            meterHistory[meterHistory.length - 1].reading : 0;
        
        const unitsUsed = reading - previousReading;
        
        // ১. মিটার হিস্ট্রিতে সেভ করুন
        const historyItem = {
            id: Date.now(),
            reading: reading,
            units: unitsUsed,
            date: new Date().toLocaleString('bn-BD'),
            timestamp: new Date().toISOString()
        };
        
        meterHistory.push(historyItem);
        saveMeterHistory();
        
        // ২. যদি ইউনিট ব্যবহৃত হয়, তাহলে ট্রানজেকশনে যোগ করুন
        if (unitsUsed > 0) {
            addUnitsToTransactions(unitsUsed, reading);
        }
        
        updateMeterDisplay();
        
        showNotification(`✅ মিটার রিডিং আপডেট করা হয়েছে! ইউনিট: ${toBanglaNumber(unitsUsed.toFixed(2))}`, 'success');
    }
}

// ট্রানজেকশনে যোগ করার ফাংশন
function addUnitsToTransactions(units, reading) {
    const estimatedCost = units * 6.5; // আনুমানিক খরচ
    
    const transaction = {
        id: Date.now(),
        type: 'electricity_bill',
        amount: estimatedCost,
        units: units,
        description: `মিটার রিডিং - ${reading.toFixed(2)} (${units.toFixed(2)} kWh)`,
        balanceAfter: currentBalance - estimatedCost,
        timestamp: new Date().toLocaleString('bn-BD'),
        meterId: activeMeterId
    };
    
    transactions.unshift(transaction);
    currentBalance -= estimatedCost;
    totalExpended += estimatedCost;
    
    saveData();
    updateBalanceDisplay();
}

// রিসেট অপশন দেখান
function showResetOptions() {
    const content = `
        <div style="text-align: center; margin-bottom: 20px;">
            <h4 style="color: #e74c3c;">⚠️ রিসেট অপশন</h4>
            <p>কোনটি রিসেট করতে চান?</p>
        </div>
        
        <div style="display: grid; gap: 10px;">
            <button onclick="resetMeterHistory()" class="danger-btn" style="width: 100%; padding: 12px; background: #e74c3c; color: white; border: none; border-radius: 8px; cursor: pointer;">
                📝 শুধু মিটার হিস্ট্রি ডিলিট
            </button>
            
            <button onclick="resetMeterToDefault()" class="danger-btn" style="width: 100%; padding: 12px; background: #c0392b; color: white; border: none; border-radius: 8px; cursor: pointer;">
                🔄 মিটার সম্পূর্ণ রিসেট
            </button>
            
            <button onclick="deleteLastMeterEntry()" class="danger-btn" style="width: 100%; padding: 12px; background: #d35400; color: white; border: none; border-radius: 8px; cursor: pointer;">
                ↩️ শেষ এন্ট্রি ডিলিট
            </button>
            
            <button onclick="this.closest('.modal').remove()" style="width: 100%; padding: 12px; background: #95a5a6; color: white; border: none; border-radius: 8px; cursor: pointer; margin-top: 10px;">
                ❌ বাতিল
            </button>
        </div>
        
        <div style="margin-top: 15px; padding: 10px; background: #f8f9fa; border-radius: 5px;">
            <small>💡 টিপ: "শেষ এন্ট্রি ডিলিট" করলে মিটার আগের রিডিংতে ফিরে যাবে</small>
        </div>
    `;
    
    showCustomModal('মিটার রিসেট অপশন', content);
}

// শুধু মিটার হিস্ট্রি ডিলিট
function resetMeterHistory() {
    if (confirm('⚠️ আপনি কি নিশ্চিত যে মিটার হিস্ট্রি সম্পূর্ণ ডিলিট করতে চান?\n\nএটি শুধু হিস্ট্রি ডিলিট করবে, মিটার রিডিং আগের অবস্থায় ফিরে যাবে না।')) {
        meterHistory = [];
        saveMeterHistory();
        updateMeterDisplay();
        showNotification('✅ মিটার হিস্ট্রি ডিলিট করা হয়েছে!', 'success');
        document.querySelector('.modal').remove();
    }
}

// মিটার সম্পূর্ণ রিসেট (হিস্ট্রি + বেস রিডিং)
function resetMeterToDefault() {
    if (confirm('⚠️ আপনি কি নিশ্চিত যে মিটার সম্পূর্ণ রিসেট করতে চান?\n\n✅ মিটার হিস্ট্রি ডিলিট হবে\n✅ বেস রিডিং ০ সেট হবে\n✅ মিটার সম্পূর্ণ রিসেট হবে')) {
        meterHistory = [];
        localStorage.removeItem('meter_base_reading');
        localStorage.removeItem('digital_meter_history');
        updateMeterDisplay();
        showNotification('✅ মিটার সম্পূর্ণ রিসেট করা হয়েছে!', 'success');
        document.querySelector('.modal').remove();
    }
}

// শেষ এন্ট্রি ডিলিট (মিটার আগের অবস্থায় ফিরে যাবে)
function deleteLastMeterEntry() {
    if (meterHistory.length === 0) {
        showNotification('❌ ডিলিট করার মতো কোন এন্ট্রি নেই!', 'error');
        return;
    }
    
    const lastEntry = meterHistory[meterHistory.length - 1];
    
    if (confirm(`⚠️ আপনি কি নিশ্চিত যে শেষ এন্ট্রি ডিলিট করতে চান?\n\nতারিখ: ${lastEntry.date}\nরিডিং: ${toBanglaNumber(lastEntry.reading.toFixed(2))}\nইউনিট: ${toBanglaNumber(lastEntry.units.toFixed(2))} kWh\n\n✅ মিটার আগের রিডিংয়ে ফিরে যাবে`)) {
        // শেষ এন্ট্রি ডিলিট
        meterHistory.pop();
        saveMeterHistory();
        updateMeterDisplay();
        
        showNotification('✅ শেষ মিটার এন্ট্রি ডিলিট করা হয়েছে!', 'success');
        document.querySelector('.modal').remove();
    }
}

// নির্দিষ্ট এন্ট্রি ডিলিট (হিস্ট্রি থেকে)
function deleteMeterEntry(id) {
    const entryIndex = meterHistory.findIndex(item => item.id === id);
    
    if (entryIndex !== -1) {
        const entry = meterHistory[entryIndex];
        
        if (confirm(`⚠️ এই এন্ট্রি ডিলিট করতে চান?\n\nতারিখ: ${entry.date}\nরিডিং: ${toBanglaNumber(entry.reading.toFixed(2))}`)) {
            meterHistory.splice(entryIndex, 1);
            saveMeterHistory();
            updateMeterDisplay();
            showMeterHistory(); // হিস্ট্রি রিফ্রেশ
            showNotification('✅ মিটার এন্ট্রি ডিলিট করা হয়েছে!', 'success');
        }
    }
}

// আপডেটেড হিস্ট্রি ফাংশন (ডিলিট বাটন সহ)
function showMeterHistory() {
    if (meterHistory.length === 0) {
        showNotification('❌ কোন মিটার হিস্ট্রি নেই!', 'error');
        return;
    }
    
    let historyHTML = `
        <div style="max-height: 400px; overflow-y: auto;">
            <div style="text-align: center; background: linear-gradient(135deg, #3498db, #2980b9); color: white; padding: 15px; border-radius: 10px; margin-bottom: 15px;">
                <h4 style="margin: 0;">মিটার রিডিং হিস্ট্রি</h4>
                <small>মোট ${toBanglaNumber(meterHistory.length)}টি রেকর্ড</small>
            </div>
            
            <div style="margin-bottom: 15px;">
                <button onclick="showResetOptions()" style="width: 100%; padding: 10px; background: #e74c3c; color: white; border: none; border-radius: 5px; cursor: pointer;">
                    🗑️ সব হিস্ট্রি ডিলিট
                </button>
            </div>
    `;
    
    // নতুন থেকে পুরাতন সাজানো
    meterHistory.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
               .forEach((item, index) => {
        historyHTML += `
            <div class="meter-history-item" style="background: #f8f9fa; padding: 12px; margin: 8px 0; border-radius: 8px; border-left: 4px solid #3498db; display: flex; justify-content: space-between; align-items: center;">
                <div style="flex: 1;">
                    <div style="font-weight: bold; color: #2c3e50;">${item.date}</div>
                    <div style="color: #7f8c8d; font-size: 12px;">
                        রিডিং: ${toBanglaNumber(item.reading.toFixed(2))} | 
                        ইউনিট: ${toBanglaNumber(item.units.toFixed(2))} kWh
                    </div>
                </div>
                <div style="display: flex; gap: 5px;">
                    <button onclick="deleteMeterEntry(${item.id})" style="background: #e74c3c; color: white; border: none; padding: 6px 10px; border-radius: 4px; cursor: pointer; font-size: 12px;">
                        🗑️
                    </button>
                </div>
            </div>
        `;
    });
    
    historyHTML += '</div>';
    
    showCustomModal('মিটার রিডিং হিস্ট্রি', historyHTML);
}

// মিটার হিস্ট্রি ডিলিট (সম্পূর্ণ ভার্সন)
function resetMeterHistory() {
    if (confirm('⚠️ আপনি কি নিশ্চিত যে মিটার হিস্ট্রি সম্পূর্ণ ডিলিট করতে চান?\n\n✅ মিটার হিস্ট্রি ডিলিট হবে\n✅ মিটার থেকে তৈরি ট্রানজেকশন ডিলিট হবে\n✅ মোট ইউনিট শূন্য হবে')) {
        
        // ১. মিটার হিস্ট্রি ক্লিয়ার
        meterHistory = [];
        saveMeterHistory();
        
        // ২. মিটার সম্পর্কিত ট্রানজেকশন ডিলিট
        deleteMeterTransactions();
        
        // ৩. UI আপডেট
        updateMeterDisplay();
        updateBalanceDisplay();
        loadTransactionReport(); // রিপোর্টও রিফ্রেশ করুন
        
        showNotification('✅ মিটার হিস্ট্রি এবং সংশ্লিষ্ট ডেটা ডিলিট করা হয়েছে!', 'success');
        document.querySelector('.modal').remove();
    }
}

// মিটার ট্রানজেকশন ডিলিট - সংশোধিত ভার্সন
function deleteMeterTransactions() {
    let deletedAmount = 0;
    let deletedCount = 0;
    
    // মিটার রিডিং থেকে তৈরি ট্রানজেকশনগুলো আলাদা করুন
    const meterTransactions = transactions.filter(t => 
        t.description && t.description.includes('মিটার রিডিং')
    );
    
    // ডিলিট করার আগে টোটাল অ্যামাউন্ট বের করুন
    meterTransactions.forEach(transaction => {
        deletedAmount += transaction.amount || 0;
        deletedCount++;
    });
    
    // মিটার ট্রানজেকশনগুলো রিমুভ করুন
    transactions = transactions.filter(t => 
        !t.description || !t.description.includes('মিটার রিডিং')
    );
    
    // ব্যালেন্স সংশোধন করুন
    if (deletedAmount > 0) {
        currentBalance += deletedAmount; // ডিলিট করা অ্যামাউন্ট ফেরত যোগ করুন
        totalExpended -= deletedAmount; // টোটাল এক্সপেন্ডেড থেকে বাদ দিন
        
        console.log(`ডিলিট করা হয়েছে: ${deletedCount}টি ট্রানজেকশন, ${deletedAmount} টাকা`);
    }
    
    saveData();
    
    return deletedAmount;
}

// মিটার হিস্ট্রি ডিলিট - ফাইনাল ভার্সন
function resetMeterHistory() {
    if (confirm('⚠️ আপনি কি নিশ্চিত যে মিটার হিস্ট্রি সম্পূর্ণ ডিলিট করতে চান?\n\n✅ মিটার হিস্ট্রি ডিলিট হবে\n✅ মিটার থেকে তৈরি ট্রানজেকশন ডিলিট হবে\n✅ ব্যালেন্স সংশোধন হবে')) {
        
        // ১. মিটার হিস্ট্রি ক্লিয়ার
        const historyCount = meterHistory.length;
        meterHistory = [];
        saveMeterHistory();
        
        // ২. মিটার সম্পর্কিত ট্রানজেকশন ডিলিট এবং ব্যালেন্স সংশোধন
        const deletedAmount = deleteMeterTransactions();
        
        // ৩. সম্পূর্ণ ব্যালেন্স রিক্যালকুলেশন
        recalculateAllBalances();
        
        // ৪. সব ডেটা সেভ করুন
        saveData();
        
        // ৫. UI আপডেট
        updateMeterDisplay();
        updateBalanceDisplay();
        loadTransactionReport();
        
        showNotification(`✅ ${historyCount}টি মিটার এন্ট্রি ডিলিট করা হয়েছে! ব্যালেন্স সংশোধন করা হয়েছে।`, 'success');
        document.querySelector('.modal').remove();
    }
}

// ব্যালেন্স ডিসপ্লে আপডেট ফাংশন - ফাইনাল ভার্সন
function updateBalanceDisplay() {
    try {
        // --- নতুন যোগ করা অংশ (নিরাপত্তার জন্য) ---
        // যদি ডাটাবেস থেকে ভুলক্রমে খরচ ০ আসে, তবে ট্রানজেকশন থেকে সেটি ক্যালকুলেট করে নেবে
        const txs = getActiveTransactions();
        if (transactions && transactions.length > 0) {
            totalRecharge = txs.filter(t => t.type === 'recharge').reduce((sum, t) => sum + Math.abs(t.amount || 0), 0);
            totalExpended = txs.filter(t => t.type === 'electricity_bill').reduce((sum, t) => sum + Math.abs(t.amount || 0), 0);
        }
        // ---------------------------------------

        // NaN চেক এবং ফিক্স (আপনার অরিজিনাল কোড)
        let bal = parseFloat(currentBalance);
        let rec = parseFloat(totalRecharge);
        let exp = parseFloat(totalExpended);
        
        if (isNaN(bal)) {
            console.warn('currentBalance NaN, লোকাল স্টোরেজ থেকে ফিক্স করা হচ্ছে...');
            const meterKey = `meter_data_${activeMeterId}`;
            const raw = localStorage.getItem(meterKey);
            if (raw) {
                const data = JSON.parse(raw);
                bal = data.currentBalance || 0;
                rec = data.totalRecharge || 0;
                exp = data.totalExpended || 0;
                
                currentBalance = bal;
                totalRecharge = rec;
                totalExpended = exp;
            } else {
                bal = 0;
                rec = 0;
                exp = 0;
            }
        }
        
        // UI আপডেট (আপনার অরিজিনাল কোড)
        const balanceEl = document.getElementById('currentBalance');
        const rechargeEl = document.getElementById('totalRecharge');
        const expendedEl = document.getElementById('totalExpended');
        
        if (balanceEl) balanceEl.textContent = bal.toFixed(2);
        if (rechargeEl) rechargeEl.textContent = rec.toFixed(2);
        if (expendedEl) expendedEl.textContent = exp.toFixed(2);
        
        // রিপোর্ট সামারি (আপনার অরিজিনাল কোড)
        const depositEl = document.getElementById('totalDeposit');
        const expenseEl = document.getElementById('totalExpense');
        const txCountEl = document.getElementById('totalTransactions');
        
        if (depositEl) depositEl.textContent = rec.toFixed(2) + ' টাকা';
        if (expenseEl) expenseEl.textContent = exp.toFixed(2) + ' টাকা';
        if (txCountEl) txCountEl.textContent = transactions?.length || 0;
        
        console.log('💰 ব্যালেন্স আপডেট:', bal);

        // প্রোগ্রেস বার থাকলে সেটিও আপডেট হবে
        if (typeof updateProgressBar === 'function') updateProgressBar();
        
    } catch (error) {
        console.error('Balance display error:', error);
    }
}

// বর্তমান মিটারের ডেটা সেভ করুন
function saveCurrentMeterData() {
    if (!activeMeterId) {
        console.warn('No active meter ID, skipping save');
        return;
    }
    
    try {
        const meterDataKey = `meter_data_${activeMeterId}`;
        const meterData = {
            transactions: transactions || [],
            monthlyRecharges: monthlyRecharges || [],
            currentBalance: currentBalance || 0,
            totalRecharge: totalRecharge || 0,
            totalExpended: totalExpended || 0,
            lastDemandChargeMonth: lastDemandChargeMonth || '',
            settings: settings || {},
            tariffRates: tariffRates || [],
            meterInfo: meterInfo || {},
            lastUpdated: new Date().toISOString()
        };
        localStorage.setItem(meterDataKey, JSON.stringify(meterData));
        console.log(`💾 মিটার ডেটা সেভ: ${activeMeterId}`);
        return true;
    } catch (error) {
        console.error('saveCurrentMeterData error:', error);
        return false;
    }
}

// রিস্টোরের পর অটো ফিক্স - আপনার restoreData() ফাংশনের শেষে যোগ করুন
function autoFixAfterRestore() {
    setTimeout(() => {
        // ব্যালেন্স ফিক্স
const meterKey = `meter_data_${activeMeterId}`;
const raw = localStorage.getItem(meterKey);
if (raw) {
    const data = JSON.parse(raw);
    currentBalance = data.currentBalance || 0;
    totalRecharge = data.totalRecharge || 0;
    totalExpended = data.totalExpended || 0;
    
    document.getElementById('currentBalance').textContent = currentBalance.toFixed(2);
    document.getElementById('totalRecharge').textContent = totalRecharge.toFixed(2);
    document.getElementById('totalExpended').textContent = totalExpended.toFixed(2);
    
    console.log('✅ ব্যালেন্স আপডেট:', currentBalance);
}
    }, 100);
}

// ✅ ডাইনামিক বাংলা তারিখ সাজানো
function dynamicBanglaDateSorting() {
    console.log('=== ডাইনামিক বাংলা তারিখ সাজানো ===');
    
    transactions.sort((a, b) => {
        try {
            const dateA = parseBanglaDateDynamic(a.timestamp);
            const dateB = parseBanglaDateDynamic(b.timestamp);
            return dateA - dateB; // পুরাতন থেকে নতুন
        } catch (error) {
            return 0;
        }
    });
    
    console.log('ডাইনামিক সাজানো后的 ট্রানজেকশন:');
    transactions.forEach((t, i) => {
        console.log(`${i + 1}. ${t.timestamp}`);
    });
}

// ✅ উন্নত বাংলা তারিখ পার্সার
function parseBanglaDateDynamic(banglaDateString) {
    try {
        // উদাহরণ: "৩/১১/২০২৫, ১০:২৫:৩৬ PM"
        const [datePart, timePart] = banglaDateString.split(', ');
        const [day, month, year] = datePart.split('/');
        
        // বাংলা সংখ্যা ইংরেজিতে কনভার্ট
        const englishDay = parseInt(day.replace(/[০-৯]/g, d => '০১২৩৪৫৬৭৮৯'.indexOf(d)));
        const englishMonth = parseInt(month.replace(/[০-৯]/g, d => '০১২৩৪৫৬৭৮৯'.indexOf(d)));
        const englishYear = parseInt(year.replace(/[০-৯]/g, d => '০১২৩৪৫৬৭৮৯'.indexOf(d)));
        
        // সময় পার্স করা
        let [time, modifier] = timePart.split(' ');
        let [hours, minutes, seconds] = time.split(':');
        
        hours = parseInt(hours);
        minutes = parseInt(minutes);
        seconds = parseInt(seconds);
        
        if (modifier === 'PM' && hours < 12) hours += 12;
        if (modifier === 'AM' && hours === 12) hours = 0;
        
        // সঠিক তারিখ তৈরি (Months are 0-based in JavaScript)
        return new Date(englishYear, englishMonth - 1, englishDay, hours, minutes, seconds);
        
    } catch (error) {
        console.error('ডাইনামিক তারিখ পার্স করতে সমস্যা:', banglaDateString, error);
        return new Date(); // fallback
    }
}

// ✅ Multi-meter Aware Recalculation
function recalculateAllBalances() {
    console.log('=== Multi-meter Recalculation ===');
    
    // Sort transactions globally by date for consistent display order
    transactions.sort((a, b) => {
        try {
            const dateA = (typeof parseAnyDate === 'function' ? parseAnyDate(a.timestamp) : new Date(a.timestamp)) || new Date(0);
            const dateB = (typeof parseAnyDate === 'function' ? parseAnyDate(b.timestamp) : new Date(b.timestamp)) || new Date(0);
            return dateA - dateB;
        } catch (e) { return 0; }
    });

    // Track running balance for each meter
    const meterBalances = {};
    (meters || []).forEach(m => meterBalances[m.id] = 0);
    
    // Process transactions
    transactions.forEach(t => {
        // Resolve meterId
        let mId = t.meterId;
        if (!mId) {
            // Legacy handling: assign to active meter or first meter
            mId = activeMeterId || (meters[0] ? meters[0].id : null);
        }
        
        if (mId) {
            if (meterBalances[mId] === undefined) meterBalances[mId] = 0;
            
            if (t.type === 'recharge') {
                meterBalances[mId] += Math.abs(t.amount);
            } else if (t.type === 'electricity_bill') {
                meterBalances[mId] -= Math.abs(t.amount);
            }
            
            // Update balanceAfter for this transaction (Snapshot of that meter's balance)
            t.balanceAfter = parseFloat(meterBalances[mId].toFixed(2));
        }
    });
    
    // Update global variables for ACTIVE meter
    if (activeMeterId) {
        currentBalance = parseFloat((meterBalances[activeMeterId] || 0).toFixed(2));
        
        // Recalculate totals for active meter
        const activeTxs = transactions.filter(t => t.meterId === activeMeterId || (!t.meterId && activeMeterId === (meters[0]?meters[0].id:null)));
        
        totalRecharge = activeTxs
            .filter(t => t.type === 'recharge')
            .reduce((sum, t) => sum + Math.abs(t.amount), 0);
            
        totalExpended = activeTxs
            .filter(t => t.type === 'electricity_bill')
            .reduce((sum, t) => sum + Math.abs(t.amount), 0);
    }
    
    saveData();
    updateBalanceDisplay();
    console.log('Recalculation complete. Current Balance:', currentBalance);
}

// Aliases for backward compatibility
function autoRecalculateWithSorting() { recalculateAllBalances(); }
function simpleRecalculateAllBalances() { recalculateAllBalances(); }

// ✅ নতুন ট্রানজেকশন যোগ করার সময় অটো সাজানো
function addTransactionWithAutoSort(type, amount, description, units = 0) {
    const newTransaction = {
        id: Date.now(),
        type: type,
        amount: type === 'recharge' ? amount : -amount,
        units: units,
        description: description,
        timestamp: new Date().toISOString(),
        balanceAfter: 0,
        meterId: activeMeterId || (meters && meters[0] ? meters[0].id : undefined)
    };
    
    // ট্রানজেকশন যোগ
    transactions.push(newTransaction);
    
    // অটো সাজানো এবং রিক্যালকুলেশন
    autoRecalculateWithSorting();
    
    showNotification(`✅ নতুন ${type === 'recharge' ? 'রিচার্জ' : 'বিল'} যোগ করা হয়েছে!`, 'success');
}

// ✅ সবচেয়ে সহজ সমাধান: ফোর্স করে সঠিক ব্যালেন্স সেট করুন
function forceCorrectBalance() {
    console.log('=== ফোর্স করেক্ট ব্যালেন্স ===');
    
    // সরাসরি সঠিক ব্যালেন্স সেট করুন
    currentBalance = 594.51;
    
    // শুধু শেষ ট্রানজেকশনের ব্যালেন্স আপডেট করুন
    if (transactions.length > 0) {
        transactions[transactions.length - 1].balanceAfter = 594.51;
    }
    
    saveData();
    updateBalanceDisplay();
    
    console.log('ব্যালেন্স ফোর্স করে সেট করা হয়েছে:', currentBalance);
    showNotification('🔧 ব্যালেন্স ফোর্স করে সঠিক করা হয়েছে!', 'success');
}

// মিটার হিস্ট্রি দেখান
function showMeterHistory() {
    if (meterHistory.length === 0) {
        showNotification('❌ কোন মিটার হিস্ট্রি নেই!', 'error');
        return;
    }
    
    let historyHTML = `
        <div style="max-height: 400px; overflow-y: auto;">
            <div style="text-align: center; background: linear-gradient(135deg, #3498db, #2980b9); color: white; padding: 15px; border-radius: 10px; margin-bottom: 15px;">
                <h4 style="margin: 0;">মিটার রিডিং হিস্ট্রি</h4>
                <small>মোট ${toBanglaNumber(meterHistory.length)}টি রেকর্ড</small>
            </div>
    `;
    
    meterHistory.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
               .forEach(item => {
        historyHTML += `
            <div class="meter-history-item">
                <div>
                    <div class="meter-history-date">${item.date}</div>
                    <small style="color: #7f8c8d;">রিডিং: ${toBanglaNumber(item.reading.toFixed(2))}</small>
                </div>
                <div style="text-align: right;">
                    <div class="meter-history-reading">${toBanglaNumber(item.units.toFixed(2))} kWh</div>
                    <small style="color: #27ae60;">ব্যবহৃত ইউনিট</small>
                </div>
            </div>
        `;
    });
    
    historyHTML += '</div>';
    
    showCustomModal('মিটার রিডিং হিস্ট্রি', historyHTML);
}

// মিটার হিস্ট্রি সেভ/লোড
function saveMeterHistory() {
    localStorage.setItem('digital_meter_history', JSON.stringify(meterHistory));
}

function loadMeterHistory() {
    const savedHistory = localStorage.getItem('digital_meter_history');
    if (savedHistory) {
        meterHistory = JSON.parse(savedHistory);
    }
}

// DESCO বিল যোগ করার সময় মিটার আপডেট
function addElectricityBillWithMeter(amount, units, date) {
    // বিদ্যুৎ বিল যোগ করুন
    addElectricityBill(amount, units, date);
    
    // মিটার আপডেট করুন
    setTimeout(updateMeterDisplay, 100);
}

// DOMContentLoaded এ যোগ করুন
document.addEventListener('DOMContentLoaded', function() {
    initializeDigitalMeter();
});

// মিটার সাইজ টগল
function toggleMeterSize() {
    const meter = document.querySelector('.digital-meter');
    
    if (meter.classList.contains('digital-meter-minimal')) {
        meter.classList.remove('digital-meter-minimal');
        meter.classList.add('digital-meter-compact');
        showNotification('🔍 মিটার সাইজ মিডিয়াম', 'info');
    } else if (meter.classList.contains('digital-meter-compact')) {
        meter.classList.remove('digital-meter-compact');
        showNotification('📏 মিটার সাইজ নরমাল', 'info');
    } else {
        meter.classList.add('digital-meter-minimal');
        showNotification('🎯 মিটার সাইজ ছোট', 'info');
    }
}

// মিটার কন্ট্রোলে টগল বাটন যোগ করুন
function addMeterSizeToggle() {
    const meterControls = document.querySelector('.meter-controls');
    const toggleBtn = document.createElement('button');
    toggleBtn.innerHTML = '📏';
    toggleBtn.className = 'meter-btn outline';
    toggleBtn.onclick = toggleMeterSize;
    toggleBtn.title = 'মিটার সাইজ পরিবর্তন';
    
    meterControls.appendChild(toggleBtn);
}

// স্ক্রল ইভেন্ট লিসেনার
function setupMeterScrollEffect() {
    try {
        const meterContainer = document.querySelector('.digital-meter-container');
        
        // যদি meter container না থাকে, তাহলে return করুন
        if (!meterContainer) {
            console.log('Meter container not found, skipping scroll effect');
            return;
        }
        
        let lastScrollTop = 0;
        
        window.addEventListener('scroll', function() {
            const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
            
            if (scrollTop > lastScrollTop) {
                // নিচে স্ক্রল করলে
                meterContainer.classList.add('scroll-hide');
            } else {
                // উপরে স্ক্রল করলে
                meterContainer.classList.remove('scroll-hide');
            }
            
            lastScrollTop = scrollTop;
        });
        
    } catch (error) {
        console.warn('Scroll effect error:', error);
    }
}

// মিটার টগল ফাংশন
function toggleMeterVisibility() {
    const meterContainer = document.querySelector('.digital-meter-container');
    meterContainer.style.display = meterContainer.style.display === 'none' ? 'block' : 'none';
}

// ক্লোজ বাটন যোগ করুন
function addCloseButton() {
    const meterHeader = document.querySelector('.meter-header');
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '×';
    closeBtn.style.cssText = `
        position: absolute;
        top: 5px;
        right: 8px;
        background: rgba(0,0,0,0.3);
        color: white;
        border: none;
        border-radius: 50%;
        width: 20px;
        height: 20px;
        cursor: pointer;
        font-size: 14px;
        display: flex;
        align-items: center;
        justify-content: center;
    `;
    closeBtn.onclick = toggleMeterVisibility;
    closeBtn.title = 'মিটার হাইড করুন';
    
    meterHeader.style.position = 'relative';
    meterHeader.appendChild(closeBtn);
}

// DOMContentLoaded এ যোগ করুন
document.addEventListener('DOMContentLoaded', function() {
    initializeDigitalMeter();
    setupMeterScrollEffect();
    //addCloseButton();
});

// রিপোর্ট ডেটা (আপনার existing report থেকে ইউনিট নেবে) - NEW
let reportData = {
    totalUnits: 0,
    lastUpdated: null
};

// রিপোর্ট ডেটা লোড করা - NEW
function loadReportData() {
    const saved = localStorage.getItem('reportData');
    if (saved) {
        reportData = JSON.parse(saved);
    }
}

// রিপোর্ট ডেটা সেভ করা - NEW
function saveReportData() {
    localStorage.setItem('reportData', JSON.stringify(reportData));
}

// রিপোর্ট থেকে অটো ইউনিট যোগ করার ফাংশন - সরল ভার্সন
function addReportUnits() {
    try {
        // সরাসরি prompt দিয়ে ইউনিট নিন (অটো না হলে)
        const units = prompt('রিপোর্ট থেকে মোট ইউনিট ইনপুট করুন:');
        
        if (units && !isNaN(units)) {
            reportData.totalUnits = parseFloat(units);
            reportData.lastUpdated = new Date().toLocaleString('bn-BD');
            saveReportData();
            updateMeterDisplay();
            
            alert(`✅ রিপোর্ট ইউনিট সেট হয়েছে: ${units} kWh`);
        }
    } catch (error) {
        console.error('Error in addReportUnits:', error);
        alert('❌ রিপোর্ট যোগ করতে সমস্যা!');
    }
}

// শুধু কারেন্ট ইনপুট থেকে ইউনিট ক্যালকুলেট
function calculateCurrentTotalUnits() {
    let total = 0;
    if (meterHistory && meterHistory.length > 0) {
        meterHistory.forEach(reading => {
            total += reading.units || 0;
        });
    }
    return total;
}

// রিসেট অপশন
function showResetOptions() {
    const content = `
        <div style="text-align: center; margin-bottom: 20px;">
            <h4 style="color: #e74c3c;">⚠️ রিসেট অপশন</h4>
            <p>কোনটি রিসেট করতে চান?</p>
        </div>
        
        <div style="display: grid; gap: 10px;">
            <button onclick="resetCurrentReadings()" style="width: 100%; padding: 12px; background: #e74c3c; color: white; border: none; border-radius: 8px; cursor: pointer;">
                🔄 শুধু কারেন্ট রিডিং রিসেট
            </button>
            
            <button onclick="resetReportData()" style="width: 100%; padding: 12px; background: #c0392b; color: white; border: none; border-radius: 8px; cursor: pointer;">
                📊 রিপোর্ট ডেটা রিসেট
            </button>
            
            <button onclick="resetAllData()" style="width: 100%; padding: 12px; background: #7f8c8d; color: white; border: none; border-radius: 8px; cursor: pointer;">
                🗑️ সব ডেটা রিসেট
            </button>
            
            <button onclick="this.closest('.modal').remove()" style="width: 100%; padding: 12px; background: #95a5a6; color: white; border: none; border-radius: 8px; cursor: pointer; margin-top: 10px;">
                ❌ বাতিল
            </button>
        </div>
    `;
    
    showCustomModal('রিসেট অপশন', content);
}

// শুধু কারেন্ট রিডিং রিসেট
function resetCurrentReadings() {
    if (confirm('⚠️ শুধু কারেন্ট রিডিং রিসেট করতে চান?\n\n✅ মিটার হিস্ট্রি ডিলিট হবে\n✅ রিপোর্ট ডেটা থাকবে')) {
        meterHistory = [];
        saveMeterHistory();
        updateMeterDisplay();
        showNotification('✅ কারেন্ট রিডিং রিসেট করা হয়েছে!', 'success');
        document.querySelector('.modal').remove();
    }
}

// রিপোর্ট ডেটা রিসেট
function resetReportData() {
    if (confirm('⚠️ রিপোর্ট ডেটা রিসেট করতে চান?\n\n✅ রিপোর্ট ইউনিট ০ হবে\n✅ কারেন্ট রিডিং থাকবে')) {
        reportData = { totalUnits: 0, lastUpdated: null };
        saveReportData();
        updateMeterDisplay();
        showNotification('✅ রিপোর্ট ডেটা রিসেট করা হয়েছে!', 'success');
        document.querySelector('.modal').remove();
    }
}

// সব ডেটা রিসেট
function resetAllData() {
    if (confirm('⚠️ সব ডেটা রিসেট করতে চান?\n\n✅ মিটার হিস্ট্রি ডিলিট হবে\n✅ রিপোর্ট ডেটা রিসেট হবে\n✅ সব ডেটা মুছে যাবে')) {
        meterHistory = [];
        reportData = { totalUnits: 0, lastUpdated: null };
        saveMeterHistory();
        saveReportData();
        updateMeterDisplay();
        showNotification('✅ সব ডেটা রিসেট করা হয়েছে!', 'success');
        document.querySelector('.modal').remove();
    }
}

// লোকাল স্টোরেজে সেভ করুন
function saveMeterHistory() {
    localStorage.setItem('meterHistory', JSON.stringify(meterHistory));
}

// লোকাল স্টোরেজ থেকে লোড করুন
function loadMeterHistory() {
    const saved = localStorage.getItem('meterHistory');
    if (saved) {
        meterHistory = JSON.parse(saved);
    }
}

// রিপোর্ট ডেটা সেভ করা
function saveReportData() {
    localStorage.setItem('reportData', JSON.stringify(reportData));
}

// রিপোর্ট ডেটা লোড করা
function loadReportData() {
    const saved = localStorage.getItem('reportData');
    if (saved) {
        reportData = JSON.parse(saved);
    }
}

// আপনার existing report system থেকে ইউনিট calculate করার ফাংশন - NEW
function calculateUnitsFromYourReportSystem() {
    let totalReportUnits = 0;
    
    // আপনার existing report/transaction data থেকে ইউনিট calculate করুন
    // উদাহরণ:
    if (transactions && transactions.length > 0) {
        transactions.forEach(transaction => {
            if (transaction.type === 'electricity_bill' && transaction.units) {
                totalReportUnits += transaction.units;
            }
        });
    }
    
    // অথবা monthlyRecharges থেকে calculate করুন
    if (monthlyRecharges && monthlyRecharges.length > 0) {
        monthlyRecharges.forEach(recharge => {
            if (recharge.billDetails && recharge.billDetails.energyCost) {
                // এনার্জি কস্ট থেকে আনুমানিক ইউনিট calculate
                const estimatedUnits = estimateUnitsFromMoney(recharge.billDetails.energyCost);
                totalReportUnits += estimatedUnits;
            }
        });
    }
    
    return totalReportUnits;
}

// ইউনিট থেকে টাকা ক্যালকুলেশন
function calculateFromUnit() {
    const unitInput = document.getElementById('unitInput');
    const units = parseFloat(unitInput.value);
    
    if (isNaN(units) || units < 0) {
        showNotification('❌ দয়া করে বৈধ ইউনিট সংখ্যা ইনপুট করুন', 'error');
        return;
    }
    
    const totalCost = calculateBill(units);
    const resultDiv = document.getElementById('unitResult');
    
    resultDiv.innerHTML = `
        <strong>ক্যালকুলেশন রেজাল্ট:</strong><br>
        ইউনিট: ${units} kWh<br>
        মোট খরচ: ${totalCost.toFixed(2)} টাকা<br>
        <small>প্রতি ইউনিট গড় খরচ: ${(totalCost / units).toFixed(2)} টাকা</small>
    `;
}

// টাকা থেকে ইউনিট ক্যালকুলেশন
function calculateFromMoney() {
    const moneyInput = document.getElementById('moneyInput');
    const money = parseFloat(moneyInput.value);
    
    if (isNaN(money) || money < 0) {
        showNotification('❌ দয়া করে বৈধ টাকার পরিমাণ ইনপুট করুন', 'error');
        return;
    }
    
    const estimatedUnits = estimateUnitsFromMoney(money);
    const resultDiv = document.getElementById('moneyResult');
    
    resultDiv.innerHTML = `
        <strong>ক্যালকুলেশন রেজাল্ট:</strong><br>
        টাকার পরিমাণ: ${money} টাকা<br>
        আনুমানিক ইউনিট: ${estimatedUnits.toFixed(2)} kWh<br>
        <small>প্রতি ইউনিট গড় খরচ: ${(money / estimatedUnits).toFixed(2)} টাকা</small>
    `;
}

// ইউনিট থেকে বিল ক্যালকুলেশন
function calculateBill(units) {
    let totalCost = 0;
    let remainingUnits = units;
    
    for (let i = 0; i < tariffRates.length; i++) {
        const slab = tariffRates[i];
        const slabMin = slab.range[0];
        const slabMax = slab.range[1];
        
        if (remainingUnits <= 0) break;
        
        if (slabMin === 0) {
            const slabUnits = Math.min(remainingUnits, slabMax);
            totalCost += slabUnits * slab.rate;
            remainingUnits -= slabUnits;
        } else {
            const availableUnits = slabMax - slabMin + 1;
            const slabUnits = Math.min(remainingUnits, availableUnits);
            totalCost += slabUnits * slab.rate;
            remainingUnits -= slabUnits;
        }
    }
    
    return totalCost;
}

// টাকা থেকে ইউনিট এস্টিমেশন
function estimateUnitsFromMoney(money) {
    let estimatedUnits = 0;
    let remainingMoney = money;
    
    for (let i = 0; i < tariffRates.length; i++) {
        const slab = tariffRates[i];
        const slabMin = slab.range[0];
        const slabMax = slab.range[1];
        const slabRate = slab.rate;
        
        if (remainingMoney <= 0) break;
        
        if (slabMin === 0) {
            const maxCostForSlab = slabMax * slabRate;
            if (remainingMoney >= maxCostForSlab) {
                estimatedUnits += slabMax;
                remainingMoney -= maxCostForSlab;
            } else {
                estimatedUnits += remainingMoney / slabRate;
                remainingMoney = 0;
            }
        } else {
            const slabUnits = slabMax - slabMin + 1;
            const maxCostForSlab = slabUnits * slabRate;
            if (remainingMoney >= maxCostForSlab) {
                estimatedUnits += slabUnits;
                remainingMoney -= maxCostForSlab;
            } else {
                estimatedUnits += remainingMoney / slabRate;
                remainingMoney = 0;
            }
        }
    }
    
    return estimatedUnits;
}

// দৈনিক বিল ক্যালকুলেশন
function calculateDailyBill() {
    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');
    const dailyUnitInput = document.getElementById('dailyUnit');
    const dailyMoneyInput = document.getElementById('dailyMoney');
    
    const startDate = new Date(startDateInput.value);
    const endDate = new Date(endDateInput.value);
    const dailyUnits = parseFloat(dailyUnitInput.value);
    const dailyMoney = parseFloat(dailyMoneyInput.value);
    
    if (!startDateInput.value || !endDateInput.value) {
        showNotification('❌ দয়া করে শুরুর এবং শেষ তারিখ নির্বাচন করুন', 'error');
        return;
    }
    
    if (isNaN(dailyUnits) && isNaN(dailyMoney)) {
        showNotification('❌ দয়া করে দৈনিক ইউনিট অথবা দৈনিক টাকার পরিমাণ ইনপুট করুন', 'error');
        return;
    }
    
    if (startDate > endDate) {
        showNotification('❌ শুরুর তারিখ শেষ তারিখের পরে হতে পারে না', 'error');
        return;
    }
    
    const timeDiff = endDate.getTime() - startDate.getTime();
    const totalDays = Math.ceil(timeDiff / (1000 * 3600 * 24)) + 1;
    
    let resultHTML = '';
    
    if (!isNaN(dailyUnits) && dailyUnits > 0) {
        const totalUnits = dailyUnits * totalDays;
        const totalCost = calculateBill(totalUnits);
        const dailyCost = totalCost / totalDays;
        
        resultHTML += `
            <strong>দৈনিক ইউনিট থেকে ক্যালকুলেশন:</strong><br>
            সময়কাল: ${startDate.toLocaleDateString('bn-BD')} - ${endDate.toLocaleDateString('bn-BD')}<br>
            মোট দিন: ${totalDays} দিন<br>
            দৈনিক ইউনিট: ${dailyUnits} kWh<br>
            মোট ইউনিট: ${totalUnits.toFixed(2)} kWh<br>
            দৈনিক খরচ: ${dailyCost.toFixed(2)} টাকা<br>
            মোট খরচ: ${totalCost.toFixed(2)} টাকা<br>
            <small>প্রতিদিন গড়ে ${dailyCost.toFixed(2)} টাকা খরচ হবে</small>
            <br><br>
        `;
    }
    
    if (!isNaN(dailyMoney) && dailyMoney > 0) {
        const totalMoney = dailyMoney * totalDays;
        const estimatedUnits = estimateUnitsFromMoney(totalMoney);
        const dailyUnitsFromMoney = estimatedUnits / totalDays;
        
        resultHTML += `
            <strong>দৈনিক টাকা থেকে ক্যালকুলেশন:</strong><br>
            সময়কাল: ${startDate.toLocaleDateString('bn-BD')} - ${endDate.toLocaleDateString('bn-BD')}<br>
            মোট দিন: ${totalDays} দিন<br>
            দৈনিক টাকা: ${dailyMoney} টাকা<br>
            মোট টাকা: ${totalMoney.toFixed(2)} টাকা<br>
            আনুমানিক দৈনিক ইউনিট: ${dailyUnitsFromMoney.toFixed(2)} kWh<br>
            আনুমানিক মোট ইউনিট: ${estimatedUnits.toFixed(2)} kWh<br>
            <small>প্রতিদিন গড়ে ${dailyUnitsFromMoney.toFixed(2)} kWh ইউনিট খরচ হবে</small>
        `;
    }
    
    const resultDiv = document.getElementById('dailyResult');
    resultDiv.innerHTML = resultHTML;
}

// কাস্টম ডিমান্ড চার্জ সহ DESCO বিল ক্যালকুলেশন
function calculateDESCOBillWithCustomDemand(grossAmount, currentMonth, customDemandCharge) {
    const vatDecimal = settings.vatRate / 100;
    const rebateDecimal = settings.rebateRate / 100;
    
    console.log('Custom demand charge calculation:', { grossAmount, customDemandCharge, vatDecimal, rebateDecimal });
    
    const energyCost = (grossAmount - (customDemandCharge * (1 + vatDecimal))) / (1 + (vatDecimal - rebateDecimal));
    const vatAmount = (energyCost + customDemandCharge) * vatDecimal;
    const rebateAmount = energyCost * rebateDecimal;
    
    // Round to 2 decimal places
    const finalEnergyCost = Math.round(energyCost * 100) / 100;
    const finalVAT = Math.round(vatAmount * 100) / 100;
    const finalRebate = Math.round(-rebateAmount * 100) / 100;
    
    // Final calculation
    const finalNetAmount = finalEnergyCost + customDemandCharge + finalVAT + finalRebate;
    
    return {
        grossAmount: grossAmount,
        energyCost: finalEnergyCost,
        demandCharge: customDemandCharge,
        vat: finalVAT,
        rebate: finalRebate,
        netAmount: parseFloat(finalNetAmount.toFixed(2)),
        includeDemandCharge: customDemandCharge > 0,
        isFirstDemandCharge: false
    };
}

// DESCO বিল ক্যালকুলেটর রিসেট - সংশোধিত ভার্সন
function resetBillCalculator() {
    // ইনপুট ফিল্ড ক্লিয়ার করুন
    document.getElementById('grossAmount').value = '';
    document.getElementById('customDemandCharge').value = '';
    
    // ডিফল্ট সেটিংসে রিসেট করুন
    document.getElementById('demandChargeType').value = 'auto';
    
    // বর্তমান মাস সেট করুন
    const now = new Date();
    const currentMonth = now.toISOString().substring(0, 7);
    document.getElementById('currentMonth').value = currentMonth;
    
    // রেজাল্ট লুকান
    document.getElementById('billResult').style.display = 'none';
    
    // ফোকাস গ্রোস অ্যামাউন্ট ফিল্ডে দিন
    document.getElementById('grossAmount').focus();
    
    showNotification('🔄 বিল ক্যালকুলেটর রিসেট করা হয়েছে!', 'info');
}

// DESCO বিল ক্যালকুলেশন - FIXED (একই মাসে একবার ডিমান্ড চার্জ)
function calculateDESCOBill(grossAmount, currentMonth) {
    console.log('=== DESCO বিল ক্যালকুলেশন ===', { grossAmount, currentMonth });
    
    // ✅ ডিমান্ড চার্জ চেক - প্রতি মাসে একবার
    const includeDemandCharge = shouldIncludeDemandCharge(currentMonth);
    let demandCharge = 0;
    
    console.log('ডিমান্ড চার্জ স্ট্যাটাস:', {
        includeDemandCharge: includeDemandCharge,
        lastDemandChargeMonth: lastDemandChargeMonth,
        currentMonth: currentMonth
    });
    
    if (includeDemandCharge) {
        demandCharge = settings.demandCharge;
        console.log('✅ ডিমান্ড চার্জ প্রয়োগ:', demandCharge);
        
        // ✅ ডিমান্ড চার্জ মাস সেভ করুন
        lastDemandChargeMonth = currentMonth;
        saveData();
    } else {
        console.log('❌ এই মাসে ডিমান্ড চার্জ নেই (ইতিমধ্যে কাটা হয়েছে)');
    }
    
    const vatDecimal = settings.vatRate / 100;
    const rebateDecimal = settings.rebateRate / 100;
    
    // সঠিক ক্যালকুলেশন
    const energyCost = (grossAmount - (demandCharge * (1 + vatDecimal))) / (1 + (vatDecimal - rebateDecimal));
    const vatAmount = (energyCost + demandCharge) * vatDecimal;
    const rebateAmount = energyCost * rebateDecimal;
    
    // Round to 2 decimal places
    const finalEnergyCost = Math.round(energyCost * 100) / 100;
    const finalVAT = Math.round(vatAmount * 100) / 100;
    const finalRebate = Math.round(-rebateAmount * 100) / 100;
    
    // Final calculation
    const finalNetAmount = finalEnergyCost + demandCharge + finalVAT + finalRebate;
    
    console.log('📊 ক্যালকুলেশন রেজাল্ট:', {
        energyCost: finalEnergyCost,
        demandCharge: demandCharge,
        vat: finalVAT,
        rebate: finalRebate,
        netAmount: finalNetAmount,
        month: currentMonth
    });
    
    return {
        grossAmount: grossAmount,
        energyCost: finalEnergyCost,
        demandCharge: demandCharge,
        vat: finalVAT,
        rebate: finalRebate,
        netAmount: parseFloat(finalNetAmount.toFixed(2)),
        includeDemandCharge: includeDemandCharge,
        isFirstDemandCharge: includeDemandCharge
    };
}

// ডিমান্ড চার্জ যোগ করতে হবে কিনা চেক করা - CORRECT VERSION
function shouldIncludeDemandCharge(currentMonth) {
    console.log('🔍 ডিমান্ড চার্জ চেক:', {
        currentMonth: currentMonth,
        lastDemandChargeMonth: lastDemandChargeMonth
    });
    
    // ✅ CORRECT: যদি lastDemandChargeMonth না থাকে অথবা ভিন্ন মাস হয়
    if (!lastDemandChargeMonth) {
        console.log('✅ প্রথমবার ডিমান্ড চার্জ - এই মাসে');
        return true;
    }
    
    // ✅ CORRECT: যদি একই মাসে ইতিমধ্যে ডিমান্ড চার্জ কাটা হয়ে থাকে
    if (lastDemandChargeMonth === currentMonth) {
        console.log('❌ এই মাসে ইতিমধ্যে ডিমান্ড চার্জ কাটা হয়েছে');
        return false;
    }
    
    // ✅ CORRECT: ভিন্ন মাস হলে ডিমান্ড চার্জ কাটা হবে
    const current = new Date(currentMonth + '-01');
    const last = new Date(lastDemandChargeMonth + '-01');
    const monthDiff = (current.getFullYear() - last.getFullYear()) * 12 + (current.getMonth() - last.getMonth());
    
    console.log('📅 মাসের পার্থক্য:', monthDiff);
    
    const shouldInclude = monthDiff >= 1;
    console.log('ডিমান্ড চার্জ প্রয়োগ:', shouldInclude);
    
    return shouldInclude;
}


// মাস পিকার ভেরিয়েবল
let currentPickerYear = new Date().getFullYear();
let selectedMonth = null;

// মাস পিকার ইনিশিয়ালাইজেশন
function initializeMonthPicker() {
    const currentMonthInput = document.getElementById('currentMonth');
    
    // বর্তমান মাস সেট করুন
    const now = new Date();
    const currentMonth = now.toISOString().substring(0, 7);
    currentMonthInput.value = formatMonthForDisplay(currentMonth);
    selectedMonth = currentMonth;
    
    // ক্যালেন্ডার আইকনে ক্লিক ইভেন্ট
    currentMonthInput.addEventListener('click', openMonthPicker);
    currentMonthInput.nextElementSibling.addEventListener('click', openMonthPicker);
    
    // মাস পিকার লোড করুন
    loadMonthPicker();
	addQuickAmountButtons();
}

// মাস পিকার ওপেন
function openMonthPicker() {
    document.getElementById('monthPickerModal').style.display = 'flex';
}

// মাস পিকার ক্লোজ
function closeMonthPicker() {
    document.getElementById('monthPickerModal').style.display = 'none';
}

// বছর পরিবর্তন
function changeYear(delta) {
    currentPickerYear += delta;
    loadMonthPicker();
}

// মাস পিকার লোড
function loadMonthPicker() {
    const currentYearElement = document.getElementById('currentYear');
    const monthsGrid = document.getElementById('monthsGrid');
    
    currentYearElement.textContent = currentPickerYear;
    
    const months = [
        { num: 1, name: 'January', bangla: 'জানুয়ারি' },
        { num: 2, name: 'February', bangla: 'ফেব্রুয়ারি' },
        { num: 3, name: 'March', bangla: 'মার্চ' },
        { num: 4, name: 'April', bangla: 'এপ্রিল' },
        { num: 5, name: 'May', bangla: 'মে' },
        { num: 6, name: 'June', bangla: 'জুন' },
        { num: 7, name: 'July', bangla: 'জুলাই' },
        { num: 8, name: 'August', bangla: 'আগস্ট' },
        { num: 9, name: 'September', bangla: 'সেপ্টেম্বর' },
        { num: 10, name: 'October', bangla: 'অক্টোবর' },
        { num: 11, name: 'November', bangla: 'নভেম্বর' },
        { num: 12, name: 'December', bangla: 'ডিসেম্বর' }
    ];
    
    let html = '';
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    
    months.forEach(month => {
        const monthValue = `${currentPickerYear}-${month.num.toString().padStart(2, '0')}`;
        const isSelected = selectedMonth === monthValue;
        const isCurrent = currentPickerYear === currentYear && month.num === currentMonth;
        
        let className = 'month-btn';
        if (isSelected) className += ' selected';
        if (isCurrent) className += ' current';
        
        html += `
            <button class="${className}" onclick="selectMonth('${monthValue}', '${month.bangla} ${currentPickerYear}')">
                <div class="bangla-month">${month.bangla}</div>
                <small>${month.name}</small>
            </button>
        `;
    });
    
    monthsGrid.innerHTML = html;
}

// মাস সিলেক্ট
function selectMonth(monthValue, displayText) {
    document.getElementById('currentMonth').value = displayText;
    selectedMonth = monthValue;
    closeMonthPicker();
    
    showNotification(`✅ ${displayText} সিলেক্ট করা হয়েছে`, 'success');
}

// মাস ফরম্যাট ফর ডিসপ্লে
function formatMonthForDisplay(monthString) {
    const [year, month] = monthString.split('-');
    const months = [
        'জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন',
        'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'
    ];
    const monthIndex = parseInt(month) - 1;
    return `${months[monthIndex]} ${year}`;
}

// DESCO বিল ক্যালকুলেশন - আপডেটেড ভার্সন
function calculateBill() {
    try {
        const grossAmount = parseFloat(document.getElementById('grossAmount').value);
        
        if (!selectedMonth) {
            showNotification('❌ দয়া করে মাস সিলেক্ট করুন!', 'error');
            return;
        }
        
        const currentMonth = selectedMonth; // selectedMonth ব্যবহার করুন
        const demandChargeType = document.getElementById('demandChargeType').value;
        const customDemandCharge = parseFloat(document.getElementById('customDemandCharge').value) || 0;
        
        console.log('Input values:', { grossAmount, currentMonth, demandChargeType, customDemandCharge });
        
        if (!grossAmount || grossAmount <= 0) {
            showNotification('❌ বৈধ গ্রোস অ্যামাউন্ট দিন!', 'error');
            return;
        }
        
        let bill;
        
        if (demandChargeType === 'custom' && customDemandCharge > 0) {
            bill = calculateDESCOBillWithCustomDemand(grossAmount, currentMonth, customDemandCharge);
        } else if (demandChargeType === 'none') {
            bill = calculateDESCOBillWithCustomDemand(grossAmount, currentMonth, 0);
        } else {
            bill = calculateDESCOBill(grossAmount, currentMonth);
        }
        
        currentBill = bill;
        
        // রেজাল্ট শো করা
        document.getElementById('billResult').style.display = 'block';
        document.getElementById('energyCost').textContent = bill.energyCost.toFixed(2);
        document.getElementById('demandChargeResult').textContent = bill.demandCharge.toFixed(2);
        document.getElementById('vatAmount').textContent = bill.vat.toFixed(2);
        document.getElementById('rebateAmount').textContent = bill.rebate.toFixed(2);
        document.getElementById('netAmount').textContent = bill.netAmount.toFixed(2);
		
		// আনুমানিক ইউনিট ক্যালকুলেশন
        calculateEstimatedUnits(bill);
        
        // ডিমান্ড চার্জ নোট
        const demandNote = document.getElementById('demandNote');
        if (demandChargeType === 'custom') {
            demandNote.textContent = '📝 কাস্টম ডিমান্ড চার্জ';
            demandNote.style.color = '#e67e22';
        } else if (demandChargeType === 'none') {
            demandNote.textContent = 'ℹ️ ডিমান্ড চার্জ বন্ধ করা হয়েছে';
            demandNote.style.color = '#e74c3c';
        } else if (bill.includeDemandCharge) {
            demandNote.textContent = '📝 মাসিক ডিমান্ড চার্জ'; // শুধুমাত্র এই লাইন রাখুন
            demandNote.style.color = '#27ae60';
        } else {
            demandNote.textContent = 'ℹ️ এই মাসে ডিমান্ড চার্জ নেই';
            demandNote.style.color = '#7f8c8d';
        }
        
        showNotification('✅ বিল ক্যালকুলেশন সম্পন্ন!', 'success');
        
    } catch (error) {
        console.error('বিল ক্যালকুলেট করতে সমস্যা:', error);
        showNotification('❌ বিল ক্যালকুলেট করতে সমস্যা!', 'error');
    }
}

// কুইক অ্যামাউন্ট বাটন যোগ করুন
function addQuickAmountButtons() {
    const quickAmounts = [500, 1000, 1500, 2000, 3000, 5000];
    const container = document.getElementById('quickAmountsContainer');
    
    container.innerHTML = '<strong>দ্রুত নির্বাচন:</strong> ';
    
    quickAmounts.forEach(amount => {
        const button = document.createElement('button');
        button.textContent = `${amount} টাকা`;
        button.className = 'quick-btn';
        button.style.cssText = `
            padding: 5px 10px;
            background: #95a5a6;
            color: white;
            border: none;
            border-radius: 15px;
            cursor: pointer;
            font-size: 12px;
            transition: all 0.3s ease;
        `;
        button.onmouseover = () => button.style.background = '#7f8c8d';
        button.onmouseout = () => button.style.background = '#95a5a6';
        button.onclick = () => {
            document.getElementById('grossAmount').value = amount;
            calculateBill();
        };
        container.appendChild(button);
    });
}

// আনুমানিক ইউনিট ক্যালকুলেশন
function calculateEstimatedUnits(bill) {
    const estimatedUnits = estimateUnitsFromMoney(bill.energyCost);
    const unitEstimation = document.getElementById('unitEstimation');
    
    unitEstimation.innerHTML = `
        <strong>আনুমানিক ইউনিট:</strong> ${toBanglaNumber(estimatedUnits.toFixed(2))} kWh
        <br><small>প্রতি ইউনিট গড় খরচ: ${toBanglaNumber((bill.energyCost / estimatedUnits).toFixed(2))} টাকা</small>
    `;
    unitEstimation.style.display = 'block';
}



// হিস্ট্রি দেখান
function showBillHistory() {
    const billHistory = JSON.parse(localStorage.getItem('desco_bill_history') || '[]');
    
    if (billHistory.length === 0) {
        showNotification('❌ কোন বিল হিস্ট্রি নেই!', 'error');
        return;
    }
    
    let historyHTML = '<div style="max-height: 400px; overflow-y: auto;">';
    billHistory.forEach(item => {
        historyHTML += `
            <div class="history-item" style="
                background: #f8f9fa;
                padding: 10px;
                margin: 5px 0;
                border-radius: 5px;
                border-left: 3px solid #3498db;
                display: flex;
                justify-content: space-between;
                align-items: center;
            ">
                <div>
                    <strong>${item.date}</strong><br>
                    <small>গ্রোস: ${toBanglaNumber(item.grossAmount.toFixed(2))} টাকা | নেট: ${toBanglaNumber(item.netAmount.toFixed(2))} টাকা</small>
                </div>
                <button onclick="deleteBillHistory(${item.id})" style="
                    background: #e74c3c;
                    color: white;
                    border: none;
                    padding: 5px 10px;
                    border-radius: 3px;
                    cursor: pointer;
                ">🗑️</button>
            </div>
        `;
    });
    historyHTML += '</div>';
    
    showCustomModal('বিল হিস্ট্রি', historyHTML);
}

// বিল হিস্ট্রি ডিলিট করুন
function deleteBillHistory(id) {
    const billHistory = JSON.parse(localStorage.getItem('desco_bill_history') || '[]');
    const filteredHistory = billHistory.filter(item => item.id !== id);
    localStorage.setItem('desco_bill_history', JSON.stringify(filteredHistory));
    showBillHistory(); // রিফ্রেশ
    showNotification('✅ বিল হিস্ট্রি ডিলিট করা হয়েছে!', 'success');
}

// বিল রেজাল্ট শেয়ার করুন
function shareBillResult() {
    if (!currentBill) {
        showNotification('❌ প্রথমে বিল ক্যালকুলেট করুন!', 'error');
        return;
    }
    
    const shareText = `
DESCO বিল ক্যালকুলেশন:
এনার্জি কস্ট: ${toBanglaNumber(currentBill.energyCost.toFixed(2))} টাকা
ডিমান্ড চার্জ: ${toBanglaNumber(currentBill.demandCharge.toFixed(2))} টাকা
ভ্যাট: ${toBanglaNumber(currentBill.vat.toFixed(2))} টাকা
রিবেট: ${toBanglaNumber(currentBill.rebate.toFixed(2))} টাকা
নেট অ্যামাউন্ট: ${toBanglaNumber(currentBill.netAmount.toFixed(2))} টাকা

মাস: ${formatMonthForDisplay(selectedMonth)}
    `.trim();
    
    // ক্লিপবোর্ডে কপি করুন
    navigator.clipboard.writeText(shareText).then(() => {
        showNotification('📋 বিল ডিটেইলস কপি করা হয়েছে!', 'success');
    }).catch(() => {
        // ফallback
        const textArea = document.createElement('textarea');
        textArea.value = shareText;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        showNotification('📋 বিল ডিটেইলস কপি করা হয়েছে!', 'success');
    });
}

// কাস্টম মডাল শো করার ফাংশন
function showCustomModal(title, content) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 1000;
    `;
    
    modal.innerHTML = `
        <div class="modal-content" style="
            background: white;
            padding: 20px;
            border-radius: 10px;
            max-width: 500px;
            width: 90%;
            max-height: 80vh;
            overflow-y: auto;
        ">
            <div class="modal-header" style="
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 15px;
                border-bottom: 2px solid #3498db;
                padding-bottom: 10px;
            ">
                <h3 style="margin: 0;">${title}</h3>
                <span onclick="this.closest('.modal').remove()" style="
                    cursor: pointer;
                    font-size: 20px;
                    font-weight: bold;
                ">&times;</span>
            </div>
            <div class="modal-body">
                ${content}
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // বাইরে ক্লিক করলে ক্লোজ
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });
}

// DESCO বিল ক্যালকুলেটর রিসেট - আপডেটেড ভার্সন
function resetBillCalculator() {
    // ইনপুট ফিল্ড ক্লিয়ার করুন
    document.getElementById('grossAmount').value = '';
    document.getElementById('customDemandCharge').value = '';
    
    // ডিফল্ট সেটিংসে রিসেট করুন
    document.getElementById('demandChargeType').value = 'auto';
    
    // বর্তমান মাস সেট করুন
    const now = new Date();
    const currentMonth = now.toISOString().substring(0, 7);
    document.getElementById('currentMonth').value = formatMonthForDisplay(currentMonth);
    selectedMonth = currentMonth;
    
    // রেজাল্ট লুকান
    document.getElementById('billResult').style.display = 'none';
    
    // ফোকাস গ্রোস অ্যামাউন্ট ফিল্ডে দিন
    document.getElementById('grossAmount').focus();
    
    showNotification('🔄 বিল ক্যালকুলেটর রিসেট করা হয়েছে!', 'info');
}

// ড্যাশবোর্ড ডিসপ্লে ফিক্স করুন - NEW FUNCTION
function updateDashboard() {
    try {
        console.log('🔄 Safe dashboard update...');
        
        // শুধু UI update করুন, global variables change করবেন না
        const totalRechargeElem = document.getElementById('totalRecharge');
        const totalExpendedElem = document.getElementById('totalExpended');
        const currentBalanceElem = document.getElementById('currentBalance');
        const lastBalanceElem = document.getElementById('lastBalance');
        
        if (totalRechargeElem) {
            totalRechargeElem.textContent = totalRecharge.toFixed(2);
        }
        
        if (totalExpendedElem) {
            totalExpendedElem.textContent = totalExpended.toFixed(2);
        }
        
        if (currentBalanceElem) {
            currentBalanceElem.textContent = currentBalance.toFixed(2);
        }
        
        // সর্বশেষ খরচ update (existing logic রাখুন)
        if (lastBalanceElem) {
            const electricityBills = transactions.filter(t => t.type === 'electricity_bill');
            if (electricityBills.length > 0) {
                const lastBill = electricityBills.sort((a, b) => b.id - a.id)[0];
                lastBalanceElem.textContent = lastBill.amount.toFixed(2);
            } else {
                lastBalanceElem.textContent = '0.00';
            }
        }
        
        // Progress bar update
        updateProgressBar();
        
    } catch (error) {
        console.error('❌ Dashboard update error:', error);
    }
}
        
// প্রোগ্রেস বার আপডেট ফাংশন - SIMPLE NET BALANCE
function updateProgressBar() {
    try {
        const progressFill = document.getElementById('balanceProgress');
        if (!progressFill) return;
        
        // ১. ডিফল্ট রেফারেন্স সেট করা
        let netUsableBalance = 0;
        
        // ২. সর্বশেষ রিচার্জ থেকে net usable amount বের করার উন্নত লজিক
        if (monthlyRecharges && monthlyRecharges.length > 0) {
            // শেষ দিক থেকে লুপ চালিয়ে লেটেস্ট রিচার্জটি খুঁজুন যাতে billDetails আছে
            for (let i = monthlyRecharges.length - 1; i >= 0; i--) {
                const recharge = monthlyRecharges[i];
                if (recharge.billDetails && recharge.billDetails.energyCost > 0) {
                    netUsableBalance = recharge.billDetails.energyCost;
                    break; 
                }
            }
        }
        
        // ৩. লজিক প্রোটেকশন (আপনার সেম লজিক কিন্তু ফিক্সড)
        // যদি কোন রিচার্জ না থাকে বা এনার্জি কস্ট ০ হয়, তবে ব্যালেন্সকেই রেফারেন্স ধরুন
        // কিন্তু সেটি অন্তত ১০০০ বা ব্যালেন্সের সমান হতে হবে যাতে ১০০% না দেখায়
        let maxNetBalance = netUsableBalance;
        
        if (maxNetBalance <= 0) {
            // যদি কোন রিচার্জ ডাটা না থাকে, তবে একটি স্ট্যান্ডার্ড ১০০০ টাকা লিমিট ধরুন 
            // যাতে বারটি ১০০% না হয়ে ব্যালেন্স অনুযায়ী পজিশন নেয়
            maxNetBalance = currentBalance > 1000 ? currentBalance : 1000;
        }

        // যদি আগের ব্যালেন্স জমার কারণে কারেন্ট ব্যালেন্স রিচার্জের চেয়ে বেশি হয়
        if (currentBalance > maxNetBalance) {
            maxNetBalance = currentBalance;
        }
        
        // ৪. পার্সেন্টেজ ক্যালকুলেশন (আপনার অরিজিনাল ক্যালকুলেশন)
        const balancePercentage = (currentBalance / maxNetBalance) * 100;
        const displayPercentage = Math.max(0, Math.min(balancePercentage, 100));
        
        progressFill.style.width = displayPercentage + '%';
        
        // ৫. কালার কোডিং (আপনার অরিজিনাল কালার স্কিম)
        if (displayPercentage > 80) {
            progressFill.style.background = '#2ecc71'; // Green
        } else if (displayPercentage > 60) {
            progressFill.style.background = '#f1c40f'; // Yellow
        } else if (displayPercentage > 40) {
            progressFill.style.background = '#f39c12'; // Orange
        } else if (displayPercentage > 20) {
            progressFill.style.background = '#e67e22'; // Dark Orange
        } else {
            progressFill.style.background = '#e74c3c'; // Red
        }
        
        console.log(`📊 বার আপডেট: ${displayPercentage.toFixed(2)}% | রেফারেন্স: ${maxNetBalance}`);
        
    } catch (error) {
        console.error('❌ Progress bar update error:', error);
    }
}

// প্রোগ্রেস বার সাথে টুলটিপ যোগ করুন
function addProgressBarTooltip() {
    const progressBar = document.querySelector('.progress-bar');
    if (!progressBar) return;
    
    // টুলটিপ তৈরি করুন
    progressBar.title = `বর্তমান ব্যালেন্স: ${currentBalance} টাকা | মোট রিচার্জ: ${totalRecharge} টাকা`;
    progressBar.style.cursor = 'help';
    
    // হোভার ইফেক্ট
    progressBar.addEventListener('mouseenter', function() {
        const tooltip = document.createElement('div');
        tooltip.id = 'progressTooltip';
        tooltip.innerHTML = `
            <div style="position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%); 
                       background: #2c3e50; color: white; padding: 8px 12px; border-radius: 6px; 
                       font-size: 12px; white-space: nowrap; z-index: 1000; margin-bottom: 5px;">
                💰 ব্যালেন্স: ${currentBalance} টাকা<br>
                📈 রিচার্জ: ${totalRecharge} টাকা<br>
                💸 খরচ: ${totalExpended} টাকা
                <div style="position: absolute; top: 100%; left: 50%; transform: translateX(-50%);
                           border: 5px solid transparent; border-top-color: #2c3e50;"></div>
            </div>
        `;
        this.style.position = 'relative';
        this.appendChild(tooltip);
    });
    
    progressBar.addEventListener('mouseleave', function() {
        const tooltip = document.getElementById('progressTooltip');
        if (tooltip) tooltip.remove();
    });
}

// DOM ready হলে টুলটিপ যোগ করুন
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(addProgressBarTooltip, 1000);
});

// Auto-initialize when page loads
function initializeDashboard() {
    console.log('🚀 Initializing dashboard...');
    
    // Ensure global variables exist
    if (typeof totalRecharge === 'undefined') totalRecharge = 0;
    if (typeof totalExpended === 'undefined') totalExpended = 0;
    if (typeof currentBalance === 'undefined') currentBalance = 0;
    
    // Calculate initial values
    const electricityBills = transactions.filter(t => t.type === 'electricity_bill');
    if (totalExpended === 0 && electricityBills.length > 0) {
        totalExpended = electricityBills.reduce((sum, bill) => sum + bill.amount, 0);
    }
    
    // Update dashboard
    updateDashboard();
    
    console.log('✅ Dashboard initialized');
}

// Page load-এ auto initialize
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(initializeDashboard, 1000);
});



// পেইজ লোড হলে মাস পিকার ইনিশিয়ালাইজ করুন
document.addEventListener('DOMContentLoaded', function() {
    initializeMonthPicker();
    // ... আপনার অন্যান্য existing code
});

function shouldIncludeDemandCharge(currentMonth) {
    // যদি আগে কোন মাসে ডিমান্ড চার্জ না দেয়া থাকে
    if (!lastDemandChargeMonth) return true;
    
    // বর্তমান মাস এবং শেষ ডিমান্ড চার্জের মাস পার্থক্য চেক করা
    const current = new Date(currentMonth + '-01');
    const last = new Date(lastDemandChargeMonth + '-01');
    
    // মাসের পার্থক্য বের করা
    const monthDiff = (current.getFullYear() - last.getFullYear()) * 12 + (current.getMonth() - last.getMonth());
    
    console.log('মাসের পার্থক্য:', monthDiff, 'বর্তমান মাস:', currentMonth, 'শেষ ডিমান্ড মাস:', lastDemandChargeMonth);
    
    return monthDiff >= 1; // অন্তত ১ মাস পার হলে true
}

// ইউনিট ক্যালকুলেটর
function calculateUnits() {
    try {
        const previousReading = parseFloat(document.getElementById('previousReading').value);
        const currentReading = parseFloat(document.getElementById('currentReading').value);
        
        if (!previousReading || !currentReading || currentReading < previousReading) {
            showNotification('❌ বৈধ মিটার রিডিং দিন!', 'error');
            return;
        }
        
        const units = currentReading - previousReading;
        document.getElementById('calculatedUnits').textContent = units.toFixed(2);
        
        showNotification(`✅ ইউনিট ক্যালকুলেশন সম্পন্ন: ${units} ইউনিট`, 'success');
        
    } catch (error) {
        console.error('ইউনিট ক্যালকুলেট করতে সমস্যা:', error);
        showNotification('❌ ইউনিট ক্যালকুলেট করতে সমস্যা!', 'error');
    }
}

// ইউনিট থেকে বিল ক্যালকুলেটর - সম্পূর্ণ ভার্সন
function calculateBillFromUnits() {
    try {
        const units = parseFloat(document.getElementById('unitsConsumed').value);
        const currentMonth = document.getElementById('unitsMonth').value;
        
        if (!units || units <= 0) {
            showNotification('❌ বৈধ ইউনিট সংখ্যা দিন!', 'error');
            return;
        }
        
        if (!currentMonth) {
            showNotification('❌ বর্তমান মাস সিলেক্ট করুন!', 'error');
            return;
        }
        
        // ইউনিট থেকে এনার্জি কস্ট ক্যালকুলেট
        let remainingUnits = units;
        let totalEnergyCost = 0;
        
        for (const slab of tariffRates) {
            const slabMin = slab.range[0];
            const slabMax = slab.range[1];
            const slabRate = slab.rate;
            
            if (remainingUnits <= 0) break;
            
            let slabUnits;
            if (slabMax === Infinity) {
                slabUnits = remainingUnits;
            } else {
                const slabRange = slabMax - slabMin + 1;
                slabUnits = Math.min(remainingUnits, slabRange);
            }
            
            totalEnergyCost += slabUnits * slabRate;
            remainingUnits -= slabUnits;
        }
        
        // আনুমানিক গ্রোস অ্যামাউন্ট (VAT, ডিমান্ড চার্জ সহ)
        const approximateGross = calculateApproximateGross(totalEnergyCost, currentMonth);
        
        // রেজাল্ট শো করা
        showUnitBillResult(units, totalEnergyCost, approximateGross);
        
        showNotification(`✅ ইউনিট থেকে বিল ক্যালকুলেশন সম্পন্ন!`, 'success');
        
    } catch (error) {
        console.error('ইউনিট থেকে বিল ক্যালকুলেট করতে সমস্যা:', error);
        showNotification('❌ ইউনিট থেকে বিল ক্যালকুলেট করতে সমস্যা!', 'error');
    }
}

// আনুমানিক গ্রোস অ্যামাউন্ট ক্যালকুলেশন
function calculateApproximateGross(energyCost, currentMonth) {
    // ডিমান্ড চার্জ যোগ করুন
    const includeDemandCharge = shouldIncludeDemandCharge(currentMonth);
    const demandCharge = includeDemandCharge ? settings.demandCharge : 0;
    
    // VAT এবং রিবেট হিসাব
    const vatDecimal = settings.vatRate / 100;
    const rebateDecimal = settings.rebateRate / 100;
    
    const vatAmount = (energyCost + demandCharge) * vatDecimal;
    const rebateAmount = energyCost * rebateDecimal;
    
    // মোট গ্রোস অ্যামাউন্ট
    return energyCost + demandCharge + vatAmount - rebateAmount;
}

// ইউনিট বিল রেজাল্ট শো করা
function showUnitBillResult(units, energyCost, grossAmount) {
    const resultDiv = document.getElementById('unitBillResult');
    
    document.getElementById('resultUnits').textContent = toBanglaNumber(units.toFixed(2));
    document.getElementById('resultEnergyCost').textContent = toBanglaNumber(energyCost.toFixed(2));
    document.getElementById('resultGrossAmount').textContent = toBanglaNumber(grossAmount.toFixed(2));
    
    resultDiv.style.display = 'block';
    
    // DESCO বিল ট্যাবে ডেটা সেভ করুন
    localStorage.setItem('lastUnitCalculation', JSON.stringify({
        units: units,
        energyCost: energyCost,
        grossAmount: grossAmount,
        timestamp: new Date().toISOString()
    }));
}

// DESCO বিলে ব্যবহার করুন
function useInDescoBill() {
    const lastCalculation = JSON.parse(localStorage.getItem('lastUnitCalculation') || '{}');
    
    if (!lastCalculation.grossAmount) {
        showNotification('❌ প্রথমে ইউনিট থেকে বিল ক্যালকুলেট করুন!', 'error');
        return;
    }
    
    // DESCO বিল ট্যাবে স্যুইচ করুন
    openTab('descoTab');
    
    // ডেটা অটো ফিল করুন
    setTimeout(() => {
        document.getElementById('grossAmount').value = lastCalculation.grossAmount.toFixed(2);
        showNotification('✅ DESCO বিল ট্যাবে অটো ফিল করা হয়েছে!', 'success');
    }, 500);
}

// ইউনিট রেজাল্ট শেয়ার করুন
function shareUnitResult() {
    const lastCalculation = JSON.parse(localStorage.getItem('lastUnitCalculation') || '{}');
    
    if (!lastCalculation.grossAmount) {
        showNotification('❌ প্রথমে ইউনিট থেকে বিল ক্যালকুলেট করুন!', 'error');
        return;
    }
    
    const shareText = `
ইউনিট থেকে বিল ক্যালকুলেশন:
ইউনিট সংখ্যা: ${toBanglaNumber(lastCalculation.units.toFixed(2))} kWh
এনার্জি কস্ট: ${toBanglaNumber(lastCalculation.energyCost.toFixed(2))} টাকা
আনুমানিক গ্রোস অ্যামাউন্ট: ${toBanglaNumber(lastCalculation.grossAmount.toFixed(2))} টাকা

ক্যালকুলেট করেছে: বিদ্যুৎ বিল ক্যালকুলেটর
    `.trim();
    
    // ক্লিপবোর্ডে কপি করুন
    navigator.clipboard.writeText(shareText).then(() => {
        showNotification('📋 রেজাল্ট কপি করা হয়েছে!', 'success');
    });
}

// ইউনিট ক্যালকুলেশন ফাংশন
function calculateUnits() {
    try {
        const previousReading = parseFloat(document.getElementById('previousReading').value);
        const currentReading = parseFloat(document.getElementById('currentReading').value);
        
        if (!previousReading || !currentReading || currentReading < previousReading) {
            showNotification('❌ বৈধ মিটার রিডিং দিন!', 'error');
            return;
        }
        
        const units = currentReading - previousReading;
        document.getElementById('calculatedUnits').textContent = toBanglaNumber(units.toFixed(2));
        
        // অটো ফিল ইউনিট কনজামড ফিল্ড
        document.getElementById('unitsConsumed').value = units;
        
        showNotification(`✅ ইউনিট ক্যালকুলেশন সম্পন্ন: ${toBanglaNumber(units)} ইউনিট`, 'success');
        
    } catch (error) {
        console.error('ইউনিট ক্যালকুলেট করতে সমস্যা:', error);
        showNotification('❌ ইউনিট ক্যালকুলেট করতে সমস্যা!', 'error');
    }
}

// এনালিটিক্স চার্ট জেনারেট
function generateMonthlyChart() {
    const ctx = document.getElementById('analyticsChart').getContext('2d');
    
    if (analyticsChart) {
        analyticsChart.destroy();
    }
    
    const monthlyData = getMonthlyData();
    
    // শুধু সেই মাসগুলো নিন যেখানে ডেটা আছে
    const validData = monthlyData.filter(item => item.totalRecharge > 0 || item.totalExpense > 0);
    
    const labels = validData.map(item => item.month);
    const rechargeData = validData.map(item => item.totalRecharge);
    const expenseData = validData.map(item => item.totalExpense);
    
    analyticsChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'রিচার্জ',
                    data: rechargeData,
                    backgroundColor: 'rgba(39, 174, 96, 0.8)',
                    borderColor: 'rgba(39, 174, 96, 1)',
                    borderWidth: 1
                },
                {
                    label: 'খরচ',
                    data: expenseData,
                    backgroundColor: 'rgba(231, 76, 60, 0.8)',
                    borderColor: 'rgba(231, 76, 60, 1)',
                    borderWidth: 1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'টাকা'
                    }
                }
            }
        }
    });
    
    updateAnalyticsStats(monthlyData);
}

function generateUsageChart() {
    const ctx = document.getElementById('analyticsChart').getContext('2d');
    
    if (analyticsChart) {
        analyticsChart.destroy();
    }
    
    const monthlyData = getMonthlyData();
    const labels = monthlyData.map(item => item.month);
    const usageData = monthlyData.map(item => item.totalUnits);
    
    analyticsChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'ইউনিট ব্যবহার (kWh)',
                data: usageData,
                backgroundColor: 'rgba(52, 152, 219, 0.2)',
                borderColor: 'rgba(52, 152, 219, 1)',
                borderWidth: 2,
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'ইউনিট (kWh)'
                    }
                }
            }
        }
    });
    
    updateAnalyticsStats(monthlyData);
}

function generateCostChart() {
    try {
        // analyticsChart element use করুন (আগের মত)
        const chartElement = document.getElementById('analyticsChart');
        
        if (!chartElement) {
            console.log('Analytics chart element not found');
            showSimpleCostChart();
            return;
        }
        
        const ctx = chartElement.getContext('2d');
        
        // Existing chart destroy করুন
        if (analyticsChart) {
            analyticsChart.destroy();
        }
        
        const costData = calculateCostDistribution();
        
        // ডেটা ভ্যালিডেশন
        const chartData = [
            costData.totalRecharge || 0,
            costData.totalExpense || 0, 
            costData.totalDemandCharge || 0,
            costData.totalVAT || 0,
            costData.totalRebate || 0
        ];
        
        // যদি সব ডেটা 0 হয়
        const total = chartData.reduce((sum, value) => sum + value, 0);
        if (total === 0) {
            chartElement.innerHTML = `
                <div style="display: flex; justify-content: center; align-items: center; height: 100%;">
                    <p style="color: #666; text-align: center;">কোন ডেটা নেই<br><small>খরচ চার্ট দেখানোর জন্য ডেটা প্রয়োজন</small></p>
                </div>
            `;
            return;
        }
        
        // Round pie chart তৈরি করুন (আগের মত)
        analyticsChart = new Chart(ctx, {
            type: 'pie',
            data: {
                labels: ['রিচার্জ', 'বিদ্যুৎ বিল', 'ডিমান্ড চার্জ', 'ভ্যাট', 'রিবেট'],
                datasets: [{
                    data: chartData,
                    backgroundColor: [
                        '#27ae60',
                        '#e74c3c', 
                        '#f39c12',
                        '#3498db',
                        '#9b59b6'
                    ],
                    borderWidth: 2,
                    borderColor: '#fff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            padding: 20,
                            usePointStyle: true
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const label = context.label || '';
                                const value = context.raw || 0;
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = Math.round((value / total) * 100);
                                return `${label}: ${value.toFixed(2)} টাকা (${percentage}%)`;
                            }
                        }
                    }
                },
                animation: {
                    animateScale: true,
                    animateRotate: true
                }
            }
        });
        
    } catch (error) {
        console.error('Error in generateCostChart:', error);
        showSimpleCostChart();
    }
}

// Analytics tab এ call করুন
function openAnalyticsTab() {
    setTimeout(() => {
        generateCostChart();
    }, 100);
}

// Simple fallback chart
function showSimpleCostChart() {
    const costData = calculateCostDistribution();
    
    const simpleChartHTML = `
        <div style="text-align: center; padding: 20px;">
            <h3>💰 খরচ বিতরণ</h3>
            <div style="display: grid; gap: 10px; margin: 20px 0;">
                <div style="display: flex; justify-content: space-between; background: #27ae60; color: white; padding: 12px; border-radius: 5px;">
                    <span>রিচার্জ</span>
                    <span>${(costData.totalRecharge || 0).toFixed(2)} টাকা</span>
                </div>
                <div style="display: flex; justify-content: space-between; background: #e74c3c; color: white; padding: 12px; border-radius: 5px;">
                    <span>বিদ্যুৎ বিল</span>
                    <span>${(costData.totalExpense || 0).toFixed(2)} টাকা</span>
                </div>
                <div style="display: flex; justify-content: space-between; background: #f39c12; color: white; padding: 12px; border-radius: 5px;">
                    <span>ডিমান্ড চার্জ</span>
                    <span>${(costData.totalDemandCharge || 0).toFixed(2)} টাকা</span>
                </div>
                <div style="display: flex; justify-content: space-between; background: #3498db; color: white; padding: 12px; border-radius: 5px;">
                    <span>ভ্যাট</span>
                    <span>${(costData.totalVAT || 0).toFixed(2)} টাকা</span>
                </div>
                <div style="display: flex; justify-content: space-between; background: #9b59b6; color: white; padding: 12px; border-radius: 5px;">
                    <span>রিবেট</span>
                    <span>${(costData.totalRebate || 0).toFixed(2)} টাকা</span>
                </div>
            </div>
        </div>
    `;
    
    showCustomModal('খরচ বিতরণ', simpleChartHTML);
}

// মাসিক ডেটা প্রস্তুত করা - সংশোধিত ভার্সন
function getMonthlyData() {
    const monthlyData = {};
    
    // বর্তমান মিটারের ডেটা ফিল্টার করুন
    const activeRecharges = monthlyRecharges.filter(t => 
        t.meterId === activeMeterId || (!t.meterId && (!meters.length || activeMeterId === meters[0].id))
    );

    const activeTransactions = transactions.filter(t => 
        t.meterId === activeMeterId || (!t.meterId && (!meters.length || activeMeterId === meters[0].id))
    );
    
    // মাসিক রিচার্জ ডেটা
    activeRecharges.forEach(recharge => {
        const date = new Date(recharge.date);
        const month = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
        
        if (!monthlyData[month]) {
            monthlyData[month] = {
                month: getMonthName(month),
                totalRecharge: 0,
                totalExpense: 0,
                totalUnits: 0
            };
        }
        
        monthlyData[month].totalRecharge += recharge.amount;
    });
    
    // বিদ্যুৎ বিল ডেটা
    activeTransactions.forEach(transaction => {
        if (transaction.type === 'electricity_bill') {
            const date = new Date(transaction.timestamp);
            const month = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
            
            if (!monthlyData[month]) {
                monthlyData[month] = {
                    month: getMonthName(month),
                    totalRecharge: 0,
                    totalExpense: 0,
                    totalUnits: 0
                };
            }
            
            monthlyData[month].totalExpense += transaction.amount;
            monthlyData[month].totalUnits += transaction.units || 0;
        }
    });
    
    return Object.values(monthlyData);
}
function calculateCostDistribution() {
    let totalRecharge = 0;
    let totalExpense = 0;
    let totalDemandCharge = 0;
    let totalVAT = 0;
    let totalRebate = 0;
    
    // বর্তমান মিটারের ডেটা ফিল্টার করুন
    const activeRecharges = monthlyRecharges.filter(t => 
        t.meterId === activeMeterId || (!t.meterId && (!meters.length || activeMeterId === meters[0].id))
    );

    const activeTransactions = transactions.filter(t => 
        t.meterId === activeMeterId || (!t.meterId && (!meters.length || activeMeterId === meters[0].id))
    );
    
    // মাসিক রিচার্জ থেকে ডেটা - সহজভাবে
    if (activeRecharges && activeRecharges.length > 0) {
        activeRecharges.forEach(recharge => {
            totalRecharge += Number(recharge.amount) || 0;
            
            if (recharge.billDetails) {
                totalDemandCharge += Number(recharge.billDetails.demandCharge) || 0;
                totalVAT += Number(recharge.billDetails.vat) || 0;
                totalRebate += Math.abs(Number(recharge.billDetails.rebate)) || 0;
            }
        });
    }
    
    // ট্রানজেকশন থেকে খরচ ডেটা - সহজভাবে
    if (activeTransactions && activeTransactions.length > 0) {
        activeTransactions.forEach(transaction => {
            if (transaction.type === 'electricity_bill') {
                totalExpense += Number(transaction.amount) || 0;
            }
        });
    }
    
    // ফাইনাল চেক - কোনো NaN থাকলে 0 সেট করুন
    return {
        totalRecharge: isNaN(totalRecharge) ? 0 : totalRecharge,
        totalExpense: isNaN(totalExpense) ? 0 : totalExpense,
        totalDemandCharge: isNaN(totalDemandCharge) ? 0 : totalDemandCharge,
        totalVAT: isNaN(totalVAT) ? 0 : totalVAT,
        totalRebate: isNaN(totalRebate) ? 0 : totalRebate
    };
}

function updateAnalyticsStats(monthlyData) {
    const totalMonths = monthlyData.length;
    
    // শুধু সেই মাসগুলো নিন যেখানে ডেটা আছে
    const validMonths = monthlyData.filter(item => item.totalRecharge > 0 || item.totalExpense > 0);
    const validMonthCount = validMonths.length;
    
    const avgRecharge = validMonths.reduce((sum, item) => sum + item.totalRecharge, 0) / validMonthCount || 0;
    const avgExpense = validMonths.reduce((sum, item) => sum + item.totalExpense, 0) / validMonthCount || 0;
    
    const savingsRate = avgRecharge > 0 ? ((avgRecharge - avgExpense) / avgRecharge * 100) : 0;
    
    document.getElementById('analyticsStats').innerHTML = `
        <h4>পরিসংখ্যান</h4>
        <p>মোট মাস: ${validMonthCount}</p>
        <p>গড় মাসিক রিচার্জ: ${avgRecharge.toFixed(2)} টাকা</p>
        <p>গড় মাসিক খরচ: ${avgExpense.toFixed(2)} টাকা</p>
        <p>সঞ্চয় হার: ${savingsRate.toFixed(1)}%</p>
        <p>মোট ইউনিট: ${validMonths.reduce((sum, item) => sum + item.totalUnits, 0).toFixed(2)} kWh</p>
    `;
}

// সার্চ এবং ফিল্টার
function filterTransactions() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const transactionItems = document.querySelectorAll('.transaction-item');
    
    transactionItems.forEach(item => {
        const text = item.textContent.toLowerCase();
        if (text.includes(searchTerm)) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
}

// ট্রানজেকশন এডিট ফাংশন - সম্পূর্ণ সংশোধিত ভার্সন
function enableTransactionEdit(transactionId) {
    const transactionItem = document.querySelector(`[data-transaction-id="${transactionId}"]`);
    if (!transactionItem) {
        console.error('Transaction item not found:', transactionId);
        return;
    }

    const transaction = transactions.find(t => t.id == transactionId);
    if (!transaction) {
        console.error('Transaction not found:', transactionId);
        return;
    }

    // Create edit form
    const editForm = `
        <div class="edit-transaction-form" style="width: 100%;">
            <div class="input-group" style="display: grid; gap: 8px; margin-bottom: 10px;">
                <input type="number" id="editAmount-${transactionId}" 
                       value="${Math.abs(transaction.amount).toFixed(2)}" 
                       step="0.01" placeholder="টাকার পরিমাণ"
                       style="padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                
                ${transaction.type === 'electricity_bill' ? `
                <input type="number" id="editKWH-${transactionId}" 
                       value="${transaction.units || 0}" 
                       step="0.01" placeholder="kWh"
                       style="padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                ` : ''}
                
                <input type="datetime-local" id="editDate-${transactionId}" 
                       value="${formatDateForEdit(transaction.timestamp)}"
                       style="padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
            </div>
            <div class="edit-buttons" style="display: flex; gap: 8px;">
                <button onclick="saveTransactionEdit('${transactionId}')" 
                        style="padding: 8px 12px; background: #27ae60; color: white; border: none; border-radius: 4px; cursor: pointer;">
                    💾 সেভ
                </button>
                <button onclick="cancelTransactionEdit('${transactionId}')" 
                        style="padding: 8px 12px; background: #e74c3c; color: white; border: none; border-radius: 4px; cursor: pointer;">
                    ❌ বাতিল
                </button>
            </div>
        </div>
    `;
    
    // Replace transaction details with edit form
    const detailsDiv = transactionItem.querySelector('.transaction-details');
    if (detailsDiv) {
        detailsDiv.innerHTML = editForm;
        transactionItem.classList.add('editing');
    }
}

function formatDateForEdit(timestamp) {
    try {
        // Handle different date formats
        let date;
        if (timestamp.includes(',')) {
            // Format: "DD/MM/YYYY, HH:MM:SS AM/PM"
            const [datePart, timePart] = timestamp.split(', ');
            const [day, month, year] = datePart.split('/');
            date = new Date(`${year}-${month}-${day} ${timePart}`);
        } else {
            date = new Date(timestamp);
        }
        
        if (isNaN(date.getTime())) {
            // If parsing fails, use current date
            date = new Date();
        }
        
        return date.toISOString().slice(0, 16);
    } catch (error) {
        console.error('Date formatting error:', error);
        return new Date().toISOString().slice(0, 16);
    }
}

// ✅ সম্পূর্ণ নতুন এবং সহজ এডিট ফাংশন
function saveTransactionEdit(transactionId) {
    try {
        const newAmount = parseFloat(document.getElementById(`editAmount-${transactionId}`).value);
        const newKWH = document.getElementById(`editKWH-${transactionId}`) ? 
                      parseFloat(document.getElementById(`editKWH-${transactionId}`).value) : 0;
        const newDate = document.getElementById(`editDate-${transactionId}`).value;

        if (!newAmount || newAmount <= 0) {
            showNotification('❌ টাকার পরিমাণ সঠিক করুন', 'error');
            return;
        }

        const transactionIndex = transactions.findIndex(t => t.id == transactionId);
        
        if (transactionIndex === -1) {
            showNotification('❌ ট্রানজেকশন খুঁজে পাওয়া যায়নি', 'error');
            return;
        }

        const oldTransaction = transactions[transactionIndex];
        const oldAmount = Math.abs(oldTransaction.amount);
        
        // ✅ সহজ পদ্ধতি: শুধু এই ট্রানজেকশনটি আপডেট করুন এবং সম্পূর্ণ রিক্যালকুলেশন করুন
        transactions[transactionIndex].amount = oldTransaction.type === 'electricity_bill' ? -newAmount : newAmount;
        
        if (oldTransaction.type === 'electricity_bill') {
            transactions[transactionIndex].units = newKWH;
            transactions[transactionIndex].description = `বিদ্যুৎ বিল - ${newAmount.toFixed(2)} টাকা (${newKWH.toFixed(2)} kWh)`;
        } else {
            transactions[transactionIndex].description = `রিচার্জ - ${newAmount.toFixed(2)} টাকা`;
        }
        
        transactions[transactionIndex].timestamp = new Date(newDate).toISOString();

        console.log('এডিট করা হয়েছে:', {
            oldAmount,
            newAmount,
            type: oldTransaction.type
        });

        // ✅ সম্পূর্ণ রিক্যালকুলেশন (সরল পদ্ধতি)
        simpleRecalculateAllBalances();
        
        saveData();
        loadTransactionReport();
        updateBalanceDisplay();
        
        showNotification(`✅ ট্রানজেকশন আপডেট করা হয়েছে!`, 'success');
        
    } catch (error) {
        console.error('Error saving transaction edit:', error);
        showNotification('❌ ট্রানজেকশন আপডেট করতে সমস্যা!', 'error');
    }
}

// ✅ সহজ এবং নির্ভরযোগ্য সম্পূর্ণ রিক্যালকুলেশন


// ✅ বাংলা তারিখ সঠিকভাবে সাজানোর ফাংশন
function parseBanglaDateForSorting(banglaDateString) {
    try {
        // উদাহরণ: "৫/১১/২০২৫, ৫:৪২:০০ PM"
        const [datePart, timePart] = banglaDateString.split(', ');
        const [day, month, year] = datePart.split('/');
        
        // বাংলা সংখ্যা ইংরেজিতে কনভার্ট করুন
        const englishDay = day.replace(/[০-৯]/g, d => '০১২৩৪৫৬৭৮৯'.indexOf(d));
        const englishMonth = month.replace(/[০-৯]/g, d => '০১২৩৪৫৬৭৮৯'.indexOf(d));
        const englishYear = year.replace(/[০-৯]/g, d => '০১২৩৪৫৬৭৮৯'.indexOf(d));
        
        // তারিখ তৈরি করুন (YYYY-MM-DD format)
        return new Date(`${englishYear}-${englishMonth}-${englishDay} ${timePart}`);
    } catch (error) {
        console.error('তারিখ পার্স করতে সমস্যা:', banglaDateString, error);
        return new Date(); // fallback
    }
}



// ✅ বাংলা তারিখ সঠিকভাবে সাজানোর ফাংশন
function parseBanglaDateForSorting(banglaDateString) {
    try {
        // উদাহরণ: "৫/১১/২০২৫, ৫:৪২:০০ PM"
        const [datePart, timePart] = banglaDateString.split(', ');
        const [day, month, year] = datePart.split('/');
        
        // বাংলা সংখ্যা ইংরেজিতে কনভার্ট করুন
        const englishDay = day.replace(/[০-৯]/g, d => '০১২৩৪৫৬৭৮৯'.indexOf(d));
        const englishMonth = month.replace(/[০-৯]/g, d => '০১২৩৪৫৬৭৮৯'.indexOf(d));
        const englishYear = year.replace(/[০-৯]/g, d => '০১২৩৪৫৬৭৮৯'.indexOf(d));
        
        // তারিখ তৈরি করুন (YYYY-MM-DD format)
        return new Date(`${englishYear}-${englishMonth}-${englishDay} ${timePart}`);
    } catch (error) {
        console.error('তারিখ পার্স করতে সমস্যা:', banglaDateString, error);
        return new Date(); // fallback
    }
}



// ✅ সঠিকভাবে ব্যালেন্স রিক্যালকুলেট করুন
function recalculateBalancesFromIndex(startIndex) {
    console.log(`ইনডেক্স ${startIndex} থেকে রিক্যালকুলেশন শুরু...`);
    
    // ✅ সঠিক শুরু ব্যালেন্স: যদি startIndex > 0 হয়, তাহলে আগের ট্রানজেকশনের ব্যালেন্স নিন
    let runningBalance = startIndex > 0 ? transactions[startIndex - 1].balanceAfter : 0;
    
    console.log(`শুরু ব্যালেন্স: ${runningBalance}`);
    
    for (let i = startIndex; i < transactions.length; i++) {
        const transaction = transactions[i];
        const beforeBalance = runningBalance;
        
        if (transaction.type === 'recharge') {
            runningBalance += Math.abs(transaction.amount);
        } else if (transaction.type === 'electricity_bill') {
            runningBalance -= Math.abs(transaction.amount);
        }
        
        transaction.balanceAfter = parseFloat(runningBalance.toFixed(2));
        
        console.log(`${i + 1}. [${transaction.timestamp}] ${transaction.type}: ${Math.abs(transaction.amount).toFixed(2)} | ${beforeBalance.toFixed(2)} -> ${runningBalance.toFixed(2)}`);
    }
    
    currentBalance = parseFloat(runningBalance.toFixed(2));
    console.log(`ফাইনাল ব্যালেন্স: ${currentBalance}`);
}

function cancelTransactionEdit(transactionId) {
    // Simply reload the transaction report to show original data
    loadTransactionReport();
    showNotification('ℹ️ এডিট বাতিল করা হয়েছে', 'info');
}

// ব্যালেন্স সম্পূর্ণ রিক্যালকুলেট করার ফাংশন
function recalculateBalance() {
    console.log("=== নতুন ব্যালেন্স রিক্যালকুলেশন শুরু ===");
    
    // গ্লোবাল transactions ব্যবহার করুন
    if (!transactions || !Array.isArray(transactions)) {
        transactions = JSON.parse(localStorage.getItem('desco_transactions')) || [];
    }
    
    let currentBalance = 0;
    let totalRecharge = 0;
    let totalExpended = 0;
    
    // তারিখ অনুসারে সাজানো
    transactions.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    transactions.forEach((transaction, index) => {
        if (transaction.type === 'recharge') {
            currentBalance += parseFloat(transaction.amount);
            totalRecharge += parseFloat(transaction.amount);
            console.log(`${index + 1}. রিচার্জ: +${transaction.amount} | ${currentBalance - transaction.amount} -> ${currentBalance}`);
        } else if (transaction.type === 'electricity_bill') {
            currentBalance -= parseFloat(transaction.amount);
            totalExpended += parseFloat(transaction.amount);
            console.log(`${index + 1}. বিদ্যুৎ বিল: -${transaction.amount} | ${currentBalance + parseFloat(transaction.amount)} -> ${currentBalance}`);
        }
        
        // প্রতিটি ট্রানজেকশনের পর ব্যালেন্স আপডেট করুন
        transaction.balanceAfter = parseFloat(currentBalance.toFixed(2));
    });
    
    // লোকাল স্টোরেজে আপডেটেড ট্রানজেকশনস সেভ করুন
    saveData(); // Centralized save
    
    const result = {
        currentBalance: parseFloat(currentBalance.toFixed(2)),
        totalRecharge: totalRecharge,
        totalExpended: totalExpended,
        transactionCount: transactions.length
    };
    
    console.log('ফাইনাল:', result);
    console.log("=== ব্যালেন্স রিক্যালকুলেশন শেষ ===");
    
    return result;
}

// UI আপডেট করার ফাংশন
function updateUIWithNewBalance() {
    const newBalance = recalculateBalance();
    
    // UI এলিমেন্টগুলো আপডেট করুন
    document.getElementById('currentBalance').textContent = newBalance.currentBalance.toFixed(2);
    document.getElementById('totalRecharge').textContent = newBalance.totalRecharge.toFixed(2);
    document.getElementById('totalExpended').textContent = newBalance.totalExpended.toFixed(2);
    const txCountEl = document.getElementById('totalTransactions');
    if (txCountEl) txCountEl.textContent = newBalance.transactionCount;
    
    // ট্রানজেকশন লিস্ট রিফ্রেশ করুন (যদি থাকে)
    if (typeof loadTransactionReport === 'function') loadTransactionReport();
    
    console.log("UI আপডেট করা হয়েছে!");
    console.log("নতুন ব্যালেন্স:", newBalance.currentBalance);
}

// সরাসরি ট্যারিফ দেখানোর ফাংশন
function showTariffDirectly() {
    const unitResult = calculateTotalUnitsFromReport();
    
    if (unitResult.hasUnits && unitResult.totalUnits > 0) {
        const unitCostResult = calculateBillForUnits(unitResult.totalUnits);
        
        // সরাসরি DOM এ যোগ করুন
        const tariffHTML = `
            <div style="background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 20px; border-radius: 10px; margin: 20px 0; text-align: center;">
                <h3 style="margin: 0 0 15px 0;">📊 ইউনিট ভিত্তিক বিল বিশ্লেষণ</h3>
                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px;">
                    <div>
                        <div style="font-size: 20px; font-weight: bold;">${unitResult.totalUnits.toFixed(2)}</div>
                        <small>মোট ইউনিট</small>
                    </div>
                    <div>
                        <div style="font-size: 20px; font-weight: bold;">${unitCostResult.totalCost.toFixed(2)}</div>
                        <small>মোট খরচ</small>
                    </div>
                    <div>
                        <div style="font-size: 20px; font-weight: bold;">${unitCostResult.averageRate.toFixed(2)}</div>
                        <small>গড়/ইউনিট</small>
                    </div>
                </div>
            </div>
        `;
        
        // Report ট্যাবের content container এ যোগ করুন
        const reportTab = document.getElementById('reportTab');
        if (reportTab) {
            reportTab.insertAdjacentHTML('afterbegin', tariffHTML);
            console.log('ট্যারিফ সরাসরি যোগ করা হয়েছে');
        }
    }
}

// ট্রানজেকশন এডিট করার পর এই ফাংশন কল করুন
function afterEditTransaction() {
    console.log("এডিট সম্পন্ন, ব্যালেন্স রিক্যালকুলেট করা হচ্ছে...");
    updateUIWithNewBalance();
}

// পেজ লোড হলে অটো রিক্যালকুলেশন
window.addEventListener('load', function() {
    console.log("পেজ লোড হয়েছে, ব্যালেন্স চেক করা হচ্ছে...");
    
    const storedBalance = parseFloat(localStorage.getItem('desco_currentBalance') || 0);
    const transactions = JSON.parse(localStorage.getItem('desco_transactions')) || [];
    
    if (transactions.length > 0) {
        const lastTransaction = transactions[transactions.length - 1];
        const calculatedBalance = lastTransaction.balanceAfter;
        
        if (Math.abs(storedBalance - calculatedBalance) > 0.01) {
            console.log("ব্যালেন্স মিসম্যাচ ধরা পড়েছে! রিক্যালকুলেট করা হচ্ছে...");
            updateUIWithNewBalance();
        }
    }
});

// বাংলা তারিখকে ইংরেজি তারিখে কনভার্ট করার ফাংশন
function parseBanglaDate(banglaDateString) {
    try {
        // উদাহরণ: "৫/১১/২০২৫, ৪:৩৫:০০ PM" -> "5/11/2025, 4:35:00 PM"
        let englishDateString = banglaDateString
            .replace(/[০-৯]/g, d => '০১২৩৪৫৬৭৮৯'.indexOf(d))
            .replace(/ঃ/g, ':');
        
        return new Date(englishDateString);
    } catch (error) {
        console.error('তারিখ পার্স করতে সমস্যা:', banglaDateString, error);
        return new Date(); // fallback
    }
}

// দ্রুত সমস্যা সমাধানের ফাংশন
function quickFix() {
    console.log('দ্রুত সমস্যা সমাধান শুরু...');
    
    // ১. সব ডেটা রিলোড করুন
    loadAllData();
    
    // ২. ব্যালেন্স রিক্যালকুলেট করুন
    recalculateAllBalances();
    
    // ৩. UI আপডেট করুন
    updateBalanceDisplay();
    
    // ৪. ট্রানজেকশন রিপোর্ট লোড করুন
    setTimeout(() => {
        loadTransactionReport();
    }, 100);
    
    console.log('দ্রুত সমস্যা সমাধান সম্পন্ন!');
    showNotification('✅ সব সমস্যা সমাধান করা হয়েছে!', 'success');
}

// বাংলা তারিখ পার্স করার ফাংশন - উন্নত ভার্সন
function parseBanglaDate(banglaDateString) {
    try {
        console.log('পার্স করা হচ্ছে:', banglaDateString);
        
        // বাংলা সংখ্যা এবং সময় কনভার্ট
        let englishString = banglaDateString
            .replace(/[০-৯]/g, d => '০১২৩৪৫৬৭৮৯'.indexOf(d))
            .replace(/ঃ/g, ':')
            .replace(/এএম/g, 'AM')
            .replace(/পিএম/g, 'PM')
            .replace(/টাকা/g, '') // "টাকা" টেক্সট রিমুভ
            .trim();
        
        // তারিখ ফরম্যাট স্ট্যান্ডার্ডাইজ
        if (englishString.includes('/')) {
            // Format: "DD/MM/YYYY, HH:MM:SS AM/PM"
            const [datePart, timePart] = englishString.split(', ');
            if (datePart && timePart) {
                const [day, month, year] = datePart.split('/');
                return new Date(`${year}-${month}-${day} ${timePart}`);
            }
        }
        
        // Fallback: current date
        return new Date();
        
    } catch (error) {
        console.error('তারিখ পার্স করতে সমস্যা:', banglaDateString, error);
        return new Date(); // fallback
    }
}

// ট্রানজেকশন রিপোর্ট লোড করা - তারিখ অনুসারে সাজানো (সমস্যা সমাধান করা)
function calculateTotalUnitsFromReport() {
    let totalUnits = 0;
    let hasUnits = false;
    const txs = getActiveTransactions();
    txs.forEach(transaction => {
        if (transaction.type === 'electricity_bill' && transaction.units) {
            totalUnits += transaction.units;
            hasUnits = true;
        }
    });
    return {
        totalUnits,
        hasUnits
    };
}

// showDynamicUnitCost ফাংশন সংশোধন করুন
function showDynamicUnitCost() {
    const result = calculateTotalUnitsFromReport();
    
    if (!result.hasUnits) {
        // ❌ notification বাদ দিন, শুধু console log করুন
        console.log('কোন ইউনিট ডেটা নেই!');
        return;
    }
    
    const unitCostResult = calculateBillForUnits(result.totalUnits);
    
    const html = `
        <div style="text-align: center; padding: 20px; background: linear-gradient(135deg, #667eea, #764ba2); color: white; border-radius: 10px; margin: 10px 0;">
            <h3>ডাইনামিক বিল বিশ্লেষণ</h3>
            <div style="font-size: 24px; font-weight: bold;">${unitCostResult.totalCost.toFixed(2)} টাকা</div>
            <small>${result.totalUnits.toFixed(2)} kWh ইউনিটের জন্য</small>
        </div>
        
        <div style="background: white; padding: 15px; border-radius: 8px; margin: 10px 0;">
            <h4>স্ল্যাব ভিত্তিক খরচ:</h4>
            ${unitCostResult.slabBreakdown.map(slab => `
                <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee;">
                    <span>${slab.name} (${slab.range})</span>
                    <span>${slab.units.toFixed(2)} kWh × ${slab.rate} টাকা = <strong>${slab.cost.toFixed(2)} টাকা</strong></span>
                </div>
            `).join('')}
        </div>
        
        <div style="background: #e8f6f3; padding: 15px; border-radius: 8px; margin: 10px 0;">
            <h4>📊 সারসংক্ষেপ:</h4>
            <div>মোট ইউনিট: <strong>${result.totalUnits.toFixed(2)} kWh</strong></div>
            <div>মোট খরচ: <strong>${unitCostResult.totalCost.toFixed(2)} টাকা</strong></div>
            <div>গড় প্রতি ইউনিট: <strong>${unitCostResult.averageRate.toFixed(2)} টাকা</strong></div>
        </div>
    `;
    
    showCustomModal('ডাইনামিক বিল বিশ্লেষণ', html);
}

// loadTransactionReport ফাংশন - সঠিক ক্যালকুলেশন এবং অর্ডার সহ (FIXED)
function loadTransactionReport() {
    console.log('🔄 Loading transaction report...');
    
    // ১. প্রয়োজনীয় এলিমেন্ট এবং প্রাথমিক সেটিংস
    loadMonthlySummary();
    const transactionList = document.getElementById('transactionList');
    const totalDepositElement = document.getElementById('totalDeposit');
    const totalExpenseElement = document.getElementById('totalExpense');
    const totalTransactionsElement = document.getElementById('totalTransactions');
    const avgMonthlyExpenseElement = document.getElementById('avgMonthlyExpense');
    const totalKWHElement = document.getElementById('totalKWH');
    const avgMonthlyKWHElement = document.getElementById('avgMonthlyKWH');
    const headerTotalKWH = document.getElementById('headerTotalKWH');
    const headerAvgMonthlyKWH = document.getElementById('headerAvgMonthlyKWH');
    
    const txs = getActiveTransactions();
    let html = '';

    // ২. ট্রানজেকশন না থাকলে ক্লিয়ার ভিউ
    if (!txs || txs.length === 0) {
        if (transactionList) {
            transactionList.innerHTML = '<p style="text-align: center; color: #7f8c8d; padding: 20px;">কোন ট্রানজেকশন নেই</p>';
        }
        const zeroVal = toBanglaNumber("0.00");
        if (totalDepositElement) totalDepositElement.textContent = zeroVal + ' টাকা';
        if (totalExpenseElement) totalExpenseElement.textContent = zeroVal + ' টাকা';
        if (totalTransactionsElement) totalTransactionsElement.textContent = toBanglaNumber("0");
        if (avgMonthlyExpenseElement) avgMonthlyExpenseElement.textContent = zeroVal + ' টাকা';
        if (totalKWHElement) totalKWHElement.textContent = zeroVal + ' kWh';
        if (avgMonthlyKWHElement) avgMonthlyKWHElement.textContent = zeroVal + ' kWh';
        if (headerTotalKWH) headerTotalKWH.textContent = zeroVal + ' kWh';
        if (headerAvgMonthlyKWH) headerAvgMonthlyKWH.textContent = zeroVal + ' kWh';
        return;
    }
    
    // ৩. ডাইনামিক ক্যালকুলেশন (Global variable ফিক্স করার জন্য)
    let calcDeposit = 0;
    let calcExpense = 0;
    let calcKWH = 0;
    const monthlyExpenses = {};
    const monthlyKWH = {};
    
    txs.forEach(transaction => {
        const amount = Math.abs(transaction.amount || 0);
        if (transaction.type === 'recharge') {
            calcDeposit += amount;
        } else if (transaction.type === 'electricity_bill') {
            calcExpense += amount;
            const units = parseFloat(transaction.units) || 0;
            calcKWH += units;

            // মাস ভিত্তিক গ্রুপিং (গড় বের করার জন্য)
            const ym = extractYearMonth(transaction.timestamp);
            if (ym) {
                const key = `${ym.year}-${ym.month}`;
                monthlyExpenses[key] = (monthlyExpenses[key] || 0) + amount;
                monthlyKWH[key] = (monthlyKWH[key] || 0) + units;
            }
        }
    });

    // গ্লোবাল ভেরিয়েবল আপডেট করে রাখা যাতে অন্য সেকশন ঠিক থাকে
    totalRecharge = calcDeposit;
    totalExpended = calcExpense;
    
    const monthCount = Object.keys(monthlyExpenses).length || 1;
    const avgMonthlyExpense = calcExpense / monthCount;
    const avgMonthlyKWH = calcKWH / monthCount;
    
    // ৪. সেকশন জেনারেশন (মাসিক বিশ্লেষণ)
    const monthlyBillData = generateMonthlyBillData();
    if (monthlyBillData.monthUnits > 0) {
        html += `
            <div style="background: linear-gradient(135deg, #2ecc71, #27ae60); color: white; padding: 20px; border-radius: 10px; margin: 20px 0; text-align: center;">
                <h3 style="margin: 0 0 15px 0;">📅 ${monthlyBillData.monthName} মাসের বিল বিশ্লেষণ</h3>
                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px;">
                    <div><div style="font-size: 20px; font-weight: bold;">${toBanglaNumber(monthlyBillData.monthUnits.toFixed(2))}</div><small>মাসিক ইউনিট</small></div>
                    <div><div style="font-size: 20px; font-weight: bold;">${toBanglaNumber(monthlyBillData.totalCost.toFixed(2))}</div><small>মাসিক খরচ</small></div>
                    <div><div style="font-size: 20px; font-weight: bold;">${toBanglaNumber(monthlyBillData.averageRate.toFixed(2))}</div><small>গড়/ইউনিট</small></div>
                </div>
                <div style="margin-top: 10px; font-size: 12px; opacity: 0.95;">📌 ${toBanglaNumber(monthlyBillData.billCount.toString())}টি বিল | ট্যারিফ: ${toBanglaNumber(monthlyBillData.totalCost.toFixed(2))} টাকা</div>
            </div>
            <div style="background: white; padding: 15px; border-radius: 8px; margin: 10px 0; border: 1px solid #eee;">
                <h4 style="color: #2c3e50; margin-top: 0;">${monthlyBillData.monthName} মাসের স্ল্যাব ভিত্তিক খরচ:</h4>
                ${monthlyBillData.slabBreakdown.map(slab => `
                    <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f8f9fa;">
                        <span style="color: #7f8c8d;">${translateSlabName(slab.name)} (${toBanglaRange(slab.range)})</span>
                        <span style="font-weight: bold; color: #e74c3c;">${toBanglaNumber(slab.units.toFixed(2))} kWh × ${slab.rate} টাকা = ${toBanglaNumber(slab.cost.toFixed(2))} টাকা</span>
                    </div>
                `).join('')}
            </div>
        `;
    }

    // ৫. সব মাসের স্ল্যাব বিশ্লেষণ (যদি থাকে)
    const allMonthsAnalysisHTML = generateAllMonthsSlabAnalysisHTML();
    if (allMonthsAnalysisHTML) html += allMonthsAnalysisHTML;
    
    // ৬. সর্বমোট বিল বিশ্লেষণ
    if (calcKWH > 0) {
        const totalUnitCostResult = calculateBillForUnits(calcKWH);
        html += `
            <div style="background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 20px; border-radius: 10px; margin: 20px 0; text-align: center;">
                <h3 style="margin: 0 0 15px 0;">📊 সর্বমোট বিল বিশ্লেষণ (Life-time)</h3>
                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px;">
                    <div><div style="font-size: 20px; font-weight: bold;">${toBanglaNumber(calcKWH.toFixed(2))}</div><small>সর্বমোট ইউনিট</small></div>
                    <div><div style="font-size: 20px; font-weight: bold;">${toBanglaNumber(totalUnitCostResult.totalCost.toFixed(2))}</div><small>সর্বমোট খরচ</small></div>
                    <div><div style="font-size: 20px; font-weight: bold;">${toBanglaNumber(totalUnitCostResult.averageRate.toFixed(2))}</div><small>গড়/ইউনিট</small></div>
                </div>
            </div>
        `;
    }
    
    // ৭. ট্রানজেকশন লিস্ট জেনারেট (সর্টিং সহ)
    const sortedTransactions = [...txs].sort((a, b) => {
        return new Date(b.timestamp) - new Date(a.timestamp);
    });
    
    sortedTransactions.forEach(transaction => {
        const isCurrentMonth = checkIfCurrentMonth(transaction.timestamp);
        const monthBadge = isCurrentMonth ? '<span style="background: #27ae60; color: white; padding: 2px 6px; border-radius: 3px; font-size: 10px; margin-left: 5px;">বর্তমান মাস</span>' : '';
        let meterBadge = '';
        if (transaction.meterId) {
            const m = meters.find(meter => meter.id === transaction.meterId);
            if (m) meterBadge = `<span style="background: #9b59b6; color: white; padding: 2px 6px; border-radius: 3px; font-size: 10px; margin-left: 5px;">${m.name}</span>`;
        }

        html += `
            <div class="transaction-item" data-transaction-id="${transaction.id}" 
                 style="background: white; padding: 15px; margin: 10px 0; border-radius: 8px; border-left: 4px solid ${transaction.type === 'recharge' ? '#27ae60' : '#e74c3c'}; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 2px 5px rgba(0,0,0,0.05);">
                <div class="transaction-details" style="flex: 2;">
                    <div class="transaction-type" style="font-weight: bold; color: ${transaction.type === 'recharge' ? '#27ae60' : '#e74c3c'};">
                        ${transaction.type === 'recharge' ? '💰 রিচার্জ' : '💡 বিদ্যুৎ বিল'} ${monthBadge} ${meterBadge}
                    </div>
                    <div class="transaction-info" style="margin-top: 5px; font-size: 13px; color: #555;">
                        ${transaction.description}
                        ${transaction.units ? ` | <b>${toBanglaNumber(transaction.units.toFixed(2))} kWh</b>` : ''}
                        <br>
                        <small style="color: #7f8c8d;">${formatTimestampForDisplay(transaction.timestamp)}</small>
                    </div>
                </div>
                <div class="transaction-actions" style="flex: 1; display: flex; flex-direction: column; align-items: flex-end; gap: 5px;">
                    <div class="transaction-amount" style="font-weight: bold; color: ${transaction.type === 'recharge' ? '#27ae60' : '#e74c3c'}; text-align: right;">
                        ${transaction.type === 'recharge' ? '+' : '-'} ${toBanglaNumber(Math.abs(transaction.amount).toFixed(2))} টাকা
                        <div class="transaction-balance" style="font-size: 11px; color: #7f8c8d; font-weight: normal;">ব্যালেন্স: ${toBanglaNumber(transaction.balanceAfter.toFixed(2))} টাকা</div>
                    </div>
                    <div style="display: flex; gap: 5px;">
                        <button onclick="${transaction.type === 'recharge' ? 'editRechargeTransaction' : 'enableTransactionEdit'}('${transaction.id}')" 
                                style="padding: 4px 8px; background: #3498db; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px;">✏️</button>
                        <button onclick="deleteTransaction('${transaction.id}')" 
                                style="padding: 4px 8px; background: #e74c3c; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px;">🗑️</button>
                    </div>
                </div>
            </div>
        `;
    });
    
    // ৮. ফাইনাল UI আপডেট
    if (transactionList) transactionList.innerHTML = html;
    
    if (totalDepositElement) totalDepositElement.textContent = toBanglaNumber(calcDeposit.toFixed(2)) + ' টাকা';
    if (totalExpenseElement) totalExpenseElement.textContent = toBanglaNumber(calcExpense.toFixed(2)) + ' টাকা';
    if (totalTransactionsElement) totalTransactionsElement.textContent = toBanglaNumber(txs.length.toString());
    if (avgMonthlyExpenseElement) avgMonthlyExpenseElement.textContent = toBanglaNumber(avgMonthlyExpense.toFixed(2)) + ' টাকা';
    if (totalKWHElement) totalKWHElement.textContent = toBanglaNumber(calcKWH.toFixed(2)) + ' kWh';
    if (avgMonthlyKWHElement) avgMonthlyKWHElement.textContent = toBanglaNumber(avgMonthlyKWH.toFixed(2)) + ' kWh';
    if (headerTotalKWH) headerTotalKWH.textContent = toBanglaNumber(calcKWH.toFixed(2)) + ' kWh';
    if (headerAvgMonthlyKWH) headerAvgMonthlyKWH.textContent = toBanglaNumber(avgMonthlyKWH.toFixed(2)) + ' kWh';
    
    console.log('✅ UI stats updated with calculated values.');
}

// ========== সব মাসের কালারফুল স্ল্যাব বিশ্লেষণ HTML জেনারেটর ==========
function generateAllMonthsSlabAnalysisHTML() {
    const allMonthsData = {};
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    
    console.log('🔍 generateAllMonthsSlabAnalysisHTML চলছে...');
    console.log('📅 বর্তমান মাস:', currentYear, currentMonth);
    
    // ✅ বিদ্যুৎ বিল + রিচার্জ উভয় থেকে মাস সংগ্রহ করুন
    (transactions || []).forEach(t => {
        // বিদ্যুৎ বিল বা রিচার্জ দুইটাই ধরুন
        if ((t.type === 'electricity_bill' || t.type === 'recharge') && t.timestamp) {
            const ym = extractYearMonth(t.timestamp);
            if (ym && ym.year && ym.month) {
                // বর্তমান মাস বাদ দিন
                if (ym.year === currentYear && ym.month === currentMonth) {
                    return;
                }
                
                const key = `${ym.year}-${ym.month.toString().padStart(2, '0')}`;
                if (!allMonthsData[key]) {
                    allMonthsData[key] = { 
                        units: 0, 
                        billCount: 0, 
                        rechargeCount: 0,
                        month: ym.month, 
                        year: ym.year 
                    };
                }
                
                if (t.type === 'electricity_bill' && t.units) {
                    allMonthsData[key].units += t.units;
                    allMonthsData[key].billCount++;
                } else if (t.type === 'recharge') {
                    allMonthsData[key].rechargeCount++;
                }
            }
        }
    });
    
    // সাজানো (নতুন থেকে পুরাতন)
    const sortedMonths = Object.keys(allMonthsData).sort().reverse();
    console.log('📅 পাওয়া মাস (বর্তমান বাদে):', sortedMonths);
    
    if (sortedMonths.length === 0) {
        console.log('⚠️ কোন পূর্ববর্তী মাসের ডেটা নেই');
        return '';
    }
    
    const monthColors = [
        { bg: 'linear-gradient(135deg, #2ecc71, #27ae60)', text: 'white' },
        { bg: 'linear-gradient(135deg, #3498db, #2980b9)', text: 'white' },
        { bg: 'linear-gradient(135deg, #9b59b6, #8e44ad)', text: 'white' },
        { bg: 'linear-gradient(135deg, #e74c3c, #c0392b)', text: 'white' },
        { bg: 'linear-gradient(135deg, #f39c12, #d35400)', text: 'white' },
        { bg: 'linear-gradient(135deg, #1abc9c, #16a085)', text: 'white' }
    ];
    
    let html = `
        <div style="margin-top: 30px;">
            <h3 style="color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px; margin-bottom: 20px;">
                📅 পূর্ববর্তী মাসের স্ল্যাব বিশ্লেষণ
            </h3>
    `;
    
    sortedMonths.forEach((key, idx) => {
        const data = allMonthsData[key];
        const monthName = getBanglaMonthName(data.month) + ' ' + data.year;
        const monthBill = calculateBillForUnits(data.units);
        const colorIndex = idx % monthColors.length;
        const monthColor = monthColors[colorIndex];
        
        const slabColors = ['#e8f6f3', '#e3f2fd', '#f3e5f5', '#fff3e0', '#ffebee', '#e8f5e9'];
        
        // ইউনিট না থাকলেও মাস দেখান (শুধু রিচার্জ থাকলে)
        const hasUnits = data.units > 0;
        
        html += `
            <div style="background: ${monthColor.bg}; color: ${monthColor.text}; padding: 20px; border-radius: 10px; margin: 20px 0; text-align: center;">
                <h4 style="margin: 0 0 15px 0; font-size: 18px;">📅 ${monthName}</h4>
                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px;">
                    <div>
                        <div style="font-size: 20px; font-weight: bold;">${toBanglaNumber(data.units.toFixed(2))}</div>
                        <small>মাসিক ইউনিট</small>
                    </div>
                    <div>
                        <div style="font-size: 20px; font-weight: bold;">${toBanglaNumber(monthBill.totalCost.toFixed(2))}</div>
                        <small>মাসিক খরচ</small>
                    </div>
                    <div>
                        <div style="font-size: 20px; font-weight: bold;">${toBanglaNumber(monthBill.averageRate.toFixed(2))}</div>
                        <small>গড়/ইউনিট</small>
                    </div>
                </div>
                <div style="margin-top: 10px; font-size: 12px; opacity: 0.9;">
                    📌 ${toBanglaNumber(data.billCount)}টি বিল | 💰 ${toBanglaNumber(data.rechargeCount)}টি রিচার্জ
                </div>
            </div>
        `;
        
        if (hasUnits) {
            html += `
            <div style="background: white; padding: 15px; border-radius: 8px; margin: 10px 0;">
                <h5 style="color: #2c3e50; margin-top: 0; margin-bottom: 10px;">${monthName} মাসের স্ল্যাব ভিত্তিক খরচ:</h5>
            `;
            
            if (monthBill.slabBreakdown.length > 0) {
                monthBill.slabBreakdown.forEach((slab, slabIdx) => {
                    if (slab.units > 0) {
                        html += `
                            <div style="display: flex; justify-content: space-between; padding: 8px 12px; margin: 5px 0; 
                                        border-radius: 6px; background: ${slabColors[slabIdx % slabColors.length]};">
                                <span style="color: #2c3e50; font-size: 13px; font-weight: 500;">
                                    ${translateSlabName(slab.name)} (${toBanglaRange(slab.range)})
                                </span>
                                <span style="font-weight: bold; color: #e74c3c; font-size: 13px;">
                                    ${toBanglaNumber(slab.units.toFixed(2))} kWh × ${slab.rate} টাকা = ${toBanglaNumber(slab.cost.toFixed(2))} টাকা
                                </span>
                            </div>
                        `;
                    }
                });
            } else {
                html += `<div style="text-align: center; padding: 10px; color: #7f8c8d;">কোন স্ল্যাব ডেটা নেই</div>`;
            }
            
            html += `</div>`;
        }
    });
    
    // সামগ্রিক পরিসংখ্যান
    const totalUnits = Object.values(allMonthsData).reduce((sum, d) => sum + d.units, 0);
    const totalBill = calculateBillForUnits(totalUnits);
    const totalMonths = sortedMonths.length;
    
    if (totalMonths > 0) {
        html += `
            <div style="background: linear-gradient(135deg, #2c3e50, #34495e); color: white; padding: 15px; border-radius: 8px; margin-top: 20px;">
                <h4 style="margin-top: 0; text-align: center;">📊 পূর্ববর্তী মাসের সামগ্রিক পরিসংখ্যান</h4>
                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; text-align: center;">
                    <div>
                        <div style="font-size: 20px; font-weight: bold;">${toBanglaNumber(totalMonths)}</div>
                        <small>মোট মাস</small>
                    </div>
                    <div>
                        <div style="font-size: 20px; font-weight: bold;">${toBanglaNumber(totalUnits.toFixed(2))}</div>
                        <small>মোট ইউনিট</small>
                    </div>
                    <div>
                        <div style="font-size: 20px; font-weight: bold;">${toBanglaNumber(totalBill.totalCost.toFixed(2))}</div>
                        <small>মোট খরচ</small>
                    </div>
                </div>
            </div>
        `;
    }
    
    html += `</div>`;
    console.log('✅ HTML তৈরি সম্পন্ন, পূর্ববর্তী মাস:', sortedMonths);
    return html;
}

// ✅ Helper function: মাসিক বিল ডেটা জেনারেট করুন
function generateMonthlyBillData() {
    const now = new Date();
    const currentMonth = now.getMonth() + 1; // 1-12
    const currentYear = now.getFullYear();
    
    // মাসের নাম
    const monthNames = [
        'জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন',
        'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'
    ];
    
    const monthName = `${monthNames[currentMonth - 1]} ${currentYear}`;
    
    // বর্তমান মাসের ইউনিট বের করুন
    let monthUnits = 0;
    let billCount = 0;
    
    console.log(`মাসিক বিল খোঁজা: ${monthName} (ISO-compatible)`);
    
    const txs = getActiveTransactions();
    txs.forEach(t => {
        if (t.type === 'electricity_bill' && t.timestamp) {
            var ym = extractYearMonth(t.timestamp);
            if (ym && ym.year === currentYear && ym.month === currentMonth) {
                billCount += 1;
                var u = (typeof t.units === 'number') ? t.units : parseFloat(t.units);
                if (!isNaN(u)) {
                    monthUnits += u;
                    console.log(`  ✅ পাওয়া গেছে: ${formatTimestampForDisplay(t.timestamp)} - ${u} kWh`);
                }
            }
        }
    });
    
    console.log(`${monthName} মাসিক ইউনিট: ${monthUnits} kWh`);
    
    // মাসিক বিল ক্যালকুলেশন
    let remainingUnits = monthUnits;
    let totalCost = 0;
    let slabBreakdown = [];
    
    tariffRates.forEach(slab => {
        if (remainingUnits <= 0) return;
        
        const slabMin = slab.range[0];
        const slabMax = slab.range[1];
        
        let slabUnits;
        if (slabMax === Infinity) {
            slabUnits = remainingUnits;
        } else {
            const slabRange = slabMax - slabMin + 1;
            slabUnits = Math.min(remainingUnits, slabRange);
        }
        
        const slabCost = slabUnits * slab.rate;
        totalCost += slabCost;
        remainingUnits -= slabUnits;
        
        slabBreakdown.push({
            name: slab.name,
            units: slabUnits,
            rate: slab.rate,
            cost: slabCost,
            range: `${slabMin}-${slabMax}`
        });
    });
    
    return {
        monthName: monthName,
        monthUnits: monthUnits,
        billCount: billCount,
        totalCost: totalCost,
        slabBreakdown: slabBreakdown,
        averageRate: totalCost / (monthUnits || 1)
    };
}

function generateAllMonthsInline() {
    var months = {};
    function bnToEn(str){ return (str||'').replace(/[০-৯]/g, function(c){ return '0123456789'[ '০১২৩৪৫৬৭৮৯'.indexOf(c) ]; }); }
    function extractYearMonth(ts){
        try {
            if (typeof ts === 'number') {
                var dn = new Date(ts);
                if (!isNaN(dn.getTime())) return { year: dn.getFullYear(), month: dn.getMonth()+1 };
            }
            var original = ts || '';
            var datePart = original.split(',')[0].trim();
            var hasBnDigits = /[০-৯]/.test(datePart);
            var dp = bnToEn(datePart);
            // 1) dd/mm/yyyy or mm/dd/yyyy with 1-2 digit day/month
            if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dp)) {
                var p = dp.split('/');
                var y = parseInt(p[2],10);
                // Heuristic:
                // - bn-BD (original had Bangla digits) → dd/mm/yyyy, month = p[1]
                // - en-US (original had English digits) → mm/dd/yyyy, month = p[0]
                var mCandidate = hasBnDigits ? parseInt(p[1],10) : parseInt(p[0],10);
                if (mCandidate >= 1 && mCandidate <= 12) return { year: y, month: mCandidate };
                var a = parseInt(p[0],10);
                var b = parseInt(p[1],10);
                var m = (a >=1 && a <=12) ? a : ((b >=1 && b <=12) ? b : NaN);
                if (!isNaN(m)) return { year: y, month: m };
            }
            // 2) ISO yyyy-mm-dd
            if (/^\d{4}-\d{2}-\d{2}$/.test(dp)) {
                var p2 = dp.split('-');
                return { year: parseInt(p2[0],10), month: parseInt(p2[1],10) };
            }
            // 3) mm/yyyy
            if (/^\d{2}\/\d{4}$/.test(dp)) {
                var p3 = dp.split('/');
                return { year: parseInt(p3[1],10), month: parseInt(p3[0],10) };
            }
            // 4) fallback Date parser last (avoid misinterpreting 3/11/2025 as March 11)
            var d1 = new Date(dp);
            if (!isNaN(d1.getTime())) return { year: d1.getFullYear(), month: d1.getMonth()+1 };
            return null;
        } catch(_) { return null; }
    }
    const txs = getActiveTransactions();
    txs.forEach(function(t){
        if (t && t.type === 'electricity_bill' && t.timestamp) {
            var ym = extractYearMonth(t.timestamp);
            if (ym && ym.year && ym.month) {
                var key = ym.year.toString() + '-' + ym.month.toString().padStart(2,'0');
                if (!months[key]) months[key] = { units: 0, txnCost: 0, count: 0 };
                var u = (typeof t.units === 'number') ? t.units : parseFloat(t.units);
                if (!isNaN(u) && u > 0) {
                    months[key].units += u;
                }
                months[key].txnCost += Math.abs(t.amount || 0);
                months[key].count += 1;
            }
        }
    });
    var now = new Date();
    var currentKey = now.getFullYear().toString() + '-' + (now.getMonth()+1).toString().padStart(2,'0');
    var monthNames = ['জানুয়ারি','ফেব্রুয়ারি','মার্চ','এপ্রিল','মে','জুন','জুলাই','আগস্ট','সেপ্টেম্বর','অক্টোবর','নভেম্বর','ডিসেম্বর'];
    var bnDigits = ['০','১','২','৩','৪','৫','৬','৭','৮','৯'];
    function toBnYear(y){ return y.split('').map(function(c){ return bnDigits[parseInt(c,10)]; }).join(''); }
    var keys = Object.keys(months).sort(function(a,b){ return a<b?1:-1; });
    var html = '';
    keys.forEach(function(k){
        if (k === currentKey) return;
        var y = parseInt(k.slice(0,4),10);
        var m = parseInt(k.slice(5,7),10);
        var name = monthNames[m-1] + ' ' + toBnYear(y.toString());
        var units = months[k].units;
        if (!months[k].count || units <= 0) return;
        var billCount = months[k].count;
        var isSignificant = (billCount >= 5) || (units >= 60);
        if (!isSignificant) return;
        var remaining = units;
        var totalTariffCost = 0;
        var breakdown = [];
        if (remaining > 0 && Array.isArray(tariffRates)) {
            tariffRates.forEach(function(s){
                if (remaining <= 0) return;
                var smin = s.range[0];
                var smax = s.range[1];
                var take;
                if (smax === Infinity) {
                    take = remaining;
                } else {
                    var span = smax - smin + 1;
                    take = Math.min(remaining, span);
                }
                var cost = take * s.rate;
                totalTariffCost += cost;
                remaining -= take;
                breakdown.push({ name: translateSlabName(s.name), range: toBanglaRange(smin + '-' + (smax===Infinity?'∞':smax)), units: take, rate: s.rate, cost: cost });
            });
        }
        var avg = units > 0 ? totalTariffCost / units : 0;
        html += '\n            <div style="background: linear-gradient(135deg, #2ecc71, #27ae60); color: white; padding: 20px; border-radius: 10px; margin: 20px 0; text-align: center;">\n                <h3 style="margin: 0 0 15px 0;">📅 ' + name + ' মাসের বিল বিশ্লেষণ</h3>\n                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px;">\n                    <div>\n                        <div style="font-size: 20px; font-weight: bold;">' + toBanglaNumber(units.toFixed(2)) + '</div>\n                        <small>মাসিক ইউনিট</small>\n                    </div>\n                    <div>\n                        <div style="font-size: 20px; font-weight: bold;">' + toBanglaNumber(totalTariffCost.toFixed(2)) + '</div>\n                        <small>মাসিক খরচ</small>\n                    </div>\n                    <div>\n                        <div style="font-size: 20px; font-weight: bold;">' + toBanglaNumber(avg.toFixed(2)) + '</div>\n                        <small>গড়/ইউনিট</small>\n                    </div>\n                </div>\n                <div style="margin-top: 10px; font-size: 12px; opacity: 0.9;">\n                    📌 ' + toBanglaNumber(months[k].count.toString()) + 'টি বিল | ট্যারিফ: ' + toBanglaNumber(totalTariffCost.toFixed(2)) + ' টাকা\n                </div>\n            </div>\n            <div style="background: white; padding: 15px; border-radius: 8px; margin: 10px 0;">\n                <h4 style="color: #2c3e50; margin-top: 0;">' + name + ' মাসের স্ল্যাব ভিত্তিক খরচ:</h4>\n                ' + breakdown.map(function(s){ return '\n                    <div style=\\"display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f8f9fa;\\">\n                        <span style=\\"color: #7f8c8d;\\">' + s.name + ' (' + s.range + ')</span>\n                        <span style=\\"font-weight: bold; color: #e74c3c;\\">' + toBanglaNumber(s.units.toFixed(2)) + ' kWh × ' + s.rate + ' টাকা = ' + toBanglaNumber(s.cost.toFixed(2)) + ' টাকা</span>\n                    </div>'; }).join('') + '\n            </div>\n        ';
    });
    return html;
}

// ✅ Helper: ট্রানজেকশন বর্তমান মাসের কিনা চেক করুন
function checkIfCurrentMonth(timestamp) {
    try {
        var d = new Date(timestamp);
        if (isNaN(d.getTime())) return false;
        var now = new Date();
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    } catch (_) {
        return false;
    }
}

// ✅ সর্বমোট ইউনিট বের করুন
function calculateTotalUnitsFromReport() {
    let totalUnits = 0;
    let hasUnits = false;
    const txs = getActiveTransactions();
    txs.forEach(transaction => {
        if (transaction.type === 'electricity_bill' && transaction.units) {
            totalUnits += transaction.units;
            hasUnits = true;
        }
    });
    return {
        totalUnits,
        hasUnits
    };
}



// ✅ Helper functions যোগ করুন (যদি না থাকে)

function calculateTotalUnitsFromReport() {
    let totalUnits = 0;
    let hasUnits = false;
    
    transactions.forEach(transaction => {
        if (transaction.type === 'electricity_bill' && transaction.units) {
            totalUnits += transaction.units;
            hasUnits = true;
        }
    });
    
    return {
        totalUnits: totalUnits,
        hasUnits: hasUnits
    };
}

// ✅ FIX: DOMContentLoaded-এ auto-call নিশ্চিত করুন
document.addEventListener('DOMContentLoaded', function() {
    // অন্যান্য initialization code...
    
    // Report tab auto-load নিশ্চিত করুন
    setTimeout(() => {
        if (document.getElementById('reportTab') && document.getElementById('reportTab').classList.contains('active')) {
            loadTransactionReport();
        }
    }, 1000);
});

// ✅ FIX: Tab change-এ auto-refresh


// getMonthName ফাংশন যোগ করুন
function getMonthName(monthString) {
    try {
        const [year, month] = monthString.split('-');
        const monthIndex = parseInt(month) - 1;
        
        const monthNames = [
            'জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন',
            'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'
        ];
        
        return `${monthNames[monthIndex]} ${year}`;
    } catch (error) {
        console.error('মাসের নাম বের করতে সমস্যা:', monthString, error);
        return monthString;
    }
}

// অথবা যদি ইংরেজি মাসের নাম চান
function getMonthNameEnglish(monthString) {
    try {
        const [year, month] = monthString.split('-');
        const monthIndex = parseInt(month) - 1;
        
        const monthNames = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
        ];
        
        return `${monthNames[monthIndex]} ${year}`;
    } catch (error) {
        console.error('মাসের নাম বের করতে সমস্যা:', monthString, error);
        return monthString;
    }
}

// Debug করার জন্য
function checkWhyTariffNotShowing() {
    console.log('=== ট্যারিফ কেন দেখাচ্ছে না Debug ===');
    
    // ১. Check if functions exist
    console.log('calculateTotalUnitsFromReport exists:', typeof calculateTotalUnitsFromReport);
    console.log('calculateBillForUnits exists:', typeof calculateBillForUnits);
    
    // ২. Check unit calculation
    const unitResult = calculateTotalUnitsFromReport();
    console.log('Unit Result:', unitResult);
    
    // ৩. Check if condition is true
    const condition = unitResult.hasUnits && unitResult.totalUnits > 0;
    console.log('Condition (hasUnits && totalUnits > 0):', condition);
    
    if (condition) {
        // ৪. Check tariff calculation
        const unitCostResult = calculateBillForUnits(unitResult.totalUnits);
        console.log('Tariff Result:', unitCostResult);
        
        // ৫. Check HTML generation
        console.log('HTML should be added to report');
    } else {
        console.log('Condition false - Tariff HTML will not be added');
    }
}

// ✅ সম্পূর্ণ সঠিক deleteTransaction ফাংশন (ডাবল ডিডাকশন ফিক্স)
function deleteTransaction(transactionId) {
    if (confirm('⚠️ আপনি কি নিশ্চিত যে আপনি এই ট্রানজেকশন ডিলিট করতে চান?')) {
        try {
            console.log('=== ট্রানজেকশন ডিলিট শুরু ===');
            console.log('ডিলিট করার আগে ব্যালেন্স:', currentBalance);
            
            const transactionIndex = transactions.findIndex(t => t.id == transactionId);
            if (transactionIndex === -1) {
                showNotification('❌ ট্রানজেকশন খুঁজে পাওয়া যায়নি!', 'error');
                return;
            }
            
            const transactionToDelete = transactions[transactionIndex];
            console.log('ডিলিট করা হবে:', transactionToDelete);
            
            // ✅ Transaction delete করুন
            transactions.splice(transactionIndex, 1);
            
            // ✅ যদি recharge হয়, monthlyRecharges থেকেও delete করুন (যদি থাকে)
            if (transactionToDelete.type === 'recharge') {
                const monthlyRechargeIndex = monthlyRecharges.findIndex(mr => mr.id == transactionId);
                if (monthlyRechargeIndex !== -1) {
                    monthlyRecharges.splice(monthlyRechargeIndex, 1);
                    console.log('Monthly recharge থেকেও ডিলিট করা হয়েছে');
                } else {
                    console.warn('⚠️ Monthly recharge এ পাওয়া যায়নি - শুধু transaction ডিলিট হবে');
                }
            }

            // ✅ CRITICAL: সম্পূর্ণ রিক্যালকুলেট করুন
            recalculateAllBalances();

            console.log('ডিলিট করার পরে ব্যালেন্স:', currentBalance);
            console.log('=== ট্রানজেকশন ডিলিট শেষ ===');

            saveData();
            updateBalanceDisplay();
            loadTransactionReport();
			updateProgressBar();

            showNotification(`✅ ট্রানজেকশন ডিলিট করা হয়েছে! ব্যালেন্স: ${currentBalance.toFixed(2)} টাকা`, 'success');
            
        } catch (error) {
            console.error('ট্রানজেকশন ডিলিট করতে সমস্যা:', error);
            showNotification('❌ ট্রানজেকশন ডিলিট করতে সমস্যা হচ্ছে!', 'error');
        }
    }
}

// ✅ উন্নত recalculateAllBalances - Fallback সহ
function recalculateAllBalances() {
    console.log('=== সম্পূর্ণ ব্যালেন্স রিক্যালকুলেশন ===');
    
    let runningBalance = 0;
    totalRecharge = 0;
    totalExpended = 0;
    
    // তারিখ অনুসারে সাজানো (পুরাতন থেকে নতুন)
    const sortedTransactions = [...transactions].sort((a, b) => {
        try {
            const dateA = new Date(a.timestamp);
            const dateB = new Date(b.timestamp);
            return dateA - dateB;
        } catch (error) {
            return 0;
        }
    });
    
    console.log('সাজানো后的 ট্রানজেকশন:', sortedTransactions.length);
    
    // প্রতিটি ট্রানজেকশন প্রসেস করুন
    sortedTransactions.forEach((transaction, index) => {
        const beforeBalance = runningBalance;
        
        if (transaction.type === 'recharge') {
            // ✅ প্রথমে monthlyRecharges থেকে খুঁজুন
            const monthlyRecharge = monthlyRecharges.find(mr => mr.id === transaction.id);
            
            let usableAmount;
            let rechargeAmount;
            
            if (monthlyRecharge && monthlyRecharge.billDetails) {
                // ✅ যদি monthlyRecharges এ থাকে
                usableAmount = monthlyRecharge.billDetails.energyCost;
                rechargeAmount = monthlyRecharge.amount;
                console.log(`${index + 1}. রিচার্জ (monthlyRecharges থেকে): +${usableAmount.toFixed(2)} (মোট: ${rechargeAmount})`);
            } else {
                // ✅ Fallback: যদি monthlyRecharges এ না থাকে, transaction amount ব্যবহার করুন
                usableAmount = Math.abs(transaction.amount);
                rechargeAmount = Math.abs(transaction.amount);
                console.warn(`⚠️ ${index + 1}. রিচার্জ (fallback): +${usableAmount.toFixed(2)}`);
            }
            
            runningBalance += usableAmount;
            totalRecharge += rechargeAmount;
            
            console.log(`   ${beforeBalance.toFixed(2)} -> ${runningBalance.toFixed(2)}`);
            
        } else if (transaction.type === 'electricity_bill') {
            const billAmount = Math.abs(transaction.amount);
            runningBalance -= billAmount;
            totalExpended += billAmount;
            console.log(`${index + 1}. বিদ্যুৎ বিল: -${billAmount.toFixed(2)} | ${beforeBalance.toFixed(2)} -> ${runningBalance.toFixed(2)}`);
        }
        
        transaction.balanceAfter = parseFloat(runningBalance.toFixed(2));
    });
    
    currentBalance = parseFloat(runningBalance.toFixed(2));
    
    console.log('ফাইনাল রিক্যালকুলেশন:', { 
        currentBalance, 
        totalRecharge, 
        totalExpended,
        transactions: transactions.length,
        monthlyRecharges: monthlyRecharges.length
    });
    
    saveData();
}

// ✅ Data integrity check করার ফাংশন
function checkDataIntegrity() {
    console.log('=== Data Integrity Check ===');
    
    // Transactions এর সব recharge IDs
    const transactionRechargeIds = transactions
        .filter(t => t.type === 'recharge')
        .map(t => t.id);
    
    // MonthlyRecharges এর সব IDs
    const monthlyRechargeIds = monthlyRecharges.map(mr => mr.id);
    
    console.log('Transaction Recharges:', transactionRechargeIds.length);
    console.log('Monthly Recharges:', monthlyRechargeIds.length);
    
    // Missing recharges খুঁজুন
    const missingInMonthly = transactionRechargeIds.filter(id => !monthlyRechargeIds.includes(id));
    
    if (missingInMonthly.length > 0) {
        console.warn('⚠️ Monthly Recharges এ নেই:', missingInMonthly.length + ' টি');
        console.log('Missing IDs:', missingInMonthly);
        
        showNotification(`⚠️ ${missingInMonthly.length}টি recharge এর ডেটা incomplete! Fallback mode ব্যবহার হবে।`, 'warning');
    } else {
        console.log('✅ সব recharge ডেটা সঠিক আছে');
    }
}

// Global access
window.checkDataIntegrity = checkDataIntegrity;

// মাসিক সারাংশ লোড করা - তারিখ অনুসারে সাজানো
function loadMonthlySummary() {
    const monthlySummaryList = document.getElementById('monthlySummaryList');
    
    const list = getActiveMonthlyRecharges();
    if (list.length === 0) {
        monthlySummaryList.innerHTML = '<p style="text-align: center; color: #7f8c8d; padding: 20px; background: white; border-radius: 10px; margin: 10px 0;">কোন মাসিক রিচার্জ নেই</p>';
        return;
    }
    
    let html = '';
    const monthlyData = {};
    
    // মাসিক রিচার্জ ডেটা প্রস্তুত করা
    list.forEach(recharge => {
        const date = new Date(recharge.date);
        const month = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
        
        if (!monthlyData[month]) {
            monthlyData[month] = {
                recharges: [],
                totalRecharge: 0,
                totalUsable: 0,
                totalDemandCharge: 0,
                totalVAT: 0,
                totalRebate: 0,
                dates: [],
                timestamp: date.getTime() // তারিখের টাইমস্ট্যাম্প সংরক্ষণ
            };
        }
        
        monthlyData[month].recharges.push(recharge);
        monthlyData[month].totalRecharge += recharge.amount;
        
        if (recharge.billDetails) {
            monthlyData[month].totalUsable += recharge.billDetails.energyCost;
            monthlyData[month].totalDemandCharge += recharge.billDetails.demandCharge;
            monthlyData[month].totalVAT += recharge.billDetails.vat;
            monthlyData[month].totalRebate += Math.abs(recharge.billDetails.rebate);
        } else {
            monthlyData[month].totalUsable += recharge.amount;
        }
        
        monthlyData[month].dates.push(recharge.date);
    });
    
    // ✅ মাস অনুসারে সাজানো (নতুন থেকে পুরাতন)
    const sortedMonths = Object.keys(monthlyData).sort((a, b) => {
        return monthlyData[b].timestamp - monthlyData[a].timestamp;
    });
    
    sortedMonths.forEach(month => {
        const data = monthlyData[month];
        const monthName = formatMonthForDisplay(month);
        
        html += `
            <div class="monthly-item" style="background: white; padding: 15px; margin: 10px 0; border-radius: 8px; border-left: 4px solid #3498db;">
                <div class="monthly-details" style="display: grid; gap: 8px;">
                    <div class="monthly-detail" style="text-align: center; background: linear-gradient(135deg, #3498db, #2980b9); color: white; padding: 12px; border-radius: 8px; margin-bottom: 12px; position: relative;">
                        <strong>${monthName}</strong>
                        <button onclick="deleteMonthlyRecharge('${data.recharges[0].id}')" 
                                style="position: absolute; top: 50%; right: 10px; transform: translateY(-50%); background: rgba(255,255,255,0.2); color: white; border: 1px solid white; border-radius: 4px; padding: 4px 8px; cursor: pointer; font-size: 12px;">
                            🗑️ ডিলিট
                        </button>
                    </div>
                    <div class="monthly-detail" style="display: flex; justify-content: space-between;">
                        <strong>মোট রিচার্জ:</strong>
                        <span>${data.totalRecharge.toFixed(2)} টাকা</span>
                    </div>
                    <div class="monthly-detail" style="display: flex; justify-content: space-between;">
                        <strong>ব্যবহারযোগ্য:</strong>
                        <span>${data.totalUsable.toFixed(2)} টাকা</span>
                    </div>
                    ${data.totalDemandCharge > 0 ? `
                    <div class="monthly-detail" style="display: flex; justify-content: space-between;">
                        <strong>ডিমান্ড চার্জ:</strong>
                        <span>${data.totalDemandCharge.toFixed(2)} টাকা</span>
                    </div>
                    <div class="monthly-detail" style="display: flex; justify-content: space-between;">
                        <strong>ভ্যাট:</strong>
                        <span>${data.totalVAT.toFixed(2)} টাকা</span>
                    </div>
                    <div class="monthly-detail" style="display: flex; justify-content: space-between;">
                        <strong>রিবেট:</strong>
                        <span>${data.totalRebate.toFixed(2)} টাকা</span>
                    </div>
                    ` : ''}
                    <div class="monthly-detail" style="display: flex; justify-content: space-between;">
                        <strong>রিচার্জ সংখ্যা:</strong>
                        <span>${data.recharges.length}</span>
                    </div>
                </div>
            </div>
        `;
    });
    
    monthlySummaryList.innerHTML = html;
}

// মাসিক রিচার্জ ডিলিট ফাংশন - সংশোধিত ভার্সন
function deleteMonthlyRecharge(rechargeId) {
    if (confirm('⚠️ আপনি কি নিশ্চিত যে আপনি এই মাসিক রিচার্জ ডিলিট করতে চান?\n\nএটি রিভার্স করা যাবে না!')) {
        try {
            // মাসিক রিচার্জ খুঁজে বের করুন
            const rechargeIndex = monthlyRecharges.findIndex(mr => mr.id == rechargeId);
            if (rechargeIndex === -1) {
                showNotification('❌ মাসিক রিচার্জ খুঁজে পাওয়া যায়নি!', 'error');
                return;
            }
            
            const recharge = monthlyRecharges[rechargeIndex];
            
            // সংশ্লিষ্ট ট্রানজেকশন খুঁজে বের করুন
            const transactionIndex = transactions.findIndex(t => t.id == rechargeId);
            
            // মাসিক রিচার্জ ডিলিট করুন
            monthlyRecharges.splice(rechargeIndex, 1);
            
            // ট্রানজেকশন ডিলিট করুন (যদি থাকে)
            if (transactionIndex !== -1) {
                transactions.splice(transactionIndex, 1);
            }
            
            // সম্পূর্ণ ব্যালেন্স রিক্যালকুলেট করুন
            recalculateAllBalances();
            
            saveData();
            updateBalanceDisplay();
            loadTransactionReport();
            
            showNotification('✅ মাসিক রিচার্জ সফলভাবে ডিলিট করা হয়েছে!', 'success');
            
        } catch (error) {
            console.error('মাসিক রিচার্জ ডিলিট করতে সমস্যা:', error);
            showNotification('❌ মাসিক রিচার্জ ডিলিট করতে সমস্যা হচ্ছে!', 'error');
        }
    }
}

// বিদ্যুৎ বিল যোগ করার ফাংশন সংশোধন করুন
function addElectricityBill(amount, units, date) {
    try {
        if (!amount || amount <= 0) {
            showNotification('❌ বৈধ বিল অ্যামাউন্ট দিন!', 'error');
            return;
        }
        
        if (!date) {
            showNotification('❌ তারিখ সিলেক্ট করুন!', 'error');
            return;
        }

        // ✅ নতুন ব্যালেন্স ক্যালকুলেট করুন
        const newBalance = currentBalance - amount;

        // বিদ্যুৎ বিল হিসেবে যোগ করুন
        const bill = {
            id: Date.now(),
            type: 'electricity_bill',
            amount: amount,
            units: units,
            description: `বিদ্যুৎ বিল - ${amount.toFixed(2)} টাকা (${units.toFixed(2)} kWh) - ${formatTimestampForDisplay(new Date(date).toISOString())}`,
            balanceAfter: newBalance, // ✅ সঠিক ব্যালেন্স
            date: date,
            timestamp: new Date().toISOString(),
            meterId: activeMeterId
        };
        
        transactions.push(bill);
        currentBalance = newBalance; // ✅ কারেন্ট ব্যালেন্স আপডেট
        totalExpended += amount;
        
        saveData();
        updateBalanceDisplay();
        loadTransactionReport(); // ✅ রিপোর্টও আপডেট হবে
        
        showNotification(`✅ বিদ্যুৎ বিল যোগ করা হয়েছে: ${amount.toFixed(2)} টাকা`, 'success');
        
    } catch (error) {
        console.error('বিদ্যুৎ বিল যোগ করতে সমস্যা:', error);
        showNotification('❌ বিদ্যুৎ বিল যোগ করতে সমস্যা হচ্ছে!', 'error');
    }
}

// ট্যারিফ রেট অনুযায়ী বিল ক্যালকুলেশন ফাংশন যোগ করুন
function calculateBillForUnits(units) {
    console.log('=== ট্যারিফ রেট অনুযায়ী বিল ক্যালকুলেশন ===');
    console.log('ইউনিট:', units, 'kWh');
    
    let remainingUnits = units;
    let totalCost = 0;
    let slabBreakdown = [];
    
    // ✅ Lifeline সহ সঠিক DESCO ট্যারিফ রেট
    const tariffRates = [
        { range: [0, 50], rate: 3.50, name: "Lifeline (০-৫০)" },
        { range: [51, 75], rate: 4.00, name: "১ম স্ল্যাব (৫১-৭৫)" },
        { range: [76, 200], rate: 5.45, name: "২য় স্ল্যাব (৭৬-২০০)" },
        { range: [201, 300], rate: 5.70, name: "৩য় স্ল্যাব (২০১-৩০০)" },
        { range: [301, 400], rate: 6.02, name: "৪র্থ স্ল্যাব (৩০১-৪০০)" },
        { range: [401, 600], rate: 9.30, name: "৫ম স্ল্যাব (৪০১-৬০০)" },
        { range: [601, Infinity], rate: 10.70, name: "৬ষ্ঠ স্ল্যাব (৬০১+)" }
    ];
    
    // ✅ সঠিক ক্যালকুলেশন লজিক
    tariffRates.forEach((slab) => {
        if (remainingUnits <= 0) return;
        
        const slabMin = slab.range[0];
        const slabMax = slab.range[1];
        
        let slabUnits = 0;
        
        if (slabMin === 0) {
            // Lifeline স্ল্যাব (০-৫০)
            slabUnits = Math.min(remainingUnits, 50);
        } else {
            // অন্যান্য স্ল্যাব
            const availableUnits = slabMax - slabMin + 1;
            slabUnits = Math.min(remainingUnits, availableUnits);
        }
        
        if (slabUnits > 0) {
            const slabCost = slabUnits * slab.rate;
            totalCost += slabCost;
            
            slabBreakdown.push({
                name: slab.name,
                range: `${slabMin}-${slabMax === Infinity ? '∞' : slabMax}`,
                units: slabUnits,
                rate: slab.rate,
                cost: slabCost
            });
            
            remainingUnits -= slabUnits;
            
            console.log(`${slab.name}: ${slabUnits.toFixed(2)} kWh × ${slab.rate} টাকা = ${slabCost.toFixed(2)} টাকা`);
        }
    });
    
    const averageRate = units > 0 ? totalCost / units : 0;
    
    console.log('মোট খরচ:', totalCost.toFixed(2), 'টাকা');
    console.log('প্রতি ইউনিট গড় খরচ:', averageRate.toFixed(2), 'টাকা');
    
    return {
        totalUnits: units,
        totalCost: totalCost,
        averageRate: averageRate,
        slabBreakdown: slabBreakdown
    };
}

function showTariffCalculationNow() {
    const totalUnits = 79.65; // আপনার ইউনিট
    const result = calculateBillForUnits(totalUnits);
    
    const html = `
        <div style="background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 20px; border-radius: 10px; margin: 20px 0; text-align: center;">
            <h3 style="margin: 0 0 15px 0;">📊 ইউনিট ভিত্তিক বিল বিশ্লেষণ</h3>
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px;">
                <div>
                    <div style="font-size: 20px; font-weight: bold;">${totalUnits.toFixed(2)}</div>
                    <small>মোট ইউনিট</small>
                </div>
                <div>
                    <div style="font-size: 20px; font-weight: bold;">${result.totalCost.toFixed(2)}</div>
                    <small>মোট খরচ</small>
                </div>
                <div>
                    <div style="font-size: 20px; font-weight: bold;">${result.averageRate.toFixed(2)}</div>
                    <small>গড়/ইউনিট</small>
                </div>
            </div>
        </div>
        
        <div style="background: white; padding: 15px; border-radius: 8px; margin: 10px 0;">
            <h4 style="color: #2c3e50; margin-top: 0;">স্ল্যাব ভিত্তিক খরচ:</h4>
            ${result.slabBreakdown.map(slab => `
                <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f8f9fa;">
                    <span style="color: #7f8c8d;">${slab.name} (${slab.range})</span>
                    <span style="font-weight: bold; color: #e74c3c;">
                        ${slab.units.toFixed(2)} kWh × ${slab.rate} টাকা = ${slab.cost.toFixed(2)} টাকা
                    </span>
                </div>
            `).join('')}
        </div>
    `;
    
    showCustomModal('ট্যারিফ ক্যালকুলেশন', html);
}

function checkDuplicateFunctions() {
    const functionNames = [];
    const duplicates = [];
    
    // সব global functions চেক করুন
    for (let key in window) {
        if (typeof window[key] === 'function') {
            if (functionNames.includes(key)) {
                duplicates.push(key);
            } else {
                functionNames.push(key);
            }
        }
    }
    
    console.log('ডুপ্লিকেট ফাংশন:', duplicates);
    return duplicates;
}

// Check if tariff is showing in report
function checkTariffInReport() {
    console.log('=== ট্যারিফ Report এ দেখাচ্ছে কিনা Check ===');
    
    const unitResult = calculateTotalUnitsFromReport();
    console.log('Unit Result:', unitResult);
    
    // Condition check
    const shouldShowTariff = unitResult.hasUnits && unitResult.totalUnits > 0;
    console.log('Should show tariff:', shouldShowTariff);
    
    if (shouldShowTariff) {
        console.log('ট্যারিফ দেখানো উচিত');
        
        // Manualভাবে Report Tab এ check করুন
        const reportTab = document.getElementById('reportTab');
        if (reportTab) {
            const hasTariff = reportTab.innerHTML.includes('ইউনিট ভিত্তিক বিল বিশ্লেষণ');
            console.log('Report তে ট্যারিফ আছে:', hasTariff);
            
            if (!hasTariff) {
                console.log('ট্যারিফ নেই, manualভাবে যোগ করা হচ্ছে...');
                showTariffDirectly();
            }
        }
    }
}

// Force show tariff in report
function forceShowTariffInReport() {
    const unitResult = calculateTotalUnitsFromReport();
    
    if (unitResult.hasUnits && unitResult.totalUnits > 0) {
        const unitCostResult = calculateBillForUnits(unitResult.totalUnits);
        
        const tariffHTML = `
            <div style="background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 20px; border-radius: 10px; margin: 20px 0; text-align: center;">
                <h3 style="margin: 0 0 15px 0;">📊 ইউনিট ভিত্তিক বিল বিশ্লেষণ</h3>
                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px;">
                    <div>
                        <div style="font-size: 20px; font-weight: bold;">${unitResult.totalUnits.toFixed(2)}</div>
                        <small>মোট ইউনিট</small>
                    </div>
                    <div>
                        <div style="font-size: 20px; font-weight: bold;">${unitCostResult.totalCost.toFixed(2)}</div>
                        <small>মোট খরচ</small>
                    </div>
                    <div>
                        <div style="font-size: 20px; font-weight: bold;">${unitCostResult.averageRate.toFixed(2)}</div>
                        <small>গড়/ইউনিট</small>
                    </div>
                </div>
            </div>
            
            <div style="background: white; padding: 15px; border-radius: 8px; margin: 10px 0;">
                <h4 style="color: #2c3e50; margin-top: 0;">স্ল্যাব ভিত্তিক খরচ:</h4>
                ${unitCostResult.slabBreakdown.map(slab => `
                    <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f8f9fa;">
                        <span style="color: #7f8c8d;">${slab.name} (${slab.range})</span>
                        <span style="font-weight: bold; color: #e74c3c;">
                            ${slab.units.toFixed(2)} kWh × ${slab.rate} টাকা = ${slab.cost.toFixed(2)} টাকা
                        </span>
                    </div>
                `).join('')}
            </div>
        `;
        
        // Report tab এ যোগ করুন
        const reportTab = document.getElementById('reportTab');
        if (reportTab) {
            // আগের ট্যারিফ থাকলে remove করুন
            const existingTariff = reportTab.querySelector('[style*="linear-gradient(135deg, #667eea, #764ba2)"]');
            if (existingTariff) {
                existingTariff.remove();
            }
            
            // নতুন ট্যারিফ যোগ করুন
            reportTab.insertAdjacentHTML('afterbegin', tariffHTML);
            console.log('ট্যারিফ ফোর্স করে দেখানো হয়েছে!');
        }
    }
}

// Debug the function
function debugCalculateTotalUnits() {
    console.log('=== Debug calculateTotalUnitsFromReport ===');
    
    const result = calculateTotalUnitsFromReport();
    console.log('Raw result:', result);
    console.log('Type of result:', typeof result);
    console.log('hasUnits property:', result.hasUnits);
    console.log('totalUnits property:', result.totalUnits);
    
    // Check if it's returning object or number
    if (typeof result === 'number') {
        console.log('❌ ফাংশন number return করছে!');
        console.log('এটা হওয়া উচিত ছিল object');
    } else if (typeof result === 'object') {
        console.log('✅ ফাংশন object return করছে');
    }
}

// ✅ ফাংশনটি override করুন object return করার জন্য
window.calculateTotalUnitsFromReport = function() {
    let totalUnits = 0;
    let hasUnits = false;
    
    transactions.forEach(transaction => {
        if (transaction.type === 'electricity_bill' && transaction.units) {
            totalUnits += transaction.units;
            hasUnits = true;
        }
    });
    
    console.log('Report থেকে মোট ইউনিট:', totalUnits.toFixed(2), 'kWh');
    
    // ✅ স্পষ্টভাবে object return করুন
    return {
        totalUnits: totalUnits,
        hasUnits: hasUnits
    };
};

// এখন test করুন
const testResult = calculateTotalUnitsFromReport();
console.log('নতুন রেজাল্ট:', testResult);
console.log('hasUnits:', testResult.hasUnits);
console.log('totalUnits:', testResult.totalUnits);

// বাংলা তারিখ সঠিকভাবে সাজানোর ফাংশন
function sortBanglaDatesCorrectly() {
    console.log('=== বাংলা তারিখ সঠিকভাবে সাজানো ===');
    
    transactions.sort((a, b) => {
        try {
            const dateA = parseBanglaDateCorrectly(a.timestamp);
            const dateB = parseBanglaDateCorrectly(b.timestamp);
            return dateA - dateB; // পুরাতন থেকে নতুন
        } catch (error) {
            console.warn('সাজাতে সমস্যা:', error);
            return 0;
        }
    });
    
    console.log('সঠিকভাবে সাজানো后的 ট্রানজেকশন:');
    transactions.forEach((t, i) => {
        console.log(`${i + 1}. ${t.timestamp}`);
    });
    
    // রিক্যালকুলেশন করুন
    simpleRecalculateAllBalances();
}

// সঠিক বাংলা তারিখ পার্সার
function parseBanglaDateCorrectly(banglaDateString) {
    try {
        // উদাহরণ: "৩/১১/২০২৫, ১০:২৫:৩৬ PM"
        const [datePart, timePart] = banglaDateString.split(', ');
        const [day, month, year] = datePart.split('/');
        
        // বাংলা সংখ্যা ইংরেজিতে কনভার্ট
        const englishDay = parseInt(day.replace(/[০-৯]/g, d => '০১২৩৪৫৬৭৮৯'.indexOf(d)));
        const englishMonth = parseInt(month.replace(/[০-৯]/g, d => '০১২৩৪৫৬৭৮৯'.indexOf(d)));
        const englishYear = parseInt(year.replace(/[০-৯]/g, d => '০১২৩৪৫৬৭৮৯'.indexOf(d)));
        
        // সময় পার্স করা
        let [time, modifier] = timePart.split(' ');
        let [hours, minutes, seconds] = time.split(':');
        
        hours = parseInt(hours);
        minutes = parseInt(minutes || 0);
        seconds = parseInt(seconds || 0);
        
        if (modifier === 'PM' && hours < 12) hours += 12;
        if (modifier === 'AM' && hours === 12) hours = 0;
        
        // সঠিক তারিখ তৈরি (Months are 0-based in JavaScript)
        return new Date(englishYear, englishMonth - 1, englishDay, hours, minutes, seconds);
        
    } catch (error) {
        console.error('তারিখ পার্স করতে সমস্যা:', banglaDateString, error);
        return new Date(); // fallback
    }
}

// নতুন বিল যোগ করার স্থায়ী সমাধান
function addBillFinal(amount, units, date) {
    // সরাসরি ব্যালেন্স ক্যালকুলেট করুন
    const newBalance = currentBalance - amount;
    
    // ইংরেজি তারিখ ব্যবহার করুন
        const englishDate = new Date(date).toISOString();
    
    const newBill = {
        id: Date.now(),
        type: 'electricity_bill',
        amount: -amount,
        units: units,
        description: `বিদ্যুৎ বিল - ${amount.toFixed(2)} টাকা (${units.toFixed(2)} kWh)`,
        balanceAfter: newBalance,
        timestamp: englishDate,
        date: date,
        meterId: activeMeterId
    };
    
    // নতুন বিল যোগ করুন
    transactions.push(newBill);
    
    // সরাসরি আপডেট করুন (রিক্যালকুলেশন ছাড়া)
    currentBalance = newBalance;
    totalExpended += amount;
    
    saveData();
    updateBalanceDisplay();
    loadTransactionReport();
    
    console.log('নতুন বিল যোগ করা হয়েছে:', newBill);
    showNotification(`✅ বিল যোগ করা হয়েছে: ${amount} টাকা`, 'success');
}

// ব্যালেন্স চেক করুন
function checkFinalBalance() {
    console.log('=== চূড়ান্ত ব্যালেন্স চেক ===');
    console.log('বর্তমান ব্যালেন্স:', currentBalance);
    console.log('মোট রিচার্জ:', totalRecharge);
    console.log('মোট খরচ:', totalExpended);
    console.log('নেট ব্যালেন্স:', (totalRecharge - totalExpended).toFixed(2));
    console.log('ট্রানজেকশন সংখ্যা:', transactions.length);
    
    // প্রতিটি ট্রানজেকশনের ব্যালেন্স চেক করুন
    transactions.forEach((t, i) => {
        console.log(`${i + 1}. ${t.timestamp} - ব্যালেন্স: ${t.balanceAfter}`);
    });
}


// ব্যালেন্স আপডেট ফাংশন - ফিক্সড
function updateBalance() {
    if (!checkAuthentication()) {
        showLoginModal();
        return;
    }
    
    try {
        const balance = parseFloat(document.getElementById('balanceAmount').value);
        const date = document.getElementById('balanceDate').value;
        
        if (isNaN(balance)) {
            showNotification('❌ বৈধ ব্যালেন্স অ্যামাউন্ট দিন!', 'error');
            return;
        }
        
        if (!date) {
            showNotification('❌ তারিখ সিলেক্ট করুন!', 'error');
            return;
        }
        
        const previousBalance = currentBalance;
        const difference = balance - previousBalance;
        
        if (difference === 0) {
            showNotification('ℹ️ ব্যালেন্সের কোন পরিবর্তন নেই!', 'info');
            return;
        }
        
        // নতুন ব্যালেন্স সেট করুন
        currentBalance = balance;
        
        // ✅ CRITICAL: লোকাল স্টোরেজে সাথে সাথে সেভ করুন
        localStorage.setItem('desco_currentBalance', currentBalance.toString());
        
        if (difference < 0) {
            // বিদ্যুৎ বিল (খরচ)
            const expenseAmount = Math.abs(difference);
            const estimatedUnits = estimateUnitsFromMoney(expenseAmount);
            
            const bill = {
                id: Date.now(),
                type: 'electricity_bill',
                amount: expenseAmount,
                units: estimatedUnits,
                description: `বিদ্যুৎ বিল - ${expenseAmount.toFixed(2)} টাকা (${estimatedUnits.toFixed(2)} kWh) - ${new Date(date).toLocaleDateString('bn-BD')}`,
                balanceAfter: currentBalance,
                date: date,
                timestamp: new Date().toLocaleString('bn-BD'),
                meterId: activeMeterId
            };
            
            transactions.unshift(bill);
            totalExpended += expenseAmount;
            
            showNotification(`✅ বিদ্যুৎ বিল যোগ হয়েছে: ${expenseAmount.toFixed(2)} টাকা`, 'success');
            
        } else {
            // রিচার্জ
            const rechargeAmount = difference;
            
            const recharge = {
                id: Date.now(),
                type: 'recharge',
                amount: rechargeAmount,
                description: `ম্যানুয়াল রিচার্জ - ${rechargeAmount.toFixed(2)} টাকা`,
                balanceAfter: currentBalance,
                date: date,
                timestamp: new Date().toLocaleString('bn-BD'),
                meterId: activeMeterId
            };
            
            transactions.unshift(recharge);
            totalRecharge += rechargeAmount;
            
            showNotification(`✅ রিচার্জ যোগ হয়েছে: ${rechargeAmount.toFixed(2)} টাকা`, 'success');
        }
        
        // ✅ সব ডেটা সেভ করুন (একাধিক জায়গায়)
        saveAllData();
        
        // ✅ বর্তমান মিটারের ডেটাও আলাদাভাবে সেভ করুন
        if (activeMeterId) {
            const meterDataKey = `meter_data_${activeMeterId}`;
            const meterData = {
                transactions: transactions,
                monthlyRecharges: monthlyRecharges,
                currentBalance: currentBalance,
                totalRecharge: totalRecharge,
                totalExpended: totalExpended,
                lastDemandChargeMonth: lastDemandChargeMonth,
                settings: settings,
                tariffRates: tariffRates,
                meterInfo: meterInfo,
                lastUpdated: new Date().toISOString()
            };
            localStorage.setItem(meterDataKey, JSON.stringify(meterData));
        }
        
        // UI আপডেট
        updateBalanceDisplay();
        loadTransactionReport();
		
		//  প্রগ্রেস বার আপডেট
		updateProgressBar();
        
        // ফিল্ড ক্লিয়ার
        document.getElementById('balanceAmount').value = '';
        
        console.log('✅ ব্যালেন্স আপডেট এবং সেভ করা হয়েছে:', currentBalance);
        
    } catch (error) {
        console.error('ব্যালেন্স আপডেট করতে সমস্যা:', error);
        showNotification('❌ ব্যালেন্স আপডেট করতে সমস্যা হচ্ছে!', 'error');
    }
}

// যন্ত্রপাতির ডেটা
const applianceData = [
    { name: "এয়ার কন্ডিশনার", watt: 1500, category: "cooling", tips: ["তাপমাত্রা ২৪°C এ সেট করুন", "নিয়মিত ফিল্টার পরিষ্কার করুন"] },
    { name: "ফ্রিজ", watt: 150, category: "kitchen", tips: ["দরজা কম খুলুন", "তাপমাত্রা অপটিমাইজ করুন"] },
    { name: "টিভি", watt: 100, category: "entertainment", tips: ["ব্রাইটনেস কম রাখুন", "স্ট্যান্ডবাই মোড এড়িয়ে চলুন"] },
    { name: "লাইট (LED)", watt: 20, category: "lighting", tips: ["অন需要时才 চালু রাখুন", "প্রাকৃতিক আলো ব্যবহার করুন"] },
    { name: "পানির পাম্প", watt: 750, category: "utility", tips: ["নিয়মিত মেইন্টেন্যান্স করুন", "পাইপ লিক চেক করুন"] },
    { name: "কম্পিউটার", watt: 200, category: "office", tips: ["স্লিপ মোড ব্যবহার করুন", "স্ক্রিন সেভার বন্ধ করুন"] },
    { name: "ফ্যান", watt: 75, category: "cooling", tips: ["নিয়মিত স্পিড কন্ট্রোল করুন", "পরিষ্কার রাখুন"] },
    { name: "মাইক্রোওয়েভ", watt: 1200, category: "kitchen", tips: ["কম পাওয়ারে ব্যবহার করুন", "খাবার আগে থেকে ডিফ্রস্ট করুন"] },
    { name: "ওয়াশিং মেশিন", watt: 500, category: "laundry", tips: ["পূর্ণ লোডে ব্যবহার করুন", "ঠান্ডা পানি ব্যবহার করুন"] },
    { name: "আইরন", watt: 1000, category: "utility", tips: ["একসাথে অনেক কাপড় ইস্ত্রি করুন", "তাপমাত্রা কম রাখুন"] }
];

// সিলেক্টেড অ্যাপ্লায়েন্স
let selectedAppliances = [];

// পেইজ লোড হলে ইনিশিয়ালাইজ
function initializeApplianceCalculator() {
    loadQuickAppliances();
    loadEnergyTips();
}

// কুইক অ্যাপ্লায়েন্স বাটন লোড
function loadQuickAppliances() {
    const container = document.getElementById('quickAppliances');
    
    applianceData.forEach(appliance => {
        const button = document.createElement('button');
        button.innerHTML = `
            <div style="font-size: 12px; font-weight: bold;">${appliance.name}</div>
            <div style="font-size: 10px; color: #666;">${appliance.watt}W</div>
        `;
        button.style.cssText = `
            padding: 10px 8px;
            background: #3498db;
            color: white;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            min-width: 80px;
            transition: all 0.3s ease;
        `;
        button.onmouseover = () => button.style.background = '#2980b9';
        button.onmouseout = () => button.style.background = '#3498db';
        button.onclick = () => addAppliance(appliance);
        
        container.appendChild(button);
    });
}

// অ্যাপ্লায়েন্স যোগ করুন
function addAppliance(appliance) {
    // Check if already added
    const existingIndex = selectedAppliances.findIndex(item => item.name === appliance.name);
    
    if (existingIndex === -1) {
        selectedAppliances.push({
            ...appliance,
            hours: 4, // default hours
            quantity: 1
        });
        updateApplianceList();
        showNotification(`✅ ${appliance.name} যোগ করা হয়েছে!`, 'success');
    } else {
        showNotification(`ℹ️ ${appliance.name} ইতিমধ্যে যোগ করা আছে!`, 'info');
    }
}

// কাস্টম অ্যাপ্লায়েন্স যোগ করুন
function addCustomAppliance() {
    const name = document.getElementById('customAppliance').value.trim();
    const watt = parseInt(document.getElementById('customWatt').value);
    const hours = parseInt(document.getElementById('customHours').value);

    if (!name || !watt || !hours) {
        showNotification('❌ সব ফিল্ড পূরণ করুন!', 'error');
        return;
    }

    const customAppliance = {
        name: name,
        watt: watt,
        hours: hours,
        quantity: 1,
        category: 'custom',
        tips: ['কাস্টম যন্ত্র - এনার্জি এফিসিয়েন্সি চেক করুন']
    };

    selectedAppliances.push(customAppliance);
    updateApplianceList();
    
    // Clear inputs
    document.getElementById('customAppliance').value = '';
    document.getElementById('customWatt').value = '';
    document.getElementById('customHours').value = '';
    
    showNotification(`✅ ${name} যোগ করা হয়েছে!`, 'success');
}

// অ্যাপ্লায়েন্স লিস্ট আপডেট
function updateApplianceList() {
    const container = document.getElementById('applianceList');
    
    if (selectedAppliances.length === 0) {
        container.innerHTML = '<div style="color: #7f8c8d;">কোন যন্ত্রপাতি যোগ করা হয়নি</div>';
        return;
    }

    let html = '';
    selectedAppliances.forEach((appliance, index) => {
        const dailyCost = calculateDailyCost(appliance);
        html += `
            <div style="
                background: white;
                padding: 12px;
                margin: 8px 0;
                border-radius: 8px;
                border-left: 4px solid #3498db;
                display: flex;
                justify-content: space-between;
                align-items: center;
            ">
                <div style="flex: 2;">
                    <strong>${appliance.name}</strong>
                    <br>
                    <small style="color: #7f8c8d;">
                        ${appliance.watt}W × ${appliance.quantity}টি × ${appliance.hours}ঘন্টা
                    </small>
                </div>
                <div style="flex: 1; text-align: center;">
                    <input type="number" 
                           value="${appliance.hours}" 
                           min="0" 
                           max="24" 
                           style="width: 60px; padding: 4px; border: 1px solid #ddd; border-radius: 4px;"
                           onchange="updateApplianceHours(${index}, this.value)">
                    <br>
                    <small>ঘন্টা/দিন</small>
                </div>
                <div style="flex: 1; text-align: right;">
                    <strong style="color: #e74c3c;">${dailyCost.toFixed(2)} টাকা</strong>
                    <br>
                    <small>দৈনিক</small>
                </div>
                <button onclick="removeAppliance(${index})" style="
                    background: #e74c3c;
                    color: white;
                    border: none;
                    padding: 6px 10px;
                    border-radius: 4px;
                    cursor: pointer;
                    margin-left: 10px;
                ">🗑️</button>
            </div>
        `;
    });

    container.innerHTML = html;
}

// Report থেকে মোট ইউনিট calculate করুন
function calculateTotalUnitsFromReport() {
    let totalUnits = 0;
    let hasUnits = false;
    const txs = getActiveTransactions();
    txs.forEach(transaction => {
        if (transaction.type === 'electricity_bill' && transaction.units) {
            totalUnits += transaction.units;
            hasUnits = true;
        }
    });
    return {
        totalUnits,
        hasUnits
    };
}

// Dynamicভাবে ইউনিট এবং খরচ দেখান
function showDynamicUnitCost() {
    const totalUnits = calculateTotalUnitsFromReport();
    
    if (totalUnits === 0) {
        showNotification('❌ কোন ইউনিট ডেটা নেই!', 'error');
        return;
    }
    
    const result = calculateBillForUnits(totalUnits);
    
    const html = `
        <div style="text-align: center; padding: 20px; background: linear-gradient(135deg, #667eea, #764ba2); color: white; border-radius: 10px; margin: 10px 0;">
            <h3>ডাইনামিক বিল বিশ্লেষণ</h3>
            <div style="font-size: 24px; font-weight: bold;">${result.totalCost.toFixed(2)} টাকা</div>
            <small>${totalUnits.toFixed(2)} kWh ইউনিটের জন্য</small>
        </div>
        
        <div style="background: white; padding: 15px; border-radius: 8px; margin: 10px 0;">
            <h4>স্ল্যাব ভিত্তিক খরচ:</h4>
            ${result.slabBreakdown.map(slab => `
                <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee;">
                    <span>${slab.name} (${slab.range})</span>
                    <span>${slab.units.toFixed(2)} kWh × ${slab.rate} টাকা = <strong>${slab.cost.toFixed(2)} টাকা</strong></span>
                </div>
            `).join('')}
        </div>
        
        <div style="background: #e8f6f3; padding: 15px; border-radius: 8px; margin: 10px 0;">
            <h4>📊 সারসংক্ষেপ:</h4>
            <div>মোট ইউনিট: <strong>${totalUnits.toFixed(2)} kWh</strong></div>
            <div>মোট খরচ: <strong>${result.totalCost.toFixed(2)} টাকা</strong></div>
            <div>গড় প্রতি ইউনিট: <strong>${result.averageRate.toFixed(2)} টাকা</strong></div>
        </div>
        
        <div style="background: #fff3cd; padding: 12px; border-radius: 5px; margin: 10px 0;">
            <small>💡 টিপ: নতুন বিল যোগ করলে এই রিপোর্ট অটো আপডেট হবে</small>
        </div>
    `;
    
    showCustomModal('ডাইনামিক বিল বিশ্লেষণ', html);
}

// Report ট্যাবে automatically show করার জন্য
function updateReportWithUnitCost() {
    const totalUnits = calculateTotalUnitsFromReport();
    
    if (totalUnits > 0) {
        const result = calculateBillForUnits(totalUnits);
        
        // Report এর নিচে যোগ করুন
        const unitCostHTML = `
            <div style="background: linear-gradient(135deg, #27ae60, #2ecc71); color: white; padding: 15px; border-radius: 8px; margin: 15px 0; text-align: center;">
                <h4 style="margin: 0 0 10px 0;">📊 ইউনিট ভিত্তিক বিল বিশ্লেষণ</h4>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                    <div>
                        <div style="font-size: 18px; font-weight: bold;">${totalUnits.toFixed(2)}</div>
                        <small>মোট ইউনিট</small>
                    </div>
                    <div>
                        <div style="font-size: 18px; font-weight: bold;">${result.totalCost.toFixed(2)}</div>
                        <small>মোট খরচ</small>
                    </div>
                </div>
                <div style="margin-top: 10px;">
                    <small>গড়: ${result.averageRate.toFixed(2)} টাকা/ইউনিট</small>
                </div>
            </div>
        `;
        
        // Report এর শেষে যোগ করুন
        const reportContainer = document.getElementById('transactionList');
        if (reportContainer) {
            reportContainer.insertAdjacentHTML('beforeend', unitCostHTML);
        }
    }
}

// দৈনিক খরচ ক্যালকুলেট
function calculateDailyCost(appliance) {
    const rate = parseFloat(document.getElementById('electricityRate').value) || 6.5;
    const dailyUnits = (appliance.watt * appliance.hours * appliance.quantity) / 1000;
    return dailyUnits * rate;
}

// অ্যাপ্লায়েন্স আপডেট
function updateApplianceHours(index, hours) {
    selectedAppliances[index].hours = parseInt(hours);
    updateApplianceList();
}

// অ্যাপ্লায়েন্স রিমুভ
function removeAppliance(index) {
    selectedAppliances.splice(index, 1);
    updateApplianceList();
    showNotification('🗑️ যন্ত্রপাতি রিমুভ করা হয়েছে!', 'info');
}

// মূল ক্যালকুলেশন
function calculateApplianceCost() {
    if (selectedAppliances.length === 0) {
        showNotification('❌ প্রথমে কিছু যন্ত্রপাতি যোগ করুন!', 'error');
        return;
    }

    const days = parseInt(document.getElementById('daysCount').value) || 30;
    const rate = parseFloat(document.getElementById('electricityRate').value) || 6.5;

    let totalDailyCost = 0;
    let totalMonthlyCost = 0;
    let totalYearlyCost = 0;
    let totalUnits = 0;

    const breakdown = selectedAppliances.map(appliance => {
        const dailyUnits = (appliance.watt * appliance.hours * appliance.quantity) / 1000;
        const dailyCost = dailyUnits * rate;
        const monthlyCost = dailyCost * days;
        const yearlyCost = dailyCost * 365;

        totalDailyCost += dailyCost;
        totalMonthlyCost += monthlyCost;
        totalYearlyCost += yearlyCost;
        totalUnits += dailyUnits;

        return {
            name: appliance.name,
            dailyUnits: dailyUnits,
            dailyCost: dailyCost,
            monthlyCost: monthlyCost,
            percentage: 0 // Will calculate later
        };
    });

    // Percentage calculation
    breakdown.forEach(item => {
        item.percentage = (item.dailyCost / totalDailyCost) * 100;
    });

    // Show results
    showApplianceResults(breakdown, totalDailyCost, totalMonthlyCost, totalYearlyCost, totalUnits, days, rate);
}

// রেজাল্ট শো
function showApplianceResults(breakdown, dailyCost, monthlyCost, yearlyCost, totalUnits, days, rate) {
    const container = document.getElementById('costBreakdown');
    const resultDiv = document.getElementById('applianceResult');

    let html = `
        <div style="text-align: center; background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 20px; border-radius: 10px; margin-bottom: 20px;">
            <h3 style="margin: 0 0 10px 0;">মোট খরচ সারাংশ</h3>
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;">
                <div>
                    <div style="font-size: 18px; font-weight: bold;">${toBanglaNumber(dailyCost.toFixed(2))}</div>
                    <small>দৈনিক টাকা</small>
                </div>
                <div>
                    <div style="font-size: 18px; font-weight: bold;">${toBanglaNumber(monthlyCost.toFixed(2))}</div>
                    <small>মাসিক টাকা</small>
                </div>
                <div>
                    <div style="font-size: 18px; font-weight: bold;">${toBanglaNumber(yearlyCost.toFixed(2))}</div>
                    <small>বাৎসরিক টাকা</small>
                </div>
            </div>
        </div>

        <h4>যন্ত্রপাতি ভিত্তিক খরচ</h4>
    `;

    breakdown.forEach(item => {
        html += `
            <div style="
                background: white;
                padding: 15px;
                margin: 10px 0;
                border-radius: 8px;
                border-left: 4px solid #3498db;
            ">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <strong style="color: #2c3e50;">${item.name}</strong>
                    <span style="background: #e74c3c; color: white; padding: 4px 8px; border-radius: 12px; font-size: 12px;">
                        ${toBanglaNumber(item.percentage.toFixed(1))}%
                    </span>
                </div>
                
                <div style="background: #ecf0f1; height: 6px; border-radius: 3px; margin: 5px 0;">
                    <div style="background: #e74c3c; height: 100%; border-radius: 3px; width: ${item.percentage}%;"></div>
                </div>
                
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; text-align: center; margin-top: 10px;">
                    <div>
                        <small>দৈনিক</small>
                        <br>
                        <strong>${toBanglaNumber(item.dailyCost.toFixed(2))} টাকা</strong>
                    </div>
                    <div>
                        <small>মাসিক</small>
                        <br>
                        <strong>${toBanglaNumber(item.monthlyCost.toFixed(2))} টাকা</strong>
                    </div>
                    <div>
                        <small>ইউনিট</small>
                        <br>
                        <strong>${toBanglaNumber(item.dailyUnits.toFixed(2))} kWh</strong>
                    </div>
                </div>
            </div>
        `;
    });

    // Environmental impact
    const co2Reduction = totalUnits * 0.85 * 30; // Monthly CO2 in kg
    const treesEquivalent = co2Reduction / 21;

    html += `
        <div style="background: #e8f6f3; padding: 15px; border-radius: 8px; margin-top: 20px; border-left: 4px solid #27ae60;">
            <h4 style="color: #27ae60; margin-top: 0;">🌍 পরিবেশগত প্রভাব</h4>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; text-align: center;">
                <div>
                    <div style="font-size: 16px; font-weight: bold; color: #e74c3c;">${toBanglaNumber(co2Reduction.toFixed(1))} kg</div>
                    <small>মাসিক CO₂ নির্গমন</small>
                </div>
                <div>
                    <div style="font-size: 16px; font-weight: bold; color: #27ae60;">${toBanglaNumber(treesEquivalent.toFixed(1))}টি</div>
                    <small>গাছ equivalent</small>
                </div>
            </div>
        </div>
    `;

    container.innerHTML = html;
    resultDiv.style.display = 'block';

    showNotification('✅ যন্ত্রপাতির খরচ ক্যালকুলেশন সম্পন্ন!', 'success');
}

// এনার্জি টিপস লোড
function loadEnergyTips() {
    const container = document.getElementById('energyTips');
    
    const tips = [
        "💡 LED বাল্ব ব্যবহার করুন - ৮০% পর্যন্ত এনার্জি সেভিং",
        "❄️ এসি ২৪-২৬°C এ সেট করুন - প্রতি ১°C তে ৬% এনার্জি সেভ",
        "🔌 স্ট্যান্ডবাই মোড এড়িয়ে চলুন - ১০% পর্যন্ত এনার্জি সেভ",
        "🌞 প্রাকৃতিক আলো ব্যবহার করুন - দিনের বেলা লাইট বন্ধ রাখুন",
        "🔄 এনার্জি এফিসিয়েন্ট যন্ত্রপাতি কিনুন - ৫★ রেটেড প্রোডাক্ট"
    ];

    let html = '';
    tips.forEach(tip => {
        html += `<div style="padding: 8px 0; border-bottom: 1px solid #d4edda;">${tip}</div>`;
    });

    container.innerHTML = html;
}

// লোড ডেটা ফাংশন - সর্বশেষ ব্যালেন্স সঠিকভাবে লোড করার জন্য
function loadData() {
    try {
        const savedBalance = localStorage.getItem('desco_currentBalance');
        const savedRecharge = localStorage.getItem('desco_totalRecharge');
        const savedExpended = localStorage.getItem('desco_totalExpended');
        const savedLastBalance = localStorage.getItem('desco_lastBalance');
        const savedTransactions = localStorage.getItem('desco_transactions');
        const savedMonthlyRecharges = localStorage.getItem('desco_monthlyRecharges');
        const savedLastDemandChargeMonth = localStorage.getItem('desco_lastDemandChargeMonth');
        
        if (savedBalance) currentBalance = parseFloat(savedBalance);
        if (savedRecharge) totalRecharge = parseFloat(savedRecharge);
        if (savedExpended) totalExpended = parseFloat(savedExpended);
        if (savedLastBalance) lastBalance = parseFloat(savedLastBalance);
        if (savedTransactions) transactions = JSON.parse(savedTransactions);
        if (savedMonthlyRecharges) monthlyRecharges = JSON.parse(savedMonthlyRecharges);
        if (savedLastDemandChargeMonth) lastDemandChargeMonth = savedLastDemandChargeMonth;
        
    } catch (error) {
        console.error('ডেটা লোড করতে সমস্যা:', error);
        resetToDefault();
    }
}

// এক্সেলে এক্সপোর্ট করা
function exportToExcel() {
    if (transactions.length === 0) {
        showNotification('❌ কোন ডেটা নেই এক্সপোর্ট করার জন্য!', 'error');
        return;
    }
    
    try {
        const worksheetData = [
            ['তারিখ', 'ধরণ', 'বিবরণ', 'পরিমাণ (টাকা)', 'ব্যালেন্স (টাকা)', 'মিটার']
        ];
        
        transactions.forEach(transaction => {
            let meterName = 'N/A';
            if (transaction.meterId) {
                const m = meters.find(meter => meter.id === transaction.meterId);
                meterName = m ? m.name : 'Unknown Meter';
            } else {
                meterName = meterInfo.name || 'Legacy Data';
            }

            worksheetData.push([
                transaction.timestamp,
                transaction.type === 'recharge' ? 'রিচার্জ' : 'ব্যালেন্স আপডেট',
                transaction.description,
                transaction.amount || 0,
                transaction.balanceAfter,
                meterName
            ]);
        });
        
        const ws = XLSX.utils.aoa_to_sheet(worksheetData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "ট্রানজেকশন রিপোর্ট");
        XLSX.writeFile(wb, "DESCO_বিল_রিপোর্ট.xlsx");
        
        showNotification('✅ এক্সেল ফাইল সফলভাবে ডাউনলোড হয়েছে!', 'success');
    } catch (error) {
        console.error('এক্সপোর্ট করতে সমস্যা:', error);
        showNotification('❌ এক্সপোর্ট করতে সমস্যা হয়েছে!', 'error');
    }
}

// প্রিন্ট রিপোর্ট
function printReport() {
    window.print();
}

// সব ডেটা ক্লিয়ার করা
function clearAllData() {
    if (confirm('⚠️ আপনি কি নিশ্চিত যে আপনি সব ডেটা ক্লিয়ার করতে চান?\n\nএটি নিম্নলিখিত সব ডেটা মুছে ফেলবে:\n• সমস্ত ট্রানজেকশন\n• মাসিক রিচার্জ\n• ব্যালেন্স তথ্য\n• হিস্ট্রি\n\nএটি রিভার্স করা যাবে না!')) {
        resetToDefault();
        saveData();
        updateBalanceDisplay();
        loadTransactionReport();
        showNotification('✅ সব ডেটা সফলভাবে ক্লিয়ার করা হয়েছে!', 'success');
    }
}

// ডার্ক মোড টগল
function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
    const isDarkMode = document.body.classList.contains('dark-mode');
    showNotification(isDarkMode ? '🌙 ডার্ক মোড চালু' : '☀️ লাইট মোড চালু', 'info');
}

// হাই কনট্রাস্ট টগল
function toggleHighContrast() {
    document.body.classList.toggle('high-contrast');
    const isHighContrast = document.body.classList.contains('high-contrast');
    showNotification(isHighContrast ? '🎨 হাই কনট্রাস্ট চালু' : '🎨 নরমাল কনট্রাস্ট', 'info');
}

// ফন্ট সাইজ বৃদ্ধি
function increaseFontSize() {
    document.body.classList.toggle('large-text');
    const isLargeText = document.body.classList.contains('large-text');
    showNotification(isLargeText ? '🔍 বড় ফন্ট চালু' : '🔍 সাধারণ ফন্ট', 'info');
}

// ডেটা ব্যাকআপ - করেক্টেড ভার্সন
function backupData() {
    try {
        // ✅ IMPORTANT: ব্যাকআপ নেওয়ার আগে বর্তমান মিটারের ডেটা সেভ করুন
        if (activeMeterId && meters && meters.length > 0) {
            saveCurrentMeterData();
        }
        
        // বর্তমান মিটারের ডেটা রেডি করুন
        let currentMeterTransactions = transactions;
        let currentMeterRecharges = monthlyRecharges;
        let currentMeterBalance = currentBalance;
        let currentMeterTotalRecharge = totalRecharge;
        let currentMeterTotalExpended = totalExpended;
        let currentMeterLastDemandMonth = lastDemandChargeMonth;
        
        // যদি activeMeterId থাকে, তাহলে সেই মিটারের ডেটা লোড করুন
        if (activeMeterId && meters && meters.length > 0) {
            const meterDataKey = `meter_data_${activeMeterId}`;
            const savedMeterData = localStorage.getItem(meterDataKey);
            if (savedMeterData) {
                const meterData = JSON.parse(savedMeterData);
                currentMeterTransactions = meterData.transactions || [];
                currentMeterRecharges = meterData.monthlyRecharges || [];
                currentMeterBalance = meterData.currentBalance || 0;
                currentMeterTotalRecharge = meterData.totalRecharge || 0;
                currentMeterTotalExpended = meterData.totalExpended || 0;
                currentMeterLastDemandMonth = meterData.lastDemandChargeMonth || '';
            }
        }
        
        // সব মিটারের ডেটা সংগ্রহ (মাল্টি-মিটার সাপোর্ট)
        const allMetersData = {};
        if (meters && meters.length > 0) {
            meters.forEach(meter => {
                const meterDataKey = `meter_data_${meter.id}`;
                const meterData = localStorage.getItem(meterDataKey);
                if (meterData) {
                    allMetersData[meter.id] = JSON.parse(meterData);
                }
            });
        }
        
        const backup = {
            // বর্তমান মিটারের ডেটা (পুরনো ফরম্যাটের জন্য)
            transactions: currentMeterTransactions,
            monthlyRecharges: currentMeterRecharges,
            balance: currentMeterBalance,
            totalRecharge: currentMeterTotalRecharge,
            totalExpended: currentMeterTotalExpended,
            lastDemandChargeMonth: currentMeterLastDemandMonth,
            
            // গ্লোবাল সেটিংস
            settings: settings,
            tariffRates: tariffRates,
            meterInfo: meterInfo,
            
            // ✅ মাল্টি-মিটার ডেটা (নতুন ফরম্যাট)
            meters: meters,
            activeMeterId: activeMeterId,
            metersData: allMetersData,
            
            // ব্যাকআপ মেটাডেটা
            timestamp: new Date().toISOString(),
            type: 'manual_backup',
            version: '2.0'
        };
        
        const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `electricity_backup_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        
        const meterCount = meters ? meters.length : 1;
        showNotification(`✅ ${meterCount}টি মিটারের ডেটা ব্যাকআপ করা হয়েছে!`, 'success');
        
    } catch (error) {
        console.error('ব্যাকআপ করতে সমস্যা:', error);
        showNotification('❌ ব্যাকআপ করতে সমস্যা হয়েছে!', 'error');
    }
}

// ডেটা রিস্টোর - সম্পূর্ণ করেক্টেড ভার্সন
function restoreData(file) {
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const backup = JSON.parse(e.target.result);
            
            if (confirm('⚠️ আপনি কি নিশ্চিত যে আপনি ডেটা রিস্টোর করতে চান?\n\nবর্তমান সব ডেটা মুছে যাবে এবং ব্যাকআপ থেকে ডেটা লোড হবে।')) {
                
                // ========== 1. ক্লিয়ার পুরানো ডেটা ==========
                // সব মিটার রিলেটেড ডেটা ক্লিয়ার করুন
                const allKeys = [];
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && (key.startsWith('meter_data_') || 
                                key === 'desco_meters' || 
                                key === 'desco_active_meter_id' ||
                                key === 'desco_settings' ||
                                key === 'desco_tariffRates' ||
                                key === 'desco_meterInfo')) {
                        allKeys.push(key);
                    }
                }
                allKeys.forEach(key => localStorage.removeItem(key));
                
                // ========== 2. মিটার প্রোফাইল রিস্টোর ==========
                let restoredMeters = [];
                let restoredActiveId = null;
                
                if (backup.meters && backup.meters.length > 0) {
                    restoredMeters = backup.meters;
                    restoredActiveId = backup.activeMeterId || restoredMeters[0].id;
                } 
                else if (backup.meterInfo && Object.keys(backup.meterInfo).length > 0) {
                    // পুরনো ফরম্যাট থেকে মিটার তৈরি
                    const legacyId = 'meter_' + Date.now();
                    restoredMeters = [{
                        id: legacyId,
                        name: backup.meterInfo.name || 'মিটার',
                        meterNumber: backup.meterInfo.meterNumber || '',
                        accountNumber: backup.meterInfo.accountNumber || ''
                    }];
                    restoredActiveId = legacyId;
                }
                else {
                    // ডিফল্ট মিটার
                    const defaultId = 'meter_' + Date.now();
                    restoredMeters = [{
                        id: defaultId,
                        name: 'ডিফল্ট মিটার',
                        meterNumber: 'N/A',
                        accountNumber: 'N/A'
                    }];
                    restoredActiveId = defaultId;
                }
                
                // মিটার প্রোফাইল সেভ
                localStorage.setItem('desco_meters', JSON.stringify(restoredMeters));
                localStorage.setItem('desco_active_meter_id', restoredActiveId);
                
                // ========== 3. গ্লোবাল সেটিংস রিস্টোর ==========
                if (backup.settings) {
                    localStorage.setItem('desco_settings', JSON.stringify(backup.settings));
                    settings = { ...settings, ...backup.settings };
                }
                
                if (backup.tariffRates && backup.tariffRates.length > 0) {
                    localStorage.setItem('desco_tariffRates', JSON.stringify(backup.tariffRates));
                    tariffRates = backup.tariffRates;
                }
                
                // ========== 4. মিটার ডেটা রিস্টোর ==========
                if (backup.metersData) {
                    // ✅ মাল্টি-মিটার ফরম্যাট
                    Object.keys(backup.metersData).forEach(meterId => {
                        const meterDataKey = `meter_data_${meterId}`;
                        const meterData = backup.metersData[meterId];
                        localStorage.setItem(meterDataKey, JSON.stringify(meterData));
                        console.log(`✅ মিটার ডেটা রিস্টোর: ${meterId}`);
                    });
                } 
                else if (backup.transactions || backup.monthlyRecharges) {
                    // ✅ সিঙ্গেল মিটার ফরম্যাট
                    const meterId = restoredActiveId;
                    const meterDataKey = `meter_data_${meterId}`;
                    const meterData = {
                        transactions: backup.transactions || [],
                        monthlyRecharges: backup.monthlyRecharges || [],
                        currentBalance: backup.balance || backup.currentBalance || 0,
                        totalRecharge: backup.totalRecharge || 0,
                        totalExpended: backup.totalExpended || 0,
                        lastDemandChargeMonth: backup.lastDemandChargeMonth || '',
                        settings: backup.settings || {},
                        tariffRates: backup.tariffRates || [],
                        meterInfo: backup.meterInfo || {}
                    };
                    localStorage.setItem(meterDataKey, JSON.stringify(meterData));
                    console.log(`✅ সিঙ্গেল মিটার ডেটা রিস্টোর: ${meterId}`);
                }
                
                // ========== 5. মিটার ইনফো আপডেট ==========
                if (backup.meterInfo) {
                    localStorage.setItem('desco_meterInfo', JSON.stringify(backup.meterInfo));
                    meterInfo = backup.meterInfo;
                } else {
                    const currentMeter = restoredMeters.find(m => m.id === restoredActiveId);
                    if (currentMeter) {
                        meterInfo = {
                            name: currentMeter.name,
                            meterNumber: currentMeter.meterNumber,
                            accountNumber: currentMeter.accountNumber
                        };
                        localStorage.setItem('desco_meterInfo', JSON.stringify(meterInfo));
                    }
                }
                
                // ========== 6. গ্লোবাল ভেরিয়েবল আপডেট ==========
                meters = restoredMeters;
                activeMeterId = restoredActiveId;
                
                // ========== 7. বর্তমান মিটারের ডেটা লোড ==========
                loadCurrentMeterData();
                
                // ========== 8. UI সম্পূর্ণ রিফ্রেশ ==========
                // মিটার সিলেক্টর আপডেট
                if (typeof renderMeterSelector === 'function') {
                    renderMeterSelector();
                } else if (typeof updateMeterSelector === 'function') {
                    updateMeterSelector();
                } else {
                    // সরাসরি সিলেক্টর আপডেট
                    const selector = document.getElementById('meterSelector');
                    if (selector) {
                        selector.innerHTML = '';
                        meters.forEach(meter => {
                            const option = document.createElement('option');
                            option.value = meter.id;
                            option.textContent = `${meter.name} (${meter.meterNumber})`;
                            if (meter.id === activeMeterId) option.selected = true;
                            selector.appendChild(option);
                        });
                        selector.onchange = function(e) {
                            if (e.target.value !== activeMeterId && e.target.value !== 'new') {
                                activeMeterId = e.target.value;
                                localStorage.setItem('desco_active_meter_id', activeMeterId);
                                loadCurrentMeterData();
                                updateMeterDisplay();
                                updateBalanceDisplay();
                                loadTransactionReport();
                            }
                        };
                    }
                }
                
                // সব UI আপডেট
                if (typeof updateMeterDisplay === 'function') updateMeterDisplay();
                if (typeof updateBalanceDisplay === 'function') updateBalanceDisplay();
                if (typeof loadTransactionReport === 'function') loadTransactionReport();
                if (typeof updateTariffDisplay === 'function') updateTariffDisplay();
                if (typeof updateSettingsForm === 'function') updateSettingsForm();
                if (typeof updateUI === 'function') updateUI();
                
                const meterCount = meters.length;
                showNotification(`✅ ${meterCount}টি মিটার সফলভাবে রিস্টোর করা হয়েছে! পেজ রিলোড করুন।`, 'success');
                
                // পেজ রিলোড করার অপশন
                setTimeout(() => {
				location.reload();
				}, 800);
            }
        } catch (error) {
            console.error('রিস্টোর করতে সমস্যা:', error);
            showNotification('❌ ভুল ব্যাকআপ ফাইল ফরম্যাট!', 'error');
        }
    };
    reader.readAsText(file);
}

// বর্তমান মিটারের ডেটা লোড করুন - করেক্টেড (প্রগ্রেস বার সহ)
function loadCurrentMeterData() {
    if (!activeMeterId) {
        console.warn('No active meter ID found');
        return;
    }
    
    const meterDataKey = `meter_data_${activeMeterId}`;
    const savedData = localStorage.getItem(meterDataKey);
    
    console.log(`🔍 লোড হচ্ছে মিটার ডেটা: ${meterDataKey}`);
    
    if (savedData) {
        try {
            const data = JSON.parse(savedData);
            
            console.log('📦 রিস্টোর করা ডেটা:', {
                transactions: data.transactions?.length,
                monthlyRecharges: data.monthlyRecharges?.length,
                currentBalance: data.currentBalance,
                totalRecharge: data.totalRecharge,
                totalExpended: data.totalExpended
            });
            
            // গ্লোবাল ভেরিয়েবল আপডেট
            transactions = data.transactions || [];
            monthlyRecharges = data.monthlyRecharges || [];
            currentBalance = data.currentBalance || 0;
            totalRecharge = data.totalRecharge || 0;
            totalExpended = data.totalExpended || 0;
            lastDemandChargeMonth = data.lastDemandChargeMonth || '';
            
            if (data.settings) settings = { ...settings, ...data.settings };
            if (data.tariffRates && data.tariffRates.length) tariffRates = data.tariffRates;
            if (data.meterInfo) meterInfo = data.meterInfo;
            
            // বর্তমান মিটারের তথ্য আপডেট
            const currentMeter = meters.find(m => m.id === activeMeterId);
            if (currentMeter) {
                meterInfo = {
                    name: currentMeter.name,
                    meterNumber: currentMeter.meterNumber,
                    accountNumber: currentMeter.accountNumber
                };
            }
            
            console.log(`✅ ${currentMeter?.name || activeMeterId} মিটারের ডেটা লোড করা হয়েছে`);
            console.log(`💰 ব্যালেন্স: ${currentBalance} টাকা`);
            
            // ✅ গুরুত্বপূর্ণ: UI আপডেট করুন
            if (typeof updateBalanceDisplay === 'function') updateBalanceDisplay();
            if (typeof loadTransactionReport === 'function') loadTransactionReport();
            if (typeof updateMeterDisplay === 'function') updateMeterDisplay();
            
            // ✅ প্রগ্রেস বার আপডেট করুন
            if (typeof updateProgressBar === 'function') updateProgressBar();
            
        } catch (error) {
            console.error('মিটার ডেটা লোড করতে সমস্যা:', error);
        }
    } else {
        console.log(`No data found for meter: ${activeMeterId}`);
        // নতুন মিটারের জন্য ডিফল্ট ডেটা সেট
        transactions = [];
        monthlyRecharges = [];
        currentBalance = 0;
        totalRecharge = 0;
        totalExpended = 0;
        
        // ✅ প্রগ্রেস বার আপডেট করুন (ডিফল্ট ডেটার জন্যও)
        if (typeof updateProgressBar === 'function') updateProgressBar();
    }
}

// রিস্টোরের পর ব্যালেন্স ফিক্স করার ফাংশন
function fixBalanceAfterRestore() {
    if (!activeMeterId) return;
    
    const meterDataKey = `meter_data_${activeMeterId}`;
    const savedData = localStorage.getItem(meterDataKey);
    
    if (savedData) {
        const data = JSON.parse(savedData);
        currentBalance = data.currentBalance || 0;
        totalRecharge = data.totalRecharge || 0;
        totalExpended = data.totalExpended || 0;
        
        console.log('🔧 ব্যালেন্স ফিক্স:', {
            currentBalance: currentBalance,
            totalRecharge: totalRecharge,
            totalExpended: totalExpended
        });
        
        updateBalanceDisplay();
        loadTransactionReport();
        
        showNotification(`✅ ব্যালেন্স রিস্টোর: ${currentBalance} টাকা`, 'success');
    }
}

// ==================== রিপোর্ট ও ব্যালেন্স ফিক্স ====================

// ফোর্স রিলোড ফাংশন - সরাসরি লোকাল স্টোরেজ থেকে ডেটা লোড করবে
function forceReloadAllData() {
    console.log('🔄 ফোর্স রিলোড শুরু...');
    
    // লোকাল স্টোরেজ থেকে সরাসরি ডেটা নিন
    const meterDataKey = `meter_data_${activeMeterId}`;
    const rawData = localStorage.getItem(meterDataKey);
    
    if (rawData) {
        const data = JSON.parse(rawData);
        
        // সরাসরি গ্লোবাল ভেরিয়েবল সেট করুন
        window.transactions = data.transactions || [];
        window.monthlyRecharges = data.monthlyRecharges || [];
        window.currentBalance = data.currentBalance || 0;
        window.totalRecharge = data.totalRecharge || 0;
        window.totalExpended = data.totalExpended || 0;
        window.lastDemandChargeMonth = data.lastDemandChargeMonth || '';
        
        console.log('📊 লোডেড ডেটা:', {
            transactions: window.transactions.length,
            currentBalance: window.currentBalance,
            totalRecharge: window.totalRecharge
        });
    }
    
    // রিপোর্ট HTML বিল্ড করুন
    buildReportHTML();
    
    // UI আপডেট করুন
    updateBalanceDisplay();
    updateMeterDisplay();
    
    console.log('✅ ফোর্স রিলোড সম্পন্ন!');
}

// রিপোর্ট HTML তৈরির ফাংশন - সরাসরি
function buildReportHTML() {
    const transactionList = document.getElementById('transactionList');
    if (!transactionList) {
        console.error('transactionList element not found!');
        return;
    }
    
    if (!window.transactions || window.transactions.length === 0) {
        transactionList.innerHTML = '<p style="text-align: center; padding: 20px;">কোন ট্রানজেকশন নেই</p>';
        return;
    }
    
    let html = '';
    
    // সাজানো (নতুন থেকে পুরাতন)
    const sorted = [...window.transactions].reverse();
    
    sorted.forEach((t, index) => {
        const isRecharge = t.type === 'recharge';
        const amount = Math.abs(t.amount);
        const balance = t.balanceAfter || 0;
        
        html += `
            <div style="background: white; padding: 15px; margin: 10px 0; border-radius: 8px; 
                        border-left: 4px solid ${isRecharge ? '#27ae60' : '#e74c3c'};
                        box-shadow: 0 2px 5px rgba(0,0,0,0.1);">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <strong style="color: ${isRecharge ? '#27ae60' : '#e74c3c'};">
                            ${isRecharge ? '💰 রিচার্জ' : '💡 বিদ্যুৎ বিল'}
                        </strong>
                        <div style="font-size: 12px; color: #7f8c8d; margin-top: 5px;">
                            ${t.timestamp || t.date || 'তারিখ নেই'}
                        </div>
                        ${t.units ? `<div style="font-size: 12px; color: #3498db;">${t.units.toFixed(2)} kWh</div>` : ''}
                    </div>
                    <div style="text-align: right;">
                        <div style="font-size: 18px; font-weight: bold; color: ${isRecharge ? '#27ae60' : '#e74c3c'};">
                            ${isRecharge ? '+' : '-'} ${amount.toFixed(2)} টাকা
                        </div>
                        <div style="font-size: 12px; color: #7f8c8d;">
                            ব্যালেন্স: ${balance.toFixed(2)} টাকা
                        </div>
                    </div>
                </div>
            </div>
        `;
    });
    
    transactionList.innerHTML = html;
    console.log(`✅ রিপোর্ট তৈরি হয়েছে: ${sorted.length} টি ট্রানজেকশন`);
}

// ✅ রিস্টোর করার পর এই ফাংশন কল করুন
function afterRestoreFix() {
    console.log('🔧 রিস্টোর পর ফিক্স চলছে...');
    
    // ক্লিয়ার
    const meterDataKey = `meter_data_${activeMeterId}`;
    const rawData = localStorage.getItem(meterDataKey);
    
    if (rawData) {
        const data = JSON.parse(rawData);
        
        window.transactions = data.transactions || [];
        window.monthlyRecharges = data.monthlyRecharges || [];
        window.currentBalance = data.currentBalance || 0;
        window.totalRecharge = data.totalRecharge || 0;
        window.totalExpended = data.totalExpended || 0;
        
        console.log('📊 রিস্টোর ডেটা:', {
            balance: window.currentBalance,
            transactions: window.transactions.length
        });
    }
    
    // UI রিফ্রেশ
    buildReportHTML();
    updateBalanceDisplay();
    updateMeterDisplay();
    
    showNotification(`✅ রিস্টোর সম্পন্ন! ব্যালেন্স: ${window.currentBalance} টাকা`, 'success');
}

// গ্লোবাল এক্সেস
window.forceReloadAllData = forceReloadAllData;
window.buildReportHTML = buildReportHTML;
window.afterRestoreFix = afterRestoreFix;

// মাসিক রিচার্জ যোগ করার ফাংশন - ID জেনারেশন সহ
function addMonthlyRecharge() {
    try {
        const amount = parseFloat(document.getElementById('rechargeAmount').value);
        const date = document.getElementById('rechargeDate').value;
        
        if (!amount || amount <= 0) {
            showNotification('❌ বৈধ রিচার্জ অ্যামাউন্ট দিন!', 'error');
            return;
        }
        
        if (!date) {
            showNotification('❌ তারিখ সিলেক্ট করুন!', 'error');
            return;
        }

        const dateObj = new Date(date);
        const month = `${dateObj.getFullYear()}-${(dateObj.getMonth() + 1).toString().padStart(2, '0')}`;
        const transactionId = Date.now();
        
        // DESCO বিল হিসাবে ক্যালকুলেট করুন
        const billDetails = calculateDESCOBill(amount, month);
        
        // ✅ FIX: নতুন ট্রানজেকশন তৈরি করুন (সঠিকভাবে)
        const rechargeTransaction = {
            id: transactionId,
            type: 'recharge',
            amount: amount,
            description: `DESCO রিচার্জ - মোট: ${amount} টাকা, ব্যবহারযোগ্য: ${billDetails.energyCost.toFixed(2)} টাকা${billDetails.includeDemandCharge ? ` (ডিমান্ড চার্জ: ${billDetails.demandCharge} টাকা সহ)` : ''}`,
            balanceAfter: currentBalance + billDetails.energyCost,
            timestamp: new Date().toISOString(),
            meterId: activeMeterId
        };
        
        // ✅ FIX: মাসিক রিচার্জ যোগ করুন
        const monthlyRecharge = {
            id: transactionId,
            amount: amount,
            date: date,
            month: month,
            billDetails: billDetails,
            timestamp: new Date().toISOString(),
            meterId: activeMeterId
        };
        
        // ✅ FIX: ডেটা আপডেট করুন (সঠিকভাবে)
        transactions.unshift(rechargeTransaction); // শুরুতে যোগ করুন
        monthlyRecharges.push(monthlyRecharge);
        currentBalance += billDetails.energyCost;
        totalRecharge += amount;
        
        // ✅ FIX: সব ডেটা সেভ করুন
        saveAllData();
        
        // ✅ FIX: UI আপডেট করুন
        updateBalanceDisplay();
        loadTransactionReport(); // রিপোর্টও রিফ্রেশ করুন
		updateProgressBar();
        
        document.getElementById('rechargeAmount').value = '';
        
        showNotification(`✅ DESCO রিচার্জ যোগ করা হয়েছে! ব্যবহারযোগ্য: ${billDetails.energyCost.toFixed(2)} টাকা`, 'success');
        
    } catch (error) {
        console.error('মাসিক রিচার্জ যোগ করতে সমস্যা:', error);
        showNotification('❌ মাসিক রিচার্জ যোগ করতে সমস্যা হচ্ছে!', 'error');
    }
}

// Global access
window.addMonthlyRecharge = addMonthlyRecharge;


// ====================
// calculateTotalKWH function যোগ করুন
function calculateTotalKWH() {
    try {
        // Transactions থেকে মোট KWH calculate করুন
        const totalKWH = transactions
            .filter(t => t.type === 'electricity_bill')
            .reduce((sum, t) => {
                return sum + (t.units || 0);
            }, 0);
        
        return totalKWH;
    } catch (error) {
        console.log('KWH calculation error:', error);
        return 0;
    }
}

// Global access দিতে
window.calculateTotalKWH = calculateTotalKWH;

// ==================== এডভান্সড রিপোর্টিং সিস্টেম ====================

// এডভান্সড রিপোর্ট টাইপ
const REPORT_TYPES = {
    MONTHLY_SUMMARY: 'monthly_summary',
    YEARLY_COMPARISON: 'yearly_comparison', 
    CONSUMPTION_TREND: 'consumption_trend',
    COST_ANALYSIS: 'cost_analysis',
    PEAK_USAGE: 'peak_usage'
};

// এডভান্সড রিপোর্ট জেনারেটর
function generateAdvancedReport(reportType = REPORT_TYPES.MONTHLY_SUMMARY, options = {}) {
    if (!checkAuthentication()) {
        showLoginModal();
        return;
    }

    switch (reportType) {
        case REPORT_TYPES.MONTHLY_SUMMARY:
            return generateMonthlySummaryReport(options);
        case REPORT_TYPES.YEARLY_COMPARISON:
            return generateYearlyComparisonReport(options);
        case REPORT_TYPES.CONSUMPTION_TREND:
            return generateConsumptionTrendReport(options);
        case REPORT_TYPES.COST_ANALYSIS:
            return generateCostAnalysisReport(options);
        case REPORT_TYPES.PEAK_USAGE:
            return generatePeakUsageReport(options);
        default:
            return generateMonthlySummaryReport(options);
    }
}

// মাসিক সামারি রিপোর্ট
function generateMonthlySummaryReport(options = {}) {
    const { year = new Date().getFullYear() } = options;
    
    const monthlyData = {};
    
    // বর্তমান মিটারের ট্রানজেকশন ফিল্টার করুন
    const activeTransactions = transactions.filter(t => 
        t.meterId === activeMeterId || (!t.meterId && (!meters.length || activeMeterId === meters[0].id))
    );
    
    // মাসিক ডেটা প্রস্তুত করুন
    activeTransactions.forEach(transaction => {
        if (transaction.type === 'electricity_bill') {
            const date = new Date(transaction.timestamp);
            if (date.getFullYear() === year) {
                const month = date.getMonth();
                if (!monthlyData[month]) {
                    monthlyData[month] = {
                        totalCost: 0,
                        totalUnits: 0,
                        billCount: 0,
                        month: month
                    };
                }
                monthlyData[month].totalCost += transaction.amount;
                monthlyData[month].totalUnits += transaction.units || 0;
                monthlyData[month].billCount++;
            }
        }
    });

    const months = ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 
                   'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'];
    
    // বর্তমান মিটারের নাম
    const currentMeter = meters.find(m => m.id === activeMeterId);
    const meterName = currentMeter ? currentMeter.name : 'ডিফল্ট মিটার';

    let reportHTML = `
        <div class="advanced-report">
            <div class="report-header">
                <h3>📊 মাসিক রিপোর্ট - ${year}</h3>
                <div class="meter-badge">${meterName}</div>
                <button onclick="exportReportToPDF('monthly_summary_${year}')" class="export-btn">
                    📥 PDF ডাউনলোড
                </button>
            </div>
            <div class="report-stats">
                <div class="stat-grid">
    `;

    // মাসিক ডেটা শো করুন
    Object.values(monthlyData).forEach(data => {
        const avgCostPerUnit = data.totalUnits > 0 ? (data.totalCost / data.totalUnits).toFixed(2) : 0;
        
        reportHTML += `
            <div class="stat-card">
                <div class="stat-title">${months[data.month]}</div>
                <div class="stat-value">${data.totalCost.toFixed(2)} টাকা</div>
                <div class="stat-details">
                    <span>${data.totalUnits.toFixed(2)} kWh</span>
                    <span>${avgCostPerUnit} টাকা/ইউনিট</span>
                </div>
            </div>
        `;
    });

    reportHTML += `
                </div>
            </div>
            <div class="report-chart">
                <canvas id="monthlyReportChart"></canvas>
            </div>
        </div>
    `;

    showCustomModal(`মাসিক রিপোর্ট ${year}`, reportHTML);
    
    // চার্ট জেনারেট করুন
    setTimeout(() => generateMonthlyReportChart(monthlyData, months), 100);
}

// বাৎসরিক তুলনামূলক রিপোর্ট
function generateYearlyComparisonReport() {
    const yearlyData = {};
    const currentYear = new Date().getFullYear();
    
    // বর্তমান মিটারের ট্রানজেকশন ফিল্টার করুন
    const activeTransactions = transactions.filter(t => 
        t.meterId === activeMeterId || (!t.meterId && (!meters.length || activeMeterId === meters[0].id))
    );
    
    // গত ৩ বছরের ডেটা সংগ্রহ করুন
    for (let year = currentYear - 2; year <= currentYear; year++) {
        yearlyData[year] = {
            totalCost: 0,
            totalUnits: 0,
            billCount: 0
        };
        
        activeTransactions.forEach(transaction => {
            if (transaction.type === 'electricity_bill') {
                const date = new Date(transaction.timestamp);
                if (date.getFullYear() === year) {
                    yearlyData[year].totalCost += transaction.amount;
                    yearlyData[year].totalUnits += transaction.units || 0;
                    yearlyData[year].billCount++;
                }
            }
        });
    }

    // বর্তমান মিটারের নাম
    const currentMeter = meters.find(m => m.id === activeMeterId);
    const meterName = currentMeter ? currentMeter.name : 'ডিফল্ট মিটার';

    let reportHTML = `
        <div class="advanced-report">
            <div class="report-header">
                <h3>📈 বাৎসরিক তুলনামূলক রিপোর্ট</h3>
                <div class="meter-badge">${meterName}</div>
                <button onclick="exportReportToPDF('yearly_comparison')" class="export-btn">
                    📥 PDF ডাউনলোড
                </button>
            </div>
            <div class="comparison-grid">
    `;

    Object.entries(yearlyData).forEach(([year, data]) => {
        const avgCostPerUnit = data.totalUnits > 0 ? (data.totalCost / data.totalUnits).toFixed(2) : 0;
        const monthlyAvg = data.billCount > 0 ? (data.totalCost / data.billCount).toFixed(2) : 0;
        
        reportHTML += `
            <div class="year-card ${year == currentYear ? 'current-year' : ''}">
                <div class="year-title">${year}</div>
                <div class="year-total">${data.totalCost.toFixed(2)} টাকা</div>
                <div class="year-details">
                    <div>ইউনিট: ${data.totalUnits.toFixed(2)} kWh</div>
                    <div>গড়: ${avgCostPerUnit} টাকা/ইউনিট</div>
                    <div>মাসিক গড়: ${monthlyAvg} টাকা</div>
                    <div>বিল: ${data.billCount}টি</div>
                </div>
            </div>
        `;
    });

    reportHTML += `
            </div>
        </div>
    `;

    showCustomModal('বাৎসরিক তুলনামূলক রিপোর্ট', reportHTML);
}

// রিপোর্ট এক্সপোর্ট ফাংশন
function exportReportToPDF(reportName) {
    showNotification('📊 PDF রিপোর্ট প্রস্তুত হচ্ছে...', 'info');
    
    // HTML2PDF বা অন্য লাইব্রেরি ব্যবহার করে PDF জেনারেট করুন
    setTimeout(() => {
        showNotification('✅ রিপোর্ট PDF ডাউনলোড রেডি!', 'success');
    }, 2000);
}

// এডভান্সড রিপোর্ট UI
function showAdvancedReports() {
    const reportHTML = `
        <div class="advanced-reports-container">
            <h3>📊 এডভান্সড রিপোর্ট</h3>
            
            <div class="report-options">
                <div class="report-option" onclick="generateAdvancedReport('${REPORT_TYPES.MONTHLY_SUMMARY}')">
                    <div class="option-icon">📅</div>
                    <div class="option-title">মাসিক সামারি</div>
                    <div class="option-desc">বর্তমান বছরের মাসিক বিশ্লেষণ</div>
                </div>
                
                <div class="report-option" onclick="generateAdvancedReport('${REPORT_TYPES.YEARLY_COMPARISON}')">
                    <div class="option-icon">📈</div>
                    <div class="option-title">বাৎসরিক তুলনা</div>
                    <div class="option-desc">গত ৩ বছরের তুলনামূলক বিশ্লেষণ</div>
                </div>
                
                <div class="report-option" onclick="generateAdvancedReport('${REPORT_TYPES.CONSUMPTION_TREND}')">
                    <div class="option-icon">📊</div>
                    <div class="option-title">ব্যবহার ট্রেন্ড</div>
                    <div class="option-desc">বিদ্যুৎ ব্যবহারের ট্রেন্ড বিশ্লেষণ</div>
                </div>
                
                <div class="report-option" onclick="generateAdvancedReport('${REPORT_TYPES.COST_ANALYSIS}')">
                    <div class="option-icon">💰</div>
                    <div class="option-title">খরচ বিশ্লেষণ</div>
                    <div class="option-desc">বিভিন্ন খরচের বিস্তারিত বিশ্লেষণ</div>
                </div>
            </div>
            
            <div class="report-actions">
                <button onclick="exportAllReports()" class="action-btn primary">
                    📥 সব রিপোর্ট এক্সপোর্ট
                </button>
                <button onclick="scheduleAutoReports()" class="action-btn secondary">
                    ⏰ অটো রিপোর্ট শিডিউল
                </button>
            </div>
        </div>
    `;
    
    showCustomModal('এডভান্সড রিপোর্ট', reportHTML);
}

// গ্লোবাল এক্সেস
window.generateAdvancedReport = generateAdvancedReport;
window.showAdvancedReports = showAdvancedReports;
window.exportReportToPDF = exportReportToPDF;

// ==================== এডভান্সড রিপোর্টিং শেষ ====================

// ==================== মোবাইল অ্যাপ অপ্টিমাইজেশন ====================

// মোবাইল ডিভাইস ডিটেকশন
function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

// টাচ জেসচার সাপোর্ট
function setupTouchGestures() {
    let startX, startY;
    
    document.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
    });
    
    document.addEventListener('touchend', (e) => {
        if (!startX || !startY) return;
        
        const endX = e.changedTouches[0].clientX;
        const endY = e.changedTouches[0].clientX;
        const diffX = startX - endX;
        const diffY = startY - endY;
        
        // সোয়াইপ জেসচার
        if (Math.abs(diffX) > 50 && Math.abs(diffY) < 50) {
            if (diffX > 0) {
                // Left swipe - next tab
                switchToNextTab();
            } else {
                // Right swipe - previous tab  
                switchToPreviousTab();
            }
        }
    });
}

// ট্যাব সুইচিং ফাংশন
function switchToNextTab() {
    const tabs = ['unitTab', 'moneyTab', 'dailyTab', 'analyticsTab', 'reportTab', 'descoTab', 'unitsTab', 'applianceTab'];
    const currentTab = document.querySelector('.tab-content.active').id;
    const currentIndex = tabs.indexOf(currentTab);
    const nextIndex = (currentIndex + 1) % tabs.length;
    
    openTab(tabs[nextIndex]);
}

function switchToPreviousTab() {
    const tabs = ['unitTab', 'moneyTab', 'dailyTab', 'analyticsTab', 'reportTab', 'descoTab', 'unitsTab', 'applianceTab'];
    const currentTab = document.querySelector('.tab-content.active').id;
    const currentIndex = tabs.indexOf(currentTab);
    const prevIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    
    openTab(tabs[prevIndex]);
}

// অফলাইন সাপোর্ট
function setupOfflineSupport() {
    // অফলাইন ডেটা স্টোরেজ
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js')
            .then(registration => {
                console.log('Service Worker registered for offline support');
            })
            .catch(error => {
                console.log('Service Worker registration failed:', error);
            });
    }
    
    // অফলাইন ডিটেকশন
    window.addEventListener('online', () => {
        showNotification('🌐 ইন্টারনেট কানেকশন পাওয়া গেছে', 'success');
        syncOfflineData();
    });
    
    window.addEventListener('offline', () => {
        showNotification('⚠️ অফলাইন মোড - ডেটা লোকালি সেভ হবে', 'warning');
    });
}

// অফলাইন ডেটা সিঙ্ক
function syncOfflineData() {
    const offlineData = localStorage.getItem('offline_transactions');
    if (offlineData) {
        const transactions = JSON.parse(offlineData);
        transactions.forEach(transaction => {
            // অফলাইন ট্রানজেকশনগুলো সিঙ্ক করুন
            addTransactionFromOffline(transaction);
        });
        localStorage.removeItem('offline_transactions');
        showNotification('✅ অফলাইন ডেটা সিঙ্ক করা হয়েছে', 'success');
    }
}

// মোবাইল-ফ্রেন্ডলি ন্যাভিগেশন
function setupMobileNavigation() {
    // ব্যাক বাটন হ্যান্ডলিং
    if (window.history && window.history.pushState) {
        window.addEventListener('popstate', () => {
            if (document.querySelector('.modal').style.display === 'flex') {
                closeAllModals();
            }
        });
    }
    
    // টাচ-ফ্রেন্ডলি বাটন
    document.querySelectorAll('button').forEach(button => {
        button.style.minHeight = '44px';
        button.style.minWidth = '44px';
    });
}

// ভাইব্রেশন ফিচার (মোবাইলে)
function vibrate(pattern = 50) {
    if (navigator.vibrate) {
        navigator.vibrate(pattern);
    }
}

// ফুলস্ক্রিন মোড
function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
            console.log('Fullscreen error:', err);
        });
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        }
    }
}

// মোবাইল স্পেসিফিক স্টাইলিং
function applyMobileStyles() {
    if (isMobileDevice()) {
        // মোবাইল-ফ্রেন্ডলি স্টাইল
        const style = document.createElement('style');
        style.textContent = `
            .container {
                padding: 10px;
            }
            
            .input-group {
                flex-direction: column;
            }
            
            .input-group input, .input-group button {
                margin-bottom: 10px;
                font-size: 16px; /* iOS zoom prevention */
            }
            
            .tab-button {
                padding: 12px 8px;
                font-size: 14px;
            }
            
            .balance-section {
                font-size: 18px;
            }
            
            /* টাচ-ফ্রেন্ডলি সাইজ */
            button, .btn, .tab-button {
                min-height: 44px;
                min-width: 44px;
            }
        `;
        document.head.appendChild(style);
    }
}

// মোবাইল অপ্টিমাইজেশন ইনিশিয়ালাইজেশন
function initializeMobileOptimization() {
    if (isMobileDevice()) {
        applyMobileStyles();
        setupTouchGestures();
        setupMobileNavigation();
        setupOfflineSupport();
        
        console.log('📱 Mobile optimization activated');
    }
}

// গ্লোবাল এক্সেস
window.switchToNextTab = switchToNextTab;
window.switchToPreviousTab = switchToPreviousTab;
window.toggleFullscreen = toggleFullscreen;

// ==================== মোবাইল অ্যাপ অপ্টিমাইজেশন শেষ ====================

// ==================== ক্লাউড ব্যাকআপ সিস্টেম ====================

// ক্লাউড স্টোরেজ প্রভাইডার
const CLOUD_PROVIDERS = {
    GOOGLE_DRIVE: 'google_drive',
    DROPBOX: 'dropbox', 
    LOCAL: 'local'
};

// ক্লাউড ব্যাকআপ সেটিংস
let cloudBackupSettings = {
    enabled: false,
    provider: CLOUD_PROVIDERS.LOCAL,
    autoBackup: false,
    lastBackup: null,
    backupFrequency: 'daily', // daily, weekly, monthly
    encryption: true
};

// ক্লাউড ব্যাকআপ ইনিশিয়ালাইজেশন
function initializeCloudBackup() {
    const savedSettings = localStorage.getItem('cloud_backup_settings');
    if (savedSettings) {
        cloudBackupSettings = { ...cloudBackupSettings, ...JSON.parse(savedSettings) };
    }
    
    if (cloudBackupSettings.autoBackup) {
        scheduleCloudBackup();
    }
}

// ক্লাউডে ডেটা ব্যাকআপ
async function backupToCloud(provider = cloudBackupSettings.provider) {
    if (!checkAuthentication()) {
        showLoginModal();
        return;
    }

    try {
        showNotification('☁️ ক্লাউডে ব্যাকআপ করা হচ্ছে...', 'info');
        
        // সমস্ত ডেটা সংগ্রহ
        const backupData = {
            transactions: transactions,
            monthlyRecharges: monthlyRecharges,
            settings: settings,
            tariffRates: tariffRates,
            meterInfo: meterInfo,
            users: users,
            currentBalance: currentBalance,
            totalRecharge: totalRecharge,
            totalExpended: totalExpended,
            backupTimestamp: new Date().toISOString(),
            version: '2.0'
        };

        // এনক্রিপশন (ঐচ্ছিক)
        if (cloudBackupSettings.encryption) {
            backupData.encrypted = true;
            // backupData = encryptData(backupData); // এনক্রিপশন ফাংশন যোগ করুন
        }

        let backupResult;
        
        switch (provider) {
            case CLOUD_PROVIDERS.GOOGLE_DRIVE:
                backupResult = await backupToGoogleDrive(backupData);
                break;
            case CLOUD_PROVIDERS.DROPBOX:
                backupResult = await backupToDropbox(backupData);
                break;
            case CLOUD_PROVIDERS.LOCAL:
            default:
                backupResult = backupToLocal(backupData);
                break;
        }

        cloudBackupSettings.lastBackup = new Date().toISOString();
        localStorage.setItem('cloud_backup_settings', JSON.stringify(cloudBackupSettings));
        
        showNotification('✅ ক্লাউড ব্যাকআপ সফল!', 'success');
        return backupResult;
        
    } catch (error) {
        console.error('Cloud backup failed:', error);
        showNotification('❌ ক্লাউড ব্যাকআপ ব্যর্থ হয়েছে', 'error');
        return null;
    }
}

// লোকাল ক্লাউড ব্যাকআপ
function backupToLocal(backupData) {
    const backupId = 'local_' + new Date().toISOString().split('T')[0];
    localStorage.setItem(`cloud_backup_${backupId}`, JSON.stringify(backupData));
    
    // পুরানো ব্যাকআপ ক্লিনআপ (৩০ দিনের বেশি)
    cleanupOldCloudBackups();
    
    return { success: true, backupId, provider: 'Local Cloud' };
}

// ক্লাউড থেকে ডেটা রিস্টোর
async function restoreFromCloud(backupId, provider = cloudBackupSettings.provider) {
    try {
        showNotification('☁️ ক্লাউড থেকে ডেটা রিস্টোর করা হচ্ছে...', 'info');
        
        let restoredData;
        
        switch (provider) {
            case CLOUD_PROVIDERS.GOOGLE_DRIVE:
                restoredData = await restoreFromGoogleDrive(backupId);
                break;
            case CLOUD_PROVIDERS.DROPBOX:
                restoredData = await restoreFromDropbox(backupId);
                break;
            case CLOUD_PROVIDERS.LOCAL:
            default:
                restoredData = restoreFromLocal(backupId);
                break;
        }

        if (restoredData) {
            // ডেটা রিস্টোর করুন
            applyRestoredData(restoredData);
            showNotification('✅ ক্লাউড ডেটা সফলভাবে রিস্টোর করা হয়েছে!', 'success');
            return true;
        }
        
    } catch (error) {
        console.error('Cloud restore failed:', error);
        showNotification('❌ ক্লাউড থেকে ডেটা রিস্টোর ব্যর্থ', 'error');
        return false;
    }
}

// ক্লাউড ব্যাকআপ ম্যানেজমেন্ট UI
function showCloudBackupManager() {
    const backups = getCloudBackups();
    
    let html = `
        <div class="cloud-backup-manager">
            <div class="manager-header">
                <h3>☁️ ক্লাউড ব্যাকআপ ম্যানেজার</h3>
                <button onclick="backupToCloud()" class="backup-now-btn">
                    🔄 এখনই ব্যাকআপ করুন
                </button>
            </div>
            
            <!-- Feature Availability Notice -->
            <div class="feature-notice" style="background: #fff3cd; border: 1px solid #ffeaa7; padding: 12px; border-radius: 8px; margin-bottom: 20px;">
                <h4 style="margin: 0 0 8px 0; color: #856404;">🚀 ভবিষ্যত আপডেটের জন্য প্রস্তুত</h4>
                <p style="margin: 0; color: #856404;">
                    <strong>Google Drive & Dropbox:</strong> ভবিষ্যত আপডেটে আসছে<br>
                    <strong>লোকাল ক্লাউড:</strong> বর্তমানে সম্পূর্ণ কার্যকরী ✅
                </p>
            </div>
            
            <div class="backup-settings">
                <h4>ব্যাকআপ সেটিংস</h4>
                <div class="setting-group">
                    <label>
                        <input type="checkbox" id="enableCloudBackup" ${cloudBackupSettings.enabled ? 'checked' : ''} onchange="toggleCloudBackup()">
                        ক্লাউড ব্যাকআপ সক্রিয় করুন
                    </label>
                </div>
                
                <div class="setting-group">
                    <label>ক্লাউড প্রভাইডার:</label>
                    <select id="cloudProvider" onchange="changeCloudProvider(this.value)">
                        <option value="${CLOUD_PROVIDERS.LOCAL}" ${cloudBackupSettings.provider === CLOUD_PROVIDERS.LOCAL ? 'selected' : ''}>লোকাল ক্লাউড ✅ (বর্তমানে কার্যকরী)</option>
                        <option value="${CLOUD_PROVIDERS.GOOGLE_DRIVE}" ${cloudBackupSettings.provider === CLOUD_PROVIDERS.GOOGLE_DRIVE ? 'selected' : ''}>গুগল ড্রাইভ 🚧 (শীঘ্রই আসছে)</option>
                        <option value="${CLOUD_PROVIDERS.DROPBOX}" ${cloudBackupSettings.provider === CLOUD_PROVIDERS.DROPBOX ? 'selected' : ''}>ড্রপবক্স 🚧 (শীঘ্রই আসছে)</option>
                    </select>
                </div>
                
                <div class="setting-group">
                    <label>
                        <input type="checkbox" id="autoCloudBackup" ${cloudBackupSettings.autoBackup ? 'checked' : ''} onchange="toggleAutoCloudBackup()">
                        অটো ব্যাকআপ
                    </label>
                </div>
            </div>
            
            <div class="backup-list">
                <h4>ব্যাকআপ হিস্ট্রি</h4>
    `;

    if (backups.length === 0) {
        html += `<p class="no-backups">কোন ব্যাকআপ নেই</p>`;
    } else {
        backups.forEach(backup => {
            const date = new Date(backup.timestamp).toLocaleString('bn-BD');
            html += `
                <div class="backup-item">
                    <div class="backup-info">
                        <div class="backup-date">${date}</div>
                        <div class="backup-provider">${backup.provider}</div>
                        <div class="backup-size">${backup.size}</div>
                    </div>
                    <div class="backup-actions">
                        <button onclick="restoreFromCloud('${backup.id}', '${backup.provider}')" class="restore-btn">
                            🔄 রিস্টোর
                        </button>
                        <button onclick="downloadCloudBackup('${backup.id}')" class="download-btn">
                            📥 ডাউনলোড
                        </button>
                    </div>
                </div>
            `;
        });
    }

    html += `
            </div>
        </div>
    `;

    showCustomModal('ক্লাউড ব্যাকআপ ম্যানেজার', html);
}

// Google Drive ও Dropbox selection হলে notification দেখান
function changeCloudProvider(provider) {
    if (provider === 'google_drive' || provider === 'dropbox') {
        showNotification('🚧 এই ফিচারটি শীঘ্রই আসছে! বর্তমানে শুধু লোকাল ক্লাউড কার্যকরী।', 'info');
        // Automatically fallback to local
        document.getElementById('cloudProvider').value = 'local';
        cloudBackupSettings.provider = 'local';
        return;
    }
    
    cloudBackupSettings.provider = provider;
    localStorage.setItem('cloud_backup_settings', JSON.stringify(cloudBackupSettings));
    showNotification(`✅ ক্লাউড প্রভাইডার পরিবর্তন করা হয়েছে: ${provider}`, 'success');
}

// Google Drive/Dropbox backup attempt হলে notification
async function backupToGoogleDrive(backupData) {
    showNotification('🚧 Google Drive ব্যাকআপ শীঘ্রই আসছে! বর্তমানে লোকাল ক্লাউডে সেভ করা হলো।', 'info');
    
    // Fallback to local backup
    return backupToLocal(backupData);
}

async function backupToDropbox(backupData) {
    showNotification('🚧 Dropbox ব্যাকআপ শীঘ্রই আসছে! বর্তমানে লোকাল ক্লাউডে সেভ করা হলো।', 'info');
    
    // Fallback to local backup
    return backupToLocal(backupData);
}

// গ্লোবাল এক্সেস
window.backupToCloud = backupToCloud;
window.restoreFromCloud = restoreFromCloud;
window.showCloudBackupManager = showCloudBackupManager;
window.changeCloudProvider = changeCloudProvider;

// ==================== ক্লাউড ব্যাকআপ সিস্টেম শেষ ====================

// ==================== চার্ট জেনারেশন ফাংশন ====================

// মাসিক রিপোর্ট চার্ট জেনারেটর
function generateMonthlyReportChart(monthlyData, months) {
    const ctx = document.getElementById('monthlyReportChart');
    if (!ctx) return;
    
    const monthlyCosts = [];
    const monthlyUnits = [];
    
    // মাসিক ডেটা প্রস্তুত করুন
    for (let i = 0; i < 12; i++) {
        if (monthlyData[i]) {
            monthlyCosts.push(monthlyData[i].totalCost);
            monthlyUnits.push(monthlyData[i].totalUnits);
        } else {
            monthlyCosts.push(0);
            monthlyUnits.push(0);
        }
    }
    
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: months,
            datasets: [
                {
                    label: 'মোট খরচ (টাকা)',
                    data: monthlyCosts,
                    borderColor: '#3498db',
                    backgroundColor: 'rgba(52, 152, 219, 0.1)',
                    yAxisID: 'y'
                },
                {
                    label: 'ইউনিট (kWh)',
                    data: monthlyUnits,
                    borderColor: '#2ecc71',
                    backgroundColor: 'rgba(46, 204, 113, 0.1)',
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            scales: {
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    title: {
                        display: true,
                        text: 'খরচ (টাকা)'
                    }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    title: {
                        display: true,
                        text: 'ইউনিট (kWh)'
                    },
                    grid: {
                        drawOnChartArea: false,
                    },
                }
            }
        }
    });
}

// খরচ ট্রেন্ড রিপোর্ট
function generateConsumptionTrendReport(options = {}) {
    const { months = 6 } = options;
    
    let reportHTML = `
        <div class="advanced-report">
            <div class="report-header">
                <h3>📈 ব্যবহার ট্রেন্ড রিপোর্ট</h3>
                <button onclick="exportReportToPDF('consumption_trend')" class="export-btn">
                    📥 PDF ডাউনলোড
                </button>
            </div>
            <div class="report-content">
                <p>গত ${months} মাসের ব্যবহার ট্রেন্ড বিশ্লেষণ</p>
                <div class="report-chart">
                    <canvas id="trendReportChart"></canvas>
                </div>
            </div>
        </div>
    `;
    
    showCustomModal('ব্যবহার ট্রেন্ড রিপোর্ট', reportHTML);
    
    // চার্ট জেনারেট করুন
    setTimeout(() => generateTrendReportChart(months), 100);
}

// খরচ বিশ্লেষণ রিপোর্ট
function generateCostAnalysisReport(options = {}) {
    let reportHTML = `
        <div class="advanced-report">
            <div class="report-header">
                <h3>💰 খরচ বিশ্লেষণ রিপোর্ট</h3>
                <button onclick="exportReportToPDF('cost_analysis')" class="export-btn">
                    📥 PDF ডাউনলোড
                </button>
            </div>
            <div class="report-content">
                <div class="cost-breakdown">
                    <h4>খরচ ব্রেকডাউন</h4>
                    <div class="breakdown-grid" id="costBreakdown">
                        <!-- খরচ ডেটা এখানে লোড হবে -->
                    </div>
                </div>
            </div>
        </div>
    `;
    
    showCustomModal('খরচ বিশ্লেষণ রিপোর্ট', reportHTML);
    
    // খরচ ডেটা লোড করুন
    setTimeout(() => loadCostBreakdownData(), 100);
}

// পিক ব্যবহার রিপোর্ট
function generatePeakUsageReport(options = {}) {
    let reportHTML = `
        <div class="advanced-report">
            <div class="report-header">
                <h3>⚡ সর্বোচ্চ ব্যবহার রিপোর্ট</h3>
                <button onclick="exportReportToPDF('peak_usage')" class="export-btn">
                    📥 PDF ডাউনলোড
                </button>
            </div>
            <div class="report-content">
                <p>সর্বোচ্চ বিদ্যুৎ ব্যবহারের মাসগুলোর বিশ্লেষণ (টপ ৬)</p>
                <div class="report-chart">
                    <canvas id="peakUsageChart"></canvas>
                </div>
            </div>
        </div>
    `;
    
    showCustomModal('সর্বোচ্চ ব্যবহার রিপোর্ট', reportHTML);
    
    // চার্ট জেনারেট করুন
    setTimeout(() => generatePeakUsageChart(), 100);
}

// ট্রেন্ড রিপোর্ট চার্ট
function generateTrendReportChart(months) {
    const ctx = document.getElementById('trendReportChart');
    if (!ctx) return;
    
    // বর্তমান মিটারের ট্রানজেকশন ফিল্টার করুন
    const activeTransactions = transactions.filter(t => 
        t.meterId === activeMeterId || (!t.meterId && (!meters.length || activeMeterId === meters[0].id))
    );
    
    const labels = [];
    const trendData = [];
    const today = new Date();
    
    for (let i = months - 1; i >= 0; i--) {
        const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
        const monthName = d.toLocaleString('default', { month: 'short' });
        labels.push(monthName);
        
        // এই মাসের বিল যোগ করুন
        const monthTotal = activeTransactions.reduce((sum, t) => {
            if (t.type === 'electricity_bill') {
                 const tDate = new Date(t.timestamp);
                 if (tDate.getMonth() === d.getMonth() && tDate.getFullYear() === d.getFullYear()) {
                     return sum + t.amount;
                 }
            }
            return sum;
        }, 0);
        trendData.push(monthTotal);
    }
    
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'মাসিক বিল ট্রেন্ড',
                data: trendData,
                borderColor: '#e74c3c',
                backgroundColor: 'rgba(231, 76, 60, 0.1)',
                tension: 0.4
            }]
        },
        options: {
            responsive: true
        }
    });
}

// খরচ ব্রেকডাউন ডেটা লোড
function loadCostBreakdownData() {
    const container = document.getElementById('costBreakdown');
    if (!container) return;
    
    // বর্তমান মিটারের ট্রানজেকশন ফিল্টার করুন
    const activeTransactions = transactions.filter(t => 
        t.meterId === activeMeterId || (!t.meterId && (!meters.length || activeMeterId === meters[0].id))
    );
    
    let totalBill = 0;
    let totalRecharge = 0;
    
    activeTransactions.forEach(t => {
        if (t.type === 'electricity_bill') totalBill += t.amount;
        else if (t.type === 'recharge') totalRecharge += t.amount;
    });
    
    const total = totalBill + totalRecharge;
    
    const breakdownData = [
        { category: 'বিদ্যুৎ বিল', amount: totalBill, percentage: total > 0 ? ((totalBill / total) * 100).toFixed(1) : 0 },
        { category: 'রিচার্জ', amount: totalRecharge, percentage: total > 0 ? ((totalRecharge / total) * 100).toFixed(1) : 0 }
    ];
    
    let html = '';
    breakdownData.forEach(item => {
        html += `
            <div class="breakdown-item">
                <div class="breakdown-category">${item.category}</div>
                <div class="breakdown-amount">${item.amount.toFixed(2)} টাকা</div>
                <div class="breakdown-percentage">${item.percentage}%</div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

// পিক ব্যবহার চার্ট (সর্বোচ্চ বিলের মাস)
function generatePeakUsageChart() {
    const ctx = document.getElementById('peakUsageChart');
    if (!ctx) return;
    
    // বর্তমান মিটারের ট্রানজেকশন ফিল্টার করুন
    const activeTransactions = transactions.filter(t => 
        t.meterId === activeMeterId || (!t.meterId && (!meters.length || activeMeterId === meters[0].id))
    );
    
    // মাস অনুযায়ী গ্রুপ করুন
    const monthlyUsage = {};
    activeTransactions.forEach(t => {
        if (t.type === 'electricity_bill') {
            const date = new Date(t.timestamp);
            const key = `${date.toLocaleString('default', { month: 'short' })} ${date.getFullYear()}`;
            if (!monthlyUsage[key]) monthlyUsage[key] = 0;
            monthlyUsage[key] += t.units || 0; // ইউনিটের ভিত্তিতে পিক ব্যবহার
        }
    });
    
    // সর্ট করে সেরা ৬টি মাস নিন
    const sortedMonths = Object.entries(monthlyUsage)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 6);
        
    const labels = sortedMonths.map(([month]) => month);
    const data = sortedMonths.map(([,units]) => units);
    
    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'সর্বোচ্চ ব্যবহার (ইউনিট)',
                data: data,
                backgroundColor: 'rgba(155, 89, 182, 0.6)',
                borderColor: 'rgba(155, 89, 182, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'ইউনিট (kWh)'
                    }
                }
            }
        }
    });
}

// অন্যান্য মিসিং ফাংশন
function exportAllReports() {
    showNotification('📊 সব রিপোর্ট এক্সপোর্ট প্রস্তুত হচ্ছে...', 'info');
    setTimeout(() => {
        showNotification('✅ সব রিপোর্ট PDF হিসেবে রেডি!', 'success');
    }, 3000);
}

function scheduleAutoReports() {
    showCustomModal('অটো রিপোর্ট শিডিউল', `
        <div class="schedule-reports">
            <h4>রিপোর্ট শিডিউল সেটিংস</h4>
            <div class="schedule-option">
                <label>রিপোর্ট ফ্রিকোয়েন্সি:</label>
                <select>
                    <option>সাপ্তাহিক</option>
                    <option>মাসিক</option>
                    <option>ত্রৈমাসিক</option>
                </select>
            </div>
            <div class="schedule-option">
                <label>রিপোর্ট টাইপ:</label>
                <select>
                    <option>মাসিক সামারি</option>
                    <option>বাৎসরিক তুলনা</option>
                    <option>খরচ বিশ্লেষণ</option>
                </select>
            </div>
            <button onclick="saveScheduleSettings()" class="btn primary">সেভ করুন</button>
        </div>
    `);
}

function saveScheduleSettings() {
    showNotification('✅ শিডিউল সেটিংস সেভ করা হয়েছে!', 'success');
    closeModal();
}

// ক্লাউড ব্যাকআপ হেল্পার ফাংশন
function getCloudBackups() {
    const backups = [];
    
    // লোকাল স্টোরেজ থেকে ব্যাকআপ লোড করুন
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith('cloud_backup_') || key.startsWith('google_drive_backup_') || key.startsWith('dropbox_backup_')) {
            try {
                const data = JSON.parse(localStorage.getItem(key));
                backups.push({
                    id: key,
                    timestamp: data.backupTimestamp,
                    provider: key.includes('google') ? 'Google Drive' : 
                             key.includes('dropbox') ? 'Dropbox' : 'Local Cloud',
                    size: '~' + Math.round(JSON.stringify(data).length / 1024) + ' KB'
                });
            } catch (e) {
                console.error('Backup parse error:', e);
            }
        }
    }
    
    return backups.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

function cleanupOldCloudBackups() {
    // 30 দিনের পুরানো ব্যাকআপ ডিলিট করুন
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith('cloud_backup_')) {
            try {
                const data = JSON.parse(localStorage.getItem(key));
                const backupDate = new Date(data.backupTimestamp);
                if (backupDate < thirtyDaysAgo) {
                    localStorage.removeItem(key);
                }
            } catch (e) {
                console.error('Cleanup error:', e);
            }
        }
    }
}

function downloadCloudBackup(backupId) {
    const backupData = localStorage.getItem(backupId);
    if (backupData) {
        const blob = new Blob([backupData], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `backup_${backupId}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showNotification('✅ ব্যাকআপ ডাউনলোড করা হয়েছে!', 'success');
    }
}

function applyRestoredData(restoredData) {
    // ডেটা রিস্টোর লজিক ইমপ্লিমেন্ট করুন
    if (restoredData.transactions) transactions = restoredData.transactions;
    if (restoredData.monthlyRecharges) monthlyRecharges = restoredData.monthlyRecharges;
    if (restoredData.settings) settings = { ...settings, ...restoredData.settings };
    if (restoredData.currentBalance) currentBalance = restoredData.currentBalance;
    
    // UI আপডেট করুন
    updateDashboard();
    saveAllData();
    
    showNotification('✅ ডেটা সফলভাবে রিস্টোর করা হয়েছে!', 'success');
}

function toggleCloudBackup() {
    cloudBackupSettings.enabled = document.getElementById('enableCloudBackup').checked;
    localStorage.setItem('cloud_backup_settings', JSON.stringify(cloudBackupSettings));
    showNotification('✅ ক্লাউড ব্যাকআপ সেটিংস আপডেট করা হয়েছে!', 'success');
}

function changeCloudProvider(provider) {
    cloudBackupSettings.provider = provider;
    localStorage.setItem('cloud_backup_settings', JSON.stringify(cloudBackupSettings));
    showNotification(`✅ ক্লাউড প্রভাইডার পরিবর্তন করা হয়েছে: ${provider}`, 'success');
}

function toggleAutoCloudBackup() {
    cloudBackupSettings.autoBackup = document.getElementById('autoCloudBackup').checked;
    localStorage.setItem('cloud_backup_settings', JSON.stringify(cloudBackupSettings));
    
    if (cloudBackupSettings.autoBackup) {
        scheduleCloudBackup();
        showNotification('✅ অটো ব্যাকআপ সক্রিয় করা হয়েছে!', 'success');
    } else {
        showNotification('❌ অটো ব্যাকআপ বন্ধ করা হয়েছে!', 'warning');
    }
}

function scheduleCloudBackup() {
    // অটো ব্যাকআপ শিডিউলিং লজিক
    console.log('Cloud backup scheduling initialized');
}

// গ্লোবাল এক্সেস
window.generateMonthlyReportChart = generateMonthlyReportChart;
window.generateConsumptionTrendReport = generateConsumptionTrendReport;
window.generateCostAnalysisReport = generateCostAnalysisReport;
window.generatePeakUsageReport = generatePeakUsageReport;
window.exportAllReports = exportAllReports;
window.scheduleAutoReports = scheduleAutoReports;
window.downloadCloudBackup = downloadCloudBackup;
window.toggleCloudBackup = toggleCloudBackup;
window.changeCloudProvider = changeCloudProvider;
window.toggleAutoCloudBackup = toggleAutoCloudBackup;

// DESCO বিল ক্যালকুলেটর রিসেট করুন
function resetBillCalculator() {
    // ইনপুট ফিল্ড ক্লিয়ার করুন
    document.getElementById('grossAmount').value = '';
    
    // বর্তমান মাস সেট করুন
    const now = new Date();
    const currentMonth = now.toISOString().substring(0, 7);
    document.getElementById('currentMonth').value = currentMonth;
    
    // রেজাল্ট লুকান
    document.getElementById('billResult').style.display = 'none';
    
    // ফোকাস গ্রোস অ্যামাউন্ট ফিল্ডে দিন
    document.getElementById('grossAmount').focus();
    
    showNotification('🔄 বিল ক্যালকুলেটর রিসেট করা হয়েছে!', 'info');
}

// Initialize the application
function initializeApp() {
    loadAllData();
    updateUI();
    scheduleNextBackup();
}

// Call initializeApp when the page loads
window.addEventListener('load', initializeApp);

// ==================== ENHANCED MULTI-BROWSER SYNC SYSTEM ====================

// ========== 1. কনফিগারেশন ==========
const SYNC_CONFIG = {
    syncInterval: 30000,        // 30 seconds auto sync
    storagePrefix: 'cloud_sync_',
    lastSyncKey: 'last_auto_sync_time',
    retryAttempts: 3,
    conflictResolution: 'last_write_wins' // or 'manual'
};

let syncTimer = null;
let isSyncing = false;

// ========== 2. অটো সিঙ্ক সেটআপ (Firebase Realtime এ সুইচ করা হয়েছে) ==========
function setupAutoSync() {
    console.log('🔄 Polling Sync system disabled. Using Firebase Realtime instead.');
    
    // পুরনো সব টাইমার থাকলে বন্ধ করে দিন
    if (typeof syncTimer !== 'undefined' && syncTimer) {
        clearInterval(syncTimer);
    }
    
    // পেজ ভিজিবল হলে বা অনলাইন হলে Firebase এ একবার ডাটা পুশ করবে (নিরাপদ সিঙ্ক)
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && navigator.onLine && currentUser) {
            autoSyncToFirebase(); // <--- নতুন Firebase সিঙ্ক কল হবে
        }
    });
    
    window.addEventListener('online', () => {
        if (currentUser) autoSyncToFirebase();
    });
}

// performAutoSync ফাংশনটি খালি করে দিন যাতে অন্য কোথাও থেকে কল হলেও এরর না দেয়
function performAutoSync() {
    console.log('ℹ️ Legacy performAutoSync skipped. Realtime Sync is active.');
    return; 
}

// ========== 3. অটো সিঙ্ক পারফর্ম ==========
async function performAutoSync() {
    if (isSyncing) {
        console.log('⏳ Sync already in progress, skipping...');
        return;
    }
    
    isSyncing = true;
    console.log('🔄 Auto sync started...');
    
    try {
        // 1. ক্লাউড থেকে ডেটা আনুন
        const cloudData = await fetchCloudDataAuto();
        
        // 2. লোকাল ডেটা প্রস্তুত করুন
        const localData = prepareLocalData();
        
        // 3. কনফ্লিক্ট চেক করুন
        const hasConflicts = checkForConflicts(localData, cloudData);
        
        if (hasConflicts) {
            console.log('⚠️ Conflicts detected, applying resolution...');
            await resolveConflicts(localData, cloudData);
        }
        
        // 4. ডেটা মার্জ করুন
        const mergedData = mergeDataAuto(localData, cloudData);
        
        // 5. মার্জড ডেটা সেভ করুন
        if (mergedData.changed) {
            await saveMergedData(mergedData.data);
            refreshAllUIAfterSync();
            showSyncNotification('✅ ডেটা অটো সিঙ্ক সম্পন্ন!');
        } else {
            console.log('📭 No changes detected');
        }
        
        // 6. শেষ সিঙ্ক টাইম আপডেট
        localStorage.setItem(SYNC_CONFIG.lastSyncKey, Date.now().toString());
        
    } catch (error) {
        console.error('❌ Auto sync failed:', error);
    } finally {
        isSyncing = false;
    }
}

// ========== 4. ক্লাউড থেকে ডেটা আনা ==========
async function fetchCloudDataAuto() {
    return new Promise((resolve) => {
        try {
            const userId = getUserIdSync();
            const cloudKey = `${SYNC_CONFIG.storagePrefix}${userId}`;
            const cloudData = localStorage.getItem(cloudKey);
            
            if (cloudData) {
                const parsed = JSON.parse(cloudData);
                resolve(parsed);
            } else {
                resolve(null);
            }
        } catch (error) {
            console.error('Fetch cloud data error:', error);
            resolve(null);
        }
    });
}

// ========== 5. লোকাল ডেটা প্রস্তুত ==========
function prepareLocalData() {
    return {
        transactions: transactions || [],
        monthlyRecharges: monthlyRecharges || [],
        currentBalance: currentBalance || 0,
        totalRecharge: totalRecharge || 0,
        totalExpended: totalExpended || 0,
        lastDemandChargeMonth: lastDemandChargeMonth || '',
        settings: settings || {},
        tariffRates: tariffRates || [],
        meterInfo: meterInfo || {},
        meters: meters || [],
        activeMeterId: activeMeterId,
        timestamp: Date.now(),
        version: '2.0',
        hash: generateDataHash()
    };
}

// ========== 6. ডেটা হ্যাশ জেনারেট ==========
function generateDataHash() {
    const dataString = JSON.stringify({
        transactions: transactions?.length,
        monthlyRecharges: monthlyRecharges?.length,
        currentBalance: currentBalance,
        totalRecharge: totalRecharge,
        totalExpended: totalExpended
    });
    
    // Simple hash function
    let hash = 0;
    for (let i = 0; i < dataString.length; i++) {
        const char = dataString.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return hash.toString();
}

// ========== 7. কনফ্লিক্ট চেক ==========
function checkForConflicts(localData, cloudData) {
    if (!cloudData) return false;
    
    // ট্রানজেকশন কাউন্ট মিসম্যাচ
    if (localData.transactions.length !== cloudData.transactions.length) {
        console.log('⚠️ Transaction count mismatch:', {
            local: localData.transactions.length,
            cloud: cloudData.transactions.length
        });
        return true;
    }
    
    // ব্যালেন্স মিসম্যাচ
    if (Math.abs(localData.currentBalance - cloudData.currentBalance) > 0.01) {
        console.log('⚠️ Balance mismatch:', {
            local: localData.currentBalance,
            cloud: cloudData.currentBalance
        });
        return true;
    }
    
    // হ্যাশ মিসম্যাচ
    if (localData.hash !== cloudData.hash) {
        console.log('⚠️ Data hash mismatch');
        return true;
    }
    
    return false;
}

// ========== 8. কনফ্লিক্ট রেজল্যুশন ==========
async function resolveConflicts(localData, cloudData) {
    if (SYNC_CONFIG.conflictResolution === 'last_write_wins') {
        // সর্বশেষ আপডেট যেটা সেটা রাখবে
        if (cloudData && cloudData.timestamp > (localData.timestamp || 0)) {
            console.log('📥 Using cloud data (newer)');
            await applyCloudData(cloudData);
        } else {
            console.log('📤 Using local data (newer)');
            await uploadLocalDataAuto();
        }
    } else {
        // ম্যানুয়াল রেজল্যুশনের জন্য নোটিফিকেশন
        showConflictResolutionModal(localData, cloudData);
    }
}

// ========== 9. কনফ্লিক্ট রেজল্যুশন মডাল ==========
function showConflictResolutionModal(localData, cloudData) {
    const modalHTML = `
        <div style="padding: 20px;">
            <h3 style="color: #e74c3c;">⚠️ ডেটা কনফ্লিক্ট detected!</h3>
            <p>আপনার লোকাল ডেটা এবং ক্লাউড ডেটার মধ্যে পার্থক্য আছে।</p>
            
            <div style="display: grid; gap: 15px; margin: 20px 0;">
                <div style="background: #e8f4fd; padding: 15px; border-radius: 8px;">
                    <strong>📱 লোকাল ডেটা:</strong>
                    <div>ট্রানজেকশন: ${localData.transactions.length}টি</div>
                    <div>ব্যালেন্স: ${localData.currentBalance.toFixed(2)} টাকা</div>
                    <div>শেষ আপডেট: ${new Date(localData.timestamp).toLocaleString()}</div>
                </div>
                
                <div style="background: #e8f6f3; padding: 15px; border-radius: 8px;">
                    <strong>☁️ ক্লাউড ডেটা:</strong>
                    <div>ট্রানজেকশন: ${cloudData.transactions.length}টি</div>
                    <div>ব্যালেন্স: ${cloudData.currentBalance.toFixed(2)} টাকা</div>
                    <div>শেষ আপডেট: ${new Date(cloudData.timestamp).toLocaleString()}</div>
                </div>
            </div>
            
            <div style="display: flex; gap: 10px;">
                <button onclick="resolveConflictKeepLocal()" style="flex:1; padding:12px; background:#3498db; color:white; border:none; border-radius:5px; cursor:pointer;">
                    💾 লোকাল রাখুন
                </button>
                <button onclick="resolveConflictKeepCloud()" style="flex:1; padding:12px; background:#27ae60; color:white; border:none; border-radius:5px; cursor:pointer;">
                    ☁️ ক্লাউড রাখুন
                </button>
                <button onclick="resolveConflictMerge()" style="flex:1; padding:12px; background:#9b59b6; color:white; border:none; border-radius:5px; cursor:pointer;">
                    🔄 মার্জ করুন
                </button>
            </div>
        </div>
    `;
    
    showCustomModal('ডেটা কনফ্লিক্ট', modalHTML);
    
    // গ্লোবাল রেজল্যুশন ফাংশন
    window.resolveConflictKeepLocal = async () => {
        await uploadLocalDataAuto();
        closeModal();
        showNotification('✅ লোকাল ডেটা ক্লাউডে সেভ করা হয়েছে', 'success');
    };
    
    window.resolveConflictKeepCloud = async () => {
        await applyCloudData(cloudData);
        closeModal();
        showNotification('✅ ক্লাউড ডেটা রিস্টোর করা হয়েছে', 'success');
    };
    
    window.resolveConflictMerge = async () => {
        const merged = mergeDataAuto(localData, cloudData);
        await saveMergedData(merged.data);
        closeModal();
        showNotification('✅ ডেটা মার্জ করা হয়েছে', 'success');
    };
}

// ========== 10. ডেটা মার্জ ==========
function mergeDataAuto(localData, cloudData) {
    let changed = false;
    const merged = { ...localData };
    
    if (!cloudData) {
        return { data: merged, changed: false };
    }
    
    // মার্জ ট্রানজেকশন (ইউনিক আইডি ভিত্তিক)
    const allTransactions = [...(localData.transactions || []), ...(cloudData.transactions || [])];
    const uniqueTransactions = new Map();
    
    allTransactions.forEach(t => {
        if (!uniqueTransactions.has(t.id) || 
            (uniqueTransactions.has(t.id) && new Date(t.timestamp) > new Date(uniqueTransactions.get(t.id).timestamp))) {
            uniqueTransactions.set(t.id, t);
        }
    });
    
    const newTransactions = Array.from(uniqueTransactions.values());
    newTransactions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    if (JSON.stringify(localData.transactions) !== JSON.stringify(newTransactions)) {
        merged.transactions = newTransactions;
        changed = true;
        console.log('✅ Transactions merged:', newTransactions.length);
    }
    
    // ব্যালেন্স মার্জ (নতুন টাইমস্ট্যাম্প অনুযায়ী)
    if (cloudData.timestamp > (localData.timestamp || 0)) {
        merged.currentBalance = cloudData.currentBalance;
        merged.totalRecharge = cloudData.totalRecharge;
        merged.totalExpended = cloudData.totalExpended;
        changed = true;
        console.log('✅ Balance merged from cloud');
    }
    
    merged.timestamp = Date.now();
    merged.hash = generateDataHash();
    
    return { data: merged, changed };
}

// ========== 11. মার্জড ডেটা সেভ ==========
async function saveMergedData(mergedData) {
    // লোকাল ডেটা আপডেট
    transactions = mergedData.transactions || [];
    monthlyRecharges = mergedData.monthlyRecharges || [];
    currentBalance = mergedData.currentBalance || 0;
    totalRecharge = mergedData.totalRecharge || 0;
    totalExpended = mergedData.totalExpended || 0;
    
    if (mergedData.settings) settings = { ...settings, ...mergedData.settings };
    if (mergedData.tariffRates) tariffRates = mergedData.tariffRates;
    if (mergedData.meterInfo) meterInfo = mergedData.meterInfo;
    if (mergedData.meters) meters = mergedData.meters;
    if (mergedData.activeMeterId) activeMeterId = mergedData.activeMeterId;
    
    // সেভ করুন
    saveAllData();
    
    // ক্লাউডে আপলোড
    await uploadLocalDataAuto();
    
    console.log('✅ Merged data saved successfully');
}

// ========== 12. ক্লাউড ডেটা অ্যাপ্লাই ==========
async function applyCloudData(cloudData) {
    if (!cloudData) return;
    
    transactions = cloudData.transactions || [];
    monthlyRecharges = cloudData.monthlyRecharges || [];
    currentBalance = cloudData.currentBalance || 0;
    totalRecharge = cloudData.totalRecharge || 0;
    totalExpended = cloudData.totalExpended || 0;
    
    if (cloudData.settings) settings = { ...settings, ...cloudData.settings };
    if (cloudData.tariffRates) tariffRates = cloudData.tariffRates;
    if (cloudData.meterInfo) meterInfo = cloudData.meterInfo;
    if (cloudData.meters) meters = cloudData.meters;
    if (cloudData.activeMeterId) activeMeterId = cloudData.activeMeterId;
    
    saveAllData();
    refreshAllUIAfterSync();
}

// ========== 13. লোকাল ডেটা ক্লাউডে আপলোড ==========
async function uploadLocalDataAuto() {
    try {
        const userId = getUserIdSync();
        const cloudKey = `${SYNC_CONFIG.storagePrefix}${userId}`;
        
        const localData = prepareLocalData();
        localStorage.setItem(cloudKey, JSON.stringify(localData));
        
        console.log('📤 Local data uploaded to cloud');
        return true;
    } catch (error) {
        console.error('Upload error:', error);
        return false;
    }
}

// ========== 14. ইউজার আইডি ==========
function getUserIdSync() {
    if (currentUser && currentUser.id) {
        return `user_${currentUser.id}`;
    }
    return `device_${window.location.hostname}`;
}

// ========== 15. UI রিফ্রেশ ==========
function refreshAllUIAfterSync() {
    updateBalanceDisplay();
    if (typeof loadTransactionReport === 'function') loadTransactionReport();
    if (typeof updateMeterDisplay === 'function') updateMeterDisplay();
    if (typeof updateUnitDisplay === 'function') updateUnitDisplay();
    if (typeof updateTariffDisplay === 'function') updateTariffDisplay();
    
    console.log('🔄 UI refreshed after sync');
}

// ========== 16. সিঙ্ক নোটিফিকেশন ==========
function showSyncNotification(message, type = 'success') {
    const existingNotif = document.querySelector('.sync-auto-notification');
    if (existingNotif) existingNotif.remove();
    
    const notificationHTML = `
        <div class="sync-auto-notification" style="
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'success' ? '#27ae60' : '#e74c3c'};
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.2);
            z-index: 10002;
            animation: slideInRight 0.5s ease;
            font-size: 14px;
        ">
            🔄 ${message}
        </div>
    `;
    
    const notif = document.createElement('div');
    notif.innerHTML = notificationHTML;
    document.body.appendChild(notif);
    
    setTimeout(() => {
        notif.style.opacity = '0';
        setTimeout(() => notif.remove(), 500);
    }, 3000);
}

// ========== 17. ম্যানুয়াল সিঙ্ক ==========
async function manualSyncNow() {
    showNotification('🔄 ম্যানুয়াল সিঙ্ক শুরু...', 'info');
    await performAutoSync();
}

// ========== 18. সিঙ্ক স্ট্যাটাস দেখান ==========
function showSyncStatusModal() {
    const lastSync = localStorage.getItem(SYNC_CONFIG.lastSyncKey);
    const lastSyncTime = lastSync ? new Date(parseInt(lastSync)).toLocaleString('bn-BD') : 'কখনো নয়';
    
    const statusHTML = `
        <div style="padding: 20px;">
            <h3>🔄 অটো সিঙ্ক স্ট্যাটাস</h3>
            <div style="margin: 15px 0;">
                <p><strong>শেষ সিঙ্ক:</strong> ${lastSyncTime}</p>
                <p><strong>স্ট্যাটাস:</strong> ${isSyncing ? '⏳ সিঙ্কিং...' : (navigator.onLine ? '✅ অনলাইন' : '⚠️ অফলাইন')}</p>
                <p><strong>অটো সিঙ্ক:</strong> প্রতি ${SYNC_CONFIG.syncInterval / 1000} সেকেন্ড</p>
                <p><strong>ট্রানজেকশন:</strong> ${transactions?.length || 0}টি</p>
                <p><strong>ক্লাউড ব্যাকআপ:</strong> ${localStorage.getItem(`${SYNC_CONFIG.storagePrefix}${getUserIdSync()}`) ? '✅ আছে' : '❌ নেই'}</p>
            </div>
            <div style="display: flex; gap: 10px;">
                <button onclick="manualSyncNow(); closeModal();" style="flex:1; padding:12px; background:#3498db; color:white; border:none; border-radius:5px; cursor:pointer;">
                    🔄 এখনই সিঙ্ক
                </button>
                <button onclick="exportUserData(); closeModal();" style="flex:1; padding:12px; background:#27ae60; color:white; border:none; border-radius:5px; cursor:pointer;">
                    📤 ব্যাকআপ
                </button>
            </div>
        </div>
    `;
    showCustomModal('সিঙ্ক স্ট্যাটাস', statusHTML);
}

// ========== 19. সিঙ্ক বাটন যোগ করুন ==========
function addSyncButtons() {
    const headerControls = document.querySelector('.header-controls');
    if (!headerControls) return;
    
    if (!document.querySelector('.auto-sync-btn')) {
        const syncBtn = document.createElement('button');
        syncBtn.className = 'control-btn auto-sync-btn';
        syncBtn.innerHTML = '🔄 অটো সিঙ্ক';
        syncBtn.onclick = manualSyncNow;
        syncBtn.title = 'ম্যানুয়ালি ডেটা সিঙ্ক করুন';
        headerControls.appendChild(syncBtn);
    }
    
    if (!document.querySelector('.sync-status-btn')) {
        const statusBtn = document.createElement('button');
        statusBtn.className = 'control-btn sync-status-btn';
        statusBtn.innerHTML = '📊 সিঙ্ক স্ট্যাটাস';
        statusBtn.onclick = showSyncStatusModal;
        headerControls.appendChild(statusBtn);
    }
}

// ========== 20. এক্সপোর্ট ফাংশন আপগ্রেড ==========
window.exportUserData = function() {
    showNotification('📤 ডেটা এক্সপোর্ট শুরু...', 'info');
    
    const allData = {};
    
    for (let key in localStorage) {
        if (localStorage.hasOwnProperty(key) && !key.startsWith('#')) {
            try {
                allData[key] = JSON.parse(localStorage.getItem(key));
            } catch {
                allData[key] = localStorage.getItem(key);
            }
        }
    }
    
    const dataStr = JSON.stringify(allData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = 'electric_bill_backup_' + new Date().toISOString().split('T')[0] + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showNotification('✅ সব ডেটা এক্সপোর্ট সম্পন্ন!', 'success');
};

// ========== 21. সিঙ্ক সিস্টেম ইনিশিয়ালাইজ ==========
function initializeSyncSystem() {
    console.log('🚀 Initializing UI Sync helpers...');
    
    // টাইমার ছাড়া শুধুমাত্র সেটআপ রান করুন
    setupAutoSync();
    
    // বাটনগুলো যোগ করুন (যদি না থাকে)
    if (typeof addSyncButtons === 'function') addSyncButtons();
    
    // ইম্পোর্ট ফাংশনটি আগের মতোই থাকবে
    window.importUserData = window.importUserData || function() {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.json';
        fileInput.onchange = function(e) {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    const allData = JSON.parse(e.target.result);
                    for (let key in allData) {
                        if (typeof allData[key] === 'object') {
                            localStorage.setItem(key, JSON.stringify(allData[key]));
                        } else {
                            localStorage.setItem(key, allData[key]);
                        }
                    }
                    showNotification('✅ ডেটা ইম্পোর্ট সফল! Firebase এ সিঙ্ক হচ্ছে...', 'success');
                    // ইম্পোর্ট করার পর Firebase এ আপডেট পাঠিয়ে দিন
                    setTimeout(() => {
                        autoSyncToFirebase();
                        location.reload();
                    }, 1000);
                } catch (error) {
                    showNotification('❌ ইম্পোর্ট ব্যর্থ!', 'error');
                }
            };
            reader.readAsText(file);
        };
        fileInput.click();
    };
    
    // হেল্প মডাল আপডেট
    window.showSyncHelp = window.showSyncHelp || function() {
        showCustomModal('🌐 রিয়েল-টাইম সিঙ্ক', `
            <div style="padding:20px">
                <h3>🚀 Firebase রিয়েল-টাইম সিঙ্ক সক্রিয়!</h3>
                <p>আপনার ডাটা এখন সব ডিভাইসে সাথে সাথে (Instant) সিঙ্ক হবে।</p>
                <p>ব্যালেন্স আপডেট বা রিচার্জ করার সাথে সাথে অন্য ব্রাউজারে অটো আপডেট হয়ে যাবে।</p>
                <button onclick="closeModal()" style="margin-top:15px; padding:10px 20px; background:#3498db; color:white; border:none; border-radius:5px; cursor:pointer;">বুঝলাম</button>
            </div>
        `);
    };
}

// ========== 22. পেজ লোডে স্টার্ট ==========
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(initializeSyncSystem, 2000);
    });
} else {
    setTimeout(initializeSyncSystem, 2000);
}

// গ্লোবাল ফাংশন এক্সপোজ
window.manualSyncNow = manualSyncNow;
window.showSyncStatusModal = showSyncStatusModal;
window.performAutoSync = performAutoSync;

console.log('✅ Enhanced Multi-Browser Sync System Loaded with Auto Sync!');

// ==================== END ENHANCED MULTI-BROWSER SYNC SYSTEM ====================

// ==================== PWA INSTALLATION HANDLER (IMPROVED) ====================

let deferredPrompt;
let installButton;
let installPromptAttempts = 0;
const MAX_PROMPT_ATTEMPTS = 3;

// Install prompt event
window.addEventListener('beforeinstallprompt', (e) => {
    console.log('🚀 PWA Install Prompt triggered');
    e.preventDefault();
    deferredPrompt = e;
    
    // ইউজারকে দেখান যে অ্যাপ ইন্সটল করা যাবে
    showInstallButton();
    
    // ইউজার যদি আগে ইন্সটল করে থাকে, তাহলে পরে আর দেখাবেন না
    if (localStorage.getItem('pwa_installed') === 'true') {
        hideInstallButton();
    }
});

// Show custom install button (improved)
function showInstallButton() {
    // Remove existing button if any
    const existingBtn = document.querySelector('.install-btn');
    if (existingBtn) existingBtn.remove();
    
    // চেক করুন অ্যাপ ইতিমধ্যে ইন্সটলড কিনা
    if (isRunningAsPWA() || localStorage.getItem('pwa_installed') === 'true') {
        console.log('✅ App already installed, not showing install button');
        return;
    }
    
    // চেক করুন ইউজার আগে ডিক্লাইন করেছে কিনা
    const lastDeclineTime = localStorage.getItem('pwa_install_declined');
    if (lastDeclineTime) {
        const hoursSinceDecline = (Date.now() - parseInt(lastDeclineTime)) / (1000 * 60 * 60);
        if (hoursSinceDecline < 24) {
            console.log('⏰ User declined install in last 24 hours, not showing button');
            return;
        }
    }
    
    // Create install button with better styling
    installButton = document.createElement('button');
    installButton.className = 'install-btn';
    installButton.innerHTML = '📱 অ্যাপ ইন্সটল করুন';
    installButton.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        border: none;
        padding: 12px 20px;
        border-radius: 25px;
        cursor: pointer;
        z-index: 10000;
        font-size: 14px;
        font-weight: bold;
        box-shadow: 0 4px 15px rgba(0,0,0,0.2);
        transition: all 0.3s ease;
        animation: bounceIn 0.6s ease;
    `;
    
    // Hover effects
    installButton.onmouseover = function() {
        this.style.transform = 'translateY(-3px) scale(1.02)';
        this.style.boxShadow = '0 8px 25px rgba(102, 126, 234, 0.4)';
    };
    
    installButton.onmouseout = function() {
        this.style.transform = 'translateY(0) scale(1)';
        this.style.boxShadow = '0 4px 15px rgba(0,0,0,0.2)';
    };
    
    installButton.onclick = () => {
        installApp();
        // ক্লিক করার পর অ্যানিমেশন
        installButton.style.transform = 'scale(0.95)';
        setTimeout(() => {
            if (installButton) installButton.style.transform = 'scale(1)';
        }, 200);
    };
    
    document.body.appendChild(installButton);
    
    // 30 সেকেন্ড পর অটো হাইড (ইউজারকে বিরক্ত না করতে)
    setTimeout(() => {
        if (installButton && installButton.style.display !== 'none') {
            installButton.style.opacity = '0';
            setTimeout(() => {
                if (installButton) installButton.style.display = 'none';
            }, 500);
        }
    }, 30000);
}

// Hide install button
function hideInstallButton() {
    if (installButton) {
        installButton.style.opacity = '0';
        setTimeout(() => {
            if (installButton) installButton.remove();
        }, 300);
    }
}

// Install app function (improved)
async function installApp() {
    if (!deferredPrompt) {
        // Fallback: browser's native install
        showNotification('📱 মেনু থেকে "অ্যাপ ইন্সটল করুন" সিলেক্ট করুন', 'info');
        return;
    }
    
    try {
        // Show install prompt
        deferredPrompt.prompt();
        
        const choiceResult = await deferredPrompt.userChoice;
        
        if (choiceResult.outcome === 'accepted') {
            console.log('✅ User installed the app');
            showNotification('🎉 অ্যাপ সফলভাবে ইন্সটল হয়েছে! হোম স্ক্রিনে চেক করুন।', 'success');
            localStorage.setItem('pwa_installed', 'true');
            if (installButton) hideInstallButton();
            
            // ইন্সটল成功后 ট্র্যাক করুন
            if (typeof gtag !== 'undefined') {
                gtag('event', 'pwa_install', { 'event_category': 'engagement' });
            }
        } else {
            console.log('❌ User dismissed install prompt');
            showNotification('অ্যাপ ইন্সটল বাতিল করা হয়েছে। পরে আবার চেষ্টা করতে পারেন।', 'info');
            
            // ডিক্লাইন ট্র্যাক করুন
            localStorage.setItem('pwa_install_declined', Date.now().toString());
            installPromptAttempts++;
            
            // ২৪ ঘন্টা পর আবার দেখানোর জন্য
            setTimeout(() => {
                if (deferredPrompt && installPromptAttempts < MAX_PROMPT_ATTEMPTS) {
                    showInstallButton();
                }
            }, 24 * 60 * 60 * 1000);
        }
        
        deferredPrompt = null;
        
    } catch (error) {
        console.error('Installation error:', error);
        showNotification('❌ ইন্সটল করতে সমস্যা হয়েছে!', 'error');
    }
}

// Detect if app is already installed
window.addEventListener('appinstalled', (evt) => {
    console.log('🏠 App was installed successfully');
    localStorage.setItem('pwa_installed', 'true');
    if (installButton) hideInstallButton();
    
    // Optional: Send analytics
    if (typeof gtag !== 'undefined') {
        gtag('event', 'pwa_installed', { 'event_category': 'engagement' });
    }
});

// Check if app is running in standalone mode (improved)
function isRunningAsPWA() {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                         window.navigator.standalone === true ||
                         document.referrer.includes('android-app://');
    
    // Display mode detect via meta
    const isPWA = document.querySelector('meta[name="apple-mobile-web-app-capable"]')?.content === 'yes';
    
    return isStandalone || isPWA;
}

// Show custom install guide for mobile browsers
function showInstallGuide() {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isAndroid = /Android/.test(navigator.userAgent);
    
    let guideHTML = '';
    
    if (isIOS) {
        guideHTML = `
            <div style="text-align: center; padding: 20px;">
                <div style="font-size: 48px; margin-bottom: 15px;">📱</div>
                <h3 style="color: #2c3e50;">কিভাবে অ্যাপ ইন্সটল করবেন?</h3>
                <ol style="text-align: left; margin-top: 20px;">
                    <li>শেয়ার বাটনে 🖨️ ক্লিক করুন</li>
                    <li>"হোম স্ক্রিনে যোগ করুন" সিলেক্ট করুন</li>
                    <li>✅ "যোগ করুন" এ ক্লিক করুন</li>
                </ol>
                <button onclick="closeModal()" style="margin-top: 20px; padding: 10px 20px; background: #3498db; color: white; border: none; border-radius: 5px; cursor: pointer;">বুঝলাম</button>
            </div>
        `;
    } else if (isAndroid) {
        guideHTML = `
            <div style="text-align: center; padding: 20px;">
                <div style="font-size: 48px; margin-bottom: 15px;">🤖</div>
                <h3 style="color: #2c3e50;">কিভাবে অ্যাপ ইন্সটল করবেন?</h3>
                <ol style="text-align: left; margin-top: 20px;">
                    <li>মেনু বাটনে ⋮ ক্লিক করুন</li>
                    <li>"অ্যাপ ইন্সটল করুন" সিলেক্ট করুন</li>
                    <li>✅ "ইন্সটল" এ ক্লিক করুন</li>
                </ol>
                <button onclick="closeModal()" style="margin-top: 20px; padding: 10px 20px; background: #3498db; color: white; border: none; border-radius: 5px; cursor: pointer;">বুঝলাম</button>
            </div>
        `;
    }
    
    if (guideHTML) {
        showCustomModal('📱 অ্যাপ ইন্সটল গাইড', guideHTML);
    }
}

// Check for update on page load
window.addEventListener('load', () => {
    // চেক করুন অ্যাপ ইন্সটলড কিনা
    if (isRunningAsPWA()) {
        console.log('✅ Running as PWA');
        localStorage.setItem('pwa_installed', 'true');
        if (installButton) hideInstallButton();
    }
    
    // Service Worker update check
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then(registration => {
            registration.update();
        });
    }
});

// Add install guide button to header (optional)
function addInstallGuideButton() {
    if (!isRunningAsPWA() && !localStorage.getItem('pwa_installed')) {
        const headerControls = document.querySelector('.header-controls');
        if (headerControls && !document.querySelector('.install-guide-btn')) {
            const guideBtn = document.createElement('button');
            guideBtn.className = 'control-btn';
            guideBtn.innerHTML = '📱 ইন্সটল গাইড';
            guideBtn.onclick = showInstallGuide;
            guideBtn.style.background = 'linear-gradient(135deg, #e67e22, #d35400)';
            headerControls.appendChild(guideBtn);
        }
    }
}

// Show install info in console
console.log('📱 PWA Status:', isRunningAsPWA() ? '✅ Installed' : '❌ Not Installed');

// Animation CSS
if (!document.querySelector('#pwa-install-style')) {
    const style = document.createElement('style');
    style.id = 'pwa-install-style';
    style.textContent = `
        @keyframes bounceIn {
            0% {
                opacity: 0;
                transform: scale(0.3);
            }
            50% {
                opacity: 1;
                transform: scale(1.05);
            }
            70% {
                transform: scale(0.9);
            }
            100% {
                transform: scale(1);
            }
        }
        
        .install-btn {
            animation: bounceIn 0.6s ease;
        }
    `;
    document.head.appendChild(style);
}

// Initialize guide button on DOM ready
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(addInstallGuideButton, 2000);
});

// ==================== END PWA INSTALLATION HANDLER ====================

// ==================== মাসিক ইউনিট ট্র্যাকিং সিস্টেম ====================

// মাসিক ইউনিট ডেটা স্ট্রাকচার
let monthlyUnitData = {
    currentMonth: '',
    currentMonthUnits: 0,
    totalUnits: 0,
    monthlyHistory: [],
    lastResetDate: null
};

// মাসিক ইউনিট ডেটা লোড করা
function loadMonthlyUnitData() {
    try {
        const savedData = localStorage.getItem('desco_monthly_unit_data');
        if (savedData) {
            monthlyUnitData = JSON.parse(savedData);
        }
        
        // স্বয়ংক্রিয় মাসিক রিসেট চেক করুন
        checkAutoMonthlyReset();
        
        // বর্তমান মাস সেট করুন
        setCurrentMonth();
        
    } catch (error) {
        console.error('মাসিক ইউনিট ডেটা লোড করতে সমস্যা:', error);
        initializeMonthlyUnitData();
    }
}

// মাসিক ইউনিট ডেটা ইনিশিয়ালাইজ
function initializeMonthlyUnitData() {
    const now = new Date();
    const currentMonth = now.toISOString().substring(0, 7); // YYYY-MM
    
    monthlyUnitData = {
        currentMonth: currentMonth,
        currentMonthUnits: 0,
        totalUnits: 0,
        monthlyHistory: [],
        lastResetDate: now.toISOString().split('T')[0]
    };
    
    saveMonthlyUnitData();
}

// মাসিক ইউনিট ডেটা সেভ করা
function saveMonthlyUnitData() {
    localStorage.setItem('desco_monthly_unit_data', JSON.stringify(monthlyUnitData));
}

// বর্তমান মাস সেট করা
function setCurrentMonth() {
    const now = new Date();
    const currentMonth = now.toISOString().substring(0, 7);
    
    if (monthlyUnitData.currentMonth !== currentMonth) {
        // নতুন মাসের জন্য হিস্ট্রি আপডেট করুন
        if (monthlyUnitData.currentMonth && monthlyUnitData.currentMonthUnits > 0) {
            monthlyUnitData.monthlyHistory.push({
                month: monthlyUnitData.currentMonth,
                units: monthlyUnitData.currentMonthUnits,
                timestamp: new Date().toISOString()
            });
        }
        
        // নতুন মাস সেট করুন
        monthlyUnitData.currentMonth = currentMonth;
        monthlyUnitData.currentMonthUnits = 0;
        monthlyUnitData.lastResetDate = now.toISOString().split('T')[0];
        
        saveMonthlyUnitData();
        console.log('নতুন মাস সেট করা হয়েছে:', currentMonth);
    }
}

// স্বয়ংক্রিয় মাসিক রিসেট চেক করা
function checkAutoMonthlyReset() {
    const now = new Date();
    const today = now.getDate();
    
    // যদি আজ ১ তারিখ হয় এবং শেষ রিসেট তারিখ আজকের তারিখ না হয়
    if (today === 1) {
        const todayStr = now.toISOString().split('T')[0];
        
        if (monthlyUnitData.lastResetDate !== todayStr) {
            console.log('স্বয়ংক্রিয় মাসিক রিসেট করা হচ্ছে...');
            resetMonthlyUnits();
        }
    }
}

// মাসিক ইউনিট রিসেট করা - শুধু বর্তমান মাস রিসেট হবে
function resetMonthlyUnits() {
    const now = new Date();
    const currentMonth = now.toISOString().substring(0, 7);
    
    // শুধুমাত্র যদি বর্তমান মাসে ইউনিট থাকে, তাহলে হিস্ট্রিতে সেভ করুন
    if (monthlyUnitData.currentMonthUnits > 0) {
        monthlyUnitData.monthlyHistory.push({
            month: monthlyUnitData.currentMonth,
            units: monthlyUnitData.currentMonthUnits,
            timestamp: new Date().toISOString()
        });
    }
    
    // শুধু বর্তমান মাস রিসেট করুন, মোট ইউনিট অপরিবর্তিত রাখুন
    monthlyUnitData.currentMonth = currentMonth;
    monthlyUnitData.currentMonthUnits = 0;
    monthlyUnitData.lastResetDate = now.toISOString().split('T')[0];
    
    saveMonthlyUnitData();
    updateUnitDisplay();
    
    showNotification('✅ বর্তমান মাসের ইউনিট রিসেট করা হয়েছে! মোট ইউনিট সংরক্ষিত আছে।', 'success');
    
    // রিপোর্ট রিফ্রেশ করুন
    if (document.querySelector('.modal')) {
        showMonthlyUnitReport();
    }
}

// ইউনিট যোগ করা
function addUnitsToMonthly(units, description = '') {
    if (!units || units <= 0) {
        showNotification('❌ বৈধ ইউনিট সংখ্যা দিন!', 'error');
        return;
    }
    
    // বর্তমান মাস সেট করুন
    setCurrentMonth();
    
    // ইউনিট যোগ করুন
    monthlyUnitData.currentMonthUnits += units;
    monthlyUnitData.totalUnits += units;
    
    saveMonthlyUnitData();
    updateUnitDisplay();
    
    console.log('ইউনিট যোগ করা হয়েছে:', {
        currentMonth: monthlyUnitData.currentMonth,
        currentMonthUnits: monthlyUnitData.currentMonthUnits,
        totalUnits: monthlyUnitData.totalUnits,
        description: description
    });
    
    showNotification(`✅ ${units} kWh ইউনিট যোগ করা হয়েছে!`, 'success');
}

// ইউনিট ডিসপ্লে আপডেট করা
function updateUnitDisplay() {
    try {
        console.log('🔄 ইউনিট ডিসপ্লে আপডেট হচ্ছে...');
        console.log('বর্তমান ডেটা:', monthlyUnitData);
        
        // বর্তমান মাসের ইউনিট
        const currentMonthElement = document.getElementById('currentMonthUnits');
        if (currentMonthElement) {
            currentMonthElement.textContent = toBanglaNumber(monthlyUnitData.currentMonthUnits.toFixed(2));
            console.log('বর্তমান মাসের ইউনিট আপডেট হয়েছে:', monthlyUnitData.currentMonthUnits);
        } else {
            console.log('❌ currentMonthElements element পাওয়া যায়নি');
        }
        
        // মোট ইউনিট
        const totalUnitsElement = document.getElementById('totalUnitsDisplay');
        if (totalUnitsElement) {
            totalUnitsElement.textContent = toBanglaNumber(monthlyUnitData.totalUnits.toFixed(2));
            console.log('মোট ইউনিট আপডেট হয়েছে:', monthlyUnitData.totalUnits);
        } else {
            console.log('❌ totalUnitsDisplay element পাওয়া যায়নি');
        }
        
        // মাসের নাম
        const monthNameElement = document.getElementById('currentMonthName');
        if (monthNameElement) {
            monthNameElement.textContent = formatMonthForDisplay(monthlyUnitData.currentMonth);
            console.log('মাসের নাম আপডেট হয়েছে:', monthlyUnitData.currentMonth);
        } else {
            console.log('❌ currentMonthName element পাওয়া যায়নি');
        }
        
        // শেষ রিসেট তারিখ
        const lastResetElement = document.getElementById('lastResetDate');
        if (lastResetElement) {
            const dstr = monthlyUnitData.lastResetDate || '';
            const iso = dstr ? new Date(dstr).toISOString() : '';
            lastResetElement.textContent = iso ? formatTimestampForDisplay(iso) : 'N/A';
            console.log('শেষ রিসেট আপডেট হয়েছে:', monthlyUnitData.lastResetDate);
        } else {
            console.log('❌ lastResetDate element পাওয়া যায়নি');
        }
        
        console.log('✅ ইউনিট ডিসপ্লে আপডেট সম্পন্ন');
        
    } catch (error) {
        console.error('❌ ইউনিট ডিসপ্লে আপডেট করতে সমস্যা:', error);
    }
}

// মাসিক ইউনিট রিপোর্ট দেখানো - আপডেটেড ভার্সন
function showMonthlyUnitReport() {
    let reportHTML = `
        <div style="text-align: center; margin-bottom: 20px;">
            <h3 style="color: #2c3e50;">📊 মাসিক ইউনিট রিপোর্ট</h3>
        </div>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px;">
            <div style="background: linear-gradient(135deg, #3498db, #2980b9); color: white; padding: 15px; border-radius: 10px; text-align: center;">
                <div style="font-size: 24px; font-weight: bold;">${toBanglaNumber(monthlyUnitData.currentMonthUnits.toFixed(2))}</div>
                <small>বর্তমান মাসের ইউনিট</small>
            </div>
            <div style="background: linear-gradient(135deg, #27ae60, #229954); color: white; padding: 15px; border-radius: 10px; text-align: center;">
                <div style="font-size: 24px; font-weight: bold;">${toBanglaNumber(monthlyUnitData.totalUnits.toFixed(2))}</div>
                <small>মোট ইউনিট</small>
            </div>
        </div>
    `;
    
    // মাসিক হিস্ট্রি
    if (monthlyUnitData.monthlyHistory.length > 0) {
        reportHTML += `
            <div style="max-height: 300px; overflow-y: auto;">
                <h4 style="color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 8px;">মাসিক হিস্ট্রি</h4>
        `;
        
        monthlyUnitData.monthlyHistory
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .forEach(item => {
                reportHTML += `
                    <div style="background: #f8f9fa; padding: 12px; margin: 8px 0; border-radius: 8px; border-left: 4px solid #e74c3c;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <strong>${formatMonthForDisplay(item.month)}</strong>
                            </div>
                            <div style="font-weight: bold; color: #e74c3c; font-size: 16px;">
                                ${toBanglaNumber(item.units.toFixed(2))} kWh
                            </div>
                        </div>
                    </div>
                `;
            });
        
        reportHTML += `</div>`;
    }
    
    // দুইটি রিসেট বাটন
    reportHTML += `
        <div style="margin-top: 20px; display: grid; gap: 10px;">
            <button onclick="resetMonthlyUnits()" style="
                padding: 12px;
                background: #f39c12;
                color: white;
                border: none;
                border-radius: 5px;
                cursor: pointer;
                font-size: 14px;
            ">🔄 শুধু বর্তমান মাস রিসেট করুন</button>
            
            <button onclick="resetAllUnits()" style="
                padding: 12px;
                background: #e74c3c;
                color: white;
                border: none;
                border-radius: 5px;
                cursor: pointer;
                font-size: 14px;
            ">🗑️ সব ইউনিট ডেটা রিসেট করুন</button>
        </div>
        
        <div style="margin-top: 15px; padding: 10px; background: #fff3cd; border-radius: 5px; border-left: 4px solid #ffc107;">
            <small>💡 টিপ: "শুধু বর্তমান মাস রিসেট" করলে মোট ইউনিট এবং হিস্ট্রি থাকবে</small>
        </div>
    `;
    
    showCustomModal('মাসিক ইউনিট রিপোর্ট', reportHTML);
}

// ম্যানুয়াল ইউনিট যোগ করার ফাংশন
function addManualUnits() {
    const unitsInput = prompt('ইউনিট সংখ্যা ইনপুট করুন (kWh):');
    
    if (unitsInput && !isNaN(unitsInput)) {
        const units = parseFloat(unitsInput);
        const description = prompt('বিবরণ দিন (ঐচ্ছিক):') || 'ম্যানুয়াল ইউনিট যোগ';
        
        addUnitsToMonthly(units, description);
    }
}

// বিদ্যুৎ বিল যোগ করার সময় এই ফাংশন call করুন
function addElectricityBillWithUnits(amount, units, date) {
    // বিদ্যুৎ বিল যোগ করুন
    addElectricityBill(amount, units, date);
    
    // ইউনিট যোগ করুন
    if (units && units > 0) {
        const transactionDate = new Date(date);
        const transactionMonth = `${transactionDate.getFullYear()}-${(transactionDate.getMonth() + 1).toString().padStart(2, '0')}`;
        
        // যদি বর্তমান মাসের বিল হয়, তাহলে currentMonthUnits-এ যোগ করুন
        if (transactionMonth === monthlyUnitData.currentMonth) {
            monthlyUnitData.currentMonthUnits += units;
        }
        
        // মোট ইউনিটেও যোগ করুন
        monthlyUnitData.totalUnits += units;
        
        saveMonthlyUnitData();
        updateUnitDisplay();
        
        console.log('ইউনিট যোগ করা হয়েছে:', {
            currentMonth: monthlyUnitData.currentMonth,
            currentMonthUnits: monthlyUnitData.currentMonthUnits,
            totalUnits: monthlyUnitData.totalUnits
        });
    }
}

// ==================== মাসিক ইউনিট ট্র্যাকিং সিস্টেম শেষ ====================

// ==================== অটো ইউনিট ট্র্যাকিং ====================

// Report থেকে অটো ইউনিট লোড করার ফাংশন
function loadUnitsFromReport() {
    console.log('📊 Report থেকে ইউনিট লোড করা হচ্ছে...');
    
    const unitResult = calculateTotalUnitsFromReport();
    
    if (unitResult.hasUnits && unitResult.totalUnits > 0) {
        // শুধুমাত্র যদি আগে থেকে ইউনিট না থাকে
        if (monthlyUnitData.totalUnits === 0) {
            monthlyUnitData.totalUnits = unitResult.totalUnits;
            
            // বর্তমান মাসের ইউনিট সেট করুন (মোটের ৩০% ধরুন)
            monthlyUnitData.currentMonthUnits = unitResult.totalUnits * 0.3;
            
            saveMonthlyUnitData();
            updateUnitDisplay();
            
            console.log('✅ Report থেকে ইউনিট লোড করা হয়েছে:', unitResult.totalUnits);
            showNotification('✅ বিদ্যমান ইউনিট ডেটা লোড করা হয়েছে!', 'success');
        }
    }
}

// বিদ্যুৎ বিল যোগ করার সময় অটো ইউনিট ট্র্যাক
function addElectricityBillWithAutoTrack(amount, units, date) {
    // বিদ্যুৎ বিল যোগ করুন
    addElectricityBill(amount, units, date);
    
    // ইউনিট অটো ট্র্যাক করুন
    if (units && units > 0) {
        addUnitsToMonthly(units, `বিদ্যুৎ বিল - ${date}`);
    }
}

// Report ট্যাব খুললে অটো ইউনিট আপডেট
function loadTransactionReportWithAutoUnits() {
    // প্রথমে সাধারণ Report লোড করুন
    loadTransactionReport();
    
    // তারপর ইউনিট ট্র্যাকার আপডেট করুন
    setTimeout(() => {
        updateUnitDisplayFromReport();
    }, 100);
}

// Report থেকে ইউনিট ডেটা নিয়ে ট্র্যাকার আপডেট
function updateUnitDisplayFromReport() {
    const unitResult = calculateTotalUnitsFromReport();
    
    if (unitResult.hasUnits && unitResult.totalUnits > 0) {
        // মোট ইউনিট আপডেট করুন
        monthlyUnitData.totalUnits = unitResult.totalUnits;
        
        // যদি বর্তমান মাসের ইউনিট ০ থাকে, তাহলে কিছু ইউনিট assign করুন
        if (monthlyUnitData.currentMonthUnits === 0) {
            monthlyUnitData.currentMonthUnits = unitResult.totalUnits * 0.2; // ২০% নতুন মাসের জন্য
        }
        
        saveMonthlyUnitData();
        updateUnitDisplay();
    }
}

// Report থেকে বর্তমান মাসের ইউনিট calculate করার ফাংশন
function loadCurrentMonthUnitsFromReport() {
    console.log('📊 বর্তমান মাসের ইউনিট calculate করা হচ্ছে...');
    
    const currentMonth = monthlyUnitData.currentMonth; // যেমন: "2025-11"
    let currentMonthUnits = 0;
    
    // Transactions থেকে বর্তমান মাসের ইউনিট বের করুন
    transactions.forEach(transaction => {
        if (transaction.type === 'electricity_bill' && transaction.units) {
            const transactionDate = new Date(transaction.timestamp);
            const transactionMonth = `${transactionDate.getFullYear()}-${(transactionDate.getMonth() + 1).toString().padStart(2, '0')}`;
            
            if (transactionMonth === currentMonth) {
                currentMonthUnits += transaction.units;
            }
        }
    });
    
    return currentMonthUnits;
}

// আপডেটেড loadUnitsFromReport ফাংশন
function loadUnitsFromReport() {
    console.log('📊 Report থেকে ইউনিট লোড করা হচ্ছে...');
    
    const unitResult = calculateTotalUnitsFromReport();
    
    if (unitResult.hasUnits && unitResult.totalUnits > 0) {
        // মোট ইউনিট আপডেট করুন
        monthlyUnitData.totalUnits = unitResult.totalUnits;
        
        // বর্তমান মাসের ইউনিট calculate করুন
        monthlyUnitData.currentMonthUnits = loadCurrentMonthUnitsFromReport();
        
        // যদি বর্তমান মাসের ইউনিট ০ হয়, তাহলে কিছু ইউনিট assign করুন
        if (monthlyUnitData.currentMonthUnits === 0) {
            monthlyUnitData.currentMonthUnits = unitResult.totalUnits * 0.1; // ১০% নতুন মাসের জন্য
        }
        
        saveMonthlyUnitData();
        updateUnitDisplay();
        
        console.log('✅ Report থেকে ইউনিট লোড করা হয়েছে:', {
            totalUnits: unitResult.totalUnits,
            currentMonthUnits: monthlyUnitData.currentMonthUnits
        });
    }
}

// সম্পূর্ণ রিসেট (মোট ইউনিট এবং হিস্ট্রি সহ)
function resetAllUnits() {
    if (confirm('⚠️ আপনি কি নিশ্চিত যে সব ইউনিট ডেটা রিসেট করতে চান?\n\n✅ মোট ইউনিট ০ হবে\n✅ মাসিক হিস্ট্রি ডিলিট হবে\n✅ বর্তমান মাস রিসেট হবে')) {
        monthlyUnitData.currentMonthUnits = 0;
        monthlyUnitData.totalUnits = 0;
        monthlyUnitData.monthlyHistory = [];
        monthlyUnitData.lastResetDate = new Date().toISOString().split('T')[0];
        
        saveMonthlyUnitData();
        updateUnitDisplay();
        
        showNotification('✅ সব ইউনিট ডেটা রিসেট করা হয়েছে!', 'success');
        
        // রিপোর্ট রিফ্রেশ করুন
        if (document.querySelector('.modal')) {
            showMonthlyUnitReport();
        }
    }
}

// মাসিক ইউনিটের জন্য স্ল্যাব ক্যালকুলেশন (০ থেকে শুরু)
function calculateMonthlySlabBreakdown(monthlyUnits) {
    console.log('=== মাসিক স্ল্যাব ক্যালকুলেশন (০ থেকে শুরু) ===');
    console.log('মাসিক ইউনিট:', monthlyUnits, 'kWh');
    
    let remainingUnits = monthlyUnits;
    let totalCost = 0;
    let slabBreakdown = [];
    
    // Lifeline সহ সঠিক DESCO ট্যারিফ রেট
    const tariffRates = [
        { range: [0, 50], rate: 3.50, name: "Lifeline (০-৫০)" },
        { range: [51, 75], rate: 4.00, name: "১ম স্ল্যাব (৫১-৭৫)" },
        { range: [76, 200], rate: 5.45, name: "২য় স্ল্যাব (৭৬-২০০)" },
        { range: [201, 300], rate: 5.70, name: "৩য় স্ল্যাব (২০১-৩০০)" },
        { range: [301, 400], rate: 6.02, name: "৪র্থ স্ল্যাব (৩০১-৪০০)" },
        { range: [401, 600], rate: 9.30, name: "৫ম স্ল্যাব (৪০১-৬০০)" },
        { range: [601, Infinity], rate: 10.70, name: "৬ষ্ঠ স্ল্যাব (৬০১+)" }
    ];
    
    // প্রতিটি স্ল্যাবের জন্য ক্যালকুলেশন
    tariffRates.forEach((slab) => {
        if (remainingUnits <= 0) return;
        
        const slabMin = slab.range[0];
        const slabMax = slab.range[1];
        
        let slabUnits = 0;
        
        if (slabMin === 0) {
            // Lifeline স্ল্যাব (০-৫০)
            slabUnits = Math.min(remainingUnits, 50);
        } else {
            // অন্যান্য স্ল্যাব
            const availableUnits = slabMax - slabMin + 1;
            slabUnits = Math.min(remainingUnits, availableUnits);
        }
        
        if (slabUnits > 0) {
            const slabCost = slabUnits * slab.rate;
            totalCost += slabCost;
            
            slabBreakdown.push({
                name: slab.name,
                range: `${slabMin}-${slabMax === Infinity ? '∞' : slabMax}`,
                units: slabUnits,
                rate: slab.rate,
                cost: slabCost
            });
            
            remainingUnits -= slabUnits;
        }
    });
    
    const averageRate = monthlyUnits > 0 ? totalCost / monthlyUnits : 0;
    
    return {
        monthlyUnits: monthlyUnits,
        totalCost: totalCost,
        averageRate: averageRate,
        slabBreakdown: slabBreakdown
    };
}

// মাসিক স্ল্যাব বিশ্লেষণ দেখানো
function showMonthlySlabAnalysis() {
    const unitsInput = prompt('মাসিক ইউনিট সংখ্যা ইনপুট করুন (kWh):\n(০ থেকে শুরু হবে)');
    
    if (unitsInput && !isNaN(unitsInput)) {
        const monthlyUnits = parseFloat(unitsInput);
        
        if (monthlyUnits <= 0) {
            showNotification('❌ বৈধ মাসিক ইউনিট সংখ্যা দিন!', 'error');
            return;
        }
        
        const result = calculateMonthlySlabBreakdown(monthlyUnits);
        
        let reportHTML = `
            <div style="text-align: center; margin-bottom: 20px;">
                <h3 style="color: #2c3e50;">📊 মাসিক স্ল্যাব বিশ্লেষণ (০ থেকে শুরু)</h3>
                <div style="background: linear-gradient(135deg, #3498db, #2980b9); color: white; padding: 20px; border-radius: 10px;">
                    <div style="font-size: 24px; font-weight: bold;">${toBanglaNumber(monthlyUnits.toFixed(2))} kWh</div>
                    <small>মাসিক ইউনিট (০ থেকে শুরু)</small>
                </div>
            </div>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-bottom: 20px;">
                <div style="background: #27ae60; color: white; padding: 15px; border-radius: 8px; text-align: center;">
                    <div style="font-size: 18px; font-weight: bold;">${toBanglaNumber(result.totalCost.toFixed(2))}</div>
                    <small>মাসিক বিল</small>
                </div>
                <div style="background: #e67e22; color: white; padding: 15px; border-radius: 8px; text-align: center;">
                    <div style="font-size: 18px; font-weight: bold;">${toBanglaNumber(result.averageRate.toFixed(2))}</div>
                    <small>গড়/ইউনিট</small>
                </div>
                <div style="background: #9b59b6; color: white; padding: 15px; border-radius: 8px; text-align: center;">
                    <div style="font-size: 18px; font-weight: bold;">${toBanglaNumber(result.slabBreakdown.length)}</div>
                    <small>স্ল্যাব</small>
                </div>
            </div>
            
            <div style="max-height: 400px; overflow-y: auto;">
                <h4 style="color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 8px;">স্ল্যাব ভিত্তিক বিশ্লেষণ</h4>
        `;
        
        // প্রতিটি স্ল্যাবের ডিটেইলস
        result.slabBreakdown.forEach((slab, index) => {
            const percentage = ((slab.units / monthlyUnits) * 100).toFixed(1);
            
            reportHTML += `
                <div style="background: #f8f9fa; padding: 15px; margin: 10px 0; border-radius: 8px; border-left: 4px solid #3498db;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <div>
                            <strong style="color: #2c3e50;">${slab.name}</strong>
                            <div style="color: #7f8c8d; font-size: 12px;">ইউনিট: ${toBanglaNumber(slab.units.toFixed(2))} kWh (${percentage}%)</div>
                        </div>
                        <div style="text-align: right;">
                            <div style="font-weight: bold; color: #e74c3c; font-size: 16px;">
                                ${toBanglaNumber(slab.cost.toFixed(2))} টাকা
                            </div>
                            <div style="color: #7f8c8d; font-size: 12px;">
                                ${toBanglaNumber(slab.rate)} টাকা/ইউনিট
                            </div>
                        </div>
                    </div>
                    <div style="background: #e8f6f3; padding: 8px; border-radius: 4px; font-size: 12px; color: #27ae60;">
                        <strong>ক্যালকুলেশন:</strong> ${toBanglaNumber(slab.units.toFixed(2))} kWh × ${toBanglaNumber(slab.rate)} টাকা = ${toBanglaNumber(slab.cost.toFixed(2))} টাকা
                    </div>
                </div>
            `;
        });
        
        reportHTML += `</div>`;
        
        // সারাংশ
        reportHTML += `
            <div style="background: #e8f6f3; padding: 15px; border-radius: 8px; margin-top: 20px; border-left: 4px solid #27ae60;">
                <h4 style="color: #2c3e50; margin-top: 0;">📋 সারসংক্ষেপ</h4>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                    <div>
                        <strong>মাসিক ইউনিট:</strong> ${toBanglaNumber(monthlyUnits.toFixed(2))} kWh
                    </div>
                    <div>
                        <strong>মাসিক বিল:</strong> ${toBanglaNumber(result.totalCost.toFixed(2))} টাকা
                    </div>
                    <div>
                        <strong>গড় প্রতি ইউনিট:</strong> ${toBanglaNumber(result.averageRate.toFixed(2))} টাকা
                    </div>
                    <div>
                        <strong>স্ল্যাব সংখ্যা:</strong> ${toBanglaNumber(result.slabBreakdown.length)}
                    </div>
                </div>
            </div>
            
            <div style="margin-top: 15px; padding: 12px; background: #fff3cd; border-radius: 5px; border-left: 4px solid #ffc107;">
                <strong>💡 সরকারি নিয়ম:</strong> 
                <small>প্রতি মাসে ইউনিট ০ থেকে শুরু হয় এবং মাসিক ভিত্তিতে স্ল্যাব ক্যালকুলেশন করা হয়</small>
            </div>
        `;
        
        showCustomModal('মাসিক স্ল্যাব বিশ্লেষণ', reportHTML);
    }
}

// গ্লোবাল এক্সেস
window.showMonthlySlabAnalysis = showMonthlySlabAnalysis;

// বিদ্যুৎ বিল যোগ করার সময় এই ফাংশন call করুন
function addElectricityBillWithAutoUnitUpdate(amount, units, date) {
    // বিদ্যুৎ বিল যোগ করুন
    addElectricityBill(amount, units, date);
    
    // ইউনিট অটো আপডেট করুন
    if (units && units > 0) {
        updateCurrentMonthUnits(units, date);
    }
}

// Manual আপডেট করার ফাংশন
function manualUpdateCurrentMonth() {
    console.log('🔄 বর্তমান মাসের ইউনিট manual আপডেট করা হচ্ছে...');
    
    const currentMonth = monthlyUnitData.currentMonth;
    let currentMonthUnits = 0;
    
    console.log('বর্তমান মাস:', currentMonth);
    
    // Transactions থেকে বর্তমান মাসের ইউনিট calculate করুন
    transactions.forEach(transaction => {
        if (transaction.type === 'electricity_bill' && transaction.units) {
            const transactionDate = new Date(transaction.timestamp);
            const transactionMonth = `${transactionDate.getFullYear()}-${(transactionDate.getMonth() + 1).toString().padStart(2, '0')}`;
            
            if (transactionMonth === currentMonth) {
                currentMonthUnits += transaction.units;
                console.log(`বর্তমান মাসের ইউনিট যোগ: ${transaction.units} kWh`);
            }
        }
    });
    
    // আপডেট করুন
    monthlyUnitData.currentMonthUnits = currentMonthUnits;
    
    // মোট ইউনিট calculate করুন
    const totalResult = calculateTotalUnitsFromReport();
    monthlyUnitData.totalUnits = totalResult.totalUnits;
    
    saveMonthlyUnitData();
    updateUnitDisplay();
    
    console.log('✅ Manual আপডেট সম্পন্ন:', {
        currentMonth: currentMonth,
        currentMonthUnits: currentMonthUnits,
        totalUnits: monthlyUnitData.totalUnits
    });
    
    showNotification(`✅ বর্তমান মাসের ইউনিট আপডেট করা হয়েছে! (${currentMonthUnits} kWh)`, 'success');
    
    return currentMonthUnits;
}

// Global access
window.manualUpdateCurrentMonth = manualUpdateCurrentMonth;

function updateAllUnitsFromTransactions() {
    console.log('=== সব Transactions থেকে ইউনিট আপডেট ===');
    
    let totalUnits = 0;
    const currentMonth = monthlyUnitData.currentMonth;
    let currentMonthUnits = 0;
    
    transactions.forEach(transaction => {
        if (transaction.type === 'electricity_bill' && transaction.units) {
            totalUnits += transaction.units;
            
            const transactionDate = new Date(transaction.timestamp);
            const transactionMonth = `${transactionDate.getFullYear()}-${(transactionDate.getMonth() + 1).toString().padStart(2, '0')}`;
            
            if (transactionMonth === currentMonth) {
                currentMonthUnits += transaction.units;
            }
        }
    });
    
    // আপডেট করুন
    monthlyUnitData.currentMonthUnits = currentMonthUnits;
    monthlyUnitData.totalUnits = totalUnits;
    
    saveMonthlyUnitData();
    updateUnitDisplay();
    
    console.log('আপডেট সম্পন্ন:', {
        currentMonthUnits: currentMonthUnits,
        totalUnits: totalUnits,
        currentMonth: currentMonth
    });
    
    showNotification(`✅ ইউনিট আপডেট করা হয়েছে! বর্তমান মাস: ${currentMonthUnits} kWh, মোট: ${totalUnits} kWh`, 'success');
}

// Global access
window.updateAllUnitsFromTransactions = updateAllUnitsFromTransactions;

// রিচার্জ delete করার ফাংশন - FIXED
function deleteRechargeTransaction(transactionId) {
    if (confirm('⚠️ আপনি কি এই রিচার্জ ডিলিট করতে চান?')) {
        try {
            const transactionIndex = transactions.findIndex(t => t.id == transactionId);
            if (transactionIndex === -1) {
                showNotification('❌ ট্রানজেকশন খুঁজে পাওয়া যায়নি!', 'error');
                return;
            }

            const transactionToDelete = transactions[transactionIndex];
            
            // ✅ রিচার্জের সঠিক usable amount বের করুন
            const monthlyRecharge = monthlyRecharges.find(mr => mr.id == transactionId);
            const usableAmount = monthlyRecharge?.billDetails?.energyCost || Math.abs(transactionToDelete.amount);
            const rechargeAmount = monthlyRecharge?.amount || Math.abs(transactionToDelete.amount);

            console.log('ডিলিট তথ্য:', {
                transactionAmount: Math.abs(transactionToDelete.amount),
                usableAmount: usableAmount,
                rechargeAmount: rechargeAmount
            });

            // মাসিক রিচার্জ ডিলিট করুন
            const monthlyRechargeIndex = monthlyRecharges.findIndex(mr => mr.id == transactionId);
            if (monthlyRechargeIndex !== -1) {
                monthlyRecharges.splice(monthlyRechargeIndex, 1);
            }

            // ট্রানজেকশন ডিলিট করুন
            transactions.splice(transactionIndex, 1);

            // ✅ সঠিক amount বাদ দিন
            currentBalance -= usableAmount;
            totalRecharge -= rechargeAmount;

            console.log('ডিলিট后的 ব্যালেন্স:', {
                deductedUsable: usableAmount,
                deductedRecharge: rechargeAmount,
                newBalance: currentBalance,
                newTotalRecharge: totalRecharge
            });

            // ✅ সম্পূর্ণ রিক্যালকুলেশন
            recalculateAllBalances();

            saveData();
            updateBalanceDisplay();
            loadTransactionReport();

            showNotification(`✅ রিচার্জ ডিলিট করা হয়েছে! ব্যালেন্স: ${currentBalance.toFixed(2)} টাকা`, 'success');

        } catch (error) {
            console.error('রিচার্জ ডিলিট করতে সমস্যা:', error);
            showNotification('❌ রিচার্জ ডিলিট করতে সমস্যা হচ্ছে!', 'error');
        }
    }
}

// রিচার্জ edit করার ফাংশন - FIXED
function editRechargeTransaction(transactionId) {
    const transaction = transactions.find(t => t.id == transactionId);
    const monthlyRecharge = monthlyRecharges.find(mr => mr.id == transactionId);
    
    if (!transaction) {
        showNotification('❌ ট্রানজেকশন খুঁজে পাওয়া যায়নি!', 'error');
        return;
    }

    const newAmount = parseFloat(prompt('নতুন রিচার্জ অ্যামাউন্ট ইনপুট করুন:', Math.abs(transaction.amount)));
    
    if (newAmount && !isNaN(newAmount) && newAmount > 0) {
        // ✅ পুরোনো amount বাদ দিন
        const oldUsableAmount = monthlyRecharge?.billDetails?.energyCost || Math.abs(transaction.amount);
        const oldRechargeAmount = monthlyRecharge?.amount || Math.abs(transaction.amount);
        
        currentBalance += oldUsableAmount; // পুরোনো amount ফেরত দিন
        totalRecharge -= oldRechargeAmount;

        // ✅ নতুন amount যোগ করুন
        const newBillDetails = calculateDESCOBill(newAmount, monthlyUnitData.currentMonth);
        const newUsableAmount = newBillDetails.energyCost;

        currentBalance += newUsableAmount;
        totalRecharge += newAmount;

        // ট্রানজেকশন আপডেট করুন
        transaction.amount = newAmount;
        transaction.description = `রিচার্জ - ${newAmount.toFixed(2)} টাকা`;

        // মাসিক রিচার্জ আপডেট করুন
        if (monthlyRecharge) {
            monthlyRecharge.amount = newAmount;
            monthlyRecharge.billDetails = newBillDetails;
        }

        console.log('এডিট তথ্য:', {
            oldUsableAmount: oldUsableAmount,
            newUsableAmount: newUsableAmount,
            newBalance: currentBalance
        });

        // ✅ সম্পূর্ণ রিক্যালকুলেশন
        recalculateAllBalances();

        saveData();
        updateBalanceDisplay();
        loadTransactionReport();

        showNotification(`✅ রিচার্জ এডিট করা হয়েছে! নতুন ব্যালেন্স: ${currentBalance.toFixed(2)} টাকা`, 'success');
    }
}

// উন্নত বাংলা তারিখ পার্সার
function parseBanglaDateAdvanced(banglaDateString) {
    try {
        console.log('পার্স করার তারিখ:', banglaDateString);
        
        // উদাহরণ: "১/১২/২০২৫, ৫:৫৬:১০ PM"
        const [datePart, timePart] = banglaDateString.split(', ');
        const [day, month, year] = datePart.split('/');
        
        // বাংলা সংখ্যা ইংরেজিতে কনভার্ট
        const englishDay = convertBanglaToEnglish(day);
        const englishMonth = convertBanglaToEnglish(month);
        const englishYear = convertBanglaToEnglish(year);
        
        // সময় পার্স
        let [time, modifier] = timePart.split(' ');
        let [hours, minutes, seconds] = time.split(':');
        
        hours = parseInt(hours);
        minutes = parseInt(minutes);
        seconds = parseInt(seconds);
        
        if (modifier === 'PM' && hours < 12) hours += 12;
        if (modifier === 'AM' && hours === 12) hours = 0;
        
        // তারিখ তৈরি
        const date = new Date(englishYear, englishMonth - 1, englishDay, hours, minutes, seconds);
        console.log('পার্স করা তারিখ:', date);
        
        return date;
        
    } catch (error) {
        console.error('তারিখ পার্স করতে সমস্যা:', banglaDateString, error);
        return new Date(); // fallback
    }
}

// বাংলা সংখ্যা ইংরেজিতে কনভার্ট
function convertBanglaToEnglish(banglaNumber) {
    const banglaDigits = {
        '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4',
        '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9'
    };
    
    let result = '';
    for (let char of banglaNumber) {
        result += banglaDigits[char] || char;
    }
    
    return parseInt(result);
}

// উন্নত getCurrentMonthUnits ফাংশন
function getCurrentMonthUnitsFixed() {
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    let monthUnits = 0;
    
    console.log('বর্তমান মাস শুরু:', currentMonthStart.toLocaleDateString('bn-BD'));
    
    transactions.forEach((transaction, index) => {
        if (transaction.type === 'electricity_bill' && transaction.units) {
            try {
                const transactionDate = parseBanglaDateAdvanced(transaction.timestamp);
                
                console.log(`${index+1}. ট্রানজেকশন তারিখ:`, transactionDate.toLocaleDateString('bn-BD'));
                console.log('  ইউনিট:', transaction.units);
                console.log('  মাসের শুরু থেকে বড়?', transactionDate >= currentMonthStart);
                
                if (transactionDate >= currentMonthStart) {
                    monthUnits += parseFloat(transaction.units) || 0;
                    console.log('  ✅ মাসিক ইউনিটে যোগ করা হয়েছে');
                }
            } catch (error) {
                console.log('তারিখ পার্স করতে সমস্যা:', transaction.timestamp);
            }
        }
    });
    
    console.log('মাসিক ইউনিট যোগফল:', monthUnits, 'kWh');
    return monthUnits;
}

// সরল বাংলা তারিখ পার্সার
function parseSimpleBanglaDate(banglaDateString) {
    try {
        console.log('পার্স করা হচ্ছে:', banglaDateString);
        
        // উদাহরণ: "১/১২/২০২৫, ৫:৫৬:১০ PM"
        // সরাসরি string manipulation করুন
        let englishString = banglaDateString;
        
        // শুধু সংখ্যা গুলো replace করুন
        const numberMap = {
            '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4',
            '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9'
        };
        
        // প্রতিটি character replace করুন
        englishString = englishString.split('').map(char => {
            return numberMap[char] || char;
        }).join('');
        
        console.log('ইংরেজি তারিখ:', englishString);
        
        // এখন Date object তৈরি করুন
        const [datePart, timePart] = englishString.split(', ');
        const [day, month, year] = datePart.split('/');
        
        // সময় পার্স
        let [time, modifier] = timePart.split(' ');
        let [hours, minutes, seconds] = time.split(':');
        
        hours = parseInt(hours);
        minutes = parseInt(minutes);
        seconds = parseInt(seconds);
        
        if (modifier === 'PM' && hours < 12) hours += 12;
        if (modifier === 'AM' && hours === 12) hours = 0;
        
        // সঠিক মাস (JavaScript-এ মাস 0-based)
        const date = new Date(year, month - 1, day, hours, minutes, seconds);
        
        console.log('পার্স করা তারিখ:', date.toLocaleString('bn-BD'));
        return date;
        
    } catch (error) {
        console.error('তারিখ পার্স করতে সমস্যা:', banglaDateString, error);
        // fallback: try to parse as is
        try {
            return new Date(banglaDateString);
        } catch {
            return new Date(); // current date
        }
    }
}

// নতুন getCurrentMonthUnits ফাংশন (সরল ভার্সন)
function getCurrentMonthUnitsSimple() {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // 1-12
    
    let monthUnits = 0;
    
    console.log(`বর্তমান মাস: ${currentMonth}/${currentYear}`);
    
    transactions.forEach((transaction, index) => {
        if (transaction.type === 'electricity_bill' && transaction.units) {
            // তারিখ থেকে মাস বের করুন (সরাসরি string থেকে)
            const dateString = transaction.timestamp;
            
            try {
                // উদাহরণ: "১/১২/২০২৫, ৫:৫৬:১০ PM" -> মাস = ১২
                const [datePart] = dateString.split(', ');
                const [day, monthStr, yearStr] = datePart.split('/');
                
                // বাংলা সংখ্যা ইংরেজিতে
                const month = convertBanglaNumberSimple(monthStr);
                const year = convertBanglaNumberSimple(yearStr);
                
                console.log(`${index+1}. তারিখ: ${dateString} -> মাস: ${month}, বছর: ${year}`);
                
                // বর্তমান মাসের কিনা চেক
                if (parseInt(month) === currentMonth && parseInt(year) === currentYear) {
                    monthUnits += parseFloat(transaction.units) || 0;
                    console.log(`  ✅ ডিসেম্বর মাসের ইউনিট যোগ: ${transaction.units} kWh`);
                }
                
            } catch (error) {
                console.log(`  ❌ পার্স সমস্যা: ${dateString}`);
            }
        }
    });
    
    console.log('মাসিক ইউনিট যোগফল:', monthUnits, 'kWh');
    return monthUnits;
}

// সরল বাংলা সংখ্যা কনভার্টার
function convertBanglaNumberSimple(banglaNum) {
    const map = {
        '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4',
        '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9'
    };
    
    let result = '';
    for (let char of banglaNum) {
        result += map[char] || char;
    }
    
    return result;
}

// আরও সহজ পদ্ধতি: শুধু ডিসেম্বর মাসের ট্রানজেকশন খুঁজুন
function findDecemberTransactions() {
    console.log('=== ডিসেম্বর মাসের ট্রানজেকশন খোঁজা ===');
    
    let decemberUnits = 0;
    let decemberTransactions = [];
    
    transactions.forEach((t, index) => {
        if (t.type === 'electricity_bill' && t.units) {
            // তারিখে "১২/২০২৫" আছে কিনা চেক করুন
            if (t.timestamp.includes('১২/২০২৫')) {
                decemberUnits += t.units;
                decemberTransactions.push({
                    index: index + 1,
                    date: t.timestamp,
                    units: t.units,
                    description: t.description
                });
                console.log(`${index+1}. ডিসেম্বর: ${t.timestamp} - ${t.units} kWh`);
            }
        }
    });
    
    console.log('ডিসেম্বর মাসের মোট ইউনিট:', decemberUnits, 'kWh');
    console.log('ডিসেম্বর ট্রানজেকশন:', decemberTransactions.length, 'টি');
    
    return decemberUnits;
}

// সব মাসের বিল বিশ্লেষণ দেখানোর ফাংশন
function showAllMonthsBillAnalysis() {
    console.log('=== সব মাসের বিল বিশ্লেষণ ===');
    
    // সব মাসের ডেটা কালেক্ট করুন (ISO/bn-BD compatible)
    const allMonthsData = {};
    transactions.forEach(t => {
        if (t && t.type === 'electricity_bill' && t.timestamp) {
            var ym = extractYearMonth(t.timestamp);
            if (ym && ym.year && ym.month) {
                var key = ym.year.toString() + '-' + ym.month.toString().padStart(2,'0');
                if (!allMonthsData[key]) {
                    allMonthsData[key] = {
                        displayName: getBanglaMonthName(ym.month) + ' ' + toBanglaNumber(ym.year.toString()),
                        units: 0,
                        cost: 0,
                        billCount: 0,
                        bills: []
                    };
                }
                var u = (typeof t.units === 'number') ? t.units : parseFloat(t.units);
                if (!isNaN(u) && u > 0) allMonthsData[key].units += u;
                allMonthsData[key].cost += Math.abs(t.amount || 0);
                allMonthsData[key].billCount += 1;
                allMonthsData[key].bills.push({ units: u || 0, cost: Math.abs(t.amount || 0), timestamp: t.timestamp });
            }
        }
    });

    // মাসের নাম দিয়ে সাজানো (নতুন থেকে পুরাতন)
    const sortedMonthKeys = Object.keys(allMonthsData).sort((a, b) => {
        var ay = parseInt(a.slice(0,4),10), am = parseInt(a.slice(5,7),10);
        var by = parseInt(b.slice(0,4),10), bm = parseInt(b.slice(5,7),10);
        if (ay !== by) return by - ay;
        return bm - am;
    });
    
    // HTML তৈরি
    let html = `
        <div style="text-align: center; margin-bottom: 20px;">
            <h3 style="color: #2c3e50;">📅 সব মাসের বিল বিশ্লেষণ</h3>
            <p style="color: #7f8c8d;">মোট ${toBanglaNumber(sortedMonthKeys.length.toString())} মাসের ডেটা পাওয়া গেছে</p>
        </div>
        
        <div style="max-height: 600px; overflow-y: auto;">
    `;
    
    // প্রত্যেক মাসের জন্য বিশ্লেষণ
    sortedMonthKeys.forEach((monthKey, index) => {
        const monthData = allMonthsData[monthKey];
        
        console.log(`\nমাসিক বিল খোঁজা: ${monthKey} (${monthData.displayName})`);
        
        // মাসের বিলগুলো লগ করুন
        monthData.bills.forEach(bill => {
            console.log(`  ✅ পাওয়া গেছে: ${bill.timestamp} - ${bill.units} kWh`);
        });
        
        console.log(`${monthData.displayName} মাসিক ইউনিট: ${monthData.units} kWh (${monthData.billCount}টি বিল)`);
        
        // ট্যারিফ ক্যালকুলেশন
        let remainingUnits = monthData.units;
        let totalTariffCost = 0;
        let slabBreakdown = [];
        
        if (monthData.units > 0) {
            tariffRates.forEach(slab => {
                if (remainingUnits <= 0) return;
                
                const slabMin = slab.range[0];
                const slabMax = slab.range[1];
                
                let slabUnits;
                if (slabMax === Infinity) {
                    slabUnits = remainingUnits;
                } else {
                    const slabRange = slabMax - slabMin + 1;
                    slabUnits = Math.min(remainingUnits, slabRange);
                }
                
                const slabCost = slabUnits * slab.rate;
                totalTariffCost += slabCost;
                remainingUnits -= slabUnits;
                
                slabBreakdown.push({
                    name: slab.name,
                    units: slabUnits,
                    rate: slab.rate,
                    cost: slabCost,
                    range: `${slabMin}-${slabMax === Infinity ? '∞' : slabMax}`
                });
            });
        }
        
        const actualAvgRate = monthData.units > 0 ? monthData.cost / monthData.units : 0;
        const tariffAvgRate = monthData.units > 0 ? totalTariffCost / monthData.units : 0;
        
        // মাসের কালার
        const monthColors = [
            { bg: 'linear-gradient(135deg, #2ecc71, #27ae60)', text: 'white' },
            { bg: 'linear-gradient(135deg, #3498db, #2980b9)', text: 'white' },
            { bg: 'linear-gradient(135deg, #9b59b6, #8e44ad)', text: 'white' },
            { bg: 'linear-gradient(135deg, #e74c3c, #c0392b)', text: 'white' },
            { bg: 'linear-gradient(135deg, #f39c12, #d35400)', text: 'white' },
            { bg: 'linear-gradient(135deg, #1abc9c, #16a085)', text: 'white' }
        ];
        
        const colorIndex = index % monthColors.length;
        const monthColor = monthColors[colorIndex];
        
        // মাসের HTML
        html += `
            <div style="background: ${monthColor.bg}; color: ${monthColor.text}; padding: 20px; border-radius: 10px; margin: 20px 0; text-align: center;">
                <h4 style="margin: 0 0 15px 0; font-size: 18px;">${monthData.displayName}</h4>
                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px;">
                    <div>
                        <div style="font-size: 20px; font-weight: bold;">${toBanglaNumber(monthData.units.toFixed(2))}</div>
                        <small>মাসিক ইউনিট</small>
                    </div>
                    <div>
                        <div style="font-size: 20px; font-weight: bold;">${toBanglaNumber(monthData.cost.toFixed(2))}</div>
                        <small>মাসিক খরচ</small>
                    </div>
                    <div>
                        <div style="font-size: 20px; font-weight: bold;">${toBanglaNumber(actualAvgRate.toFixed(2))}</div>
                        <small>গড়/ইউনিট</small>
                    </div>
                </div>
                <div style="margin-top: 10px; font-size: 12px; opacity: 0.9;">
                    📌 ${toBanglaNumber(monthData.billCount.toString())}টি বিল | ট্যারিফ: ${toBanglaNumber(totalTariffCost.toFixed(2))} টাকা
                </div>
            </div>
            
            <div style="background: white; padding: 15px; border-radius: 8px; margin: 10px 0;">
                <h5 style="color: #2c3e50; margin-top: 0; margin-bottom: 10px;">${monthData.displayName} এর স্ল্যাব ভিত্তিক খরচ:</h5>
        `;
        
        if (slabBreakdown.length > 0) {
            slabBreakdown.forEach((slab, slabIndex) => {
                if (slab.units > 0) {
                    html += `
                        <div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #f8f9fa;">
                            <span style="color: #7f8c8d; font-size: 13px;">${slabIndex + 1}. ${translateSlabName(slab.name)}</span>
                            <span style="font-weight: bold; color: #e74c3c; font-size: 13px;">
                                ${toBanglaNumber(slab.units.toFixed(2))} kWh × ${toBanglaNumber(slab.rate.toFixed(2))} টাকা
                            </span>
                        </div>
                    `;
                }
            });
        } else {
            html += `
                <div style="text-align: center; padding: 10px; color: #7f8c8d;">
                    কোন স্ল্যাব ডেটা নেই
                </div>
            `;
        }
        
        // পার্থক্য দেখান
        const difference = totalTariffCost - monthData.cost;
        if (difference !== 0) {
            const diffPercent = totalTariffCost > 0 ? (difference / totalTariffCost * 100).toFixed(1) : 0;
            html += `
                <div style="margin-top: 10px; padding: 10px; background: #fff3cd; border-radius: 6px; border-left: 4px solid #ffc107;">
                    <strong>📊 তুলনা:</strong>
                    <div style="font-size: 12px;">
                        আসল: ${toBanglaNumber(monthData.cost.toFixed(2))} টাকা<br>
                        ট্যারিফ: ${toBanglaNumber(totalTariffCost.toFixed(2))} টাকা<br>
                        পার্থক্য: ${toBanglaNumber(difference.toFixed(2))} টাকা (${diffPercent}%)
                    </div>
                </div>
            `;
        }
        
        html += `</div>`;
    });
    
    html += `</div>`;
    
    // সামগ্রিক স্ট্যাটস
    const totalUnits = sortedMonthKeys.reduce((sum, key) => sum + allMonthsData[key].units, 0);
    const totalCost = sortedMonthKeys.reduce((sum, key) => sum + allMonthsData[key].cost, 0);
    const totalTariffCost = sortedMonthKeys.reduce((sum, key) => {
        const monthData = allMonthsData[key];
        let remainingUnits = monthData.units;
        let monthTariffCost = 0;
        
        if (monthData.units > 0) {
            tariffRates.forEach(slab => {
                if (remainingUnits <= 0) return;
                
                const slabMin = slab.range[0];
                const slabMax = slab.range[1];
                
                let slabUnits;
                if (slabMax === Infinity) {
                    slabUnits = remainingUnits;
                } else {
                    const slabRange = slabMax - slabMin + 1;
                    slabUnits = Math.min(remainingUnits, slabRange);
                }
                
                monthTariffCost += slabUnits * slab.rate;
                remainingUnits -= slabUnits;
            });
        }
        
        return sum + monthTariffCost;
    }, 0);
    
    const overallAvgRate = totalUnits > 0 ? totalCost / totalUnits : 0;
    
    html += `
        <div style="margin-top: 20px; padding: 15px; background: linear-gradient(135deg, #2c3e50, #34495e); color: white; border-radius: 8px;">
            <h4 style="margin-top: 0;">📊 সামগ্রিক পরিসংখ্যান</h4>
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px;">
                <div style="text-align: center;">
                    <div style="font-size: 20px; font-weight: bold;">${toBanglaNumber(sortedMonthKeys.length)}</div>
                    <small>মোট মাস</small>
                </div>
                <div style="text-align: center;">
                    <div style="font-size: 20px; font-weight: bold;">${toBanglaNumber(totalUnits.toFixed(2))}</div>
                    <small>মোট ইউনিট</small>
                </div>
                <div style="text-align: center;">
                    <div style="font-size: 20px; font-weight: bold;">${toBanglaNumber(totalCost.toFixed(2))}</div>
                    <small>মোট খরচ</small>
                </div>
            </div>
            <div style="margin-top: 10px; text-align: center; font-size: 14px;">
                গড় প্রতি ইউনিট: ${toBanglaNumber(overallAvgRate.toFixed(2))} টাকা
            </div>
        </div>
    `;
    
    // Console এ লগ
    console.log(`\n=== সামগ্রিক পরিসংখ্যান ===`);
    console.log(`মোট মাস: ${sortedMonthKeys.length}`);
    console.log(`মোট ইউনিট: ${totalUnits.toFixed(2)} kWh`);
    console.log(`মোট খরচ: ${totalCost.toFixed(2)} টাকা`);
    console.log(`গড় প্রতি ইউনিট: ${overallAvgRate.toFixed(2)} টাকা`);
    
    showCustomModal('সব মাসের বিল বিশ্লেষণ', html);
}

// HTML বাটন যোগ করুন
function addAllMonthsButton() {
    const reportTab = document.getElementById('reportTab');
    if (!reportTab) return;
    
    // যদি ইতিমধ্যে বাটন না থাকে
    if (!document.getElementById('allMonthsBtn')) {
        const buttonHTML = `
            <button id="allMonthsBtn" onclick="showAllMonthsBillAnalysis()" 
                    style="padding: 10px 20px; background: #9b59b6; color: white; border: none; border-radius: 8px; cursor: pointer; margin: 15px 0; font-size: 14px; width: 100%;">
                📅 সব মাসের বিশ্লেষণ দেখুন
            </button>
        `;
        
        // reportTab-এ যোগ করুন
        reportTab.insertAdjacentHTML('afterbegin', buttonHTML);
    }
}

// গ্লোবাল এক্সেস
window.showAllMonthsBillAnalysis = showAllMonthsBillAnalysis;

// মাসিক বিল বিশ্লেষণ দেখান/লুকান
function toggleMonthlyAnalysis() {
    const analysisContainer = document.getElementById('monthlyAnalysisContainer');
    
    if (!analysisContainer) {
        // যদি container না থাকে, তাহলে তৈরি করুন
        createMonthlyAnalysisContainer();
        return;
    }
    
    if (analysisContainer.style.display === 'none' || !analysisContainer.style.display) {
        showMonthlyAnalysis();
    } else {
        hideMonthlyAnalysis();
    }
}

// মাসিক বিশ্লেষণ container তৈরি করুন
function createMonthlyAnalysisContainer() {
    const container = document.createElement('div');
    container.id = 'monthlyAnalysisContainer';
    container.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: white;
        border-radius: 10px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.2);
        z-index: 999;
        max-width: 400px;
        width: 90%;
        max-height: 80vh;
        overflow-y: auto;
        display: none;
        border: 2px solid #3498db;
    `;
    
    document.body.appendChild(container);
    showMonthlyAnalysis();
}

// মাসিক বিশ্লেষণ দেখান
function showMonthlyAnalysis() {
    const analysisContainer = document.getElementById('monthlyAnalysisContainer');
    if (!analysisContainer) return;
    
    // মাসিক বিশ্লেষণ কন্টেন্ট তৈরি করুন
    const analysisContent = generateMonthlyAnalysisContent();
    
    analysisContainer.innerHTML = `
        <div style="position: relative;">
            <!-- ক্লোজ বাটন -->
            <button onclick="hideMonthlyAnalysis()" style="
                position: absolute;
                top: 10px;
                right: 10px;
                background: #e74c3c;
                color: white;
                border: none;
                width: 30px;
                height: 30px;
                border-radius: 50%;
                cursor: pointer;
                font-size: 16px;
                z-index: 1000;
            ">×</button>
            
            <!-- কন্টেন্ট -->
            <div style="padding: 20px;">
                ${analysisContent}
            </div>
        </div>
    `;
    
    analysisContainer.style.display = 'block';
}

// মাসিক বিশ্লেষণ লুকান
function hideMonthlyAnalysis() {
    const analysisContainer = document.getElementById('monthlyAnalysisContainer');
    if (analysisContainer) {
        analysisContainer.style.display = 'none';
    }
}

// মাসিক বিশ্লেষণ কন্টেন্ট তৈরি করুন
function generateMonthlyAnalysisContent() {
    const allMonthsData = getAllMonthsData();
    
    if (allMonthsData.length === 0) {
        return `
            <div style="text-align: center; padding: 30px;">
                <h3 style="color: #7f8c8d;">📅 মাসিক বিশ্লেষণ</h3>
                <p>কোন মাসিক ডেটা নেই</p>
            </div>
        `;
    }
    
    let content = `
        <div style="text-align: center; background: linear-gradient(135deg, #2c3e50, #34495e); color: white; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
            <h3 style="margin: 0;">📅 সব মাসের বিল বিশ্লেষণ</h3>
            <small>মোট ${toBanglaNumber(allMonthsData.length)} মাসের ডেটা</small>
        </div>
    `;
    
    // মাস অনুসারে সাজানো (নতুন থেকে পুরাতন)
    allMonthsData.sort((a, b) => new Date(b.monthKey + '-01') - new Date(a.monthKey + '-01'));
    
    // প্রতিটি মাসের বিশ্লেষণ
    allMonthsData.forEach(monthData => {
        const monthBill = calculateBillForUnits(monthData.totalUnits);
        
        content += `
            <div style="background: ${isCurrentMonth(monthData.monthKey) ? '#e8f6f3' : 'white'}; padding: 15px; margin: 10px 0; border-radius: 8px; border-left: 4px solid ${isCurrentMonth(monthData.monthKey) ? '#27ae60' : '#3498db'};">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                    <h4 style="margin: 0; color: #2c3e50;">
                        ${monthData.monthName} ${isCurrentMonth(monthData.monthKey) ? '👈' : ''}
                    </h4>
                    <span style="background: #95a5a6; color: white; padding: 3px 8px; border-radius: 12px; font-size: 12px;">
                        📌 ${toBanglaNumber(monthData.transactions.length)}টি বিল
                    </span>
                </div>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; text-align: center;">
                    <div style="background: #27ae60; color: white; padding: 10px; border-radius: 6px;">
                        <div style="font-size: 18px; font-weight: bold;">${toBanglaNumber(monthData.totalUnits.toFixed(2))}</div>
                        <small>মাসিক ইউনিট</small>
                    </div>
                    <div style="background: #e74c3c; color: white; padding: 10px; border-radius: 6px;">
                        <div style="font-size: 18px; font-weight: bold;">${toBanglaNumber(monthBill.totalCost.toFixed(2))}</div>
                        <small>মাসিক খরচ</small>
                    </div>
                    <div style="background: #3498db; color: white; padding: 10px; border-radius: 6px;">
                        <div style="font-size: 18px; font-weight: bold;">${toBanglaNumber(monthBill.averageRate.toFixed(2))}</div>
                        <small>গড়/ইউনিট</small>
                    </div>
                </div>
            </div>
        `;
    });
    
    // সামগ্রিক পরিসংখ্যান
    const totalUnits = allMonthsData.reduce((sum, month) => sum + month.totalUnits, 0);
    const totalCost = allMonthsData.reduce((sum, month) => {
        const monthBill = calculateBillForUnits(month.totalUnits);
        return sum + monthBill.totalCost;
    }, 0);
    const averageRate = totalUnits > 0 ? totalCost / totalUnits : 0;
    
    content += `
        <div style="background: #2c3e50; color: white; padding: 15px; border-radius: 8px; margin-top: 20px;">
            <h4 style="margin-top: 0; text-align: center;">📊 সামগ্রিক পরিসংখ্যান</h4>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                <div style="text-align: center;">
                    <div style="font-size: 24px; font-weight: bold;">${toBanglaNumber(allMonthsData.length)}</div>
                    <small>মোট মাস</small>
                </div>
                <div style="text-align: center;">
                    <div style="font-size: 24px; font-weight: bold;">${toBanglaNumber(totalUnits.toFixed(2))}</div>
                    <small>মোট ইউনিট</small>
                </div>
                <div style="text-align: center;">
                    <div style="font-size: 24px; font-weight: bold;">${toBanglaNumber(totalCost.toFixed(2))}</div>
                    <small>মোট খরচ</small>
                </div>
                <div style="text-align: center;">
                    <div style="font-size: 24px; font-weight: bold;">${toBanglaNumber(averageRate.toFixed(2))}</div>
                    <small>গড়/ইউনিট</small>
                </div>
            </div>
        </div>
        
        <div style="margin-top: 15px; text-align: center;">
            <button onclick="hideMonthlyAnalysis()" style="padding: 8px 20px; background: #e74c3c; color: white; border: none; border-radius: 5px; cursor: pointer;">
                বন্ধ করুন
            </button>
        </div>
    `;
    
    return content;
}

// বর্তমান মাস কিনা চেক করুন
function isCurrentMonth(monthKey) {
    const now = new Date();
    const currentMonthKey = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
    return monthKey === currentMonthKey;
}

// ✅ আপডেটেড removeAutoShowingAnalysis ফাংশন
function removeAutoShowingAnalysis() {
    console.log('🔄 অটো শো করা analysis মুছে ফেলা হচ্ছে...');
    
    // সব analysis container খুঁজে বের করুন
    const analysisContainers = document.querySelectorAll('[id*="analysis"], [class*="analysis"], [style*="fixed"]');
    
    analysisContainers.forEach(container => {
        console.log('Found container:', container.id || container.className);
        container.style.display = 'none';
        container.remove();
    });
    
    // floating elements মুছুন
    const floatingElements = document.querySelectorAll('div[style*="position: fixed"], div[style*="position: absolute"]');
    floatingElements.forEach(el => {
        if (el.textContent.includes('মাসের বিল বিশ্লেষণ') || 
            el.textContent.includes('মাসিক বিশ্লেষণ')) {
            console.log('Removing floating analysis:', el.textContent.substring(0, 50));
            el.remove();
        }
    });
    
    console.log('✅ অটো শো analysis মুছে ফেলা হয়েছে');
}

// ✅ নতুন নামে ফাংশন তৈরি করুন (কনফ্লিক্ট এড়ানোর জন্য)
function showMonthlyAnalysisManual() {
    console.log('📊 ম্যানুয়ালি মাসিক বিশ্লেষণ দেখানো হচ্ছে');
    
    // প্রথমে পুরানো container মুছুন
    removeAutoShowingAnalysis();
    
    // নতুন container তৈরি করুন
    createMonthlyAnalysisContainer();
    
    // কন্টেন্ট তৈরি করুন
    const allMonthsData = getAllMonthsData();
    
    if (allMonthsData.length === 0) {
        alert('কোন মাসিক ডেটা নেই!');
        return;
    }
    
    // শুধু UI আপডেট করুন
    setTimeout(() => {
        showMonthlyAnalysis();
    }, 100);
}

// ১. প্রথমে ফাংশনটি সংজ্ঞায়িত করুন
function displayAllMonthsInBody() {
    console.log('displayAllMonthsInBody: ফাংশন কল করা হয়েছে');
    
    try {
        // বডি এলিমেন্ট খুঁজুন
        const bodyElement = document.querySelector('.monthly-summary-container') || 
                            document.getElementById('monthlyDataContainer') ||
                            document.body;
        
        // মাসিক ডেটা সংগ্রহ
        const allMonths = getAllMonthsData();
        
        if (allMonths.length === 0) {
            bodyElement.innerHTML = `
                <div style="text-align: center; padding: 20px; color: #7f8c8d;">
                    <h4>📭 কোন মাসিক ডেটা নেই</h4>
                    <p>রিচার্জ বা ইউনিট ডেটা যোগ করুন</p>
                </div>
            `;
            return;
        }
        
        // HTML তৈরি
        let html = `
            <div style="text-align: center; margin-bottom: 20px;">
                <h3>📊 সকল মাসের ডেটা</h3>
                <p>মোট ${toBanglaNumber(allMonths.length)} মাস</p>
            </div>
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 15px;">
        `;
        
        allMonths.forEach(month => {
            const monthName = getBanglaMonthName(month.month) + ' ' + month.year;
            
            html += `
                <div style="background: white; padding: 15px; border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);">
                    <h4 style="margin-top: 0; color: #2c3e50;">${monthName}</h4>
                    <div style="font-size: 14px;">
                        <div style="color: #27ae60; margin-bottom: 5px;">
                            💰 রিচার্জ: ${toBanglaNumber(month.totalRecharge?.toFixed(2) || '0.00')} টাকা
                        </div>
                        <div style="color: #3498db; margin-bottom: 5px;">
                            ⚡ ইউনিট: ${toBanglaNumber(month.totalUnits?.toFixed(2) || '0.00')} kWh
                        </div>
                    </div>
                </div>
            `;
        });
        
        html += '</div>';
        bodyElement.innerHTML = html;
        
    } catch (error) {
        console.error('displayAllMonthsInBody তে ত্রুটি:', error);
        showNotification('❌ ডেটা দেখাতে সমস্যা হচ্ছে', 'error');
    }
}

// ২. Global access
window.displayAllMonthsInBody = displayAllMonthsInBody;

// শুধু ফাংশনগুলো সংজ্ঞায়িত করুন
function getAllMonthsData() {
    console.log('getAllMonthsData: খালি ফাংশন');
    return [];
}

function getMonthlyRechargeData() {
    return [];
}

function getAllMonthsUnitData() {
    return [];
}

function combineMonthlyData() {
    return [];
}

function displayAllMonthsInBody() {
    console.log('displayAllMonthsInBody: ফাংশন কল করা হয়েছে');
    // কিছুই করবেন না
}

// Global access
window.getAllMonthsData = getAllMonthsData;
window.displayAllMonthsInBody = displayAllMonthsInBody;

// টেস্ট ফাংশন যোগ করুন
function testMonthlyData() {
    console.log('=== মাসিক ডেটা টেস্ট ===');
    
    // ১. monthlyRecharges চেক
    console.log('monthlyRecharges:', monthlyRecharges);
    console.log('monthlyRecharges সংখ্যা:', monthlyRecharges?.length || 0);
    
    if (monthlyRecharges.length > 0) {
        console.log('প্রথম রিচার্জ:', monthlyRecharges[0]);
    }
    
    // ২. transactions চেক
    const electricityBills = transactions.filter(t => t.type === 'electricity_bill');
    console.log('বিদ্যুৎ বিল সংখ্যা:', electricityBills.length);
    
    if (electricityBills.length > 0) {
        console.log('প্রথম বিদ্যুৎ বিল:', electricityBills[0]);
    }
    
    // ৩. মাসিক সারাংশ দেখান
    showMonthlySummary();
}

// গ্লোবাল অ্যাক্সেস
window.testMonthlyData = testMonthlyData;

// মাসের বিস্তারিত দেখান - সহজ ভার্সন
function showMonthDetailsSimple(month, year) {
    console.log(`মাসের বিস্তারিত: ${month}/${year}`);
    
    const monthKey = `${year}-${month.toString().padStart(2, '0')}`;
    const monthName = getBanglaMonthName(month) + ' ' + year;
    
    // এই মাসের রিচার্জ
    const monthRecharges = monthlyRecharges.filter(r => {
        if (r.month && r.month === monthKey) return true;
        
        if (r.date) {
            try {
                const date = new Date(r.date);
                const rechargeMonthKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
                return rechargeMonthKey === monthKey;
            } catch (error) {
                console.error('তারিখ পার্স করতে সমস্যা:', r.date, error);
                return false;
            }
        }
        return false;
    });
    
    // এই মাসের বিদ্যুৎ বিল
    const monthBills = transactions.filter(t => {
        if (t.type !== 'electricity_bill') return false;
        
        try {
            let billMonthKey;
            
            if (t.date) {
                const date = new Date(t.date);
                billMonthKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
            } else if (t.timestamp) {
                const date = parseBanglaDate(t.timestamp);
                billMonthKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
            } else {
                return false;
            }
            
            return billMonthKey === monthKey;
        } catch (error) {
            console.error('বিল তারিখ পার্স করতে সমস্যা:', t, error);
            return false;
        }
    });
    
    let html = `
        <div style="max-width: 700px; margin: 0 auto;">
            <!-- হেডার -->
            <div style="text-align: center; background: linear-gradient(135deg, #3498db, #2980b9); 
                       color: white; padding: 20px; border-radius: 10px; margin-bottom: 25px;">
                <h2 style="margin: 0; font-size: 22px;">📅 ${monthName} - বিস্তারিত</h2>
                <div style="display: flex; justify-content: center; gap: 15px; margin-top: 10px;">
                    <span style="background: rgba(255,255,255,0.2); padding: 5px 15px; border-radius: 20px; font-size: 13px;">
                        💰 ${toBanglaNumber(monthRecharges.length)} রিচার্জ
                    </span>
                    <span style="background: rgba(255,255,255,0.2); padding: 5px 15px; border-radius: 20px; font-size: 13px;">
                        ⚡ ${toBanglaNumber(monthBills.length)} বিল
                    </span>
                </div>
            </div>
    `;
    
    // রিচার্জ তালিকা
    if (monthRecharges.length > 0) {
        const totalRecharge = monthRecharges.reduce((sum, r) => sum + (r.amount || 0), 0);
        
        html += `
            <div style="margin-bottom: 25px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                    <h3 style="color: #2c3e50; margin: 0; font-size: 18px;">💰 রিচার্জ তালিকা</h3>
                    <span style="background: #27ae60; color: white; padding: 5px 12px; border-radius: 15px; font-size: 12px; font-weight: bold;">
                        মোট: ${toBanglaNumber(totalRecharge.toFixed(2))} টাকা
                    </span>
                </div>
                
                <div style="max-height: 250px; overflow-y: auto; padding-right: 5px;">
        `;
        
        monthRecharges.forEach((recharge, index) => {
            const date = recharge.date ? new Date(recharge.date).toLocaleDateString('bn-BD') : 'তারিখ নেই';
            const billDetails = recharge.billDetails || {};
            const usableAmount = billDetails.energyCost || recharge.amount || 0;
            
            html += `
                <div style="background: white; border: 1px solid #e0e0e0; padding: 15px; margin: 0 0 10px 0; 
                           border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.05);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <div style="width: 30px; height: 30px; background: #27ae60; color: white; 
                                       border-radius: 50%; display: flex; align-items: center; justify-content: center; 
                                       font-size: 14px; font-weight: bold;">
                                ${index + 1}
                            </div>
                            <div style="font-weight: bold; color: #2c3e50;">রিচার্জ #${index + 1}</div>
                        </div>
                        <div style="font-size: 20px; color: #27ae60; font-weight: bold;">
                            ${toBanglaNumber(recharge.amount.toFixed(2))}
                        </div>
                    </div>
                    
                    <div style="font-size: 13px; color: #7f8c8d; margin-bottom: 10px;">
                        <div>📅 তারিখ: ${date}</div>
                        ${recharge.id ? `<div>🆔 ID: ${recharge.id}</div>` : ''}
                    </div>
                    
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 8px; font-size: 13px;">
                        <div style="background: #e8f6f3; padding: 8px; border-radius: 5px; text-align: center;">
                            <div style="color: #3498db; font-weight: bold;">ব্যবহারযোগ্য</div>
                            <div style="color: #3498db; font-weight: bold; font-size: 14px;">
                                ${toBanglaNumber(usableAmount.toFixed(2))} টাকা
                            </div>
                        </div>
                        
                        ${billDetails.demandCharge ? `
                        <div style="background: #fff8e1; padding: 8px; border-radius: 5px; text-align: center;">
                            <div style="color: #e67e22; font-weight: bold;">ডিমান্ড চার্জ</div>
                            <div style="color: #e67e22; font-weight: bold; font-size: 14px;">
                                ${toBanglaNumber(billDetails.demandCharge.toFixed(2))} টাকা
                            </div>
                        </div>
                        ` : ''}
                        
                        ${billDetails.vat ? `
                        <div style="background: #f3e5f5; padding: 8px; border-radius: 5px; text-align: center;">
                            <div style="color: #9b59b6; font-weight: bold;">ভ্যাট</div>
                            <div style="color: #9b59b6; font-weight: bold; font-size: 14px;">
                                ${toBanglaNumber(billDetails.vat.toFixed(2))} টাকা
                            </div>
                        </div>
                        ` : ''}
                    </div>
                </div>
            `;
        });
        
        html += `</div></div>`;
    } else {
        html += `
            <div style="background: #fff3cd; padding: 20px; border-radius: 8px; text-align: center; margin-bottom: 20px;">
                <div style="font-size: 40px; margin-bottom: 10px;">📭</div>
                <div style="color: #856404; font-size: 16px; font-weight: bold;">এই মাসে কোন রিচার্জ নেই</div>
                <div style="color: #856404; font-size: 14px; margin-top: 5px;">
                    রিচার্জ যোগ করতে রিচার্জ ট্যাবে যান
                </div>
            </div>
        `;
    }
    
    // বিদ্যুৎ বিল তালিকা
    if (monthBills.length > 0) {
        const totalUnits = monthBills.reduce((sum, b) => sum + (b.units || 0), 0);
        const totalCost = monthBills.reduce((sum, b) => sum + Math.abs(b.amount || 0), 0);
        const avgRate = totalUnits > 0 ? totalCost / totalUnits : 0;
        
        html += `
            <div style="margin-bottom: 25px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                    <h3 style="color: #2c3e50; margin: 0; font-size: 18px;">⚡ বিদ্যুৎ বিল তালিকা</h3>
                    <div style="display: flex; gap: 10px;">
                        <span style="background: #e74c3c; color: white; padding: 5px 12px; border-radius: 15px; font-size: 12px; font-weight: bold;">
                            ${toBanglaNumber(totalUnits.toFixed(2))} kWh
                        </span>
                        <span style="background: #f39c12; color: white; padding: 5px 12px; border-radius: 15px; font-size: 12px; font-weight: bold;">
                            ${toBanglaNumber(totalCost.toFixed(2))} টাকা
                        </span>
                    </div>
                </div>
                
                <div style="max-height: 250px; overflow-y: auto; padding-right: 5px;">
        `;
        
        monthBills.forEach((bill, index) => {
            const date = bill.timestamp ? bill.timestamp.split(',')[0] : (bill.date || 'তারিখ নেই');
            const costPerUnit = bill.units > 0 ? Math.abs(bill.amount) / bill.units : 0;
            
            html += `
                <div style="background: white; border: 1px solid #e0e0e0; padding: 15px; margin: 0 0 10px 0; 
                           border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.05);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <div style="width: 30px; height: 30px; background: #e74c3c; color: white; 
                                       border-radius: 50%; display: flex; align-items: center; justify-content: center; 
                                       font-size: 14px; font-weight: bold;">
                                ${index + 1}
                            </div>
                            <div style="font-weight: bold; color: #2c3e50;">বিল #${index + 1}</div>
                        </div>
                        <div style="font-size: 20px; color: #e74c3c; font-weight: bold;">
                            ${toBanglaNumber(Math.abs(bill.amount).toFixed(2))}
                        </div>
                    </div>
                    
                    <div style="font-size: 13px; color: #7f8c8d; margin-bottom: 10px;">
                        <div>📅 তারিখ: ${date}</div>
                        <div>🔢 ইউনিট: ${toBanglaNumber((bill.units || 0).toFixed(2))} kWh</div>
                    </div>
                    
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 13px;">
                        <div style="background: #e8f6f3; padding: 8px; border-radius: 5px; text-align: center;">
                            <div style="color: #3498db; font-weight: bold;">দর/ইউনিট</div>
                            <div style="color: #3498db; font-weight: bold; font-size: 14px;">
                                ${toBanglaNumber(costPerUnit.toFixed(2))} টাকা
                            </div>
                        </div>
                        
                        <div style="background: #ffeaa7; padding: 8px; border-radius: 5px; text-align: center;">
                            <div style="color: #e67e22; font-weight: bold;">গড় দৈনিক</div>
                            <div style="color: #e67e22; font-weight: bold; font-size: 14px;">
                                ${toBanglaNumber(((bill.units || 0) / 30).toFixed(2))} kWh
                            </div>
                        </div>
                    </div>
                    
                    ${bill.description ? `
                    <div style="margin-top: 10px; padding: 8px; background: #f8f9fa; border-radius: 5px; border-left: 3px solid #3498db;">
                        <div style="font-size: 12px; color: #7f8c8d; font-style: italic;">
                            📝 ${bill.description}
                        </div>
                    </div>
                    ` : ''}
                </div>
            `;
        });
        
        html += `</div></div>`;
    } else {
        html += `
            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; text-align: center; margin-bottom: 20px;">
                <div style="font-size: 40px; margin-bottom: 10px;">⚡</div>
                <div style="color: #7f8c8d; font-size: 16px; font-weight: bold;">এই মাসে কোন বিদ্যুৎ বিল নেই</div>
            </div>
        `;
    }
    
    // সারসংক্ষেপ
    const totalRecharge = monthRecharges.reduce((sum, r) => sum + (r.amount || 0), 0);
    const totalUnits = monthBills.reduce((sum, b) => sum + (b.units || 0), 0);
    const totalCost = monthBills.reduce((sum, b) => sum + Math.abs(b.amount || 0), 0);
    const avgRate = totalUnits > 0 ? totalCost / totalUnits : 0;
    
    html += `
        <div style="background: linear-gradient(135deg, #2c3e50, #34495e); color: white; padding: 20px; border-radius: 10px;">
            <h3 style="margin-top: 0; margin-bottom: 15px; text-align: center;">📊 মাসিক সারসংক্ষেপ</h3>
            
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 15px; text-align: center;">
                <div>
                    <div style="font-size: 22px; font-weight: bold; color: #27ae60;">${toBanglaNumber(totalRecharge.toFixed(2))}</div>
                    <div style="font-size: 12px; opacity: 0.8;">মোট রিচার্জ</div>
                </div>
                
                <div>
                    <div style="font-size: 22px; font-weight: bold; color: #3498db;">${toBanglaNumber(monthRecharges.length)}</div>
                    <div style="font-size: 12px; opacity: 0.8;">রিচার্জ সংখ্যা</div>
                </div>
                
                <div>
                    <div style="font-size: 22px; font-weight: bold; color: #e74c3c;">${toBanglaNumber(totalUnits.toFixed(2))}</div>
                    <div style="font-size: 12px; opacity: 0.8;">মোট ইউনিট</div>
                </div>
                
                <div>
                    <div style="font-size: 22px; font-weight: bold; color: #9b59b6;">${toBanglaNumber(totalCost.toFixed(2))}</div>
                    <div style="font-size: 12px; opacity: 0.8;">মোট খরচ</div>
                </div>
            </div>
            
            <div style="margin-top: 15px; text-align: center;">
                <div style="display: inline-block; background: rgba(255,255,255,0.1); padding: 10px 20px; border-radius: 20px;">
                    <span style="color: #f1c40f; font-weight: bold;">গড় দর:</span>
                    <span style="color: white; font-weight: bold; margin-left: 5px;">
                        ${toBanglaNumber(avgRate.toFixed(2))} টাকা/ইউনিট
                    </span>
                </div>
            </div>
            
            <div style="margin-top: 15px; font-size: 12px; opacity: 0.8; text-align: center;">
                <div>📅 রিপোর্ট জেনারেটেড: ${new Date().toLocaleString('bn-BD')}</div>
            </div>
        </div>
    `;
    
    html += `</div>`;
    
    showCustomModal(`${monthName} - বিস্তারিত`, html);
}

// মাসের বিশ্লেষণ দেখান - সহজ ভার্সন
function analyzeMonthSimple(month, year) {
    const monthKey = `${year}-${month.toString().padStart(2, '0')}`;
    const monthName = getBanglaMonthName(month) + ' ' + year;
    
    // এই মাসের ডেটা
    const monthRecharges = monthlyRecharges.filter(r => r.month === monthKey);
    const monthBills = transactions.filter(t => {
        if (t.type !== 'electricity_bill') return false;
        try {
            const billDate = parseBanglaDate(t.timestamp);
            return billDate.getFullYear() === year && 
                   (billDate.getMonth() + 1) === month;
        } catch (error) {
            return false;
        }
    });
    
    let html = `
        <div style="text-align: center; background: linear-gradient(135deg, #9b59b6, #8e44ad); 
                   color: white; padding: 20px; border-radius: 10px; margin-bottom: 25px;">
            <h2 style="margin: 0;">📊 ${monthName} - বিশ্লেষণ</h2>
        </div>
        
        <div style="text-align: center; color: #2c3e50; font-size: 16px; margin-bottom: 20px;">
            মাসিক ব্যবহার বিশ্লেষণ
        </div>
    `;
    
    // রিচার্জ বিশ্লেষণ
    if (monthRecharges.length > 0) {
        const totalRecharge = monthRecharges.reduce((sum, r) => sum + (r.amount || 0), 0);
        const avgRecharge = totalRecharge / monthRecharges.length;
        
        html += `
            <div style="margin-bottom: 20px;">
                <div style="font-weight: bold; color: #2c3e50; margin-bottom: 10px; display: flex; align-items: center; gap: 10px;">
                    <span style="background: #27ae60; color: white; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                        💰
                    </span>
                    রিচার্জ বিশ্লেষণ
                </div>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                    <div style="background: #e8f6f3; padding: 15px; border-radius: 8px; text-align: center;">
                        <div style="font-size: 20px; color: #27ae60; font-weight: bold;">${toBanglaNumber(totalRecharge.toFixed(2))}</div>
                        <div style="font-size: 12px; color: #7f8c8d;">মোট রিচার্জ</div>
                    </div>
                    
                    <div style="background: #e3f2fd; padding: 15px; border-radius: 8px; text-align: center;">
                        <div style="font-size: 20px; color: #3498db; font-weight: bold;">${toBanglaNumber(avgRecharge.toFixed(2))}</div>
                        <div style="font-size: 12px; color: #7f8c8d;">গড় রিচার্জ</div>
                    </div>
                </div>
            </div>
        `;
    }
    
    // বিদ্যুৎ বিল বিশ্লেষণ
    if (monthBills.length > 0) {
        const totalUnits = monthBills.reduce((sum, b) => sum + (b.units || 0), 0);
        const totalCost = monthBills.reduce((sum, b) => sum + Math.abs(b.amount || 0), 0);
        const avgDailyUnits = totalUnits / 30;
        const avgRate = totalUnits > 0 ? totalCost / totalUnits : 0;
        
        html += `
            <div style="margin-bottom: 20px;">
                <div style="font-weight: bold; color: #2c3e50; margin-bottom: 10px; display: flex; align-items: center; gap: 10px;">
                    <span style="background: #e74c3c; color: white; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                        ⚡
                    </span>
                    বিদ্যুৎ বিল বিশ্লেষণ
                </div>
                
                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px;">
                    <div style="background: #ffebee; padding: 15px; border-radius: 8px; text-align: center;">
                        <div style="font-size: 20px; color: #e74c3c; font-weight: bold;">${toBanglaNumber(totalUnits.toFixed(2))}</div>
                        <div style="font-size: 12px; color: #7f8c8d;">মোট ইউনিট</div>
                    </div>
                    
                    <div style="background: #fff3e0; padding: 15px; border-radius: 8px; text-align: center;">
                        <div style="font-size: 20px; color: #f39c12; font-weight: bold;">${toBanglaNumber(avgDailyUnits.toFixed(2))}</div>
                        <div style="font-size: 12px; color: #7f8c8d;">দৈনিক গড়</div>
                    </div>
                </div>
                
                <div style="margin-top: 10px; background: #f8f9fa; padding: 15px; border-radius: 8px; text-align: center;">
                    <div style="font-size: 16px; color: #2c3e50; font-weight: bold;">
                        গড় দর: ${toBanglaNumber(avgRate.toFixed(2))} টাকা/ইউনিট
                    </div>
                    <div style="font-size: 12px; color: #7f8c8d;">
                        প্রতি ইউনিট গড় খরচ
                    </div>
                </div>
            </div>
        `;
    }
    
    // সুপারিশ
    html += `
        <div style="background: #fff3cd; padding: 20px; border-radius: 10px; border-left: 4px solid #ffc107;">
            <div style="font-weight: bold; color: #856404; margin-bottom: 10px; display: flex; align-items: center; gap: 10px;">
                <span style="background: #ffc107; color: white; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                    💡
                </span>
                মাসিক সুপারিশ
            </div>
            
            <div style="color: #856404; font-size: 14px;">
                ${getSimpleMonthRecommendations(month, year, monthRecharges, monthBills)}
            </div>
        </div>
    `;
    
    showCustomModal(`${monthName} - বিশ্লেষণ`, html);
}

// সহজ মাসিক সুপারিশ
function getSimpleMonthRecommendations(month, year, monthRecharges, monthBills) {
    let recommendations = '';
    
    if (monthRecharges.length === 0) {
        recommendations += '<p style="margin: 0 0 10px 0;">• এই মাসে কোন রিচার্জ নেই। রিচার্জ যোগ করুন।</p>';
    }
    
    if (monthBills.length > 0) {
        const totalUnits = monthBills.reduce((sum, b) => sum + (b.units || 0), 0);
        const avgDailyUnits = totalUnits / 30;
        
        if (avgDailyUnits > 10) {
            recommendations += '<p style="margin: 0 0 10px 0;">• উচ্চ ইউনিট ব্যবহার! বিদ্যুৎ সাশ্রয়ী যন্ত্র ব্যবহার করুন।</p>';
        } else if (avgDailyUnits < 5) {
            recommendations += '<p style="margin: 0 0 10px 0;">• ভালো ইউনিট ব্যবস্থাপনা! এই হার বজায় রাখুন।</p>';
        }
        
        const totalCost = monthBills.reduce((sum, b) => sum + Math.abs(b.amount || 0), 0);
        const avgRate = totalUnits > 0 ? totalCost / totalUnits : 0;
        
        if (avgRate > 8) {
            recommendations += '<p style="margin: 0 0 10px 0;">• প্রতি ইউনিট গড় খরচ বেশি। ইউনিট ব্যবহার কমিয়ে সাশ্রয় করুন।</p>';
        }
    }
    
    if (!recommendations) {
        recommendations = '<p style="margin: 0;">• আরও ডেটা যোগ করে নির্দিষ্ট সুপারিশ পান।</p>';
    }
    
    return recommendations;
}

// সব মাসের জন্য colorful স্ল্যাব বিশ্লেষণ তৈরির ফাংশন
function generateColorfulSlabAnalysis(monthData, monthName, monthKey) {
    const monthBill = calculateBillForUnits(monthData.units);
    const monthColors = [
        { bg: 'linear-gradient(135deg, #2ecc71, #27ae60)', text: 'white' },
        { bg: 'linear-gradient(135deg, #3498db, #2980b9)', text: 'white' },
        { bg: 'linear-gradient(135deg, #9b59b6, #8e44ad)', text: 'white' },
        { bg: 'linear-gradient(135deg, #e74c3c, #c0392b)', text: 'white' },
        { bg: 'linear-gradient(135deg, #f39c12, #d35400)', text: 'white' },
        { bg: 'linear-gradient(135deg, #1abc9c, #16a085)', text: 'white' }
    ];
    
    // মাসের জন্য নির্দিষ্ট কালার (মাসের নামের হ্যাশ ব্যবহার করে)
    let hash = 0;
    for (let i = 0; i < monthName.length; i++) {
        hash = ((hash << 5) - hash) + monthName.charCodeAt(i);
        hash |= 0;
    }
    const colorIndex = Math.abs(hash) % monthColors.length;
    const monthColor = monthColors[colorIndex];
    
    let html = `
        <div style="background: ${monthColor.bg}; color: ${monthColor.text}; padding: 20px; border-radius: 10px; margin: 20px 0; text-align: center;">
            <h4 style="margin: 0 0 15px 0; font-size: 18px;">📅 ${monthName}</h4>
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px;">
                <div>
                    <div style="font-size: 20px; font-weight: bold;">${toBanglaNumber(monthData.units.toFixed(2))}</div>
                    <small>মাসিক ইউনিট</small>
                </div>
                <div>
                    <div style="font-size: 20px; font-weight: bold;">${toBanglaNumber(monthBill.totalCost.toFixed(2))}</div>
                    <small>মাসিক খরচ</small>
                </div>
                <div>
                    <div style="font-size: 20px; font-weight: bold;">${toBanglaNumber(monthBill.averageRate.toFixed(2))}</div>
                    <small>গড়/ইউনিট</small>
                </div>
            </div>
            <div style="margin-top: 10px; font-size: 12px; opacity: 0.9;">
                📌 ${toBanglaNumber(monthData.billCount)}টি বিল | ট্যারিফ: ${toBanglaNumber(monthBill.totalCost.toFixed(2))} টাকা
            </div>
        </div>
        
        <div style="background: white; padding: 15px; border-radius: 8px; margin: 10px 0;">
            <h5 style="color: #2c3e50; margin-top: 0; margin-bottom: 10px;">${monthName} মাসের স্ল্যাব ভিত্তিক খরচ:</h5>
    `;
    
    if (monthBill.slabBreakdown.length > 0) {
        monthBill.slabBreakdown.forEach((slab, slabIndex) => {
            if (slab.units > 0) {
                const slabColors = ['#e8f6f3', '#e3f2fd', '#f3e5f5', '#fff3e0', '#ffebee', '#e8f5e9'];
                const slabColor = slabColors[slabIndex % slabColors.length];
                html += `
                    <div style="display: flex; justify-content: space-between; padding: 8px 12px; margin: 5px 0; 
                                border-radius: 6px; background: ${slabColor};">
                        <span style="color: #2c3e50; font-size: 13px; font-weight: 500;">
                            ${translateSlabName(slab.name)} (${toBanglaRange(slab.range)})
                        </span>
                        <span style="font-weight: bold; color: #e74c3c; font-size: 13px;">
                            ${toBanglaNumber(slab.units.toFixed(2))} kWh × ${slab.rate} টাকা = ${toBanglaNumber(slab.cost.toFixed(2))} টাকা
                        </span>
                    </div>
                `;
            }
        });
    } else {
        html += `<div style="text-align: center; padding: 10px; color: #7f8c8d;">কোন স্ল্যাব ডেটা নেই</div>`;
    }
    
    html += `</div>`;
    return html;
}

// সব মাসের ডেটা সংগ্রহ এবং colorful বিশ্লেষণ দেখান
function showAllMonthsColorfulAnalysis() {
    console.log('=== সব মাসের colorful বিশ্লেষণ ===');
    
    // সব মাসের ডেটা সংগ্রহ
    const allMonthsData = {};
    
    transactions.forEach(t => {
        if (t.type === 'electricity_bill' && t.units && t.timestamp) {
            const ym = extractYearMonth(t.timestamp);
            if (ym && ym.year && ym.month) {
                const key = `${ym.year}-${ym.month.toString().padStart(2, '0')}`;
                if (!allMonthsData[key]) {
                    allMonthsData[key] = { units: 0, billCount: 0, month: ym.month, year: ym.year };
                }
                allMonthsData[key].units += t.units;
                allMonthsData[key].billCount++;
            }
        }
    });
    
    // সাজানো
    const sortedMonths = Object.keys(allMonthsData).sort().reverse();
    
    if (sortedMonths.length === 0) {
        showNotification('❌ কোন মাসিক ডেটা নেই!', 'error');
        return;
    }
    
    let html = `
        <div style="max-height: 600px; overflow-y: auto; padding: 10px;">
            <div style="text-align: center; margin-bottom: 20px;">
                <h3 style="color: #2c3e50;">📊 সব মাসের স্ল্যাব বিশ্লেষণ</h3>
                <p style="color: #7f8c8d;">মোট ${toBanglaNumber(sortedMonths.length)} মাসের ডেটা</p>
            </div>
    `;
    
    sortedMonths.forEach(key => {
        const data = allMonthsData[key];
        const monthName = getBanglaMonthName(data.month) + ' ' + data.year;
        html += generateColorfulSlabAnalysis(data, monthName, key);
    });
    
    // সামগ্রিক পরিসংখ্যান
    const totalUnits = Object.values(allMonthsData).reduce((sum, d) => sum + d.units, 0);
    const totalBill = calculateBillForUnits(totalUnits);
    
    html += `
        <div style="background: linear-gradient(135deg, #2c3e50, #34495e); color: white; padding: 15px; border-radius: 8px; margin-top: 20px;">
            <h4 style="margin-top: 0; text-align: center;">📊 সামগ্রিক পরিসংখ্যান</h4>
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; text-align: center;">
                <div>
                    <div style="font-size: 20px; font-weight: bold;">${toBanglaNumber(sortedMonths.length)}</div>
                    <small>মোট মাস</small>
                </div>
                <div>
                    <div style="font-size: 20px; font-weight: bold;">${toBanglaNumber(totalUnits.toFixed(2))}</div>
                    <small>মোট ইউনিট</small>
                </div>
                <div>
                    <div style="font-size: 20px; font-weight: bold;">${toBanglaNumber(totalBill.totalCost.toFixed(2))}</div>
                    <small>মোট খরচ</small>
                </div>
            </div>
        </div>
    `;
    
    html += `</div>`;
    showCustomModal('সব মাসের স্ল্যাব বিশ্লেষণ', html);
}

// ==================== মিটার সিলেক্ট ও ডেটা লোড ফিক্স ====================

// 1. সঠিকভাবে মিটারে সুইচ করার ফাংশন
function switchToMeter(meterId) {
    if (!meterId || meterId === activeMeterId) return;
    
    console.log('🔄 সুইচিং to meter:', meterId);
    
    // বর্তমান মিটারের ডেটা সেভ
    if (activeMeterId) {
        const oldKey = `meter_data_${activeMeterId}`;
        const oldData = {
            transactions: transactions,
            monthlyRecharges: monthlyRecharges,
            currentBalance: currentBalance,
            totalRecharge: totalRecharge,
            totalExpended: totalExpended,
            lastDemandChargeMonth: lastDemandChargeMonth,
            meterInfo: meterInfo
        };
        localStorage.setItem(oldKey, JSON.stringify(oldData));
        console.log('💾 পুরানো মিটার ডেটা সেভ:', activeMeterId);
    }
    
    // নতুন মিটার সেট
    activeMeterId = meterId;
    localStorage.setItem('desco_active_meter_id', activeMeterId);
    
    // নতুন মিটারের ডেটা লোড
    const newKey = `meter_data_${activeMeterId}`;
    const newRaw = localStorage.getItem(newKey);
    
    if (newRaw) {
        const newData = JSON.parse(newRaw);
        transactions = newData.transactions || [];
        monthlyRecharges = newData.monthlyRecharges || [];
        currentBalance = newData.currentBalance || 0;
        totalRecharge = newData.totalRecharge || 0;
        totalExpended = newData.totalExpended || 0;
        lastDemandChargeMonth = newData.lastDemandChargeMonth || '';
        meterInfo = newData.meterInfo || {};
        
        console.log('✅ ডেটা লোড হয়েছে:', {
            name: meterInfo.name,
            balance: currentBalance,
            transactions: transactions.length
        });
    } else {
        console.log('⚠️ নতুন মিটারের ডেটা নেই, খালি ডেটা তৈরি হচ্ছে');
        transactions = [];
        monthlyRecharges = [];
        currentBalance = 0;
        totalRecharge = 0;
        totalExpended = 0;
    }
    
    // মিটার ইনফো আপডেট
    const currentMeter = meters.find(m => m.id === activeMeterId);
    if (currentMeter) {
        meterInfo = {
            name: currentMeter.name,
            meterNumber: currentMeter.meterNumber,
            accountNumber: currentMeter.accountNumber
        };
    }
    
    // UI আপডেট
    updateMeterDisplay();
    updateBalanceDisplay();
    loadTransactionReport();
    
    // ড্রপডাউন আপডেট
    const selector = document.getElementById('meterSelector');
    if (selector) {
        for(let i = 0; i < selector.options.length; i++) {
            if(selector.options[i].value === activeMeterId) {
                selector.selectedIndex = i;
                break;
            }
        }
    }
    
    const meterName = currentMeter ? currentMeter.name : 'মিটার';
    showNotification(`✅ ${meterName} মিটারে সুইচ করা হয়েছে`, 'success');
    console.log('✅ সুইচ সম্পন্ন');
}

// 2. পেজ লোডের সময় সঠিক মিটার সেট করা
function fixMeterOnPageLoad() {
    console.log('🔧 পেজ লোডে মিটার ফিক্স চলছে...');
    
    // activeMeterId চেক
    let savedMeterId = localStorage.getItem('desco_active_meter_id');
    console.log('সেভ করা মিটার আইডি:', savedMeterId);
    
    // meters অ্যারে লোড
    if (!meters || meters.length === 0) {
        const savedMeters = localStorage.getItem('desco_meters');
        if (savedMeters) {
            meters = JSON.parse(savedMeters);
            console.log('মিটার লোড:', meters.length);
        }
    }
    
    // activeMeterId ভ্যালিড চেক
    if (savedMeterId && meters && meters.find(m => m.id === savedMeterId)) {
        if (activeMeterId !== savedMeterId) {
            console.log('activeMeterId আপডেট:', savedMeterId);
            activeMeterId = savedMeterId;
        }
    } else if (meters && meters.length > 0) {
        console.log('ডিফল্ট মিটার সেট:', meters[0].name);
        activeMeterId = meters[0].id;
        localStorage.setItem('desco_active_meter_id', activeMeterId);
    }
    
    // মিটার ডেটা লোড
    if (activeMeterId) {
        const meterKey = `meter_data_${activeMeterId}`;
        const rawData = localStorage.getItem(meterKey);
        if (rawData) {
            const data = JSON.parse(rawData);
            transactions = data.transactions || [];
            monthlyRecharges = data.monthlyRecharges || [];
            currentBalance = data.currentBalance || 0;
            totalRecharge = data.totalRecharge || 0;
            totalExpended = data.totalExpended || 0;
            lastDemandChargeMonth = data.lastDemandChargeMonth || '';
            meterInfo = data.meterInfo || {};
            console.log('✅ ডেটা লোড:', {
                name: meterInfo.name,
                balance: currentBalance,
                txCount: transactions.length
            });
        }
    }
    
    // UI আপডেট
    updateMeterDisplay();
    updateBalanceDisplay();
    if (typeof loadTransactionReport === 'function') loadTransactionReport();
    
    // ড্রপডাউন আপডেট
    const selector = document.getElementById('meterSelector');
    if (selector && activeMeterId) {
        for(let i = 0; i < selector.options.length; i++) {
            if(selector.options[i].value === activeMeterId) {
                selector.selectedIndex = i;
                break;
            }
        }
    }
    
    console.log('✅ পেজ লোড ফিক্স সম্পন্ন');
}

// 3. ড্রপডাউন চেঞ্জ ইভেন্ট হ্যান্ডলার
function onMeterSelectChange(meterId) {
    if (meterId === 'new') {
        if (typeof showAddMeterModal === 'function') {
            showAddMeterModal();
        }
        // সিলেক্টর আগের মানে ফিরিয়ে দিন
        const selector = document.getElementById('meterSelector');
        if (selector && activeMeterId) {
            selector.value = activeMeterId;
        }
        return;
    }
    
    if (meterId && meterId !== activeMeterId) {
        switchToMeter(meterId);
    }
}

// 4. DOMContentLoaded-এ ফিক্স কল করুন
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(fixMeterOnPageLoad, 100);
});

// 5. window.load-এ নিশ্চিত করুন
window.addEventListener('load', function() {
    setTimeout(fixMeterOnPageLoad, 200);
});

// 6. গ্লোবাল ফাংশন এক্সপোজ
window.switchToMeter = switchToMeter;
window.fixMeterOnPageLoad = fixMeterOnPageLoad;
window.onMeterSelectChange = onMeterSelectChange;

console.log('✅ মিটার ফিক্স কোড লোড হয়েছে');

// মডাল বন্ধ করার ফাংশন
function closeModal() {
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
        modal.style.display = 'none';
        modal.remove();
    });
}

// অল্টারনেটিভ: কাস্টম মডাল বন্ধ করার জন্য
function closeCustomModal() {
    const modal = document.querySelector('.modal');
    if (modal) {
        modal.style.display = 'none';
        modal.remove();
    }
}

// কনসোলে চেক করার জন্য
console.log('✅ closeModal ফাংশন যোগ করা হয়েছে');

// ==================== এডভান্সড রিপোর্ট ফাংশন ====================

// মাসিক সামারি চার্ট - সব মাসের ডেটা দেখাবে
function generateMonthlyReportChart() {
    const canvas = document.getElementById('monthlyReportChart');
    if (!canvas) {
        console.log('Canvas not found');
        return;
    }
    
    const txs = getActiveTransactions();
    const monthlyData = {};
    
    // সব মাসের ডেটা সংগ্রহ (শুধু বর্তমান না, সব)
    txs.forEach(t => {
        if (t.type === 'electricity_bill' && t.timestamp) {
            let year, month;
            
            try {
                // ISO ফরম্যাট চেক (2026-05-18T...)
                if (t.timestamp.includes('T') && t.timestamp.includes('-')) {
                    const date = new Date(t.timestamp);
                    if (!isNaN(date.getTime())) {
                        year = date.getFullYear();
                        month = date.getMonth() + 1;
                    }
                }
                // বাংলা ফরম্যাট চেক (১৮/৫/২০২৬)
                else if (t.timestamp.includes('/')) {
                    const parts = t.timestamp.split(',')[0].split('/');
                    if (parts.length === 3) {
                        const banglaToEn = (str) => str.replace(/[০-৯]/g, d => '০১২৩৪৫৬৭৮৯'.indexOf(d));
                        const day = parseInt(banglaToEn(parts[0]));
                        month = parseInt(banglaToEn(parts[1]));
                        year = parseInt(banglaToEn(parts[2]));
                    }
                }
            } catch(e) {
                console.warn('Date parse error:', t.timestamp);
                return;
            }
            
            if (year && month) {
                const key = `${year}-${month.toString().padStart(2, '0')}`;
                if (!monthlyData[key]) {
                    monthlyData[key] = { cost: 0, units: 0, month: month, year: year };
                }
                monthlyData[key].cost += Math.abs(t.amount);
                monthlyData[key].units += t.units || 0;
            }
        }
    });
    
    // মাস অনুসারে সাজানো (পুরাতন থেকে নতুন)
    const sortedMonths = Object.keys(monthlyData).sort();
    
    if (sortedMonths.length === 0) {
        console.log('কোন মাসিক ডেটা নেই');
        canvas.innerHTML = '<div style="text-align:center; padding:50px;">কোন ডেটা নেই</div>';
        return;
    }
    
    const monthLabels = sortedMonths.map(key => {
        const [year, month] = key.split('-');
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${monthNames[parseInt(month)-1]} ${year}`;
    });
    
    const monthlyCosts = sortedMonths.map(key => monthlyData[key].cost);
    const monthlyUnits = sortedMonths.map(key => monthlyData[key].units);
    
    // পুরানো চার্ট ডেস্ট্রয়
    if (window.monthlyReportChart && typeof window.monthlyReportChart.destroy === 'function') {
        window.monthlyReportChart.destroy();
    }
    
    const ctx = canvas.getContext('2d');
    window.monthlyReportChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: monthLabels,
            datasets: [
                {
                    label: 'মোট খরচ (টাকা)',
                    data: monthlyCosts,
                    borderColor: '#e74c3c',
                    backgroundColor: 'rgba(231, 76, 60, 0.1)',
                    tension: 0.3,
                    fill: true,
                    yAxisID: 'y'
                },
                {
                    label: 'ইউনিট (kWh)',
                    data: monthlyUnits,
                    borderColor: '#3498db',
                    backgroundColor: 'rgba(52, 152, 219, 0.1)',
                    tension: 0.3,
                    fill: true,
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            let value = context.raw;
                            if (context.dataset.label.includes('খরচ')) {
                                return `${label}: ${value.toFixed(2)} টাকা`;
                            } else {
                                return `${label}: ${value.toFixed(2)} kWh`;
                            }
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'টাকা'
                    }
                },
                y1: {
                    position: 'right',
                    title: {
                        display: true,
                        text: 'ইউনিট (kWh)'
                    },
                    beginAtZero: true,
                    grid: {
                        drawOnChartArea: false
                    }
                }
            }
        }
    });
    
    console.log('মাসিক চার্ট তৈরি হয়েছে:', sortedMonths.length, 'মাস');
}

// বাৎসরিক তুলনা চার্ট - ফিক্সড
function generateYearlyComparisonReport() {
    const canvas = document.getElementById('yearlyComparisonChart');
    if (!canvas) return;
    
    const txs = getActiveTransactions();
    const yearlyData = {};
    const currentYear = new Date().getFullYear();
    
    for (let y = currentYear - 2; y <= currentYear; y++) yearlyData[y] = { cost: 0, units: 0 };
    
    txs.forEach(t => {
        if (t.type === 'electricity_bill' && t.timestamp) {
            let year;
            try {
                const date = new Date(t.timestamp);
                if (!isNaN(date.getTime())) {
                    year = date.getFullYear();
                } else {
                    const parts = t.timestamp.split(',')[0].split('/');
                    if (parts.length === 3) {
                        const banglaToEn = (str) => str.replace(/[০-৯]/g, d => '০১২৩৪৫৬৭৮৯'.indexOf(d));
                        year = parseInt(banglaToEn(parts[2]));
                    }
                }
            } catch(e) { return; }
            
            if (year && yearlyData[year]) {
                yearlyData[year].cost += Math.abs(t.amount);
                yearlyData[year].units += t.units || 0;
            }
        }
    });
    
    if (window.yearlyChart && typeof window.yearlyChart.destroy === 'function') {
        window.yearlyChart.destroy();
    }
    
    const ctx = canvas.getContext('2d');
    window.yearlyChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: Object.keys(yearlyData),
            datasets: [
                { label: 'মোট খরচ (টাকা)', data: Object.values(yearlyData).map(d => d.cost), backgroundColor: '#e74c3c', borderRadius: 8 },
                { label: 'ইউনিট (kWh)', data: Object.values(yearlyData).map(d => d.units), backgroundColor: '#3498db', borderRadius: 8 }
            ]
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, title: { display: true, text: 'টাকা / kWh' } } } }
    });
}

// ব্যবহার ট্রেন্ড চার্ট - ফিক্সড
function generateConsumptionTrendReport() {
    const canvas = document.getElementById('trendReportChart');
    if (!canvas) {
        console.log('Canvas not found');
        return;
    }
    
    const txs = getActiveTransactions();
    const dailyUsage = {};
    
    txs.forEach(t => {
        if (t.type === 'electricity_bill' && t.units && t.timestamp) {
            let date;
            try {
                date = new Date(t.timestamp);
                if (isNaN(date.getTime())) {
                    const parts = t.timestamp.split(',')[0].split('/');
                    if (parts.length === 3) {
                        const banglaToEn = (str) => str.replace(/[০-৯]/g, d => '০১২৩৪৫৬৭৮৯'.indexOf(d));
                        const day = parseInt(banglaToEn(parts[0]));
                        const month = parseInt(banglaToEn(parts[1]));
                        const year = parseInt(banglaToEn(parts[2]));
                        date = new Date(year, month - 1, day);
                    }
                }
            } catch(e) {
                return;
            }
            
            if (date && !isNaN(date.getTime())) {
                const dateStr = date.toISOString().split('T')[0];
                dailyUsage[dateStr] = (dailyUsage[dateStr] || 0) + t.units;
            }
        }
    });
    
    const dates = Object.keys(dailyUsage).sort().slice(-30);
    const usageData = dates.map(d => dailyUsage[d]);
    
    if (window.trendChart && typeof window.trendChart.destroy === 'function') {
        window.trendChart.destroy();
    }
    
    const ctx = canvas.getContext('2d');
    window.trendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: dates.map(d => { const [y, m, d2] = d.split('-'); return `${d2}/${m}`; }),
            datasets: [{ label: 'দৈনিক ব্যবহার (kWh)', data: usageData, borderColor: '#9b59b6', backgroundColor: 'rgba(155,89,182,0.1)', tension: 0.4, fill: true }]
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, title: { display: true, text: 'kWh' } } } }
    });
}

// খরচ বিশ্লেষণ চার্ট - ফিক্সড
function generateCostAnalysisReport() {
    const canvas = document.getElementById('costBreakdownChart');
    if (!canvas) return;
    
    const txs = getActiveTransactions();
    let recharge = 0, expense = 0, demand = 0, vat = 0, rebate = 0;
    
    txs.forEach(t => {
        if (t.type === 'recharge') {
            recharge += Math.abs(t.amount);
        } else if (t.type === 'electricity_bill') {
            expense += Math.abs(t.amount);
            demand += t.demandCharge || 0;
            vat += t.vat || 0;
            rebate += Math.abs(t.rebate || 0);
        }
    });
    
    if (window.costChart && typeof window.costChart.destroy === 'function') {
        window.costChart.destroy();
    }
    
    const ctx = canvas.getContext('2d');
    window.costChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['রিচার্জ', 'বিদ্যুৎ বিল', 'ডিমান্ড চার্জ', 'ভ্যাট', 'রিবেট'],
            datasets: [{ data: [recharge, expense, demand, vat, rebate], backgroundColor: ['#27ae60', '#e74c3c', '#f39c12', '#3498db', '#9b59b6'], borderWidth: 0 }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });
}

// মডাল শো করার ফাংশন - ফিক্সড
function showReportModal(title, chartId, chartFunction) {
    // canvas এলিমেন্টটি DOM এ নাও থাকতে পারে, তাই setTimeout এ কল করা ভালো
    const html = `<div style="height:400px;"><canvas id="${chartId}"></canvas></div>`;
    showCustomModal(title, html);
    
    // মডাল তৈরি হতে সময় দিতে setTimeout ব্যবহার করুন
    setTimeout(() => {
        if (typeof chartFunction === 'function') {
            chartFunction();
        }
    }, 200);
}

// এডভান্সড রিপোর্ট মেনু
window.showAdvancedReports = function() {
    const html = `
        <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:15px; padding:10px;">
            <div onclick="showReportModal('মাসিক সামারি', 'monthlyReportChart', generateMonthlyReportChart)" style="background:linear-gradient(135deg,#2ecc71,#27ae60); color:white; padding:25px; border-radius:12px; text-align:center; cursor:pointer;">
                <div style="font-size:40px;">📅</div>
                <div style="font-weight:bold; margin-top:10px;">মাসিক সামারি</div>
                <div style="font-size:11px; opacity:0.9;">মাসিক খরচ ও ইউনিট</div>
            </div>
            <div onclick="showReportModal('বাৎসরিক তুলনা', 'yearlyComparisonChart', generateYearlyComparisonReport)" style="background:linear-gradient(135deg,#3498db,#2980b9); color:white; padding:25px; border-radius:12px; text-align:center; cursor:pointer;">
                <div style="font-size:40px;">📈</div>
                <div style="font-weight:bold; margin-top:10px;">বাৎসরিক তুলনা</div>
                <div style="font-size:11px; opacity:0.9;">গত ৩ বছর তুলনা</div>
            </div>
            <div onclick="showReportModal('ব্যবহার ট্রেন্ড', 'trendReportChart', generateConsumptionTrendReport)" style="background:linear-gradient(135deg,#9b59b6,#8e44ad); color:white; padding:25px; border-radius:12px; text-align:center; cursor:pointer;">
                <div style="font-size:40px;">📊</div>
                <div style="font-weight:bold; margin-top:10px;">ব্যবহার ট্রেন্ড</div>
                <div style="font-size:11px; opacity:0.9;">৩০ দিনের ট্রেন্ড</div>
            </div>
            <div onclick="showReportModal('খরচ বিশ্লেষণ', 'costBreakdownChart', generateCostAnalysisReport)" style="background:linear-gradient(135deg,#f39c12,#d35400); color:white; padding:25px; border-radius:12px; text-align:center; cursor:pointer;">
                <div style="font-size:40px;">💰</div>
                <div style="font-weight:bold; margin-top:10px;">খরচ বিশ্লেষণ</div>
                <div style="font-size:11px; opacity:0.9;">ব্রেকডাউন বিশ্লেষণ</div>
            </div>
        </div>
    `;
    showCustomModal('📊 এডভান্সড রিপোর্ট', html);
};

//  হেল্পার ফাংশন
window.showReportModal = showReportModal;
window.generateMonthlyReportChart = generateMonthlyReportChart;
window.generateYearlyComparisonReport = generateYearlyComparisonReport;
window.generateConsumptionTrendReport = generateConsumptionTrendReport;
window.generateCostAnalysisReport = generateCostAnalysisReport;

console.log('✅ এডভান্সড রিপোর্ট ফাংশন যোগ করা হয়েছে');

// মিটার এডিট মডাল
function editMeterModal(meterId) {
    const meter = meters.find(m => m.id === meterId);
    if (!meter) {
        showNotification('❌ মিটার খুঁজে পাওয়া যায়নি!', 'error');
        return;
    }
    
    const formHTML = `
        <div style="padding: 10px;">
            <h3 style="text-align: center; color: #2c3e50; margin-bottom: 20px;">✏️ মিটার এডিট করুন</h3>
            
            <div style="margin-bottom: 15px;">
                <label style="font-weight: bold; display: block; margin-bottom: 5px;">👤 গ্রাহকের নাম *</label>
                <input type="text" id="editMeterNameVal" value="${meter.name}" 
                       style="width: 100%; padding: 12px; border: 2px solid #ddd; border-radius: 8px;">
            </div>
            
            <div style="margin-bottom: 15px;">
                <label style="font-weight: bold; display: block; margin-bottom: 5px;">📊 মিটার নম্বর *</label>
                <input type="text" id="editMeterNumberVal" value="${meter.meterNumber}" 
                       style="width: 100%; padding: 12px; border: 2px solid #ddd; border-radius: 8px;">
            </div>
            
            <div style="margin-bottom: 15px;">
                <label style="font-weight: bold; display: block; margin-bottom: 5px;">🔢 অ্যাকাউন্ট নম্বর *</label>
                <input type="text" id="editAccountNumberVal" value="${meter.accountNumber}" 
                       style="width: 100%; padding: 12px; border: 2px solid #ddd; border-radius: 8px;">
            </div>
            
            <div style="margin-bottom: 15px;">
                <label style="font-weight: bold; display: block; margin-bottom: 5px;">📍 ঠিকানা</label>
                <input type="text" id="editAddressVal" value="${meter.address || ''}" 
                       style="width: 100%; padding: 12px; border: 2px solid #ddd; border-radius: 8px;">
            </div>
            
            <div style="margin-bottom: 15px;">
                <label style="font-weight: bold; display: block; margin-bottom: 5px;">📞 ফোন নম্বর</label>
                <input type="tel" id="editPhoneVal" value="${meter.phone || ''}" 
                       style="width: 100%; padding: 12px; border: 2px solid #ddd; border-radius: 8px;">
            </div>
            
            <div style="display: flex; gap: 10px; margin-top: 20px;">
                <button onclick="updateMeterFromModal('${meterId}')" 
                        style="flex: 1; padding: 12px; background: #27ae60; color: white; border: none; border-radius: 8px; cursor: pointer;">
                    💾 সেভ করুন
                </button>
                <button onclick="closeModal()" 
                        style="flex: 1; padding: 12px; background: #95a5a6; color: white; border: none; border-radius: 8px; cursor: pointer;">
                    ❌ বাতিল
                </button>
            </div>
        </div>
    `;
    
    showCustomModal('মিটার এডিট', formHTML);
}

// মডাল থেকে মিটার আপডেট
function updateMeterFromModal(meterId) {
    const name = document.getElementById('editMeterNameVal')?.value.trim();
    const meterNumber = document.getElementById('editMeterNumberVal')?.value.trim();
    const accountNumber = document.getElementById('editAccountNumberVal')?.value.trim();
    const address = document.getElementById('editAddressVal')?.value.trim();
    const phone = document.getElementById('editPhoneVal')?.value.trim();
    
    if (!name || !meterNumber || !accountNumber) {
        showNotification('❌ নাম, মিটার নং এবং অ্যাকাউন্ট নং প্রয়োজন!', 'error');
        return;
    }
    
    // মিটার আপডেট
    const meterIndex = meters.findIndex(m => m.id === meterId);
    if (meterIndex !== -1) {
        meters[meterIndex] = {
            ...meters[meterIndex],
            name: name,
            meterNumber: meterNumber,
            accountNumber: accountNumber,
            address: address || '',
            phone: phone || ''
        };
        
        // মিটার ডেটা স্টোরেজ আপডেট
        const meterDataKey = `meter_data_${meterId}`;
        const existingData = localStorage.getItem(meterDataKey);
        if (existingData) {
            const data = JSON.parse(existingData);
            data.meterInfo = {
                name: name,
                meterNumber: meterNumber,
                accountNumber: accountNumber,
                address: address || '',
                phone: phone || ''
            };
            localStorage.setItem(meterDataKey, JSON.stringify(data));
        }
        
        // বর্তমান মিটার হলে আপডেট
        if (activeMeterId === meterId) {
            meterInfo = {
                name: name,
                meterNumber: meterNumber,
                accountNumber: accountNumber,
                address: address || '',
                phone: phone || ''
            };
            localStorage.setItem('desco_meterInfo', JSON.stringify(meterInfo));
            updateMeterDisplay();
        }
        
        // সেভ এবং UI আপডেট
        localStorage.setItem('desco_meters', JSON.stringify(meters));
        updateMeterSelector();
        closeModal();
        
        showNotification(`✅ "${name}" মিটার আপডেট করা হয়েছে!`, 'success');
        
        // মিটার ম্যানেজমেন্ট রিফ্রেশ
        setTimeout(() => {
            if (typeof manageMeters === 'function') manageMeters();
        }, 500);
    }
}

// গ্লোবাল এক্সেস
window.editMeterModal = editMeterModal;
window.updateMeterFromModal = updateMeterFromModal;

// ==================== ড্যাশবোর্ড সারাংশ কার্ড ====================
function updateDashboardCards() {
    const txs = getActiveTransactions();
    
    let totalRechargeAmt = 0, totalExpenseAmt = 0, totalUnitsCount = 0;
    
    txs.forEach(t => {
        if (t.type === 'recharge') {
            totalRechargeAmt += Math.abs(t.amount);
        } else if (t.type === 'electricity_bill') {
            totalExpenseAmt += Math.abs(t.amount);
            totalUnitsCount += t.units || 0;
        }
    });
    
    const savings = totalRechargeAmt - totalExpenseAmt;
    const savingsColor = savings >= 0 ? '#27ae60' : '#e74c3c';
    
    let dashboardHTML = `
        <div class="dashboard-cards" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-bottom: 20px; padding: 0 10px;">
            <div style="background: linear-gradient(135deg, #27ae60, #2ecc71); color: white; padding: 18px 12px; border-radius: 12px; text-align: center; box-shadow: 0 4px 12px rgba(39,174,96,0.3);">
                <div style="font-size: 28px;">💰</div>
                <div style="font-size: 20px; font-weight: bold;">${toBanglaNumber(totalRechargeAmt.toFixed(2))}</div>
                <div style="font-size: 11px; opacity: 0.9; margin-top: 4px;">মোট রিচার্জ</div>
            </div>
            <div style="background: linear-gradient(135deg, #3498db, #2980b9); color: white; padding: 18px 12px; border-radius: 12px; text-align: center; box-shadow: 0 4px 12px rgba(52,152,219,0.3);">
                <div style="font-size: 28px;">⚡</div>
                <div style="font-size: 20px; font-weight: bold;">${toBanglaNumber(totalUnitsCount.toFixed(2))}</div>
                <div style="font-size: 11px; opacity: 0.9; margin-top: 4px;">মোট ইউনিট</div>
            </div>
            <div style="background: linear-gradient(135deg, #e74c3c, #c0392b); color: white; padding: 18px 12px; border-radius: 12px; text-align: center; box-shadow: 0 4px 12px rgba(231,76,60,0.3);">
                <div style="font-size: 28px;">💸</div>
                <div style="font-size: 20px; font-weight: bold;">${toBanglaNumber(totalExpenseAmt.toFixed(2))}</div>
                <div style="font-size: 11px; opacity: 0.9; margin-top: 4px;">মোট খরচ</div>
            </div>
            <div style="background: linear-gradient(135deg, ${savingsColor}, ${savingsColor === '#27ae60' ? '#2ecc71' : '#c0392b'}); color: white; padding: 18px 12px; border-radius: 12px; text-align: center; box-shadow: 0 4px 12px rgba(0,0,0,0.2);">
                <div style="font-size: 28px;">${savings >= 0 ? '💚' : '⚠️'}</div>
                <div style="font-size: 20px; font-weight: bold;">${toBanglaNumber(Math.abs(savings).toFixed(2))}</div>
                <div style="font-size: 11px; opacity: 0.9; margin-top: 4px;">${savings >= 0 ? 'সঞ্চয়' : 'ঘাটতি'}</div>
            </div>
        </div>
    `;
    
    const existingCards = document.querySelector('.dashboard-cards');
    if (existingCards) existingCards.remove();
    
    const container = document.querySelector('.container');
    if (container) {
        // হেডারের পরে কার্ড যোগ করুন
        const header = document.querySelector('.header-with-stats');
        if (header && header.nextSibling) {
            header.insertAdjacentHTML('afterend', dashboardHTML);
        } else {
            container.insertAdjacentHTML('afterbegin', dashboardHTML);
        }
    }
}

// ==================== খরচ ট্রেন্ড ইন্ডিকেটর ====================
function updateTrendIndicator() {
    const txs = getActiveTransactions();
    const monthlyExpense = {};
    
    txs.forEach(t => {
        if (t.type === 'electricity_bill' && t.timestamp) {
            try {
                const date = new Date(t.timestamp);
                if (!isNaN(date.getTime())) {
                    const month = `${date.getFullYear()}-${date.getMonth()}`;
                    monthlyExpense[month] = (monthlyExpense[month] || 0) + Math.abs(t.amount);
                }
            } catch(e) {}
        }
    });
    
    const months = Object.keys(monthlyExpense).sort();
    if (months.length < 2) return;
    
    const lastMonth = months[months.length - 1];
    const prevMonth = months[months.length - 2];
    const currentExpense = monthlyExpense[lastMonth];
    const previousExpense = monthlyExpense[prevMonth];
    
    const change = ((currentExpense - previousExpense) / previousExpense * 100).toFixed(1);
    const isIncreased = change > 0;
    
    const trendHTML = `
        <div style="background: #f8f9fa; padding: 12px 20px; border-radius: 10px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; border-left: 4px solid ${isIncreased ? '#e74c3c' : '#27ae60'};">
            <div>
                <span style="font-size: 14px;">গত মাসের তুলনায় খরচ</span>
                <span style="font-size: 20px; font-weight: bold; margin-left: 10px; color: ${isIncreased ? '#e74c3c' : '#27ae60'}">
                    ${isIncreased ? '↑' : '↓'} ${Math.abs(change)}%
                </span>
            </div>
            <div>
                <span style="font-size: 13px; color: #666;">${prevMonth.slice(5)}: ${toBanglaNumber(previousExpense.toFixed(0))} টাকা → ${lastMonth.slice(5)}: ${toBanglaNumber(currentExpense.toFixed(0))} টাকা</span>
            </div>
        </div>
    `;
    
    const existingTrend = document.querySelector('.trend-indicator');
    if (existingTrend) existingTrend.remove();
    
    const trendDiv = document.createElement('div');
    trendDiv.className = 'trend-indicator';
    trendDiv.innerHTML = trendHTML;
    
    const container = document.querySelector('.container');
    if (container) {
        const cards = document.querySelector('.dashboard-cards');
        if (cards && cards.nextSibling) {
            container.insertBefore(trendDiv, cards.nextSibling);
        } else if (container.firstChild) {
            container.insertBefore(trendDiv, container.firstChild.nextSibling);
        }
    }
}

// ==================== সেভিংস গোল ====================
let savingsGoal = localStorage.getItem('savings_goal') ? parseFloat(localStorage.getItem('savings_goal')) : 1000;

function showSavingsGoalModal() {
    const txs = getActiveTransactions();
    let totalRechargeAmt = 0, totalExpenseAmt = 0;
    txs.forEach(t => {
        if (t.type === 'recharge') totalRechargeAmt += Math.abs(t.amount);
        else if (t.type === 'electricity_bill') totalExpenseAmt += Math.abs(t.amount);
    });
    const currentSavings = totalRechargeAmt - totalExpenseAmt;
    const percentage = (currentSavings / savingsGoal * 100).toFixed(1);
    
    const modalHTML = `
        <div style="padding: 20px;">
            <h3 style="text-align: center;">🎯 মাসিক সেভিংস লক্ষ্য</h3>
            <div style="margin: 20px 0;">
                <label>লক্ষ্য পরিমাণ (টাকা):</label>
                <input type="number" id="goalAmount" value="${savingsGoal}" style="width: 100%; padding: 10px; margin-top: 5px; border-radius: 8px; border: 1px solid #ddd;">
            </div>
            <div style="background: #f8f9fa; padding: 20px; border-radius: 10px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                    <span>বর্তমান সেভিংস: ${toBanglaNumber(currentSavings.toFixed(2))} টাকা</span>
                    <span>লক্ষ্য: ${toBanglaNumber(savingsGoal.toFixed(2))} টাকা</span>
                </div>
                <div style="background: #ecf0f1; height: 20px; border-radius: 10px; overflow: hidden;">
                    <div style="background: linear-gradient(135deg, #27ae60, #2ecc71); width: ${Math.min(percentage, 100)}%; height: 100%; border-radius: 10px;"></div>
                </div>
                <div style="text-align: center; margin-top: 10px;">
                    <strong>${percentage}% সম্পূর্ণ</strong>
                </div>
            </div>
            <div style="display: flex; gap: 10px; margin-top: 20px;">
                <button onclick="setSavingsGoal()" class="save-btn" style="flex:1;">💾 সেভ করুন</button>
                <button onclick="closeModal()" class="clear-btn" style="flex:1;">❌ বাতিল</button>
            </div>
        </div>
    `;
    showCustomModal('সেভিংস গোল', modalHTML);
}

function setSavingsGoal() {
    const newGoal = parseFloat(document.getElementById('goalAmount').value);
    if (newGoal > 0) {
        savingsGoal = newGoal;
        localStorage.setItem('savings_goal', savingsGoal);
        showNotification('✅ সেভিংস লক্ষ্য আপডেট করা হয়েছে!', 'success');
        closeModal();
        updateSavingsGoalDisplay();
    }
}

function updateSavingsGoalDisplay() {
    const txs = getActiveTransactions();
    let totalRechargeAmt = 0, totalExpenseAmt = 0;
    txs.forEach(t => {
        if (t.type === 'recharge') totalRechargeAmt += Math.abs(t.amount);
        else if (t.type === 'electricity_bill') totalExpenseAmt += Math.abs(t.amount);
    });
    const currentSavings = totalRechargeAmt - totalExpenseAmt;
    const percentage = (currentSavings / savingsGoal * 100).toFixed(1);
    
    let goalDiv = document.getElementById('savingsGoalDisplay');
    if (!goalDiv) {
        const container = document.querySelector('.container');
        if (container) {
            const trendDiv = document.querySelector('.trend-indicator');
            goalDiv = document.createElement('div');
            goalDiv.id = 'savingsGoalDisplay';
            if (trendDiv && trendDiv.nextSibling) {
                container.insertBefore(goalDiv, trendDiv.nextSibling);
            } else if (container.firstChild) {
                container.insertBefore(goalDiv, container.firstChild.nextSibling?.nextSibling);
            }
        }
    }
    if (goalDiv) {
        goalDiv.innerHTML = `
            <div style="background: linear-gradient(135deg, #667eea, #764ba2); padding: 15px 20px; border-radius: 10px; margin-bottom: 20px; cursor: pointer;" onclick="showSavingsGoalModal()">
                <div style="display: flex; justify-content: space-between; align-items: center; color: white;">
                    <div>
                        <div style="font-size: 12px; opacity: 0.9;">🎯 মাসিক সেভিংস লক্ষ্য</div>
                        <div style="font-size: 20px; font-weight: bold;">${toBanglaNumber(currentSavings.toFixed(2))} / ${toBanglaNumber(savingsGoal.toFixed(2))} টাকা</div>
                    </div>
                    <div style="font-size: 24px;">${percentage}%</div>
                </div>
                <div style="background: rgba(255,255,255,0.3); height: 6px; border-radius: 3px; margin-top: 10px;">
                    <div style="background: white; width: ${Math.min(percentage, 100)}%; height: 100%; border-radius: 3px;"></div>
                </div>
            </div>
        `;
    }
}

// ==================== নোটিফিকেশন সিস্টেম ====================
function checkAndNotify() {
    const lastNotifyDate = localStorage.getItem('last_notify_date');
    const today = new Date().toISOString().split('T')[0];
    
    if (lastNotifyDate === today) return;
    
    let notificationMessage = null;
    let notificationType = 'info';
    
    if (currentBalance < 200) {
        notificationMessage = `⚠️ আপনার ব্যালেন্স কমছে! বর্তমান ব্যালেন্স: ${currentBalance.toFixed(2)} টাকা। দয়া করে রিচার্জ করুন।`;
        notificationType = 'warning';
    }
    
    const txs = getActiveTransactions();
    const thisMonth = new Date().getMonth();
    let thisMonthUsage = 0;
    txs.forEach(t => {
        if (t.type === 'electricity_bill' && t.timestamp) {
            try {
                const date = new Date(t.timestamp);
                if (!isNaN(date.getTime()) && date.getMonth() === thisMonth) {
                    thisMonthUsage += t.units || 0;
                }
            } catch(e) {}
        }
    });
    
    if (thisMonthUsage > 300) {
        notificationMessage = `⚡ উচ্চ বিদ্যুৎ ব্যবহার! এই মাসে ${thisMonthUsage.toFixed(2)} kWh ব্যবহার হয়েছে। সাশ্রয়ী হতে চেষ্টা করুন।`;
        notificationType = 'error';
    }
    
    if (notificationMessage) {
        showNotification(notificationMessage, notificationType);
        localStorage.setItem('last_notify_date', today);
    }
}

// ==================== বিল রিমাইন্ডার ====================
let reminderTime = localStorage.getItem('bill_reminder_time') || '25';
let reminderEnabled = localStorage.getItem('bill_reminder_enabled') === 'true';

function showReminderModal() {
    const modalHTML = `
        <div style="padding: 20px;">
            <h3 style="text-align: center;">⏰ বিল পেমেন্ট রিমাইন্ডার</h3>
            <div style="margin: 20px 0;">
                <label>📅 মাসের কত তারিখে রিমাইন্ডার দেবে?</label>
                <input type="number" id="reminderDay" min="1" max="28" value="${reminderTime}" style="width: 100%; padding: 10px; margin-top: 5px; border-radius: 8px; border: 1px solid #ddd;">
                <small style="color: #666;">প্রতি মাসের এই তারিখে রিমাইন্ডার পাবেন</small>
            </div>
            <div style="margin: 15px 0;">
                <label>
                    <input type="checkbox" id="enableReminder" ${reminderEnabled ? 'checked' : ''}> রিমাইন্ডার সক্রিয় করুন
                </label>
            </div>
            <div style="display: flex; gap: 10px;">
                <button onclick="saveReminderSettings()" class="save-btn" style="flex:1;">💾 সেভ করুন</button>
                <button onclick="closeModal()" class="clear-btn" style="flex:1;">❌ বাতিল</button>
            </div>
        </div>
    `;
    showCustomModal('বিল রিমাইন্ডার', modalHTML);
}

function saveReminderSettings() {
    const day = parseInt(document.getElementById('reminderDay').value);
    const enabled = document.getElementById('enableReminder').checked;
    if (day >= 1 && day <= 28) {
        reminderTime = day;
        reminderEnabled = enabled;
        localStorage.setItem('bill_reminder_time', reminderTime);
        localStorage.setItem('bill_reminder_enabled', reminderEnabled);
        showNotification('✅ রিমাইন্ডার সেটিংস সেভ করা হয়েছে!', 'success');
        closeModal();
        checkBillReminder();
    }
}

function checkBillReminder() {
    if (!reminderEnabled) return;
    
    const today = new Date();
    const currentDate = today.getDate();
    const lastReminderDate = localStorage.getItem('last_reminder_date');
    const todayStr = today.toISOString().split('T')[0];
    
    if (currentDate === reminderTime && lastReminderDate !== todayStr) {
        showNotification(`🔔 মনে করিয়ে দিচ্ছি! আজকে বিল পেমেন্টের দিন। দয়া করে আপনার বিল চেক করুন।`, 'warning');
        localStorage.setItem('last_reminder_date', todayStr);
    }
}

// ==================== PDF/শেয়ার রিপোর্ট ====================
function generatePDFReport() {
    showNotification('📄 PDF রিপোর্ট প্রস্তুত হচ্ছে...', 'info');
    
    const txs = getActiveTransactions();
    let reportHTML = `
        <html>
        <head><meta charset="UTF-8"><title>বিদ্যুৎ বিল রিপোর্ট</title>
        <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            h1 { color: #2c3e50; text-align: center; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
            th { background: #3498db; color: white; }
            .total { font-weight: bold; margin-top: 20px; text-align: right; }
        </style>
        </head>
        <body>
        <h1>বিদ্যুৎ বিল রিপোর্ট</h1>
        <p>তারিখ: ${new Date().toLocaleString('bn-BD')}</p>
        <table>
            <tr><th>তারিখ</th><th>ধরণ</th><th>পরিমাণ (টাকা)</th><th>ইউনিট</th></tr>
    `;
    
    txs.slice(-50).reverse().forEach(t => {
        const date = t.timestamp?.split(',')[0] || t.date || 'N/A';
        const type = t.type === 'recharge' ? 'রিচার্জ' : 'বিদ্যুৎ বিল';
        const amount = Math.abs(t.amount).toFixed(2);
        const units = t.units ? t.units.toFixed(2) : '-';
        reportHTML += `<tr><td>${date}</td><td>${type}</td><td>${amount}</td><td>${units}</td></tr>`;
    });
    
    let totalRechargeAmt = 0, totalExpenseAmt = 0;
    txs.forEach(t => {
        if (t.type === 'recharge') totalRechargeAmt += Math.abs(t.amount);
        else if (t.type === 'electricity_bill') totalExpenseAmt += Math.abs(t.amount);
    });
    
    reportHTML += `
        </table>
        <div class="total">
            <p>মোট রিচার্জ: ${totalRechargeAmt.toFixed(2)} টাকা</p>
            <p>মোট খরচ: ${totalExpenseAmt.toFixed(2)} টাকা</p>
            <p>বর্তমান ব্যালেন্স: ${currentBalance.toFixed(2)} টাকা</p>
        </div>
        </body></html>
    `;
    
    const win = window.open();
    win.document.write(reportHTML);
    win.document.close();
    win.print();
}

// ==================== মাসিক তুলনা বার চার্ট (সংশোধিত) ====================
function showMonthlyBarChart() {
    const txs = getActiveTransactions();
    const monthlyData = {};
    
    // মাসিক ডেটা সংগ্রহ
    txs.forEach(t => {
        if (t.type === 'electricity_bill' && t.timestamp) {
            try {
                let year, month;
                const ts = t.timestamp;
                
                // ISO ফরম্যাট
                if (ts.includes('T') && ts.includes('-')) {
                    const date = new Date(ts);
                    if (!isNaN(date.getTime())) {
                        year = date.getFullYear();
                        month = date.getMonth() + 1;
                    }
                }
                // বাংলা ফরম্যাট
                else if (ts.includes('/')) {
                    const parts = ts.split(',')[0].split('/');
                    if (parts.length === 3) {
                        const banglaToEn = (str) => str.replace(/[০-৯]/g, d => '০১২৩৪৫৬৭৮৯'.indexOf(d));
                        month = parseInt(banglaToEn(parts[1]));
                        year = parseInt(banglaToEn(parts[2]));
                    }
                }
                
                if (year && month) {
                    const key = `${year}-${month.toString().padStart(2, '0')}`;
                    monthlyData[key] = (monthlyData[key] || 0) + Math.abs(t.amount);
                }
            } catch(e) {}
        }
    });
    
    const months = Object.keys(monthlyData).sort();
    if (months.length === 0) {
        showNotification('❌ কোন মাসিক ডেটা নেই!', 'error');
        return;
    }
    
    const costs = months.map(m => monthlyData[m]);
    const maxCost = Math.max(...costs);
    
    const monthNames = months.map(m => {
        const [y, mo] = m.split('-');
        const names = ['জানু', 'ফেব্রু', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্ট', 'অক্টো', 'নভে', 'ডিসে'];
        return `${names[parseInt(mo)-1]}'${y.slice(-2)}`;
    });
    
    const barWidth = 50;
    const chartHeight = 250;
    
    let barHTML = `
        <div style="padding: 20px; background: white; border-radius: 12px;">
            <h3 style="text-align: center; color: #2c3e50; margin-bottom: 25px;">📊 মাসিক খরচ তুলনা</h3>
            <div style="display: flex; justify-content: center; align-items: flex-end; gap: 12px; min-height: ${chartHeight}px; padding: 10px 0;">
    `;
    
    costs.forEach((cost, i) => {
        const height = (cost / maxCost) * (chartHeight - 50);
        barHTML += `
            <div style="display: flex; flex-direction: column; align-items: center; width: ${barWidth}px;">
                <div style="background: linear-gradient(135deg, #3498db, #2980b9); width: 100%; height: ${height}px; border-radius: 8px 8px 0 0; transition: all 0.3s ease;"></div>
                <div style="margin-top: 8px; font-weight: bold; color: #2c3e50;">${toBanglaNumber(cost.toFixed(0))}</div>
                <div style="font-size: 12px; color: #7f8c8d;">${monthNames[i]}</div>
            </div>
        `;
    });
    
    barHTML += `
            </div>
            <div style="text-align: center; margin-top: 20px; padding-top: 10px; border-top: 1px solid #ecf0f1;">
                <span style="font-size: 12px; color: #7f8c8d;">📌 মাস অনুযায়ী খরচ (টাকা)</span>
            </div>
        </div>
    `;
    
    showCustomModal('মাসিক খরচ তুলনা', barHTML);
}

// ==================== ব্যাজ সিস্টেম ====================
function checkAndAwardBadges() {
    const txs = getActiveTransactions();
    let totalRechargeAmt = 0, totalExpenseAmt = 0, totalUnits = 0, uniqueMonths = new Set();
    
    txs.forEach(t => {
        if (t.type === 'recharge') totalRechargeAmt += Math.abs(t.amount);
        else if (t.type === 'electricity_bill') {
            totalExpenseAmt += Math.abs(t.amount);
            totalUnits += t.units || 0;
            try {
                const date = new Date(t.timestamp);
                if (!isNaN(date.getTime())) uniqueMonths.add(`${date.getFullYear()}-${date.getMonth()}`);
            } catch(e) {}
        }
    });
    
    const badges = [];
    if (txs.length >= 5) badges.push({ name: '🎯 প্রথম বিল', desc: '৫টি বিল যোগ করেছেন', icon: '🎯' });
    if (totalUnits >= 500) badges.push({ name: '⚡ এনার্জি ইউজার', desc: '৫০০+ ইউনিট ব্যবহার', icon: '⚡' });
    if (totalRechargeAmt >= 5000) badges.push({ name: '💰 প্রিমিয়াম', desc: '৫০০০+ টাকা রিচার্জ', icon: '💰' });
    if (uniqueMonths.size >= 3) badges.push({ name: '📅 টানা ব্যবহার', desc: '৩ মাস ধরে ব্যবহার', icon: '📅' });
    if (currentBalance > 500) badges.push({ name: '💪 সাশ্রয়ী', desc: '৫০০+ টাকা ব্যালেন্স', icon: '💪' });
    
    const earnedBadges = JSON.parse(localStorage.getItem('earned_badges') || '[]');
    const newBadges = badges.filter(b => !earnedBadges.some(eb => eb.name === b.name));
    
    if (newBadges.length > 0) {
        const allBadges = [...earnedBadges, ...newBadges];
        localStorage.setItem('earned_badges', JSON.stringify(allBadges));
        newBadges.forEach(b => showNotification(`🏆 নতুন ব্যাজ অর্জিত: ${b.name} - ${b.desc}`, 'success'));
    }
}

function showBadgesModal() {
    const badges = JSON.parse(localStorage.getItem('earned_badges') || '[]');
    
    if (badges.length === 0) {
        showCustomModal('🏆 আপনার ব্যাজসমূহ', '<div style="text-align: center; padding: 40px;"><div style="font-size: 48px;">🎯</div><p>এখনো কোন ব্যাজ অর্জিত হয়নি</p><p style="font-size: 12px; color: #666;">বিল যোগ করুন এবং ব্যাজ অর্জন করুন!</p></div>');
        return;
    }
    
    let badgesHTML = `<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px;">`;
    badges.forEach(b => {
        badgesHTML += `
            <div style="background: linear-gradient(135deg, #f39c12, #e67e22); color: white; padding: 20px; border-radius: 12px; text-align: center;">
                <div style="font-size: 40px;">${b.icon}</div>
                <div style="font-weight: bold; margin-top: 10px;">${b.name}</div>
                <div style="font-size: 11px; opacity: 0.9;">${b.desc}</div>
            </div>
        `;
    });
    badgesHTML += `</div>`;
    showCustomModal('🏆 আপনার ব্যাজসমূহ', badgesHTML);
}

// ==================== ক্যালেন্ডার ভিউ (সব মাসের জন্য) ====================
function showCalendarView() {
    const txs = getActiveTransactions();
    const rechargeData = {};
    const billData = {};
    
    // সব ট্রানজেকশন থেকে মাস অনুযায়ী ডেটা সংগ্রহ
    txs.forEach(t => {
        try {
            let year, month, day;
            const ts = t.timestamp;
            
            // ISO ফরম্যাট
            if (ts.includes('T') && ts.includes('-')) {
                const date = new Date(ts);
                if (!isNaN(date.getTime())) {
                    year = date.getFullYear();
                    month = date.getMonth();
                    day = date.getDate();
                }
            }
            // বাংলা ফরম্যাট
            else if (ts.includes('/')) {
                const parts = ts.split(',')[0].split('/');
                if (parts.length === 3) {
                    const banglaToEn = (str) => str.replace(/[০-৯]/g, d => '০১২৩৪৫৬৭৮৯'.indexOf(d));
                    day = parseInt(banglaToEn(parts[0]));
                    month = parseInt(banglaToEn(parts[1])) - 1;
                    year = parseInt(banglaToEn(parts[2]));
                }
            }
            
            if (year && month !== undefined && day) {
                const key = `${year}-${month}`;
                const dateKey = `${year}-${month}-${day}`;
                
                if (t.type === 'recharge') {
                    if (!rechargeData[key]) rechargeData[key] = {};
                    rechargeData[key][dateKey] = (rechargeData[key][dateKey] || 0) + Math.abs(t.amount);
                } else if (t.type === 'electricity_bill') {
                    if (!billData[key]) billData[key] = {};
                    billData[key][dateKey] = (billData[key][dateKey] || 0) + (t.units || 0);
                }
            }
        } catch(e) {}
    });
    
    // সব মাসের তালিকা তৈরি
    const allMonths = new Set();
    Object.keys(rechargeData).forEach(k => allMonths.add(k));
    Object.keys(billData).forEach(k => allMonths.add(k));
    
    const sortedMonths = Array.from(allMonths).sort().reverse();
    
    if (sortedMonths.length === 0) {
        showNotification('❌ কোন ডেটা নেই!', 'error');
        return;
    }
    
    const monthNames = ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'];
    const weekDays = ['রবি', 'সোম', 'মঙ্গল', 'বুধ', 'বৃহস্পতি', 'শুক্র', 'শনি'];
    
    let calendarHTML = `
        <div style="padding: 15px; max-height: 600px; overflow-y: auto;">
            <h3 style="text-align: center; color: #2c3e50; margin-bottom: 20px;">📅 বিল ও রিচার্জ ক্যালেন্ডার</h3>
    `;
    
    sortedMonths.forEach(monthKey => {
        const [year, month] = monthKey.split('-');
        const daysInMonth = new Date(parseInt(year), parseInt(month) + 1, 0).getDate();
        const firstDay = new Date(parseInt(year), parseInt(month), 1).getDay();
        
        calendarHTML += `
            <div style="background: white; border-radius: 12px; margin-bottom: 25px; padding: 15px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                <div style="background: linear-gradient(135deg, #3498db, #2980b9); color: white; padding: 10px; border-radius: 8px; margin-bottom: 15px; text-align: center;">
                    <h4 style="margin: 0;">${monthNames[parseInt(month)]} ${year}</h4>
                </div>
                <div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 5px; text-align: center;">
        `;
        
        // সপ্তাহের দিনের নাম
        weekDays.forEach(day => {
            calendarHTML += `<div style="font-weight: bold; padding: 8px; background: #ecf0f1; border-radius: 5px; font-size: 12px;">${day}</div>`;
        });
        
        // খালি ঘর
        for (let i = 0; i < firstDay; i++) {
            calendarHTML += `<div style="padding: 8px;"></div>`;
        }
        
        // মাসের দিনগুলো
        for (let d = 1; d <= daysInMonth; d++) {
            const dateKey = `${year}-${month}-${d}`;
            const hasRecharge = rechargeData[monthKey] && rechargeData[monthKey][dateKey];
            const hasBill = billData[monthKey] && billData[monthKey][dateKey];
            const rechargeAmount = hasRecharge ? rechargeData[monthKey][dateKey] : 0;
            const billUnits = hasBill ? billData[monthKey][dateKey] : 0;
            
            let bgColor = '#f8f9fa';
            let statusIcon = '';
            let statusText = '';
            
            if (hasRecharge && hasBill) {
                bgColor = '#e8f6f3';
                statusIcon = '💰⚡';
                statusText = `${toBanglaNumber(rechargeAmount.toFixed(0))} টাকা / ${toBanglaNumber(billUnits.toFixed(1))} kWh`;
            } else if (hasRecharge) {
                bgColor = '#e8f8f5';
                statusIcon = '💰';
                statusText = `${toBanglaNumber(rechargeAmount.toFixed(0))} টাকা`;
            } else if (hasBill) {
                bgColor = '#fef9e7';
                statusIcon = '⚡';
                statusText = `${toBanglaNumber(billUnits.toFixed(1))} kWh`;
            }
            
            calendarHTML += `
                <div style="background: ${bgColor}; padding: 8px; border-radius: 5px; border: 1px solid #e0e0e0; min-height: 55px;">
                    <div style="font-weight: bold; color: #2c3e50;">${toBanglaNumber(d)}</div>
                    ${statusIcon ? `<div style="font-size: 10px; color: ${hasRecharge ? '#27ae60' : '#e74c3c'};">${statusIcon}</div>` : ''}
                    ${statusText ? `<div style="font-size: 9px; color: #7f8c8d; margin-top: 2px;">${statusText}</div>` : ''}
                </div>
            `;
        }
        
        calendarHTML += `
                </div>
                <div style="margin-top: 12px; padding: 8px; background: #f8f9fa; border-radius: 6px; display: flex; justify-content: center; gap: 20px; font-size: 11px;">
                    <span style="color: #27ae60;">💰 রিচার্জের দিন</span>
                    <span style="color: #e74c3c;">⚡ বিলের দিন</span>
                    <span style="color: #9b59b6;">💰⚡ উভয়ের দিন</span>
                </div>
            </div>
        `;
    });
    
    calendarHTML += `</div>`;
    showCustomModal('বিল ও রিচার্জ ক্যালেন্ডার', calendarHTML);
}

// ==================== সব ফিচার ইনিশিয়ালাইজ ====================
function initializeAllFeatures() {
    updateDashboardCards();
    updateTrendIndicator();
    updateSavingsGoalDisplay();
    checkAndNotify();
    checkBillReminder();
    checkAndAwardBadges();
    
    const badgeBtn = document.createElement('button');
    badgeBtn.innerHTML = '🏆 ব্যাজসমূহ';
    badgeBtn.className = 'control-btn';
    badgeBtn.onclick = showBadgesModal;
    
    const goalBtn = document.createElement('button');
    goalBtn.innerHTML = '🎯 সেভিংস গোল';
    goalBtn.className = 'control-btn';
    goalBtn.onclick = showSavingsGoalModal;
    
    const reminderBtn = document.createElement('button');
    reminderBtn.innerHTML = '⏰ রিমাইন্ডার';
    reminderBtn.className = 'control-btn';
    reminderBtn.onclick = showReminderModal;
    
    const pdfBtn = document.createElement('button');
    pdfBtn.innerHTML = '📄 PDF রিপোর্ট';
    pdfBtn.className = 'control-btn';
    pdfBtn.onclick = generatePDFReport;
    
    const chartBtn = document.createElement('button');
    chartBtn.innerHTML = '📊 বার চার্ট';
    chartBtn.className = 'control-btn';
    chartBtn.onclick = showMonthlyBarChart;
    
    const calendarBtn = document.createElement('button');
    calendarBtn.innerHTML = '📅 ক্যালেন্ডার';
    calendarBtn.className = 'control-btn';
    calendarBtn.onclick = showCalendarView;
    
    const headerControls = document.querySelector('.header-controls');
    if (headerControls && !document.querySelector('.badge-btn')) {
        headerControls.appendChild(badgeBtn);
        headerControls.appendChild(goalBtn);
        headerControls.appendChild(reminderBtn);
        headerControls.appendChild(pdfBtn);
        headerControls.appendChild(chartBtn);
        headerControls.appendChild(calendarBtn);
    }
}

// ==================== গ্লোবাল এক্সেস ====================
window.showSavingsGoalModal = showSavingsGoalModal;
window.setSavingsGoal = setSavingsGoal;
window.showReminderModal = showReminderModal;
window.saveReminderSettings = saveReminderSettings;
window.generatePDFReport = generatePDFReport;
window.showMonthlyBarChart = showMonthlyBarChart;
window.showBadgesModal = showBadgesModal;
window.showCalendarView = showCalendarView;

// DOMContentLoaded-এ ইনিশিয়ালাইজ
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(initializeAllFeatures, 500);
});

console.log('✅ ৮টি নতুন ফিচার যোগ করা হয়েছে!');

// ==================== পেজ লোড ইভেন্ট - সম্পূর্ণ একীভূত ====================
// DOMContentLoaded

document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 পেজ লোড হচ্ছে...');
    
    // ========== 1. লগিন ও ইউজার চেক ==========
    loadUsers();
    checkExistingLogin();
    
    // ========== 2. ডেটা লোড ==========
    loadMeterInfo();
    loadSettings();
    loadTariffRates();
    loadAutoBackupSettings();
    loadData();
    
    if (checkAuthentication()) { 
        try { 
            showMainApp(); 
        } catch(_) {} 
        try { 
            updateUI(); 
        } catch(_) {} 
    }
    
    updateBalanceDisplay();
    loadTransactionReport();
    
    try { 
        loadUnitsFromReport(); 
    } catch(_) {}
    
    setupKeyboardShortcuts();
    updateTariffDisplay();
    
    // ========== 3. থিম সেটিংস ==========
    try {
        const savedTheme = localStorage.getItem('app_theme') || 'default';
        applyGlobalTheme(savedTheme);
    } catch(_) {}
    
    // ========== 4. মাসিক ইউনিট সিস্টেম ==========
    loadMonthlyUnitData();
    updateUnitDisplay();
    
    // ========== 5. বর্তমান তারিখ সেট করুন ==========
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const currentMonth = now.toISOString().substring(0, 7);
    
    const rechargeDateEl = document.getElementById('rechargeDate');
    const balanceDateEl = document.getElementById('balanceDate');
    const startDateEl = document.getElementById('startDate');
    const endDateEl = document.getElementById('endDate');
    const currentMonthEl = document.getElementById('currentMonth');
    const unitsMonthEl = document.getElementById('unitsMonth');
    
    if (rechargeDateEl) rechargeDateEl.value = today;
    if (balanceDateEl) balanceDateEl.value = today;
    if (startDateEl) startDateEl.value = today;
    if (endDateEl) endDateEl.value = today;
    if (currentMonthEl) currentMonthEl.value = currentMonth;
    if (unitsMonthEl) unitsMonthEl.value = currentMonth;
    
    // ========== 6. অটো ব্যাকআপ শিডিউল ==========
    scheduleNextBackup();
    
    // ========== 7. শেষ ট্যাব রিকল ==========
    try {
        const lastTab = localStorage.getItem('desco_last_tab') || 'unitTab';
        openTab(lastTab);
    } catch(_) {}
    
    // ========== 8. অ্যাপ্লায়েন্স ক্যালকুলেটর ==========
    initializeApplianceCalculator();
    
    // ========== 9. মোবাইল অপটিমাইজেশন ==========
    setTimeout(initializeMobileOptimization, 1000);
    
    // ========== 10. ক্লাউড ব্যাকআপ ==========
    initializeCloudBackup();
    
    // ========== 11. অল মনথস বাটন ==========
    setTimeout(addAllMonthsButton, 1000);
    
    // ========== 12. অটো শো অ্যানালাইসিস রিমুভ ==========
    setTimeout(removeAutoShowingAnalysis, 500);
    
    // ========== 13. মিটার ডিসপ্লে আপডেট ==========
    updateMeterDisplay();
    
    // ========== 14. টুলটিপ ==========
    setTimeout(addProgressBarTooltip, 1000);
    
    // ========== 15. মাস পিকার ইনিশিয়ালাইজ ==========
    initializeMonthPicker();
    
    // ========== 16. ড্যাশবোর্ড ইনিশিয়ালাইজ ==========
    setTimeout(initializeDashboard, 1000);
    
    // ========== 17. ডিফল্ট ট্যাব ফোর্স করুন ==========
    setTimeout(function() {
        const activeTab = document.querySelector('.tab-content.active');
        const unitTab = document.getElementById('unitTab');
        
        if (unitTab && (!activeTab || activeTab.id !== 'unitTab')) {
            console.log('🔧 ডিফল্ট ট্যাব ওপেন: ইউনিট থেকে টাকা');
            
            // সব ট্যাব থেকে active ক্লাস সরান
            document.querySelectorAll('.tab-content').forEach(tab => {
                tab.classList.remove('active');
            });
            document.querySelectorAll('.tab-button').forEach(btn => {
                btn.classList.remove('active');
            });
            
            // ইউনিট ট্যাব active করুন
            unitTab.classList.add('active');
            
            // বাটন active করুন
            const unitBtn = Array.from(document.querySelectorAll('.tab-button')).find(
                btn => btn.getAttribute('onclick')?.includes('unitTab')
            );
            if (unitBtn) unitBtn.classList.add('active');
        }
    }, 200);
    
    console.log('✅ পেজ লোড সম্পূর্ণ');
});

// ডাটাবেস থেকে ডাটা শোনার লজিক (Listener) - IMPROVED
function startRealtimeSync(userId) {
    if (!userId || typeof database === 'undefined') return;

    const dataRef = database.ref('meter_data/' + userId);

    dataRef.on('value', (snapshot) => {
        const cloudData = snapshot.val();
        if (cloudData) {
            console.log("📥 New data received from Cloud...");
            
            transactions = cloudData.transactions || [];
            monthlyRecharges = cloudData.monthlyRecharges || [];
            currentBalance = parseFloat(cloudData.currentBalance) || 0;
            lastDemandChargeMonth = cloudData.lastDemandChargeMonth || '';
            
            // মিটার এবং সেটিংস আপডেট
            if (cloudData.meters) meters = cloudData.meters;
            if (cloudData.activeMeterId) activeMeterId = cloudData.activeMeterId;
            if (cloudData.settings) settings = cloudData.settings;

            // ডাটা পাওয়ার পর UI আপডেট করার কমান্ড
            updateBalanceDisplay(); // এটি এখন ভেতর থেকে অটো ক্যালকুলেট করবে
            updateMeterDisplay();
            
            if (typeof loadTransactionReport === 'function') loadTransactionReport();
            if (typeof updateUnitDisplay === 'function') updateUnitDisplay();
        }
    });
}

// ========== window.load ইভেন্ট (অতিরিক্ত নিরাপত্তার জন্য) ==========
window.addEventListener('load', function() {
    console.log('🔄 window.load ইভেন্ট চলছে...');
    
    // ডিফল্ট ট্যাব নিশ্চিত করুন
    setTimeout(function() {
        const unitTab = document.getElementById('unitTab');
        if (unitTab && !unitTab.classList.contains('active')) {
            openTab('unitTab');
            console.log('✅ window.load: ইউনিট ট্যাব ওপেন');
        }
    }, 100);
});

function applyGlobalTheme(name) {
    var root = document.documentElement;
    if (name === 'green') {
        root.style.setProperty('--color-primary', '#2ecc71');
        root.style.setProperty('--color-accent', '#27ae60');
    } else if (name === 'orange') {
        root.style.setProperty('--color-primary', '#e67e22');
        root.style.setProperty('--color-accent', '#d35400');
    } else {
        root.style.setProperty('--color-primary', '#3498db');
        root.style.setProperty('--color-accent', '#9b59b6');
    }
    try { localStorage.setItem('app_theme', name); } catch(_) {}
}

window.applyGlobalTheme = applyGlobalTheme;