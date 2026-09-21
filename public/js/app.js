
// ✅ مسجّل أخطاء عام: يطبع بدقة أي خطأ JS غير متوقع مع رقم السطر بدل توقف الصفحة بصمت
window.addEventListener('error', (event) => {
    console.error(`🔴 [GLOBAL JS ERROR] ${event.message} — الملف: ${event.filename}:${event.lineno}:${event.colno}`);
});
window.addEventListener('unhandledrejection', (event) => {
    console.error('🔴 [UNHANDLED PROMISE REJECTION]', event.reason);
});

// 🛡️ ترميز صارم لكل نص يتحكم به المستخدم قبل حقنه في innerHTML.
// يُرمّز أيضاً " و ' لحمايته داخل قيم خصائص HTML (مثل value="...").
function escapeHtml(unsafe) {
    if (unsafe === null || unsafe === undefined) return '';
    return String(unsafe)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// =================================================
// ✅ زر الرجوع بالهاتف يُغلق آخر نافذة مفتوحة بدل مغادرة الصفحة
// =================================================
(function setupBackButtonModalStack() {
    let modalDepth = 0;

    function isModalNode(node) {
        if (!(node instanceof HTMLElement)) return false;
        return /-modal$/.test(node.id) || node.classList.contains('modal-backdrop') || node.classList.contains('modal-overlay');
    }

    function pushHistoryState() {
        modalDepth++;
        history.pushState({ modalDepth }, '');
    }

    const observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
            m.addedNodes.forEach(node => { if (isModalNode(node)) pushHistoryState(); });
        }
    });

    document.addEventListener('DOMContentLoaded', () => {
        observer.observe(document.body, { childList: true });
        const gc = document.getElementById('game-container');
        if (gc) observer.observe(gc, { childList: true });
    });

    window.addEventListener('popstate', () => {
        if (modalDepth > 0) {
            modalDepth--;
            const openModals = document.querySelectorAll('[id$="-modal"], .modal-overlay.active');
            const last = openModals[openModals.length - 1];
            if (last) last.remove();
        }
    });
})();


// --- دوال مساعدة لنظام اللفلات ---
const calculateRequiredXp = (level) => {
    return level * 1500;
};
 
// دالة لإنشاء HTML الخاص بشريط التقدم
const createLevelProgressHTML = (user) => {
    const requiredXp = calculateRequiredXp(user.level);
    const progressPercentage = (user.experience / requiredXp) * 100;

    return `
        <div class="mt-4" id="level-container">
            <div class="flex justify-between items-center text-xs mb-1">
                <span class="font-bold text-yellow-400">LVL ${user.level}</span>
                <span class="text-gray-400">${Math.floor(user.experience)} / ${requiredXp} XP</span>
            </div>
            <div class="w-full bg-gray-700 rounded-full h-2.5">
                <div id="xp-bar" class="bg-yellow-400 h-2.5 rounded-full" style="width: ${progressPercentage}%"></div>
            </div>
            <div id="level-perks-container" class="mt-2 text-center">
                <button id="perks-toggle-btn" class="text-xs text-purple-400 hover:underline">
                    مميزات المستوى التالي <i class="fas fa-chevron-down text-xs ml-1"></i>
                </button>
                <div id="perks-list" class="hidden text-left bg-gray-800/50 p-2 rounded-md mt-1 text-xs space-y-1">
                    <p><i class="fas fa-check-circle text-green-400 mr-1"></i> ميزة 1 (مثال)</p>
                    <p><i class="fas fa-check-circle text-green-400 mr-1"></i> ميزة 2 (مثال)</p>
                </div>
            </div>
        </div>
    `;
};



    document.addEventListener('DOMContentLoaded', () => {
    let token = localStorage.getItem('token');  // تغيير const إلى let
    const user = JSON.parse(localStorage.getItem('user'));
    const myUserId = user ? user._id : null; // ✅ يُستخدم لتمييز "مقعدي أنا" بغرفة الصوت
    const loadingScreen = document.getElementById('loading-screen');
    const appContainer = document.getElementById('app-container');


// ============================================
// CSS ديناميكي للدردشة الخاصة
// ============================================
const chatStyles = `
    /* أنيميشن للرسائل الجديدة */
    @keyframes messageSlideIn {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
    }
    
    .new-message {
        animation: messageSlideIn 0.3s ease-out;
    }
    
    /* تخصيص scrollbar للدردشة */
    #private-chat-messages::-webkit-scrollbar {
        width: 6px;
    }
    
    #private-chat-messages::-webkit-scrollbar-track {
        background: rgba(255, 255, 255, 0.05);
        border-radius: 10px;
    }
    
    #private-chat-messages::-webkit-scrollbar-thumb {
        background: rgba(139, 92, 246, 0.5);
        border-radius: 10px;
    }
    
    /* تأثيرات الأزرار */
    .chat-action-btn {
        padding: 0.5rem;
        border-radius: 9999px;
        transition: background-color 0.2s;
    }
    
    .chat-action-btn:hover {
        background-color: #374151;
    }
    
    .chat-media-btn {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 0.75rem;
        border-radius: 0.75rem;
        transition: all 0.2s;
        transform: scale(1);
    }
    
    .chat-media-btn:hover {
        background-color: rgba(55, 65, 81, 0.5);
        transform: scale(1.05);
    }
    
    /* مؤشر التسجيل الصوتي */
    @keyframes pulseRecording {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
    }
    
    .recording-active {
        animation: pulseRecording 1s infinite;
        background-color: #dc2626 !important;
    }
/* =========================================== */
/* أنيميشن وستايلات للتسجيل الصوتي الجديد */
/* =========================================== */

/* مؤشر التسجيل النابض */
@keyframes recordingPulse {
    0% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.7; transform: scale(1.1); }
    100% { opacity: 1; transform: scale(1); }
}

.animate-pulse {
    animation: recordingPulse 1s infinite;
}

/* واجهة التسجيل */
#voice-recording-ui {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    border: 2px solid #4f46e5; /* purple-600 */
    transition: all 0.3s ease;
}

#voice-recording-ui:hover {
    border-color: #7c3aed; /* purple-700 */
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.4);
}

/* زر الإلغاء */
#cancel-recording {
    transition: all 0.2s ease;
    padding: 8px;
    border-radius: 50%;
}

#cancel-recording:hover {
    background-color: rgba(220, 38, 38, 0.2); /* red-600 with opacity */
    transform: scale(1.1);
}

/* رسائل السحب */
#slide-hint {
    animation: fadeInOut 2s infinite alternate;
}

@keyframes fadeInOut {
    0% { opacity: 0.5; }
    100% { opacity: 1; }
}

/* زر الإرسال الديناميكي */
.dynamic-send-btn {
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.dynamic-send-btn:hover {
    transform: scale(1.05);
    box-shadow: 0 4px 12px rgba(124, 58, 237, 0.4);
}

/* حالة الزر عند التسجيل */
.dynamic-send-btn[data-mode="voice"]:active {
    transform: scale(0.95);
    background-color: #dc2626; /* red-600 */
}

.dynamic-send-btn[data-mode="text"]:active {
    transform: scale(0.95);
    background-color: #7c3aed; /* purple-700 */
}

/* زر الإرسال المعطل */
#send-private-message:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    background-color: #6b7280 !important; /* gray-500 */
}

/* مؤشر التحميل */
.uploading-indicator {
    animation: pulse 1.5s infinite;
}

@keyframes pulse {
    0% { opacity: 0.6; }
    50% { opacity: 1; }
    100% { opacity: 0.6; }
}

/* زر إعادة المحاولة */
.retry-voice-btn {
    transition: all 0.2s ease;
}

.retry-voice-btn:hover {
    transform: scale(1.05);
    background-color: rgba(59, 130, 246, 0.2); /* blue-500 with opacity */
}
    
`;

// إضافة الـ styles إلى الـ head مرة واحدة
document.addEventListener('DOMContentLoaded', () => {
    if (!document.querySelector('#chat-styles')) {
        const styleEl = document.createElement('style');
        styleEl.id = 'chat-styles';
        styleEl.textContent = chatStyles;
        document.head.appendChild(styleEl);
    }
});



        
// ⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐
// 📍 أضف هذه الدالة هنا (دالة عامة)
// ⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐

async function performMiniProfileAction(modalElement, action, userId, miniProfileActionBtn = null) {
    let url = '';
    let method = 'POST';
    let successMessage = '';
    let icon = 'fa-check-circle';
    let color = 'bg-green-500';

    // إذا كان هناك زر، حفظ حالته الأصلية
    let originalButtonHTML = '';
    if (miniProfileActionBtn) {
        originalButtonHTML = miniProfileActionBtn.innerHTML;
        miniProfileActionBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i>`;
        miniProfileActionBtn.disabled = true;
    }

    switch (action) {
        case 'send-request':
            url = `/api/friends/send-request/${userId}`;
            successMessage = 'تم إرسال الطلب';
            break;
        case 'accept-request':
            url = `/api/friends/accept-request/${userId}`;
            successMessage = 'أصبحتما أصدقاء الآن';
            break;
        case 'cancel-request':
        case 'reject-request':
            url = `/api/friends/reject-request/${userId}`;
            successMessage = 'تم إلغاء الطلب';
            icon = 'fa-info-circle';
            color = 'bg-blue-500';
            break;
        case 'remove-friend':
            // ⭐⭐ الحل الجديد ⭐⭐
            optimisticallyRemoveFriend(userId);
            
            if (socket && socket.connected) {
                socket.emit('removeFriendRequest', {
                    friendId: userId,
                    timestamp: new Date().toISOString()
                });
            }
            
            showFloatingAlert('تم حذف الصديق', 'fa-trash', 'bg-red-500');
            
            setTimeout(() => {
                if (modalElement) {
                    modalElement.remove();
                }
            }, 500);
            
            setTimeout(async () => {
                await refreshUserData();
            }, 1000);
            
            // إعادة تعيين الزر (إذا كان موجوداً)
            if (miniProfileActionBtn) {
                miniProfileActionBtn.innerHTML = originalButtonHTML;
                miniProfileActionBtn.disabled = false;
            }
            
            return; // خروج مبكر
            
        default:
            // إعادة تعيين الزر (إذا كان موجوداً)
            if (miniProfileActionBtn) {
                miniProfileActionBtn.innerHTML = originalButtonHTML;
                miniProfileActionBtn.disabled = false;
            }
            return;
    }

    // ⭐ هذا الجزء للـ actions الأخرى
    try {
        const response = await fetch(url, { 
            method, 
            headers: { 'Authorization': `Bearer ${token}` } 
        });
        
        if (!response.ok) {
            const result = await response.json();
            throw new Error(result.message || 'Action failed');
        }
        
        showFloatingAlert(successMessage, icon, color);
        const refreshSuccess = await refreshUserData();
        
        if (refreshSuccess) {
            // إعادة فتح نافذة البروفايل بعد تأخير
            setTimeout(() => {
                showMiniProfileModal(userId);
            }, 300);
        }
        
    } catch (error) {
        showNotification(error.message || 'حدث خطأ ما', 'error');
    } finally {
        // إعادة تعيين الزر (إذا كان موجوداً)
        if (miniProfileActionBtn) {
            miniProfileActionBtn.innerHTML = originalButtonHTML;
            miniProfileActionBtn.disabled = false;
        }
    }
}

    // --- استبدل قسم "منطق الوضع الداكن/الفاتح" بالكامل بهذا ---

// ✅ تم تعطيل زر تبديل الوضع الداكن/الفاتح مؤقتاً (سيُفعَّل لاحقاً)، مع إبقاء التطبيق التلقائي للثيم
(() => {
    const savedTheme = localStorage.getItem('theme');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (savedTheme === 'dark' || (!savedTheme && systemPrefersDark)) {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }
})();



        // --- ✅ نظام تنقّل موحّد (سطح المكتب: شريط جانبي / الهاتف: شريط سفلي + قائمة "المزيد") ---
    const navItems = document.querySelectorAll('.nav-item');
    const mainContent = document.querySelector('main');

    function activateHomeButton() { switchToView('arena'); }

    function switchToView(viewId) {
        if (viewId !== 'arena') {
            leaveRoomChatUI(); // ✅ دردشة الغرفة خاصة بمشاهدتها فقط، تختفي بمغادرة القسم
            exitFullscreenRoomMode();
            teardownAllVoicePeers(); // 🐛 إصلاح: مغادرة قناة الدردشة تعني مغادرة شبكة الصوت أيضاً بنفس اللحظة
        }

        // تفعيل الشريط الجانبي (سطح المكتب)
        navItems.forEach(i => i.classList.remove('bg-purple-600', 'text-white'));
        document.querySelector(`.nav-item[href="#${viewId}"]`)?.classList.add('bg-purple-600', 'text-white');

        // تفعيل الشريط السفلي (الهاتف)
        document.querySelectorAll('.mobile-nav-item').forEach(i => i.classList.remove('active'));
        document.querySelector(`.mobile-nav-item[data-target="${viewId}"]`)?.classList.add('active');

        document.getElementById('mobile-more-sheet')?.classList.add('hidden');

        const viewRenderers = {
            arena: showRoomBrowserView,
            challenges: showChallengesView,
            settings: showSettingsView,
            messages: showMessagesView,
            leaderboard: showLeaderboardView,
            'friend-requests': showFriendRequestsModal
        };
        (viewRenderers[viewId] || showRoomBrowserView)();
    }

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            switchToView(item.getAttribute('href').substring(1));
        });
    });

    document.querySelectorAll('.mobile-nav-item[data-target]').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            switchToView(item.dataset.target);
        });
    });

    // زر "المزيد" بالهاتف
        document.getElementById('mobile-more-btn')?.addEventListener('click', () => {
        document.getElementById('mobile-more-sheet')?.classList.remove('hidden');
        document.getElementById('mobile-more-sheet')?.classList.add('flex');
        document.getElementById('mobile-more-badge')?.classList.add('hidden');
    });
            // ✅ إغلاق قائمة "المزيد" بالنقر خارجها — تم إصلاحه لأن onclick المضمّن بـ HTML كانت تمنعه سياسة CSP
    document.getElementById('mobile-more-sheet')?.addEventListener('click', (e) => {
        if (e.target.id === 'mobile-more-sheet') {
            e.currentTarget.classList.add('hidden');
            e.currentTarget.classList.remove('flex');
        }
    });
    document.querySelectorAll('.mobile-sheet-item').forEach(item => {
        item.addEventListener('click', () => switchToView(item.dataset.target));
    });

        // زر الدردشة العامة العائم بالهاتف
    document.getElementById('mobile-public-chat-fab')?.addEventListener('click', showMobilePublicChatSheet);


    // ✅ زر "ملفي الشخصي" داخل قائمة المزيد
    document.getElementById('mobile-sheet-my-profile-btn')?.addEventListener('click', () => {
        document.getElementById('mobile-more-sheet')?.classList.add('hidden');
        document.getElementById('mobile-more-sheet')?.classList.remove('flex');
        showMyProfileHub();
    });
    // ✅ سطح المكتب: الصورة الشخصية بالشريط الجانبي كانت غير قابلة للنقر إطلاقاً — تفتح الآن
    // نفس مركز الملف الشخصي المتاح للهاتف عبر "المزيد"، بدل أن تبقى ميزة حصرية للهاتف فقط
    document.getElementById('profileImage')?.addEventListener('click', () => showMyProfileHub());

    // ✅ الرئيسية الجديدة: غرف صوت فقط (80 مقعداً، 5 منها إدارية 1-5)
    // ✅ حالة المقاعد الآن حقيقية 100% من قاعدة البيانات (لقطة عند الفتح + تحديث حي عبر Socket)
    let myVoiceSeatNumber = null;
    let myVoiceRoomId = null;      // ✅ أي غرفة أنا قاعد فيها فعلياً حالياً ('main' أو معرّف غرفة مستخدم)، أو null
    let currentVoiceRoomId = null; // ✅ أي غرفة معروضة بالشاشة الآن (قد تختلف عن مكان جلوسي لو كنت أتصفح فقط)
    let myIsMuted = false;         // ✅ حالة كتمي الحقيقية (زر الكتم انتقل لقائمة "المزيد")
    let roomAudioMuted = false;    // ✅ كتم شخصي محلي بحت لكل صوت الغرفة (موسيقى + متحدثون) — لا يؤثر على أحد غيري
    // 🐛 إصلاح جوهري: الكتم (سواء الذاتي أو كتم المضيف لأحد) كان يعتمد بالكامل على أن جهاز
    // المتحدث نفسه يُعطّل مساره الصادر (track.enabled) — بروتوكول WebRTC نظير-لنظير هنا بلا
    // خادم وسائط مركزي، فلا توجد طريقة "تفرض" الكتم من بعيد. أي تأخّر/تعثّر بوصول أو تنفيذ
    // حدث الكتم عند جهاز المتحدث نفسه (اتصال بطيء، تبويب بالخلفية...) يعني بقاء صوته مسموعاً
    // فعلياً لبقية الحاضرين رغم ظهوره "مكتوماً" بصرياً عندهم. الحل: كل طرف مُستقبِل يُطبّق
    // الكتم بنفسه أيضاً على عنصر الصوت المستقبَل من ذاك الشخص تحديداً — طبقة حماية مستقلة
    // لا تعتمد على جهاز الطرف الآخر إطلاقاً، تضمن الكتم الفعلي حتى لو فشلت الطبقة الأولى
    const seatMutedUsers = new Set(); // userId(string) → مكتوم حالياً (مقعده)، بحسب آخر حالة وصلت

    // ✅ يُطبَّق دائماً بدل ضبط .muted مباشرة — يجمع بين كتمي الشخصي الشامل للغرفة وكتم
    // ذاك الشخص تحديداً (بمقعده)، فلا يُلغي أحدهما الآخر بالخطأ عند تبديل أيّهما
    function applyPeerAudioMuteState(userId) {
        const audioEl = document.getElementById(`voice-peer-audio-${userId}`);
        if (audioEl) audioEl.muted = roomAudioMuted || seatMutedUsers.has(userId);
    }

    // ✅ كتم/فتح كل مصادر الصوت المحلية دفعة واحدة (عنصر الموسيقى + عناصر صوت المتحدثين الحيّة)
    function applyRoomAudioMuteState() {
        const musicAudio = document.getElementById('room-music-audio');
        if (musicAudio) musicAudio.muted = roomAudioMuted;
        document.querySelectorAll('.voice-peer-audio').forEach(el => {
            const userId = el.id.replace('voice-peer-audio-', '');
            applyPeerAudioMuteState(userId);
        });
    }
    function toggleRoomAudioMute() {
        roomAudioMuted = !roomAudioMuted;
        applyRoomAudioMuteState();
        showNotification(roomAudioMuted ? 'تم كتم كل أصوات الغرفة (موسيقى ومتحدثين) عندك أنت فقط' : 'تم إلغاء الكتم', 'info');
    }

    // ✅ رفع اليد لطلب الصعود للمايك — حالة الغرفة المعروضة حالياً فقط
    let myHandRaised = false;
    let roomHandQueue = []; // [{ userId, username, profileImage }] — يملأها المضيف/المسؤول فقط عبر لقطة الحالة

    function isMySeat(roomId, seatNum) {
        return myVoiceRoomId === roomId && myVoiceSeatNumber === seatNum;
    }

    function renderVoiceSeatContent(seatEl, seatData) {
        const isAdminSeat = seatEl.dataset.isAdminSeat === '1';
        const previousUserId = seatEl.dataset.userId; // ✅ يُحفظ قبل المسح لمعرفة هل الشاغل تغيّر أم بقي نفسه
        seatEl.classList.remove('occupied-seat', 'my-seat', 'locked-seat');
        seatEl.dataset.isLocked = '0';
        delete seatEl.dataset.userId;
        seatEl.title = '';

        if (seatData && seatData.isLocked) {
            seatEl.classList.add('locked-seat');
            seatEl.dataset.isLocked = '1';
            seatEl.innerHTML = '<i class="fas fa-lock"></i>';
            seatEl.title = 'مقعد مقفل';
            return;
        }

        if (seatData && seatData.user) {
            const isMe = seatData.user.id === myUserId;
            const sameOccupant = previousUserId === seatData.user.id;
            seatEl.classList.add('occupied-seat');
            if (isMe) seatEl.classList.add('my-seat');
            seatEl.dataset.userId = seatData.user.id; // ✅ فهرس مباشر لتحديث الكتم لاحقاً دون إعادة تحميل الشبكة كاملة
            const safeName = escapeHtml(seatData.user.username || '');
            seatEl.title = seatData.user.username || '';
            // ✅ نحافظ على شارة عداد الدعم لو نفس الشخص لسا قاعد (لا نصفّرها بمجرد إعادة رسم عادية)
            const keepBadge = sameOccupant ? seatEl.querySelector('.seat-support-badge') : null;
            seatEl.innerHTML = `
                <img src="${seatData.user.profileImage}" class="voice-seat-avatar ${seatData.user.activeFrameClass || ''}" alt="${safeName}" loading="lazy" decoding="async">
                ${seatData.isMuted ? '<div class="voice-seat-mute-overlay"><i class="fas fa-microphone-slash"></i></div>' : ''}
                <span class="voice-seat-name">${safeName}</span>
            `;
            if (keepBadge) {
                seatEl.appendChild(keepBadge);
            } else {
                delete seatEl.dataset.supportTotal;
            }
        } else {
            delete seatEl.dataset.userId;
            delete seatEl.dataset.supportTotal; // ✅ يصفّر عداد الدعم بمجرد مغادرة المقعد
            // 🛡️ إزالة صريحة إضافية للشارة (وليس الاعتماد فقط على استبدال innerHTML أدناه) —
            // حماية إضافية حتى لو فات حدث user-left-seat سابقاً بسبب انقطاع اتصال مؤقت (نادر
            // بعد إصلاح إعادة الانضمام التلقائي لقناة الغرفة)، فيبقى previousUserId قديماً عالقاً
            seatEl.querySelector('.seat-support-badge')?.remove();
            // ✅ بغرف المستخدمين (وليس الرسمية) المقعد الفاضي يعرض "+" بالدائرة، والنص تحتها
            // "دعوة" للمضيف (يدعو أحد الحاضرين لهذا المقعد تحديداً) أو "انضمام" لبقية
            // المستخدمين (يرسل طلب صعود) — إلا لمقعد الإدارة بالغرفة الرسمية فقط
            if (isAdminSeat) {
                seatEl.innerHTML = '<i class="fas fa-crown"></i>';
                seatEl.title = 'مقعد محجوز للإدارة';
            } else if (currentVoiceRoomId !== 'main') {
                const emptyLabel = currentRoomMyRole === 'host' ? 'دعوة' : 'انضمام';
                seatEl.innerHTML = `<i class="fas fa-plus voice-seat-plus"></i><span class="voice-seat-name voice-seat-join-label">${emptyLabel}</span>`;
            } else {
                seatEl.innerHTML = seatEl.dataset.seat;
            }
        }
    }

    // ✅ الكتم والمغادرة صارا أيقونتين بشريط الغرفة نفسه (وقائمة "المزيد") — هذي الدالة الآن
    // مسؤولة فقط عن الفقاعة العائمة "ارجع لغرفتي" لما أكون قاعداً وأتصفّح مكاناً آخر
    function updateVoiceControlBar() {
        const bubble = document.getElementById('room-floating-bubble');
        if (!bubble) return;
        // ✅ المضيف (دائماً مقعد 1 بغرفته الخاصة — غير مقاعد الإدارة الأولى بالرسمية) لا يشوف
        // هذي الفقاعة أبداً — علاقته بغرفته مختلفة (مثبَّت فيها، ورجوعه الوحيد هو إنهاء البث)
        const isHostSeat = myVoiceSeatNumber === 1 && myVoiceRoomId !== 'main';
        const amSeated = !!myVoiceSeatNumber && !isHostSeat;
        const viewingMyRoom = amSeated && currentVoiceRoomId === myVoiceRoomId;
        bubble.classList.toggle('hidden', !(amSeated && !viewingMyRoom));
    }

    // ✅ الرجوع لغرفتي التي أنا قاعد فيها من أي مكان بالتطبيق (عبر الفقاعة العائمة)
    async function returnToMyRoom() {
        if (!myVoiceRoomId) return;
        navItems.forEach(i => i.classList.remove('bg-purple-600', 'text-white'));
        document.querySelector(`.nav-item[href="#arena"]`)?.classList.add('bg-purple-600', 'text-white');
        document.querySelectorAll('.mobile-nav-item').forEach(i => i.classList.remove('active'));
        document.querySelector(`.mobile-nav-item[data-target="arena"]`)?.classList.add('active');

        if (myVoiceRoomId === 'main') { showVoiceRoomsView(); return; }
        try {
            const response = await fetch(`/api/voice-room/rooms/${myVoiceRoomId}`, { headers: { 'Authorization': `Bearer ${token}` } });
            const result = await response.json();
            if (response.ok && result.status === 'success') {
                showCustomRoomView({ id: result.id, name: result.name, seatCount: result.seatCount, isPrivate: result.isPrivate, isOfficial: false }, currentRoomPassword);
            } else {
                showNotification('تعذر الرجوع للغرفة', 'error');
            }
        } catch (error) {
            console.error('Failed to return to room:', error);
        }
    }

    // ✅ الفقاعة العائمة — بأسلوب التطبيقات المشهورة: دائرة صغيرة تخبرك أنك لسا قاعد بغرفتك
    // وأنت تتصفح مكاناً آخر. ضغطة واحدة ترجعك مباشرة (الكتم/المغادرة صارا بشريط الغرفة نفسه،
    // فلا داعي لقائمة فرعية هنا بعد الآن).
    function initRoomFloatingBubble() {
        if (document.getElementById('room-floating-bubble')) return;
        const btn = document.createElement('button');
        btn.id = 'room-floating-bubble';
        btn.className = 'hidden fixed bottom-20 md:bottom-6 left-4 md:left-8 z-40 w-11 h-11 rounded-full bg-gray-900 border-2 border-purple-400 shadow-2xl flex items-center justify-center text-white';
        btn.title = 'ارجع لغرفتي';
        btn.innerHTML = '<i class="fas fa-microphone-lines text-sm"></i>';
        document.body.appendChild(btn);
        btn.addEventListener('click', returnToMyRoom);
    }
    initRoomFloatingBubble();

    // =====================================================
    // ✅ تصغير الغرفة صراحة (زر ⏻ برأس الغرفة → "تصغير") — بمنطق مستقل عن الفقاعة أعلاه
    // (تلك تلقائية للضيف الجالس فقط)؛ هذا يعمل للمضيف وللمشاهد غير الجالس أيضاً: تختفي واجهة
    // الغرفة وتستمر بالخلفية (البث/المقعد/الاتصال كله يبقى كما هو بجانب السيرفر) مع فقاعة
    // عائمة صريحة للرجوع، أو إنهائها مباشرة من الفقاعة نفسها بلا حاجة للرجوع أولاً
    // =====================================================
    let minimizedRoomInfo = null; // { id, name, coverImage, isOfficial }

    function removeRoomMinimizedBubble() {
        document.getElementById('room-minimized-bubble')?.remove();
        minimizedRoomInfo = null;
    }

    // ✅ فقاعة قابلة للسحب بحرية (نفس أسلوب dm-floating-bubble تماماً — Pointer Events موحّدة
    // للمس والماوس معاً) — تلتصق بأقرب جانب عند الإفلات، وتفرّق بين ضغطة بسيطة (رجوع للغرفة)
    // وسحب فعلي (لا تُفتح الغرفة بالخطأ أثناء تحريكها)
    function showRoomMinimizedBubble() {
        document.getElementById('room-minimized-bubble')?.remove();
        if (!minimizedRoomInfo) return;
        const bubble = document.createElement('div');
        bubble.id = 'room-minimized-bubble';
        bubble.className = 'room-minimized-bubble';
        bubble.title = 'ارجع للغرفة';
        bubble.style.top = '110px';
        bubble.style.right = '10px';
        bubble.innerHTML = `
            <span class="room-minimized-bubble-pulse"></span>
            <img src="${minimizedRoomInfo.coverImage || 'https://i.ibb.co/601T5nRV/7d580cf284dbd895ae2db4b598ec8bb2.jpg'}" class="room-minimized-bubble-img">
            <button type="button" class="room-minimized-bubble-close" title="إنهاء"><i class="fas fa-times"></i></button>
        `;
        document.body.appendChild(bubble);

        let dragging = false, moved = false, startX = 0, startY = 0, origX = 0, origY = 0, startedOnClose = false;

        bubble.addEventListener('pointerdown', (e) => {
            dragging = true;
            moved = false;
            // 🐛 إصلاح: setPointerCapture أدناه "يُعيد توجيه" كل e.target اللاحق (بما فيها
            // pointerup) للعنصر الملتقط نفسه (الفقاعة كاملة) بدل العنصر الفعلي تحت الإصبع —
            // فكان closest('.room-minimized-bubble-close') عند pointerup لا يطابق أبداً حتى
            // لو الضغطة بدأت فعلياً على زر ×. نحفظ النية هنا عند pointerdown قبل أي التقاط
            startedOnClose = !!e.target.closest('.room-minimized-bubble-close');
            startX = e.clientX;
            startY = e.clientY;
            const rect = bubble.getBoundingClientRect();
            origX = rect.left;
            origY = rect.top;
            bubble.setPointerCapture(e.pointerId);
        });

        bubble.addEventListener('pointermove', (e) => {
            if (!dragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            if (Math.abs(dx) > 5 || Math.abs(dy) > 5) moved = true;
            if (moved) {
                bubble.style.left = `${origX + dx}px`;
                bubble.style.top = `${origY + dy}px`;
                bubble.style.right = 'auto';
            }
        });

        bubble.addEventListener('pointerup', () => {
            dragging = false;
            if (!moved) {
                // ✅ ضغطة بسيطة بلا سحب فعلي — نفرّق بين النقر على × (إنهاء) أو أي مكان آخر (رجوع)
                if (startedOnClose) {
                    const room = minimizedRoomInfo;
                    removeRoomMinimizedBubble();
                    if (room) exitCurrentVoiceRoomView(room);
                } else {
                    resumeMinimizedRoom();
                }
                return;
            }
            // ✅ الالتصاق بأقرب جانب بحركة أنيقة بعد سحب فعلي
            const rect = bubble.getBoundingClientRect();
            bubble.classList.add('dm-bubble-snapping');
            const snapLeft = rect.left < window.innerWidth / 2;
            bubble.style.left = snapLeft ? '8px' : 'auto';
            bubble.style.right = snapLeft ? 'auto' : '8px';
            setTimeout(() => bubble.classList.remove('dm-bubble-snapping'), 220);
        });
    }

    function minimizeVoiceRoomView(room) {
        // 🐛 كان ناقصاً seatCount/isPrivate هنا — عند الرجوع كانت renderVoiceRoomSeats تُستدعى
        // بـ seatCount = undefined فتفشل حلقة إنشاء المقاعد بصمت (0 <= undefined دائماً خطأ)،
        // فلا تُرسَم أي مقاعد ولا يظهر أي أحد رغم نجاح الرجوع نفسه فعلياً
        minimizedRoomInfo = {
            id: room.id,
            name: room.name,
            coverImage: currentRoomCoverImage || room.coverImage || null,
            isOfficial: !!room.isOfficial,
            seatCount: room.seatCount,
            isPrivate: room.isPrivate
        };
        exitFullscreenRoomMode();
        showRoomMinimizedBubble();
        // 🐛 إصلاح: showRoomBrowserView() كانت تُغادر قناة دردشة الغرفة فعلياً وتوقف الموسيقى
        // وتُصفّر currentVoiceRoomId — يعني "التصغير" كان يقطع كل شيء بدل إبقائه بالخلفية.
        // renderRoomBrowserContent() ترسم نفس واجهة التصفح فقط، دون مغادرة الغرفة فعلياً —
        // الموسيقى تستمر، والدردشة/الهدايا تبقى تصل (لن تُرسَم بصرياً وأنت مُصغِّر، لكن حالتها
        // تبقى محدَّثة فتظهر صحيحة فوراً عند رجوعك)
        renderRoomBrowserContent();
    }

    function resumeMinimizedRoom() {
        if (!minimizedRoomInfo) return;
        const room = minimizedRoomInfo;
        removeRoomMinimizedBubble();
        if (room.isOfficial) {
            showVoiceRoomsView();
        } else {
            showCustomRoomView({ id: room.id, name: room.name, coverImage: room.coverImage, isOfficial: false, seatCount: room.seatCount, isPrivate: room.isPrivate }, currentRoomPassword);
        }
    }

    // ✅ ورقة خيارَي الخروج — زر ⏻ بجانب المشاهدين برأس الغرفة
    function showRoomExitOptionsSheet(room) {
        document.getElementById('room-exit-options-sheet')?.remove();
        const modal = document.createElement('div');
        modal.id = 'room-exit-options-sheet';
        modal.className = 'fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50';
        modal.innerHTML = `
            <div class="bg-gray-800 rounded-t-2xl md:rounded-2xl shadow-xl p-4 pb-5 w-full md:max-w-xs text-white">
                <div class="w-10 h-1 bg-gray-600 rounded-full mx-auto mb-4 md:hidden"></div>
                <div class="grid grid-cols-2 gap-3">
                    <button type="button" id="room-exit-now-btn" class="flex flex-col items-center gap-1.5">
                        <span class="w-12 h-12 rounded-full bg-red-600/20 flex items-center justify-center text-red-400"><i class="fas fa-power-off text-lg"></i></span>
                        <span class="text-[11px] text-gray-300">خروج</span>
                    </button>
                    <button type="button" id="room-minimize-btn" class="flex flex-col items-center gap-1.5">
                        <span class="w-12 h-12 rounded-full bg-gray-700/60 flex items-center justify-center text-gray-200"><i class="fas fa-compress text-lg"></i></span>
                        <span class="text-[11px] text-gray-300">تصغير</span>
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.addEventListener('click', (e) => { if (e.target.id === 'room-exit-options-sheet') modal.remove(); });
        modal.querySelector('#room-exit-now-btn').addEventListener('click', () => { modal.remove(); exitCurrentVoiceRoomView(room); });
        modal.querySelector('#room-minimize-btn').addEventListener('click', () => { modal.remove(); minimizeVoiceRoomView(room); });
    }

    // =====================================================
    // ✅ مشغّل موسيقى الغرفة — عنصر صوت واحد دائم بالصفحة، يُزامن مع بقية المستمعين عبر السوكيت
    // =====================================================
    let currentMusicState = null; // آخر حالة موسيقى مستلمة للغرفة المعروضة حالياً
    let roomMusicLibraryCache = []; // مكتبة أغاني الغرفة المعروضة حالياً (تُحمَّل عند الحاجة)

    function initRoomMusicAudioEl() {
        if (document.getElementById('room-music-audio')) return;
        const audio = document.createElement('audio');
        audio.id = 'room-music-audio';
        audio.style.display = 'none';
        document.body.appendChild(audio);
        // ✅ شريط تقدّم حقيقي (مأخوذ من عنصر الصوت نفسه لا من حساب موازٍ) — بالضبط زي مشغّلات التطبيقات المشهورة
        audio.addEventListener('timeupdate', updateMusicProgressUI);
        audio.addEventListener('loadedmetadata', updateMusicProgressUI);
        // ✅ آلية دلالة أخطاء: أي فشل بتحميل/تشغيل الملف الصوتي (رابط معطوب، 404، CORS...) يظهر
        // بالكونسول فوراً بدل الفشل الصامت — يسهّل تشخيص مشاكل روابط المكتبة المشتركة
        audio.addEventListener('error', () => {
            console.error('[MUSIC] فشل تحميل/تشغيل الملف الصوتي:', audio.error, 'URL:', audio.dataset.currentUrl);
        });
    }
    initRoomMusicAudioEl();

    function formatTrackTime(seconds) {
        if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    // ✅ يحدّث شريط التقدّم أينما ظُهر (المشغّل العائم و/أو نافذة الموسيقى) استناداً لموضع
    // التشغيل الفعلي بعنصر الصوت — يبقى صحيحاً بغض النظر عن أي حساب آخر
    function updateMusicProgressUI() {
        const audio = document.getElementById('room-music-audio');
        if (!audio) return;
        const duration = audio.duration || 0;
        const pct = duration > 0 ? Math.min(100, (audio.currentTime / duration) * 100) : 0;

        const floatFill = document.getElementById('floating-music-progress-fill');
        if (floatFill) floatFill.style.width = `${pct}%`;

        const popupFill = document.getElementById('music-popup-progress-fill');
        if (popupFill) popupFill.style.width = `${pct}%`;
        const popupTime = document.getElementById('music-popup-time');
        if (popupTime) popupTime.textContent = `${formatTrackTime(audio.currentTime)} / ${duration ? formatTrackTime(duration) : '--:--'}`;
    }

    // ✅ يطبّق حالة التشغيل الواردة من السيرفر على عنصر الصوت الفعلي (مزامنة رياضية بالثانية)
    function applyMusicState(state) {
        currentMusicState = state;
        const audio = document.getElementById('room-music-audio');
        // ✅ أيقونة الموسيقى انتقلت داخل قائمة "المزيد" (مو ثابتة الظهور)، فمؤشر التشغيل الآن
        // نبضة خفيفة على زر "المزيد" نفسه — تبقى ملاحظة أن هناك أغنية شغّالة حتى وأنت لا تشاهد القائمة
        const moreBtn = document.getElementById('room-chat-more-btn');
        if (!audio) return;

        if (!state) {
            audio.pause();
            audio.removeAttribute('src');
            audio.dataset.currentUrl = '';
            moreBtn?.classList.remove('room-music-playing');
            hideFloatingMusicPlayer();
            return;
        }

        if (audio.dataset.currentUrl !== state.url) {
            audio.src = state.url;
            audio.dataset.currentUrl = state.url;
        }

        if (state.isPlaying) {
            // 🐛 إصلاح: عند الاستئناف، السيرفر يحسب startedAt بحيث (الآن - startedAt) وحدها
            // تساوي الثواني المنقضية فعلياً (تتضمن pausedAt ضمنياً بالفعل) — جمع pausedAt هنا
            // كان يُضاعفها فوق نفسها، فتقفز الأغنية للأمام في كل استئناف (نفس تراكم كل إيقاف سابق)
            const elapsed = (Date.now() - state.startedAt) / 1000;
            if (Math.abs((audio.currentTime || 0) - elapsed) > 1.5) audio.currentTime = Math.max(0, elapsed);
            // ✅ قد يمنعه المتصفح قبل أول تفاعل من المستخدم (autoplay policy) — طبيعي وغير خطير، لكن
            // نسجّله بالكونسول بدل ابتلاعه صامتاً حتى يسهل تمييزه عن خطأ حقيقي بالرابط
            audio.play().catch((err) => console.warn('[MUSIC] audio.play() لم يبدأ (على الأغلب سياسة تشغيل تلقائي بالمتصفح):', err?.name || err));
            moreBtn?.classList.add('room-music-playing');
        } else {
            audio.currentTime = state.pausedAt;
            audio.pause();
            moreBtn?.classList.remove('room-music-playing');
        }
        updateFloatingMusicPlayer(state);
        updateMusicProgressUI();
    }

    // ✅ إيقاف مؤقت/استئناف "فوري محلياً" — يطبّق نفس معادلة السيرفر مباشرة على الواجهة
    // (يوقف/يشغّل الصوت فعلياً فوراً بدل انتظار رحلة السيرفر ذهاباً وإياباً) ثم يرسل الحدث
    // للسيرفر كمرجع نهائي؛ حالة السيرفر الواردة لاحقاً تُطابقها فتصحّح أي انحراف طفيف بصمت
    function toggleMusicPlayback(roomId) {
        if (!currentMusicState || !roomId) return;
        const optimistic = { ...currentMusicState };
        if (optimistic.isPlaying) {
            // 🐛 نفس إصلاح السيرفر: startedAt تتضمّن pausedAt القديمة ضمنياً أصلاً (مضبوطة عند
            // آخر استئناف)، فـ(الآن - startedAt) وحدها تساوي موضع التشغيل الحقيقي — لا تُجمع فوق
            // القديمة (كان يُضاعفها بكل دورة إيقاف/استئناف فتقفز الأغنية للأمام تراكمياً)
            optimistic.pausedAt = (Date.now() - optimistic.startedAt) / 1000;
            optimistic.isPlaying = false;
            socket.emit('room-music-pause', { roomId });
        } else {
            optimistic.startedAt = Date.now() - (optimistic.pausedAt || 0) * 1000;
            optimistic.isPlaying = true;
            socket.emit('room-music-resume', { roomId });
        }
        applyMusicState(optimistic);
    }

    // ✅ مشغّل موسيقى عائم صغير — يظهر تلقائياً بمجرد تشغيل أي أغنية بالغرفة، قابل للسحب
    // ووضعه بأي مكان (نفس أسلوب سحب فقاعة الرسالة الخاصة)، وله × لإخفائه محلياً فقط (لا يوقف
    // الأغنية عن بقية الحاضرين، فقط يخفي الودجت عن نظري أنا)
    // 🛡️ حصراً للمضيف — بقية الحاضرين يسمعون نفس الأغنية عبر عنصر الصوت المخفي فقط،
    // ويقدرون يشوفون ما يُشغَّل حالياً من نافذة "موسيقى" بقائمة "المزيد" لو حبّوا
    let floatingMusicDismissed = false;
    function hideFloatingMusicPlayer() {
        document.getElementById('room-floating-music-player')?.classList.add('hidden');
    }

    // ✅ العنصر يُبنى مرة واحدة فقط ومستمعوه مُفوَّضون (delegation) — لا يُعاد إنشاؤه أو
    // إعادة ربط أزراره أبداً بعدها، فلا يفقد زر الإغلاق (×) استجابته أبداً بأي سباق تحديث لاحق
    function ensureFloatingMusicPlayerEl() {
        let el = document.getElementById('room-floating-music-player');
        if (el) return el;

        el = document.createElement('div');
        el.id = 'room-floating-music-player';
        el.className = 'room-floating-music-player hidden';
        el.style.top = '130px';
        el.style.left = '12px';
        el.innerHTML = `
            <button id="floating-music-close" type="button" class="room-floating-music-close" title="إخفاء"><i class="fas fa-times"></i></button>
            <div class="room-floating-music-disc"><i class="fas fa-music"></i></div>
            <div class="room-floating-music-body">
                <span id="floating-music-title" class="room-floating-music-title"></span>
                <div class="room-floating-music-progress"><div id="floating-music-progress-fill" class="room-floating-music-progress-fill"></div></div>
            </div>
            <button id="floating-music-toggle" type="button" class="room-floating-music-btn room-floating-music-btn-main"><i class="fas fa-play"></i></button>
            <button id="floating-music-next" type="button" class="room-floating-music-btn"><i class="fas fa-forward-step"></i></button>
        `;
        document.body.appendChild(el);
        wireFloatingMusicPlayerDrag(el);

        // ✅ تفويض أحداث واحد ثابت للأبد — العنصر لا يُعاد بناؤه بعدها إطلاقاً (راجع updateFloatingMusicPlayer)
        el.addEventListener('click', (e) => {
            const btn = e.target.closest('button');
            if (!btn) return;
            e.stopPropagation();
            if (btn.id === 'floating-music-close') {
                floatingMusicDismissed = true;
                el.classList.add('hidden');
            } else if (btn.id === 'floating-music-toggle') {
                toggleMusicPlayback(currentVoiceRoomId);
            } else if (btn.id === 'floating-music-next') {
                playNextLibraryTrack(currentVoiceRoomId);
            }
        });
        return el;
    }

    function updateFloatingMusicPlayer(state) {
        if (currentRoomMyRole !== 'host' || floatingMusicDismissed) return;
        const el = ensureFloatingMusicPlayerEl();
        el.classList.remove('hidden');
        el.querySelector('#floating-music-title').textContent = state.title || 'أغنية';
        el.querySelector('.room-floating-music-disc').classList.toggle('cd-spinning', state.isPlaying);
        el.querySelector('#floating-music-toggle i').className = `fas ${state.isPlaying ? 'fa-pause' : 'fa-play'}`;
        updateMusicProgressUI();
    }

    // ✅ سحب حر بأي اتجاه داخل الشاشة (وليس فقط جانب واحد) — نفس آلية فقاعة الرسالة الخاصة العائمة،
    // لكن بعتبة حركة (لا يبدأ السحب فعلياً إلا بعد تحرّك حقيقي) بدل الاعتماد حصراً على دقّة تحديد
    // العنصر عند لحظة اللمس — لمسة إصبع على هاتف نادراً ما تكون دقيقة 100% على أزرار صغيرة،
    // وبدون هذي العتبة كان أي لمس قريب من زر (×) مثلاً يُلتقط كبداية سحب فيبدو "معطّلاً"
    const DRAG_MOVE_THRESHOLD = 6;
    function wireFloatingMusicPlayerDrag(el) {
        let tracking = false, dragging = false, startX = 0, startY = 0, origX = 0, origY = 0, pointerId = null;
        el.addEventListener('pointerdown', (e) => {
            if (e.target.closest('button')) return; // ✅ لمسة داخل زر فعلياً — لا تُعامل كسحب إطلاقاً
            tracking = true;
            dragging = false;
            pointerId = e.pointerId;
            startX = e.clientX; startY = e.clientY;
            const rect = el.getBoundingClientRect();
            origX = rect.left; origY = rect.top;
        });
        el.addEventListener('pointermove', (e) => {
            if (!tracking || e.pointerId !== pointerId) return;
            const dx = e.clientX - startX, dy = e.clientY - startY;
            if (!dragging) {
                if (Math.hypot(dx, dy) < DRAG_MOVE_THRESHOLD) return; // ✅ لسا ضمن هامش اللمسة الثابتة
                dragging = true;
                el.setPointerCapture(pointerId);
            }
            const newX = Math.min(Math.max(0, origX + dx), window.innerWidth - el.offsetWidth);
            const newY = Math.min(Math.max(0, origY + dy), window.innerHeight - el.offsetHeight);
            el.style.left = `${newX}px`;
            el.style.top = `${newY}px`;
        });
        const endTracking = () => {
            if (dragging && pointerId !== null) { try { el.releasePointerCapture(pointerId); } catch (_) {} }
            tracking = false; dragging = false; pointerId = null;
        };
        el.addEventListener('pointerup', endTracking);
        el.addEventListener('pointercancel', endTracking);
    }

    // ✅ المشغّل المصغّر — يظهر بالضغط على أيقونة القرص: العنوان + شريط تقدّم + تشغيل/إيقاف
    // + التالي (للمضيف/المسؤول فقط) + اقتراح أغنية جديدة على إدارة المنصة
    async function showMusicPlayerPopup(roomId) {
        const canControl = roomId !== 'main' && (currentRoomMyRole === 'host' || currentRoomMyRole === 'moderator');
        const modal = document.createElement('div');
        modal.id = 'music-player-modal';
        modal.className = 'fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50';
        modal.innerHTML = `
            <div class="bg-gray-800 rounded-t-2xl md:rounded-2xl shadow-xl p-4 w-full md:max-w-xs text-white">
                <div class="flex items-center gap-3 mb-2">
                    <div class="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center flex-shrink-0 ${currentMusicState?.isPlaying ? 'cd-spinning' : ''}" id="music-popup-cd">
                        <i class="fas fa-compact-disc text-xl"></i>
                    </div>
                    <div class="flex-1 min-w-0">
                        <p class="font-bold text-sm truncate">${currentMusicState ? escapeHtml(currentMusicState.title) : 'لا توجد أغنية قيد التشغيل'}</p>
                        <p class="text-[11px] text-gray-400">${currentMusicState ? (currentMusicState.isPlaying ? 'قيد التشغيل' : 'متوقف مؤقتاً') : ''}</p>
                    </div>
                </div>
                ${currentMusicState ? `
                    <div class="room-music-popup-progress-track"><div id="music-popup-progress-fill" class="room-music-popup-progress-fill"></div></div>
                    <p id="music-popup-time" class="text-[10px] text-gray-500 text-left mb-2">00:00 / 00:00</p>
                ` : ''}
                ${canControl ? `
                    <div class="flex items-center justify-center gap-3 mb-3">
                        <button id="music-toggle-btn" class="w-11 h-11 rounded-full bg-gray-700 hover:bg-gray-600 flex items-center justify-center">
                            <i class="fas ${currentMusicState?.isPlaying ? 'fa-pause' : 'fa-play'}"></i>
                        </button>
                        <button id="music-next-btn" class="w-11 h-11 rounded-full bg-gray-700 hover:bg-gray-600 flex items-center justify-center">
                            <i class="fas fa-forward-step"></i>
                        </button>
                        <button id="music-suggest-btn" class="w-11 h-11 rounded-full bg-emerald-600 hover:bg-emerald-700 flex items-center justify-center" title="اقترح أغنية">
                            <i class="fas fa-lightbulb"></i>
                        </button>
                    </div>
                    <div class="relative mb-2">
                        <input id="music-search-input" type="text" placeholder="ابحث بمكتبة الأغاني..." class="w-full bg-gray-700 border border-gray-600 rounded-full py-2 px-3.5 text-xs text-white focus:ring-emerald-500 focus:border-emerald-500">
                    </div>
                    <div id="music-search-results" class="space-y-1.5 max-h-32 overflow-y-auto mb-2"></div>
                    <p class="text-[10px] text-gray-500 mb-1">المكتبة المشتركة</p>
                    <div id="music-library-list" class="space-y-1.5 max-h-40 overflow-y-auto"></div>
                    <p class="text-[10px] text-gray-500 text-center mt-2">ما لقيت أغنيتك؟ اضغط <i class="fas fa-lightbulb text-emerald-400"></i> فوق لتقترحها على إدارة المنصة</p>
                ` : ''}
                <button id="close-music-popup" class="w-full text-center py-2 mt-2 rounded-lg bg-gray-700 text-gray-300 text-sm">إغلاق</button>
            </div>
        `;
        document.body.appendChild(modal);
        modal.addEventListener('click', (e) => { if (e.target.id === 'music-player-modal') modal.remove(); });
        document.getElementById('close-music-popup').addEventListener('click', () => modal.remove());
        updateMusicProgressUI();

        if (!canControl) return;

        document.getElementById('music-toggle-btn').addEventListener('click', () => {
            toggleMusicPlayback(roomId);
            modal.remove();
        });

        document.getElementById('music-next-btn').addEventListener('click', () => {
            playNextLibraryTrack(roomId);
            modal.remove();
        });

        document.getElementById('music-suggest-btn').addEventListener('click', () => {
            modal.remove();
            showSongSuggestionModal(roomId);
        });

        wireMusicLibrarySearch(roomId, modal);
        await loadMusicLibraryList(roomId, modal);
    }

    // ✅ البحث بمكتبة الأغاني المشتركة (منسَّقة من إدارة المنصة) — الضغط على نتيجة يشغّلها فوراً بالغرفة
    let musicSearchDebounce = null;
    function wireMusicLibrarySearch(roomId, modal) {
        const input = modal.querySelector('#music-search-input');
        const resultsEl = modal.querySelector('#music-search-results');
        if (!input || !resultsEl) return;

        async function runSearch(q) {
            if (!q.trim()) { resultsEl.innerHTML = ''; return; }
            resultsEl.innerHTML = '<p class="text-[11px] text-gray-500 text-center py-2"><i class="fas fa-spinner fa-spin"></i></p>';
            try {
                const response = await fetch(`/api/music/search?q=${encodeURIComponent(q.trim())}`, { headers: { 'Authorization': `Bearer ${token}` } });
                const result = await response.json();
                const tracks = result.tracks || [];
                if (tracks.length === 0) {
                    resultsEl.innerHTML = '<p class="text-[11px] text-gray-500 text-center py-2">لا نتائج</p>';
                    return;
                }
                resultsEl.innerHTML = tracks.map(t => `
                    <button class="music-search-result-btn w-full text-right bg-gray-700/50 hover:bg-gray-700 rounded-lg p-2 flex items-center gap-2" data-url="${t.url}" data-title="${escapeHtml(t.title)}">
                        <i class="fas fa-music text-emerald-400 text-xs"></i>
                        <span class="text-xs truncate flex-1">${escapeHtml(t.title)}${t.artist ? ` — ${escapeHtml(t.artist)}` : ''}</span>
                    </button>
                `).join('');
                resultsEl.querySelectorAll('.music-search-result-btn').forEach(btn => {
                    btn.addEventListener('click', () => {
                        socket.emit('room-music-play', { roomId, url: btn.dataset.url, title: btn.dataset.title });
                        modal.remove();
                    });
                });
            } catch (error) {
                console.error('[MUSIC SEARCH] Error:', error);
                resultsEl.innerHTML = '<p class="text-[11px] text-red-400 text-center py-2">تعذر البحث</p>';
            }
        }

        input.addEventListener('input', () => {
            clearTimeout(musicSearchDebounce);
            musicSearchDebounce = setTimeout(() => runSearch(input.value), 350);
        });
    }

    async function loadMusicLibraryList(roomId, modal) {
        const listEl = modal.querySelector('#music-library-list');
        if (!listEl) return;
        try {
            // ✅ المكتبة المشتركة (منسَّقة من لوحة التحكم) — بديل مكتبة كل غرفة القديمة
            const response = await fetch(`/api/music/search?limit=30`, { headers: { 'Authorization': `Bearer ${token}` } });
            const result = await response.json();
            roomMusicLibraryCache = result.tracks || [];
            if (roomMusicLibraryCache.length === 0) {
                listEl.innerHTML = '<p class="text-[11px] text-gray-500 text-center py-3">المكتبة فاضية حالياً — اقترح أغنية وإدارة المنصة رح تضيفها قريباً</p>';
                return;
            }
            listEl.innerHTML = roomMusicLibraryCache.map((t, i) => `
                <button class="music-track-btn w-full text-right bg-gray-700/50 hover:bg-gray-700 rounded-lg p-2 flex items-center gap-2 ${currentMusicState?.url === t.url ? 'ring-1 ring-emerald-400' : ''}" data-idx="${i}">
                    <i class="fas fa-music text-emerald-400 text-xs"></i>
                    <span class="text-xs truncate flex-1">${escapeHtml(t.title)}${t.artist ? ` — ${escapeHtml(t.artist)}` : ''}</span>
                </button>
            `).join('');
            listEl.querySelectorAll('.music-track-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const track = roomMusicLibraryCache[parseInt(btn.dataset.idx)];
                    socket.emit('room-music-play', { roomId, url: track.url, title: track.title });
                    document.getElementById('music-player-modal')?.remove();
                });
            });
        } catch (error) {
            console.error('[MUSIC] Load library error:', error);
        }
    }

    function playNextLibraryTrack(roomId) {
        if (roomMusicLibraryCache.length === 0) {
            showNotification('لا توجد أغاني أخرى بالمكتبة', 'info');
            return;
        }
        const currentIdx = roomMusicLibraryCache.findIndex(t => t.url === currentMusicState?.url);
        const next = roomMusicLibraryCache[(currentIdx + 1) % roomMusicLibraryCache.length];
        socket.emit('room-music-play', { roomId, url: next.url, title: next.title });
    }

    // ✅ إرسال اقتراح إلى إدارة المنصة عبر صندوق الاقتراحات العام — نائب عن رفع الملفات المباشر
    // (أُزيل: المكتبة أصبحت منسَّقة حصراً من لوحة التحكم) — يصل الاقتراح كإشعار فوري هناك
    async function submitSuggestion(payload, successMessage) {
        try {
            const response = await fetch('/api/suggestions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(payload)
            });
            const result = await response.json();
            if (!response.ok) {
                showNotification(result.message || 'تعذر إرسال الاقتراح', 'error');
                return false;
            }
            showNotification(successMessage, 'success');
            return true;
        } catch (error) {
            console.error('[SUGGEST] Error:', error);
            showNotification('حدث خطأ أثناء الإرسال', 'error');
            return false;
        }
    }

    // ✅ اقتراح أغنية لمكتبة الموسيقى المشتركة — بدل رفع المضيف لملفه الخاص مباشرة
    function showSongSuggestionModal(roomId) {
        document.getElementById('song-suggestion-modal')?.remove();
        const modal = document.createElement('div');
        modal.id = 'song-suggestion-modal';
        modal.className = 'fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50';
        modal.innerHTML = `
            <div class="bg-gray-800 rounded-t-2xl md:rounded-2xl shadow-xl p-4 w-full md:max-w-xs text-white">
                <div class="flex items-center justify-between mb-3">
                    <h3 class="font-bold text-sm"><i class="fas fa-lightbulb text-emerald-400"></i> اقترح أغنية</h3>
                    <button id="close-song-suggest" class="text-gray-400"><i class="fas fa-times"></i></button>
                </div>
                <div class="space-y-2">
                    <input id="suggest-song-title" maxlength="80" placeholder="اسم الأغنية *" class="w-full bg-gray-700 border border-gray-600 rounded-lg py-2 px-3 text-xs text-white">
                    <input id="suggest-song-artist" maxlength="60" placeholder="الفنان (اختياري)" class="w-full bg-gray-700 border border-gray-600 rounded-lg py-2 px-3 text-xs text-white">
                    <input id="suggest-song-url" maxlength="300" placeholder="رابط للاستماع كمرجع — يوتيوب مثلاً (اختياري)" class="w-full bg-gray-700 border border-gray-600 rounded-lg py-2 px-3 text-xs text-white">
                </div>
                <p class="text-[10px] text-gray-500 mt-2">يصل اقتراحك مباشرة لإدارة المنصة لإضافته للمكتبة المشتركة</p>
                <button id="submit-song-suggest" class="w-full text-center py-2.5 mt-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-sm font-bold">إرسال الاقتراح</button>
            </div>
        `;
        document.body.appendChild(modal);
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
        modal.querySelector('#close-song-suggest').addEventListener('click', () => modal.remove());
        modal.querySelector('#submit-song-suggest').addEventListener('click', async () => {
            const songTitle = modal.querySelector('#suggest-song-title').value.trim();
            if (!songTitle) { showNotification('اكتب اسم الأغنية أولاً', 'error'); return; }
            const songArtist = modal.querySelector('#suggest-song-artist').value.trim();
            const songUrl = modal.querySelector('#suggest-song-url').value.trim();
            const ok = await submitSuggestion({ type: 'song', songTitle, songArtist, songUrl, roomId }, 'تم إرسال اقتراحك، شكراً لك! 🎵');
            if (ok) modal.remove();
        });
    }

    // ✅ اقتراح/ملاحظة عامة — متاحة للجميع من قائمة "المزيد"، مو حصراً للمضيف/المسؤول
    function showGeneralSuggestionModal() {
        document.getElementById('general-suggestion-modal')?.remove();
        const modal = document.createElement('div');
        modal.id = 'general-suggestion-modal';
        modal.className = 'fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50';
        modal.innerHTML = `
            <div class="bg-gray-800 rounded-t-2xl md:rounded-2xl shadow-xl p-4 w-full md:max-w-xs text-white">
                <div class="flex items-center justify-between mb-3">
                    <h3 class="font-bold text-sm"><i class="fas fa-lightbulb text-yellow-300"></i> اقتراح / ملاحظة</h3>
                    <button id="close-general-suggest" class="text-gray-400"><i class="fas fa-times"></i></button>
                </div>
                <textarea id="suggest-general-message" maxlength="500" rows="4" placeholder="اكتب اقتراحك أو ملاحظتك..." class="w-full bg-gray-700 border border-gray-600 rounded-lg py-2 px-3 text-xs text-white resize-none"></textarea>
                <button id="submit-general-suggest" class="w-full text-center py-2.5 mt-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-sm font-bold">إرسال</button>
            </div>
        `;
        document.body.appendChild(modal);
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
        modal.querySelector('#close-general-suggest').addEventListener('click', () => modal.remove());
        modal.querySelector('#submit-general-suggest').addEventListener('click', async () => {
            const message = modal.querySelector('#suggest-general-message').value.trim();
            if (!message) { showNotification('اكتب اقتراحك أولاً', 'error'); return; }
            const roomId = (currentVoiceRoomId && currentVoiceRoomId !== 'main') ? currentVoiceRoomId : null;
            const ok = await submitSuggestion({ type: 'general', message, roomId }, 'تم إرسال اقتراحك، شكراً لك! 💡');
            if (ok) modal.remove();
        });
    }

    // =====================================================
    // ✅ دردشة خاصة بكل غرفة — بديل الدردشة العامة القديمة
    // -----------------------------------------------------
    // مدمجة داخل إطار الغرفة نفسه (وليست عنصراً عائماً منفصلاً) — الرسائل تبقى ظاهرة دائماً
    // أسفل المقاعد بغض النظر عن إظهار/إخفاء صندوق الكتابة، وبدون خلفية قابلة للتغيير.
    // =====================================================
    let roomChatCurrentRoomId = null;

    // ✅ يُستدعى من قالب أي غرفة (الرسمية أو غرفة مستخدم) لإدراج منطقة الدردشة داخل إطارها
    // ✅ شريط دردشة واحد ثابت الظهور دائماً (بدل حقل يُخفى خلف زر) + قائمة "المزيد" المنسدلة
    // للإجراءات الثانوية — بالضبط آلية التطبيقات المشهورة (Bigo/Yalla/TikTok Live): حقل كتابة
    // جاهز فوراً، وزرّان فقط بجانبه (هدية + المزيد) بدل صف مزدحم بالأيقونات
    function renderRoomChatMarkup() {
        return `
            <div id="room-chat-messages" class="room-chat-messages-fixed"></div>
            <div class="room-chat-dock-fixed">
                <div class="room-chat-input-pill">
                    <input id="room-chat-input" type="text" maxlength="300" placeholder="قل شيئاً..." autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" name="room-chat-message-field">
                    <button id="room-chat-send-btn" title="إرسال"><i class="fas fa-paper-plane"></i></button>
                </div>
                <button id="room-join-request-btn" class="hidden room-chat-dock-icon" title="اطلب الصعود للمايك">
                    <i class="fas fa-infinity"></i>
                </button>
                <button id="room-leave-seat-btn" class="hidden room-chat-dock-icon room-chat-leave-icon" title="مغادرة المقعد">
                    <i class="fas fa-door-open"></i>
                </button>
                <button id="room-gift-icon-btn" class="room-chat-dock-icon room-chat-gift-icon" title="الهدايا">
                    <i class="fas fa-gift"></i>
                </button>
                <button id="room-chat-more-btn" class="room-chat-dock-icon" title="المزيد">
                    <i class="fas fa-ellipsis"></i>
                    <span id="room-chat-more-badge" class="hidden room-chat-mini-badge">0</span>
                </button>
            </div>
        `;
    }

    // ✅ يربط أحداث صندوق الدردشة — يُستدعى بعد إدراج القالب أعلاه بالصفحة
    function wireRoomChatUI() {
        const sendBtn = document.getElementById('room-chat-send-btn');
        const input = document.getElementById('room-chat-input');
        if (!sendBtn || !input) return;

        sendBtn.addEventListener('click', sendRoomChatMessage);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') sendRoomChatMessage();
        });
        // ✅ زر الإرسال يُضاء فقط وفيه نص فعلي — نفس سلوك تطبيقات الدردشة المعروفة
        input.addEventListener('input', () => {
            sendBtn.classList.toggle('room-chat-send-active', input.value.trim().length > 0);
        });

        // ✅ زر هدايا الغرفة — يفتح نافذة تحديد مستلمين متعددين من المقاعد الفعلية
        document.getElementById('room-gift-icon-btn')?.addEventListener('click', () => {
            if (currentVoiceRoomId) showRoomGiftModal(currentVoiceRoomId);
        });

        // ✅ زر "المزيد" — يجمّع الموسيقى/الرسائل/التفاعل بقائمة واحدة بدل صف أيقونات مزدحم
        document.getElementById('room-chat-more-btn')?.addEventListener('click', showRoomChatMoreSheet);

        // ✅ زر (∞): للمضيف/المسؤول يفتح قائمة طلبات الصعود المعلّقة (لا يرسل طلباً لنفسه أبداً)،
        // ولبقية المستخدمين يرسل طلب صعود — وإن كان طلب مُرسَل أصلاً يعرض نافذة إلغائه
        document.getElementById('room-join-request-btn')?.addEventListener('click', () => {
            const isManager = currentRoomMyRole === 'host' || currentRoomMyRole === 'moderator';
            if (isManager) {
                if (currentVoiceRoomId) showHandQueueSheet(currentVoiceRoomId);
            } else {
                sendSeatJoinRequest();
            }
        });

        // ✅ زر مغادرة المقعد — انتقل من الشريط العائم القديم لهنا (السيرفر يرفضه للمضيف أصلاً)
        document.getElementById('room-leave-seat-btn')?.addEventListener('click', leaveVoiceSeat);

        updateChatLockUI();
    }

    // ✅ قائمة "المزيد" المنسدلة — شبكة إجراءات ثانوية بأسلوب موحّد مع بقية نوافذ المشروع السفلية
    function showRoomChatMoreSheet() {
        document.getElementById('room-chat-more-sheet')?.remove();
        const isManager = currentRoomMyRole === 'host' || currentRoomMyRole === 'moderator';
        const isSeatedHere = myVoiceSeatNumber && myVoiceRoomId === currentVoiceRoomId;

        const items = [
            { action: 'music', icon: 'fa-compact-disc', label: 'موسيقى', color: 'text-emerald-400' },
            { action: 'messages', icon: 'fa-envelope', label: 'رسائلي', color: 'text-blue-400', badge: roomUnreadDMCount },
            { action: 'reaction', icon: 'fa-face-laugh-beam', label: 'تفاعل', color: 'text-amber-400' },
            { action: 'suggest', icon: 'fa-lightbulb', label: 'اقتراح', color: 'text-yellow-300' },
            // ✅ كتم شخصي محلي بحت (لا يؤثر على أحد غيري) — يشمل الموسيقى وصوت المتحدثين معاً
            {
                action: 'toggle-room-mute',
                icon: roomAudioMuted ? 'fa-volume-xmark' : 'fa-volume-high',
                label: roomAudioMuted ? 'إلغاء كتم الصوت' : 'كتم كل الأصوات',
                color: roomAudioMuted ? 'text-red-400' : 'text-gray-300'
            }
        ];
        // ✅ الكتم انتقل من الشريط العائم القديم لهنا — يظهر فقط وأنت فعلياً قاعد على مقعد
        if (isSeatedHere) {
            items.push({
                action: 'mute',
                icon: myIsMuted ? 'fa-microphone-slash' : 'fa-microphone',
                label: myIsMuted ? 'إلغاء الكتم' : 'كتم صوتي',
                color: myIsMuted ? 'text-red-400' : 'text-gray-300'
            });
        }
        if (isManager) {
            items.push({ action: 'hand-queue', icon: 'fa-infinity', label: 'طلبات الصعود', color: 'text-purple-400', badge: roomHandQueue.length });
        }
        // ✅ تحدي PK — انتقل هنا من نافذة الإعدادات (المضيف فقط، وليس المسؤولين — قرار مصيري للغرفة)
        if (currentRoomMyRole === 'host' && currentVoiceRoomId !== 'main') {
            items.push({ action: 'pk-challenge', icon: 'fa-bolt', label: 'تحدي PK', color: 'text-orange-400' });
        }
        // ✅ تحدٍ بين أعضاء الغرفة نفسها — المضيف والمسؤولون معاً (بعكس تحدي PK بين الغرف،
        // قرار داخلي بسيط بالغرفة نفسها لا يحتاج صلاحية المضيف حصراً)
        if (isManager && currentVoiceRoomId !== 'main') {
            items.push({ action: 'seat-challenge', icon: 'fa-fire', label: 'تحدٍ بين أعضاء', color: 'text-red-400' });
        }
        // ✅ تنظيف/قفل الدردشة — للمضيف/المسؤولين بغرف المستخدمين فقط (لا الرسمية)
        if (isManager && currentVoiceRoomId !== 'main') {
            items.push({ action: 'clear-chat', icon: 'fa-broom', label: 'تنظيف الدردشة', color: 'text-gray-300' });
            items.push({
                action: 'toggle-chat-lock',
                icon: currentRoomChatLocked ? 'fa-lock' : 'fa-lock-open',
                label: currentRoomChatLocked ? 'فتح الدردشة' : 'قفل الدردشة',
                color: currentRoomChatLocked ? 'text-red-400' : 'text-gray-300'
            });
        }

        const modal = document.createElement('div');
        modal.id = 'room-chat-more-sheet';
        modal.className = 'fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50';
        modal.innerHTML = `
            <div class="bg-gray-800 rounded-t-2xl md:rounded-2xl shadow-xl p-4 pb-5 w-full md:max-w-sm text-white">
                <div class="w-10 h-1 bg-gray-600 rounded-full mx-auto mb-4 md:hidden"></div>
                <div class="grid grid-cols-4 gap-3">
                    ${items.map(it => `
                        <button data-action="${it.action}" class="room-more-item flex flex-col items-center gap-1.5">
                            <span class="relative w-12 h-12 rounded-full bg-gray-700/60 flex items-center justify-center ${it.color}">
                                <i class="fas ${it.icon} text-lg"></i>
                                ${it.badge ? `<span class="room-chat-mini-badge">${it.badge > 9 ? '9+' : it.badge}</span>` : ''}
                            </span>
                            <span class="text-[11px] text-gray-300">${it.label}</span>
                        </button>
                    `).join('')}
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.addEventListener('click', (e) => { if (e.target.id === 'room-chat-more-sheet') modal.remove(); });

        modal.querySelectorAll('.room-more-item').forEach(btn => {
            btn.addEventListener('click', () => {
                modal.remove();
                const action = btn.dataset.action;
                if (action === 'music') {
                    if (currentVoiceRoomId) showMusicPlayerPopup(currentVoiceRoomId);
                } else if (action === 'messages') {
                    clearRoomMessagesBadge();
                    if (lastRoomDMSender) {
                        openPrivateChat(lastRoomDMSender.id, lastRoomDMSender.username, true);
                    } else {
                        showNotification('لا توجد رسائل جديدة', 'info');
                    }
                } else if (action === 'reaction') {
                    if (!myVoiceSeatNumber || myVoiceRoomId !== currentVoiceRoomId) {
                        showNotification('اجلس على مقعد أولاً حتى تقدر تتفاعل', 'info');
                        return;
                    }
                    showReactionPicker(currentVoiceRoomId, myVoiceSeatNumber);
                } else if (action === 'suggest') {
                    showGeneralSuggestionModal();
                } else if (action === 'toggle-room-mute') {
                    toggleRoomAudioMute();
                } else if (action === 'mute') {
                    toggleVoiceMute();
                } else if (action === 'hand-queue') {
                    if (currentVoiceRoomId) showHandQueueSheet(currentVoiceRoomId);
                } else if (action === 'pk-challenge') {
                    if (currentVoiceRoomId) showPkChallengeModal({ id: currentVoiceRoomId });
                } else if (action === 'seat-challenge') {
                    if (currentVoiceRoomId) showSeatChallengeCreateModal({ id: currentVoiceRoomId });
                } else if (action === 'clear-chat') {
                    showClearChatConfirm();
                } else if (action === 'toggle-chat-lock') {
                    if (currentVoiceRoomId) socket.emit('host-toggle-chat-lock', { roomId: currentVoiceRoomId });
                }
            });
        });
    }

    // ✅ تأكيد صغير قبل حذف كل دردشة الغرفة نهائياً — إجراء لا يمكن التراجع عنه
    function showClearChatConfirm() {
        document.getElementById('clear-chat-confirm-modal')?.remove();
        const modal = document.createElement('div');
        modal.id = 'clear-chat-confirm-modal';
        modal.className = 'fixed inset-0 bg-black/60 flex items-center justify-center z-[70] p-4';
        modal.innerHTML = `
            <div class="bg-gray-800 rounded-xl shadow-xl p-5 w-full max-w-xs text-white text-center">
                <i class="fas fa-broom text-3xl text-amber-400 mb-3"></i>
                <p class="font-bold mb-1">تنظيف الدردشة؟</p>
                <p class="text-xs text-gray-400 mb-5">ستُحذف كل رسائل هذي الغرفة نهائياً لدى الجميع — لا يمكن التراجع</p>
                <div class="flex gap-3">
                    <button id="cancel-clear-chat" class="flex-1 bg-gray-700 hover:bg-gray-600 py-2.5 rounded-lg font-bold text-sm">تراجع</button>
                    <button id="confirm-clear-chat" class="flex-1 bg-red-600 hover:bg-red-700 py-2.5 rounded-lg font-bold text-sm">تنظيف</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.querySelector('#cancel-clear-chat').addEventListener('click', () => modal.remove());
        modal.querySelector('#confirm-clear-chat').addEventListener('click', () => {
            if (currentVoiceRoomId) socket.emit('host-clear-room-chat', { roomId: currentVoiceRoomId });
            modal.remove();
        });
    }

    // ✅ يحدّث شارة زر "المزيد" الموحّدة + ظهور أيقونتي "اطلب الصعود" (∞) و"مغادرة المقعد" بشريط الغرفة
    function updateHandRaiseUI() {
        const badge = document.getElementById('room-chat-more-badge');
        const isManager = currentRoomMyRole === 'host' || currentRoomMyRole === 'moderator';
        if (badge) {
            const total = roomUnreadDMCount + (isManager ? roomHandQueue.length : 0);
            badge.textContent = total > 9 ? '9+' : String(total);
            badge.classList.toggle('hidden', total === 0);
        }

        const isSeatedHere = myVoiceSeatNumber && myVoiceRoomId === currentVoiceRoomId;
        const isMainRoom = currentVoiceRoomId === 'main';
        // ✅ نفس زر (∞) بشريط الغرفة يتحوّل دوره حسب من يشاهده: للمضيف/المسؤول يصير مؤشر
        // طلبات الصعود (يظهر فقط عند وجود طلب فعلي، مع وميض بسيط)، ولبقية المستخدمين يبقى
        // بدوره الأصلي "اطلب الصعود" — بدل زر منفصل جديد
        const joinBtn = document.getElementById('room-join-request-btn');
        if (joinBtn) {
            let badge = joinBtn.querySelector('.room-chat-mini-badge');
            if (isManager) {
                const hasRequests = !isMainRoom && roomHandQueue.length > 0;
                joinBtn.classList.toggle('hidden', !hasRequests);
                joinBtn.classList.toggle('room-hand-queue-blink', hasRequests);
                joinBtn.classList.remove('join-request-pending');
                joinBtn.title = 'طلبات الصعود';
                if (hasRequests) {
                    if (!badge) {
                        badge = document.createElement('span');
                        badge.className = 'room-chat-mini-badge';
                        joinBtn.appendChild(badge);
                    }
                    badge.textContent = roomHandQueue.length > 9 ? '9+' : String(roomHandQueue.length);
                    badge.classList.remove('hidden');
                } else {
                    badge?.classList.add('hidden');
                }
            } else {
                joinBtn.classList.remove('room-hand-queue-blink');
                badge?.classList.add('hidden');
                joinBtn.classList.toggle('hidden', isSeatedHere || isMainRoom);
                joinBtn.classList.toggle('join-request-pending', myHandRaised);
                joinBtn.title = 'اطلب الصعود للمايك';
            }
        }
        const leaveBtn = document.getElementById('room-leave-seat-btn');
        if (leaveBtn) {
            // 🛡️ المضيف لا يقدر يغادر مقعده أبداً (السيرفر يرفض أصلاً) — الأيقونة تختفي له عمداً
            const isHostHere = isSeatedHere && currentRoomMyRole === 'host';
            leaveBtn.classList.toggle('hidden', !isSeatedHere || isHostHere);
        }
    }

    // ✅ يعكس حالة قفل الدردشة على حقل الكتابة — المضيف/المسؤولون يكتبون رغم القفل، الباقي يُمنع بصرياً
    // بالإضافة لمنع السيرفر فعلياً (دفاع ثنائي: لا يكفي إخفاء/تعطيل الواجهة وحده)
    function updateChatLockUI() {
        const input = document.getElementById('room-chat-input');
        const sendBtn = document.getElementById('room-chat-send-btn');
        if (!input) return;
        const isManager = currentRoomMyRole === 'host' || currentRoomMyRole === 'moderator';
        const blocked = currentRoomChatLocked && !isManager;
        input.disabled = blocked;
        input.placeholder = blocked ? 'الدردشة مقفلة من المضيف' : 'قل شيئاً...';
        sendBtn?.classList.toggle('opacity-40', blocked);
        if (sendBtn) sendBtn.disabled = blocked;
    }

    // ✅ شارة مستوى الغرفة الصغيرة برأس الغرفة — مخفية تماماً بالغرفة الرسمية (لا نظام مستوى
    // لها، currentRoomLevel تبقى null). لون متدرّج حسب المستوى (كلما ارتفع صار أفخم/أذهب)
    function updateRoomLevelBadgeUI() {
        const badge = document.getElementById('room-info-level-badge');
        if (!badge) return;
        if (currentRoomLevel === null) { badge.classList.add('hidden'); return; }
        badge.classList.remove('hidden');
        badge.className = `room-level-badge room-level-badge-${currentRoomLevel}`;
        badge.innerHTML = `<i class="fas fa-star"></i> Lv.${currentRoomLevel}`;
        badge.title = currentRoomPointsToNextLevel > 0
            ? `${currentRoomPointsToNextLevel.toLocaleString('en-US')} نقطة دعم للمستوى التالي`
            : 'أعلى مستوى!';
    }

    // ✅ شارة دعم جلسة البث الحالية برأس الغرفة — محل آيدي الغرفة الثابت الذي أُزيل من هناك
    // (يبقى متاحاً ببطاقة معلومات الغرفة ومنصّة الصدارة). تُصفَّر تلقائياً بكل بدء بث جديد
    function updateRoomSessionSupportUI() {
        const el = document.getElementById('room-info-session-support');
        const numEl = document.getElementById('room-info-session-support-num');
        if (!el || !numEl) return;
        if (currentRoomLevel === null) { el.classList.add('hidden'); return; }
        el.classList.remove('hidden');
        numEl.textContent = currentRoomSessionSupportPoints.toLocaleString('en-US');
    }

    // ✅ زر "اطلب الصعود" (∞) — أول ضغطة ترسل الطلب، وثاني ضغطة (والطلب لسا قائم) تفتح
    // نافذة سفلية بسيطة تسأل إن كنت تريد إلغاءه
    function sendSeatJoinRequest() {
        if (!currentVoiceRoomId || currentVoiceRoomId === 'main') return;
        if (myHandRaised) {
            showCancelJoinRequestSheet();
        } else {
            socket.emit('raise-hand', { roomId: currentVoiceRoomId });
            showNotification('تم إرسال طلب الصعود — بانتظار موافقة المضيف', 'info');
        }
    }

    function showCancelJoinRequestSheet() {
        document.getElementById('cancel-join-request-modal')?.remove();
        const modal = document.createElement('div');
        modal.id = 'cancel-join-request-modal';
        modal.className = 'fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50';
        modal.innerHTML = `
            <div class="bg-gray-800 rounded-t-2xl md:rounded-2xl shadow-xl p-5 w-full md:max-w-xs text-white text-center">
                <div class="w-10 h-1 bg-gray-600 rounded-full mx-auto mb-4 md:hidden"></div>
                <i class="fas fa-infinity text-3xl text-purple-400 mb-3"></i>
                <p class="text-sm text-gray-300 mb-5">طلب صعودك للمايك بانتظار رد المضيف</p>
                <div class="flex gap-3">
                    <button id="keep-join-request-btn" class="flex-1 bg-gray-700 hover:bg-gray-600 py-2.5 rounded-lg font-bold text-sm">إبقاء الطلب</button>
                    <button id="cancel-join-request-btn" class="flex-1 bg-red-600 hover:bg-red-700 py-2.5 rounded-lg font-bold text-sm">إلغاء الطلب</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.addEventListener('click', (e) => { if (e.target.id === 'cancel-join-request-modal') modal.remove(); });
        document.getElementById('keep-join-request-btn').addEventListener('click', () => modal.remove());
        document.getElementById('cancel-join-request-btn').addEventListener('click', () => {
            socket.emit('lower-hand', { roomId: currentVoiceRoomId });
            modal.remove();
        });
    }

    // ✅ القائمة المسندلة لطلبات الصعود — تظهر للمضيف/المسؤول فقط، بنفس أسلوب بقية النوافذ السفلية
    function showHandQueueSheet(roomId) {
        document.getElementById('hand-queue-modal')?.remove();
        const modal = document.createElement('div');
        modal.id = 'hand-queue-modal';
        modal.className = 'fixed inset-0 bg-black/60 flex items-end md:items-center justify-center z-50';

        function renderList() {
            if (roomHandQueue.length === 0) {
                return '<p class="text-center text-xs text-gray-500 py-8">لا توجد طلبات صعود حالياً</p>';
            }
            return roomHandQueue.map(h => `
                <div class="flex items-center gap-2.5 p-2 rounded-lg bg-gray-700/40" data-user-id="${h.userId}">
                    <img src="${h.profileImage}" class="w-9 h-9 rounded-full object-cover flex-shrink-0">
                    <span class="flex-1 text-sm truncate">${escapeHtml(h.username)}</span>
                    <button data-action="invite" class="w-8 h-8 rounded-full bg-emerald-600 hover:bg-emerald-700 flex items-center justify-center flex-shrink-0" title="دعوة لمقعد"><i class="fas fa-check text-xs"></i></button>
                    <button data-action="dismiss" class="w-8 h-8 rounded-full bg-gray-600 hover:bg-gray-500 flex items-center justify-center flex-shrink-0" title="رفض"><i class="fas fa-times text-xs"></i></button>
                </div>
            `).join('');
        }

        modal.innerHTML = `
            <div class="bg-gray-800 rounded-t-2xl md:rounded-2xl shadow-xl p-4 w-full md:max-w-sm text-white max-h-[70vh] overflow-y-auto">
                <h3 class="text-base font-bold mb-3"><i class="fas fa-hand-paper text-yellow-400"></i> طلبات الصعود للمايك</h3>
                <div id="hand-queue-list" class="space-y-2">${renderList()}</div>
                <button id="close-hand-queue" class="w-full text-center py-2 mt-3 rounded-lg bg-gray-700 text-gray-300 text-sm">إغلاق</button>
            </div>
        `;
        document.body.appendChild(modal);
        modal.addEventListener('click', (e) => { if (e.target.id === 'hand-queue-modal') modal.remove(); });
        document.getElementById('close-hand-queue').addEventListener('click', () => modal.remove());

        function wireRowButtons() {
            modal.querySelectorAll('#hand-queue-list [data-action]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const row = btn.closest('[data-user-id]');
                    const targetUserId = row?.dataset.userId;
                    if (!targetUserId) return;
                    if (btn.dataset.action === 'dismiss') {
                        socket.emit('host-dismiss-hand', { roomId, targetUserId });
                    } else {
                        const freeSeat = findFirstFreeSeatNumber();
                        if (freeSeat === null) {
                            showNotification('لا يوجد مقعد فاضٍ حالياً بالغرفة', 'info');
                            return;
                        }
                        socket.emit('host-invite-to-seat', { roomId, targetUserId, seatNumber: freeSeat });
                    }
                    row.remove();
                });
            });
        }
        wireRowButtons();
    }

    // ✅ أول مقعد فاضٍ غير مقفل وغير محجوز للإدارة (لاستخدام "دعوة لمقعد" السريعة من قائمة الطلبات)
    function findFirstFreeSeatNumber() {
        const voiceGrid = document.getElementById('voice-chat-grid');
        if (!voiceGrid) return null;
        const seats = Array.from(voiceGrid.querySelectorAll('.voice-seat'));
        const free = seats.find(s => s.dataset.isAdminSeat !== '1' && s.dataset.isLocked !== '1' && !s.dataset.userId);
        return free ? parseInt(free.dataset.seat) : null;
    }

    // ✅ ضغط المضيف على مقعد فاضٍ يفتح هذي الورقة: قائمة الحاضرين بالغرفة (غير الجالسين
    // فعلياً على مقعد آخر) ليدعو أحدهم صراحة لهذا المقعد تحديداً — القبول من طرفه (وليس
    // إجلاساً فورياً)؛ نفس مصدر بيانات ورقة "المشاهدون" (room-viewers-list) بتصفية مختلفة
    let seatInvitePickerViewers = null; // ✅ نتيجة آخر get-room-viewers — تُستخدم لتصفية البحث محلياً بلا طلب سيرفر جديد بكل حرف
    function showInviteToSeatSheet(roomId, seatNumber) {
        document.getElementById('seat-invite-picker-modal')?.remove();
        seatInvitePickerViewers = null;
        const modal = document.createElement('div');
        modal.id = 'seat-invite-picker-modal';
        modal.dataset.seatNumber = seatNumber;
        modal.className = 'fixed inset-0 bg-black/60 flex items-end md:items-center justify-center z-50 p-3';
        modal.innerHTML = `
            <div class="seat-invite-picker-sheet w-full md:max-w-sm text-white flex flex-col">
                <div class="w-10 h-1 bg-gray-600 rounded-full mx-auto mt-2.5 mb-2 md:hidden flex-shrink-0"></div>
                <div class="px-4 pt-1 pb-2.5 flex-shrink-0">
                    <div class="flex items-center justify-between gap-2 mb-2.5">
                        <h3 class="text-sm font-bold flex items-center gap-2">
                            <i class="fas fa-user-plus text-purple-400"></i> ادعُ أحداً للمقعد ${seatNumber}
                        </h3>
                        <button type="button" id="seat-invite-lock-btn" class="seat-invite-lock-btn" title="قفل هذا المقعد بدل دعوة أحد">
                            <i class="fas fa-lock"></i> قفل المقعد
                        </button>
                    </div>
                    <div class="seat-invite-search-wrap">
                        <i class="fas fa-magnifying-glass"></i>
                        <input id="seat-invite-search" type="text" placeholder="ابحث بالاسم..." autocomplete="off">
                    </div>
                </div>
                <div id="seat-invite-picker-list" class="space-y-1.5 px-3 pb-4 overflow-y-auto">
                    <div class="text-center text-gray-400 py-10"><i class="fas fa-spinner fa-spin"></i></div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.addEventListener('click', (e) => { if (e.target.id === 'seat-invite-picker-modal') modal.remove(); });
        modal.querySelector('#seat-invite-search').addEventListener('input', (e) => {
            renderSeatInvitePickerRows(e.target.value.trim());
        });
        // ✅ بديل مباشر لدعوة أحد — يقفل المقعد الفاضي نفسه بدل انتظار اختيار شخص
        modal.querySelector('#seat-invite-lock-btn').addEventListener('click', () => {
            socket.emit('host-toggle-lock-seat', { roomId, seatNumber, desiredLock: true });
            modal.remove();
            showNotification(`تم قفل المقعد ${seatNumber} ✅`, 'success');
        });
        socket.emit('get-room-viewers', { roomId });
    }

    // ✅ يستثني من هم جالسون فعلياً على مقعد آخر بالغرفة، ويطبّق فلتر البحث الحالي (إن وُجد)
    function renderSeatInvitePickerList(viewers) {
        seatInvitePickerViewers = viewers;
        const searchInput = document.getElementById('seat-invite-search');
        renderSeatInvitePickerRows(searchInput ? searchInput.value.trim() : '');
    }

    function renderSeatInvitePickerRows(searchTerm) {
        const pickerModal = document.getElementById('seat-invite-picker-modal');
        const pickerList = document.getElementById('seat-invite-picker-list');
        if (!pickerModal || !pickerList || !seatInvitePickerViewers) return;

        const seatedIds = new Set(Array.from(document.querySelectorAll('#voice-chat-grid [data-user-id]')).map(el => el.dataset.userId));
        const term = (searchTerm || '').toLowerCase();
        const invitable = seatInvitePickerViewers.filter(v =>
            !seatedIds.has(v.id) && (!term || v.username.toLowerCase().includes(term))
        );

        if (invitable.length === 0) {
            pickerList.innerHTML = `<p class="text-center text-xs text-gray-500 py-10">${term ? 'لا نتائج مطابقة' : 'لا يوجد أحد متاح للدعوة حالياً'}</p>`;
            return;
        }

        pickerList.innerHTML = invitable.map(v => `
            <div class="seat-invite-picker-row">
                <img src="${v.profileImage}" class="seat-invite-picker-avatar">
                <span class="seat-invite-picker-name">${escapeHtml(v.username)}</span>
                <button type="button" class="seat-invite-picker-btn" data-user-id="${v.id}" data-username="${escapeHtml(v.username)}">
                    <i class="fas fa-paper-plane"></i> دعوة
                </button>
            </div>
        `).join('');
        pickerList.querySelectorAll('.seat-invite-picker-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const seatNumber = parseInt(pickerModal.dataset.seatNumber);
                socket.emit('host-invite-to-seat', { roomId: currentVoiceRoomId, targetUserId: btn.dataset.userId, seatNumber });
                pickerModal.remove();
                showNotification(`تم إرسال الدعوة لـ ${btn.dataset.username}`, 'success');
            });
        });
    }

    // ✅ نافذة أنيقة تصل للمدعو عند دعوة المضيف له لمقعد محدد — قبول/رفض صريحان، لا إجلاس
    // فوري قبل رده. لمسة حسّية عند القبول (اهتزاز خفيف + نبضة بصرية) قبل الإغلاق مباشرة
    function showSeatInviteReceivedModal({ roomId, roomName, seatNumber, fromUsername, fromProfileImage, expiresInMs }) {
        document.getElementById('seat-invite-received-modal')?.remove();
        const modal = document.createElement('div');
        modal.id = 'seat-invite-received-modal';
        modal.className = 'fixed inset-0 bg-black/70 flex items-center justify-center z-[310] p-4';
        modal.innerHTML = `
            <div class="seat-invite-card">
                <div class="seat-invite-avatar-wrap">
                    <img src="${fromProfileImage || ''}" class="seat-invite-avatar">
                    <span class="seat-invite-mic-badge"><i class="fas fa-microphone"></i></span>
                </div>
                <p class="seat-invite-title">${escapeHtml(fromUsername || '')} يدعوك للصعود 🎤</p>
                <p class="seat-invite-sub">${escapeHtml(roomName || '')} — المقعد ${seatNumber}</p>
                <div class="seat-invite-actions">
                    <button type="button" id="seat-invite-decline-btn" class="seat-invite-decline-btn">رفض</button>
                    <button type="button" id="seat-invite-accept-btn" class="seat-invite-accept-btn">
                        <i class="fas fa-check"></i> قبول
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        let responded = false;
        const respond = (accept) => {
            if (responded) return;
            responded = true;
            clearTimeout(autoExpireTimer);
            socket.emit('seat-invite-respond', { roomId, accept });
            modal.remove();
        };

        document.getElementById('seat-invite-accept-btn').addEventListener('click', (e) => {
            if (navigator.vibrate) navigator.vibrate(35); // ✅ لمسة حسّية بالهاتف لو مدعومة (لا تكسر شيئاً لو غير مدعومة)
            e.currentTarget.classList.add('seat-invite-accept-pop');
            setTimeout(() => respond(true), 160);
        });
        document.getElementById('seat-invite-decline-btn').addEventListener('click', () => respond(false));

        const autoExpireTimer = setTimeout(() => { if (!responded) { responded = true; modal.remove(); } }, expiresInMs || 25000);
    }

    // ✅ حالة الرسائل الخاصة الواردة أثناء التواجد داخل غرفة (وضع ملء الشاشة)
    let roomUnreadDMCount = 0;
    let lastRoomDMSender = null; // { id, username, profileImage }

    // ✅ الأيقونة المخصصة للرسائل انتقلت لقائمة "المزيد"، فتحديث الشارة يمر بنفس الدالة الموحّدة
    function updateRoomMessagesBadge() {
        updateHandRaiseUI();
    }

    function clearRoomMessagesBadge() {
        roomUnreadDMCount = 0;
        updateRoomMessagesBadge();
    }

    // ✅ فقاعة رسالة واردة عائمة (بأسلوب ماسنجر) — قابلة للسحب، تلتصق بأقرب جانب،
    // والسحب للأسفل يخفيها (تبقى الشارة بأيقونة الرسائل كمرجع دائم بديل عن الشريط السفلي المخفي)
    function showIncomingDMBubble(senderId, senderName, profileImage) {
        document.getElementById('dm-floating-bubble')?.remove();

        const bubble = document.createElement('div');
        bubble.id = 'dm-floating-bubble';
        bubble.className = 'dm-floating-bubble';
        bubble.style.top = '110px';
        bubble.style.right = '10px';
        bubble.innerHTML = `<img src="${profileImage}" class="w-full h-full rounded-full object-cover" alt="${escapeHtml(senderName)}">`;
        document.body.appendChild(bubble);

        let dragging = false, moved = false, startX = 0, startY = 0, origX = 0, origY = 0;

        bubble.addEventListener('pointerdown', (e) => {
            dragging = true;
            moved = false;
            startX = e.clientX;
            startY = e.clientY;
            const rect = bubble.getBoundingClientRect();
            origX = rect.left;
            origY = rect.top;
            bubble.setPointerCapture(e.pointerId);
        });

        bubble.addEventListener('pointermove', (e) => {
            if (!dragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            if (Math.abs(dx) > 5 || Math.abs(dy) > 5) moved = true;
            bubble.style.left = `${origX + dx}px`;
            bubble.style.top = `${origY + dy}px`;
            bubble.style.right = 'auto';
        });

        bubble.addEventListener('pointerup', () => {
            dragging = false;
            const rect = bubble.getBoundingClientRect();

            // ✅ سحب للأسفل بشكل كبير = إخفاء الفقاعة (الشارة تبقى بأيقونة الرسائل كمرجع)
            if (rect.top > window.innerHeight - 90) {
                bubble.remove();
                return;
            }

            if (!moved) {
                // ✅ ضغطة بسيطة بدون سحب = فتح نافذة الدردشة المصغّرة مباشرة
                bubble.remove();
                clearRoomMessagesBadge();
                openPrivateChat(senderId, senderName, true);
                return;
            }

            // ✅ الالتصاق بأقرب جانب بحركة أنيقة
            bubble.classList.add('dm-bubble-snapping');
            const snapLeft = rect.left < window.innerWidth / 2;
            bubble.style.left = snapLeft ? '8px' : 'auto';
            bubble.style.right = snapLeft ? 'auto' : '8px';
            setTimeout(() => bubble.classList.remove('dm-bubble-snapping'), 220);
        });
    }

    function sendRoomChatMessage() {
        const input = document.getElementById('room-chat-input');
        if (!input || !roomChatCurrentRoomId) return;
        const text = input.value.trim();
        if (!text) return;
        socket.emit('send-room-message', { roomId: roomChatCurrentRoomId, message: text });
        input.value = '';
        input.focus(); // ✅ يبقى الحقل جاهزاً مباشرة لرسالة تالية سريعة، بدون إغلاقه
    }

    // ✅ لون اسم ثابت لكل مستخدم (مُشتق من معرّفه) — بديل اللون الموحّد السابق، بنفس أسلوب
    // دردشات البث المباشر المعروفة (كل معلّق له لون اسم مميّز يسهّل تتبع الكلام بمحادثة مزدحمة)
    const ROOM_CHAT_NAME_COLORS = ['#f472b6', '#a78bfa', '#60a5fa', '#34d399', '#fbbf24', '#fb7185', '#22d3ee', '#c084fc'];
    function getChatNameColor(userId) {
        if (!userId) return ROOM_CHAT_NAME_COLORS[0];
        let hash = 0;
        for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
        return ROOM_CHAT_NAME_COLORS[hash % ROOM_CHAT_NAME_COLORS.length];
    }

    // ✅ سطر واحد متدفّق (اسم ملوّن + نص) بدل اسم فوق النص بسطرين — نفس أسلوب دردشات
    // البث المباشر المعروفة (Bigo/Yalla/TikTok Live)، وخلفية فقاعة موحّدة للجميع (الاسم
    // الملوّن كافٍ لتمييز المتكلم، فلا داعي لتلوين مختلف "لرسالتي" مقابل البقية)
    function appendRoomChatMessage(msg) {
        const box = document.getElementById('room-chat-messages');
        if (!box) return;
        const el = document.createElement('div');
        el.dataset.msgId = msg._id;
        const senderId = msg.sender?._id || '';
        const isHostMsg = !!currentRoomHostId && senderId === currentRoomHostId;
        const bubbleClass = msg.sender?.activeBubbleSkinClass || 'room-chat-bubble-default';
        el.className = `room-chat-message ${bubbleClass}`;
        const safeName = escapeHtml(msg.sender?.username || '');
        const safeContent = escapeHtml(msg.content || '');
        const avatar = msg.sender?.profileImage || 'https://i.ibb.co/601T5nRV/7d580cf284dbd895ae2db4b598ec8bb2.jpg';
        const frameClass = msg.sender?.activeFrameClass || '';
        el.innerHTML = `
            <img src="${avatar}" class="room-chat-msg-avatar ${frameClass}" alt="">
            <p class="room-chat-msg-line">
                ${isHostMsg ? '<i class="fas fa-crown room-chat-host-badge" title="المضيف"></i>' : ''}<span class="room-chat-msg-name" style="color:${getChatNameColor(senderId)}">${safeName}</span><span class="room-chat-msg-text">${safeContent}</span>
            </p>
        `;
        // ✅ يتابع آخر الرسائل تلقائياً فقط لو كنت أصلاً قريباً من الأسفل — لو مرّرت للأعلى
        // عمداً لقراءة سجل قديم، وصول رسالة جديدة (أو استكمال العرض التدريجي) ما يخطفك
        // للأسفل من جديد؛ بالضبط سلوك أي تطبيق دردشة حقيقي
        const wasNearBottom = (box.scrollHeight - box.scrollTop - box.clientHeight) < 80;
        box.appendChild(el);
        if (wasNearBottom) box.scrollTop = box.scrollHeight;
    }

    // ✅ إعلان انضمام — سطر مختصر بدردشة الغرفة "فلان انضم"، وللمضيف/المسؤول زر يد صغير
    // بجانبه يرسل ترحيباً عشوائياً بمنشن اسم الشخص تلقائياً
    const GREETING_PHRASES = ['أهلاً وسهلاً', 'نورت الغرفة', 'حياك الله', 'مرحباً فيك', 'يا هلا فيك'];
    function appendJoinAnnouncement(userId, username, profileImage) {
        const box = document.getElementById('room-chat-messages');
        if (!box || userId === myUserId) return; // ✅ ما في داعي أشعر نفسي بإني انضممت
        const isManager = currentRoomMyRole === 'host' || currentRoomMyRole === 'moderator';
        const safeName = escapeHtml(username || '');
        const el = document.createElement('div');
        el.className = 'room-chat-join-announcement';
        el.innerHTML = `
            <img src="${profileImage}" class="room-chat-join-avatar">
            <span class="room-chat-join-text"><b>${safeName}</b> انضم إلى الغرفة</span>
            ${isManager ? `<button class="room-chat-greet-btn" data-username="${safeName}" title="رحّب فيه"><i class="fas fa-hand-sparkles"></i></button>` : ''}
        `;
        el.querySelector('.room-chat-greet-btn')?.addEventListener('click', (e) => {
            const btn = e.currentTarget;
            const phrase = GREETING_PHRASES[Math.floor(Math.random() * GREETING_PHRASES.length)];
            socket.emit('send-room-message', { roomId: currentVoiceRoomId, message: `@${btn.dataset.username} ${phrase} 👋` });
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-check"></i>';
        });
        box.appendChild(el);
        box.scrollTop = box.scrollHeight;
    }

    // ✅ يُستدعى عند فتح أي غرفة — ينضم لقناة دردشتها ويحمّل آخر رسائلها
    async function enterRoomChat(roomId) {
        if (roomChatCurrentRoomId) socket.emit('leave-room-chat', { roomId: roomChatCurrentRoomId });
        roomChatCurrentRoomId = roomId;
        floatingMusicDismissed = false; // ✅ غرفة جديدة — يظهر المشغّل العائم من جديد لو فيها أغنية شغّالة
        socket.emit('join-room-chat', { roomId });
        socket.emit('get-room-viewers', { roomId }); // ✅ يملأ شريط صور المشاهدين فوراً عند الدخول

        try {
            const response = await fetch(`/api/voice-room/rooms/${roomId}/messages`, { headers: { 'Authorization': `Bearer ${token}` } });
            const result = await response.json();
            if (response.ok && result.status === 'success') {
                revealRoomChatHistory(result.messages, roomId);
            }
        } catch (error) {
            console.error('Failed to load room messages:', error);
        }
    }

    // ✅ يُستدعى بعد إعادة اتصال السوكيت (وليس أول دخول) لاستعادة عضوية قناة دردشة الغرفة
    // فقط — بلا إعادة عرض تدريجي للسجل كاملاً (كنت أصلاً أشاهده)، فقط استدراك أي رسائل
    // فعلية وصلت أثناء الانقطاع القصير (لا يُكرّر ما هو معروض أصلاً بالواجهة)
    function rejoinRoomChatChannel(roomId) {
        if (!roomId) return;
        socket.emit('join-room-chat', { roomId });
        socket.emit('get-room-viewers', { roomId });

        fetch(`/api/voice-room/rooms/${roomId}/messages`, { headers: { 'Authorization': `Bearer ${token}` } })
            .then(r => r.json())
            .then(result => {
                if (result.status !== 'success' || roomChatCurrentRoomId !== roomId) return;
                const box = document.getElementById('room-chat-messages');
                if (!box) return;
                const existingIds = new Set(Array.from(box.children).map(el => el.dataset.msgId));
                result.messages.filter(m => !existingIds.has(m._id)).forEach(appendRoomChatMessage);
            })
            .catch(error => console.error('[ROOM CHAT] Reconnect catch-up error:', error));
    }

    // ✅ عرض سجل الدردشة تدريجياً رسالة تلو الأخرى (بفارق قصير) بدل دفعة واحدة جامدة — إحساس
    // "محادثة جارية الآن" بدل جدار نص، بنفس أسلوب التطبيقات المشهورة (Bigo/Yalla/TikTok Live).
    // الفارق قصير عمداً (وليس التوقيت الحقيقي الفعلي بين الرسائل) وله سقف إجمالي، حتى لا يطول
    // انتظار من يفتح غرفة بسجل طويل (حتى 50 رسالة)
    function revealRoomChatHistory(messages, roomId) {
        if (!messages.length) return;
        // ✅ فارق "جميل ومحسوب" (300ms) بدل الومضة السريعة السابقة — إحساس تدرّج حقيقي
        // وكأن الأشخاص يتحدثون الآن. يشمل فقط آخر STAGGER_COUNT رسالة (الأحدث/الأقرب
        // لسياق المحادثة الحالية)؛ الأقدم من ذلك يظهر فوراً كخلفية ثابتة للمحادثة حتى لا
        // يطول الانتظار عبثاً مع سجل يصل حتى 50 رسالة
        const STAGGER_STEP_MS = 300;
        const STAGGER_COUNT = 12;
        const instantCount = Math.max(0, messages.length - STAGGER_COUNT);

        messages.slice(0, instantCount).forEach(appendRoomChatMessage);

        messages.slice(instantCount).forEach((msg, i) => {
            setTimeout(() => {
                if (roomChatCurrentRoomId !== roomId) return; // ✅ غادر الغرفة قبل اكتمال العرض — تجاهل
                appendRoomChatMessage(msg);
            }, i * STAGGER_STEP_MS);
        });
    }

    // ✅ يُستدعى عند مغادرة شاشة الغرفة (رجوع لقائمة التصفح أو قسم آخر) — يغادر قناة الدردشة فقط
    // (الواجهة نفسها تختفي تلقائياً مع استبدال محتوى الغرفة، بما إنها أصبحت جزءاً من قالبها)
    function leaveRoomChatUI() {
        if (roomChatCurrentRoomId) socket.emit('leave-room-chat', { roomId: roomChatCurrentRoomId });
        roomChatCurrentRoomId = null;
        applyMusicState(null);
    }

    // ✅ وضع "الغرفة ملء الشاشة" — يخفي هيدر المنصة والتنقّل بالكامل، بالضبط زي التطبيقات المشهورة
    function enterFullscreenRoomMode() {
        document.body.classList.add('in-voice-room');
    }
    function exitFullscreenRoomMode() {
        document.body.classList.remove('in-voice-room');
        document.getElementById('dm-floating-bubble')?.remove();
        applyRoomBackground(null);
    }

    // =====================================================
    // ✅ متصفح الغرف الصوتية (المرحلة 2 — نظام الغرف المتعددة)
    // =====================================================
    function renderRoomCard(room) {
        const hostName = room.host ? room.host.username : 'الإدارة';
        const hostImg = room.host ? room.host.profileImage : 'https://i.ibb.co/601T5nRV/7d580cf284dbd895ae2db4b598ec8bb2.jpg';
        const badge = room.isOfficial
            ? '<span class="arena-card-tag arena-card-tag-official"><i class="fas fa-crown"></i> رسمية</span>'
            : (room.isPrivate ? '<span class="arena-card-tag arena-card-tag-private"><i class="fas fa-lock"></i></span>' : '');
        const cover = room.coverImage
            ? `<img src="${room.coverImage}" class="arena-card-cover-img">`
            : `<div class="arena-card-cover-placeholder"><i class="fas fa-microphone-lines"></i></div>`;
        const isHot = room.occupied >= Math.max(4, room.seatCount * 0.5);
        const levelBadge = (!room.isOfficial && room.level) ? `<span class="arena-card-level room-level-badge room-level-badge-${room.level}">Lv.${room.level}</span>` : '';

        const card = document.createElement('div');
        card.className = 'arena-room-card';
        card.dataset.roomId = room.id;
        card.innerHTML = `
            <div class="arena-card-cover-wrap">
                ${cover}
                ${badge}
                ${levelBadge}
                ${room.roomCode ? `<span class="arena-card-id-tag">ID: ${room.roomCode}</span>` : ''}
                ${isHot ? '<span class="arena-card-hot-tag">🔥</span>' : ''}
            </div>
            <div class="arena-card-body">
                <p class="arena-card-name">${escapeHtml(room.name)}</p>
                <div class="arena-card-host-row">
                    <img src="${hostImg}" class="arena-card-host-img">
                    <span class="arena-card-host-name">${escapeHtml(hostName)}</span>
                </div>
                <div class="arena-card-stats-row">
                    <span class="arena-card-occupancy"><i class="fas fa-headphones"></i> ${room.occupied}/${room.seatCount}</span>
                    ${room.followersCount > 0 ? `<span class="arena-card-followers"><i class="fas fa-heart"></i> ${room.followersCount}</span>` : ''}
                </div>
            </div>
        `;
        card.addEventListener('click', () => enterVoiceRoom(room));
        return card;
    }

    // ✅ بطاقات هيكلية (skeleton) بمكان القائمة أثناء التحميل — إحساس أسرع وأكثر احترافية
    // من شبكة فارغة تماماً حتى وصول الرد
    function renderRoomCardSkeletons(count = 8) {
        return Array.from({ length: count }, () => `
            <div class="arena-room-card arena-room-card-skeleton">
                <div class="arena-card-cover-wrap arena-skeleton-block"></div>
                <div class="arena-card-body">
                    <div class="arena-skeleton-line" style="width:70%"></div>
                    <div class="arena-skeleton-line" style="width:45%; margin-top:6px;"></div>
                </div>
            </div>
        `).join('');
    }

    // ✅ التصفح الكامل: يغادر أي غرفة كنت بها فعلياً (يُلغي الاشتراك بقناتها، يوقف موسيقاها)
    // قبل رسم قائمة الغرف — هذا هو مسار "مغادرة حقيقية"، وليس المسار المستخدم عند التصغير
    async function showRoomBrowserView() {
        currentVoiceRoomId = null;
        leaveRoomChatUI();
        exitFullscreenRoomMode();
        teardownAllVoicePeers(); // 🐛 إصلاح: كنت "مشاهداً" مستمعاً فقط قد لا يصدر له أي user-left-seat إطلاقاً
        renderRoomBrowserContent();
    }

    // 🐛 إصلاح جوهري: كانت showRoomBrowserView دائماً تُنادى عند "تصغير" الغرفة أيضاً، لكنها
    // تُصفّر currentVoiceRoomId وتغادر قناة دردشة الغرفة (leave-room-chat) وتوقف الموسيقى —
    // أي إن "التصغير" كان فعلياً يقطع كل شيء (الصوت، الدردشة، تحديثات الهدايا) بدل إبقائها
    // تعمل بالخلفية كما هو مقصود منه تماماً. الآن رسم واجهة التصفح مفصول تماماً عن مغادرة
    // الغرفة فعلياً — التصغير يستدعي هذي الدالة مباشرة بلا أي تصفير لحالة الغرفة
    // ✅ إعادة هيكلة الصفحة الرئيسية (شاشة "الرئيسية" بالتنقّل — تصفح الغرف): رأس مضغوط بزر
    // اختصار مباشر لمنصّة الصدارة، شريط بحث/فرز موحَّد، بطاقات أكثر اكتناز (شارة مستوى +
    // متابعين + سخونة)، وهياكل تحميل (skeletons) بدل شبكة فارغة أثناء الجلب
    function renderRoomBrowserContent() {
        mainContent.innerHTML = `
            <div class="arena-header">
                <div class="min-w-0">
                    <h2 class="arena-header-title"><i class="fas fa-microphone-lines"></i> غرف الدردشة الصوتية</h2>
                    <p class="arena-header-sub">انضم لغرفة الآن أو أنشئ غرفتك الخاصة</p>
                </div>
                <button id="arena-rankings-shortcut" class="arena-rankings-shortcut" title="غرف الصدارة">
                    <i class="fas fa-trophy"></i>
                </button>
            </div>
            <div class="arena-toolbar">
                <div class="arena-search-box">
                    <i class="fas fa-search"></i>
                    <input id="room-search-input" type="text" placeholder="ابحث بالاسم أو آيدي الغرفة...">
                </div>
                <div class="arena-sort-tabs">
                    <button class="room-sort-tab active" data-sort="newest">الأحدث</button>
                    <button class="room-sort-tab" data-sort="active">الأكثر نشاطاً</button>
                </div>
            </div>
            <div id="room-list-grid" class="arena-room-grid">${renderRoomCardSkeletons()}</div>
            <div id="room-list-empty" class="hidden arena-empty-state">
                <i class="fas fa-microphone-slash"></i>
                <p>لا توجد غرف مطابقة حالياً</p>
            </div>
            <button id="create-room-fab" class="arena-create-fab" title="إنشاء غرفة جديدة">
                <i class="fas fa-plus"></i>
            </button>
        `;

        let currentSort = 'newest';
        let searchDebounce = null;

        async function loadRooms() {
            const grid = document.getElementById('room-list-grid');
            const empty = document.getElementById('room-list-empty');
            if (!grid) return;
            const search = document.getElementById('room-search-input')?.value || '';
            try {
                const params = new URLSearchParams({ sort: currentSort, search, limit: 30 });
                const response = await fetch(`/api/voice-room/rooms?${params}`, { headers: { 'Authorization': `Bearer ${token}` } });
                const result = await response.json();
                if (!response.ok || result.status !== 'success') return;
                grid.innerHTML = '';
                result.rooms.forEach(room => grid.appendChild(renderRoomCard(room)));
                empty.classList.toggle('hidden', result.rooms.length > 0);
            } catch (error) {
                console.error('Failed to load rooms:', error);
            }
        }

        document.getElementById('room-search-input').addEventListener('input', () => {
            clearTimeout(searchDebounce);
            searchDebounce = setTimeout(loadRooms, 350);
        });

        mainContent.querySelectorAll('.room-sort-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                currentSort = tab.dataset.sort;
                mainContent.querySelectorAll('.room-sort-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                loadRooms();
            });
        });

        document.getElementById('arena-rankings-shortcut').addEventListener('click', () => {
            goToRoomRankingsLeaderboard();
        });

        // ✅ أيقونة الإنشاء: عنده غرفة بالفعل → تدخله لها مباشرة (غرفة واحدة فقط لكل مستخدم)
        document.getElementById('create-room-fab').addEventListener('click', async () => {
            try {
                const response = await fetch('/api/voice-room/my-room', { headers: { 'Authorization': `Bearer ${token}` } });
                const result = await response.json();
                if (result.status === 'success' && result.room) {
                    enterVoiceRoom(result.room);
                } else {
                    showCreateRoomModal();
                }
            } catch (error) {
                showCreateRoomModal();
            }
        });

        loadRooms();
    }

    let currentRoomPassword = null; // ✅ كلمة المرور المُتحقق منها للغرفة المعروضة حالياً (لإعادة المزامنة عند إعادة الاتصال)
    let currentRoomMyRole = 'guest'; // ✅ دوري بالغرفة المعروضة حالياً: host / moderator / guest
    let currentRoomModerators = []; // ✅ قائمة مسؤولي الغرفة المعروضة حالياً (لعرضهم بنافذة الإعدادات)
    let currentRoomHostId = null; // ✅ معرّف مضيف الغرفة المعروضة حالياً (لعرض تاج المضيف بجانب اسمه بالدردشة)
    let currentRoomIsLocked = false;
    let currentRoomChatLocked = false; // ✅ قفل الدردشة (المضيف/المسؤولون فقط يكتبون) — الغرفة المعروضة حالياً
    // ✅ نظام مستوى الغرفة (1-5) — يرتفع بتراكم قيمة الهدايا المُرسَلة داخلها، ويفتح توسيع
    // المقاعد تدريجياً. null بالغرفة الرسمية (لا نظام مستوى لها). انظر VoiceRoom.js بالسيرفر
    let currentRoomLevel = null;
    let currentRoomSupportPoints = 0;
    let currentRoomSessionSupportPoints = 0; // ✅ دعم هذي الجلسة فقط — يُصفَّر بكل بدء بث جديد، يُعرض برأس الغرفة بدل الآيدي
    let currentRoomPointsToNextLevel = 0;
    let currentRoomLevelProgressPercent = 0;
    let currentRoomUnlockedSeatCounts = [9];
    let currentRoomKickedUsers = []; // ✅ للمضيف/المسؤولين فقط — تُعرَض بنافذة الإعدادات مع خيار إلغاء الطرد
    let currentRoomBannedWords = []; // ✅ للمضيف فقط — كلمات إضافية يحظرها بدردشة غرفته تحديداً
    let voiceSnapshotFetchSeq = 0; // ✅ حماية fetchAndRenderVoiceSnapshot من استجابات متأخرة خارج الترتيب
    let currentRoomBackgroundImage = null;
    let currentRoomBackgroundExpiresAt = null;
    let currentRoomDescription = '';
    let currentRoomHostUsername = ''; // ✅ لعرضه ببطاقة معلومات الغرفة (المالك)
    let currentRoomHostProfileImage = '';
    let currentRoomFollowersCount = 0;
    let currentRoomIsFollowing = false;
    let currentRoomCode = null; // ✅ آيدي الغرفة القصير القابل للبحث — يُعرض برأس الغرفة
    let currentRoomCoverImage = null;

    // ✅ يطبّق خلفية الغرفة خلف كل شيء (المقاعد/الدردشة/الأيقونات) لكن داخل إطارها فقط
    function applyRoomBackground(url) {
        if (!mainContent) return;
        if (url) {
            mainContent.style.backgroundImage = `linear-gradient(rgba(17,24,39,0.55), rgba(17,24,39,0.55)), url(${url})`;
            mainContent.style.backgroundSize = 'cover';
            mainContent.style.backgroundPosition = 'center';
        } else {
            mainContent.style.backgroundImage = 'none';
        }
    }

    function enterVoiceRoom(room, password) {
        if (room.isOfficial) {
            showVoiceRoomsView();
            return;
        }
        const isOwner = room.host && (room.host._id === myUserId || room.host === myUserId);
        if (room.isPrivate && !isOwner && !password) {
            promptRoomPassword((pwd) => enterVoiceRoom(room, pwd));
            return;
        }
        showCustomRoomView(room, password || null);
    }

    // ✅ نافذة كلمة مرور أنيقة للغرف الخاصة — بنفس أسلوب نوافذ التطبيق الأخرى (بدل prompt المتصفح الافتراضي)
    function promptRoomPassword(onConfirm) {
        const modal = document.createElement('div');
        modal.id = 'room-password-modal';
        modal.className = 'fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4';
        modal.innerHTML = `
            <div class="bg-gray-800 rounded-xl shadow-xl p-6 w-full max-w-xs text-white">
                <h3 class="text-base font-bold mb-3"><i class="fas fa-lock text-amber-400"></i> غرفة خاصة</h3>
                <input type="password" id="room-password-input" placeholder="كلمة المرور" class="w-full bg-gray-700 border border-gray-600 rounded-lg p-2 mb-4 focus:ring-purple-500 focus:border-purple-500">
                <div class="flex justify-end gap-2">
                    <button id="room-password-cancel" class="bg-gray-600 hover:bg-gray-500 text-white py-2 px-4 rounded-lg text-sm">إلغاء</button>
                    <button id="room-password-confirm" class="bg-purple-600 hover:bg-purple-700 text-white py-2 px-4 rounded-lg text-sm">دخول</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        const input = modal.querySelector('#room-password-input');
        input.focus();
        modal.querySelector('#room-password-cancel').addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => { if (e.target.id === 'room-password-modal') modal.remove(); });
        const confirm = () => {
            const pwd = input.value;
            modal.remove();
            onConfirm(pwd);
        };
        modal.querySelector('#room-password-confirm').addEventListener('click', confirm);
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') confirm(); });
    }

    // ✅ غرفة أنشأها مستخدم — قابلة للجلوس فعلياً الآن (نفس منطق الغرفة الرسمية، خاص بهذي الغرفة فقط)
    async function showCustomRoomView(room, password) {
        // ✅ الدخول لغرفة أخرى يُنزلني تلقائياً من مقعدي بالغرفة السابقة (لا يمكن التواجد بغرفتين) —
        // إلا لو كنت مضيف تلك الغرفة (مقعد 1 بغرفة مستخدم لا بالرسمية): يبقى بثّي شغّالاً وأنا
        // أتصفح مكاناً آخر، فالسيرفر أصلاً يرفض إنزال المضيف من مقعده (ينهي البث بدل ذلك)
        const wasMyOwnHostSeat = myVoiceSeatNumber === 1 && myVoiceRoomId !== 'main';
        if (myVoiceSeatNumber && myVoiceRoomId && myVoiceRoomId !== room.id && !wasMyOwnHostSeat) {
            leaveVoiceSeat();
        }
        currentVoiceRoomId = room.id;
        currentRoomPassword = password || null;
        currentRoomMyRole = 'guest';
        currentRoomHostId = null;
        currentRoomIsLocked = false;
        currentRoomChatLocked = false;
        currentRoomBackgroundImage = null;
        currentRoomDescription = '';
        currentRoomHostUsername = room.host?.username || '';
        currentRoomHostProfileImage = room.host?.profileImage || '';
        currentRoomFollowersCount = 0;
        currentRoomIsFollowing = false;
        currentRoomCode = room.roomCode || null;
        currentRoomCoverImage = room.coverImage || null;
        myHandRaised = false;
        roomHandQueue = [];
        currentPkBattle = null;
        enterFullscreenRoomMode();
        mainContent.innerHTML = `
            <div id="room-header-bar" class="flex justify-between items-center mb-3 gap-2">
                <div id="room-info-card-widget" class="room-info-card-widget">
                    <button id="room-info-trigger-btn" class="room-info-trigger" title="معلومات الغرفة">
                        <img id="room-info-cover-img" src="${room.coverImage || 'https://i.ibb.co/601T5nRV/7d580cf284dbd895ae2db4b598ec8bb2.jpg'}" class="room-info-cover-img">
                        <span class="min-w-0 flex flex-col items-start">
                            <span id="room-info-name" class="room-info-name">${room.isPrivate ? '<i class="fas fa-lock text-amber-400 text-[10px]"></i> ' : ''}${escapeHtml(room.name)}</span>
                            <span class="room-info-meta-row">
                                <span id="room-info-level-badge" class="room-level-badge hidden"></span>
                                <span id="room-info-session-support" class="room-info-session-support hidden">
                                    <i class="fas fa-bolt"></i><span id="room-info-session-support-num">0</span>
                                </span>
                            </span>
                        </span>
                    </button>
                    <button id="room-header-follow-btn" class="hidden follow-room-btn js-room-follow-btn room-header-follow-pill" data-following="0" title="متابعة الغرفة">
                        <i class="fas fa-plus"></i> متابعة
                    </button>
                </div>
                <div class="flex-1"></div>
                <div class="flex items-center gap-2 flex-shrink-0">
                    <button id="room-power-btn" class="w-8 h-8 rounded-full bg-gray-700/60 hover:bg-gray-600 flex items-center justify-center text-gray-300" title="خيارات الخروج">
                        <i class="fas fa-power-off"></i>
                    </button>
                    <button id="room-viewer-count-btn" class="room-viewer-count-btn" title="المشاهدون">
                        <i class="fas fa-eye"></i>
                        <span id="room-viewer-avatars" class="room-viewer-avatars"></span>
                        <span id="room-viewer-count-num">0</span>
                    </button>
                </div>
            </div>
            <div id="voice-chat-grid" class="voice-seats-flex mb-1"></div>
            ${renderRoomChatMarkup()}
        `;
        // ✅ إعادة تعيين أي فقاعة "غرفة مُصغَّرة" سابقة — الدخول لواجهة الغرفة (نفسها أو غرفة
        // أخرى) يعني أننا لم نعد بوضع التصغير بعد الآن
        removeRoomMinimizedBubble();
        // ✅ الإغلاق/الرجوع لم يعد زراً مستقلاً — النقر على بطاقة معلومات الغرفة يفتح إعداداتها
        // (للمضيف) أو معلوماتها (للضيف)؛ زر ⏻ يفتح خياري الخروج الصريح أو التصغير للخلفية
        document.getElementById('room-info-trigger-btn').addEventListener('click', () => {
            if (currentRoomMyRole === 'host') {
                showRoomSettingsModal(room);
            } else {
                showRoomInfoCard(room);
            }
        });
        document.getElementById('room-header-follow-btn').addEventListener('click', () => {
            socket.emit(currentRoomIsFollowing ? 'unfollow-room' : 'follow-room', { roomId: room.id });
        });
        document.getElementById('room-power-btn').addEventListener('click', () => showRoomExitOptionsSheet(room));
        document.getElementById('room-viewer-count-btn').addEventListener('click', () => showRoomViewersSheet(room.id));
        // ✅ لا يوجد زر رجوع ظاهر بعد الآن — السحب لأسفل من رأس الغرفة (نفس أسلوب تطبيقات
        // البث المباشر المعروفة) هو آلية الخروج البديلة على الهاتف؛ زر ✕ يبقى للمضيف صراحة
        wireRoomHeaderSwipeToExit(document.getElementById('room-header-bar'), room);
        wireRoomChatUI();

        renderVoiceRoomSeats(room.id, room.seatCount, 0, room.isPrivate);
        // 🐛 إصلاح: لو رُفض الدخول (مطرود/كلمة مرور خطأ/بث منتهٍ) — الدالة نفسها تنقل الشاشة
        // فعلياً لقائمة التصفح، لكن بدون هذا التحقق كانت بقية هذي الدالة تكمل تنفيذها فتنضم
        // فعلياً لقناة دردشة الغرفة (enterRoomChat) رغم الرفض، فيظهر "دخول" لحظي مزعج قبل الطرد
        const snapshotOk = await fetchAndRenderVoiceSnapshot(room.id, currentRoomPassword);
        if (!snapshotOk) return;
        updateVoiceControlBar();
        enterRoomChat(room.id);
        applyRoomAudioMuteState(); // ✅ يطبّق كتمي المحلي (إن كان مفعّلاً) على عنصر الموسيقى وأي صوت متحدثين جديد
        // ✅ لقطة الحالة قد تُظهرني جالساً أصلاً (مضيف يفتح غرفته من جديد مثلاً) بلا أي حدث
        // جلوس حي يُطلق شبكة الصوت — نتأكد هنا صراحة من الاتصال بكل من هو جالس فعلياً، سواء
        // كنت أنا جالساً (اتصال ثنائي) أو مجرّد مشاهد فتح شاشة الغرفة توّاً (استماع فقط)
        if (currentVoiceRoomId === room.id) connectVoiceMeshToCurrentlySeated();
    }

    // ✅ سحب لأسفل من رأس الغرفة يخرج منها — بديل زر الرجوع المحذوف (أسلوب تطبيقات البث
    // المباشر المعروفة). يُربط من جديد بكل دخول للغرفة (العنصر نفسه يُعاد إنشاؤه في كل مرة)
    function wireRoomHeaderSwipeToExit(headerEl, room) {
        if (!headerEl) return;
        let startY = null;
        headerEl.addEventListener('touchstart', (e) => {
            if (e.touches.length !== 1) return;
            startY = e.touches[0].clientY;
        }, { passive: true });
        headerEl.addEventListener('touchend', (e) => {
            if (startY === null) return;
            const delta = e.changedTouches[0].clientY - startY;
            startY = null;
            if (delta > 60) exitCurrentVoiceRoomView(room);
        }, { passive: true });
    }

    // ✅ منطق الخروج الموحّد من الغرفة (سحب الهاتف/زر Escape بالكمبيوتر): المضيف يُسأل صراحة
    // (بثّه لسا شغّال)، والضيف يرجع مباشرة لقائمة التصفح
    function exitCurrentVoiceRoomView(room) {
        if (currentRoomMyRole === 'host') {
            showEndBroadcastConfirm(room.id);
        } else {
            // 🐛 إصلاح: الخروج كان مجرد تنقّل واجهة فقط بلا تحرير المقعد فعلياً — لو كنت جالساً،
            // يبقى الجميع يراك "قاعداً" رغم خروجك (التحرير كان يحصل بشكل كسول جداً لاحقاً، فقط
            // عند دخولك غرفة أخرى). الآن يُرسَل طلب مغادرة المقعد صراحة فور الخروج الفعلي
            if (myVoiceSeatNumber && myVoiceRoomId === room.id) {
                leaveVoiceSeat();
            }
            showRoomBrowserView();
        }
    }

    // ✅ زر Escape بالكمبيوتر — نفس دور السحب بالهاتف، لضمان وجود مخرج واضح لمستخدمي سطح
    // المكتب أيضاً بعد حذف زر الرجوع الظاهر. يُسجَّل مرة واحدة فقط (وليس بكل دخول غرفة) ويقرأ
    // الحالة الحالية من المتغيرات العامة مباشرة — يتجنب تراكم مستمعين مكررين بكل زيارة
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        if (!document.body.classList.contains('in-voice-room')) return;
        // ✅ لو فيه نافذة/ورقة مفتوحة فوق الغرفة حالياً، اتركها هي من يُغلَق أولاً (لا نتجاوزها)
        if (document.querySelector('[id$="-modal"], [id$="-sheet"], .modal-overlay.active')) return;
        if (!currentVoiceRoomId) return;
        exitCurrentVoiceRoomView({ id: currentVoiceRoomId });
    });

    // ✅ زر ✕ بزاوية الغرفة — للمضيف فقط، يظهر تأكيداً قبل إنهاء البث فعلياً
    function showEndBroadcastConfirm(roomId) {
        const modal = document.createElement('div');
        modal.id = 'end-broadcast-confirm-modal';
        modal.className = 'fixed inset-0 bg-black/60 flex items-center justify-center z-[70] p-4';
        modal.innerHTML = `
            <div class="bg-gray-800 rounded-xl shadow-xl p-5 w-full max-w-xs text-white text-center">
                <i class="fas fa-triangle-exclamation text-3xl text-amber-400 mb-3"></i>
                <p class="font-bold mb-1">إنهاء البث؟</p>
                <p class="text-xs text-gray-400 mb-5">سينزل الجميع من مقاعدهم وتختفي الغرفة من قائمة التصفح لحين عودتك بث جديد</p>
                <div class="flex gap-3">
                    <button id="cancel-end-broadcast" class="flex-1 bg-gray-700 hover:bg-gray-600 py-2.5 rounded-lg font-bold text-sm">تراجع</button>
                    <button id="confirm-end-broadcast" class="flex-1 bg-red-600 hover:bg-red-700 py-2.5 rounded-lg font-bold text-sm">إنهاء البث</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.querySelector('#cancel-end-broadcast').addEventListener('click', () => modal.remove());
        modal.querySelector('#confirm-end-broadcast').addEventListener('click', () => {
            // ✅ إيقاف الموسيقى/إخفاء المشغّل العائم فوراً محلياً — لا ننتظر رحلة السيرفر
            // ذهاباً وإياباً (يصل حدث room-broadcast-ended بعدها ليؤكد نفس الشيء)
            if (currentMusicState?.roomId === roomId) applyMusicState(null);
            socket.emit('host-end-broadcast', { roomId });
            modal.remove();
        });
    }

    // ✅ نافذة "بثّك لسا شغّال" — تظهر بعد أي اتصال/إعادة اتصال لو اكتشفنا إنك مضيف غرفة مباشرة
    // فعلياً لكنك مو داخلها حالياً (أشهر سبب: تحديث الصفحة قطعك عن واجهة الغرفة بلا ما ينهي
    // بثّك). نافذة بسيطة بخيارين واضحين فقط — لا تنبيه عابر يُتجاهل بصمت ويبقي البث "يتيماً"
    function showStillLiveModal(room) {
        document.getElementById('still-live-modal')?.remove();
        const modal = document.createElement('div');
        modal.id = 'still-live-modal';
        modal.className = 'fixed inset-0 bg-black/70 flex items-center justify-center z-[300] p-4';
        modal.innerHTML = `
            <div class="bg-gray-800 rounded-xl shadow-xl p-5 w-full max-w-xs text-white text-center">
                <i class="fas fa-tower-broadcast text-3xl text-purple-400 mb-3"></i>
                <p class="font-bold mb-1">بثّك المباشر لسا شغّال</p>
                <p class="text-xs text-gray-400 mb-5">غادرت واجهة الغرفة (تحديث الصفحة مثلاً) والبث مستمر بدونك</p>
                <div class="flex flex-col gap-2.5">
                    <button type="button" id="still-live-return-btn" class="w-full bg-purple-600 hover:bg-purple-700 py-2.5 rounded-lg font-bold text-sm">الرجوع للبث</button>
                    <button type="button" id="still-live-end-btn" class="w-full bg-red-600 hover:bg-red-700 py-2.5 rounded-lg font-bold text-sm">إنهاء البث</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.querySelector('#still-live-return-btn').addEventListener('click', () => {
            modal.remove();
            enterVoiceRoom(room);
        });
        modal.querySelector('#still-live-end-btn').addEventListener('click', () => {
            modal.remove();
            socket.emit('host-end-broadcast', { roomId: room.id });
            showNotification('تم إنهاء البث', 'info');
        });
    }

    // ✅ قائمة المشاهدين المسندلة — تُطلب حيّة من السيرفر عند الفتح (مصدرها عضوية قناة السوكيت)
    function showRoomViewersSheet(roomId) {
        document.getElementById('room-viewers-sheet')?.remove();
        const modal = document.createElement('div');
        modal.id = 'room-viewers-sheet';
        modal.className = 'fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 p-3';
        modal.innerHTML = `
            <div class="room-viewers-sheet-card w-full md:max-w-sm text-white max-h-[65vh] flex flex-col">
                <div class="w-10 h-1 bg-gray-600 rounded-full mx-auto mt-2 mb-3 md:hidden flex-shrink-0"></div>
                <h3 class="text-sm font-bold px-4 pt-1 pb-3 flex items-center gap-2 flex-shrink-0">
                    <i class="fas fa-eye text-purple-400"></i> المشاهدون
                    <span id="room-viewers-sheet-count" class="text-[11px] font-normal text-gray-400"></span>
                </h3>
                <div id="room-viewers-list" class="space-y-1.5 px-3 pb-3 overflow-y-auto">
                    <div class="text-center text-gray-400 py-6"><i class="fas fa-spinner fa-spin"></i></div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.addEventListener('click', (e) => { if (e.target.id === 'room-viewers-sheet') modal.remove(); });
        socket.emit('get-room-viewers', { roomId });
    }

    // ✅ يحدّث شارة العدد + شريط الصور المتراكبة أعلى زاوية الغرفة
    function updateRoomViewerWidget(count, viewers) {
        const numEl = document.getElementById('room-viewer-count-num');
        if (numEl) numEl.textContent = count > 999 ? '999+' : String(count);
        const avatarsEl = document.getElementById('room-viewer-avatars');
        if (avatarsEl && viewers) {
            avatarsEl.innerHTML = viewers.slice(0, 3).map(v => `
                <img src="${v.profileImage}" data-user-id="${v.id}" class="room-viewer-avatar" title="${escapeHtml(v.username)}">
            `).join('');
            avatarsEl.querySelectorAll('.room-viewer-avatar').forEach(img => {
                img.addEventListener('click', (e) => {
                    e.stopPropagation();
                    showUserProfileSheet(currentVoiceRoomId, null, img.dataset.userId, img.title);
                });
            });
        }
    }

    // ✅ بطاقة معلومات الغرفة — تظهر للضيوف عند الضغط على شريط الغرفة برأس الشاشة (بديل نافذة
    // "من نحن" القديمة غير الموجودة أصلاً سابقاً): المالك، عدد المتابعين الحقيقي، ولفل الغرفة
    // كمرجع بصري فقط لتطوير لاحق (لا قيمة فعلية له بعد)
    function showRoomInfoCard(room) {
        document.getElementById('room-info-card')?.remove();
        const modal = document.createElement('div');
        modal.id = 'room-info-card';
        modal.className = 'fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 p-3';
        modal.innerHTML = `
            <div class="room-info-card-sheet w-full md:max-w-sm text-white">
                <div class="w-10 h-1 bg-gray-600 rounded-full mx-auto mt-2 mb-3 md:hidden flex-shrink-0"></div>
                <div class="px-4 pb-5">
                    <div class="flex items-center gap-3 mb-4">
                        <img src="${currentRoomCoverImage || 'https://i.ibb.co/601T5nRV/7d580cf284dbd895ae2db4b598ec8bb2.jpg'}" class="room-info-card-cover">
                        <div class="min-w-0">
                            <p class="font-bold text-base truncate">${escapeHtml(room.name)}</p>
                            <p class="text-[11px] text-gray-400">${currentRoomCode ? `ID: ${currentRoomCode}` : ''}</p>
                        </div>
                    </div>
                    <div id="room-info-card-owner-row" class="room-info-card-owner-row" role="button" title="عرض الملف الشخصي للمضيف">
                        <img src="${currentRoomHostProfileImage || 'https://i.ibb.co/601T5nRV/7d580cf284dbd895ae2db4b598ec8bb2.jpg'}" class="room-info-card-owner-img">
                        <div class="min-w-0 flex-1">
                            <p class="text-[10px] text-gray-500">مالك الغرفة</p>
                            <p class="text-sm font-bold truncate">${escapeHtml(currentRoomHostUsername || '—')}</p>
                        </div>
                        <i class="fas fa-chevron-left text-[10px] text-gray-500"></i>
                    </div>
                    <div class="grid grid-cols-2 gap-2 mt-3">
                        <div class="room-info-stat-box">
                            <p id="room-info-followers-count" class="room-info-stat-num">${currentRoomFollowersCount}</p>
                            <p class="room-info-stat-label">متابع</p>
                        </div>
                        <div class="room-info-stat-box">
                            <p class="room-info-stat-num text-amber-400">${currentRoomLevel !== null ? `Lv.${currentRoomLevel}` : '—'}</p>
                            <p class="room-info-stat-label">مستوى الغرفة</p>
                        </div>
                    </div>
                    ${currentRoomLevel !== null ? `
                        <button id="room-info-rankings-btn" class="room-info-rankings-btn mt-2">
                            <i class="fas fa-trophy"></i> غرف الصدارة — شاهد ترتيب أقوى الغرف
                        </button>
                    ` : ''}
                    <button id="room-info-card-follow-btn" class="follow-room-btn js-room-follow-btn w-full justify-center mt-4" data-following="${currentRoomIsFollowing ? '1' : '0'}">
                        ${currentRoomIsFollowing ? '<i class="fas fa-check"></i> متابَع' : '<i class="fas fa-plus"></i> متابعة'}
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.addEventListener('click', (e) => { if (e.target.id === 'room-info-card') modal.remove(); });
        modal.querySelector('#room-info-card-follow-btn').addEventListener('click', () => {
            socket.emit(currentRoomIsFollowing ? 'unfollow-room' : 'follow-room', { roomId: room.id });
        });
        modal.querySelector('#room-info-rankings-btn')?.addEventListener('click', () => {
            modal.remove();
            goToRoomRankingsLeaderboard();
        });
        // ✅ ربط دخول البث بالملف الشخصي للمستخدم — الضغط على صف مالك الغرفة (صورته/اسمه)
        // يفتح ملفه الشخصي الكامل مباشرة (showFullProfilePage)، لا فقط اسمه كنص ثابت غير قابل للتفاعل
        if (currentRoomHostId) {
            modal.querySelector('#room-info-card-owner-row')?.addEventListener('click', () => {
                modal.remove();
                showFullProfilePage(currentRoomHostId);
            });
        }
    }

    // ✅ منصّة تتويج أقوى 10 غرف — الأول أعلى بالمنتصف، الثاني والثالث بجانبيه، وباقي الغرف
    // بقائمة مرتبة أسفلهم. الترتيب بأكبر عدد متابعين + نقاط دعم معاً (يحسبه السيرفر). كانت
    // نافذة منفصلة (room-rankings-modal)، دُمجت الآن كتبويب "الغرف" داخل شاشة "المتصدرين"
    // نفسها (showLeaderboardView) بدل واجهة مستقلة — هذي الدالة وحدها بقيت، تُستدعى من هناك
    function renderRoomRankingsBody(body, rooms) {
        const podium = rooms.slice(0, 3);
        const rest = rooms.slice(3);
        const podiumCard = (r, rank) => r ? `
            <div class="rankings-podium-card rankings-podium-rank-${rank}" data-room-id="${r.id}">
                <div class="rankings-podium-crown">${rank === 1 ? '👑' : rank === 2 ? '🥈' : '🥉'}</div>
                <img src="${r.coverImage || 'https://i.ibb.co/601T5nRV/7d580cf284dbd895ae2db4b598ec8bb2.jpg'}" class="rankings-podium-cover">
                <p class="rankings-podium-name">${escapeHtml(r.name)}</p>
                <p class="rankings-podium-host">${escapeHtml(r.host?.username || '—')}</p>
                <div class="rankings-podium-stats">
                    <span><i class="fas fa-heart"></i> ${r.followersCount}</span>
                    <span><i class="fas fa-star"></i> Lv.${r.level}</span>
                </div>
                <div class="rankings-podium-pedestal">${rank}</div>
            </div>
        ` : '<div class="rankings-podium-card rankings-podium-empty"></div>';

        body.innerHTML = `
            <div class="rankings-podium-row">
                ${podiumCard(podium[1], 2)}
                ${podiumCard(podium[0], 1)}
                ${podiumCard(podium[2], 3)}
            </div>
            ${rest.length > 0 ? `
                <div class="rankings-list">
                    ${rest.map((r, i) => `
                        <div class="rankings-list-row" data-room-id="${r.id}">
                            <span class="rankings-list-rank">${i + 4}</span>
                            <img src="${r.coverImage || 'https://i.ibb.co/601T5nRV/7d580cf284dbd895ae2db4b598ec8bb2.jpg'}" class="rankings-list-cover">
                            <div class="min-w-0 flex-1">
                                <p class="rankings-list-name">${escapeHtml(r.name)}</p>
                                <p class="rankings-list-host">${escapeHtml(r.host?.username || '—')}</p>
                            </div>
                            <span class="rankings-list-followers"><i class="fas fa-heart"></i> ${r.followersCount}</span>
                            <span class="room-level-badge room-level-badge-${r.level}">Lv.${r.level}</span>
                        </div>
                    `).join('')}
                </div>
            ` : ''}
        `;

        body.querySelectorAll('[data-room-id]').forEach(el => {
            el.addEventListener('click', () => {
                const roomId = el.dataset.roomId;
                const room = rooms.find(r => r.id === roomId);
                if (!room) return;
                // 🐛 إصلاح: الدخول لغرفة من هذي القائمة بينما أنا أصلاً داخل غرفة أخرى كان يتخطّى
                // تنظيف الغرفة الحالية (قناة دردشتها + شبكة صوتها) — بخلاف مسار "مغادرة حقيقية"
                // المُستخدَم بكل مكان آخر (انظر showRoomBrowserView)، فتبقى اتصالات WebRTC قديمة
                // معلّقة بالخلفية وأنا فعلياً بغرفة جديدة. نفس التنظيف هنا قبل الدخول مباشرة
                if (currentVoiceRoomId && currentVoiceRoomId !== room.id) {
                    leaveRoomChatUI();
                    exitFullscreenRoomMode();
                    teardownAllVoicePeers();
                }
                enterVoiceRoom({ id: room.id, name: room.name, coverImage: room.coverImage, isOfficial: false, isPrivate: room.isPrivate });
            });
        });
    }

    // ✅ شاشة "انتهى البث المباشر" — تظهر لكل من كان بالغرفة لحظة إنهاء المضيف لبثّه. صورة
    // المضيف + زر متابعة خاص بالغرفة + مدة البث، وانتقال تلقائي خلال ثوانٍ قليلة لغرفة بث
    // أخرى عشوائية (أو رجوع لقائمة التصفح لو ما في غرف بث أخرى حالياً)
    function formatBroadcastDuration(totalSeconds) {
        const h = Math.floor(totalSeconds / 3600);
        const m = Math.floor((totalSeconds % 3600) / 60);
        const s = totalSeconds % 60;
        if (h > 0) return `${h} س ${m} د`;
        if (m > 0) return `${m} د ${s} ث`;
        return `${s} ث`;
    }

    async function showBroadcastEndedScreen({ roomId, hostUsername, hostProfileImage, durationSeconds, followerIds }) {
        document.getElementById('broadcast-ended-screen')?.remove();
        const isFollowing = (followerIds || []).includes(myUserId);

        const screen = document.createElement('div');
        screen.id = 'broadcast-ended-screen';
        screen.className = 'fixed inset-0 bg-gray-950 flex flex-col items-center justify-center z-[500] p-6 text-center text-white';
        screen.innerHTML = `
            <button id="close-broadcast-ended" class="absolute top-4 left-4 w-9 h-9 rounded-full bg-gray-800/80 hover:bg-gray-700 flex items-center justify-center"><i class="fas fa-times"></i></button>
            <img src="${hostProfileImage}" class="w-24 h-24 rounded-full object-cover border-4 border-gray-700 shadow-2xl mb-4">
            <p class="text-lg font-bold mb-1">لقد انتهى البث المباشر</p>
            <p class="text-sm text-gray-400 mb-5">${escapeHtml(hostUsername)}</p>
            <button id="follow-room-btn" data-following="${isFollowing ? '1' : '0'}" class="follow-room-btn js-room-follow-btn ${isFollowing ? 'following' : ''} mb-6">
                ${isFollowing ? '<i class="fas fa-check"></i> متابَع' : '<i class="fas fa-plus"></i> متابعة'}
            </button>
            <p class="text-xs text-gray-500">مدة البث: ${formatBroadcastDuration(durationSeconds || 0)}</p>
            <p id="broadcast-ended-countdown" class="text-[11px] text-gray-600 mt-8"></p>
        `;
        document.body.appendChild(screen);

        document.getElementById('follow-room-btn').addEventListener('click', () => {
            const btn = document.getElementById('follow-room-btn');
            const nowFollowing = btn.dataset.following === '1';
            socket.emit(nowFollowing ? 'unfollow-room' : 'follow-room', { roomId });
        });

        let cancelled = false;
        document.getElementById('close-broadcast-ended').addEventListener('click', () => {
            cancelled = true;
            screen.remove();
            showRoomBrowserView();
        });

        // ✅ يبحث عن غرفة بث أخرى نشطة الآن لينتقل إليها تلقائياً (بديل "البث التالي" بالتطبيقات المشهورة)
        let nextRoom = null;
        try {
            const response = await fetch('/api/voice-room/rooms?sort=active&limit=20', { headers: { 'Authorization': `Bearer ${token}` } });
            const result = await response.json();
            const candidates = (result.rooms || []).filter(r => !r.isOfficial && r.id !== roomId);
            if (candidates.length > 0) nextRoom = candidates[Math.floor(Math.random() * candidates.length)];
        } catch (error) {
            console.error('[BROADCAST ENDED] Failed to find next room:', error);
        }

        let remaining = 2;
        const countdownEl = document.getElementById('broadcast-ended-countdown');
        if (countdownEl) countdownEl.textContent = nextRoom ? `الانتقال لغرفة أخرى خلال ${remaining}...` : 'الرجوع لقائمة الغرف...';
        const interval = setInterval(() => {
            remaining--;
            if (countdownEl && nextRoom) countdownEl.textContent = `الانتقال لغرفة أخرى خلال ${Math.max(remaining, 0)}...`;
            if (remaining <= 0) {
                clearInterval(interval);
                if (cancelled) return;
                screen.remove();
                if (nextRoom) {
                    showCustomRoomView({ id: nextRoom.id, name: nextRoom.name, seatCount: nextRoom.seatCount, isPrivate: nextRoom.isPrivate, isOfficial: false }, null);
                } else {
                    showRoomBrowserView();
                }
            }
        }, 1000);
    }

    // ✅ شاشة نهاية البث بالنسبة للمضيف نفسه — ملخّص بسيط (مدة البث فقط)، بلا صورته ولا زر
    // متابعة لنفسه، وبلا انتقال عشوائي لغرفة أخرى — فقط رجوع مباشر لقائمة التصفح
    function showHostBroadcastSummaryScreen({ durationSeconds }) {
        document.getElementById('broadcast-ended-screen')?.remove();
        const screen = document.createElement('div');
        screen.id = 'broadcast-ended-screen';
        screen.className = 'fixed inset-0 bg-gray-950 flex flex-col items-center justify-center z-[500] p-6 text-center text-white';
        screen.innerHTML = `
            <i class="fas fa-signal-stream text-4xl text-purple-400 mb-4"></i>
            <p class="text-lg font-bold mb-1">انتهى بثّك المباشر</p>
            <p class="text-sm text-gray-400 mb-6">مدة البث: ${formatBroadcastDuration(durationSeconds || 0)}</p>
            <button id="close-host-broadcast-summary" class="bg-purple-600 hover:bg-purple-700 rounded-full px-8 py-2.5 font-bold text-sm">رجوع لقائمة الغرف</button>
        `;
        document.body.appendChild(screen);
        document.getElementById('close-host-broadcast-summary').addEventListener('click', () => {
            screen.remove();
            showRoomBrowserView();
        });
    }

    // ✅ يبني شبكة المقاعد الفارغة ويربط أحداث الضغط — مستخدمة من الغرفة الرسمية وغرف المستخدمين معاً
    function renderVoiceRoomSeats(roomId, seatCount, adminSeatCount, isPrivate) {
        const voiceGrid = document.getElementById('voice-chat-grid');
        if (!voiceGrid) return;
        voiceGrid.innerHTML = '';
        const isCustomRoom = roomId !== 'main';
        // ✅ الاسم يظهر تحت المقعد فقط بغرف المستخدمين (9/15/24) — مساحة كافية، بعكس الرسمية
        // المزدحمة بـ80 مقعداً حيث الـ tooltip يبقى وحده كافياً وأوضح بصرياً
        voiceGrid.classList.toggle('labeled', seatCount <= 24);
        // ✅ شبكة أعمدة ثابتة العدد حسب سعة الغرفة (بالضبط أسلوب التطبيقات المشهورة): 9 مقاعد
        // = 3 أعمدة (مربّع 3×3 كبير ومتناسق)، 15 = 5 أعمدة (3 صفوف)، 24 = 6 أعمدة (4 صفوف) —
        // العدد ثابت دائماً بغض النظر عن عرض الشاشة، وحجم المقعد وحده يتمدد مع العرض المتاح
        // (بعكس الغرفة الرسمية الـ80 مقعداً التي تبقى بتخطيطها المضغوط المرن القديم)
        voiceGrid.classList.remove('cols-3', 'cols-5', 'cols-6');
        if (seatCount === 9) voiceGrid.classList.add('cols-3');
        else if (seatCount === 15) voiceGrid.classList.add('cols-5');
        else if (seatCount === 24) voiceGrid.classList.add('cols-6');
        for (let i = 1; i <= seatCount; i++) {
            const seat = document.createElement('div');
            const isAdminSeat = i <= adminSeatCount;
            const canSitHere = !isAdminSeat || (user && user.isAdmin);
            seat.className = `voice-seat ${isAdminSeat ? 'admin-seat' : 'user-seat'} ${canSitHere ? '' : 'seat-forbidden'}`;
            seat.dataset.seat = i;
            seat.dataset.isAdminSeat = isAdminSeat ? '1' : '0';
            if (isAdminSeat) {
                seat.innerHTML = '<i class="fas fa-crown"></i>';
                seat.title = canSitHere ? 'مقعد إدارة' : 'مقعد محجوز للإدارة';
            } else if (isCustomRoom) {
                // ✅ بغرف المستخدمين: مقعد فاضٍ = "+" بالدائرة، والنص تحتها يختلف حسب من يشاهد —
                // "دعوة" للمضيف (يفتح قائمة الحاضرين ليدعو أحدهم لهذا المقعد تحديداً)، و"انضمام"
                // لبقية المستخدمين (يرسل طلب صعود ينتظر موافقة المضيف)
                const emptyLabel = currentRoomMyRole === 'host' ? 'دعوة' : 'انضمام';
                seat.innerHTML = `<i class="fas fa-plus voice-seat-plus"></i><span class="voice-seat-name voice-seat-join-label">${emptyLabel}</span>`;
            } else {
                seat.innerHTML = i;
            }
            seat.addEventListener('click', () => {
                const occupantId = seat.dataset.userId;
                const isLocked = seat.dataset.isLocked === '1';
                const canManage = isCustomRoom && (currentRoomMyRole === 'host' || currentRoomMyRole === 'moderator');

                if (occupantId) {
                    // ✅ الضغط على أي صورة (حتى صورتي أنا) يفتح الملف الشخصي — المغادرة فقط من زر الشريط العائم
                    showUserProfileSheet(roomId, i, occupantId, seat.title || '');
                } else if (isLocked && canManage) {
                    // ✅ فتح قفل المقعد مباشرة (كان المضيف لا يقدر يعيد فتحه بعد قفله)
                    socket.emit('host-toggle-lock-seat', { roomId, seatNumber: i });
                } else if (!isLocked && isCustomRoom && !canManage) {
                    // ✅ ضيف بغرفة مستخدم: الضغط على مقعد فاضٍ = طلب صعود (نفس زر رفع اليد بالضبط)،
                    // وليس جلوساً فورياً — القرار للمضيف
                    sendSeatJoinRequest();
                } else if (!isLocked && currentRoomMyRole === 'host') {
                    // 🐛 المضيف ثابت دائماً على مقعده رقم 1 بغرفته المباشرة — لا يقدر "ينضم" لمقعد
                    // آخر بنفسه (كان يُسبّب استنساخه على أكثر من مقعد). الضغط على مقعد فاضٍ يفتح
                    // له بدلاً من ذلك قائمة الحاضرين ليدعو أحدهم لهذا المقعد تحديداً
                    showInviteToSeatSheet(roomId, i);
                } else if (!isLocked) {
                    // ✅ كلمة مرور الغرفة تُتحقق منها فقط عند الدخول للغرفة نفسها، لا تُطلب مجدداً عند الجلوس
                    joinVoiceSeat(i);
                }
            });
            voiceGrid.appendChild(seat);
        }
    }

    // ✅ نافذة الملف الشخصي المسندلة من الأسفل — بنفس أسلوب التطبيقات المشهورة (لا تأخذ كامل الشاشة)
    async function showUserProfileSheet(roomId, seatNumber, userId, fallbackName) {
        const modal = document.createElement('div');
        modal.id = 'user-profile-sheet';
        modal.className = 'fixed inset-0 bg-black/60 flex items-end z-50';
        modal.innerHTML = `
            <div class="bg-gray-800 rounded-t-2xl shadow-xl w-full max-h-[75vh] overflow-y-auto text-white animate-[slideUp_0.25s_ease-out]">
                <div class="w-10 h-1 bg-gray-600 rounded-full mx-auto mt-2.5 mb-1"></div>
                <div id="user-profile-sheet-body" class="p-5">
                    <div class="flex items-center justify-center py-10 text-gray-400"><i class="fas fa-spinner fa-spin"></i></div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.addEventListener('click', (e) => { if (e.target.id === 'user-profile-sheet') modal.remove(); });

        try {
            const response = await fetch(`/api/users/${userId}/mini-profile`, { headers: { 'Authorization': `Bearer ${token}` } });
            const result = await response.json();
            const body = modal.querySelector('#user-profile-sheet-body');
            if (!response.ok || result.status !== 'success') {
                body.innerHTML = `<p class="text-center text-gray-400 py-6">تعذر تحميل الملف الشخصي</p>`;
                return;
            }
            const p = result.data;
            const isMe = userId === myUserId;
            const canManage = !isMe && roomId !== 'main' && (currentRoomMyRole === 'host' || currentRoomMyRole === 'moderator');
            const isTargetHost = false; // (نتحقق من صلاحية المنع من السيرفر أصلاً؛ المضيف لن يظهر له خيار إدارة نفسه لأن isMe يمنعه)
            // ✅ زر التفاعل يظهر فقط بين شخصين جالسين فعلياً بنفس الغرفة حالياً (seatNumber يعني
            // إن هذا الملف فُتح من مقعد فعلي، وليس مثلاً من قائمة المشاهدين لشخص واقف)
            const canInteract = !isMe && roomId !== 'main' && !!seatNumber && myVoiceSeatNumber && myVoiceRoomId === roomId;

            body.innerHTML = `
                <div class="flex items-start gap-3">
                    <img src="${p.profileImage}" class="w-16 h-16 rounded-full object-cover border-2 border-purple-500/50 flex-shrink-0">
                    <div class="flex-1 min-w-0">
                        <p class="font-bold text-base truncate">${escapeHtml(p.username)}</p>
                        <p class="text-xs text-gray-400 mt-0.5">ID: ${escapeHtml(String(p.customId || ''))}</p>
                        <div class="flex items-center gap-2 mt-1.5">
                            <span class="text-[11px] bg-purple-600/30 text-purple-300 px-2 py-0.5 rounded-full"><i class="fas fa-star"></i> Lv.${p.level}</span>
                            <span class="text-[11px] text-gray-400"><i class="fas fa-user-friends"></i> ${p.friendsCount}</span>
                        </div>
                    </div>
                    ${canManage ? `
                        <button id="profile-manage-icon-btn" class="flex flex-col items-center gap-0.5 flex-shrink-0 text-gray-300 hover:text-white">
                            <span class="relative w-9 h-9 flex items-center justify-center bg-gray-700/70 rounded-full">
                                <svg viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4"><path d="M12 12c2.7 0 8 1.34 8 4v2H4v-2c0-2.66 5.3-4 8-4zm0-2a4 4 0 100-8 4 4 0 000 8z"/></svg>
                                <i class="fas fa-cog absolute -bottom-0.5 -left-0.5 text-[9px] bg-gray-800 rounded-full p-0.5"></i>
                            </span>
                            <span class="text-[9px]">إدارة الغرفة</span>
                        </button>
                    ` : ''}
                </div>
                ${!isMe ? `
                    <div class="flex items-center gap-2 mt-4">
                        <button id="profile-send-gift-btn" class="flex-1 bg-pink-600 hover:bg-pink-700 rounded-lg py-2 text-sm font-bold flex items-center justify-center gap-2"><i class="fas fa-gift"></i> إرسال هدية</button>
                        ${canInteract ? `<button id="profile-interact-btn" class="flex-1 bg-rose-600 hover:bg-rose-700 rounded-lg py-2 text-sm font-bold flex items-center justify-center gap-2"><i class="fas fa-heart"></i> تفاعل</button>` : ''}
                    </div>
                ` : ''}
            `;

            if (canManage) {
                modal.querySelector('#profile-manage-icon-btn').addEventListener('click', () => {
                    modal.remove();
                    showSeatModerationMenu(roomId, seatNumber, userId, p.username);
                });
            }
            if (!isMe) {
                modal.querySelector('#profile-send-gift-btn').addEventListener('click', () => {
                    modal.remove();
                    showGiftStoreModal(userId, p.username); // ✅ إعادة استخدام نظام الهدايا الموجود أصلاً بالمشروع
                });
            }
            if (canInteract) {
                modal.querySelector('#profile-interact-btn').addEventListener('click', () => {
                    modal.remove();
                    showPairReactionPicker(roomId, userId, p.username);
                });
            }
        } catch (error) {
            console.error('Failed to load profile:', error);
        }
    }

    // ✅ منتقي الإيموجي المتحرك — يظهر التفاعل فوق صورة المستخدم عند الجميع بالغرفة لحظياً
    function showReactionPicker(roomId, seatNumber) {
        const emojis = ['❤️', '😂', '👏', '🔥', '😍', '👍', '🎉', '😮'];
        const modal = document.createElement('div');
        modal.id = 'reaction-picker-modal';
        modal.className = 'fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50';
        modal.innerHTML = `
            <div class="bg-gray-800 rounded-t-2xl md:rounded-2xl shadow-xl p-4 w-full md:w-auto">
                <div class="grid grid-cols-4 gap-3">
                    ${emojis.map(e => `<button data-emoji="${e}" class="reaction-emoji-btn text-3xl p-2 rounded-lg hover:bg-gray-700">${e}</button>`).join('')}
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.addEventListener('click', (e) => { if (e.target.id === 'reaction-picker-modal') modal.remove(); });
        modal.querySelectorAll('.reaction-emoji-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                socket.emit('send-seat-reaction', { roomId, seatNumber, emoji: btn.dataset.emoji });
                modal.remove();
            });
        });
    }

    // ✅ يعرض الإيموجي المتحرك فوق صورة المقعد لثوانٍ قليلة ثم يختفي تلقائياً
    function playSeatReaction(seatNumber, emoji) {
        const voiceGrid = document.getElementById('voice-chat-grid');
        if (!voiceGrid) return;
        const seatEl = voiceGrid.querySelector(`.voice-seat[data-seat="${seatNumber}"]`);
        if (!seatEl) return;
        const el = document.createElement('div');
        el.className = 'voice-seat-reaction';
        el.textContent = emoji;
        seatEl.appendChild(el);
        setTimeout(() => el.remove(), 1500);
    }

    // ✅ تفاعل متصل بين مقعدين — نبضة على المقعدين معاً (نفس تأثير استقبال هدية، لونه مناسب
    // أصلاً) + طيران الإيموجي من مقعد المُرسل نحو مقعد المستلم (نفس آلية طيران الهدية)، ثم
    // طفوة قصيرة فوق مقعد المستلم كلمسة أخيرة. أي مقعد ثالث غير معنيّ لا يتأثر إطلاقاً —
    // التأثير مرتبط حصراً بعنصري DOM الخاصين بمقعدي المُرسل والمستلم
    function playSeatPairReaction(fromSeat, toSeat, emoji) {
        const grid = document.getElementById('voice-chat-grid');
        if (!grid) return;
        const fromEl = grid.querySelector(`.voice-seat[data-seat="${fromSeat}"]`);
        const toEl = grid.querySelector(`.voice-seat[data-seat="${toSeat}"]`);
        if (!fromEl || !toEl) return;

        [fromEl, toEl].forEach(el => {
            el.classList.add('seat-gift-impact');
            setTimeout(() => el.classList.remove('seat-gift-impact'), 500);
        });

        const fromRect = fromEl.getBoundingClientRect();
        const toRect = toEl.getBoundingClientRect();
        const startX = fromRect.left + fromRect.width / 2;
        const startY = fromRect.top + fromRect.height / 2;
        const deltaX = (toRect.left + toRect.width / 2) - startX;
        const deltaY = (toRect.top + toRect.height / 2) - startY;

        const flyEl = document.createElement('div');
        flyEl.className = 'room-gift-fly-icon';
        flyEl.style.left = `${startX}px`;
        flyEl.style.top = `${startY}px`;
        flyEl.innerHTML = `<span>${emoji}</span>`;
        document.body.appendChild(flyEl);
        requestAnimationFrame(() => {
            flyEl.style.transform = `translate(calc(-50% + ${deltaX}px), calc(-50% + ${deltaY}px)) scale(0.6)`;
            flyEl.style.opacity = '0';
        });
        setTimeout(() => flyEl.remove(), 950);

        setTimeout(() => playSeatReaction(toSeat, emoji), 850);
    }

    // ✅ منتقي تفاعل بين شخصين — يظهر فقط عبر ملف شخص آخر جالس معك بنفس الغرفة حالياً
    function showPairReactionPicker(roomId, targetUserId, targetUsername) {
        const emojis = ['💋', '🤗', '🖐️', '❤️', '🌹'];
        document.getElementById('pair-reaction-modal')?.remove();
        const modal = document.createElement('div');
        modal.id = 'pair-reaction-modal';
        modal.className = 'fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50';
        modal.innerHTML = `
            <div class="bg-gray-800 rounded-t-2xl md:rounded-2xl shadow-xl p-4 w-full md:w-auto text-white text-center">
                <p class="text-xs text-gray-400 mb-3">تفاعل مع ${escapeHtml(targetUsername)}</p>
                <div class="grid grid-cols-5 gap-3">
                    ${emojis.map(e => `<button data-emoji="${e}" class="pair-reaction-emoji-btn text-3xl p-2 rounded-lg hover:bg-gray-700">${e}</button>`).join('')}
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.addEventListener('click', (e) => { if (e.target.id === 'pair-reaction-modal') modal.remove(); });
        modal.querySelectorAll('.pair-reaction-emoji-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                socket.emit('send-seat-pair-reaction', { roomId, targetUserId, emoji: btn.dataset.emoji });
                modal.remove();
            });
        });
    }

    // ✅ قائمة إدارة مقعد — تظهر فقط للمضيف/المسؤول عبر أيقونة "إدارة الغرفة" بالملف الشخصي
    // ✅ قائمة الإدارة تختلف جذرياً حسب حال الهدف: جالس على مقعد فعلاً (seatNumber رقم حقيقي)
    // مقابل مجرّد "مشاهد" بلا مقعد (seatNumber = null، مفتوحة من قائمة المشاهدين مثلاً) — لا
    // معنى لـ"كتم"/"قفل مقعد" لمن لا يملك مقعداً أصلاً، فيظهر له فقط خيار طرد من الغرفة كاملة
    function showSeatModerationMenu(roomId, seatNumber, targetUserId, username) {
        const isSeated = seatNumber !== null && seatNumber !== undefined;
        const modal = document.createElement('div');
        modal.id = 'seat-mod-modal';
        modal.className = 'fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50';
        modal.innerHTML = `
            <div class="bg-gray-800 rounded-t-2xl md:rounded-2xl shadow-xl p-3.5 w-full md:w-auto text-white">
                <p class="text-center text-[11px] text-gray-400 mb-2.5 truncate">${escapeHtml(username)}</p>
                <div class="flex items-center justify-center gap-3">
                    ${isSeated ? `
                    <button data-action="mute" class="flex flex-col items-center gap-1 text-[10px] text-gray-300">
                        <span class="w-11 h-11 rounded-full bg-gray-700 flex items-center justify-center"><i class="fas fa-microphone-slash text-amber-400"></i></span>كتم
                    </button>
                    <button data-action="kick-seat" class="flex flex-col items-center gap-1 text-[10px] text-gray-300">
                        <span class="w-11 h-11 rounded-full bg-gray-700 flex items-center justify-center"><i class="fas fa-user-slash text-red-400"></i></span>إنزال
                    </button>
                    <button data-action="kick-seat-lock" class="flex flex-col items-center gap-1 text-[10px] text-gray-300">
                        <span class="w-11 h-11 rounded-full bg-gray-700 flex items-center justify-center"><i class="fas fa-lock text-orange-400"></i></span>إنزال وقفل
                    </button>
                    ${currentRoomMyRole === 'host' ? `
                    <button data-action="mod" class="flex flex-col items-center gap-1 text-[10px] text-gray-300">
                        <span class="w-11 h-11 rounded-full bg-gray-700 flex items-center justify-center"><i class="fas fa-user-shield text-emerald-400"></i></span>مسؤول
                    </button>` : ''}
                    ` : `
                    <button data-action="kick-room" class="flex flex-col items-center gap-1 text-[10px] text-gray-300">
                        <span class="w-11 h-11 rounded-full bg-gray-700 flex items-center justify-center"><i class="fas fa-door-open text-red-400"></i></span>طرد من الغرفة
                    </button>
                    `}
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.addEventListener('click', (e) => { if (e.target.id === 'seat-mod-modal') modal.remove(); });
        modal.querySelectorAll('[data-action]').forEach(btn => {
            btn.addEventListener('click', () => {
                const action = btn.dataset.action;
                if (action === 'mute') socket.emit('host-mute-seat', { roomId, seatNumber, isMuted: true });
                else if (action === 'kick-seat') socket.emit('host-kick-seat', { roomId, seatNumber });
                // ✅ desiredLock:true صراحة — يضمن أنه يقفل دائماً (لا يُبدّل حول الحالة الحالية
                // فيفتح المقعد بالخطأ لو كان مقفولاً أصلاً)، ويُنزل الجالس ضمنياً لو كان مشغولاً
                else if (action === 'kick-seat-lock') socket.emit('host-toggle-lock-seat', { roomId, seatNumber, desiredLock: true });
                else if (action === 'mod') {
                    socket.emit('host-set-moderator', { roomId, targetUserId, makeMod: true });
                    showNotification('تم تعيينه كمسؤول ✅', 'success');
                } else if (action === 'kick-room') {
                    if (confirm(`طرد ${username} من الغرفة بالكامل؟ لن يستطيع الدخول حتى تُنهي البث وتبدأ جلسة جديدة.`)) {
                        socket.emit('host-kick-room', { roomId, targetUserId });
                        showNotification('تم الطرد من الغرفة', 'success');
                    }
                }
                modal.remove();
            });
        });
    }

    // ✅ يجلب لقطة الحالة الحقيقية لأي غرفة (الرسمية أو غرفة مستخدم) ويرسمها على الشبكة الحالية
    // 🐛 إصلاح جوهري: هذي الدالة تُرجع الآن true/false صراحة، وكل استدعاء لها (خصوصاً بفتح
    // الغرفة بـshowCustomRoomView) يجب أن يتحقق من القيمة ويتوقف فوراً لو false — بدون هذا
    // كان "return" المبكر هنا (عند رفض الدخول: مطرود/كلمة مرور خطأ/بث منتهٍ) يُنهي هذي الدالة
    // فقط، بينما يستمر المستدعي بتنفيذ بقية خطوات فتح الغرفة (enterRoomChat وغيرها) وكأن شيئاً
    // لم يحصل — وهذا بالضبط سبب "الدخول اللحظي" الذي يراه المطرود قبل إخراجه (انضمامه الفعلي
    // لقناة الدردشة يحصل فعلياً قبل أن تُكمل showRoomBrowserView التنقّل بعيداً)
    async function fetchAndRenderVoiceSnapshot(roomId, password) {
        const voiceGrid = document.getElementById('voice-chat-grid');
        if (!voiceGrid) return false;
        const mySeq = ++voiceSnapshotFetchSeq;
        try {
            const url = roomId === 'main'
                ? '/api/voice-room'
                : `/api/voice-room/rooms/${roomId}${password ? `?password=${encodeURIComponent(password)}` : ''}`;
            const response = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
            const result = await response.json();

            // 🛡️ حماية من استجابات متأخرة خارج الترتيب — شبكة متقطّعة/إعادة اتصال متكررة سريعة
            // قد تُطلق عدة نداءات لهذي الدالة، وقد يصل أقدمها متأخراً بعد أحدثها. بدون هذا الفحص
            // كانت بيانات قديمة تُطبَّق فوق بيانات أحدث فعلاً منها، فتظهر الشاشة "تتذبذب"/ترتد
            // لحالة قديمة للحظة — بالضبط ما وُصف بأنه "كلاتشات" بعد إعادة اتصال متكررة
            if (mySeq !== voiceSnapshotFetchSeq) return false;

            if (response.status === 403 && result.kicked) {
                showNotification(result.message || 'تم طردك من هذي الغرفة', 'error');
                showRoomBrowserView();
                return false;
            }
            if (response.status === 403 && result.requiresPassword) {
                showNotification('كلمة مرور الغرفة غير صحيحة', 'error');
                showRoomBrowserView();
                return false;
            }
            if (response.status === 404 && result.broadcastEnded) {
                showNotification('انتهى البث المباشر بهذي الغرفة', 'info');
                showRoomBrowserView();
                return false;
            }
            if (!response.ok || result.status !== 'success') return false;

            if (result.myRole) {
                currentRoomMyRole = result.myRole;
                // ✅ زر المتابعة لا معنى له للمضيف بغرفته نفسها ولا بالغرفة الرسمية (بلا مالك) — يظهر للضيوف فقط
                const headerFollowBtn = document.getElementById('room-header-follow-btn');
                if (headerFollowBtn) headerFollowBtn.classList.toggle('hidden', currentRoomMyRole === 'host' || result.isOfficial);
                // ✅ المضيف فتح غرفته وهي غير مباشرة حالياً — يبدأ جلسة بث جديدة تلقائياً وفورياً
                if (currentRoomMyRole === 'host' && result.isLive === false) {
                    socket.emit('host-start-broadcast', { roomId });
                }
            }
            currentRoomHostId = result.host?.id || result.host?._id || null;
            currentRoomHostUsername = result.host?.username || currentRoomHostUsername;
            currentRoomHostProfileImage = result.host?.profileImage || currentRoomHostProfileImage;
            if (typeof result.followersCount === 'number') currentRoomFollowersCount = result.followersCount;
            if (typeof result.isFollowing === 'boolean') currentRoomIsFollowing = result.isFollowing;
            document.querySelectorAll('.js-room-follow-btn').forEach(btn => {
                btn.dataset.following = currentRoomIsFollowing ? '1' : '0';
                btn.innerHTML = currentRoomIsFollowing ? '<i class="fas fa-check"></i> متابَع' : '<i class="fas fa-plus"></i> متابعة';
                btn.classList.toggle('following', currentRoomIsFollowing);
            });
            if (result.roomCode) {
                currentRoomCode = result.roomCode; // ✅ لا يزال يُستخدم ببطاقة معلومات الغرفة ومنصّة الصدارة، وإن أُزيل من رأس الغرفة نفسه
            }
            if (result.coverImage) {
                currentRoomCoverImage = result.coverImage;
                const coverEl = document.getElementById('room-info-cover-img');
                if (coverEl) coverEl.src = result.coverImage;
            }
            if (result.moderators) currentRoomModerators = result.moderators;
            if (result.handRaises) roomHandQueue = result.handRaises;
            updateHandRaiseUI();
            if (result.activeBattle) {
                currentPkBattle = result.activeBattle;
                renderPkBar();
            } else {
                removePkBar();
            }
            if (result.activeSeatChallenge) {
                renderSeatChallengeBar(result.activeSeatChallenge);
            } else {
                removeSeatChallengeBar();
            }
            if (typeof result.isLocked === 'boolean') currentRoomIsLocked = result.isLocked;
            if (typeof result.chatLocked === 'boolean') currentRoomChatLocked = result.chatLocked;
            if (typeof result.level === 'number') currentRoomLevel = result.level;
            if (typeof result.supportPoints === 'number') currentRoomSupportPoints = result.supportPoints;
            if (typeof result.sessionSupportPoints === 'number') currentRoomSessionSupportPoints = result.sessionSupportPoints;
            if (typeof result.pointsToNextLevel === 'number') currentRoomPointsToNextLevel = result.pointsToNextLevel;
            if (typeof result.levelProgressPercent === 'number') currentRoomLevelProgressPercent = result.levelProgressPercent;
            if (result.unlockedSeatCounts) currentRoomUnlockedSeatCounts = result.unlockedSeatCounts;
            if (result.kickedUsers) currentRoomKickedUsers = result.kickedUsers;
            if (result.bannedWords) currentRoomBannedWords = result.bannedWords;
            updateRoomLevelBadgeUI();
            updateRoomSessionSupportUI();
            updateChatLockUI();
            if (result.backgroundImage !== undefined) currentRoomBackgroundImage = result.backgroundImage;
            if (result.backgroundExpiresAt !== undefined) currentRoomBackgroundExpiresAt = result.backgroundExpiresAt;
            if (result.description !== undefined) currentRoomDescription = result.description;
            applyRoomBackground(currentRoomBackgroundImage);

            let foundSeat = null;
            result.seats.forEach(seatData => {
                const seatEl = voiceGrid.querySelector(`.voice-seat[data-seat="${seatData.seatNumber}"]`);
                if (!seatEl) return;
                renderVoiceSeatContent(seatEl, seatData);
                if (seatData.user && seatData.user.id === myUserId) {
                    foundSeat = seatData.seatNumber;
                }
                // 🐛 إصلاح: من كان مكتوماً أصلاً قبل انضمامي (لقطة حالة، لا حدث حي) يجب أن يبقى
                // مكتوماً بصوت مستقبَل عندي أيضاً فور اتصالي به — بدون هذا كان يُسمَع لحظياً
                // حتى يصل حدث كتم جديد لاحقاً (راجع seatMutedUsers/applyPeerAudioMuteState)
                if (seatData.user) {
                    if (seatData.isMuted) seatMutedUsers.add(seatData.user.id); else seatMutedUsers.delete(seatData.user.id);
                    applyPeerAudioMuteState(seatData.user.id);
                }
            });

            if (foundSeat !== null) {
                myVoiceSeatNumber = foundSeat;
                myVoiceRoomId = roomId;
            } else if (myVoiceRoomId === roomId) {
                // كنت أظهر بهذي الغرفة سابقاً ولم أعد قاعداً بها بحسب اللقطة الجديدة
                myVoiceSeatNumber = null;
                myVoiceRoomId = null;
            }
            updateVoiceControlBar();
            updateHandRaiseUI();
            return true;
        } catch (error) {
            console.error('Failed to load voice room snapshot:', error);
            return false;
        }
    }

    // ✅ شارة "قفل" أنيقة على خيار مقاعد غير مفتوح بعد + رقم المستوى المطلوب — نص المولّد
    // مستقل تماماً حتى يسهل إعادة استخدامه بأي مكان لاحقاً بلا اعتماد على متغيرات نافذة بعينها
    function buildSeatTierOptionsHTML(currentSeatCount) {
        const tierUnlockLevel = { 9: 1, 15: 3, 24: 5 };
        return [9, 15, 24].map(n => {
            const unlocked = currentRoomUnlockedSeatCounts.includes(n);
            const isCurrent = n === currentSeatCount;
            const classes = ['seat-tier-btn'];
            if (isCurrent) classes.push('seat-tier-btn-active');
            if (!unlocked) classes.push('seat-tier-btn-locked');
            return `
                <button type="button" class="${classes.join(' ')}" data-seats="${n}" ${!unlocked || isCurrent ? 'disabled' : ''}>
                    <span class="seat-tier-btn-num">${n}</span>
                    <span class="seat-tier-btn-label">${unlocked ? 'مقعد' : `<i class="fas fa-lock"></i> Lv.${tierUnlockLevel[n]}`}</span>
                </button>
            `;
        }).join('');
    }

    // ✅ يُحدَّث حياً لو وصل حدث نقاط/مستوى بينما النافذة مفتوحة فعلاً — لا شيء لو كانت مغلقة
    function updateRoomLevelProgressUI() {
        const badge = document.getElementById('room-settings-level-badge');
        if (!badge) return;
        badge.textContent = `Lv.${currentRoomLevel}`;
        badge.className = `room-settings-level-badge room-level-badge-${currentRoomLevel}`;
        const fill = document.getElementById('room-settings-level-progress-fill');
        if (fill) fill.style.width = `${currentRoomLevelProgressPercent}%`;
        const text = document.getElementById('room-settings-level-progress-text');
        if (text) {
            text.textContent = currentRoomPointsToNextLevel > 0
                ? `${currentRoomPointsToNextLevel.toLocaleString('en-US')} نقطة دعم للمستوى التالي`
                : 'أعلى مستوى — أحسنت! 🏆';
        }
    }

    // ✅ يُحدَّث حياً لو ألغى المضيف طرد أحد بينما النافذة مفتوحة — يُخفي القسم كاملاً لو فرغت القائمة
    function renderKickedUsersListUI() {
        const section = document.getElementById('settings-kicked-section');
        const list = document.getElementById('settings-kicked-list');
        if (!list || !section) return;
        section.classList.toggle('hidden', currentRoomKickedUsers.length === 0);
        list.innerHTML = currentRoomKickedUsers.map(u => `
            <div class="flex items-center justify-between bg-gray-700/50 rounded-lg p-1.5" data-kicked-id="${u.id}">
                <div class="flex items-center gap-2 min-w-0">
                    <img src="${u.profileImage}" class="w-6 h-6 rounded-full flex-shrink-0">
                    <span class="text-xs truncate">${escapeHtml(u.username)}</span>
                </div>
                <button type="button" class="unkick-btn text-emerald-400 hover:text-emerald-300 text-xs px-2" data-kicked-id="${u.id}">إلغاء الطرد</button>
            </div>
        `).join('');
        list.querySelectorAll('.unkick-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                socket.emit('host-unkick-room', { roomId: currentVoiceRoomId, targetUserId: btn.dataset.kickedId });
                btn.closest('[data-kicked-id]')?.remove();
            });
        });
    }

    // ✅ احتفال بصري قصير عند ارتقاء مستوى الغرفة — يظهر للجميع بالغرفة بنفس اللحظة (بطاقة
    // متوهجة بمنتصف الشاشة + شرر نجوم متطاير، تختفي تلقائياً بلا حاجة لأي تفاعل من المستخدم)
    // ✅ انفجار قصاصات ورقية حقيقي (فيزياء جاذبية/دوران) عبر مكتبة canvas-confetti إن نجح
    // تحميلها من الـCDN — طبقة احتفال إضافية فوق تأثيرات CSS الموجودة، بلا أي اعتماد صلب
    // عليها: لو فشل تحميل المكتبة (لا اتصال، حاجب إعلانات) يبقى كل شيء يعمل طبيعياً بدونها
    function fireConfettiBurst(colors) {
        if (typeof confetti !== 'function') return;
        try {
            confetti({
                particleCount: 90,
                spread: 75,
                startVelocity: 38,
                origin: { y: 0.6 },
                colors: colors || ['#a855f7', '#ec4899', '#fbbf24', '#3b82f6']
            });
        } catch (e) { /* لا شيء — تأثير بصري اختياري فقط */ }
    }

    function celebrateRoomLevelUp(newLevel) {
        document.getElementById('room-levelup-celebration')?.remove();
        fireConfettiBurst(['#fbbf24', '#f59e0b', '#a855f7']);
        const el = document.createElement('div');
        el.id = 'room-levelup-celebration';
        el.className = 'room-levelup-celebration';
        const particles = Array.from({ length: 14 }, (_, i) => {
            const angle = Math.round((360 / 14) * i);
            const delay = (Math.random() * 0.15).toFixed(2);
            return `<span class="room-levelup-particle" style="--angle:${angle}deg; --delay:${delay}s"></span>`;
        }).join('');
        el.innerHTML = `
            <div class="room-levelup-card room-level-badge-${newLevel}">
                ${particles}
                <i class="fas fa-star room-levelup-icon"></i>
                <p class="room-levelup-title">ارتقت الغرفة!</p>
                <p class="room-levelup-level">Lv.${newLevel}</p>
            </div>
        `;
        document.body.appendChild(el);
        setTimeout(() => {
            el.classList.add('room-levelup-fade-out');
            setTimeout(() => el.remove(), 400);
        }, 2600);
    }

    // ✅ نافذة إعدادات الغرفة — تظهر فقط للمضيف (يتحقق منها السيرفر أيضاً عند الحفظ). أُعيد
    // هيكلتها كاملة: بطاقة مستوى/تقدّم أعلى النافذة، أقسام مضغوطة بعناوين واضحة، شريحة
    // اختيار مقاعد بدل زر "زيادة" وحيد (تدعم التوسيع والتقليص معاً، مربوطة بمستوى الغرفة)،
    // وقسم "المطرودون" الجديد لمراجعة/التراجع عن طرد بلا انتظار إنهاء البث بالكامل
    function showRoomSettingsModal(room) {
        const occupiedNow = document.querySelectorAll('#voice-chat-grid .occupied-seat').length;

        const modal = document.createElement('div');
        modal.id = 'room-settings-modal';
        modal.className = 'fixed inset-0 bg-black/60 flex items-end md:items-center justify-center z-50 md:p-4';
        modal.innerHTML = `
            <div class="room-settings-panel bg-gray-800 md:rounded-xl rounded-t-2xl shadow-xl p-4 w-full md:max-w-sm text-white max-h-[85vh] overflow-y-auto">
                <div class="w-9 h-1 bg-gray-600 rounded-full mx-auto mb-3 md:hidden flex-shrink-0"></div>
                <div class="flex items-center justify-between mb-3">
                    <h3 class="text-sm font-bold flex items-center gap-2"><i class="fas fa-cog text-purple-400"></i> إعدادات الغرفة</h3>
                    <button type="button" id="close-room-settings-x" class="w-7 h-7 rounded-full bg-gray-700/70 hover:bg-gray-600 flex items-center justify-center text-gray-300 text-xs"><i class="fas fa-times"></i></button>
                </div>

                ${!room.isOfficial ? `
                <div class="room-settings-level-card">
                    <div class="flex items-center justify-between">
                        <span id="room-settings-level-badge" class="room-settings-level-badge room-level-badge-${currentRoomLevel}">Lv.${currentRoomLevel}</span>
                        <span class="text-[10px] text-gray-300"><i class="fas fa-gift text-pink-400"></i> ${currentRoomSupportPoints.toLocaleString('en-US')} نقطة دعم</span>
                    </div>
                    <div class="room-settings-level-progress-track">
                        <div id="room-settings-level-progress-fill" class="room-settings-level-progress-fill" style="width:${currentRoomLevelProgressPercent}%"></div>
                    </div>
                    <p id="room-settings-level-progress-text" class="text-[10px] text-gray-400 mt-1">${currentRoomPointsToNextLevel > 0 ? `${currentRoomPointsToNextLevel.toLocaleString('en-US')} نقطة دعم للمستوى التالي` : 'أعلى مستوى — أحسنت! 🏆'}</p>
                </div>` : ''}

                <form id="room-settings-form" class="space-y-3 mt-3">
                    <div class="space-y-2">
                        <input type="text" name="name" value="${escapeHtml(room.name)}" maxlength="22" required placeholder="اسم الغرفة" class="w-full bg-gray-700 border border-gray-600 rounded-lg p-2 text-sm focus:ring-purple-500 focus:border-purple-500">
                        <input type="text" name="description" value="${escapeHtml(currentRoomDescription || '')}" maxlength="120" placeholder="إعلان الغرفة (اختياري)" class="w-full bg-gray-700 border border-gray-600 rounded-lg p-2 text-sm focus:ring-purple-500 focus:border-purple-500">
                    </div>

                    <div class="room-settings-section">
                        <p class="room-settings-section-title">الخصوصية والوصول</p>
                        <div class="flex items-center justify-between bg-gray-700/40 rounded-lg p-2.5">
                            <span class="text-xs flex items-center gap-2"><i class="fas fa-key text-amber-400"></i> غرفة خاصة (بكلمة مرور)</span>
                            <input type="checkbox" id="settings-isPrivate" name="isPrivate" ${room.isPrivate ? 'checked' : ''} class="w-4 h-4 rounded">
                        </div>
                        <div id="settings-password-field" class="${room.isPrivate ? '' : 'hidden'} mt-2">
                            <input type="password" name="password" placeholder="${room.isPrivate ? 'كلمة مرور جديدة (اتركه فاضياً للإبقاء الحالية)' : 'كلمة المرور'}" class="w-full bg-gray-700 border border-gray-600 rounded-lg p-2 text-sm">
                        </div>
                        <div class="flex items-center justify-between bg-gray-700/40 rounded-lg p-2.5 mt-2">
                            <span class="text-xs flex items-center gap-2">
                                <i class="fas fa-lock text-amber-400"></i> قفل الغرفة
                            </span>
                            <input type="checkbox" id="settings-isLocked" ${currentRoomIsLocked ? 'checked' : ''} class="w-4 h-4 rounded">
                        </div>
                    </div>

                    ${!room.isOfficial ? `
                    <div class="room-settings-section">
                        <p class="room-settings-section-title">المقاعد</p>
                        <div id="settings-seat-tier-options" class="seat-tier-options">
                            ${buildSeatTierOptionsHTML(room.seatCount)}
                        </div>
                    </div>` : ''}

                    <div class="room-settings-section">
                        <p class="room-settings-section-title">التخصيص</p>
                        <div class="grid grid-cols-2 gap-2">
                            <button type="button" id="open-bg-shop-btn" class="room-settings-mini-btn">
                                <i class="fas fa-image text-purple-400"></i> خلفية الغرفة
                            </button>
                            <button type="button" id="change-room-cover-btn" class="room-settings-mini-btn">
                                <i class="fas fa-camera text-emerald-400"></i> صورة الغلاف
                            </button>
                        </div>
                        <input type="file" id="room-cover-file-input" accept="image/jpeg,image/png,image/gif,image/webp" class="hidden">
                    </div>

                    <div class="room-settings-section">
                        <p class="room-settings-section-title">المسؤولون المساعدون</p>
                        <div id="settings-moderators-list" class="space-y-1.5">
                            ${currentRoomModerators.length === 0
                                ? '<p class="text-xs text-gray-500">لا يوجد مسؤولون بعد — عيّن أحداً من ملفه الشخصي داخل الغرفة</p>'
                                : currentRoomModerators.map(m => `
                                    <div class="flex items-center justify-between bg-gray-700/50 rounded-lg p-1.5" data-mod-id="${m.id}">
                                        <div class="flex items-center gap-2 min-w-0">
                                            <img src="${m.profileImage}" class="w-6 h-6 rounded-full flex-shrink-0">
                                            <span class="text-xs truncate">${escapeHtml(m.username)}</span>
                                        </div>
                                        <button type="button" class="remove-mod-btn text-red-400 hover:text-red-300 text-xs px-2" data-mod-id="${m.id}">إزالة</button>
                                    </div>
                                `).join('')}
                        </div>
                    </div>

                    <div class="room-settings-section">
                        <p class="room-settings-section-title">كلمات محظورة إضافية <span class="text-gray-500">— مساعدة للفلتر العام</span></p>
                        <div id="banned-words-chips" class="banned-words-chips"></div>
                        <input type="text" id="banned-word-input" maxlength="30" placeholder="اكتب كلمة واضغط Enter لإضافتها..." class="w-full bg-gray-700 border border-gray-600 rounded-lg p-2 text-sm focus:ring-purple-500 focus:border-purple-500">
                        <p class="text-[10px] text-gray-500">هذي الكلمات محفوظة تلقائياً ولن تظهر بدردشة غرفتك إطلاقاً — اضغط × لحذف أي كلمة</p>
                    </div>

                    <div id="settings-kicked-section" class="room-settings-section ${currentRoomKickedUsers.length === 0 ? 'hidden' : ''}">
                        <p class="room-settings-section-title">المطرودون <span class="text-gray-500">— يمكن التراجع قبل إنهاء البث</span></p>
                        <div id="settings-kicked-list" class="space-y-1.5"></div>
                    </div>

                    <div class="flex justify-end gap-3 pt-1">
                        <button type="button" id="cancel-room-settings" class="bg-gray-600 hover:bg-gray-500 text-white py-2 px-4 rounded-lg text-sm">إلغاء</button>
                        <button type="submit" class="bg-purple-600 hover:bg-purple-700 text-white py-2 px-4 rounded-lg text-sm">حفظ</button>
                    </div>
                </form>
            </div>
        `;
        document.body.appendChild(modal);
        renderKickedUsersListUI();

        const closeModal = () => modal.remove();
        modal.querySelector('#cancel-room-settings').addEventListener('click', closeModal);
        modal.querySelector('#close-room-settings-x').addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => { if (e.target.id === 'room-settings-modal') closeModal(); });
        modal.querySelector('#settings-isPrivate').addEventListener('change', (e) => {
            modal.querySelector('#settings-password-field').classList.toggle('hidden', !e.target.checked);
        });

        modal.querySelector('#open-bg-shop-btn').addEventListener('click', () => showRoomBackgroundShopModal(room));

        // ✅ رفع صورة غلاف مخصّصة من جهاز المضيف — منفصل عن باقي الحفظ (فوري بمجرد الاختيار)
        const coverBtn = modal.querySelector('#change-room-cover-btn');
        const coverInput = modal.querySelector('#room-cover-file-input');
        coverBtn.addEventListener('click', () => coverInput.click());
        coverInput.addEventListener('change', async () => {
            const file = coverInput.files?.[0];
            if (!file) return;
            const originalHTML = coverBtn.innerHTML;
            coverBtn.disabled = true;
            coverBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جارِ الرفع...';
            try {
                const formData = new FormData();
                formData.append('coverImage', file);
                const response = await fetch(`/api/voice-room/rooms/${room.id}/cover`, {
                    method: 'PATCH',
                    headers: { 'Authorization': `Bearer ${token}` },
                    body: formData
                });
                const result = await response.json();
                if (!response.ok) {
                    showNotification(result.message || 'تعذر رفع صورة الغلاف', 'error');
                    return;
                }
                currentRoomCoverImage = result.coverImage;
                const headerCoverEl = document.getElementById('room-info-cover-img');
                if (headerCoverEl) headerCoverEl.src = result.coverImage;
                showNotification('تم تحديث صورة الغلاف ✅', 'success');
            } catch (error) {
                showNotification('حدث خطأ، حاول مجدداً', 'error');
            } finally {
                coverBtn.disabled = false;
                coverBtn.innerHTML = originalHTML;
                coverInput.value = '';
            }
        });

        // ✅ تغيير المقاعد فوري ومنفصل عن باقي الحفظ — كل من بالغرفة يرى التحديث لحظياً
        // (room-seat-count-updated) بلا أي حاجة للخروج والعودة. مُعاد ربطها كدالة مستقلة
        // (وليس حلقة مرة واحدة) لأن الأزرار تُعاد رسمها بالكامل بعد كل تغيير ناجح — بدونها
        // تبقى الأزرار الجديدة "ميتة" بلا أي مستمع نقر بعد أول تغيير بنفس فتحة النافذة
        function wireSeatTierButtons() {
            modal.querySelectorAll('.seat-tier-btn:not([disabled])').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const newCount = parseInt(btn.dataset.seats);
                    const isShrinking = newCount < room.seatCount;
                    if (isShrinking && !confirm(`تقليص المقاعد إلى ${newCount}؟ يجب إنزال أي جالس على مقعد فوق رقم ${newCount} أولاً.`)) return;
                    modal.querySelectorAll('.seat-tier-btn').forEach(b => b.disabled = true);
                    try {
                        const response = await fetch(`/api/voice-room/rooms/${room.id}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                            body: JSON.stringify({ seatCount: newCount })
                        });
                        const result = await response.json();
                        if (!response.ok) {
                            showNotification(result.message || 'تعذر تغيير عدد المقاعد', 'error');
                            modal.querySelectorAll('.seat-tier-btn').forEach(b => b.disabled = false);
                            return;
                        }
                        room.seatCount = newCount;
                        const seatSection = document.getElementById('settings-seat-tier-options');
                        if (seatSection) seatSection.innerHTML = buildSeatTierOptionsHTML(newCount);
                        wireSeatTierButtons();
                        showNotification(`تم تحديث عدد المقاعد إلى ${newCount} ✅`, 'success');
                    } catch (error) {
                        showNotification('حدث خطأ، حاول مجدداً', 'error');
                        modal.querySelectorAll('.seat-tier-btn').forEach(b => b.disabled = false);
                    }
                });
            });
        }
        wireSeatTierButtons();

        modal.querySelectorAll('.remove-mod-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const targetUserId = btn.dataset.modId;
                socket.emit('host-set-moderator', { roomId: room.id, targetUserId, makeMod: false });
                btn.closest('[data-mod-id]')?.remove();
                currentRoomModerators = currentRoomModerators.filter(m => m.id !== targetUserId);
                showNotification('تم إزالة صلاحية المسؤول', 'info');
            });
        });

        // ✅ واجهة "شرائح" (chips) لكلمات الحظر بدل حقل نصي خام — كل كلمة تُضاف فوراً كشريحة
        // قابلة للحذف بنقرة، وتُحفَظ ضمن currentRoomBannedWords (تصل جاهزة من السيرفر أصلاً
        // عند فتح الإعدادات، فليست مشكلة "لا تُحفظ" كما بدت للمستخدم — المشكلة كانت وضوح العرض)
        let bannedWordsList = [...currentRoomBannedWords];
        function renderBannedWordsChips() {
            const wrap = modal.querySelector('#banned-words-chips');
            if (!wrap) return;
            if (bannedWordsList.length === 0) {
                wrap.innerHTML = '<p class="text-[11px] text-gray-500">لا توجد كلمات محظورة بعد</p>';
                return;
            }
            wrap.innerHTML = bannedWordsList.map((w, i) => `
                <span class="banned-word-chip" data-idx="${i}">
                    ${escapeHtml(w)}
                    <button type="button" class="banned-word-chip-remove" data-idx="${i}" aria-label="حذف">×</button>
                </span>
            `).join('');
            wrap.querySelectorAll('.banned-word-chip-remove').forEach(btn => {
                btn.addEventListener('click', () => {
                    bannedWordsList.splice(Number(btn.dataset.idx), 1);
                    renderBannedWordsChips();
                });
            });
        }
        renderBannedWordsChips();
        const bannedWordInput = modal.querySelector('#banned-word-input');
        bannedWordInput.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter' && e.key !== ',') return;
            e.preventDefault();
            const word = bannedWordInput.value.trim().replace(/,$/, '');
            if (!word) return;
            if (bannedWordsList.length >= 50) {
                showNotification('الحد الأقصى 50 كلمة محظورة', 'error');
                return;
            }
            if (!bannedWordsList.includes(word)) {
                bannedWordsList.push(word);
                renderBannedWordsChips();
            }
            bannedWordInput.value = '';
        });

        const form = modal.querySelector('#room-settings-form');
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(form);
            const data = Object.fromEntries(formData.entries());
            data.isPrivate = data.isPrivate === 'on';
            data.bannedWords = bannedWordsList;

            const wantsLocked = modal.querySelector('#settings-isLocked').checked;
            data.isLocked = wantsLocked;

            // ✅ لو يقفل الآن والغرفة فيها ناس، نسأله صراحة: طرد الجميع أم يبقوا؟
            if (wantsLocked && !currentRoomIsLocked && occupiedNow > 0) {
                data.kickAll = confirm(`الغرفة فيها ${occupiedNow} شخص جالس حالياً. هل تريد طرد الجميع عند القفل؟\n\nموافق = طرد الجميع\nإلغاء = إبقاؤهم داخل الغرفة`);
            }

            const submitBtn = form.querySelector('button[type="submit"]');
            const originalHTML = submitBtn.innerHTML;
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

            try {
                const response = await fetch(`/api/voice-room/rooms/${room.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify(data)
                });
                const result = await response.json();
                if (!response.ok) {
                    showNotification(result.message || 'تعذر حفظ الإعدادات', 'error');
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = originalHTML;
                    return;
                }
                if (data.isPrivate && data.password) currentRoomPassword = data.password; // ✅ حتى لا يُطلب مني كلمة مروري الخاصة
                currentRoomIsLocked = result.room.isLocked;
                currentRoomBackgroundImage = result.room.backgroundImage;
                currentRoomDescription = result.room.description;
                // 🐛 إصلاح: لم تكن هذي القيمة تُحدَّث محلياً بعد الحفظ الناجح، فتبقى الكلمات المحظورة
                // بالذاكرة قديمة (فارغة غالباً) — عند فتح الإعدادات مجدداً بنفس الجلسة تظهر الشرائح
                // وكأنها "اختفت" رغم أن السيرفر حفظها بنجاح فعلاً؛ الآن تُطابق ما أكّده السيرفر تماماً
                if (Array.isArray(result.room.bannedWords)) currentRoomBannedWords = result.room.bannedWords;
                applyRoomBackground(currentRoomBackgroundImage);
                closeModal();
                showNotification('تم حفظ الإعدادات ✅', 'success');
                const nameEl = document.getElementById('room-info-name');
                if (nameEl) nameEl.innerHTML = `${data.isPrivate ? '<i class="fas fa-lock text-amber-400 text-[10px]"></i> ' : ''}${escapeHtml(data.name)}`;
            } catch (error) {
                showNotification('حدث خطأ، حاول مجدداً', 'error');
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalHTML;
            }
        });
    }

    // =====================================================
    // ✅ معارك PK بين غرفتين — اختيار الغصم، شريط النتيجة الحي، ونافذة نتيجة المعركة
    // =====================================================
    let currentPkBattle = null; // { battleId, roomA, roomB, scoreA, scoreB, durationSeconds, endsAt }
    let pkCountdownInterval = null;

    // ✅ نافذة اختيار غرفة للتحدي — بحث + قائمة، بنفس أسلوب بقية النوافذ بالمشروع
    function showPkChallengeModal(room) {
        const modal = document.createElement('div');
        modal.id = 'pk-challenge-modal';
        modal.className = 'fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4';
        modal.innerHTML = `
            <div class="bg-gray-800 rounded-xl shadow-xl p-5 w-full max-w-sm text-white max-h-[85vh] overflow-y-auto">
                <h3 class="text-lg font-bold mb-3"><i class="fas fa-bolt text-orange-400"></i> تحدي غرفة أخرى</h3>
                <input id="pk-room-search" type="text" placeholder="ابحث باسم الغرفة..." class="w-full bg-gray-700 border border-gray-600 rounded-lg p-2 mb-3 text-sm focus:ring-purple-500 focus:border-purple-500">
                <div class="mb-3">
                    <label class="text-xs text-gray-400 block mb-1.5">مدة المعركة</label>
                    <div id="pk-duration-picker" class="grid grid-cols-3 gap-2">
                        <button type="button" data-sec="180" class="pk-duration-btn bg-purple-600 text-xs py-2 rounded-lg font-bold">3 دقائق</button>
                        <button type="button" data-sec="300" class="pk-duration-btn bg-gray-700 text-xs py-2 rounded-lg font-bold">5 دقائق</button>
                        <button type="button" data-sec="600" class="pk-duration-btn bg-gray-700 text-xs py-2 rounded-lg font-bold">10 دقائق</button>
                    </div>
                </div>
                <div id="pk-room-list" class="space-y-2 max-h-52 overflow-y-auto mb-3"></div>
                <button type="button" id="cancel-pk-challenge" class="w-full text-center py-2 rounded-lg bg-gray-700 text-gray-300 text-sm">إلغاء</button>
            </div>
        `;
        document.body.appendChild(modal);
        modal.addEventListener('click', (e) => { if (e.target.id === 'pk-challenge-modal') modal.remove(); });
        document.getElementById('cancel-pk-challenge').addEventListener('click', () => modal.remove());

        let selectedDuration = 180;
        modal.querySelectorAll('.pk-duration-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                selectedDuration = parseInt(btn.dataset.sec);
                modal.querySelectorAll('.pk-duration-btn').forEach(b => b.classList.remove('bg-purple-600'));
                modal.querySelectorAll('.pk-duration-btn').forEach(b => b.classList.add('bg-gray-700'));
                btn.classList.remove('bg-gray-700');
                btn.classList.add('bg-purple-600');
            });
        });

        const listEl = document.getElementById('pk-room-list');
        let searchTimer = null;
        async function loadRooms(search) {
            listEl.innerHTML = '<p class="text-center text-xs text-gray-500 py-4">جاري البحث...</p>';
            try {
                const url = `/api/voice-room/rooms?sort=active&limit=20${search ? `&search=${encodeURIComponent(search)}` : ''}`;
                const response = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
                const result = await response.json();
                const rooms = (result.rooms || []).filter(r => !r.isOfficial && r.id !== room.id);
                if (rooms.length === 0) {
                    listEl.innerHTML = '<p class="text-center text-xs text-gray-500 py-4">لا توجد غرف مناسبة للتحدي</p>';
                    return;
                }
                listEl.innerHTML = rooms.map(r => `
                    <button data-room-id="${r.id}" data-room-name="${escapeHtml(r.name)}" class="pk-target-room-btn w-full flex items-center gap-2.5 bg-gray-700/50 hover:bg-gray-700 rounded-lg p-2 text-right">
                        <img src="${r.coverImage}" class="w-9 h-9 rounded-lg object-cover flex-shrink-0">
                        <span class="flex-1 min-w-0 text-sm truncate">${escapeHtml(r.name)}</span>
                        <span class="text-[10px] text-gray-400 flex-shrink-0">${r.occupied || 0} <i class="fas fa-user"></i></span>
                    </button>
                `).join('');
                listEl.querySelectorAll('.pk-target-room-btn').forEach(btn => {
                    btn.addEventListener('click', () => {
                        socket.emit('pk-challenge-room', { roomId: room.id, targetRoomId: btn.dataset.roomId, durationSeconds: selectedDuration });
                        modal.remove();
                        showNotification(`تم إرسال تحدي PK لغرفة "${btn.dataset.roomName}" — بانتظار الرد`, 'info');
                    });
                });
            } catch (error) {
                console.error('[PK] Load rooms error:', error);
                listEl.innerHTML = '<p class="text-center text-xs text-red-400 py-4">تعذر تحميل الغرف</p>';
            }
        }
        loadRooms('');
        document.getElementById('pk-room-search').addEventListener('input', (e) => {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(() => loadRooms(e.target.value.trim()), 300);
        });
    }

    // ✅ نافذة تلقّي تحدٍ — تظهر لمضيف الغرفة المستهدفة فقط، مع عدّاد تنازلي للرد قبل انتهاء المهلة
    function showPkChallengeReceivedModal({ battleId, challengerRoomName, challengerRoomCover, expiresInSeconds }) {
        document.getElementById('pk-challenge-received-modal')?.remove();
        const modal = document.createElement('div');
        modal.id = 'pk-challenge-received-modal';
        modal.className = 'fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4';
        modal.innerHTML = `
            <div class="bg-gray-800 rounded-xl shadow-xl p-5 w-full max-w-xs text-white text-center">
                <img src="${challengerRoomCover}" class="w-16 h-16 rounded-xl object-cover mx-auto mb-3 border-2 border-orange-400">
                <p class="text-sm text-gray-300 mb-1">غرفة</p>
                <p class="font-bold text-base mb-3 truncate">${escapeHtml(challengerRoomName)}</p>
                <p class="text-sm text-orange-300 mb-4"><i class="fas fa-bolt"></i> تتحداك بمعركة PK!</p>
                <p id="pk-challenge-countdown" class="text-xs text-gray-400 mb-3">${expiresInSeconds} ثانية للرد</p>
                <div class="flex gap-3">
                    <button id="pk-decline-btn" class="flex-1 bg-gray-600 hover:bg-gray-500 py-2 rounded-lg font-bold text-sm">رفض</button>
                    <button id="pk-accept-btn" class="flex-1 bg-gradient-to-r from-red-600 to-orange-600 py-2 rounded-lg font-bold text-sm">قبول التحدي</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        let remaining = expiresInSeconds;
        const countdownEl = document.getElementById('pk-challenge-countdown');
        const interval = setInterval(() => {
            remaining--;
            if (countdownEl) countdownEl.textContent = `${Math.max(remaining, 0)} ثانية للرد`;
            if (remaining <= 0) {
                clearInterval(interval);
                modal.remove();
            }
        }, 1000);

        document.getElementById('pk-accept-btn').addEventListener('click', () => {
            clearInterval(interval);
            socket.emit('pk-challenge-response', { battleId, accept: true });
            modal.remove();
        });
        document.getElementById('pk-decline-btn').addEventListener('click', () => {
            clearInterval(interval);
            socket.emit('pk-challenge-response', { battleId, accept: false });
            modal.remove();
        });
    }

    // ✅ يبني/يحدّث شريط المعركة أعلى شاشة الغرفة — يظهر فقط وأنت تشاهد إحدى الغرفتين المتنافستين
    function renderPkBar() {
        document.getElementById('pk-battle-bar')?.remove();
        if (!currentPkBattle || currentPkBattle.status === 'pending') return;
        const isMineA = currentPkBattle.roomA.id === currentVoiceRoomId;
        const isMineB = currentPkBattle.roomB.id === currentVoiceRoomId;
        if (!isMineA && !isMineB) return;

        const left = isMineA ? currentPkBattle.roomA : currentPkBattle.roomB;
        const right = isMineA ? currentPkBattle.roomB : currentPkBattle.roomA;
        const leftScore = isMineA ? currentPkBattle.scoreA : currentPkBattle.scoreB;
        const rightScore = isMineA ? currentPkBattle.scoreB : currentPkBattle.scoreA;
        const total = leftScore + rightScore;
        const leftPct = total > 0 ? Math.round((leftScore / total) * 100) : 50;

        const bar = document.createElement('div');
        bar.id = 'pk-battle-bar';
        bar.className = 'pk-battle-bar';
        bar.innerHTML = `
            <div class="pk-battle-row">
                <img src="${left.coverImage}" class="pk-battle-avatar">
                <div class="pk-battle-progress">
                    <div class="pk-battle-fill-left" style="width:${leftPct}%"></div>
                    <div class="pk-battle-fill-right" style="width:${100 - leftPct}%"></div>
                    <span class="pk-battle-score-left">${leftScore}</span>
                    <span class="pk-battle-vs"><i class="fas fa-bolt"></i></span>
                    <span class="pk-battle-score-right">${rightScore}</span>
                </div>
                <img src="${right.coverImage}" class="pk-battle-avatar">
            </div>
            <div id="pk-battle-timer" class="pk-battle-timer"></div>
        `;
        const header = mainContent.querySelector('.flex.justify-between.items-center');
        if (header) header.insertAdjacentElement('afterend', bar);
        else mainContent.prepend(bar);

        clearInterval(pkCountdownInterval);
        if (currentPkBattle.endsAt) {
            const updateTimer = () => {
                const timerEl = document.getElementById('pk-battle-timer');
                if (!timerEl) { clearInterval(pkCountdownInterval); return; }
                const remainingMs = new Date(currentPkBattle.endsAt).getTime() - Date.now();
                if (remainingMs <= 0) { timerEl.textContent = '00:00'; clearInterval(pkCountdownInterval); return; }
                const m = Math.floor(remainingMs / 60000);
                const s = Math.floor((remainingMs % 60000) / 1000);
                timerEl.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
            };
            updateTimer();
            pkCountdownInterval = setInterval(updateTimer, 1000);
        }
    }

    function removePkBar() {
        clearInterval(pkCountdownInterval);
        currentPkBattle = null;
        document.getElementById('pk-battle-bar')?.remove();
    }

    // ✅ نافذة نتيجة المعركة — تظهر لكل من الغرفتين عند الانتهاء
    function showPkResultModal({ roomA, roomB, scoreA, scoreB, winner }) {
        const isMineA = currentVoiceRoomId === roomA;
        const myScore = isMineA ? scoreA : scoreB;
        const otherScore = isMineA ? scoreB : scoreA;
        const iWon = (winner === 'A' && isMineA) || (winner === 'B' && !isMineA);
        const isDraw = winner === 'draw';

        const modal = document.createElement('div');
        modal.id = 'pk-result-modal';
        modal.className = 'fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4';
        modal.innerHTML = `
            <div class="bg-gray-800 rounded-xl shadow-xl p-6 w-full max-w-xs text-white text-center">
                <i class="fas ${isDraw ? 'fa-handshake text-gray-300' : (iWon ? 'fa-trophy text-yellow-400' : 'fa-face-frown text-gray-400')} text-4xl mb-3"></i>
                <p class="font-bold text-lg mb-2">${isDraw ? 'تعادل!' : (iWon ? 'فوز غرفتك! 🎉' : 'خسرت هذي الجولة')}</p>
                <p class="text-sm text-gray-400 mb-4">${myScore} : ${otherScore}</p>
                <button id="close-pk-result" class="w-full bg-purple-600 hover:bg-purple-700 py-2 rounded-lg font-bold text-sm">إغلاق</button>
            </div>
        `;
        document.body.appendChild(modal);
        modal.querySelector('#close-pk-result').addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => { if (e.target.id === 'pk-result-modal') modal.remove(); });
    }

    // =====================================================
    // ✅ تحدٍ بين أعضاء داخل نفس الغرفة (بعكس معركة PK أعلاه: بين شخصين/فريقين من نفس
    // الغرفة، وليس بين غرفتين) — إنشاء (المضيف/المسؤول فقط)، دعوات فردية، شريط حي بتأثيرات
    // "اقتراب من الحسم"، ونافذة نتيجة قوية بصرياً للفائز/الخاسر
    // =====================================================
    let currentSeatChallenge = null;
    let seatChallengeCountdownInterval = null;
    let seatChallengeFireShownFor = null; // 'A' | 'B' | null — يمنع تكرار تنبيه نفس التصدّر كل تحديث نقاط

    // ✅ نافذة إنشاء التحدي — يختار المضيف/المسؤول 2 أو 4 من الجالسين حالياً (تُقرأ مباشرة من
    // شبكة المقاعد بالشاشة، بلا طلب شبكة إضافي)، يُوزَّعون فريقين تلقائياً بالترتيب (أول
    // نصف 🔵، والباقي 🔴)، ثم مدة التحدي — كل هذا محلي فقط، السيرفر يتحقق من كل شيء مجدداً
    function showSeatChallengeCreateModal(room) {
        document.getElementById('seat-challenge-create-modal')?.remove();
        const candidates = Array.from(document.querySelectorAll('#voice-chat-grid .occupied-seat'))
            .map(el => ({
                userId: el.dataset.userId,
                username: el.title || '',
                profileImage: el.querySelector('img')?.src || '',
                seatNumber: parseInt(el.dataset.seat)
            }))
            .filter(c => !!c.userId);

        if (candidates.length < 2) {
            showNotification('يحتاج التحدي شخصين جالسين على الأقل', 'info');
            return;
        }

        const modal = document.createElement('div');
        modal.id = 'seat-challenge-create-modal';
        modal.className = 'fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4';
        modal.innerHTML = `
            <div class="bg-gray-800 rounded-xl shadow-xl p-5 w-full max-w-sm text-white max-h-[85vh] overflow-y-auto">
                <h3 class="text-lg font-bold mb-3"><i class="fas fa-fire text-red-400"></i> تحدٍ بين أعضاء</h3>
                <div class="mb-3">
                    <label class="text-xs text-gray-400 block mb-1.5">حجم التحدي</label>
                    <div class="grid grid-cols-2 gap-2">
                        <button type="button" data-size="2" class="challenge-size-btn bg-purple-600 text-xs py-2 rounded-lg font-bold">1 ضد 1</button>
                        <button type="button" data-size="4" class="challenge-size-btn bg-gray-700 text-xs py-2 rounded-lg font-bold">2 ضد 2</button>
                    </div>
                </div>
                <div class="mb-3">
                    <label class="text-xs text-gray-400 block mb-1.5">مدة التحدي</label>
                    <div class="grid grid-cols-3 gap-2">
                        <button type="button" data-sec="60" class="challenge-duration-btn bg-purple-600 text-xs py-2 rounded-lg font-bold">دقيقة</button>
                        <button type="button" data-sec="120" class="challenge-duration-btn bg-gray-700 text-xs py-2 rounded-lg font-bold">دقيقتان</button>
                        <button type="button" data-sec="180" class="challenge-duration-btn bg-gray-700 text-xs py-2 rounded-lg font-bold">3 دقائق</button>
                    </div>
                </div>
                <p id="challenge-pick-label" class="text-xs text-gray-400 mb-1.5">اخترت 0 من 2 — 🔵 مقابل 🔴</p>
                <div id="challenge-candidates-list" class="space-y-1.5 max-h-52 overflow-y-auto mb-3"></div>
                <button type="button" id="confirm-seat-challenge" disabled class="w-full bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed py-2.5 rounded-lg font-bold text-sm mb-2">إرسال الدعوات</button>
                <button type="button" id="cancel-seat-challenge-create" class="w-full text-center py-2 rounded-lg bg-gray-700 text-gray-300 text-sm">إلغاء</button>
            </div>
        `;
        document.body.appendChild(modal);
        modal.addEventListener('click', (e) => { if (e.target.id === 'seat-challenge-create-modal') modal.remove(); });
        modal.querySelector('#cancel-seat-challenge-create').addEventListener('click', () => modal.remove());

        let size = 2;
        let selectedDuration = 60;
        let selected = []; // [{ userId, team }]

        function renderCandidates() {
            const list = modal.querySelector('#challenge-candidates-list');
            list.innerHTML = candidates.map(c => {
                const sel = selected.find(s => s.userId === c.userId);
                const teamBadge = sel ? (sel.team === 'A' ? '🔵' : '🔴') : '';
                return `
                    <button type="button" class="challenge-candidate-btn ${sel ? 'challenge-candidate-selected' : ''}" data-user-id="${c.userId}">
                        <img src="${c.profileImage}" class="w-8 h-8 rounded-full flex-shrink-0">
                        <span class="text-xs flex-1 text-right truncate">${escapeHtml(c.username)}</span>
                        ${teamBadge ? `<span class="text-sm">${teamBadge}</span>` : ''}
                    </button>
                `;
            }).join('');
            list.querySelectorAll('.challenge-candidate-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const userId = btn.dataset.userId;
                    const existingIdx = selected.findIndex(s => s.userId === userId);
                    if (existingIdx !== -1) {
                        selected.splice(existingIdx, 1);
                    } else {
                        if (selected.length >= size) return;
                        selected.push({ userId, team: null }); // الفريق يُحسَب أدناه دائماً، لا هنا
                    }
                    // 🐛 إصلاح: تعيين الفريق وقت الإضافة فقط كان يُنتج فريقين غير متكافئين لو أُلغي
                    // اختيار شخص بمنتصف القائمة ثم اختير آخر بدلاً عنه (مثال: أختار 4، أُلغي
                    // الثاني، أختار خامساً — كان يصبح 1 مقابل 3 دون أي تنبيه، ويرفضه السيرفر
                    // لاحقاً بلا توضيح). إعادة حساب الفريقين كاملة حسب الترتيب الحالي تضمن توازناً
                    // تاماً دائماً (نصف الأول 🔵، نصف الثاني 🔴) بغض النظر عن أي تعديل سابق
                    selected.forEach((s, i) => { s.team = i < size / 2 ? 'A' : 'B'; });
                    renderCandidates();
                    updateConfirmState();
                });
            });
        }

        function updateConfirmState() {
            modal.querySelector('#confirm-seat-challenge').disabled = selected.length !== size;
            modal.querySelector('#challenge-pick-label').textContent = `اخترت ${selected.length} من ${size} — 🔵 مقابل 🔴`;
        }

        modal.querySelectorAll('.challenge-size-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                size = parseInt(btn.dataset.size);
                selected = [];
                modal.querySelectorAll('.challenge-size-btn').forEach(b => b.classList.remove('bg-purple-600'));
                modal.querySelectorAll('.challenge-size-btn').forEach(b => b.classList.add('bg-gray-700'));
                btn.classList.remove('bg-gray-700');
                btn.classList.add('bg-purple-600');
                renderCandidates();
                updateConfirmState();
            });
        });
        modal.querySelectorAll('.challenge-duration-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                selectedDuration = parseInt(btn.dataset.sec);
                modal.querySelectorAll('.challenge-duration-btn').forEach(b => b.classList.remove('bg-purple-600'));
                modal.querySelectorAll('.challenge-duration-btn').forEach(b => b.classList.add('bg-gray-700'));
                btn.classList.remove('bg-gray-700');
                btn.classList.add('bg-purple-600');
            });
        });

        renderCandidates();
        updateConfirmState();

        modal.querySelector('#confirm-seat-challenge').addEventListener('click', () => {
            if (selected.length !== size) return;
            socket.emit('create-seat-challenge', { roomId: room.id, participants: selected, durationSeconds: selectedDuration });
            showNotification('تم إرسال الدعوات ⏳', 'info');
            modal.remove();
        });
    }

    // ✅ نافذة استقبال دعوة تحدٍ — تظهر فقط لمن دعاه المضيف/المسؤول صراحة، بعدّاد تنازلي
    // يطابق مهلة السيرفر (30 ثانية) — إغلاق تلقائي عند انتهائها (رفض ضمني من طرف السيرفر)
    function showSeatChallengeInviteModal(data) {
        document.getElementById('seat-challenge-invite-modal')?.remove();
        const myTeam = data.participants.find(p => p.userId === myUserId)?.team;
        const teamEmoji = myTeam === 'A' ? '🔵' : '🔴';

        const modal = document.createElement('div');
        modal.id = 'seat-challenge-invite-modal';
        modal.className = 'fixed inset-0 bg-black/70 flex items-center justify-center z-[65] p-4';
        modal.innerHTML = `
            <div class="bg-gray-800 rounded-xl shadow-xl p-5 w-full max-w-xs text-white text-center">
                <i class="fas fa-fire text-3xl text-red-400 mb-3"></i>
                <p class="font-bold text-base mb-1">تحدٍ من ${escapeHtml(data.invitedBy)}!</p>
                <p class="text-xs text-gray-400 mb-4">أنت بالفريق ${teamEmoji} — هل تقبل؟</p>
                <div class="flex gap-2">
                    <button id="decline-seat-challenge" class="flex-1 bg-gray-700 hover:bg-gray-600 py-2 rounded-lg text-sm font-bold">رفض</button>
                    <button id="accept-seat-challenge" class="flex-1 bg-red-600 hover:bg-red-700 py-2 rounded-lg text-sm font-bold">قبول</button>
                </div>
                <p id="seat-challenge-invite-countdown" class="text-[10px] text-gray-500 mt-3"></p>
            </div>
        `;
        document.body.appendChild(modal);
        modal.querySelector('#accept-seat-challenge').addEventListener('click', () => {
            socket.emit('seat-challenge-response', { challengeId: data.challengeId, accept: true });
            modal.remove();
        });
        modal.querySelector('#decline-seat-challenge').addEventListener('click', () => {
            socket.emit('seat-challenge-response', { challengeId: data.challengeId, accept: false });
            modal.remove();
        });

        let remaining = data.expiresInSeconds || 30;
        const countdownEl = modal.querySelector('#seat-challenge-invite-countdown');
        const tick = () => {
            if (!document.body.contains(modal)) return;
            countdownEl.textContent = `${remaining} ثانية للرد`;
            remaining--;
            if (remaining < 0) { modal.remove(); return; }
            setTimeout(tick, 1000);
        };
        tick();
    }

    // ✅ شريط التحدي الحي — نفس فكرة شريط PK لكن بفريقين 🔵/🔴 بدل غرفتين، وخط فاصل رفيع
    // بالمنتصف، ويُدرَج مباشرة بعد شريط PK لو كان موجوداً (نادراً ما يتزامنان، لكن احتياطاً)
    function renderSeatChallengeBar(data) {
        document.getElementById('seat-challenge-bar')?.remove();
        currentSeatChallenge = data;
        seatChallengeFireShownFor = null;

        const teamA = data.participants.filter(p => p.team === 'A');
        const teamB = data.participants.filter(p => p.team === 'B');

        const bar = document.createElement('div');
        bar.id = 'seat-challenge-bar';
        bar.className = 'seat-challenge-bar';
        bar.innerHTML = `
            <div class="seat-challenge-header">
                <span class="seat-challenge-live-badge"><span class="seat-challenge-live-dot"></span> تحدي مباشر</span>
                <span id="seat-challenge-timer" class="seat-challenge-timer-pill"></span>
            </div>
            <div class="seat-challenge-row">
                <div class="seat-challenge-side seat-challenge-side-a">
                    <div class="seat-challenge-team seat-challenge-team-a">
                        ${teamA.map(p => `<img src="${p.profileImage}" class="seat-challenge-avatar" title="${escapeHtml(p.username || '')}">`).join('')}
                    </div>
                    <span id="seat-challenge-score-a" class="seat-challenge-score seat-challenge-score-a">0</span>
                </div>
                <div class="seat-challenge-progress-wrap">
                    <div class="seat-challenge-progress">
                        <div id="seat-challenge-fill-a" class="seat-challenge-fill-a"></div>
                        <div id="seat-challenge-fill-b" class="seat-challenge-fill-b"></div>
                        <div class="seat-challenge-divider"></div>
                    </div>
                    <span class="seat-challenge-vs-badge">VS</span>
                </div>
                <div class="seat-challenge-side seat-challenge-side-b">
                    <span id="seat-challenge-score-b" class="seat-challenge-score seat-challenge-score-b">0</span>
                    <div class="seat-challenge-team seat-challenge-team-b">
                        ${teamB.map(p => `<img src="${p.profileImage}" class="seat-challenge-avatar" title="${escapeHtml(p.username || '')}">`).join('')}
                    </div>
                </div>
            </div>
        `;
        const insertAfter = document.getElementById('pk-battle-bar') || mainContent.querySelector('.flex.justify-between.items-center');
        if (insertAfter) insertAfter.insertAdjacentElement('afterend', bar);
        else mainContent.prepend(bar);

        updateSeatChallengeScores(data.scoreA, data.scoreB);

        clearInterval(seatChallengeCountdownInterval);
        if (data.endsAt) {
            const updateTimer = () => {
                const timerEl = document.getElementById('seat-challenge-timer');
                if (!timerEl) { clearInterval(seatChallengeCountdownInterval); return; }
                const remainingMs = new Date(data.endsAt).getTime() - Date.now();
                if (remainingMs <= 0) { timerEl.textContent = '00:00'; clearInterval(seatChallengeCountdownInterval); return; }
                const m = Math.floor(remainingMs / 60000);
                const s = Math.floor((remainingMs % 60000) / 1000);
                timerEl.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
            };
            updateTimer();
            seatChallengeCountdownInterval = setInterval(updateTimer, 1000);
        }
    }

    let seatChallengeFireInterval = null;

    // ✅ تحديث النقاط + تأثيرات "اقتراب من الحسم" — نار DOM حقيقية متصاعدة (وليست تدرّج CSS
    // فقط) فوق تعبئة الفريق المتصدّر بوضوح (68%+ من مجموع النقاط)، وخوف مرتجف قوي على الفريق
    // المتأخر — لا يتكرر التنبيه لنفس التصدّر كل تحديث نقاط، فقط عند تغيّر من هو المتصدّر
    function updateSeatChallengeScores(scoreA, scoreB) {
        if (currentSeatChallenge) { currentSeatChallenge.scoreA = scoreA; currentSeatChallenge.scoreB = scoreB; }
        const total = scoreA + scoreB;
        const pctA = total > 0 ? Math.round((scoreA / total) * 100) : 50;
        document.getElementById('seat-challenge-fill-a')?.style.setProperty('width', `${pctA}%`);
        document.getElementById('seat-challenge-fill-b')?.style.setProperty('width', `${100 - pctA}%`);
        const scoreAEl = document.getElementById('seat-challenge-score-a');
        const scoreBEl = document.getElementById('seat-challenge-score-b');
        if (scoreAEl) scoreAEl.textContent = scoreA;
        if (scoreBEl) scoreBEl.textContent = scoreB;

        const bar = document.getElementById('seat-challenge-bar');
        if (!bar || total < 40) { stopSeatChallengeFireEffect(); return; } // ✅ لا تأثيرات قبل فارق نقاط ذو معنى فعلياً
        const leadingTeam = pctA >= 68 ? 'A' : (pctA <= 32 ? 'B' : null);
        if (leadingTeam && leadingTeam !== seatChallengeFireShownFor) {
            seatChallengeFireShownFor = leadingTeam;
            bar.classList.remove('seat-challenge-lead-a', 'seat-challenge-lead-b');
            bar.classList.add(leadingTeam === 'A' ? 'seat-challenge-lead-a' : 'seat-challenge-lead-b');
            showBottomToast(leadingTeam === 'A' ? '🔥 الفريق الأزرق يقترب من الحسم!' : '🔥 الفريق الأحمر يقترب من الحسم!', 'fa-fire');
            startSeatChallengeFireEffect(leadingTeam);
        } else if (!leadingTeam && seatChallengeFireShownFor) {
            seatChallengeFireShownFor = null;
            bar.classList.remove('seat-challenge-lead-a', 'seat-challenge-lead-b');
            stopSeatChallengeFireEffect();
        }
    }

    // ✅ يولّد شعلات نار DOM حقيقية (🔥/✨) تتصاعد فوق تعبئة الفريق المتصدّر باستمرار طالما
    // بقي متصدّراً — كل شعلة بموضع أفقي عشوائي فوق التعبئة فعلياً (لا داخل الشريط المقصوص
    // overflow:hidden، بل فوقه مباشرة كطبقة منفصلة) فتبدو "تشتعل" وتهرب للأعلى بشكل طبيعي
    function startSeatChallengeFireEffect(leadingTeam) {
        stopSeatChallengeFireEffect();
        const fillId = leadingTeam === 'A' ? 'seat-challenge-fill-a' : 'seat-challenge-fill-b';
        const spawnFlame = () => {
            const bar = document.getElementById('seat-challenge-bar');
            const fillEl = document.getElementById(fillId);
            if (!bar || !fillEl) { stopSeatChallengeFireEffect(); return; }
            const barRect = bar.getBoundingClientRect();
            const fillRect = fillEl.getBoundingClientRect();
            const flame = document.createElement('span');
            flame.className = 'seat-challenge-flame';
            flame.textContent = Math.random() > 0.75 ? '✨' : '🔥';
            flame.style.left = `${fillRect.left - barRect.left + Math.random() * fillRect.width}px`;
            flame.style.top = `${fillRect.top - barRect.top}px`;
            flame.style.animationDuration = `${0.7 + Math.random() * 0.5}s`;
            bar.appendChild(flame);
            setTimeout(() => flame.remove(), 1300);
        };
        spawnFlame();
        seatChallengeFireInterval = setInterval(spawnFlame, 180);
    }

    function stopSeatChallengeFireEffect() {
        clearInterval(seatChallengeFireInterval);
        seatChallengeFireInterval = null;
        document.querySelectorAll('.seat-challenge-flame').forEach(el => el.remove());
    }

    function removeSeatChallengeBar() {
        clearInterval(seatChallengeCountdownInterval);
        stopSeatChallengeFireEffect();
        currentSeatChallenge = null;
        seatChallengeFireShownFor = null;
        document.getElementById('seat-challenge-bar')?.remove();
    }

    // ✅ نافذة نتيجة التحدي — قوية بصرياً وتختلف باختلاف من يشاهدها: شرر ذهبي متطاير للفائز
    // المشارك، بطاقة مهتزة داكنة للخاسر المشارك، وملخص محايد لمن كان مجرد مشاهد (يُغلق تلقائياً)
    function showSeatChallengeResultModal(data) {
        removeSeatChallengeBar();
        document.getElementById('seat-challenge-result-modal')?.remove();

        const myParticipant = data.participants.find(p => p.userId === myUserId);
        const isDraw = data.winner === 'draw';
        const iWon = !!myParticipant && !isDraw && myParticipant.team === data.winner;
        const iLost = !!myParticipant && !isDraw && !iWon;

        let title, icon, cardClass;
        if (isDraw) { title = 'تعادل!'; icon = 'fa-handshake'; cardClass = ''; }
        else if (iWon) { title = 'فزت! 🏆'; icon = 'fa-trophy'; cardClass = 'seat-challenge-result-card-win'; }
        else if (iLost) { title = 'خسرت الجولة'; icon = 'fa-face-frown'; cardClass = 'seat-challenge-result-card-lose'; }
        else { title = data.winner === 'A' ? 'فاز الفريق 🔵' : 'فاز الفريق 🔴'; icon = 'fa-trophy'; cardClass = ''; }

        if (iWon) fireConfettiBurst(['#3b82f6', '#06b6d4', '#fbbf24']);

        const particles = iWon ? Array.from({ length: 16 }, (_, i) => {
            const angle = Math.round((360 / 16) * i);
            const delay = (Math.random() * 0.2).toFixed(2);
            return `<span class="seat-challenge-confetti" style="--angle:${angle}deg; --delay:${delay}s"></span>`;
        }).join('') : '';

        const modal = document.createElement('div');
        modal.id = 'seat-challenge-result-modal';
        modal.className = 'fixed inset-0 bg-black/75 flex items-center justify-center z-[65] p-4';
        modal.innerHTML = `
            <div class="seat-challenge-result-card ${cardClass}">
                ${particles}
                <i class="fas ${icon} seat-challenge-result-icon"></i>
                <p class="seat-challenge-result-title">${title}</p>
                <p class="seat-challenge-result-score">${data.scoreA} 🔵 — 🔴 ${data.scoreB}</p>
                <button id="close-seat-challenge-result" class="seat-challenge-result-close-btn">إغلاق</button>
            </div>
        `;
        document.body.appendChild(modal);
        modal.querySelector('#close-seat-challenge-result').addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => { if (e.target.id === 'seat-challenge-result-modal') modal.remove(); });
        if (!myParticipant) setTimeout(() => modal.remove(), 4000); // ✅ مجرد مشاهد غير مشارك — لا حاجة لإغلاق يدوي
    }

    // ✅ متجر خلفيات الغرفة — تبويبان: "خاصتي" (المجانية الدائمة) و"المظهر" (مدفوعة، 5 أيام لكل واحدة)
    async function showRoomBackgroundShopModal(room) {
        const existing = document.getElementById('room-bg-shop-modal');
        if (existing) existing.remove();

        const shellHTML = `
            <div id="room-bg-shop-modal" class="fixed inset-0 bg-black/70 flex items-center justify-center z-[330] p-4">
                <div class="bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm text-white border border-gray-700 max-h-[85vh] flex flex-col">
                    <div class="flex items-center justify-between p-4 border-b border-gray-700">
                        <h3 class="text-base font-bold"><i class="fas fa-image text-purple-400"></i> خلفية الغرفة</h3>
                        <button id="close-bg-shop" class="text-gray-400 hover:text-white p-1"><i class="fas fa-times"></i></button>
                    </div>
                    <div class="flex border-b border-gray-700 flex-shrink-0">
                        <button class="bg-shop-tab flex-1 py-2.5 text-sm font-bold border-b-2 border-purple-500 text-white" data-tab="mine">خاصتي</button>
                        <button class="bg-shop-tab flex-1 py-2.5 text-sm font-bold border-b-2 border-transparent text-gray-400" data-tab="shop">المظهر</button>
                    </div>
                    <div id="bg-shop-body" class="p-4 overflow-y-auto flex-1">
                        <div class="text-center py-10 text-gray-400"><i class="fas fa-spinner fa-spin"></i></div>
                    </div>
                </div>
            </div>
        `;
        document.getElementById('game-container').insertAdjacentHTML('beforeend', shellHTML);
        const modal = document.getElementById('room-bg-shop-modal');
        document.getElementById('close-bg-shop').addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => { if (e.target.id === 'room-bg-shop-modal') modal.remove(); });

        let shopData = null;
        try {
            const shopRes = await fetch('/api/voice-room/background-shop', { headers: { 'Authorization': `Bearer ${token}` } });
            shopData = await shopRes.json();
        } catch (error) {
            console.error('[BG SHOP] Load error:', error);
        }
        if (!shopData) {
            document.getElementById('bg-shop-body').innerHTML = '<p class="text-center text-red-400 py-10">فشل تحميل المتجر</p>';
            return;
        }

        let activeTab = 'mine';

        function renderMineTab() {
            const isFree = !currentRoomBackgroundImage;
            const daysLeft = currentRoomBackgroundExpiresAt
                ? Math.max(0, Math.ceil((new Date(currentRoomBackgroundExpiresAt) - Date.now()) / 86400000))
                : null;
            return `
                <button id="activate-free-bg-btn" class="w-full text-right bg-gray-700/50 rounded-xl p-3 flex items-center gap-3 ${isFree ? 'ring-2 ring-purple-500' : ''}">
                    <img src="${shopData.freeDefault}" class="w-14 h-14 rounded-lg object-cover flex-shrink-0">
                    <div class="flex-1">
                        <p class="font-bold text-sm">الخلفية المجانية</p>
                        <p class="text-[11px] text-gray-400">دائمة ومتاحة لكل الغرف</p>
                    </div>
                    ${isFree ? '<i class="fas fa-check-circle text-purple-400"></i>' : ''}
                </button>
                ${!isFree ? `
                    <div class="mt-3 bg-gray-700/50 rounded-xl p-3 flex items-center gap-3 ring-2 ring-amber-500">
                        <img src="${currentRoomBackgroundImage}" class="w-14 h-14 rounded-lg object-cover flex-shrink-0">
                        <div class="flex-1">
                            <p class="font-bold text-sm">الخلفية المفعّلة حالياً</p>
                            <p class="text-[11px] text-amber-400">${daysLeft !== null ? `تنتهي خلال ${daysLeft} يوم` : ''}</p>
                        </div>
                    </div>
                ` : ''}
            `;
        }

        function renderShopTab() {
            return `
                <div class="grid grid-cols-2 gap-3">
                    ${shopData.premium.map(bg => {
                        const isActive = currentRoomBackgroundImage === bg.url;
                        return `
                        <button class="bg-shop-item-btn text-right bg-gray-700/50 rounded-xl overflow-hidden ${isActive ? 'ring-2 ring-amber-500' : ''}" data-id="${bg.id}">
                            <img src="${bg.url}" class="w-full aspect-video object-cover">
                            <div class="p-2">
                                <p class="text-[11px] text-yellow-400 font-bold"><i class="fas fa-coins"></i> ${bg.price} / ${shopData.days} أيام</p>
                                ${isActive ? '<p class="text-[10px] text-amber-400 mt-0.5">مفعّلة حالياً</p>' : ''}
                            </div>
                        </button>`;
                    }).join('')}
                </div>
            `;
        }

        function renderTab() {
            const body = document.getElementById('bg-shop-body');
            body.innerHTML = activeTab === 'mine' ? renderMineTab() : renderShopTab();

            if (activeTab === 'mine') {
                document.getElementById('activate-free-bg-btn')?.addEventListener('click', async () => {
                    await applyRoomBackgroundChoice(room.id, 'free');
                    modal.remove();
                });
            } else {
                body.querySelectorAll('.bg-shop-item-btn').forEach(btn => {
                    btn.addEventListener('click', async () => {
                        const bgId = btn.dataset.id;
                        const bg = shopData.premium.find(b => b.id === bgId);
                        if (!bg || currentRoomBackgroundImage === bg.url) return; // مفعّلة أصلاً
                        if (!confirm(`شراء هذي الخلفية بـ ${bg.price} كوينز لمدة ${shopData.days} أيام؟`)) return;
                        await applyRoomBackgroundChoice(room.id, bgId);
                        modal.remove();
                    });
                });
            }
        }

        modal.querySelectorAll('.bg-shop-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                activeTab = tab.dataset.tab;
                modal.querySelectorAll('.bg-shop-tab').forEach(t => {
                    const isActive = t === tab;
                    t.classList.toggle('border-purple-500', isActive);
                    t.classList.toggle('text-white', isActive);
                    t.classList.toggle('border-transparent', !isActive);
                    t.classList.toggle('text-gray-400', !isActive);
                });
                renderTab();
            });
        });

        renderTab();
    }

    // ✅ يرسل اختيار الخلفية للسيرفر (مجانية فورية، أو شراء مدفوعة) ويحدّث كل شيء محلياً
    async function applyRoomBackgroundChoice(roomId, backgroundId) {
        try {
            const response = await fetch(`/api/voice-room/rooms/${roomId}/background`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ backgroundId })
            });
            const result = await response.json();
            if (!response.ok) {
                showNotification(result.message || 'تعذر تفعيل الخلفية', 'error');
                return;
            }
            currentRoomBackgroundImage = result.backgroundImage;
            currentRoomBackgroundExpiresAt = result.backgroundExpiresAt;
            applyRoomBackground(currentRoomBackgroundImage);

            if (result.newBalance !== null && result.newBalance !== undefined) {
                const localUser = JSON.parse(localStorage.getItem('user'));
                if (localUser) {
                    localUser.coins = result.newBalance;
                    localStorage.setItem('user', JSON.stringify(localUser));
                }
                const coinsEl = document.getElementById('coins');
                if (coinsEl) coinsEl.textContent = result.newBalance;
            }
            showNotification('تم تفعيل الخلفية ✅', 'success');
        } catch (error) {
            console.error('[BG SHOP] Purchase error:', error);
            showNotification('حدث خطأ، حاول مجدداً', 'error');
        }
    }

    function showCreateRoomModal() {
        const presetCovers = [
            'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=400&q=60',
            'https://images.unsplash.com/photo-1614850523459-c2f4c699c52e?w=400&q=60',
            'https://images.unsplash.com/photo-1470813740244-df37b8c1edcb?w=400&q=60',
            'https://images.unsplash.com/photo-1533158307587-828f0a76ef46?w=400&q=60',
            'https://images.unsplash.com/photo-1478760329108-5c3ed9d495a0?w=400&q=60',
            'https://images.unsplash.com/photo-1506318137071-a8e063b4bec0?w=400&q=60'
        ];
        const modal = document.createElement('div');
        modal.id = 'create-room-modal';
        modal.className = 'fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4';
        modal.innerHTML = `
            <div class="bg-gray-800 rounded-xl shadow-xl p-6 w-full max-w-sm text-white max-h-[90vh] overflow-y-auto">
                <h3 class="text-lg font-bold mb-1"><i class="fas fa-plus-circle text-purple-400"></i> إنشئ غرفتك الخاصة</h3>
                <p class="text-xs text-gray-400 mb-4">غرفة واحدة فقط لكل حساب — تقدر تعدّل باقي الإعدادات لاحقاً من داخلها</p>
                <form id="create-room-form" class="space-y-4">
                    <div>
                        <label class="text-sm">اسم الغرفة</label>
                        <input type="text" name="name" maxlength="22" required autofocus class="w-full bg-gray-700 border border-gray-600 rounded-lg p-2 mt-1 focus:ring-purple-500 focus:border-purple-500">
                    </div>
                    <div>
                        <label class="text-sm mb-1 block">اختر غلافاً</label>
                        <div id="cover-picker" class="grid grid-cols-3 gap-2">
                            ${presetCovers.map((url, i) => `
                                <label class="relative cursor-pointer">
                                    <input type="radio" name="coverImage" value="${url}" ${i === 0 ? 'checked' : ''} class="peer sr-only">
                                    <img src="${url}" class="w-full aspect-square object-cover rounded-lg ring-2 ring-transparent peer-checked:ring-purple-500 opacity-70 peer-checked:opacity-100 transition-all">
                                    <i class="fas fa-check-circle text-purple-400 absolute top-1 right-1 hidden peer-checked:block bg-gray-900 rounded-full text-xs"></i>
                                </label>
                            `).join('')}
                        </div>
                    </div>
                    <div class="flex justify-end gap-3 pt-2">
                        <button type="button" id="cancel-create-room" class="bg-gray-600 hover:bg-gray-500 text-white py-2 px-4 rounded-lg">إلغاء</button>
                        <button type="submit" class="bg-purple-600 hover:bg-purple-700 text-white py-2 px-4 rounded-lg">إنشاء ودخول</button>
                    </div>
                </form>
            </div>
        `;
        document.body.appendChild(modal);

        modal.querySelector('#cancel-create-room').addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => { if (e.target.id === 'create-room-modal') modal.remove(); });

        const form = modal.querySelector('#create-room-form');
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(form);
            const data = Object.fromEntries(formData.entries());

            if (!data.name || data.name.trim().length < 2) {
                showNotification('يرجى إدخال اسم غرفة صالح', 'error');
                return;
            }

            const submitBtn = form.querySelector('button[type="submit"]');
            const originalHTML = submitBtn.innerHTML;
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

            try {
                const response = await fetch('/api/voice-room/rooms', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify(data)
                });
                const result = await response.json();
                if (!response.ok) {
                    showNotification(result.message || 'تعذر إنشاء الغرفة', 'error');
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = originalHTML;
                    return;
                }
                modal.remove();
                showNotification('تم إنشاء غرفتك بنجاح ✅', 'success');
                // ✅ دخول مباشر للغرفة الجديدة (بدل الرجوع لقائمة التصفح)
                enterVoiceRoom({ id: result.room.id, name: result.room.name, seatCount: result.room.seatCount, isPrivate: result.room.isPrivate, isOfficial: false });
            } catch (error) {
                showNotification('حدث خطأ، حاول مجدداً', 'error');
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalHTML;
            }
        });
    }

    function showVoiceRoomsView() {
        // ✅ نفس استثناء مقعد المضيف (1) الموجود بـ showCustomRoomView — يبقى مثبّتاً حتى وأنا أتصفح الرسمية
        if (myVoiceSeatNumber && myVoiceRoomId && myVoiceRoomId !== 'main' && myVoiceSeatNumber !== 1) {
            leaveVoiceSeat();
        }
        currentVoiceRoomId = 'main';
        currentRoomPassword = null;
        currentRoomMyRole = 'guest';
        currentRoomHostId = null;
        currentRoomIsLocked = false;
        currentRoomChatLocked = false;
        currentRoomBackgroundImage = null;
        currentRoomDescription = '';
        myHandRaised = false;
        roomHandQueue = [];
        currentPkBattle = null;
        enterFullscreenRoomMode();
        mainContent.innerHTML = `
            <div class="flex justify-between items-center mb-4">
                <div class="flex items-center gap-2">
                    <button id="back-to-rooms-btn" class="w-8 h-8 rounded-full bg-gray-700/60 hover:bg-gray-600 flex items-center justify-center text-gray-300" title="رجوع لقائمة الغرف">
                        <i class="fas fa-arrow-right"></i>
                    </button>
                    <h2 class="text-lg md:text-xl font-bold"><i class="fas fa-crown text-amber-400"></i> الغرفة الرسمية</h2>
                </div>
                <span class="text-xs text-gray-400">80 مقعد</span>
            </div>
            <div id="voice-chat-grid" class="voice-seats-flex mb-1"></div>
            ${renderRoomChatMarkup()}
        `;
        document.getElementById('back-to-rooms-btn').addEventListener('click', showRoomBrowserView);
        wireRoomChatUI();

        renderVoiceRoomSeats('main', 80, 5, false);
        // ✅ لقطة الحالة الحقيقية عند فتح الغرفة (كانت مفقودة بالكامل سابقاً)
        fetchAndRenderVoiceSnapshot('main');
        updateVoiceControlBar();
        enterRoomChat('main');
    }

    // ✅ يمنع إرسال طلب مقعد جديد قبل ما يرجع رد الطلب السابق (نجاح أو فشل) —
    // طبقة حماية إضافية بالواجهة فوق القفل الأساسي بالسيرفر، ويحسّن الإحساس بالاستجابة
    let voiceSeatActionPending = false;
    function clearVoiceSeatPending() { voiceSeatActionPending = false; }

    function joinVoiceSeat(seatNumber, password) {
        if (voiceSeatActionPending) return;
        voiceSeatActionPending = true;
        setTimeout(clearVoiceSeatPending, 4000); // أمان إضافي لو ضاع الرد لأي سبب
        socket.emit('join-voice-seat', { roomId: currentVoiceRoomId, seatNumber, password });
    }

    function leaveVoiceSeat() {
        if (voiceSeatActionPending) return;
        voiceSeatActionPending = true;
        setTimeout(clearVoiceSeatPending, 4000);
        // ✅ نرسل الطلب دائماً بغض النظر عن حالة المتصفح المحلية — السيرفر هو المرجع الوحيد
        // ويتجاهل الطلب بأمان لو لم يكن المستخدم قاعداً أصلاً (كان الشرط هنا سابقاً قد يمنع
        // الزر من العمل لو تزامنت الحالة المحلية بالخطأ بعد انقطاع/إعادة اتصال)
        socket.emit('leave-voice-seat');
    }

    function toggleVoiceMute() {
        if (!myVoiceSeatNumber) return;
        socket.emit('toggle-mute', { isMuted: !myIsMuted });
    }

    // =====================================================
    // ✅ الصوت الحي بين الجالسين على المقاعد (WebRTC) — نمط "نجمي" مختلط:
    // • جالس ↔ جالس: اتصال مباشر (نظير لنظير) ثنائي الاتجاه بين كل من يجلس على مقعد وكل
    //   من يجلس على مقعد آخر بنفس الغرفة (شبكة كاملة صغيرة، بحد أقصى 24 مقعداً).
    // • جالس → مشاهد: كل "مشاهد" (غير جالس، لكنه بشاشة الغرفة) يتصل استقبالاً فقط بكل من
    //   هو جالس حالياً، فيسمعه دون أن يُطلب منه إذن المايك إطلاقاً (ليس بحاجة له كمستمع).
    //   بهذا يسمع كل من بالغرفة كل من يتحدث فعلياً، لا الجالسين فقط بين بعضهم.
    // السيرفر لا يلمس الصوت إطلاقاً، فقط يُوصّل رسائل التفاوض (SDP/ICE) عبر Socket.IO
    // الموجود أصلاً، بعد التحقق أن الطرفين فعلاً بقناة الغرفة (انظر isInRoomChannel
    // بـsocketService.js) + تحديد معدّل — بلا أي مكتبة أو خادم وسائط خارجي.
    // 🛡️ سقف MAX_VOICE_PEER_CONNECTIONS يحمي جهاز كل مستخدم من إرهاق موارده لو تضخّم عدد
    // المشاهدين المتزامنين كثيراً (كل جالس يتحمّل إرسال صوته لكل مشاهد على حدة).
    // 🔭 حدود معروفة ومقصودة: هذا النمط ("نجمة" من كل جالس لكل مشاهد) يعمل ممتاز لعدد
    // معتدل من المشاهدين المتزامنين لكل متحدث (الصوت وحده خفيف جداً: ~24kbps لكل اتصال)،
    // لكنه لن يتحمّل آلاف المشاهدين المتزامنين على متحدث واحد (كل اتصال إضافي = رفع صوت
    // إضافي فعلي من جهاز المتحدث نفسه) — التوسّع لذاك المستوى يحتاج خادم وسائط مركزي
    // حقيقي (SFU مثل LiveKit/mediasoup)، بنية تحتية منفصلة خارج نطاق هذا الحل بالكامل
    // =====================================================
    const VOICE_ICE_SERVERS = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ];
    const MAX_VOICE_PEER_CONNECTIONS = 60; // 🛡️ سقف حماية لجهاز المستخدم نفسه — انظر الشرح أعلاه
    const voicePeerConnections = new Map(); // peerUserId(string) → RTCPeerConnection
    let localMicStream = null;      // التدفق المُرسَل فعلياً للنظراء (بعد سلسلة التحسين أدناه إن نجحت)
    let localMicRawStream = null;   // التدفق الخام من الجهاز — محتفَظ به فقط لإيقاف المايك فعلياً عند الإنهاء
    let micDspCleanup = null;       // تنظيف سياق معالجة الصوت المحلي (AudioContext + المؤقتات)
    let howlingWarningShownThisSession = false; // ✅ تحذير صدى واحد لكل جلسة تحدّث — لا إزعاج متكرر
    let micPermissionDenied = false; // ✅ لا نُزعج المستخدم بطلب صلاحية متكرر لو رفضها صراحة مرة

    // ✅ سلسلة تحسين الصوت الصادر — Web Audio API أصلي بالكامل بلا أي مكتبة خارجية:
    // 1) مرشّح تمرير عالٍ يقصّ الدمدمة تحت 90Hz (مسك الجهاز، ضجيج المكيّف...)
    // 2) ضاغط ديناميكي يمنع تشويه/"صرير" القطع (clipping) عند اقتراب الصوت من المايك،
    //    ويقرّب مستوى الصوت العام فلا يبقى المتحدث الهادئ خافتاً جداً أمام الصاخب
    // 3) بوّابة ضجيج تلقائية بعتبتين منفصلتين للفتح/الإغلاق (تمنع "رفرفة" البوابة قرب
    //    العتبة) تُسكت المايك تماماً حين لا يوجد كلام حقيقي — تقطع أي فحيح/صرير خلفية
    //    مستمر، وتُقلّل تلقائياً مدة انفتاح المايك، ما يقلّل فرصة التقاطه صدى سمّاعة جهاز
    //    مجاور بالواقع (هذا هو السبب الجذري الفعلي لصدى/تكرار الصوت بين جالسين متجاورين:
    //    مايك كل جهاز يبقى مفتوحاً طوال الوقت فيلتقط صوت سمّاعة الجهاز الآخر ويعيد بثّه،
    //    فتتكوّن حلقة صدى مستمرة — إغلاق أي مايك لا يتحدث صاحبه فعلياً يكسر الحلقة تلقائياً)
    // 4) كاشف "صدى/صرير محتمل" ذكي: يراقب توزّع نفس بيانات الترددات ليكتشف نغمة ضيّقة
    //    النطاق مستمرة (بصمة صوت الصدى المميزة، مختلفة تماماً عن توزّع الكلام الطبيعي
    //    عريض النطاق)، فيخفّض صوتي الصادر تلقائياً فوراً لكسر الحلقة، وينبّهني لاستخدام
    //    سماعة رأس — إجراء ذاتي بحت يلمس صوتي أنا فقط، لا يلمس صوت أي مستخدم آخر إطلاقاً
    function buildProcessedMicStream(rawStream) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return null;
        const ctx = new AudioCtx();
        const source = ctx.createMediaStreamSource(rawStream);

        const highpass = ctx.createBiquadFilter();
        highpass.type = 'highpass';
        highpass.frequency.value = 90;
        highpass.Q.value = 0.7;

        const compressor = ctx.createDynamicsCompressor();
        compressor.threshold.value = -28;
        compressor.knee.value = 22;
        compressor.ratio.value = 9;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.15;

        const gateGain = ctx.createGain();
        gateGain.gain.value = 0;

        const destination = ctx.createMediaStreamDestination();
        source.connect(highpass);
        highpass.connect(compressor);
        compressor.connect(gateGain);
        gateGain.connect(destination);

        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        highpass.connect(analyser);
        const freqData = new Uint8Array(analyser.frequencyBinCount);

        const GATE_OPEN_THRESHOLD = 14;
        const GATE_CLOSE_THRESHOLD = 8;
        let gateOpen = false;
        let howlBinStreak = 0;

        const intervalId = setInterval(() => {
            analyser.getByteFrequencyData(freqData);
            let sum = 0, peak = 0;
            for (let i = 0; i < freqData.length; i++) {
                sum += freqData[i];
                if (freqData[i] > peak) peak = freqData[i];
            }
            const avg = sum / freqData.length;

            if (!gateOpen && avg > GATE_OPEN_THRESHOLD) {
                gateOpen = true;
                gateGain.gain.setTargetAtTime(1, ctx.currentTime, 0.01);
            } else if (gateOpen && avg < GATE_CLOSE_THRESHOLD) {
                gateOpen = false;
                gateGain.gain.setTargetAtTime(0, ctx.currentTime, 0.25);
            }

            if (avg > GATE_OPEN_THRESHOLD) {
                const isNarrowBand = peak > 0 && (peak / Math.max(avg, 1)) > 4.2;
                howlBinStreak = isNarrowBand ? howlBinStreak + 1 : 0;
                if (howlBinStreak > 12 && !howlingWarningShownThisSession) { // ~12×60ms ≈ 720ms استمرار
                    howlingWarningShownThisSession = true;
                    gateGain.gain.setTargetAtTime(0.15, ctx.currentTime, 0.05); // كتم جزئي فوري يكسر الحلقة
                    // 🐛 إصلاح: showFloatingAlert نص طويل بلا حد أقصى للعرض تكسر على الهاتف (كبسولة
                    // منتصف الشاشة بلا max-width) وتختفي خلال 1.9 ثانية فقط — قصيرة جداً لقراءة
                    // نص كهذا. showBottomToast جاهزة أصلاً لبالضبط هذي الحالة: أسفل الشاشة، عرض
                    // محدود (90vw)، مدة أطول (3.6 ثانية) — استخدمناها هنا مع رسالة أقصر وأوضح
                    showBottomToast('🎧 صدى محتمل — جرّب سماعة الرأس', 'fa-headphones');
                }
            } else {
                howlBinStreak = 0;
            }
        }, 60);

        return {
            stream: destination.stream,
            cleanup: () => {
                clearInterval(intervalId);
                ctx.close().catch(() => {});
            }
        };
    }

    // ✅ كاشف "من يتكلم الآن" — يحلّل مستوى الصوت الفعلي لكل تدفق صوت أستقبله (Web Audio
    // API، محلياً بالكامل بمتصفحي أنا، بلا أي إشارة سيرفر إضافية) ويُضيء حلقة خضراء حول
    // مقعده تلقائياً. نفس الآلية تُطبَّق على صوتي أنا نفسي لإضاءة مقعدي عند حديثي أيضاً
    const voiceSpeakingDetectors = new Map(); // userId(string) → { audioCtx, intervalId }
    const SPEAKING_VOLUME_THRESHOLD = 18; // مُعاير تجريبياً: يلتقط الكلام العادي، يتجاهل الضجيج الخلفي الخفيف

    function attachSpeakingDetector(stream, forUserId) {
        try {
            detachSpeakingDetector(forUserId); // ✅ يمنع كاشفَين متراكبَين لنفس الشخص لو أُعيد الاستدعاء
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx || !stream.getAudioTracks().length) return;
            const audioCtx = new AudioCtx();
            const source = audioCtx.createMediaStreamSource(stream);
            const analyser = audioCtx.createAnalyser();
            analyser.fftSize = 512;
            source.connect(analyser);
            const data = new Uint8Array(analyser.frequencyBinCount);
            let speaking = false;
            const intervalId = setInterval(() => {
                analyser.getByteFrequencyData(data);
                const avg = data.reduce((a, b) => a + b, 0) / data.length;
                // ✅ لو كان هذا صوتي أنا وأنا مكتوم، لا تُضئ مقعدي حتى لو التقط المايك ضجيجاً
                const isSpeaking = avg > SPEAKING_VOLUME_THRESHOLD && !(forUserId === myUserId && myIsMuted);
                if (isSpeaking !== speaking) {
                    speaking = isSpeaking;
                    document.querySelector(`#voice-chat-grid [data-user-id="${forUserId}"]`)?.classList.toggle('voice-seat-speaking', isSpeaking);
                }
            }, 150);
            voiceSpeakingDetectors.set(forUserId, { audioCtx, intervalId });
        } catch (error) {
            console.warn('[VOICE] فشل تفعيل كاشف التحدث:', error);
        }
    }

    function detachSpeakingDetector(forUserId) {
        const d = voiceSpeakingDetectors.get(forUserId);
        if (d) {
            clearInterval(d.intervalId);
            d.audioCtx.close().catch(() => {});
            voiceSpeakingDetectors.delete(forUserId);
        }
        document.querySelector(`#voice-chat-grid [data-user-id="${forUserId}"]`)?.classList.remove('voice-seat-speaking');
    }

    async function ensureLocalMicStream() {
        if (localMicStream) return localMicStream;
        if (micPermissionDenied) return null;
        if (!navigator.mediaDevices?.getUserMedia) return null; // ✅ متصفح قديم/سياق غير آمن (يتطلب HTTPS)
        try {
            const rawStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: { ideal: true },
                    noiseSuppression: { ideal: true },
                    autoGainControl: { ideal: true },
                    channelCount: { ideal: 1 },
                    sampleRate: { ideal: 48000 }
                }
            });
            localMicRawStream = rawStream;
            // ✅ تمرير الصوت عبر سلسلة التحسين المحلية (راجع buildProcessedMicStream أعلاه)؛
            // لو فشلت لأي سبب (متصفح لا يدعم Web Audio مثلاً) نتراجع بأمان للصوت الخام مباشرة
            // بدل تعطيل الميزة كاملة — التحسين إضافة اختيارية، ليس شرطاً لعمل الصوت الحي أصلاً
            let outputStream = rawStream;
            try {
                const processed = buildProcessedMicStream(rawStream);
                if (processed) { outputStream = processed.stream; micDspCleanup = processed.cleanup; }
            } catch (dspError) {
                console.warn('[VOICE] تعذّر تفعيل سلسلة تحسين الصوت — استخدام الصوت الخام مباشرة:', dspError);
            }
            localMicStream = outputStream;
            // ✅ يعكس حالة كتمي الحالية فوراً (لو كنت مكتوماً أصلاً قبل توفّر المايك)
            localMicStream.getAudioTracks().forEach(t => { t.enabled = !myIsMuted; });
            attachSpeakingDetector(localMicStream, myUserId); // ✅ يُضيء مقعدي أنا نفسي عند حديثي
            return localMicStream;
        } catch (error) {
            console.warn('[VOICE] تعذّر الوصول للمايكروفون:', error?.name || error);
            micPermissionDenied = true;
            showFloatingAlert('تعذّر الوصول للمايكروفون — تحقّق من إذن الوصول له', 'fa-microphone-slash', 'bg-red-500');
            return null;
        }
    }

    function getOrCreateVoicePeer(peerUserId) {
        let pc = voicePeerConnections.get(peerUserId);
        if (pc) return pc;

        pc = new RTCPeerConnection({ iceServers: VOICE_ICE_SERVERS });
        voicePeerConnections.set(peerUserId, pc);

        if (localMicStream) {
            localMicStream.getTracks().forEach(track => pc.addTrack(track, localMicStream));
        } else {
            // ✅ لو رفض المايك أو لم يُتَح بعد، نُصرّح صراحة بنيّة "استقبال فقط" — بدونها قد
            // لا يتضمّن عرض الاتصال أي مقطع صوت إطلاقاً، فيتعطّل استقباله لصوت الطرف الآخر
            // أيضاً (وليس فقط عجزه عن الإرسال). هذا يضمن أن من رفض إذن المايك يبقى قادراً
            // على سماع بقية الجالسين حتى لو ما قدر يتكلم هو
            pc.addTransceiver('audio', { direction: 'recvonly' });
        }

        pc.onicecandidate = (e) => {
            if (e.candidate && currentVoiceRoomId) {
                socket.emit('voice-webrtc-ice-candidate', { roomId: currentVoiceRoomId, toUserId: peerUserId, candidate: e.candidate });
            }
        };

        // ✅ عنصر صوت مخفي لكل نظير — يُلحَق بالصفحة نفسها (وليس داخل mainContent) فيبقى
        // شغّالاً حتى أثناء تصغير الغرفة (نفس منطق عنصر صوت الموسيقى تماماً)
        pc.ontrack = (e) => {
            let audioEl = document.getElementById(`voice-peer-audio-${peerUserId}`);
            if (!audioEl) {
                audioEl = document.createElement('audio');
                audioEl.id = `voice-peer-audio-${peerUserId}`;
                audioEl.className = 'voice-peer-audio';
                audioEl.autoplay = true;
                audioEl.style.display = 'none';
                document.body.appendChild(audioEl);
            }
            // 🐛 إصلاح: قد يكون هذا الشخص مكتوماً أصلاً (من المضيف مثلاً) قبل أن يصل اتصالي
            // الصوتي به أساساً — نطبّق حالة الكتم المعروفة الآن صراحة بدل الاعتماد فقط على
            // roomAudioMuted، وإلا يُسمَع صوته لحظياً قبل أي حدث كتم لاحق يُصلح الوضع
            applyPeerAudioMuteState(peerUserId);
            audioEl.srcObject = e.streams[0];
            attachSpeakingDetector(e.streams[0], peerUserId);
        };

        pc.onconnectionstatechange = () => {
            if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) {
                teardownVoicePeer(peerUserId);
            }
        };

        return pc;
    }

    // ✅ "أنا الجديد" دائماً من ينشئ العرض (offer) — يمنع تعارض عرضين متزامنين لنفس الزوج
    async function initiateVoiceCallTo(peerUserId) {
        if (!currentVoiceRoomId || !peerUserId || peerUserId === myUserId) return;
        if (voicePeerConnections.has(peerUserId)) return; // ✅ اتصال قائم أصلاً — لا تكرار
        if (voicePeerConnections.size >= MAX_VOICE_PEER_CONNECTIONS) return; // 🛡️ حماية من إرهاق جهازي
        // ✅ لا نطلب إذن المايك إطلاقاً لمجرد "مشاهد" يريد الاستماع فقط — يُفعَّل المايك فقط
        // لمن يجلس فعلياً على مقعد؛ اتصال المشاهد يبقى استقبالاً فقط تلقائياً (recvonly أدناه)
        if (myVoiceSeatNumber) await ensureLocalMicStream();
        const pc = getOrCreateVoicePeer(peerUserId);
        try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socket.emit('voice-webrtc-offer', { roomId: currentVoiceRoomId, toUserId: peerUserId, sdp: offer });
        } catch (error) {
            console.error('[VOICE] فشل إنشاء عرض اتصال:', error);
            teardownVoicePeer(peerUserId);
        }
    }

    function teardownVoicePeer(peerUserId) {
        const pc = voicePeerConnections.get(peerUserId);
        if (pc) {
            pc.onicecandidate = null;
            pc.ontrack = null;
            pc.onconnectionstatechange = null;
            pc.close();
            voicePeerConnections.delete(peerUserId);
        }
        document.getElementById(`voice-peer-audio-${peerUserId}`)?.remove();
        detachSpeakingDetector(peerUserId);
    }

    function teardownAllVoicePeers() {
        Array.from(voicePeerConnections.keys()).forEach(teardownVoicePeer);
        detachSpeakingDetector(myUserId);
        // 🐛 يجب إيقاف التدفق الخام من الجهاز فعلياً (لا التدفق المُعالَج فقط) وإلا يبقى ضوء
        // المايك بالجهاز مضاءً — التدفق المُعالَج مبنيّ من MediaStreamDestination اصطناعي
        // لا يملك اتصالاً حقيقياً بعتاد المايك، فإيقافه وحده لا يُطفئ المايك الفعلي إطلاقاً
        if (localMicRawStream) {
            localMicRawStream.getTracks().forEach(t => t.stop());
            localMicRawStream = null;
        }
        if (micDspCleanup) { micDspCleanup(); micDspCleanup = null; }
        localMicStream = null;
        howlingWarningShownThisSession = false; // ✅ يسمح بتحذير جديد لو تكرر الوضع بجلسة تحدّث تالية
    }

    // ✅ يتصل بكل من هو جالس فعلياً حالياً على شبكة المقاعد المعروضة — يعمل لكل من يعرض
    // شاشة الغرفة سواء كان جالساً على مقعد (اتصال ثنائي الاتجاه) أو مجرد مشاهد (استقبال
    // فقط تلقائياً، دون طلب إذن مايك) — يُستدعى فور جلوسي أنا، وأيضاً فور فتحي لشاشة الغرفة
    // كمشاهد عادي، ومرة إضافية بعد أي لقطة حالة كاملة لضمان عدم فوات أحد
    function connectVoiceMeshToCurrentlySeated() {
        const grid = document.getElementById('voice-chat-grid');
        if (!grid) return;
        Array.from(grid.querySelectorAll('[data-user-id]'))
            .map(el => el.dataset.userId)
            .filter(id => id && id !== myUserId)
            .forEach(peerId => initiateVoiceCallTo(peerId));
    }

    // 🐛 ملاحظة: مستمعات socket.on('voice-webrtc-...') نُقلت أسفل تعريف `const socket`
    // (بعد تهيئة Socket.IO) لتفادي خطأ "Cannot access 'socket' before initialization" —
    // كانت هنا كاستدعاء فوري يُنفَّذ أثناء المرور التسلسلي على الدالة، أي قبل وصول التنفيذ
    // لسطر `const socket = io(...)` الموجود لاحقاً بنفس الدالة (Temporal Dead Zone)

    // ✅ قسم التحديات الجديد: يحوي إنشاء التحدي + قائمة التحديات (منقول بالكامل من الرئيسية القديمة)
    function showChallengesView() {
        mainContent.innerHTML = `
            <div class="flex justify-between items-center mb-4">
                <h2 class="text-lg md:text-xl font-bold"><i class="fas fa-gamepad text-purple-400"></i> ساحة التحديات</h2>
                <button id="create-battle-btn" class="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-lg flex items-center gap-2 text-sm">
                    <i class="fas fa-plus"></i><span>إنشاء تحدي</span>
                </button>
            </div>
            <div id="battle-rooms-container" class="flex-grow overflow-y-auto space-y-3 pr-1">
                <div id="battles-empty-state" class="text-center text-gray-400 py-10 hidden">
                    <i class="fas fa-ghost text-4xl mb-4"></i><p>لا توجد تحديات متاحة حالياً. كن أول من يبدأ!</p>
                </div>
                <div id="battles-loading-state" class="text-center text-gray-400 py-10"></div>
            </div>
        `;
        document.getElementById('battles-loading-state').innerHTML = skeletonList(4);
        document.getElementById('create-battle-btn').addEventListener('click', showCreateBattleModal);
        loadAvailableBattles();
    }

    // ✅ نافذة سفلية للدردشة العامة على الهاتف (بدل قسم ثابت يزاحم الرئيسية)
        // ✅ نافذة سفلية للدردشة العامة على الهاتف (بدل قسم ثابت يزاحم الرئيسية)
    function showMobilePublicChatSheet() {
        const existing = document.getElementById('mobile-public-chat-modal');
        if (existing) { closeMobilePublicChatSheet(); return; }
        const html = `
            <div id="mobile-public-chat-modal" class="md:hidden fixed inset-0 bg-black/70 z-[70] flex items-end">
                <div class="bg-gray-900 w-full rounded-t-2xl flex flex-col" style="height:85vh;">
                    <div class="flex items-center justify-between p-3 border-b border-gray-700">
                        <h3 class="font-bold flex items-center gap-2"><i class="fas fa-comments text-purple-400"></i> الدردشة العامة</h3>
                        <button id="close-mobile-public-chat" class="text-gray-400 p-2"><i class="fas fa-times"></i></button>
                    </div>
                    <div id="mobile-chat-messages-slot" class="flex-1 overflow-y-auto p-2"></div>
                    <div id="mobile-public-typing-indicator" class="text-xs text-purple-400 h-4 px-3"></div>
                    <div class="p-3 border-t border-gray-700">
                        <div class="relative">
                            <input type="text" id="mobileMessageInput" placeholder="اكتب رسالتك..." maxlength="300" class="w-full bg-gray-700 border border-gray-600 rounded-lg p-2.5 pr-4 text-white">
                        </div>
                        <div class="flex gap-2 mt-2">
                            <button id="mobile-public-gift-btn" class="bg-pink-600 px-3 py-2 rounded-lg text-white"><i class="fas fa-gift"></i></button>
                            <button id="mobileSendBtn" class="bg-purple-600 px-4 py-2 w-full rounded-lg text-white flex items-center justify-center gap-2"><i class="fas fa-paper-plane"></i> إرسال</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', html);

        // ✅ الإصلاح الجذري: بدل نسخ innerHTML (يفقد كل مستمعات الأحداث)، ننقل العنصر الحقيقي #chat-messages
        // نفسه إلى داخل النافذة السفلية، فتبقى كل أحداثه (الرد/الإبلاغ/فتح البروفايل) تعمل تماماً كسطح المكتب
        const realMessages = document.getElementById('chat-messages');
        const slot = document.getElementById('mobile-chat-messages-slot');
        if (realMessages && slot) {
            slot.appendChild(realMessages);
            realMessages.classList.remove('min-h-[300px]');
            realMessages.scrollTop = realMessages.scrollHeight;
        }

        document.getElementById('close-mobile-public-chat').addEventListener('click', closeMobilePublicChatSheet);
        document.getElementById('mobile-public-gift-btn').addEventListener('click', showPublicGiftModal);
        const mSend = () => {
            const val = document.getElementById('mobileMessageInput').value.trim();
            if (!val) return;
            document.getElementById('messageInput').value = val;
            sendMessage();
            document.getElementById('mobileMessageInput').value = '';
        };
        document.getElementById('mobileSendBtn').addEventListener('click', mSend);
        document.getElementById('mobileMessageInput').addEventListener('keypress', (e) => { if (e.key === 'Enter') mSend(); });
    }

    // ✅ إعادة عنصر الدردشة الحقيقي لمكانه الأصلي بلوحة سطح المكتب قبل إغلاق النافذة السفلية
    function closeMobilePublicChatSheet() {
        const realMessages = document.getElementById('chat-messages');
        const desktopTypingIndicator = document.getElementById('public-typing-indicator');
        if (realMessages && desktopTypingIndicator && desktopTypingIndicator.parentNode) {
            desktopTypingIndicator.parentNode.insertBefore(realMessages, desktopTypingIndicator);
        }
        document.getElementById('mobile-public-chat-modal')?.remove();
    }



        // =================================================
// ============ قسم الرسائل (Messages) =============
// =================================================

let allChatsCache = [];

// دالة تنسيق الوقت النسبي بشكل أنيق
function formatChatTime(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'الآن';
    if (diffMins < 60) return `منذ ${diffMins} د`;
    if (diffHours < 24) return `منذ ${diffHours} س`;
    if (diffDays === 1) return 'أمس';
    if (diffDays < 7) return `منذ ${diffDays} أيام`;
    return date.toLocaleDateString('ar-SA', { day: 'numeric', month: 'short' });
}

// دالة توليد معاينة ذكية لآخر رسالة حسب نوعها
function getLastMessagePreview(chat, currentUserId) {
    const details = chat.lastMessageDetails;

    // إذا ما في أي رسالة بعد
    if (!details && !chat.lastMessage) {
        return { icon: '', text: 'ابدأ محادثة جديدة' };
    }

    // ✅ الإصلاح: نعتمد على النوع الحقيقي (type) من كائن الرسالة الكامل
    // بدل تخمين النوع من نص، هذا أدق وأذكى ولا ينهار مهما كان شكل النص
    const isMine = details && details.sender && details.sender._id
        ? details.sender._id.toString() === currentUserId.toString()
        : false;
    const prefix = isMine ? 'أنت: ' : '';

    const type = details ? details.type : 'text';

    switch (type) {
        case 'image':
            return { icon: '<i class="fas fa-image text-green-400"></i>', text: `${prefix}صورة` };
        case 'voice':
            return { icon: '<i class="fas fa-microphone text-purple-400"></i>', text: `${prefix}رسالة صوتية` };
        case 'video':
            return { icon: '<i class="fas fa-video text-blue-400"></i>', text: `${prefix}فيديو` };
        default: {
            const textContent = (details && details.content) ? details.content : (chat.lastMessage || 'رسالة');
            return { icon: '', text: `${prefix}${textContent}` };
        }
    }
}

// دالة رئيسية: عرض قسم الرسائل بالكامل
async function showMessagesView() {
    mainContent.innerHTML = `
        <div class="flex flex-col h-full">
            <div class="flex items-center justify-between mb-4">
                <h2 class="text-xl font-bold flex items-center gap-2">
                    <i class="fas fa-envelope text-purple-400"></i>
                    <span>الرسائل</span>
                </h2>
                <button id="refresh-messages-btn" class="text-gray-400 hover:text-purple-400 transition p-2 rounded-full hover:bg-gray-700/50" title="تحديث">
                    <i class="fas fa-sync-alt"></i>
                </button>
            </div>

            <div class="relative mb-4">
                <input type="text" id="messages-search-input" placeholder="ابحث عن محادثة..." 
                       class="w-full bg-gray-200 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-full py-2 pr-4 pl-10 text-sm focus:ring-purple-500 focus:border-purple-500 transition-colors duration-300">
                <i class="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
            </div>

            <div id="messages-list-container" class="flex-grow overflow-y-auto space-y-2 pr-1">
                <div class="text-center text-gray-400 py-16">
                    <i class="fas fa-spinner fa-spin text-3xl mb-3"></i>
                    <p class="text-sm">جاري تحميل المحادثات...</p>
                </div>
            </div>
        </div>
    `;

    const refreshBtn = document.getElementById('refresh-messages-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            refreshBtn.querySelector('i').classList.add('fa-spin');
            loadMessagesList().finally(() => {
                setTimeout(() => refreshBtn.querySelector('i').classList.remove('fa-spin'), 300);
            });
        });
    }

    const searchInput = document.getElementById('messages-search-input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            filterMessagesList(e.target.value.trim());
        });
    }

    await loadMessagesList();
}

// جلب قائمة المحادثات من الخادم
async function loadMessagesList() {
    const container = document.getElementById('messages-list-container');
    if (!container) return;

    try {
        const response = await fetch('/api/private-chat/chats', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await response.json();

        if (response.ok && result.status === 'success') {
            allChatsCache = result.data.chats || [];
            renderMessagesList(allChatsCache);
            refreshMessagesNavBadge(allChatsCache);
        } else {
         container.innerHTML = skeletonList(6);
        }
    } catch (error) {
        console.error('[MESSAGES] Error loading chat list:', error);
        container.innerHTML = `
            <div class="text-center text-red-400 py-16">
                <i class="fas fa-exclamation-circle text-3xl mb-3"></i>
                <p class="text-sm">خطأ في الاتصال بالخادم</p>
            </div>`;
    }
}

// رسم قائمة المحادثات بشكل أنيق
function renderMessagesList(chats) {
    const container = document.getElementById('messages-list-container');
    if (!container) return;

    const currentUserId = JSON.parse(localStorage.getItem('user'))._id;

    if (!chats || chats.length === 0) {
        container.innerHTML = `
            <div class="text-center text-gray-400 py-16">
                <i class="fas fa-comment-slash text-4xl mb-4"></i>
                <p>لا توجد محادثات بعد</p>
                <p class="text-xs text-gray-500 mt-1">ابدأ محادثة من الملف الشخصي لأي مستخدم</p>
            </div>`;
        return;
    }

    container.innerHTML = chats.map(chat => {
        const other = chat.otherParticipant;
        if (!other) return '';

        const isBlocked = chat.isBlockedByMe;
        const preview = isBlocked
            ? { icon: '<i class="fas fa-ban text-red-400"></i>', text: 'لقد قمت بحظر هذا المستخدم' }
            : getLastMessagePreview(chat, currentUserId);

        const hasUnread = chat.unreadCount > 0 && !isBlocked;
        const timeText = chat.lastMessageAt ? formatChatTime(chat.lastMessageAt) : '';

        return `
            <div class="message-item flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all hover:bg-gray-700/40 ${hasUnread ? 'bg-purple-900/20 border border-purple-500/20' : 'bg-gray-800/20'} ${isBlocked ? 'opacity-70' : ''}" 
                 data-user-id="${other._id}" data-username="${other.username}">
                                <div class="relative flex-shrink-0">
                    <img src="${other.profileImage}" class="w-12 h-12 rounded-full object-cover border-2 ${isBlocked ? 'border-red-500 grayscale' : hasUnread ? 'border-purple-500' : 'border-gray-600'} ${other.activeFrameClass || ''}">
                    ${hasUnread ? `<span class="absolute -top-1 -right-1 bg-purple-600 text-white text-[10px] font-bold min-w-[18px] h-[18px] rounded-full flex items-center justify-center px-1">${chat.unreadCount > 9 ? '9+' : chat.unreadCount}</span>` : ''}
                </div>
                <div class="flex-1 min-w-0">
                    <div class="flex justify-between items-center gap-2">
                        <span class="font-bold text-sm truncate flex items-center gap-1 ${hasUnread ? 'text-white' : 'text-gray-300'}">${other.username} ${getAgentBadgeIconHTML(other.isAgent)}</span>
                        ${isBlocked ? '<span class="text-[10px] bg-red-900/40 text-red-300 px-2 py-0.5 rounded-full flex-shrink-0">محظور</span>' : `<span class="text-xs flex-shrink-0 ${hasUnread ? 'text-purple-400 font-bold' : 'text-gray-500'}">${timeText}</span>`}
                    </div>
                    <div class="flex items-center gap-1 text-xs truncate mt-0.5 ${isBlocked ? 'text-red-400' : hasUnread ? 'text-gray-200' : 'text-gray-400'}">
                        ${preview.icon}
                        <span class="truncate">${preview.text}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    container.querySelectorAll('.message-item').forEach(item => {
        item.addEventListener('click', () => {
            const userId = item.dataset.userId;
            const username = item.dataset.username;
            openPrivateChat(userId, username);
        });
    });
}

// فلترة القائمة أثناء الكتابة في البحث
function filterMessagesList(query) {
    if (!query) {
        renderMessagesList(allChatsCache);
        return;
    }

    const filtered = allChatsCache.filter(chat =>
        chat.otherParticipant && chat.otherParticipant.username.toLowerCase().includes(query.toLowerCase())
    );

    if (filtered.length === 0) {
        const container = document.getElementById('messages-list-container');
        if (container) {
            container.innerHTML = `
                <div class="text-center text-gray-400 py-16">
                    <i class="fas fa-search text-3xl mb-3"></i>
                    <p class="text-sm">لا توجد نتائج مطابقة لـ "${query}"</p>
                </div>`;
        }
        return;
    }

    renderMessagesList(filtered);
}

// تحديث شارة عدد الرسائل غير المقروءة في الشريط الجانبي
async function refreshMessagesNavBadge(cachedChats = null) {
    try {
        let chats = cachedChats;
        if (!chats) {
            const response = await fetch('/api/private-chat/chats', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const result = await response.json();
            if (!response.ok || result.status !== 'success') return;
            chats = result.data.chats || [];
        }

        const totalUnread = chats.reduce((sum, chat) => sum + (chat.unreadCount || 0), 0);
        const badge = document.getElementById('messages-nav-badge');
        if (badge) {
            if (totalUnread > 0) {
                badge.textContent = totalUnread > 9 ? '9+' : totalUnread;
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        }
        // ✅ نفس التحديث لشارة الرسائل بالشريط السفلي بالهاتف (كانت لا تتحدث إطلاقاً)
        const mobileBadge = document.getElementById('mobile-messages-badge');
        if (mobileBadge) {
            if (totalUnread > 0) {
                mobileBadge.textContent = totalUnread > 9 ? '9+' : totalUnread;
                mobileBadge.classList.remove('hidden');
            } else {
                mobileBadge.classList.add('hidden');
            }
        }
    } catch (error) {
        console.error('[MESSAGES BADGE] Error:', error);
    }
}

// --- ✅ استبدل دالة showSettingsView بالكامل ---
async function showSettingsView() {
    const localUser = JSON.parse(localStorage.getItem('user'));

    let blockedUsers = [];
    let blockedCount = 0;
    let frameShopData = { frames: [], activeFrame: null, coins: 0 };
    let bubbleShopData = { skins: [], activeClass: null, coins: 0 };

    const [blockedResult, frameResult, bubbleResult] = await Promise.allSettled([
        fetch('/api/blocks/blocked-list', { headers: { 'Authorization': `Bearer ${token}` } }).then(r => r.ok ? r.json() : null),
        fetch('/api/frames/shop', { headers: { 'Authorization': `Bearer ${token}` } }).then(r => r.ok ? r.json() : null),
        fetch('/api/bubble-skins/shop', { headers: { 'Authorization': `Bearer ${token}` } }).then(r => r.ok ? r.json() : null)
    ]);

    if (blockedResult.status === 'fulfilled' && blockedResult.value) {
        blockedUsers = blockedResult.value.data.blockedUsers || [];
        blockedCount = blockedUsers.length;
    }
    if (frameResult.status === 'fulfilled' && frameResult.value) {
        frameShopData = frameResult.value.data;
    }
    if (bubbleResult.status === 'fulfilled' && bubbleResult.value) {
        bubbleShopData = bubbleResult.value.data;
    }

    
   mainContent.innerHTML = `
        <div class="p-4">
                        <h2 class="text-xl font-bold mb-4"><i class="fas fa-cog mr-2"></i>الإعدادات</h2>
            
            <!-- =========================================== -->
            <!-- 1. قسم الصورة الشخصية (قابل للطي) -->
            <!-- =========================================== -->
                        <div class="mb-3">
                <div class="collapsible-header bg-white/30 dark:bg-gray-800/50 p-3 rounded-lg cursor-pointer flex justify-between items-center" data-target="profile-image-section">
                    <h3 class="text-sm font-bold flex items-center gap-2">
                        <i class="fas fa-user-circle text-purple-400"></i>الصورة الشخصية
                    </h3>
                    <i class="fas fa-chevron-down text-xs transition-transform duration-300"></i>
                </div>
                
                <div id="profile-image-section" class="collapsible-content hidden bg-gray-800/30 p-4 rounded-b-lg">
                    <div class="text-center">
                        <img id="settings-profile-image" src="${localUser.profileImage}" 
                             class="w-20 h-20 rounded-full mx-auto border-4 border-purple-500 mb-3 object-cover shadow-lg">
                        
                        <form id="image-upload-form">
                            <input type="file" id="image-file-input" name="profileImage" class="hidden" accept="image/*">
                            <div class="flex flex-col sm:flex-row justify-center items-center gap-2 mt-3">
                                <button type="button" id="select-image-btn" 
                                        class="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs py-2 px-3 rounded-lg w-full sm:w-auto">
                                    <i class="fas fa-image mr-1"></i>اختيار صورة جديدة
                                </button>
                                
                                <button type="submit" id="upload-image-btn" 
                                        class="bg-green-600 hover:bg-green-700 text-white font-bold text-xs py-2 px-3 rounded-lg w-full sm:w-auto hidden">
                                    <i class="fas fa-upload mr-1"></i>حفظ التغيير
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>

            
            
            <!-- =========================================== -->
            <!-- 2. قسم اسم المستخدم (قابل للطي) -->
            <!-- =========================================== -->
                        <div class="mb-3">
                <div class="collapsible-header bg-white/30 dark:bg-gray-800/50 p-3 rounded-lg cursor-pointer flex justify-between items-center" data-target="username-section">
                    <h3 class="text-sm font-bold flex items-center gap-2">
                        <i class="fas fa-user-edit text-purple-400"></i>اسم المستخدم
                    </h3>
                    <i class="fas fa-chevron-down text-xs transition-transform duration-300"></i>
                </div>
                
                <div id="username-section" class="collapsible-content hidden bg-gray-800/30 p-4 rounded-b-lg">
                    <form id="username-update-form" class="space-y-3">
                        <div>
                            <label class="block text-xs font-medium mb-1.5">الاسم الحالي</label>
                            <input type="text" value="${localUser.username}" 
                                   class="w-full bg-gray-700 border border-gray-600 rounded-lg p-2.5 text-sm cursor-not-allowed" 
                                   disabled>
                        </div>
                        
                        <div>
                            <label for="username-input" class="block text-xs font-medium mb-1.5">الاسم الجديد</label>
                            <input type="text" id="username-input" 
                                   class="w-full bg-gray-200 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg p-2.5 text-sm"
                                   placeholder="أدخل اسم المستخدم الجديد">
                        </div>
                        
                        <button type="submit" 
                                class="w-full bg-green-600 hover:bg-green-700 text-white font-bold text-sm py-2.5 px-4 rounded-lg">
                            <i class="fas fa-save mr-1"></i>حفظ التغيير
                        </button>
                    </form>
                </div>
            </div>
            
            <!-- =========================================== -->
            <!-- 3. قسم كلمة المرور (قابل للطي) -->
            <!-- =========================================== -->
                        <div class="mb-3">
                <div class="collapsible-header bg-white/30 dark:bg-gray-800/50 p-3 rounded-lg cursor-pointer flex justify-between items-center" data-target="password-section">
                    <h3 class="text-sm font-bold flex items-center gap-2">
                        <i class="fas fa-lock text-purple-400"></i>كلمة المرور
                    </h3>
                    <i class="fas fa-chevron-down text-xs transition-transform duration-300"></i>
                </div>
                
                <div id="password-section" class="collapsible-content hidden bg-gray-800/30 p-4 rounded-b-lg">
                    <form id="password-update-form" class="space-y-3">
                        <div>
                            <label for="current-password" class="block text-xs font-medium mb-1.5">كلمة المرور الحالية</label>
                            <input type="password" id="current-password" required 
                                   class="w-full bg-gray-200 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg p-2.5 text-sm"
                                   placeholder="••••••••">
                        </div>
                        
                        <div>
                            <label for="new-password" class="block text-xs font-medium mb-1.5">كلمة المرور الجديدة</label>
                            <input type="password" id="new-password" required 
                                   class="w-full bg-gray-200 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg p-2.5 text-sm"
                                   placeholder="•••••••• (6 أحرف على الأقل)">
                        </div>
                        
                        <div>
                            <label for="new-password-confirm" class="block text-xs font-medium mb-1.5">تأكيد كلمة المرور الجديدة</label>
                            <input type="password" id="new-password-confirm" required 
                                   class="w-full bg-gray-200 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg p-2.5 text-sm"
                                   placeholder="••••••••">
                        </div>
                        
                        <button type="submit" 
                                class="w-full bg-red-600 hover:bg-red-700 text-white font-bold text-sm py-2.5 px-4 rounded-lg">
                            <i class="fas fa-key mr-1"></i>تغيير كلمة المرور
                        </button>
                    </form>
                </div>
            </div>
             <!-- =========================================== -->
            <!-- 5. قسم متجر الإطارات (الجديد) -->
            <!-- =========================================== -->
            <div class="mb-3">
                <div class="collapsible-header bg-white/30 dark:bg-gray-800/50 p-3 rounded-lg cursor-pointer flex justify-between items-center" data-target="frames-shop-section">
                                        <h3 class="text-sm font-bold flex items-center gap-2">
                        <i class="fas fa-crown text-purple-400"></i>متجر الإطارات
                        <button id="frames-support-btn" class="report-issue-icon-btn" style="width:22px;height:22px;" title="الإبلاغ عن مشكلة" onclick="event.stopPropagation();"><i class="fas fa-exclamation-triangle" style="font-size:0.6rem;"></i></button>
                    </h3>
                    <i class="fas fa-chevron-down text-xs transition-transform duration-300"></i>
                </div>
                
                <div id="frames-shop-section" class="collapsible-content hidden bg-gray-800/30 p-4 rounded-b-lg">
                    <div class="flex items-center justify-between mb-3 bg-gray-900/50 rounded-xl p-2.5">
                        <span class="text-xs text-gray-400">رصيدك الحالي</span>
                        <span class="font-bold text-yellow-400 flex items-center gap-1 text-sm">
                            <i class="fas fa-coins"></i> ${frameShopData.coins}
                        </span>
                    </div>

                       <div class="grid grid-cols-3 gap-2">
                        ${frameShopData.frames.filter(f => f.name !== 'إطار الترحيب').map(f => {
                            const owned = f.ownedInstance;
                            const isActive = frameShopData.activeFrame && frameShopData.activeFrame.toString() === f._id.toString();
                            const isExpired = owned && owned.expiresAt && new Date(owned.expiresAt) < new Date();

                            return `
                            <div class="bg-gray-900/40 rounded-xl p-2 text-center border ${isActive ? 'border-yellow-400' : 'border-gray-700'}">
                                <div class="w-12 h-12 mx-auto rounded-full ${f.cssClass} bg-gray-700 mb-1.5"></div>
                                <p class="text-[11px] font-bold mb-1 truncate">${f.name}</p>
                                
                                ${owned && !isExpired ? `
                                    ${owned.activatedAt ? `<p class="text-[9px] text-gray-400 mb-1.5">ينتهي: ${new Date(owned.expiresAt).toLocaleDateString('ar-SA')}</p>` : `<p class="text-[9px] text-green-400 mb-1.5">بحوزتك</p>`}
                                    <button class="equip-frame-btn w-full text-[10px] py-1.5 rounded-full ${isActive ? 'bg-gray-600 text-gray-300' : 'bg-purple-600 hover:bg-purple-700 text-white'}" 
                                            data-frame-id="${f._id}" ${isActive ? 'disabled' : ''}>
                                        ${isActive ? 'مُفعّل' : 'تفعيل'}
                                    </button>
                                ` : `
                                    <select class="frame-duration-select w-full text-[10px] bg-gray-700 rounded p-1 mb-1.5" data-frame-id="${f._id}">
                                        <option value="7">7 أيام - ${f.prices.days7}</option>
                                        <option value="30">30 يوم - ${f.prices.days30}</option>
                                        <option value="365">سنة - ${f.prices.days365}</option>
                                    </select>
                                    <button class="purchase-frame-btn w-full text-[10px] py-1.5 rounded-full bg-green-600 hover:bg-green-700 text-white" data-frame-id="${f._id}">
                                        شراء
                                    </button>
                                `}
                            </div>
                        `}).join('')}
                    </div>
                </div>
            </div>

            <!-- =========================================== -->
            <!-- 7. قسم إطارات دردشة الشات العام (الجديد) -->
            <!-- =========================================== -->
            <div class="mb-3">
                <div class="collapsible-header bg-white/30 dark:bg-gray-800/50 p-3 rounded-lg cursor-pointer flex justify-between items-center" data-target="bubble-shop-section">
                    <h3 class="text-sm font-bold flex items-center gap-2"><i class="fas fa-comment-dots text-purple-400"></i>إطارات رسائل الشات العام</h3>
                    <i class="fas fa-chevron-down text-xs transition-transform duration-300"></i>
                </div>
                <div id="bubble-shop-section" class="collapsible-content hidden bg-gray-800/30 p-4 rounded-b-lg">
                    <div class="flex items-center justify-between mb-3 bg-gray-900/50 rounded-xl p-2.5">
                        <span class="text-xs text-gray-400">رصيدك الحالي</span>
                        <span class="font-bold text-yellow-400 text-sm"><i class="fas fa-coins"></i> ${bubbleShopData.coins}</span>
                    </div>
                    <div class="grid grid-cols-3 gap-2">
                        ${bubbleShopData.skins.map(s => {
                            const isActive = bubbleShopData.activeClass === s.cssClass;
                            return `
                            <div class="rounded-xl p-2 text-center border ${isActive ? 'border-yellow-400' : 'border-gray-700'} ${s.cssClass}">
                                <p class="text-[11px] font-bold mb-1 truncate">${s.name}</p>
                                <p class="text-[10px] text-yellow-300 mb-1.5"><i class="fas fa-coins"></i> ${s.price}</p>
                                ${s.owned ? `
                                    <button class="equip-bubble-btn w-full text-[10px] py-1.5 rounded-full ${isActive ? 'bg-gray-600 text-gray-300' : 'bg-purple-600 hover:bg-purple-700 text-white'}" 
                                            data-skin-id="${s._id}" ${isActive ? 'disabled' : ''}>
                                        ${isActive ? 'مُفعّل' : 'تفعيل'}
                                    </button>
                                ` : `
                                    <button class="purchase-bubble-btn w-full text-[10px] py-1.5 rounded-full bg-green-600 hover:bg-green-700 text-white" data-skin-id="${s._id}">
                                        شراء
                                    </button>
                                `}
                            </div>
                        `}).join('')}
                    </div>
                </div>
            </div>


            <!-- =========================================== -->
            <!-- 6. قسم الهدايا المستلمة (الجديد) -->
            <!-- =========================================== -->
            <div class="mb-3">
                <div class="collapsible-header bg-white/30 dark:bg-gray-800/50 p-3 rounded-lg cursor-pointer flex justify-between items-center" data-target="gifts-received-section">
                    <h3 class="text-sm font-bold flex items-center gap-2">
                        <i class="fas fa-gift text-purple-400"></i>هداياي المستلمة
                    </h3>
                    <i class="fas fa-chevron-down text-xs transition-transform duration-300"></i>
                </div>
                <div id="gifts-received-section" class="collapsible-content hidden bg-gray-800/30 p-4 rounded-b-lg">
                    <div id="gifts-received-body" class="text-center text-gray-400 py-5">
                        <i class="fas fa-spinner fa-spin"></i>
                    </div>
                </div>
            </div>



            <!-- =========================================== -->
            <!-- زر تسجيل الخروج -->
            <!-- =========================================== -->
            <div class="mb-4">
                    <button id="settings-logout-btn" class="w-full bg-red-600 hover:bg-red-700 text-white font-bold text-sm py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 shadow-lg">
                    <i class="fas fa-sign-out-alt"></i> تسجيل الخروج
                </button>
            </div>

            
                       <!-- =========================================== -->
            <!-- 4. قسم المحظورين (الجديد) -->
            <!-- =========================================== -->
            <div class="mb-3">
                <div class="collapsible-header bg-white/30 dark:bg-gray-800/50 p-3 rounded-lg cursor-pointer flex justify-between items-center" data-target="blocked-users-section">
                    <h3 class="text-sm font-bold flex items-center gap-2">
                        <i class="fas fa-ban text-purple-400"></i>المستخدمين المحظورين
                        <span class="bg-red-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5">${blockedCount}</span>
                    </h3>
                    <i class="fas fa-chevron-down text-xs transition-transform duration-300"></i>
                </div>
                
                <div id="blocked-users-section" class="collapsible-content hidden bg-gray-800/30 p-4 rounded-b-lg">
                    ${blockedCount === 0 ? 
                        `<div class="text-center py-5">
                            <i class="fas fa-user-check text-2xl text-gray-500 mb-2"></i>
                            <p class="text-gray-400 text-xs">لا يوجد مستخدمين محظورين</p>
                        </div>` 
                        : 
                        `<div class="space-y-2 max-h-72 overflow-y-auto pr-1">
                            ${blockedUsers.map(user => `
                                <div class="flex items-center justify-between p-2 bg-gray-700/50 rounded-lg" data-user-id="${user._id}">
                                    <div class="flex items-center gap-2">
                                        <img src="${user.profileImage}" 
                                             class="w-8 h-8 rounded-full border-2 border-red-500">
                                        <div>
                                            <p class="font-medium text-xs">${user.username}</p>
                                            <p class="text-[10px] text-gray-400">ID: ${user.customId}</p>
                                        </div>
                                    </div>

                                    <button class="unblock-user-btn bg-gray-600 hover:bg-gray-700 text-white text-[10px] py-1 px-2.5 rounded-full" 
                                            data-user-id="${user._id}">
                                        <i class="fas fa-unlock mr-1"></i>رفع الحظر
                                    </button>
                                </div>
                            `).join('')}
                        </div>`
                    }
                </div>
            </div>
    `;
    
    // ⭐ إعادة ربط الأحداث (دالة واحدة فقط)
        // ⭐ إعادة ربط الأحداث (دالة واحدة فقط)
    setupSettingsEvents();
    loadGiftsReceivedSummary();

    document.getElementById('settings-logout-btn')?.addEventListener('click', () => {
        showConfirmationModal('هل أنت متأكد من تسجيل الخروج؟', () => {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            window.location.href = '/login.html';
        }, );
    });
}


async function reloadFrameShopSection() {
    try {
        const frameResponse = await fetch('/api/frames/shop', { headers: { 'Authorization': `Bearer ${token}` } });
        const frameResult = await frameResponse.json();
        if (!frameResponse.ok) throw new Error();
        const frameShopData = frameResult.data;

        const section = document.getElementById('frames-shop-section');
        if (!section) return;

                section.innerHTML = `
            <div class="flex items-center justify-between mb-3 bg-gray-900/50 rounded-xl p-2.5">
                <span class="text-xs text-gray-400">رصيدك الحالي</span>
                <span class="font-bold text-yellow-400 flex items-center gap-1 text-sm">
                    <i class="fas fa-coins"></i> ${frameShopData.coins}
                </span>
            </div>
            <div class="grid grid-cols-3 gap-2">
                ${frameShopData.frames.filter(f => f.name !== 'إطار الترحيب').map(f => {
                    const owned = f.ownedInstance;
                    const isActive = frameShopData.activeFrame && frameShopData.activeFrame.toString() === f._id.toString();
                    const isExpired = owned && owned.expiresAt && new Date(owned.expiresAt) < new Date();
                    return `
                    <div class="bg-gray-900/40 rounded-xl p-2 text-center border ${isActive ? 'border-yellow-400' : 'border-gray-700'}">
                        <div class="w-12 h-12 mx-auto rounded-full ${f.cssClass} bg-gray-700 mb-1.5"></div>
                        <p class="text-[11px] font-bold mb-1 truncate">${f.name}</p>
                        ${owned && !isExpired ? `
                            ${owned.activatedAt ? `<p class="text-[9px] text-gray-400 mb-1.5">ينتهي: ${new Date(owned.expiresAt).toLocaleDateString('ar-SA')}</p>` : `<p class="text-[9px] text-green-400 mb-1.5">بحوزتك</p>`}
                            <button class="equip-frame-btn w-full text-[10px] py-1.5 rounded-full ${isActive ? 'bg-gray-600 text-gray-300' : 'bg-purple-600 hover:bg-purple-700 text-white'}"
                                    data-frame-id="${f._id}" ${isActive ? 'disabled' : ''}>
                                ${isActive ? 'مُفعّل' : 'تفعيل'}
                            </button>
                        ` : `
                            <select class="frame-duration-select w-full text-[10px] bg-gray-700 rounded p-1 mb-1.5" data-frame-id="${f._id}">
                                <option value="7">7 أيام - ${f.prices.days7}</option>
                                <option value="30">30 يوم - ${f.prices.days30}</option>
                                <option value="365">سنة - ${f.prices.days365}</option>
                            </select>
                            <button class="purchase-frame-btn w-full text-[10px] py-1.5 rounded-full bg-green-600 hover:bg-green-700 text-white" data-frame-id="${f._id}">
                                شراء
                            </button>
                        `}
                    </div>
                `}).join('')}
            </div>
        `;
        bindFrameShopButtons();
    } catch (error) {
        console.error('Failed to reload frame shop:', error);
    }
}

function bindFrameShopButtons() {
    document.querySelectorAll('.purchase-frame-btn').forEach(btn => {
        btn.addEventListener('click', async function() {
            const frameId = this.dataset.frameId;
            const durationSelect = document.querySelector(`.frame-duration-select[data-frame-id="${frameId}"]`);
            const duration = durationSelect ? durationSelect.value : '7';
            this.disabled = true;
            this.textContent = '...';
            try {
                const response = await fetch('/api/frames/purchase', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ frameId, duration })
                });
                const result = await response.json();
                if (response.ok) {
                    showNotification(result.message, 'success');
                    await refreshUserData();
                    await reloadFrameShopSection();
                } else {
                    showNotification(result.message || 'فشل الشراء', 'error');
                    this.disabled = false;
                    this.textContent = 'شراء';
                }
            } catch (error) {
                showNotification('خطأ في الاتصال بالخادم', 'error');
                this.disabled = false;
                this.textContent = 'شراء';
            }
        });
    });

    document.querySelectorAll('.equip-frame-btn').forEach(btn => {
        btn.addEventListener('click', async function() {
            const frameId = this.dataset.frameId;
            this.disabled = true;
            try {
                const response = await fetch('/api/frames/equip', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ frameId })
                });
                const result = await response.json();
                if (response.ok) {
                    showNotification(result.message, 'success');
                    await refreshUserData();
                    await reloadFrameShopSection();
                } else {
                    showNotification(result.message || 'فشل التفعيل', 'error');
                    this.disabled = false;
                }
            } catch (error) {
                showNotification('خطأ في الاتصال بالخادم', 'error');
                this.disabled = false;
            }
        });
    });
}

async function reloadBubbleShopSection() {
    try {
        const bubbleResponse = await fetch('/api/bubble-skins/shop', { headers: { 'Authorization': `Bearer ${token}` } });
        const bubbleResult = await bubbleResponse.json();
        if (!bubbleResponse.ok) throw new Error();
        const bubbleShopData = bubbleResult.data;

        const section = document.getElementById('bubble-shop-section');
        if (!section) return;

                section.innerHTML = `
            <div class="flex items-center justify-between mb-3 bg-gray-900/50 rounded-xl p-2.5">
                <span class="text-xs text-gray-400">رصيدك الحالي</span>
                <span class="font-bold text-yellow-400 text-sm"><i class="fas fa-coins"></i> ${bubbleShopData.coins}</span>
            </div>
            <div class="grid grid-cols-3 gap-2">
                ${bubbleShopData.skins.map(s => {
                    const isActive = bubbleShopData.activeClass === s.cssClass;
                    return `
                    <div class="rounded-xl p-2 text-center border ${isActive ? 'border-yellow-400' : 'border-gray-700'} ${s.cssClass}">
                        <p class="text-[11px] font-bold mb-1 truncate">${s.name}</p>
                        <p class="text-[10px] text-yellow-300 mb-1.5"><i class="fas fa-coins"></i> ${s.price}</p>
                        ${s.owned ? `
                            <button class="equip-bubble-btn w-full text-[10px] py-1.5 rounded-full ${isActive ? 'bg-gray-600 text-gray-300' : 'bg-purple-600 hover:bg-purple-700 text-white'}"
                                    data-skin-id="${s._id}" ${isActive ? 'disabled' : ''}>
                                ${isActive ? 'مُفعّل' : 'تفعيل'}
                            </button>
                        ` : `
                            <button class="purchase-bubble-btn w-full text-[10px] py-1.5 rounded-full bg-green-600 hover:bg-green-700 text-white" data-skin-id="${s._id}">
                                شراء
                            </button>
                        `}
                    </div>
                `}).join('')}
            </div>
        `;
        bindBubbleShopButtons();
    } catch (error) {
        console.error('Failed to reload bubble shop:', error);
    }
}

function bindBubbleShopButtons() {
    document.querySelectorAll('.purchase-bubble-btn').forEach(btn => {
        btn.addEventListener('click', async function() {
            const skinId = this.dataset.skinId;
            this.disabled = true;
            try {
                const response = await fetch('/api/bubble-skins/purchase', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ skinId })
                });
                const result = await response.json();
                if (response.ok) {
                    showNotification(result.message, 'success');
                    await refreshUserData();
                    await reloadBubbleShopSection();
                } else {
                    showNotification(result.message || 'فشل الشراء', 'error');
                    this.disabled = false;
                }
            } catch (error) {
                showNotification('خطأ في الاتصال بالخادم', 'error');
                this.disabled = false;
            }
        });
    });

    document.querySelectorAll('.equip-bubble-btn').forEach(btn => {
        btn.addEventListener('click', async function() {
            const skinId = this.dataset.skinId;
            this.disabled = true;
            try {
                const response = await fetch('/api/bubble-skins/equip', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ skinId })
                });
                const result = await response.json();
                if (response.ok) {
                    showNotification(result.message, 'success');
                    await refreshUserData();
                    await reloadBubbleShopSection();
                } else {
                    showNotification(result.message || 'فشل التفعيل', 'error');
                    this.disabled = false;
                }
            } catch (error) {
                showNotification('خطأ في الاتصال بالخادم', 'error');
                this.disabled = false;
            }
        });
    });
}


        

// 📍 أضف هذه الدالة بعد showSettingsView
function setupSettingsEvents() {
    // 1. الأقسام القابلة للطي
    document.querySelectorAll('.collapsible-header').forEach(header => {
        header.addEventListener('click', function() {
            const targetId = this.getAttribute('data-target');
            const content = document.getElementById(targetId);
            const icon = this.querySelector('i.fa-chevron-down');
            
            if (content.classList.contains('hidden')) {
                content.classList.remove('hidden');
                icon.style.transform = 'rotate(180deg)';
            } else {
                content.classList.add('hidden');
                icon.style.transform = 'rotate(0deg)';
            }
        });
    });



     bindFrameShopButtons();
    bindBubbleShopButtons();
    document.getElementById('frames-support-btn')?.addEventListener('click', () => showQuickSupportModal('frame_issue', 'مشكلة في الإطارات'));
    
    // 2. تحديث الصورة الشخصية
    document.getElementById('select-image-btn').addEventListener('click', () => {
        document.getElementById('image-file-input').click();
    });
    
    document.getElementById('image-file-input').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                document.getElementById('settings-profile-image').src = event.target.result;
            };
            reader.readAsDataURL(file);
            document.getElementById('upload-image-btn').classList.remove('hidden');
        }
    });
    
    document.getElementById('image-upload-form').addEventListener('submit', handleImageUpload);
    document.getElementById('username-update-form').addEventListener('submit', handleUsernameUpdate);
    document.getElementById('password-update-form').addEventListener('submit', handlePasswordUpdate);
    
    // 3. رفع الحظر
document.querySelectorAll('.unblock-user-btn').forEach(btn => {
    btn.addEventListener('click', async function() {
        const userId = this.dataset.userId;
        const userCard = this.closest('[data-user-id]');
        const username = userCard?.querySelector('p.font-medium')?.textContent || 'المستخدم';
        
        if (userCard) userCard.style.opacity = '0.5';
        
        try {
            const response = await fetch(`/api/blocks/unblock/${userId}`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            });
            
            // ⭐ جلب الـ response كـ JSON
            const result = await response.json();
            
            if (response.ok) {
                // ⭐⭐ تحديث localStorage فوراً ⭐⭐
                if (result.data?.updatedUser) {
                    // 1. جلب المستخدم الحالي
                    const currentUser = JSON.parse(localStorage.getItem('user'));
                    
                    // 2. دمج البيانات القديمة مع الجديدة
                    const mergedUser = {
                        ...currentUser,
                        ...result.data.updatedUser,
                        _id: currentUser._id,
                        customId: currentUser.customId,
                        email: currentUser.email,
                        password: currentUser.password,
                        gender: currentUser.gender,
                        birthDate: currentUser.birthDate,
                        socialStatus: currentUser.socialStatus,
                        educationStatus: currentUser.educationStatus
                    };
                    
                    // 3. حفظ في localStorage
                    localStorage.setItem('user', JSON.stringify(mergedUser));
                    
                    // 4. تحديث الواجهة مباشرة
                    updateUIWithUserData(mergedUser);
                    
                    console.log('✅ [SETTINGS] localStorage updated from unblock API');
                }
                
                // ⭐ إشعار فوري
                showNotification(`تم رفع الحظر عن ${username}`, 'success');
                
                // ⭐ تحديث العدد
                const blockedCountElement = document.querySelector('.collapsible-header h3 span');
                if (blockedCountElement) {
                    const currentCount = parseInt(blockedCountElement.textContent) || 0;
                    blockedCountElement.textContent = Math.max(0, currentCount - 1);
                }
                
                // ⭐ إخفاء العنصر بتأنق
                if (userCard) {
                    userCard.style.transition = 'all 0.3s ease';
                    userCard.style.opacity = '0';
                    userCard.style.height = '0';
                    userCard.style.padding = '0';
                    userCard.style.margin = '0';
                    userCard.style.overflow = 'hidden';
                    
                    setTimeout(() => {
                        userCard.style.display = 'none';
                        
                        // ⭐ إذا لم يبق أحد، عرض رسالة "لا يوجد محظورين"
                        const blockedSection = document.getElementById('blocked-users-section');
                        const blockedItems = blockedSection.querySelectorAll('[data-user-id]');
                        const visibleItems = Array.from(blockedItems).filter(item => 
                            item.style.display !== 'none' && 
                            item.style.opacity !== '0'
                        );
                        
                        if (visibleItems.length === 0) {
                            blockedSection.innerHTML = `
                                <div class="text-center py-8">
                                    <i class="fas fa-user-check text-4xl text-gray-500 mb-4"></i>
                                    <p class="text-gray-400">لا يوجد مستخدمين محظورين</p>
                                </div>
                            `;
                        }
                    }, 300);
                }
                
                // ⭐ إرسال إشعار Socket لتحديث البروفايل المصغر
                if (socket && socket.connected) {
                    socket.emit('unblockAction', {
                        unblockedUserId: userId,
                        unblockedUsername: username,
                        timestamp: new Date().toISOString()
                    });
                }
                
            } else {
                showNotification(result.message || 'فشل رفع الحظر', 'error');
                if (userCard) userCard.style.opacity = '1';
            }
            
        } catch (error) {
            console.error('Error unblocking user:', error);
            showNotification('خطأ في الاتصال', 'error');
            if (userCard) userCard.style.opacity = '1';
        }
    });
});
 }

// دالة جديدة لمعالجة رفع الصورة
async function handleImageUpload(e) {
    e.preventDefault();
    const fileInput = document.getElementById('image-file-input');
    if (!fileInput.files || fileInput.files.length === 0) {
        showNotification('الرجاء اختيار صورة أولاً.', 'error');
        return;
    }

    const formData = new FormData();
    formData.append('profileImage', fileInput.files[0]);

    const uploadBtn = document.getElementById('upload-image-btn');
    uploadBtn.disabled = true;
    uploadBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>جاري الرفع...';

    try {
        const response = await fetch('/api/users/updateProfilePicture', {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });

        const result = await response.json();
        if (response.ok) {
            showNotification('تم تحديث الصورة بنجاح!', 'success');
            const localUser = JSON.parse(localStorage.getItem('user'));
            localUser.profileImage = result.data.user.profileImage;
            localStorage.setItem('user', JSON.stringify(localUser));
            document.getElementById('profileImage').src = localUser.profileImage; // تحديث الصورة في الشريط العلوي
            uploadBtn.classList.add('hidden');
        } else {
            showNotification(result.message || 'فشل رفع الصورة', 'error');
        }
    } catch (error) {
        showNotification('خطأ في الاتصال بالخادم', 'error');
    } finally {
        uploadBtn.disabled = false;
        uploadBtn.innerHTML = '<i class="fas fa-upload mr-2"></i>رفع وحفظ';
    }
}

// دالة جديدة لمعالجة تحديث اسم المستخدم
async function handleUsernameUpdate(e) {
    e.preventDefault();
    const newUsername = document.getElementById('username-input').value;
    try {
        const response = await fetch('/api/users/updateUsername', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ username: newUsername })
        });
        const result = await response.json();
        if (response.ok) {
            showNotification('تم تحديث اسم المستخدم بنجاح!', 'success');
            const localUser = JSON.parse(localStorage.getItem('user'));
            localUser.username = result.data.user.username;
            localStorage.setItem('user', JSON.stringify(localUser));
            document.getElementById('username').textContent = localUser.username; // تحديث الاسم في الشريط العلوي
        } else {
            showNotification(result.message || 'فشل تحديث اسم المستخدم', 'error');
        }
    } catch (error) {
        showNotification('خطأ في الاتصال بالخادم', 'error');
    }
}


    // --- أضف هذا المتغير في بداية الملف ---
    let replyingToMessage = null;
    
    // --- 1. التحقق من المصادقة ---
    if (!token || !user) {
        window.location.href = '/login.html';
        return;
    }

    // --- 2. إظهار التطبيق وإخفاء شاشة التحميل ---
    loadingScreen.classList.add('hidden');
    appContainer.classList.remove('hidden');

    // --- 3. تهيئة واجهة المستخدم ببيانات المستخدم ---
function updateUIWithUserData(userData) {
    const usernameEl = document.getElementById('username');
    if (usernameEl) usernameEl.innerHTML = `${userData.username} ${getAgentBadgeHTML(userData.isAgent)}`;

    document.getElementById('balance').textContent = userData.balance.toFixed(2);
    document.getElementById('coins').textContent = userData.coins;
    document.getElementById('userLevel').textContent = userData.level;

    const profileImgEl = document.getElementById('profileImage');
    if (profileImgEl) {
        profileImgEl.src = userData.profileImage;
        applyFrameToAvatar(profileImgEl, userData.activeFrameClass);
    }
    
    document.getElementById('user-status-text').textContent = userData.status || '🚀 جاهز للتحديات!';
    
    const requiredXP = calculateRequiredXp(userData.level);
    document.getElementById('currentXP').textContent = Math.floor(userData.experience);
    document.getElementById('requiredXP').textContent = requiredXP;
    
    const progressPercentage = (userData.experience / requiredXP) * 100;
    document.getElementById('xp-bar').style.width = `${progressPercentage}%`;
    
    const friendsCount = userData.friends ? userData.friends.length : 0;
    document.getElementById('friends-count').textContent = friendsCount;
    
    updateFriendsAvatars(userData.friends);
    
    const requestsCount = userData.friendRequestsReceived ? userData.friendRequestsReceived.length : 0;
    updateFriendRequestsBadge(requestsCount);
}

// ✅ شارة طلبات الصداقة (سطح المكتب + الهاتف + قسم "المزيد") — بدون أي إشعار جانبي
function updateFriendRequestsBadge(count) {
    const sidebarBadge = document.getElementById('friend-requests-badge');
    if (sidebarBadge) {
        if (count > 0) { sidebarBadge.textContent = count > 9 ? '9+' : count; sidebarBadge.classList.remove('hidden'); }
        else sidebarBadge.classList.add('hidden');
    }
    const mobileBadge = document.getElementById('mobile-friend-req-badge');
    if (mobileBadge) {
        if (count > 0) { mobileBadge.textContent = count > 9 ? '9+' : count; mobileBadge.classList.remove('hidden'); }
        else mobileBadge.classList.add('hidden');
    }
    // ✅ نقطة تنبيه على أيقونة "المزيد" بالشريط السفلي — تظهر فقط والقائمة مغلقة
    const moreBadge = document.getElementById('mobile-more-badge');
    if (moreBadge) {
        const sheetOpen = !document.getElementById('mobile-more-sheet')?.classList.contains('hidden');
        if (count > 0 && !sheetOpen) moreBadge.classList.remove('hidden');
        else moreBadge.classList.add('hidden');
    }
}
        

// --- ✅ الدالة الجديدة: تحديث بيانات المستخدم من الخادم ---
async function refreshUserData() {
    try {
        console.log('[DEBUG] Refreshing user data from server...');
        
        const response = await fetch('/api/users/me/details', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) {
            const errBody = await response.json().catch(() => ({}));
            if (response.status === 403 && errBody.code === 'ACCOUNT_BANNED') {
                showBannedModal(errBody.banReason, errBody.banExpires, errBody.isPermanent);
                return false;
            }
            throw new Error('Failed to refresh user data');
        }
        
        const result = await response.json();
        
        if (result.status === 'success') {
    // تحديث localStorage
    localStorage.setItem('user', JSON.stringify(result.data.user));
    
    // تحديث واجهة المستخدم
    updateUIWithUserData(result.data.user);
    
    console.log('[DEBUG] User data refreshed successfully');
    
    // ✅ هذا السطر يجب أن يكون هنا
    console.log('[DEBUG] Updated user data:', {
        friends: result.data.user.friends ? result.data.user.friends.length : 0,
        sentRequests: result.data.user.friendRequestsSent ? result.data.user.friendRequestsSent.length : 0,
        receivedRequests: result.data.user.friendRequestsReceived ? result.data.user.friendRequestsReceived.length : 0
    });
    
    return true;
}
        
    } catch (error) {
        console.error('[ERROR] Failed to refresh user data:', error);
        return false;
    }
}

// 📍 أضف هذه الدالة بعد async function refreshUserData() {

function optimisticallyRemoveFriend(friendId) {
    console.log(`[OPTIMISTIC] Removing friend ${friendId} from UI immediately`);
    
    // 1. تحديث localStorage
    const user = JSON.parse(localStorage.getItem('user'));
    if (user && user.friends) {
        // تحويل كل الأصدقاء إلى string للمقارنة
        user.friends = user.friends.filter(friend => {
            const friendIdStr = typeof friend === 'object' ? friend._id.toString() : friend.toString();
            return friendIdStr !== friendId.toString();
        });
        localStorage.setItem('user', JSON.stringify(user));
    }
    
    // 2. تحديث العدد في الشريط الجانبي
    const friendsCountElement = document.getElementById('friends-count');
    if (friendsCountElement && user && user.friends !== undefined) {
        friendsCountElement.textContent = user.friends.length;
    }
    
    // 3. تحديث صور الأصدقاء المصغرة
    if (typeof updateFriendsAvatars === 'function' && user && user.friends) {
        updateFriendsAvatars(user.friends);
    }
    
    return user;
}

        
   // --- ✅ دالة حظر مستخدم ---
async function blockUser(userId, modalElement) {
    try {
        console.log(`[CLIENT BLOCK] Blocking user ${userId}`);
        
        const response = await fetch(`/api/blocks/block/${userId}`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });
        
        const result = await response.json();
 
        if (response.ok) {
            showFloatingAlert('تم الحظر', 'fa-ban', 'bg-red-500');
            
            await refreshUserData();
            
            if (socket && socket.connected) {
                socket.emit('forceClearBlockCache', {
                    blockedBy: userId,
                    forceAll: true
                });
                socket.emit('refreshBlockData');
            }
            
            const user = JSON.parse(localStorage.getItem('user'));
            if (user && user.friends !== undefined) {
                document.getElementById('friends-count').textContent = user.friends.length;
                if (typeof updateFriendsAvatars === 'function') {
                    updateFriendsAvatars(user.friends);
                }
            }
            
            if (modalElement) {
                modalElement.remove();
            }

            // ✅ الإصلاح: قفل نافذة الدردشة فوراً في مكانها إذا كانت مفتوحة مع نفس الشخص
            // بدل الحاجة لإغلاقها وإعادة فتحها لرؤية التغيير
            const openChatModal = document.getElementById('private-chat-modal');
            if (openChatModal && openChatModal.dataset.targetUserId === userId.toString()) {
                const chatUserName = document.getElementById('chat-user-name')?.textContent || 'المستخدم';
                lockChatForBlockedUser(userId, chatUserName);
            }

            // ✅ تحديث قسم الرسائل فوراً إذا كان مفتوحاً (لإظهار شارة "محظور")
            if (document.getElementById('messages-list-container')) {
                loadMessagesList();
            }
            
            return true;
          } else {
            showFloatingAlert(result.message || 'فشل حظر المستخدم', 'fa-exclamation-circle', 'bg-red-500');
            return false;
        }
        
    } catch (error) {
        console.error('Error blocking user:', error);
        showNotification('خطأ في الاتصال بالخادم', 'error');
        return false;
    }
}


// --- ✅ دالة فك حظر مستخدم ---
async function unblockUser(userId, modalElement) {
    try {
        console.log(`[CLIENT BLOCK] Unblocking user ${userId}`);
        
        const response = await fetch(`/api/blocks/unblock/${userId}`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
            }
        });
        
        const result = await response.json();
 
        if (response.ok) {
            showFloatingAlert('تم رفع حظر', 'fa-ban', 'bg-red-500');
            
            await refreshUserData();

            if (socket && socket.connected) {
                socket.emit('forceClearBlockCache', {
                    blockedBy: userId,
                    forceAll: true
                });
                socket.emit('refreshBlockData');
            }
            
            const user = JSON.parse(localStorage.getItem('user'));
            if (user && user.friends !== undefined) {
                document.getElementById('friends-count').textContent = user.friends.length;
                if (typeof updateFriendsAvatars === 'function') {
                    updateFriendsAvatars(user.friends);
                }
            }
            
            if (modalElement) {
                modalElement.remove();
            }

            // ✅ الإصلاح: إعادة شريط الإدخال الطبيعي فوراً بمكانه، دون إغلاق النافذة وإعادة فتحها
            const openChatModal = document.getElementById('private-chat-modal');
            if (openChatModal && openChatModal.dataset.targetUserId === userId.toString()) {
                restoreChatInputArea(userId);
            }

            if (document.getElementById('messages-list-container')) {
                loadMessagesList();
            }
            
            return true;
        } else {
            showNotification(result.message || 'فشل رفع الحظر', 'error');
            return false;
        }
        
    } catch (error) {
        console.error('Error unblocking user:', error);
        showNotification('خطأ في الاتصال بالخادم', 'error');
        return false;
    }
}


   // --- ✅ دالة معالجة إجراءات الصداقة ---
async function handleFriendAction(action, userId, modalElement) {
    let url = '';
    let method = 'POST';
    let successMessage = '';
    
    switch (action) {
        case 'send-request':
            url = `/api/friends/send-request/${userId}`;
            successMessage = 'تم إرسال طلب الصداقة';
            break;
        case 'cancel-request':
        case 'reject-request':
            url = `/api/friends/reject-request/${userId}`;
            successMessage = 'تم إلغاء الطلب';
            break;
        case 'accept-request':
            url = `/api/friends/accept-request/${userId}`;
            successMessage = 'أصبحتما أصدقاء';
            break;
        case 'remove-friend':
            url = `/api/friends/remove-friend/${userId}`;
            method = 'DELETE';
            successMessage = 'تم حذف الصديق';
            break;
        case 'unblock-friend':
            // هذا سيتعامل معه unblockUser مباشرة
            await unblockUser(userId, modalElement);
            return;
        default:
            return;
    }
    
    try {
        const response = await fetch(url, { 
            method, 
            headers: { 'Authorization': `Bearer ${token}` } 
        });
        
        if (response.ok) {
            // تحديث البيانات
            await refreshUserData();
            
            // إعادة فتح النافذة
            setTimeout(() => {
                if (modalElement) modalElement.remove();
                showMiniProfileModal(userId);
            }, 300);
        }
    } catch (error) {
        console.error('Error handling friend action:', error);
    }
}     
        
// استدعاء الدالة عند تحميل الصفحة
updateUIWithUserData(user);
switchToView('arena');

        // ✅ جلب أحدث بيانات المستخدم من الخادم فور فتح الموقع
// هذا يضمن ظهور طلبات الصداقة/الإشعارات التي وصلت أثناء إغلاق الموقع
(async () => {
    const refreshed = await refreshUserData();
    if (refreshed) {
        const freshUser = JSON.parse(localStorage.getItem('user'));
        updateFriendRequestsBadge(freshUser.friendRequestsReceived ? freshUser.friendRequestsReceived.length : 0);
    }

    // ✅ تحديث شارة الرسائل فقط — بدون أي إشعار مزعج
    try {
        const chatsResponse = await fetch('/api/private-chat/chats', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (chatsResponse.ok) {
            const chatsResult = await chatsResponse.json();
            if (chatsResult.status === 'success') {
                refreshMessagesNavBadge(chatsResult.data.chats);
            }
        }
    } catch (error) {
        console.error('[STARTUP] فشل التحقق من الرسائل غير المقروءة:', error);
    }
})();

// --- ✅ إضافة عرض البيانات الجديدة ---
// --- ✅ إضافة عرض البيانات الجديدة (النسخة المحسّنة) ---
const profileContainer = document.querySelector('.user-profile');

// --- دوال مساعدة لترجمة البيانات إلى نصوص عربية وأيقونات ---
const getSocialStatus = (status) => {
    const map = {
        single: { text: 'أعزب', icon: 'fa-user' },
        in_relationship: { text: 'في علاقة', icon: 'fa-heart' },
        engaged: { text: 'مخطوب', icon: 'fa-ring' },
        married: { text: 'متزوج', icon: 'fa-users' },
        divorced: { text: 'مطلق', icon: 'fa-user-slash' },
        searching: { text: 'يبحث عن حب', icon: 'fa-search' }
    };
    return map[status] || { text: status, icon: 'fa-question-circle' };
};

const getEducationStatus = (status) => {
    const map = {
        studying: { text: 'طالب', icon: 'fa-book-open' },
        graduated: { text: 'خريج', icon: 'fa-graduation-cap' },
        primary: { text: 'ابتدائي', icon: 'fa-child' },
        high_school: { text: 'ثانوي', icon: 'fa-school' },
        university: { text: 'جامعي', icon: 'fa-university' }
    };
    return map[status] || { text: status, icon: 'fa-question-circle' };
};


const socialInfo = getSocialStatus(user.socialStatus);
const educationInfo = getEducationStatus(user.educationStatus);

const detailsHTML = `
    <div class="mt-3 space-y-2 text-sm text-gray-300 dark:text-gray-400">
        <div class="flex justify-center items-center gap-4">
            <div class="text-xs flex items-center gap-2 cursor-pointer" id="user-id-container" title="نسخ الـ ID">
                <i class="fas fa-id-card-alt text-purple-400"></i> <span>${user.customId}</span>
            </div>
            <div class="text-xs flex items-center gap-2">
                <i class="fas fa-birthday-cake text-pink-400"></i> <span>${user.age} سنة</span>
            </div>
        </div>
        <div class="flex justify-center items-center gap-4 pt-1">
            <div class="text-xs flex items-center gap-2" title="${socialInfo.text}">
                <i class="fas ${socialInfo.icon} text-red-400"></i> <span>${socialInfo.text}</span>
            </div>
            <div class="text-xs flex items-center gap-2" title="${educationInfo.text}">
                <i class="fas ${educationInfo.icon} text-blue-400"></i> <span>${educationInfo.text}</span>
            </div>
        </div>
    </div>
`;

profileContainer.insertAdjacentHTML('beforeend', detailsHTML);

// ربط الأحداث
document.getElementById('user-id-container').addEventListener('click', () => {
    navigator.clipboard.writeText(user.customId).then(() => showNotification('تم نسخ الـ ID بنجاح!', 'info'));
});



    // --- 4. (تم حذف الكود القديم المكرر) — الآن يتم إنشاء الـ 80 مقعداً بالكامل
    // داخل showVoiceRoomsView() فقط، والتي تُستدعى تلقائياً عبر switchToView('arena') أعلاه.
    const buyCoinsBtn = document.getElementById('buy-coins-btn');
    if (buyCoinsBtn) {
        buyCoinsBtn.addEventListener('click', showBuyCoinsModal);
    }
          const withdrawBtn = document.getElementById('withdraw-balance-btn');
    if (withdrawBtn) withdrawBtn.addEventListener('click', showWithdrawModal);

    const depositBalanceBtn = document.getElementById('deposit-balance-btn');
    if (depositBalanceBtn) depositBalanceBtn.addEventListener('click', showDepositModal);

        // --- 5. ربط زر تسجيل الخروج (مع حماية كاملة من انعدام العنصر لمنع توقف كل الكود بعده) ---
    const logoutBtn = document.getElementById('logoutBtn');
    function performLogout() {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/login.html';
    }
    if (logoutBtn) {
        logoutBtn.addEventListener('click', performLogout);
    }
    // --- 6. تهيئة Socket.IO ---
    const socket = io({
        auth: {
            token: token
        }
    });

    // ✅ مستمعات إشارات صوت الـ WebRTC (SDP/ICE) — لازم تكون بعد تعريف socket مباشرة
    // (انظر ملاحظة أعلى قسم "الصوت الحي بين الجالسين" لسبب النقل هنا تحديداً)
    socket.on('voice-webrtc-offer', async ({ fromUserId, payload }) => {
        // 🛡️ سقف حماية: لو بلغ عدد اتصالاتي الصوتية المتزامنة الحد الأقصى (مثلاً إقبال
        // مشاهدين كبير على الاستماع لي) نتجاهل عروضاً جديدة بأمان بدل إرهاق جهازي
        if (!voicePeerConnections.has(fromUserId) && voicePeerConnections.size >= MAX_VOICE_PEER_CONNECTIONS) {
            console.warn('[VOICE] بلغتُ الحد الأقصى لاتصالات الصوت المتزامنة — تجاهلت عرضاً جديداً لحماية الجهاز');
            return;
        }
        // 🐛 إصلاح جوهري لبق "لا يتصل فعلياً بعد إعادة الاتصال التلقائي": لو وصلني عرض جديد
        // من طرف أملك معه اتصالاً بالفعل، فهذا يعني غالباً أنه أعاد بناء اتصاله من الصفر (بعد
        // انقطاع/إعادة اتصال سوكيت — انظر معالج socket.on('connect') أعلاه) بشهادات ICE/DTLS
        // جديدة تماماً. إعادة استخدام اتصالي القديم معه هنا (كما كان يحدث سابقاً عبر
        // getOrCreateVoicePeer) يفشل بصمت غالباً: تبدو الواجهة "متصلة" لكن لا صوت فعلياً،
        // لأن اتصالي القديم لا يطابق الجلسة الجديدة تماماً. الأصح دائماً هو هدم اتصالي به
        // وبناء واحد جديد كلياً قبل معالجة أي عرض وارد، لا الافتراض أن القديم لا يزال صالحاً
        if (voicePeerConnections.has(fromUserId)) {
            teardownVoicePeer(fromUserId);
        }
        await ensureLocalMicStream();
        const pc = getOrCreateVoicePeer(fromUserId);
        try {
            await pc.setRemoteDescription(new RTCSessionDescription(payload));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socket.emit('voice-webrtc-answer', { roomId: currentVoiceRoomId, toUserId: fromUserId, sdp: answer });
        } catch (error) {
            console.error('[VOICE] فشل معالجة عرض وارد:', error);
        }
    });

    socket.on('voice-webrtc-answer', async ({ fromUserId, payload }) => {
        const pc = voicePeerConnections.get(fromUserId);
        if (!pc) return;
        try {
            await pc.setRemoteDescription(new RTCSessionDescription(payload));
        } catch (error) {
            console.error('[VOICE] فشل معالجة رد وارد:', error);
        }
    });

    socket.on('voice-webrtc-ice-candidate', async ({ fromUserId, payload }) => {
        const pc = voicePeerConnections.get(fromUserId);
        if (!pc) return;
        try {
            await pc.addIceCandidate(new RTCIceCandidate(payload));
        } catch (error) {
            console.error('[VOICE] فشل إضافة مرشّح ICE:', error);
        }
    });

      // --- ✅ أضف هذا المستمع الجديد لأزرار إدارة الأصدقاء ---
mainContent.addEventListener('click', async (e) => {
    const button = e.target.closest('.friend-action-btn');
    if (!button) return;

    const action = button.dataset.action;
    const userId = button.dataset.userId;
    const card = button.closest('.flex.items-center.justify-between');

    const performAction = async () => {
        let url = '';
        let method = 'POST';

        switch (action) {
            case 'accept-request':
                url = `/api/friends/accept-request/${userId}`;
                break;
            case 'reject-request':
                url = `/api/friends/reject-request/${userId}`;
                break;
            case 'remove-friend':
                url = `/api/friends/remove-friend/${userId}`;
                method = 'DELETE';
                break;
            default:
                return;
        }

        // التحديث المتفائل
        card.style.opacity = '0.5';

        try {
            const response = await fetch(url, {
                method: method,
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) throw new Error('Action failed');

            // إعادة تحميل قسم الإعدادات بالكامل لعرض البيانات المحدثة
            showSettingsView();
            showNotification('تم تنفيذ الإجراء بنجاح', 'success');

        } catch (error) {
            card.style.opacity = '1';
            showNotification('فشل تنفيذ الإجراء', 'error');
        }
    };

    if (action === 'remove-friend' || action === 'reject-request') {
        const message = action === 'remove-friend' ? 'هل أنت متأكد من حذف هذا الصديق؟' : 'هل أنت متأكد من رفض هذا الطلب؟';
        showConfirmationModal(message, performAction);
    } else {
        performAction();
    }
});

// --- ✅ أضف هذا المستمع لفتح الملف الشخصي المصغر من قسم الإعدادات ---


// --- ✅ استبدل مستمع mainContent بالكامل بهذا ---
// --- ✅✅✅ استبدل كلا المستمعين القديمين بهذا الكود المدمج والنهائي ---
// --- ✅✅✅ استبدل المستمع المدمج بالكامل بهذه النسخة النهائية ---
document.body.addEventListener('click', async (e) => {
    // --- الجزء الأول: إغلاق النوافذ المنبثقة عند النقر على الخلفية ---
    const modalBackdrop = e.target.closest('.modal-backdrop');
    if (modalBackdrop && e.target === modalBackdrop) {
        modalBackdrop.remove();
        return; // أوقف التنفيذ هنا
    }

    // --- الجزء الثاني: التعامل مع أزرار الملف الشخصي المصغر --
const miniProfileActionBtn = e.target.closest('.action-btn');
if (miniProfileActionBtn && miniProfileActionBtn.dataset.action) {
    const action = miniProfileActionBtn.dataset.action;
    const userId = miniProfileActionBtn.dataset.userId;
    const modalElement = document.getElementById('mini-profile-modal');
    
    if (action === 'remove-friend' || action === 'cancel-request') {
        const message = action === 'remove-friend' 
            ? 'هل أنت متأكد من حذف هذا الصديق؟' 
            : 'هل أنت متأكد من إلغاء طلب الصداقة؟';
        
        showConfirmationModal(message, () => {
            // ⭐ استدعاء الدالة العامة
            performMiniProfileAction(modalElement, action, userId, miniProfileActionBtn);
        });
    } else {
        // ⭐ استدعاء الدالة العامة
        performMiniProfileAction(modalElement, action, userId, miniProfileActionBtn);
    }
    return;
}

    // --- الجزء الثالث: التعامل مع أزرار نوافذ الأصدقاء ---
    const friendListActionBtn = e.target.closest('.friend-action-btn');
if (friendListActionBtn) {
    const action = friendListActionBtn.dataset.action;
    const userId = friendListActionBtn.dataset.userId;
    const card = friendListActionBtn.closest('.flex.items-center.justify-between');
    
    const performListAction = async () => {
        let url = '';
        let method = 'POST';
        
        switch (action) {
            case 'accept-request': 
                url = `/api/friends/accept-request/${userId}`; 
                break;
            case 'reject-request': 
                url = `/api/friends/reject-request/${userId}`; 
                break;
            case 'remove-friend': 
                url = `/api/friends/remove-friend/${userId}`; 
                method = 'DELETE';
                break;
            default: 
                return;
        }
        
        // ⭐ التحديث المتفائل: إخفاء العنصر فوراً
        if (card) card.style.display = 'none';
        
        try {
            const response = await fetch(url, { 
                method, 
                headers: { 'Authorization': `Bearer ${token}` } 
            });
            
            if (!response.ok) throw new Error('Action failed');
            
            showNotification('تم تنفيذ الإجراء بنجاح', 'success');
            await refreshUserData();  // تحديث البيانات
            
        } catch (error) {
            // ⭐ إذا فشل، أعد عرض العنصر
            if (card) card.style.display = 'flex';
            showNotification('فشل تنفيذ الإجراء', 'error');
        }
    };
    
    // ⭐ إضافة تأكيد للحذف أو الرفض
    if (action === 'remove-friend' || action === 'reject-request') {
        const message = action === 'remove-friend' 
            ? 'هل أنت متأكد من حذف هذا الصديق؟' 
            : 'هل أنت متأكد من رفض هذا الطلب؟';
        
        showConfirmationModal(message, performListAction);
    } else {
        performListAction();
    }
    
    return;
   }
});     

// --- ✅ دالة جديدة لأنيميشن اكتساب الخبرة ---
function showXpGainAnimation(amount) {
    if (amount <= 0) return;

    const xpElement = document.createElement('div');
    xpElement.textContent = `+${amount} XP`;
    xpElement.className = 'xp-gain-animation fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-yellow-500/80 text-white font-bold px-4 py-2 rounded-full shadow-lg z-[300]';
    
    document.body.appendChild(xpElement);

    // إزالة العنصر بعد انتهاء الأنيميشن
    setTimeout(() => {
        xpElement.remove();
    }, 1900); // يجب أن تكون المدة أقل بقليل من مدة الأنيميشن في CSS
}

        
    // =================================================
    // =========== قسم عام وأحداث السوكيت =============
    // =================================================

        function showNotification(message, type = 'info') {
        // ✅ استُبدل الصندوق الجانبي المزعج بإشعار عائم أنيق يظهر أعلى المنتصف ثم يختفي تلقائياً
        const colors = { success: 'bg-green-500/90', error: 'bg-red-500/90', info: 'bg-purple-600/90', warning: 'bg-yellow-500/90' };
        const icon = { success: 'fa-check-circle', error: 'fa-exclamation-circle', info: 'fa-info-circle', warning: 'fa-exclamation-triangle' };

        const stacked = document.querySelectorAll('.floating-toast').length;
        const notification = document.createElement('div');
        notification.className = `floating-toast fixed left-1/2 -translate-x-1/2 z-[600] flex items-center gap-2 px-4 py-2.5 rounded-full text-white text-sm shadow-2xl backdrop-blur-sm ${colors[type] || colors.info}`;
        notification.style.top = `${16 + stacked * 52}px`;
        notification.innerHTML = `<i class="fas ${icon[type] || icon.info}"></i><span>${message}</span>`;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.transition = 'opacity 0.4s, transform 0.4s';
            notification.style.opacity = '0';
            notification.style.transform = 'translate(-50%, -12px)';
            setTimeout(() => notification.remove(), 400);
        }, 2800);
    }
        
    // ✅ نافذة الحظر داخل التطبيق (لمستخدم كان متصلاً ثم حُظر لحظياً، أو رفض الخادم طلباً بسبب الحظر)
        function showBannedModal(reason, banExpires, isPermanent) {
        if (document.getElementById('app-banned-modal')) return;
        const cachedUser = JSON.parse(localStorage.getItem('user') || '{}');
        const userId = cachedUser._id;
        const expiryText = isPermanent
            ? 'حظر دائم'
            : `ينتهي في: ${new Date(banExpires).toLocaleString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`;

        const modalHTML = `
            <div id="app-banned-modal" class="fixed inset-0 bg-black/85 flex items-center justify-center z-[999] p-4">
                <div class="bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm text-white border-2 border-red-500/40 overflow-hidden">
                    <div class="bg-gradient-to-r from-red-700 to-red-900 p-6 text-center">
                        <i class="fas fa-user-lock text-4xl mb-2"></i><h2 class="text-xl font-bold">تم حظر حسابك</h2>
                    </div>
                    <div id="app-banned-modal-body" class="p-6 text-center">
                        <p class="text-gray-300 text-sm mb-1">السبب:</p>
                        <p class="font-bold mb-4">${reason || 'مخالفة لشروط الاستخدام'}</p>
                        <p class="text-xs px-3 py-1.5 rounded-full inline-block ${isPermanent ? 'bg-red-900/40 text-red-300' : 'bg-yellow-900/40 text-yellow-300'}">
                            <i class="fas fa-clock mr-1"></i> ${expiryText}
                        </p>
                        <button id="openAppAppealBtn" class="mt-4 w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-2.5 rounded-lg text-sm">
                            <i class="fas fa-comment-dots mr-1"></i> تقديم استئناف
                        </button>
                        <button id="forceLogoutBannedBtn" class="mt-2 w-full bg-gray-700 hover:bg-gray-600 text-white py-2.5 rounded-lg text-sm">تسجيل الخروج</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        document.getElementById('forceLogoutBannedBtn').addEventListener('click', () => {
            localStorage.removeItem('token'); localStorage.removeItem('user');
            window.location.href = '/login.html';
        });
        document.getElementById('openAppAppealBtn').addEventListener('click', () => {
            const body = document.getElementById('app-banned-modal-body');
            body.innerHTML = `
                <textarea id="appAppealInput" rows="4" maxlength="500" class="w-full bg-gray-700 border border-gray-600 rounded-lg p-3 text-sm text-right" placeholder="اشرح اعتراضك..."></textarea>
                <button id="submitAppAppealBtn" class="mt-3 w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2.5 rounded-lg text-sm">إرسال الاستئناف</button>
            `;
            document.getElementById('submitAppAppealBtn').addEventListener('click', async () => {
                const message = document.getElementById('appAppealInput').value.trim();
                if (message.length < 5) { showNotification('اكتب تفاصيل كافية', 'error'); return; }
                try {
                    const response = await fetch('/api/support/ban-appeal', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ userId, message })
                    });
                    const result = await response.json();
                    if (response.ok) body.innerHTML = `<div class="py-4"><i class="fas fa-check-circle text-4xl text-green-400 mb-3"></i><p class="text-sm">${result.message}</p></div>`;
                    else showNotification(result.message || 'فشل الإرسال', 'error');
                } catch (e) { showNotification('خطأ بالاتصال', 'error'); }
            });
        });
    }

    socket.on('balanceUpdate', ({ newBalance }) => {
        const balanceElement = document.getElementById('balance');
        if (balanceElement) {
            balanceElement.textContent = newBalance.toFixed(2);
        }
        const localUser = JSON.parse(localStorage.getItem('user'));
        if (localUser) {
            localUser.balance = newBalance;
            localStorage.setItem('user', JSON.stringify(localUser));
        }
        // ✅ تمت إزالة إشعار "تم تحديث رصيدك" — تحديث الرقم بالهيدر كافٍ
    });

    // ✅ زر الكتم انتقل لقائمة "المزيد" (تُعاد بناؤه بالكامل بكل فتحة، فتعكس القيمة المحدَّثة
    // هنا تلقائياً) — كل ما تحتاجه هذي الدالة هو تحديث حالة myIsMuted نفسها فقط
    function syncMuteButtonUI(isMuted) {
        myIsMuted = !!isMuted;
        // ✅ الكتم الحقيقي الآن: تعطيل مسار الصوت المحلي فعلياً (لا مجرد أيقونة) — الجميع
        // بالشبكة يتوقفون عن سماعي فوراً بلا أي إعادة تفاوض بالاتصال (المسار يبقى متصلاً)
        if (localMicStream) localMicStream.getAudioTracks().forEach(t => { t.enabled = !myIsMuted; });
    }

    // ✅ تحديث حي لمقاعد الغرفة الصوتية (تتحقق من وجود الشبكة بالصفحة أولاً لأن المستخدم قد يكون بقسم آخر)
    socket.on('user-joined-seat', ({ roomId, seatNumber, userId, username, profileImage, activeFrameClass, isMuted }) => {
        const isMe = userId === myUserId;
        if (isMe) {
            myVoiceSeatNumber = seatNumber;
            myVoiceRoomId = roomId;
            syncMuteButtonUI(!!isMuted); // ✅ يعكس حالة الكتم الحقيقية المرحّلة من المقعد السابق، لا يصفّرها
            clearVoiceSeatPending();
        }
        updateVoiceControlBar();
        // 🐛 إصلاح: زر "مغادرة المقعد"/"طلب الصعود" (∞) يعتمدان على updateHandRaiseUI وليس
        // updateVoiceControlBar (التي تُحدّث فقاعة "رجوع لغرفتي" فقط) — بدون هذا السطر يبقى
        // الزر القديم ظاهراً حتى يصل حدث آخر غير متعلّق يُحدّثه بالصدفة
        updateHandRaiseUI();
        if (roomId !== currentVoiceRoomId) return; // تحديث بغرفة غير معروضة بالشاشة حالياً — لا داعي لتحديث الشبكة
        if (isMe) {
            // 🐛 إصلاح: لو كنت أصلاً "مشاهداً" أستمع لبعض الجالسين قبل جلوسي هذا (اتصال استقبال
            // فقط بلا مايك)، يجب إغلاق تلك الاتصالات أولاً وإعادة إنشائها من الصفر الآن كمتحدث
            // (بمايك فعلي هذي المرة) — وإلا تبقى عالقة بشكلها القديم بلا إرسال، فأبقى "أخرس"
            // تجاههم تحديداً رغم جلوسي فعلياً على مقعد (RTCPeerConnection لا يمكن ترقية اتجاهه
            // بسهولة وأماناً بعد العرض الأول، فالإعادة من الصفر أبسط وأضمن من إعادة التفاوض)
            teardownAllVoicePeers();
            // ✅ أنا "الجديد" بشبكة الصوت دائماً عند جلوسي — أبادر بالاتصال بكل من هو جالس
            // أصلاً (هم ينتظرون عرضي أنا، لا يبادرون من طرفهم — يمنع تعارض عرضين متزامنين)
            connectVoiceMeshToCurrentlySeated();
        } else if (!myVoiceSeatNumber) {
            // ✅ أنا مجرّد مشاهد، وشخص آخر صعد للتو لمقعد — أتصل به فوراً استماعاً فقط (بلا
            // طلب إذن مايك) لأسمعه؛ لست بحاجة لإعادة مسح كل الشبكة، فقط هذا الشخص الجديد
            initiateVoiceCallTo(userId);
        }
        const voiceGrid = document.getElementById('voice-chat-grid');
        if (!voiceGrid) return;
        const seatEl = voiceGrid.querySelector(`.voice-seat[data-seat="${seatNumber}"]`);
        if (!seatEl) return;
        renderVoiceSeatContent(seatEl, {
            isLocked: false,
            isMuted: !!isMuted,
            user: { id: userId, username, profileImage, activeFrameClass }
        });
        // ✅ إعلان "انضم" انتقل ليظهر فور دخول الغرفة (راجع user-entered-room) بدل انتظار
        // الصعود لمقعد — الجلوس على مقعد لم يعد يُكرّر نفس الإعلان
    });

    socket.on('user-left-seat', ({ roomId, seatNumber, userId }) => {
        const isMe = userId === myUserId;
        seatMutedUsers.delete(userId); // ✅ تنظيف — لا داعي يبقى بالذاكرة، سيصل توصيف كتم جديد لو عاد وجلس لاحقاً
        if (isMe) {
            myVoiceSeatNumber = null;
            myVoiceRoomId = null;
            clearVoiceSeatPending();
            teardownAllVoicePeers(); // ✅ لم أعد جزءاً من شبكة صوت هذي الغرفة إطلاقاً كمتحدث
        } else {
            teardownVoicePeer(userId); // ✅ أنهِ اتصالي معه تحديداً فقط — بقية الشبكة يستمرون طبيعياً
        }
        updateVoiceControlBar();
        // 🐛 إصلاح: نفس خلل زر "مغادرة المقعد" بالضبط (راجع user-joined-seat أعلاه) — بدونه
        // يبقى زر "مغادرة المقعد" ظاهراً بعد المغادرة الفعلية بدل عودته لزر "طلب الصعود" (∞)
        updateHandRaiseUI();
        if (roomId !== currentVoiceRoomId) return;
        // 🐛 إصلاح: نزلتُ عن مقعدي لكني ما زلت أشاهد الغرفة — بدون هذا كنت أبقى "أصمّ" تماماً
        // (لا أسمع أحداً) حتى أعيد فتح الغرفة يدوياً؛ الاتصال هنا يعود استماعاً فقط تلقائياً
        // بكل من تبقى جالساً، بما أن myVoiceSeatNumber صار فارغاً الآن
        if (isMe) connectVoiceMeshToCurrentlySeated();
        const voiceGrid = document.getElementById('voice-chat-grid');
        if (!voiceGrid) return;
        const seatEl = voiceGrid.querySelector(`.voice-seat[data-seat="${seatNumber}"]`);
        if (!seatEl) return;
        renderVoiceSeatContent(seatEl, null);
    });

    socket.on('user-toggled-mute', ({ roomId, userId, isMuted }) => {
        if (userId === myUserId) syncMuteButtonUI(isMuted);
        // 🐛 إصلاح: طبقة كتم مستقلة على جهة كل مستقبِل — راجع الشرح الكامل أعلى seatMutedUsers.
        // تُطبَّق بغض النظر عن الغرفة المعروضة حالياً (قد أستمع لهم مصغّراً بالخلفية)
        if (isMuted) seatMutedUsers.add(userId); else seatMutedUsers.delete(userId);
        applyPeerAudioMuteState(userId);
        if (roomId !== currentVoiceRoomId) return;
        const voiceGrid = document.getElementById('voice-chat-grid');
        if (!voiceGrid) return;
        const seatEl = voiceGrid.querySelector(`[data-user-id="${userId}"]`);
        if (!seatEl) return;
        let overlay = seatEl.querySelector('.voice-seat-mute-overlay');
        if (isMuted && !overlay) {
            overlay = document.createElement('div');
            overlay.className = 'voice-seat-mute-overlay';
            overlay.innerHTML = '<i class="fas fa-microphone-slash"></i>';
            seatEl.appendChild(overlay);
        } else if (!isMuted && overlay) {
            overlay.remove();
        }
    });


    // ✅ إعادة مزامنة كاملة مع حقيقة السيرفر عند كل اتصال أو إعادة اتصال (وليس فقط عند أول فتح للقسم)
    // — بدونها، أي بث حصل أثناء انقطاع مؤقت (تبديل شبكة، نوم الجهاز، إلخ) يضيع على المستخدم فعلياً
    // فتبقى صورته "عالقة" بمكان قديم عند نفسه، أو لا يرى تحرّك بقية المستخدمين، لحين عمل Refresh يدوي
    socket.on('connect', () => {
        if (currentVoiceRoomId) {
            // آمنة تماماً حتى لو القسم غير مفتوح حالياً
            fetchAndRenderVoiceSnapshot(currentVoiceRoomId, currentRoomPassword).then(ok => {
                // 🐛 إصلاح: اتصالات الصوت الحي (WebRTC) لا تُعاد بناؤها تلقائياً عند إعادة اتصال
                // السوكيت — كل شيء آخر بالواجهة (المقاعد/الدردشة/الموسيقى) يعود طبيعياً تماماً
                // فيبدو كل شيء سليماً، لكن اتصالات RTCPeerConnection القديمة (التي قد تكون
                // تعطّلت فعلياً بنفس سبب انقطاع السوكيت، أو حتى لم تُكتشف بعد كمعطّلة) تبقى
                // كما هي — لا شيء يُعيد بناءها إلا حدث جلوس/مغادرة جديد لأحدهم. إعادة البناء
                // الكاملة هنا (بعد التأكد أني ما زلت مصرَّحاً بمشاهدة الغرفة فعلياً) تضمن صوتاً
                // سليماً دوماً بعد أي إعادة اتصال، بدل انتظار حظ حدوث حدث آخر يكشف المشكلة
                if (ok && currentVoiceRoomId) {
                    teardownAllVoicePeers();
                    connectVoiceMeshToCurrentlySeated();
                }
            });
        }
        // 🐛 إصلاح جوهري: عضوية قنوات Socket.IO (بما فيها room-chat-<roomId>) تُفقد تماماً مع
        // أي انقطاع، ولا تُستعاد تلقائياً عند إعادة الاتصال — بدون هذا السطر يبقى المستخدم
        // "أصمّ" فعلياً عن كل بث حي بالغرفة (رسائل جديدة، انضمام، هدايا، موسيقى...) رغم أن
        // واجهته تبدو طبيعية تماماً بعد إعادة الاتصال، وهذا بالضبط ما كان يبدو "خللاً بالغرفة"
        if (roomChatCurrentRoomId) rejoinRoomChatChannel(roomChatCurrentRoomId);

        // ✅ لو كنت مضيف غرفة لا تزال مباشرة فعلياً بس أنت مو داخلها حالياً (تحديث الصفحة
        // مثلاً يُخرجك من واجهة الغرفة بدون ما ينهي بثّك الفعلي — البث يبقى شغّالاً "يتيماً"
        // بلا علمك) — نبّهه بلطف مع خيار رجوع سريع، بدل ما يكتشف لاحقاً إنه كان لسا مباشراً
        fetch('/api/voice-room/my-room', { headers: { 'Authorization': `Bearer ${token}` } })
            .then(r => r.json())
            .then(result => {
                if (result.status === 'success' && result.room && result.room.isLive && currentVoiceRoomId !== result.room.id) {
                    showStillLiveModal(result.room);
                }
            })
            .catch(() => {});
    });

    // ✅ إشعار خاص للمطرود نفسه (منفصل عن user-left-seat العام لتوضيح السبب له تحديداً)
    socket.on('you-were-kicked', ({ userId }) => {
        if (userId !== myUserId) return;
        showNotification('تم إنزالك من المقعد من قِبل إدارة الغرفة', 'warning');
    });

    socket.on('seat-lock-changed', ({ roomId, seatNumber, isLocked }) => {
        if (roomId !== currentVoiceRoomId) return;
        const voiceGrid = document.getElementById('voice-chat-grid');
        if (!voiceGrid) return;
        const seatEl = voiceGrid.querySelector(`.voice-seat[data-seat="${seatNumber}"]`);
        if (!seatEl) return;
        if (isLocked) {
            renderVoiceSeatContent(seatEl, { isLocked: true });
        } else {
            renderVoiceSeatContent(seatEl, null);
        }
    });

    socket.on('moderator-status-changed', ({ roomId, userId, isModerator }) => {
        if (userId === myUserId && roomId === currentVoiceRoomId) {
            currentRoomMyRole = isModerator ? 'moderator' : 'guest';
            showNotification(isModerator ? 'تم تعيينك كمسؤول بهذي الغرفة ✅' : 'تم إلغاء صلاحيتك كمسؤول', isModerator ? 'success' : 'info');
            updateHandRaiseUI();
        }
    });

    // =====================================================
    // ✅ رفع اليد لطلب الصعود للمايك — تحديثات حية لقائمة الانتظار والمرسل نفسه
    // =====================================================
    socket.on('hand-raise-added', ({ roomId, userId, username, profileImage }) => {
        if (userId === myUserId) { myHandRaised = true; updateHandRaiseUI(); }
        if (roomId !== currentVoiceRoomId) return;
        if (!roomHandQueue.some(h => h.userId === userId)) {
            roomHandQueue.push({ userId, username, profileImage });
        }
        updateHandRaiseUI();
        const listEl = document.getElementById('hand-queue-list');
        if (listEl) showHandQueueSheet(roomId); // ✅ إعادة رسم القائمة المفتوحة لو كانت ظاهرة فعلاً
    });

    socket.on('hand-raise-removed', ({ roomId, userId }) => {
        if (userId === myUserId) { myHandRaised = false; updateHandRaiseUI(); }
        if (roomId !== currentVoiceRoomId) return;
        roomHandQueue = roomHandQueue.filter(h => h.userId !== userId);
        updateHandRaiseUI();
        document.querySelector(`#hand-queue-list [data-user-id="${userId}"]`)?.remove();
    });

    socket.on('hand-raise-dismissed', ({ roomId }) => {
        myHandRaised = false;
        if (roomId === currentVoiceRoomId) updateHandRaiseUI();
        showNotification('تم رفض طلب الصعود من المضيف', 'info');
    });

    // ✅ دعوة المضيف لمقعد محدد (شخص لم يطلب شيئاً بنفسه) — تُعرض دائماً بغض النظر عن الشاشة
    // المفتوحة حالياً (قد تصل وأنت مُصغِّر الغرفة)، وينتظر السيرفر قراري الصريح قبل أي إجلاس
    socket.on('seat-invite-received', (payload) => {
        document.getElementById('cancel-join-request-modal')?.remove();
        showSeatInviteReceivedModal(payload);
    });

    // ✅ المضيف وافق على طلب صعودي أنا نفسي (رفعت يدي وطلبت) — إجلاس مباشر بلا أي نافذة
    // قبول/رفض إضافية (طلبي هو نفسه موافقتي)، فقط تأكيد سريع
    socket.on('you-were-invited-up', ({ roomId }) => {
        document.getElementById('cancel-join-request-modal')?.remove();
        if (roomId !== currentVoiceRoomId) return;
        showNotification('وافق المضيف على طلبك — تم إصعادك للمقعد 🎤', 'success');
    });

    // ✅ إشعار سريع للمضيف من الأسفل (أسلوب تطبيقات الجوال) عند رفض الدعوة — يذكّره بمهلة
    // إعادة المحاولة بدل تركه يخمّن لماذا لم يظهر الشخص على المقعد
    socket.on('seat-invite-declined', ({ targetUsername, cooldownSeconds }) => {
        showBottomToast(`${targetUsername} رفض الدعوة — يمكنك إعادة المحاولة خلال ${cooldownSeconds || 26} ثانية`, 'fa-user-xmark');
    });

    // =====================================================
    // ✅ مشاهدو الغرفة — عدّاد حي + قائمة عند الطلب (مصدرها عضوية قناة السوكيت بالسيرفر)
    // =====================================================
    socket.on('room-viewer-count', ({ roomId, count, preview }) => {
        if (roomId !== currentVoiceRoomId) return;
        updateRoomViewerWidget(count, preview || null);
    });

    socket.on('room-viewers-list', ({ roomId, viewers }) => {
        if (roomId === currentVoiceRoomId) updateRoomViewerWidget(viewers.length, viewers);

        const countLabel = document.getElementById('room-viewers-sheet-count');
        if (countLabel) countLabel.textContent = `(${viewers.length})`;

        const listEl = document.getElementById('room-viewers-list');
        if (!listEl) return;
        if (viewers.length === 0) {
            listEl.innerHTML = '<p class="text-center text-xs text-gray-500 py-8">لا يوجد مشاهدون حالياً</p>';
            return;
        }
        listEl.innerHTML = viewers.map(v => `
            <button data-user-id="${v.id}" data-username="${escapeHtml(v.username)}" class="room-viewer-row w-full flex items-center gap-2.5 rounded-xl p-2 text-right">
                <img src="${v.profileImage}" class="w-10 h-10 rounded-full object-cover flex-shrink-0 ring-1 ring-white/10">
                <span class="text-sm font-medium truncate flex-1">${escapeHtml(v.username)}</span>
                <i class="fas fa-chevron-left text-[10px] text-gray-500"></i>
            </button>
        `).join('');
        listEl.querySelectorAll('.room-viewer-row').forEach(btn => {
            btn.addEventListener('click', () => {
                document.getElementById('room-viewers-sheet')?.remove();
                showUserProfileSheet(currentVoiceRoomId, null, btn.dataset.userId, btn.dataset.username);
            });
        });
    });

    // 🐛 إصلاح: ورقة "دعوة لمقعد" كانت تعلَق على التحميل دائماً — كانت مبنية كفرع إضافي
    // داخل مستمع room-viewers-list أعلاه، لكن ذاك المستمع يخرج مبكراً (return) بمجرد عدم
    // وجود عنصر ورقة "المشاهدون" نفسها بالـ DOM (وهي بالضبط غير موجودة وقت فتح ورقة الدعوة)،
    // فلا يصل التنفيذ للفرع الجديد إطلاقاً. مستمع مستقل تماماً هنا يحل المشكلة جذرياً
    socket.on('room-viewers-list', ({ roomId, viewers }) => {
        if (roomId !== currentVoiceRoomId) return;
        renderSeatInvitePickerList(viewers);
    });

    // =====================================================
    // ✅ دورة حياة البث — بدء/انتهاء
    // =====================================================
    // ✅ لا حاجة لإعادة جلب/رسم الغرفة كاملة هنا — user-joined-seat (يُرسَل بنفس لحظة بدء
    // البث) يكفي وحده لتحديث مقعد المضيف؛ إعادة الرسم الكاملة كانت تُحسّ وكأن الغرفة
    // "تُعاد كتابتها" بلا داعٍ (كل الصور تُعاد تحميلها دفعة واحدة)
    // 🐛 إصلاح: السيرفر يُفرّغ kickedUsers فعلياً عند كل بدء بث جديد (انظر VoiceRoom.startBroadcast)،
    // لكن هذا المستمع كان لا يفعل شيئاً إطلاقاً، فتبقى قائمة "المطرودون" بنافذة الإعدادات
    // تعرض أسماء قديمة محلياً حتى بعد إغلاق البث وإعادة فتحه رغم انتهاء أثرهم فعلياً بالسيرفر
    socket.on('room-broadcast-started', ({ roomId } = {}) => {
        if (roomId && roomId === currentVoiceRoomId) {
            currentRoomKickedUsers = [];
            renderKickedUsersListUI();
            // ✅ دعم جلسة البث يُصفَّر بالسيرفر تلقائياً عند كل بدء بث جديد — نطابق ذلك هنا فوراً
            currentRoomSessionSupportPoints = 0;
            updateRoomSessionSupportUI();
        }
    });

    // ✅ ظهور/اختفاء فوري بقائمة تصفح الغرف عند بدء/انتهاء بث أي مضيف — فقط لو شاشة
    // التصفح مفتوحة فعلياً حالياً (grid موجود بالـ DOM)، وإلا يُتجاهل الحدث بصمت وأمان
    socket.on('room-went-live', ({ room } = {}) => {
        const grid = document.getElementById('room-list-grid');
        if (!grid || !room) return;
        if (grid.querySelector(`[data-room-id="${room.id}"]`)) return; // ✅ لا تكرار لو وصل الحدث أكثر من مرة
        const searchTerm = (document.getElementById('room-search-input')?.value || '').trim().toLowerCase();
        if (searchTerm && !room.name.toLowerCase().includes(searchTerm) && room.roomCode !== searchTerm) return;
        grid.prepend(renderRoomCard(room));
        document.getElementById('room-list-empty')?.classList.add('hidden');
    });

    socket.on('room-went-offline', ({ roomId } = {}) => {
        const grid = document.getElementById('room-list-grid');
        if (!grid || !roomId) return;
        grid.querySelector(`[data-room-id="${roomId}"]`)?.remove();
        document.getElementById('room-list-empty')?.classList.toggle('hidden', grid.children.length > 0);
    });

    socket.on('room-broadcast-ended', (payload) => {
        // ✅ لو كانت غرفتي التي أنا قاعد فيها (حتى وأنا أتصفح مكاناً آخر وقتها) — تصفير الحالة
        // فوراً يُخفي الفقاعة العائمة تلقائياً (لم تعد هناك غرفة أرجع لها)
        if (myVoiceRoomId === payload.roomId) {
            myVoiceSeatNumber = null;
            myVoiceRoomId = null;
            updateVoiceControlBar();
        }
        // 🐛 إصلاح: تُغلَق كل اتصالات الصوت أيضاً لو كنت مجرّد "مشاهد" (غير جالس) بنفس هذي
        // الغرفة المعروضة حالياً — بدون هذا كانت تبقى اتصالاتي بالجالسين (الذين اختفوا الآن)
        // معلَّقة بلا داعٍ حتى أغادر الشاشة يدوياً؛ كل اتصالاتي دوماً تخص currentVoiceRoomId فقط
        if (payload.roomId === currentVoiceRoomId) {
            teardownAllVoicePeers(); // ✅ انتهى البث فأُفرِغت كل المقاعد — لا user-left-seat يصدر هنا فعلياً
        }
        // 🐛 إصلاح: إيقاف أي أغنية تخص هذي الغرفة فوراً بغض النظر عن الشاشة المعروضة حالياً
        // (عنصر الصوت عالمي بالصفحة) — بدونه كان المشغّل العائم/الصوت يبقيان حتى إعادة تحميل الصفحة
        if (currentMusicState?.roomId === payload.roomId) {
            applyMusicState(null);
        }
        if (payload.roomId !== currentVoiceRoomId) return;
        // ✅ المضيف نفسه يشوف ملخّصاً بسيطاً (مدة بثّه فقط) — لا صورته ولا زر متابعة لنفسه،
        // ولا انتقال عشوائي لغرفة أخرى، فقط رجوع مباشر لقائمة التصفح
        if (currentRoomMyRole === 'host') {
            showHostBroadcastSummaryScreen(payload);
        } else {
            showBroadcastEndedScreen(payload);
        }
    });

    socket.on('room-follow-updated', ({ isFollowing, followersCount }) => {
        currentRoomIsFollowing = isFollowing;
        if (typeof followersCount === 'number') currentRoomFollowersCount = followersCount;
        // ✅ يحدّث كل نسخ زر المتابعة الحالية بآن واحد (رأس الغرفة + بطاقة المعلومات + شاشة
        // انتهاء البث) — قد يكون أكثر من واحد ظاهراً بنفس اللحظة حسب الشاشة المفتوحة
        document.querySelectorAll('.js-room-follow-btn').forEach(btn => {
            btn.dataset.following = isFollowing ? '1' : '0';
            btn.innerHTML = isFollowing
                ? '<i class="fas fa-check"></i> متابَع'
                : '<i class="fas fa-plus"></i> متابعة';
            btn.classList.toggle('following', isFollowing);
        });
        const countEl = document.getElementById('room-info-followers-count');
        if (countEl && typeof followersCount === 'number') countEl.textContent = followersCount;
    });

    // ✅ إعلان هدية بالغرفة — فقاعة ذهبية بالدردشة + شريط جانبي + أيقونة طائرة نحو المستلم
    socket.on('room-gift-announcement', (data) => {
        if (data.roomId !== currentVoiceRoomId) return;
        appendRoomGiftChatMessage(data);
        showRoomGiftSideBanner(data);
        // ✅ مصدر الحقيقة الوحيد للمؤثر البصري لكل من بالغرفة (المرسل والمستلم والمشاهدون) —
        // صورة الهدية تطفو كبيرة بمنتصف الشاشة ثم تطير بأناقة نحو مقعد المدعوم بالضبط
        showGiftFloatingAnimation(data.giftImage, data.giftName, data.fromUsername, data.quantity, data.toUserId);
    });

    // =====================================================
    // ✅ معارك PK بين غرفتين — تحديثات حية للتحدي والشريط والنتيجة
    // =====================================================
    socket.on('pk-challenge-sent', () => {
        // ✅ تأكيد بسيط — الإشعار الرئيسي يظهر فوراً عند الإرسال بالواجهة نفسها
    });

    socket.on('pk-challenge-received', (payload) => {
        showPkChallengeReceivedModal(payload);
    });

    socket.on('pk-challenge-declined', ({ roomB }) => {
        showNotification('تم رفض تحدي المعركة', 'info');
    });

    socket.on('pk-challenge-expired', () => {
        document.getElementById('pk-challenge-received-modal')?.remove();
        showNotification('انتهت مهلة الرد على تحدي المعركة', 'info');
    });

    socket.on('pk-battle-started', (data) => {
        if (data.roomA.id !== currentVoiceRoomId && data.roomB.id !== currentVoiceRoomId) return;
        currentPkBattle = { ...data, status: 'active' };
        renderPkBar();
        showNotification('بدأت معركة PK! 🔥', 'success');
    });

    socket.on('pk-score-update', (data) => {
        if (!currentPkBattle || currentPkBattle.battleId !== data.battleId) return;
        currentPkBattle.scoreA = data.scoreA;
        currentPkBattle.scoreB = data.scoreB;
        renderPkBar();
    });

    socket.on('pk-battle-ended', (data) => {
        if (data.roomA !== currentVoiceRoomId && data.roomB !== currentVoiceRoomId) return;
        removePkBar();
        showPkResultModal(data);
    });

    // =====================================================
    // ✅ تحدٍ بين أعضاء داخل نفس الغرفة — تحديثات حية للدعوة/الشريط/النتيجة
    // =====================================================
    socket.on('seat-challenge-created', () => {
        // ✅ تأكيد بسيط — الإشعار الرئيسي ظهر فوراً عند الإرسال بالواجهة نفسها
    });

    socket.on('seat-challenge-invite', (data) => {
        if (data.roomId !== currentVoiceRoomId) return;
        showSeatChallengeInviteModal(data);
    });

    socket.on('seat-challenge-pending', (data) => {
        if (data.roomId !== currentVoiceRoomId) return;
        showBottomToast('⏳ تحدٍ جديد بانتظار موافقة المدعوين', 'fa-fire');
    });

    socket.on('seat-challenge-declined', (data) => {
        if (data.roomId !== currentVoiceRoomId) return;
        document.getElementById('seat-challenge-invite-modal')?.remove();
        showNotification(`تم رفض التحدي${data.declinedBy ? ' من ' + data.declinedBy : ''}`, 'info');
    });

    socket.on('seat-challenge-expired', (data) => {
        if (data.roomId !== currentVoiceRoomId) return;
        document.getElementById('seat-challenge-invite-modal')?.remove();
        showNotification('انتهت مهلة الرد على التحدي', 'info');
    });

    socket.on('seat-challenge-started', (data) => {
        if (data.roomId !== currentVoiceRoomId) return;
        document.getElementById('seat-challenge-invite-modal')?.remove();
        renderSeatChallengeBar(data);
        showNotification('بدأ التحدي! 🔥', 'success');
    });

    socket.on('seat-challenge-score-update', (data) => {
        if (!currentSeatChallenge || currentSeatChallenge.challengeId !== data.challengeId) return;
        updateSeatChallengeScores(data.scoreA, data.scoreB);
    });

    socket.on('seat-challenge-ended', (data) => {
        if (data.roomId !== currentVoiceRoomId) return;
        showSeatChallengeResultModal(data);
    });

    socket.on('new-room-message', ({ roomId, message }) => {
        if (roomId !== roomChatCurrentRoomId) return;
        appendRoomChatMessage(message);
    });

    // ✅ إعلان انضمام فوري لدخول الغرفة (مشاهداً) — قبل أي طلب صعود، بالضبط زي التطبيقات المشهورة
    socket.on('user-entered-room', ({ roomId, userId, username, profileImage }) => {
        if (roomId !== roomChatCurrentRoomId) return;
        appendJoinAnnouncement(userId, username, profileImage);
    });

    socket.on('room-chat-cleanup', ({ roomId }) => {
        if (roomId !== roomChatCurrentRoomId) return;
        // ✅ إعادة تحميل بسيطة لآخر 50 رسالة بعد أي تنظيف (أبسط وأضمن من تتبع كل معرّف محذوف)
        enterRoomChat(roomId);
    });

    // ✅ تنظيف الدردشة من المضيف — يُفرغ صندوق الرسائل لدى الجميع فوراً
    socket.on('room-chat-cleared', ({ roomId }) => {
        if (roomId !== roomChatCurrentRoomId) return;
        const box = document.getElementById('room-chat-messages');
        if (box) box.innerHTML = '';
        showNotification('تم تنظيف دردشة الغرفة', 'info');
    });

    // ✅ قفل/فتح الدردشة — يحدّث حالة حقل الكتابة فوراً لدى الجميع
    socket.on('room-chat-lock-updated', ({ roomId, locked }) => {
        if (roomId !== currentVoiceRoomId) return;
        currentRoomChatLocked = locked;
        updateChatLockUI();
        if (currentRoomMyRole !== 'host' && currentRoomMyRole !== 'moderator') {
            showNotification(locked ? 'قفل المضيف الدردشة' : 'فتح المضيف الدردشة من جديد', 'info');
        }
    });

    // ✅ تفاعل بين شخصين جالسين (قبلة/عناق...) — تأثير بصري متصل حول مقعديهما فقط
    socket.on('seat-pair-reaction-played', ({ roomId, fromSeat, toSeat, emoji }) => {
        if (roomId !== currentVoiceRoomId) return;
        playSeatPairReaction(fromSeat, toSeat, emoji);
    });

    socket.on('room-force-closed', ({ roomId }) => {
        if (roomId !== currentVoiceRoomId || currentRoomMyRole === 'host') return;
        showNotification('تم قفل الغرفة من المضيف وطرد الجميع', 'warning');
        showRoomBrowserView();
    });

    // ✅ نقاط دعم الغرفة تحدّثت (هدية أُرسلت بداخلها) — تحديث صامت للشارة، بلا إشعار مزعج
    // على كل هدية (سيصل غالباً بمعدل عالٍ بغرفة نشطة). المستوى نفسه له حدث احتفالي منفصل أدناه
    socket.on('room-support-points-updated', ({ roomId, supportPoints, sessionSupportPoints, level, pointsToNextLevel, levelProgressPercent }) => {
        if (roomId !== currentVoiceRoomId) return;
        currentRoomSupportPoints = supportPoints;
        if (typeof sessionSupportPoints === 'number') currentRoomSessionSupportPoints = sessionSupportPoints;
        currentRoomLevel = level;
        currentRoomPointsToNextLevel = pointsToNextLevel;
        currentRoomLevelProgressPercent = levelProgressPercent;
        updateRoomLevelBadgeUI();
        updateRoomLevelProgressUI();
        updateRoomSessionSupportUI();
    });

    // ✅ ارتفع مستوى الغرفة فعلياً — احتفال بصري للجميع بالغرفة + تحديث فوري لخيارات توسيع
    // المقاعد المتاحة بنافذة إعدادات المضيف (لو كانت مفتوحة بنفس اللحظة)
    socket.on('room-leveled-up', ({ roomId, newLevel, unlockedSeatCounts }) => {
        if (roomId !== currentVoiceRoomId) return;
        currentRoomLevel = newLevel;
        currentRoomUnlockedSeatCounts = unlockedSeatCounts;
        updateRoomLevelBadgeUI();
        updateRoomLevelProgressUI();
        celebrateRoomLevelUp(newLevel);
    });

    // 🐛 إصلاح: تغيير عدد المقاعد كان يتطلب خروجاً وعودة لرؤيته — الآن يصل فوراً للجميع
    // بالغرفة ويُعاد رسم الشبكة بالعدد الجديد بلا أي حاجة لإعادة فتح الغرفة يدوياً
    socket.on('room-seat-count-updated', async ({ roomId, seatCount }) => {
        if (roomId !== currentVoiceRoomId) return;
        renderVoiceRoomSeats(roomId, seatCount, 0, false);
        await fetchAndRenderVoiceSnapshot(roomId, currentRoomPassword);
        if (currentRoomMyRole !== 'host') {
            showBottomToast(`عدد المقاعد صار ${seatCount} الآن`, 'fa-chair');
        }
    });

    // ✅ طردني المضيف/مسؤول من الغرفة بالكامل — إخراج فوري لقائمة التصفح مع رسالة واضحة
    socket.on('you-were-kicked-from-room', ({ roomId, userId }) => {
        if (userId !== myUserId) return;
        if (roomId === currentVoiceRoomId) {
            showNotification('تم طردك من هذي الغرفة من قِبل الإدارة', 'error');
            showRoomBrowserView();
        }
    });

    // ✅ تأكيد إلغاء طرد (يصل للمضيف/المسؤول نفسه فقط) — يحدّث قائمة المطرودين بنافذة الإعدادات لو مفتوحة
    socket.on('room-user-unkicked', ({ roomId, userId }) => {
        if (roomId !== currentVoiceRoomId) return;
        currentRoomKickedUsers = currentRoomKickedUsers.filter(u => u.id !== userId);
        renderKickedUsersListUI();
    });

    // ✅ يصل فقط لمن هو منضم فعلياً لقناة دردشة هذي الغرفة (بث مخصص، وليس عاماً)
    socket.on('room-music-state', (state) => {
        applyMusicState(state);
    });

    // ✅ غلاف الغرفة يتحدّث فوراً عند الجميع بلحظة تغييره من المضيف — بدون هذا كان الغلاف
    // القديم يبقى ظاهراً عند كل من بالغرفة غير المضيف حتى يعيدوا فتحها يدوياً
    socket.on('room-cover-updated', ({ roomId, coverImage }) => {
        if (!coverImage) return;
        if (roomId === currentVoiceRoomId) {
            currentRoomCoverImage = coverImage;
            const headerCoverEl = document.getElementById('room-info-cover-img');
            if (headerCoverEl) headerCoverEl.src = coverImage;
            const infoCardCoverEl = document.querySelector('#room-info-card .room-info-card-cover');
            if (infoCardCoverEl) infoCardCoverEl.src = coverImage;
        }
        if (minimizedRoomInfo && minimizedRoomInfo.id === roomId) {
            minimizedRoomInfo.coverImage = coverImage;
            const bubbleImg = document.querySelector('.room-minimized-bubble-img');
            if (bubbleImg) bubbleImg.src = coverImage;
        }
    });

    // ✅ آلية دلالة أخطاء لمشغّل الموسيقى — أي رفض من السيرفر (صلاحية، رابط غير صالح...)
    // يظهر بالكونسول فوراً بدل الفشل الصامت، بالإضافة لتنبيه بسيط لمن يحاول التحكّم
    socket.on('room-music-error', (message) => {
        console.error('[MUSIC]', message);
        showNotification(message, 'error');
    });

    socket.on('seat-reaction-played', ({ roomId, seatNumber, emoji }) => {
        if (roomId !== currentVoiceRoomId) return;
        playSeatReaction(seatNumber, emoji);
    });

    socket.on('room-support-updated', ({ roomId, seatNumber, value }) => {
        if (roomId !== currentVoiceRoomId) return;
        const voiceGrid = document.getElementById('voice-chat-grid');
        if (!voiceGrid) return;
        const seatEl = voiceGrid.querySelector(`.voice-seat[data-seat="${seatNumber}"]`);
        if (!seatEl) return;
        const updated = (parseInt(seatEl.dataset.supportTotal) || 0) + value;
        seatEl.dataset.supportTotal = updated;
        let badge = seatEl.querySelector('.seat-support-badge');
        if (!badge) {
            badge = document.createElement('span');
            badge.className = 'seat-support-badge';
            seatEl.appendChild(badge);
        }
        badge.textContent = updated > 9999 ? '9999+' : updated;
    });

    socket.on('seat-error', (message) => {
        clearVoiceSeatPending();
        showNotification(message, 'error');
    });

    socket.on('room-chat-error', (message) => {
        showNotification(message, 'error');
    });

    socket.on('connect_error', (err) => {
        console.error('Socket Connection Error:', err.message);
        if (err.message === 'Authentication error') {
            performLogout();
        }
    });

    // ✅ نافذة انقطاع الشبكة — تظهر عند فقدان الاتصال، وتختفي تلقائياً عند العودة
    let offlineModalTimer = null;
    function showOfflineModal() {
        if (document.getElementById('offline-modal')) return;
        offlineModalTimer = setTimeout(() => {
            const html = `
                <div id="offline-modal" class="fixed inset-0 bg-black/90 flex items-center justify-center z-[1000] p-4">
                    <div class="bg-gray-800 rounded-2xl shadow-2xl w-full max-w-xs text-white text-center p-6 border border-red-500/30">
                        <i class="fas fa-wifi-slash fa-2x text-red-400 mb-3" style="opacity:.9"></i>
                        <p class="font-bold mb-1">لا يوجد اتصال بالإنترنت</p>
                        <p class="text-xs text-gray-400 mb-4">جاري محاولة إعادة الاتصال تلقائياً...</p>
                        <div class="w-6 h-6 border-2 border-purple-400 border-t-transparent rounded-full animate-spin mx-auto"></div>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', html);
        }, 2500); // تأخير بسيط لتفادي وميض عند انقطاع خفيف جداً (أقل من ثانيتين)
    }
    function hideOfflineModal() {
        clearTimeout(offlineModalTimer);
        document.getElementById('offline-modal')?.remove();
    }
    socket.on('disconnect', showOfflineModal);
    socket.io.on('reconnect', () => { hideOfflineModal(); refreshUserData(); });
    window.addEventListener('offline', showOfflineModal);
    window.addEventListener('online', hideOfflineModal);

    // ✅ حظر لحظي: إذا حظرك الأدمن الآن وأنت متصل، تظهر النافذة فوراً بدل انتظار أي طلب لاحق
    socket.on('account-banned', ({ reason, banExpires, isPermanent }) => {
        showBannedModal(reason, banExpires, isPermanent);
    });

    // ✅ نكزة وصلتني من شخص آخر — إشعار لحظي بسيط، لا حاجة لأي حالة محفوظة
    socket.on('user-poked', ({ fromUsername }) => {
        showBottomToast(`${fromUsername || 'شخص ما'} نكزك 👋`, 'fa-hand-point-up');
    });

socket.on('publicGiftAnnouncement', (data) => {
    const existing = document.querySelectorAll('.public-gift-toast');
    // ✅ حد أقصى 2 إشعارات متراكبة بنفس اللحظة لتفادي الفوضى البصرية عند إرسال سريع متتالي
    if (existing.length >= 2) existing[0].remove();

    const giftVisual = data.giftImage
        ? `<img src="${data.giftImage}" class="w-6 h-6 object-contain" onerror="this.style.display='none'">`
        : `<span class="text-lg">${data.giftIcon || '🎁'}</span>`;

    const toast = document.createElement('div');
    toast.className = 'public-gift-toast fixed left-1/2 -translate-x-1/2 z-[350] pointer-events-none';
    toast.style.top = `${80 + existing.length * 50}px`;
    toast.innerHTML = `
        <div class="flex items-center gap-2 bg-gradient-to-r from-pink-600/90 to-purple-600/90 border border-pink-400/40 rounded-full px-4 py-2 text-xs shadow-lg backdrop-blur-sm">
            <img src="${data.senderProfileImage}" class="w-5 h-5 rounded-full">
            ${giftVisual}
            <span><b>${data.senderUsername}</b> أرسل ${data.giftName} 🎉 ${data.audienceText}</span>
        </div>
    `;
    document.body.appendChild(toast);

    // ✅ يختفي تلقائياً بعد 4 ثوانٍ بتأثير انسيابي
    setTimeout(() => {
        toast.style.transition = 'opacity 0.6s, transform 0.6s';
        toast.style.opacity = '0';
        toast.style.transform = 'translate(-50%, -15px)';
        setTimeout(() => toast.remove(), 600);
    }, 4000);
});

        socket.on('chatFullyDeleted', (data) => {
    const openChat = document.getElementById('private-chat-modal');
    if (openChat && openChat.dataset.targetUserId === data.byUserId) {
        openChat.remove();
        showNotification('تم حذف هذه المحادثة من الطرف الآخر', 'info');
    }
    if (document.getElementById('messages-list-container')) {
        loadMessagesList();
    }
});

        socket.on('privateMessageDeleted', ({ messageId }) => {
    const el = document.querySelector(`[data-message-id="${messageId}"]`);
    if (el) el.remove();
});

socket.on('privateMessageEdited', ({ messageId, newContent }) => {
    const el = document.querySelector(`[data-message-id="${messageId}"] .message-content p`);
    if (el) el.innerHTML = `${newContent} <span class="text-[10px] text-gray-400">(معدّلة)</span>`;
});
  
        
    // 📍 أضف هذا المستمع بعد socket.on('forceRefreshUserData', ...)

// 5️⃣ تحديث البروفايل المصغر عند رفع الحظر
socket.on('profileNeedsRefresh', async (data) => {
    console.log('[SOCKET] Profile needs refresh:', data);
    
    // 1. تحديث بيانات المستخدم
    await refreshUserData();
    
    // 2. إذا كانت نافذة البروفايل المصغر مفتوحة لهذا المستخدم
    const modal = document.getElementById('mini-profile-modal');
    if (modal) {
        const currentUserId = modal.dataset.userId;
        
        // إذا كانت النافذة مفتوحة لنفس المستخدم الذي تم رفع الحظر عنه
        if (currentUserId && currentUserId === data.userId) {
            console.log(`[PROFILE REFRESH] Refreshing profile for user ${data.userId}`);
            
            // إغلاق النافذة الحالية
            modal.remove();
            
            // فتح نافذة جديدة بالمعلومات المحدثة (بعد تأخير)
            setTimeout(() => {
                showMiniProfileModal(data.userId);
            }, 300);
        }
    }
});

// 6️⃣ حدث خاص لرفع الحظر من الإعدادات
socket.on('unblockedFromSettings', (data) => {
    console.log('[SOCKET] Unblocked from settings:', data);
    
    // إشعار فوري
    showNotification(`تم رفع الحظر عن ${data.unblockedUsername}`, 'success');
    
    // تحديث البيانات
    setTimeout(() => {
        refreshUserData();
        
        // إذا كان البروفايل مفتوحاً، أعد تحميله
        const profileModal = document.getElementById('mini-profile-modal');
        if (profileModal && profileModal.dataset.userId === data.unblockedId) {
            const userId = profileModal.dataset.userId;
            profileModal.remove();
            setTimeout(() => showMiniProfileModal(userId), 400);
        }
    }, 500);
});    
        
        // --- أضف هذه المستمعات الجديدة ---

// --- استبدل مستمع experienceUpdate بهذا ---
socket.on('experienceUpdate', ({ level, experience, requiredXp, xpGained }) => {
    // عرض أنيميشن اكتساب الخبرة
    showXpGainAnimation(xpGained);

    // ✅ الإصلاح: هذه هي العناصر الحقيقية الموجودة في index.html
    // (لم يكن هناك عنصر بمعرف #level-container أصلاً، لذا لم تتحدث الأرقام إلا بعد تحديث الصفحة)
    const levelSpan = document.getElementById('userLevel');
    const currentXpSpan = document.getElementById('currentXP');
    const requiredXpSpan = document.getElementById('requiredXP');
    const xpBar = document.getElementById('xp-bar');

    if (levelSpan) levelSpan.textContent = level;
    if (currentXpSpan) currentXpSpan.textContent = Math.floor(experience);
    if (requiredXpSpan) requiredXpSpan.textContent = requiredXp;
    if (xpBar) xpBar.style.width = `${Math.min((experience / requiredXp) * 100, 100)}%`;

    // تحديث بيانات المستخدم في localStorage
    const localUser = JSON.parse(localStorage.getItem('user'));
    if (localUser) {
        localUser.level = level;
        localUser.experience = experience;
        localStorage.setItem('user', JSON.stringify(localUser));
    }
});

socket.on('levelUp', ({ newLevel }) => {
    // عرض إشعار مميز عند رفع المستوى
    showNotification(`🎉 تهانينا! لقد وصلت إلى المستوى ${newLevel}!`, 'success');
    
    // يمكنك إضافة أنيميشن أو تأثيرات خاصة هنا
    const profileImage = document.getElementById('profileImage');
    if (profileImage) {
        profileImage.classList.add('animate-bounce');
        setTimeout(() => profileImage.classList.remove('animate-bounce'), 2000);
    }
});
        


    // ✅ مؤشرات الكتابة/التسجيل/الاتصال — نمط واتساب
        // ✅ دالة موحّدة لاستعادة نص "متصل الآن / آخر ظهور" بدل تركه فارغاً
    function restoreOnlineStatusDisplay() {
        const chatModal = document.getElementById('private-chat-modal');
        const statusEl = document.getElementById('chat-user-status');
        if (!chatModal || !statusEl) return;
        const isOnline = chatModal.dataset.otherUserOnline === 'true';
        const lastActive = chatModal.dataset.otherUserLastActive;
        statusEl.innerHTML = isOnline
            ? '<i class="fas fa-circle text-green-500 mr-1" style="font-size:8px;"></i> متصل الآن'
            : formatLastSeen(lastActive);
    }

    let typingIndicatorTimeout = null;
    socket.on('userTyping', ({ userId, isTyping }) => {
        const chatModal = document.getElementById('private-chat-modal');
        if (!chatModal || chatModal.dataset.targetUserId !== userId) return;
        const statusEl = document.getElementById('chat-user-status');
        if (!statusEl) return;
        clearTimeout(typingIndicatorTimeout);
        if (isTyping) {
            statusEl.innerHTML = '<span class="text-purple-400"><i class="fas fa-pen"></i> يكتب الآن...</span>';
            typingIndicatorTimeout = setTimeout(restoreOnlineStatusDisplay, 4000);
        } else {
            restoreOnlineStatusDisplay();
        }
    });

    socket.on('userRecordingVoice', ({ userId, isRecording }) => {
        const chatModal = document.getElementById('private-chat-modal');
        if (!chatModal || chatModal.dataset.targetUserId !== userId) return;
        const statusEl = document.getElementById('chat-user-status');
        if (!statusEl) return;
        if (isRecording) statusEl.innerHTML = '<span class="text-red-400"><i class="fas fa-microphone"></i> يسجل رسالة صوتية...</span>';
        else restoreOnlineStatusDisplay();
    });

    socket.on('userOnlineStatus', ({ userId, isOnline, lastActive }) => {
        const chatModal = document.getElementById('private-chat-modal');
        if (chatModal && chatModal.dataset.targetUserId === userId) {
            const statusEl = document.getElementById('chat-user-status');
            if (statusEl) statusEl.innerHTML = isOnline ? '<i class="fas fa-circle text-green-500 mr-1" style="font-size:8px;"></i> متصل الآن' : formatLastSeen(lastActive);
        }
    });

        socket.on('coinsUpdated', ({ newCoins }) => {
    const coinsEl = document.getElementById('coins');
    if (coinsEl) coinsEl.textContent = newCoins;
    const localUser = JSON.parse(localStorage.getItem('user'));
    if (localUser) {
        localUser.coins = newCoins;
        localStorage.setItem('user', JSON.stringify(localUser));
    }
    // ✅ تمت إزالة إشعار "تم إيداع رصيدك بنجاح" — تحديث الرقم بالهيدر كافٍ
});

    socket.on('giftReceived', (data) => {
    // ✅ التفاصيل النصية تصل الآن عبر البوت (رسالة دائمة)، والأنيميشن العائمة فقط للحظة اللحظية أثناء المشاهدة
    const chatModal = document.getElementById('private-chat-modal');
    const isViewingThatChat = chatModal && chatModal.dataset.targetUserId === data.fromUserId;
    if (isViewingThatChat) {
        showGiftFloatingAnimation(data.giftImage, data.giftName, data.fromUsername, data.quantity);
    }
    refreshUserData();
});

// =================================================
// ✅ مستمعات لتحديث البيانات تلقائياً عند الحظر
// =================================================

// 1️⃣ تحديث عند استلام إشعار حظر
socket.on('friendshipUpdate', async (data) => {
    console.log('[SOCKET] Friendship update received:', data);
    
    // ⭐ الحالة 1: إذا كان الحدث متعلقاً برفع الحظر
    if (data.action === 'user_unblocked' || data.action === 'unblocked_by_user') {
        // تحديث البيانات فوراً
        await refreshUserData();
        
        // إذا كانت نافذة البروفايل مفتوحة، أعد تحميلها
        const modal = document.getElementById('mini-profile-modal');
        const userIdInModal = modal?.dataset.userId;
        
        if (modal && userIdInModal) {
            if (userIdInModal === data.unblockedId || userIdInModal === data.unblockerId) {
                setTimeout(() => {
                    showMiniProfileModal(userIdInModal);
                }, 500);
            }
        }
        
        // إشعار للمستخدم
        showNotification(data.message || 'تم رفع الحظر', 'success');
    }
    
    // ⭐ الحالة 2: إذا كان الحدث متعلقاً بالحظر
    else if (data.action && data.action.includes('block')) {
        // تحديث البيانات فوراً
        await refreshUserData();
        
        // إشعار للمستخدم
        if (data.forUser === 'blocker') {
            showNotification(`تم حظر ${data.blockedUsername}`, 'info');
        } else if (data.forUser === 'blocked') {
            showNotification(`قام ${data.blockerUsername} بحظرك`, 'error');
        }
    }
    
    // ⭐ الحالة 3: إذا كان الحدث متعلقاً بالصداقة
    else if (data.action && (data.action.includes('friend') || data.action.includes('request'))) {
        // تحديث البيانات للصداقة
        await refreshUserData();
        
        // إشعار عام
        if (data.message) {
            showNotification(data.message, 'info');
        }
    }
});

// 2️⃣ حدث خاص لتحديث البيانات القسري
socket.on('forceRefreshUserData', async (data) => {
    console.log('[SOCKET] Force refreshing user data:', data);
    
    // تأخير بسيط لضمان تحديث الخادم أولاً
    setTimeout(async () => {
        try {
            // تحديث البيانات من الخادم
            const success = await refreshUserData();
            
            if (success) {
                console.log('[SOCKET] User data refreshed after block');
                
                // جلب البيانات المحدثة مباشرة
                const user = JSON.parse(localStorage.getItem('user'));
                if (user && user.friends !== undefined) {
                    
                    // تحديث عدد الأصدقاء في الشريط الجانبي
                    const friendsCountElement = document.getElementById('friends-count');
                    if (friendsCountElement) {
                        friendsCountElement.textContent = user.friends.length;
                        console.log(`[SOCKET] Updated friends count to: ${user.friends.length}`);
                    }
                    
                    // تحديث صور الأصدقاء المصغرة
                    if (typeof updateFriendsAvatars === 'function') {
                        updateFriendsAvatars(user.friends);
                    }
                }
            }
        } catch (error) {
            console.error('[SOCKET] Error in forceRefreshUserData:', error);
        }
    }, 800); // انتظر 0.8 ثانية
});

// 3️⃣ الاحتفاظ بالمستمع القديم للتوافق
socket.on('blockStatusChanged', async (data) => {
    console.log('[SOCKET] Block status changed (legacy):', data);
    await refreshUserData();
});

// 4️⃣ مستمع عام لتنظيف cache (إبقائه)
socket.on('clearBlockCache', (data) => {
    console.log('[SOCKET] Clearing block cache for:', data);
    // لا تحتاج لعمل شيء هنا، الخادم يعتني بالcache
});

// ⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐
// 📍 5️⃣ مستمع جديد لحدث رفع الحظر (أضف هذا)
// ⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐
socket.on('userUnblocked', async (data) => {
    console.log('[SOCKET] User unblocked event:', data);
    
    // 1. إشعار فوري
    if (data.forUser === 'unblocker') {
        showNotification(`تم رفع الحظر عن ${data.unblockedUsername}`, 'success');
    } else if (data.forUser === 'unblocked') {
        showNotification(`${data.unblockerUsername} رفع الحظر عنك`, 'info');
    }
    
    // 2. تحديث البيانات من الخادم بعد تأخير بسيط
    setTimeout(async () => {
        await refreshUserData();
        
        // 3. إذا كانت نافذة البروفايل مفتوحة للمستخدم، أعد تحميلها
        const modal = document.getElementById('mini-profile-modal');
        if (modal) {
            const userIdInModal = modal.dataset.userId;
            if (userIdInModal && (userIdInModal === data.unblockedId || userIdInModal === data.unblockerId)) {
                setTimeout(() => {
                    showMiniProfileModal(userIdInModal);
                }, 300);
            }
        }
        
        // 4. إذا كانت نافذة الإعدادات مفتوحة، تحديث قائمة المحظورين
        const settingsView = document.querySelector('[class*="settings"]');
        if (settingsView) {
            const currentView = mainContent.innerHTML;
            if (currentView.includes('المستخدمين المحظورين')) {
                setTimeout(() => {
                    showSettingsView();
                }, 400);
            }
        }
        
    }, 500);
});
// ⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐
// 📍 نهاية المستمع الجديد
// ⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐

// --- أضف هذا الكود في قسم أحداث السوكيت العام ---
socket.on('chatCleanup', ({ idsToDelete }) => {
    console.log(`[CHAT CLIENT] Received 'chatCleanup' event. Deleting ${idsToDelete.length} message elements.`);
    const chatMessages = document.getElementById('chat-messages');
    if (!chatMessages) return;

    // حول كل الرسائل الموجودة إلى مصفوفة
    const messageElements = Array.from(chatMessages.children);

    // احذف كل عنصر رسالة يتطابق الـ ID الخاص به مع قائمة الحذف
    messageElements.forEach(element => {
        // نفترض أن كل عنصر رسالة له data-message-id
        if (idsToDelete.includes(element.dataset.messageId)) {
            element.remove();
        }
    });
});


        socket.on('withdrawalStatusUpdated', (data) => {
    if (data.status === 'completed') {
        showNotification('تمت الموافقة على طلب سحبك بنجاح ✅', 'success');
    } else if (data.status === 'rejected') {
        showNotification(`تم رفض طلب السحب. السبب: ${data.reason}`, 'error');
        refreshUserData();
    }
});


   // --- ✅ دالة جديدة لنافذة التأكيد ---
function showConfirmationModal(message, onConfirm) {
    const oldModal = document.getElementById('confirmation-modal');
    if (oldModal) oldModal.remove();

    const modalHTML = `
        <div id="confirmation-modal" class="fixed inset-0 bg-black/70 flex items-center justify-center z-[500] p-4">
            <div class="bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm text-white p-6 text-center">
                <p class="mb-6">${message}</p>
                <div class="flex justify-center gap-4">
                    <button id="confirm-btn" class="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-6 rounded-lg">تأكيد</button>
                    <button id="cancel-btn" class="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-6 rounded-lg">إلغاء</button>
                </div>
            </div>
        </div>
    `;
    
    // ✅ الإصلاح الجذري: insertAdjacentHTML لا يهدم أي نافذة أخرى مفتوحة (دردشة، شحن، سحب...)
    // بعكس innerHTML += التي كانت تعيد بناء كل عناصر game-container وتفقدها كل مستمعات الأحداث
    document.getElementById('game-container').insertAdjacentHTML('beforeend', modalHTML);

    const modal = document.getElementById('confirmation-modal');
    const confirmBtn = document.getElementById('confirm-btn');
    const cancelBtn = document.getElementById('cancel-btn');

    const closeModal = () => modal.remove();

    confirmBtn.addEventListener('click', () => {
        onConfirm();
        closeModal();
    });
    cancelBtn.addEventListener('click', closeModal);
    
    modal.addEventListener('click', (e) => {
        if (e.target.id === 'confirmation-modal') closeModal();
    });
}


// --- ✅ دالة جديدة للإشعار العائم ---
function showFloatingAlert(message, icon = 'fa-check-circle', color = 'bg-green-500') {
    const alertElement = document.createElement('div');
    alertElement.innerHTML = `<i class="fas ${icon} mr-2"></i> ${message}`;
    alertElement.className = `floating-alert fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 ${color}/80 text-white font-bold px-4 py-2 rounded-full shadow-lg z-[600]`;
    
    document.body.appendChild(alertElement);

    setTimeout(() => {
        alertElement.remove();
    }, 1900);
}

// ✅ إشعار عائم من أسفل الشاشة — بالضبط أسلوب Toast تطبيقات الجوال (Android/iOS)، بعكس
// showNotification/showFloatingAlert اللتين تظهران أعلى/منتصف الشاشة. يُكدَّس فوق بعضه لو
// وصل أكثر من إشعار بنفس اللحظة بدل أن يتراكب ويُخفي بعضه بعضاً
function showBottomToast(message, icon = 'fa-info-circle') {
    const stacked = document.querySelectorAll('.bottom-toast').length;
    const el = document.createElement('div');
    el.className = 'bottom-toast';
    el.style.setProperty('--toast-offset', `${stacked * 52}px`);
    el.innerHTML = `<i class="fas ${icon}"></i><span>${escapeHtml(message)}</span>`;
    document.body.appendChild(el);
    setTimeout(() => {
        el.style.opacity = '0';
        el.style.transform = 'translate(-50%, 16px)';
        setTimeout(() => el.remove(), 300);
    }, 3600);
}

        // --- ✅ دالة جديدة: عرض ملفي الشخصي (مختصر) من قائمة "المزيد" ---
// ✅ تخمين تقريبي "للموقع الحالي" من المنطقة الزمنية بالمتصفح — بلا أي طلب صلاحية GPS ولا
// استدعاء خدمة خارجية (خصوصية أفضل، صفر اعتمادية شبكة). تقريبي عمداً — يكفي لعرض "بلد/منطقة"
// عامة بالملف الشخصي، وليس موقعاً دقيقاً
function guessLocationFromTimezone() {
    try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
        const map = {
            'Asia/Amman': 'الأردن', 'Asia/Riyadh': 'السعودية', 'Asia/Dubai': 'الإمارات',
            'Asia/Kuwait': 'الكويت', 'Asia/Qatar': 'قطر', 'Asia/Bahrain': 'البحرين',
            'Asia/Baghdad': 'العراق', 'Asia/Damascus': 'سوريا', 'Asia/Beirut': 'لبنان',
            'Asia/Jerusalem': 'فلسطين', 'Asia/Gaza': 'فلسطين', 'Asia/Hebron': 'فلسطين',
            'Africa/Cairo': 'مصر', 'Africa/Tripoli': 'ليبيا', 'Africa/Tunis': 'تونس',
            'Africa/Algiers': 'الجزائر', 'Africa/Casablanca': 'المغرب', 'Africa/Khartoum': 'السودان',
            'Asia/Aden': 'اليمن', 'Asia/Muscat': 'عُمان'
        };
        return map[tz] || '';
    } catch (e) { return ''; }
}

// ✅ مركز الملف الشخصي (Profile Hub) — إعادة هيكلة كاملة تحل محل البطاقة الصغيرة القديمة:
// غلاف + صورة متراكبة، اسم/آيدي/جنس/عمر/موقع، متابعون/متابَعون/دعم مُستلَم، محفظة حقيقية،
// خصائص "قريباً" (VIP/مركز صنّاع المحتوى/مركز الألعاب)، مركز مضيف بإحصائيات حقيقية حالية،
// تعديل + اكتشاف أشخاص، وقسم إعدادات مضغوط (يبقى الإعدادات الكاملة الحالية بمكانها المستقل)
async function showMyProfileHub() {
    document.getElementById('my-profile-modal')?.remove(); // ✅ تنظيف أي نسخة قديمة من الاسم السابق للدالة لو بقيت بالذاكرة من كاش قديم
    document.getElementById('profile-hub-page')?.remove();

    const shellHTML = `
        <div id="profile-hub-page" class="profile-hub-backdrop">
            <div id="profile-hub-sheet" class="profile-hub-sheet">
                <div class="profile-hub-topbar">
                    <button id="close-profile-hub" class="profile-hub-icon-btn" title="إغلاق"><i class="fas fa-times"></i></button>
                    <div class="flex-1"></div>
                    <button id="profile-hub-clock-btn" class="profile-hub-icon-btn" title="قريباً"><i class="fas fa-clock"></i></button>
                    <button id="profile-hub-visitors-btn" class="profile-hub-icon-btn" title="زوّار ملفي"><i class="fas fa-eye"></i></button>
                    <button id="profile-hub-more-btn" class="profile-hub-icon-btn" title="المزيد"><i class="fas fa-ellipsis-h"></i></button>
                </div>
                <div id="profile-hub-body" class="profile-hub-body">
                    <div class="text-center text-gray-400 py-20"><i class="fas fa-spinner fa-spin text-2xl"></i></div>
                </div>
            </div>
        </div>
    `;
    document.getElementById('game-container').insertAdjacentHTML('beforeend', shellHTML);
    const page = document.getElementById('profile-hub-page');
    document.getElementById('close-profile-hub').addEventListener('click', () => page.remove());
    document.getElementById('profile-hub-clock-btn').addEventListener('click', () => showNotification('هذه الخاصية قريباً 🕐', 'info'));
    document.getElementById('profile-hub-visitors-btn').addEventListener('click', () => showProfileVisitorsSheet());
    document.getElementById('profile-hub-more-btn').addEventListener('click', () => showProfileHubMoreMenu());

    try {
        const response = await fetch('/api/users/me/details', { headers: { 'Authorization': `Bearer ${token}` } });
        const result = await response.json();
        if (!response.ok || result.status !== 'success') throw new Error();
        const u = result.data.user;
        localStorage.setItem('user', JSON.stringify(u)); // ✅ يبقي النسخة المحلية محدَّثة (نفس ما تفعله refreshUserData)

        // ✅ يحفظ موقعاً مخمَّناً تلقائياً أول مرة فقط (لو الحقل فاضي) — لا يُعيد الكتابة فوق اختيار المستخدم لاحقاً
        if (!u.location) {
            const guess = guessLocationFromTimezone();
            if (guess) {
                fetch('/api/users/updateProfile', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ location: guess })
                }).catch(() => {});
                u.location = guess;
            }
        }

        renderProfileHubBody(u);
    } catch (error) {
        console.error('[PROFILE HUB] Error:', error);
        const body = document.getElementById('profile-hub-body');
        if (body) body.innerHTML = '<div class="text-center text-red-400 py-16">تعذر تحميل ملفك الشخصي</div>';
    }

    page.addEventListener('click', (e) => { if (e.target.id === 'profile-hub-page') page.remove(); });
}

function renderProfileHubBody(u) {
    const body = document.getElementById('profile-hub-body');
    if (!body) return;
    const genderInfo = u.gender === 'male' ? { text: 'ذكر', icon: 'fa-mars', color: 'text-blue-400' } : { text: 'أنثى', icon: 'fa-venus', color: 'text-pink-400' };
    const age = (() => {
        if (!u.birthDate) return null;
        const today = new Date(); const bd = new Date(u.birthDate);
        let a = today.getFullYear() - bd.getFullYear();
        const m = today.getMonth() - bd.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < bd.getDate())) a--;
        return a;
    })();

    body.innerHTML = `
        <div class="profile-hub-cover" style="${u.coverImage ? `background-image:url('${u.coverImage}')` : ''}">
            <img src="${u.profileImage}" class="profile-hub-avatar ${u.activeFrameClass || ''}">
        </div>
        <div class="profile-hub-identity">
            <h2 class="profile-hub-name">${escapeHtml(u.username || '')} ${getAgentBadgeHTML(u.isAgent)}</h2>
            <p class="profile-hub-id">ID: ${escapeHtml(String(u.customId || ''))}</p>
            <div class="profile-hub-badge-row">
                <span class="profile-hub-mini-badge"><i class="fas ${genderInfo.icon} ${genderInfo.color}"></i> ${genderInfo.text}</span>
                ${age !== null ? `<span class="profile-hub-mini-badge"><i class="fas fa-birthday-cake text-pink-400"></i> ${age} سنة</span>` : ''}
                ${u.location ? `<span class="profile-hub-mini-badge"><i class="fas fa-location-dot text-emerald-400"></i> ${escapeHtml(u.location)}</span>` : ''}
            </div>
        </div>

        <div class="profile-hub-stats-row">
            <button type="button" class="profile-hub-stat" id="profile-hub-followers-stat"><span class="profile-hub-stat-num">${(u.followers || []).length}</span><span class="profile-hub-stat-label">متابِعون</span></button>
            <button type="button" class="profile-hub-stat" id="profile-hub-following-stat"><span class="profile-hub-stat-num">${(u.following || []).length}</span><span class="profile-hub-stat-label">متابَعون</span></button>
            <div class="profile-hub-stat" id="profile-hub-coins-received-stat"><span class="profile-hub-stat-num">…</span><span class="profile-hub-stat-label">كوينز مُستلَمة</span></div>
        </div>

        ${u.showWallet !== false ? `
        <div class="profile-hub-wallet-card">
            <div class="profile-hub-wallet-icon"><i class="fas fa-wallet"></i></div>
            <div class="flex-1 min-w-0">
                <p class="profile-hub-wallet-title">محفظتي</p>
                <p class="profile-hub-wallet-sub"><i class="fas fa-coins text-yellow-400"></i> ${(u.coins || 0).toLocaleString('en-US')} كوينز &nbsp;•&nbsp; <i class="fas fa-dollar-sign text-green-400"></i> ${(u.balance || 0).toFixed(2)}</p>
            </div>
            <button id="profile-hub-wallet-btn" class="profile-hub-wallet-action">استبدال / شراء</button>
        </div>` : ''}

        <div class="profile-hub-feature-grid">
            ${u.showVipBadge !== false ? `
            <button class="profile-hub-feature-tile" id="profile-hub-vip-btn">
                <i class="fas fa-crown" style="color:#fbbf24"></i>
                <span>VIP</span>
                <span class="profile-hub-soon-tag">قريباً</span>
            </button>` : ''}
            <button class="profile-hub-feature-tile" id="profile-hub-creator-btn">
                <i class="fas fa-star" style="color:#c084fc"></i>
                <span>مركز صنّاع المحتوى</span>
                <span class="profile-hub-soon-tag">قريباً</span>
            </button>
            <button class="profile-hub-feature-tile" id="profile-hub-games-btn">
                <i class="fas fa-gamepad" style="color:#60a5fa"></i>
                <span>مركز الألعاب</span>
                <span class="profile-hub-soon-tag">قريباً</span>
            </button>
            <button class="profile-hub-feature-tile" id="profile-hub-host-center-btn">
                <i class="fas fa-microphone-lines" style="color:#f472b6"></i>
                <span>مركز المضيف</span>
            </button>
        </div>

        <div class="profile-hub-actions-row">
            <button id="profile-hub-edit-btn" class="profile-hub-action-btn profile-hub-action-primary"><i class="fas fa-pen"></i> تحرير</button>
            <button id="profile-hub-discover-btn" class="profile-hub-action-btn profile-hub-action-secondary"><i class="fas fa-user-plus"></i> اقتراحات</button>
        </div>

        <div class="profile-hub-section-title"><i class="fas fa-cog"></i> الإعدادات</div>
        <div class="profile-hub-settings-list">
            <button class="profile-hub-settings-row" id="profile-hub-full-settings-btn"><i class="fas fa-user-cog"></i><span>الحساب والخصوصية والمزيد</span><i class="fas fa-chevron-left profile-hub-chevron"></i></button>
            ${['عام', 'التنبيهات', 'اللغة', 'ذاكرة نظيفة', 'جودة الفيديو', 'مفضّلة'].map(label => `
                <button class="profile-hub-settings-row profile-hub-settings-soon" data-label="${label}"><i class="fas fa-circle-notch"></i><span>${label}</span><span class="profile-hub-soon-tag">قريباً</span></button>
            `).join('')}
        </div>
        <div class="profile-hub-section-title"><i class="fas fa-info-circle"></i> نبذة</div>
        <div class="profile-hub-settings-list">
            ${['السياسات والقوانين', 'الدعم والمساعدة', 'حولنا'].map(label => `
                <button class="profile-hub-settings-row profile-hub-settings-soon" data-label="${label}"><i class="fas fa-circle-notch"></i><span>${label}</span><span class="profile-hub-soon-tag">قريباً</span></button>
            `).join('')}
        </div>
        <div class="profile-hub-settings-list">
            <button id="profile-hub-logout-btn" class="profile-hub-settings-row profile-hub-logout-row"><i class="fas fa-sign-out-alt"></i><span>تسجيل الخروج</span></button>
        </div>
        <p class="profile-hub-version">الإصدار 1.0.0 — مدعوم من abn.7alp</p>
    `;

    // ✅ كوينز مُستلَمة — إعادة استخدام ملخص الهدايا الموجود أصلاً (نفس مصدر قسم "هداياي المستلمة" بالإعدادات)
    fetch(`/api/gifts/user/${u._id}/summary`, { headers: { 'Authorization': `Bearer ${token}` } })
        .then(r => r.json())
        .then(res => {
            const el = document.querySelector('#profile-hub-coins-received-stat .profile-hub-stat-num');
            if (el && res.status === 'success') el.textContent = (res.data.totalCoinsValue || 0).toLocaleString('en-US');
        })
        .catch(() => {});

    document.getElementById('profile-hub-followers-stat').addEventListener('click', () => showFollowConnectionsSheet(u._id, u.username, 'followers'));
    document.getElementById('profile-hub-following-stat').addEventListener('click', () => showFollowConnectionsSheet(u._id, u.username, 'following'));
    document.getElementById('profile-hub-wallet-btn')?.addEventListener('click', () => showBuyCoinsModal());
    document.getElementById('profile-hub-vip-btn')?.addEventListener('click', () => showNotification('خاصية VIP قريباً ✨', 'info'));
    document.getElementById('profile-hub-creator-btn').addEventListener('click', () => showNotification('مركز صنّاع المحتوى قريباً 🌟', 'info'));
    document.getElementById('profile-hub-games-btn').addEventListener('click', () => showNotification('مركز الألعاب قريباً 🎮', 'info'));
    document.getElementById('profile-hub-host-center-btn').addEventListener('click', () => showHostCenterSheet());
    document.getElementById('profile-hub-edit-btn').addEventListener('click', () => showProfileEditSheet(u));
    document.getElementById('profile-hub-discover-btn').addEventListener('click', () => showDiscoverPeopleSheet());
    document.getElementById('profile-hub-full-settings-btn').addEventListener('click', () => { document.getElementById('profile-hub-page')?.remove(); switchToView('settings'); });
    body.querySelectorAll('.profile-hub-settings-soon').forEach(btn => {
        btn.addEventListener('click', () => showNotification(`قسم "${btn.dataset.label}" قيد إعادة الهيكلة، قريباً جداً`, 'info'));
    });
    document.getElementById('profile-hub-logout-btn').addEventListener('click', () => {
        showConfirmationModal('هل أنت متأكد من تسجيل الخروج؟', () => {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            window.location.href = '/login.html';
        });
    });
}

// ✅ مركز المضيف — إحصائيات حقيقية حالية لغرفتي (لو عندي غرفة) بدل بيانات وهمية؛ الرسوم
// البيانية الأسبوعية/الشهرية/السنوية تحتاج بيانات تاريخية غير مُجمَّعة بعد بالنظام، فتُعرض
// "قريباً" بدل اختلاقها — لا نعرض أبداً رقماً غير حقيقي
async function showHostCenterSheet() {
    document.getElementById('host-center-sheet')?.remove();
    const modal = document.createElement('div');
    modal.id = 'host-center-sheet';
    modal.className = 'fixed inset-0 bg-black/70 z-[320] flex items-end md:items-center justify-center p-3';
    modal.innerHTML = `
        <div class="profile-hub-subsheet-card w-full md:max-w-sm">
            <div class="flex items-center justify-between mb-3">
                <p class="font-bold text-sm flex items-center gap-2"><i class="fas fa-microphone-lines text-pink-400"></i> مركز المضيف</p>
                <button id="close-host-center" class="profile-hub-icon-btn"><i class="fas fa-times"></i></button>
            </div>
            <div id="host-center-body" class="text-center text-gray-400 py-10"><i class="fas fa-spinner fa-spin"></i></div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target.id === 'host-center-sheet') modal.remove(); });
    document.getElementById('close-host-center').addEventListener('click', () => modal.remove());

    try {
        const response = await fetch('/api/voice-room/my-room', { headers: { 'Authorization': `Bearer ${token}` } });
        const result = await response.json();
        const roomBody = document.getElementById('host-center-body');
        if (!roomBody) return;
        if (result.status !== 'success' || !result.room) {
            roomBody.innerHTML = '<p class="text-sm text-gray-400 py-6">لا تملك غرفة بعد — أنشئ غرفتك من الرئيسية لتظهر إحصائياتها هنا</p>';
            return;
        }
        const roomDetailsRes = await fetch(`/api/voice-room/rooms/${result.room.id}`, { headers: { 'Authorization': `Bearer ${token}` } });
        const roomDetails = await roomDetailsRes.json();
        const followersCount = roomDetails.followersCount || 0;
        const level = roomDetails.level ?? '—';
        const supportPoints = roomDetails.supportPoints || 0;
        roomBody.innerHTML = `
            <div class="grid grid-cols-3 gap-2 mb-3">
                <div class="profile-hub-hc-stat"><span>${followersCount}</span><label>متابعو الغرفة</label></div>
                <div class="profile-hub-hc-stat"><span>Lv.${level}</span><label>المستوى</label></div>
                <div class="profile-hub-hc-stat"><span>${supportPoints.toLocaleString('en-US')}</span><label>دعم تراكمي</label></div>
            </div>
            <p class="text-[11px] text-gray-500 text-center py-3 border-t border-gray-700/50">تحليلات تفصيلية (أسبوعي/شهري/سنوي، أكبر داعم، الجنس الأكثر متابعة...) قريباً 📊</p>
        `;
    } catch (error) {
        const roomBody = document.getElementById('host-center-body');
        if (roomBody) roomBody.innerHTML = '<p class="text-sm text-red-400 py-6">تعذر تحميل الإحصائيات</p>';
    }
}

// ✅ قائمة "المزيد" — مشاركة/محفظة/مركز صنّاع المحتوى/رمز QR
function showProfileHubMoreMenu() {
    document.getElementById('profile-hub-more-menu')?.remove();
    const localUser = JSON.parse(localStorage.getItem('user')) || {};
    const modal = document.createElement('div');
    modal.id = 'profile-hub-more-menu';
    modal.className = 'fixed inset-0 bg-black/60 z-[325] flex items-end justify-center';
    modal.innerHTML = `
        <div class="bg-gray-800 w-full md:max-w-sm rounded-t-2xl p-3 pb-5 animate-[slideUp_0.2s_ease-out]">
            <div class="w-10 h-1.5 bg-gray-600 rounded-full mx-auto mb-3"></div>
            <button id="hub-more-share" class="profile-hub-settings-row"><i class="fas fa-share-nodes text-purple-400"></i><span>مشاركة الملف الشخصي</span></button>
            <button id="hub-more-wallet" class="profile-hub-settings-row"><i class="fas fa-wallet text-yellow-400"></i><span>المحفظة</span></button>
            <button id="hub-more-creator" class="profile-hub-settings-row"><i class="fas fa-star text-purple-400"></i><span>مركز صنّاع المحتوى</span><span class="profile-hub-soon-tag">قريباً</span></button>
            <button id="hub-more-qr" class="profile-hub-settings-row"><i class="fas fa-qrcode text-emerald-400"></i><span>رمز QR</span></button>
        </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target.id === 'profile-hub-more-menu') modal.remove(); });
    document.getElementById('hub-more-share').addEventListener('click', async () => {
        modal.remove();
        const shareText = `تابعني على منصة التحديات! معرّفي: ${localUser.customId || ''}`;
        try {
            if (navigator.share) {
                await navigator.share({ text: shareText });
            } else {
                await navigator.clipboard.writeText(shareText);
                showNotification('تم نسخ رابط المشاركة ✅', 'success');
            }
        } catch (e) { /* المستخدم ألغى المشاركة — لا حاجة لأي رد فعل */ }
    });
    document.getElementById('hub-more-wallet').addEventListener('click', () => { modal.remove(); showBuyCoinsModal(); });
    document.getElementById('hub-more-creator').addEventListener('click', () => showNotification('مركز صنّاع المحتوى قريباً 🌟', 'info'));
    document.getElementById('hub-more-qr').addEventListener('click', () => { modal.remove(); showProfileQrModal(localUser); });
}

// ✅ رمز QR لمشاركة الملف الشخصي — عبر مكتبة qrcodejs الخفيفة (CDN، يتحقق من توفّرها فعلياً
// قبل الاستخدام فلا يتعطّل شيء لو تعذّر تحميلها)
function showProfileQrModal(localUser) {
    document.getElementById('profile-qr-modal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'profile-qr-modal';
    modal.className = 'fixed inset-0 bg-black/70 z-[330] flex items-center justify-center p-4';
    modal.innerHTML = `
        <div class="profile-hub-subsheet-card w-full max-w-[280px] text-center">
            <p class="font-bold text-sm mb-3"><i class="fas fa-qrcode text-emerald-400"></i> رمز QR لملفك</p>
            <div id="profile-qr-canvas-holder" class="w-[180px] h-[180px] bg-white rounded-xl mx-auto flex items-center justify-center"></div>
            <p class="text-[11px] text-gray-400 mt-3">ID: ${escapeHtml(String(localUser.customId || ''))}</p>
            <button id="close-profile-qr" class="profile-hub-action-btn profile-hub-action-secondary w-full mt-4">إغلاق</button>
        </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target.id === 'profile-qr-modal') modal.remove(); });
    document.getElementById('close-profile-qr').addEventListener('click', () => modal.remove());

    const holder = document.getElementById('profile-qr-canvas-holder');
    if (typeof QRCode === 'function' && holder) {
        new QRCode(holder, { text: `ID:${localUser.customId || ''}`, width: 170, height: 170, colorDark: '#111827', colorLight: '#ffffff' });
    } else if (holder) {
        holder.innerHTML = `<span class="text-gray-500 text-xs px-4">تعذّر تحميل مولّد رمز QR</span>`;
    }
}

// ✅ ورقة "زوّار ملفي" — إجمالي مشاهدات/زوّار مميَّزين + نفس الشيء لليوم + توزيع يومي
async function showProfileVisitorsSheet() {
    document.getElementById('profile-visitors-sheet')?.remove();
    const modal = document.createElement('div');
    modal.id = 'profile-visitors-sheet';
    modal.className = 'fixed inset-0 bg-black/70 z-[320] flex items-end md:items-center justify-center p-3';
    modal.innerHTML = `
        <div class="profile-hub-subsheet-card w-full md:max-w-sm" style="max-height:75vh; display:flex; flex-direction:column;">
            <div class="flex items-center justify-between mb-3 flex-shrink-0">
                <p class="font-bold text-sm flex items-center gap-2"><i class="fas fa-eye text-purple-400"></i> زوّار ملفي</p>
                <button id="close-profile-visitors" class="profile-hub-icon-btn"><i class="fas fa-times"></i></button>
            </div>
            <div id="profile-visitors-body" class="text-center text-gray-400 py-10 overflow-y-auto"><i class="fas fa-spinner fa-spin"></i></div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target.id === 'profile-visitors-sheet') modal.remove(); });
    document.getElementById('close-profile-visitors').addEventListener('click', () => modal.remove());

    try {
        const response = await fetch('/api/users/me/profile-visits', { headers: { 'Authorization': `Bearer ${token}` } });
        const result = await response.json();
        const bodyEl = document.getElementById('profile-visitors-body');
        if (!bodyEl) return;
        if (!response.ok || result.status !== 'success') throw new Error();
        const d = result.data;
        const dayLabel = (dateStr) => {
            const today = new Date(); today.setHours(0, 0, 0, 0);
            const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
            const d2 = new Date(dateStr + 'T00:00:00');
            if (d2.getTime() === today.getTime()) return 'اليوم';
            if (d2.getTime() === yesterday.getTime()) return 'أمس';
            return dateStr;
        };
        bodyEl.innerHTML = `
            <div class="grid grid-cols-2 gap-2 mb-3 flex-shrink-0">
                <div class="profile-hub-hc-stat"><span>${d.totalVisitors}</span><label>إجمالي الزوّار</label></div>
                <div class="profile-hub-hc-stat"><span>${d.totalViews}</span><label>إجمالي المشاهدات</label></div>
                <div class="profile-hub-hc-stat"><span>${d.todayVisitors}</span><label>زوّار اليوم</label></div>
                <div class="profile-hub-hc-stat"><span>${d.todayViews}</span><label>مشاهدات اليوم</label></div>
            </div>
            ${d.dailyBreakdown.length === 0
                ? '<p class="text-xs text-gray-500 text-center py-6">لا توجد زيارات بعد</p>'
                : `<div class="space-y-1.5">${d.dailyBreakdown.map(row => `
                    <div class="flex items-center justify-between bg-gray-800/40 rounded-lg px-3 py-2 text-xs">
                        <span class="text-gray-300">${dayLabel(row.date)}</span>
                        <span class="font-bold text-purple-300">${row.visitorsCount} ${row.visitorsCount === 1 ? 'زائر' : 'زوّار'}</span>
                    </div>
                `).join('')}</div>`
            }
        `;
    } catch (error) {
        const bodyEl = document.getElementById('profile-visitors-body');
        if (bodyEl) bodyEl.innerHTML = '<p class="text-sm text-red-400 py-6">تعذر تحميل سجل الزوّار</p>';
    }
}

// ✅ يربط زر متابعة/إلغاء متابعة موحَّد — يُستخدم بقائمتي المتابِعين/المتابَعين وباقتراحات "لك"
// معاً بدل تكرار نفس منطق الطلب في كل مكان
function wireFollowConnectionButton(btn) {
    btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const targetUserId = btn.dataset.userId;
        const nowFollowing = !btn.classList.contains('following');
        btn.disabled = true;
        try {
            const response = await fetch(`/api/users/${targetUserId}/follow`, { method: nowFollowing ? 'POST' : 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
            if (response.ok) {
                btn.classList.toggle('following', nowFollowing);
                btn.textContent = nowFollowing ? 'متابَع' : 'متابعة';
            } else {
                const r = await response.json();
                showNotification(r.message || 'تعذر تنفيذ الطلب', 'error');
            }
        } catch (error) {
            showNotification('حدث خطأ، حاول مجدداً', 'error');
        } finally {
            btn.disabled = false;
        }
    });
}

// ✅ صف شخص موحَّد (قوائم المتابِعين/المتابَعين + اقتراحات) — صورة/اسم/مستوى + زر متابعة،
// النقر على الصف (لا الزر) يفتح ملفه الشخصي الكامل
function renderFollowPersonRowHTML(u, extraClass = '') {
    return `
        <div class="follow-connection-row ${extraClass}" data-user-id="${u._id}">
            <img src="${u.profileImage}" class="follow-connection-avatar ${u.activeFrameClass || ''}">
            <div class="min-w-0 flex-1">
                <p class="follow-connection-name">${escapeHtml(u.username)}</p>
                <p class="follow-connection-level">Lv.${u.level || 1}</p>
            </div>
            <button type="button" class="follow-connection-btn ${u.isFollowedByMe ? 'following' : ''}" data-user-id="${u._id}">${u.isFollowedByMe ? 'متابَع' : 'متابعة'}</button>
        </div>
    `;
}

// ✅ ورقة متابِعين/متابَعين — تبويبان، وأسفل كل قائمة قسم "اقتراحات لك" (صفوف مكدَّسة تحت
// بعضها لا شبكة)، كل اقتراح بزر × بسيط بلا خلفية يزيله من القائمة فوراً (محلياً فقط، بلا حفظ)
async function showFollowConnectionsSheet(userId, username, initialTab = 'followers') {
    document.getElementById('follow-connections-sheet')?.remove();
    const modal = document.createElement('div');
    modal.id = 'follow-connections-sheet';
    modal.className = 'fixed inset-0 bg-black/70 z-[335] flex items-end md:items-center justify-center';
    modal.innerHTML = `
        <div class="follow-connections-card">
            <div class="flex items-center justify-between p-3 border-b border-gray-700 flex-shrink-0">
                <p class="font-bold text-sm truncate">${escapeHtml(username || '')}</p>
                <button id="close-follow-connections" class="profile-hub-icon-btn"><i class="fas fa-times"></i></button>
            </div>
            <div class="follow-tabs-row flex-shrink-0">
                <button id="fc-tab-followers" class="follow-tab-btn">متابعون</button>
                <button id="fc-tab-following" class="follow-tab-btn">متابَعة</button>
            </div>
            <div id="fc-list" class="flex-1 overflow-y-auto px-3 pb-3">
                <div class="text-center text-gray-400 py-10"><i class="fas fa-spinner fa-spin"></i></div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target.id === 'follow-connections-sheet') modal.remove(); });
    document.getElementById('close-follow-connections').addEventListener('click', () => modal.remove());

    async function loadTab(tab) {
        document.getElementById('fc-tab-followers').classList.toggle('active', tab === 'followers');
        document.getElementById('fc-tab-following').classList.toggle('active', tab === 'following');
        const listEl = document.getElementById('fc-list');
        listEl.innerHTML = '<div class="text-center text-gray-400 py-10"><i class="fas fa-spinner fa-spin"></i></div>';
        try {
            const response = await fetch(`/api/users/${userId}/${tab}`, { headers: { 'Authorization': `Bearer ${token}` } });
            const result = await response.json();
            if (!response.ok || result.status !== 'success') throw new Error();
            const users = result.data.users;
            listEl.innerHTML = `
                <div class="follow-connections-list">
                    ${users.length === 0
                        ? `<p class="text-xs text-gray-500 text-center py-6">${tab === 'followers' ? 'لا يوجد متابعون بعد' : 'لا تتابع أحداً بعد'}</p>`
                        : users.map(u => renderFollowPersonRowHTML(u)).join('')
                    }
                </div>
                <div id="fc-suggestions-slot"></div>
            `;
            listEl.querySelectorAll('.follow-connection-row').forEach(row => {
                row.addEventListener('click', () => { modal.remove(); showFullProfilePage(row.dataset.userId); });
            });
            listEl.querySelectorAll('.follow-connection-btn').forEach(wireFollowConnectionButton);
            loadSuggestionsForConnectionsSheet();
        } catch (error) {
            listEl.innerHTML = '<p class="text-xs text-red-400 text-center py-6">تعذر تحميل القائمة</p>';
        }
    }

    async function loadSuggestionsForConnectionsSheet() {
        const slot = document.getElementById('fc-suggestions-slot');
        if (!slot) return;
        try {
            const response = await fetch('/api/users/discover/people', { headers: { 'Authorization': `Bearer ${token}` } });
            const result = await response.json();
            if (!response.ok || result.status !== 'success' || result.data.users.length === 0) return;
            slot.innerHTML = `
                <p class="follow-suggestions-title">اقتراحات لك</p>
                <div class="follow-connections-list">
                    ${result.data.users.map(u => `
                        <div class="follow-suggestion-wrap">
                            ${renderFollowPersonRowHTML(u)}
                            <button type="button" class="follow-suggestion-dismiss" title="إزالة"><i class="fas fa-times"></i></button>
                        </div>
                    `).join('')}
                </div>
            `;
            slot.querySelectorAll('.follow-connection-row').forEach(row => {
                row.addEventListener('click', () => { modal.remove(); showFullProfilePage(row.dataset.userId); });
            });
            slot.querySelectorAll('.follow-connection-btn').forEach(wireFollowConnectionButton);
            slot.querySelectorAll('.follow-suggestion-dismiss').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    btn.closest('.follow-suggestion-wrap')?.remove();
                });
            });
        } catch (error) { /* اقتراحات ثانوية — فشلها الصامت لا يعطّل القائمة الأساسية */ }
    }

    document.getElementById('fc-tab-followers').addEventListener('click', () => loadTab('followers'));
    document.getElementById('fc-tab-following').addEventListener('click', () => loadTab('following'));
    loadTab(initialTab === 'following' ? 'following' : 'followers');
}

// ✅ ورقة "اكتشاف أشخاص" — اقتراحات متابعة بسيطة، النقر على أي بطاقة يفتح ملفه الشخصي الكامل
async function showDiscoverPeopleSheet() {
    document.getElementById('discover-people-sheet')?.remove();
    const modal = document.createElement('div');
    modal.id = 'discover-people-sheet';
    modal.className = 'fixed inset-0 bg-black/70 z-[320] flex items-end md:items-center justify-center p-3';
    modal.innerHTML = `
        <div class="profile-hub-subsheet-card w-full md:max-w-sm" style="max-height:75vh; display:flex; flex-direction:column;">
            <div class="flex items-center justify-between mb-3 flex-shrink-0">
                <p class="font-bold text-sm flex items-center gap-2"><i class="fas fa-user-plus text-purple-400"></i> اقتراحات متابعة</p>
                <button id="close-discover-people" class="profile-hub-icon-btn"><i class="fas fa-times"></i></button>
            </div>
            <div id="discover-people-body" class="text-center text-gray-400 py-10 overflow-y-auto"><i class="fas fa-spinner fa-spin"></i></div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target.id === 'discover-people-sheet') modal.remove(); });
    document.getElementById('close-discover-people').addEventListener('click', () => modal.remove());

    try {
        const response = await fetch('/api/users/discover/people', { headers: { 'Authorization': `Bearer ${token}` } });
        const result = await response.json();
        const bodyEl = document.getElementById('discover-people-body');
        if (!bodyEl) return;
        if (!response.ok || result.status !== 'success') throw new Error();
        const users = result.data.users;
        if (users.length === 0) {
            bodyEl.innerHTML = '<p class="text-xs text-gray-500 text-center py-6">لا توجد اقتراحات جديدة حالياً</p>';
            return;
        }
        bodyEl.innerHTML = `<div class="grid grid-cols-3 gap-2">${users.map(u => `
            <button class="discover-person-card" data-user-id="${u._id}">
                <img src="${u.profileImage}" class="discover-person-avatar ${u.activeFrameClass || ''}">
                <span class="discover-person-name">${escapeHtml(u.username)}</span>
                <span class="discover-person-level">Lv.${u.level || 1}</span>
            </button>
        `).join('')}</div>`;
        bodyEl.querySelectorAll('.discover-person-card').forEach(card => {
            card.addEventListener('click', () => {
                modal.remove();
                showFullProfilePage(card.dataset.userId);
            });
        });
    } catch (error) {
        const bodyEl = document.getElementById('discover-people-body');
        if (bodyEl) bodyEl.innerHTML = '<p class="text-sm text-red-400 py-6">تعذر تحميل الاقتراحات</p>';
    }
}

// ✅ ورقة تحرير الملف الشخصي — كل الحقول الجديدة، مع رفع صورة شخصية/غلاف منفصلين
function showProfileEditSheet(u) {
    document.getElementById('profile-edit-sheet')?.remove();
    let educationEntries = (u.education || []).map(e => ({ institution: e.institution || '', period: e.period || '' }));
    const social = u.socialLinks || {};
    const job = u.job || {};
    const birthDateValue = u.birthDate ? new Date(u.birthDate).toISOString().slice(0, 10) : '';

    const modal = document.createElement('div');
    modal.id = 'profile-edit-sheet';
    modal.className = 'fixed inset-0 bg-black/75 z-[330] flex items-end md:items-center justify-center';
    modal.innerHTML = `
        <div class="profile-edit-card">
            <div class="flex items-center justify-between p-3 border-b border-gray-700 flex-shrink-0">
                <p class="font-bold text-sm"><i class="fas fa-pen text-purple-400"></i> تحرير الملف الشخصي</p>
                <button id="close-profile-edit" class="profile-hub-icon-btn"><i class="fas fa-times"></i></button>
            </div>
            <div class="flex-1 overflow-y-auto p-4 space-y-4" id="profile-edit-scroll">
                <div class="profile-edit-media-block">
                    <div id="profile-edit-cover-preview" class="profile-edit-cover-preview" style="${u.coverImage ? `background-image:url('${u.coverImage}')` : ''}">
                        <button type="button" id="profile-edit-cover-btn" class="profile-edit-camera-btn profile-edit-camera-cover" title="تغيير الغلاف"><i class="fas fa-camera"></i></button>
                    </div>
                    <div class="profile-edit-avatar-wrap">
                        <img id="profile-edit-avatar-preview" src="${u.profileImage}" class="profile-edit-avatar-preview">
                        <button type="button" id="profile-edit-avatar-btn" class="profile-edit-camera-btn profile-edit-camera-avatar" title="تغيير الصورة الشخصية"><i class="fas fa-camera"></i></button>
                    </div>
                </div>
                <input type="file" id="profile-edit-cover-file" accept="image/*" class="hidden">
                <input type="file" id="profile-edit-avatar-file" accept="image/*" class="hidden">

                <div>
                    <label class="profile-edit-label">الحالة / السيرة الذاتية</label>
                    <textarea id="edit-status" maxlength="100" rows="2" class="profile-edit-input">${escapeHtml(u.status || '')}</textarea>
                </div>

                <div class="grid grid-cols-2 gap-2">
                    <div>
                        <label class="profile-edit-label">تاريخ الميلاد</label>
                        <input type="date" id="edit-birthdate" value="${birthDateValue}" class="profile-edit-input">
                    </div>
                    <div>
                        <label class="profile-edit-label">الجنس</label>
                        <select id="edit-gender" class="profile-edit-input">
                            <option value="male" ${u.gender === 'male' ? 'selected' : ''}>ذكر</option>
                            <option value="female" ${u.gender === 'female' ? 'selected' : ''}>أنثى</option>
                        </select>
                    </div>
                </div>

                <div class="grid grid-cols-2 gap-2">
                    <div>
                        <label class="profile-edit-label">مسقط الرأس</label>
                        <input type="text" id="edit-hometown" maxlength="40" value="${escapeHtml(u.hometown || '')}" class="profile-edit-input" placeholder="مثلاً: عمّان">
                    </div>
                    <div>
                        <label class="profile-edit-label">الموقع الحالي <span class="text-gray-500">(يُحدَّد تلقائياً)</span></label>
                        <input type="text" id="edit-location" maxlength="40" value="${escapeHtml(u.location || '')}" class="profile-edit-input">
                    </div>
                </div>

                <div>
                    <label class="profile-edit-label">حسابات التواصل</label>
                    <div class="space-y-1.5">
                        <div class="profile-edit-social-row"><i class="fab fa-instagram text-pink-400"></i><input type="text" id="edit-instagram" maxlength="60" value="${escapeHtml(social.instagram || '')}" class="profile-edit-input" placeholder="معرّف إنستجرام"></div>
                        <div class="profile-edit-social-row"><i class="fab fa-youtube text-red-400"></i><input type="text" id="edit-youtube" maxlength="60" value="${escapeHtml(social.youtube || '')}" class="profile-edit-input" placeholder="قناة يوتيوب"></div>
                        <div class="profile-edit-social-row"><i class="fab fa-tiktok text-gray-200"></i><input type="text" id="edit-tiktok" maxlength="60" value="${escapeHtml(social.tiktok || '')}" class="profile-edit-input" placeholder="معرّف تيك توك"></div>
                    </div>
                </div>

                <div>
                    <div class="flex items-center justify-between mb-1.5">
                        <label class="profile-edit-label mb-0">التعليم</label>
                        <button type="button" id="add-education-btn" class="profile-edit-add-btn"><i class="fas fa-plus"></i></button>
                    </div>
                    <div id="education-entries-list" class="space-y-2"></div>
                </div>

                <div>
                    <label class="profile-edit-label">المهنة</label>
                    <div class="space-y-1.5">
                        <input type="text" id="edit-job-title" maxlength="50" value="${escapeHtml(job.title || '')}" class="profile-edit-input" placeholder="المسمى الوظيفي">
                        <input type="text" id="edit-job-company" maxlength="50" value="${escapeHtml(job.company || '')}" class="profile-edit-input" placeholder="الشركة">
                        <div class="grid grid-cols-2 gap-2">
                            <input type="text" id="edit-job-from" maxlength="20" value="${escapeHtml(job.from || '')}" class="profile-edit-input" placeholder="من">
                            <input type="text" id="edit-job-to" maxlength="20" value="${escapeHtml(job.to || '')}" class="profile-edit-input" placeholder="إلى">
                        </div>
                    </div>
                </div>

                <div>
                    <label class="profile-edit-label">إظهار في ملفي الشخصي</label>
                    <div class="profile-edit-toggle-row">
                        <span><i class="fas fa-crown text-yellow-400"></i> شارة VIP</span>
                        <label class="hub-toggle"><input type="checkbox" id="edit-show-vip" ${u.showVipBadge !== false ? 'checked' : ''}><span class="hub-toggle-slider"></span></label>
                    </div>
                    <div class="profile-edit-toggle-row">
                        <span><i class="fas fa-wallet text-emerald-400"></i> المحفظة</span>
                        <label class="hub-toggle"><input type="checkbox" id="edit-show-wallet" ${u.showWallet !== false ? 'checked' : ''}><span class="hub-toggle-slider"></span></label>
                    </div>
                </div>
            </div>
            <div class="p-3 border-t border-gray-700 flex-shrink-0">
                <button id="save-profile-edit-btn" class="profile-hub-action-btn profile-hub-action-primary w-full justify-center"><i class="fas fa-check"></i> حفظ التغييرات</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target.id === 'profile-edit-sheet') modal.remove(); });
    document.getElementById('close-profile-edit').addEventListener('click', () => modal.remove());

    function renderEducationEntries() {
        const list = document.getElementById('education-entries-list');
        if (!list) return;
        if (educationEntries.length === 0) {
            list.innerHTML = '<p class="text-[11px] text-gray-500">لا توجد إدخالات — اضغط + لإضافة مدرسة أو جامعة</p>';
            return;
        }
        list.innerHTML = educationEntries.map((e, i) => `
            <div class="profile-edit-education-row" data-idx="${i}">
                <div class="flex-1 space-y-1">
                    <input type="text" class="profile-edit-input edu-institution" maxlength="80" placeholder="اسم المدرسة/الجامعة" value="${escapeHtml(e.institution)}">
                    <input type="text" class="profile-edit-input edu-period" maxlength="30" placeholder="الفترة (مثلاً 2018 - 2022)" value="${escapeHtml(e.period)}">
                </div>
                <button type="button" class="profile-edit-remove-edu-btn" data-idx="${i}"><i class="fas fa-trash"></i></button>
            </div>
        `).join('');
        list.querySelectorAll('.edu-institution').forEach((input, i) => input.addEventListener('input', () => { educationEntries[i].institution = input.value; }));
        list.querySelectorAll('.edu-period').forEach((input, i) => input.addEventListener('input', () => { educationEntries[i].period = input.value; }));
        list.querySelectorAll('.profile-edit-remove-edu-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                educationEntries.splice(Number(btn.dataset.idx), 1);
                renderEducationEntries();
            });
        });
    }
    renderEducationEntries();
    document.getElementById('add-education-btn').addEventListener('click', () => {
        if (educationEntries.length >= 10) { showNotification('الحد الأقصى 10 إدخالات', 'error'); return; }
        educationEntries.push({ institution: '', period: '' });
        renderEducationEntries();
        document.getElementById('profile-edit-scroll').scrollTop = document.getElementById('profile-edit-scroll').scrollHeight;
    });

    // ✅ رفع الصورة الشخصية/الغلاف — نفس نمط بقية أزرار الرفع بالمشروع (اختيار فوري عند التغيير)
    document.getElementById('profile-edit-avatar-btn').addEventListener('click', () => document.getElementById('profile-edit-avatar-file').click());
    document.getElementById('profile-edit-avatar-file').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const formData = new FormData();
        formData.append('profileImage', file);
        try {
            const response = await fetch('/api/users/updateProfilePicture', { method: 'PATCH', headers: { 'Authorization': `Bearer ${token}` }, body: formData });
            const result = await response.json();
            if (response.ok) {
                document.getElementById('profile-edit-avatar-preview').src = result.data.user.profileImage;
                localStorage.setItem('user', JSON.stringify(result.data.user));
                showNotification('تم تحديث الصورة الشخصية ✅', 'success');
            } else {
                showNotification(result.message || 'تعذر رفع الصورة', 'error');
            }
        } catch (error) { showNotification('حدث خطأ، حاول مجدداً', 'error'); }
    });
    document.getElementById('profile-edit-cover-btn').addEventListener('click', () => document.getElementById('profile-edit-cover-file').click());
    document.getElementById('profile-edit-cover-file').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const formData = new FormData();
        formData.append('coverImage', file);
        try {
            const response = await fetch('/api/users/updateCoverImage', { method: 'PATCH', headers: { 'Authorization': `Bearer ${token}` }, body: formData });
            const result = await response.json();
            if (response.ok) {
                document.getElementById('profile-edit-cover-preview').style.backgroundImage = `url('${result.data.user.coverImage}')`;
                localStorage.setItem('user', JSON.stringify(result.data.user));
                showNotification('تم تحديث الغلاف ✅', 'success');
            } else {
                showNotification(result.message || 'تعذر رفع الغلاف', 'error');
            }
        } catch (error) { showNotification('حدث خطأ، حاول مجدداً', 'error'); }
    });

    document.getElementById('save-profile-edit-btn').addEventListener('click', async () => {
        const saveBtn = document.getElementById('save-profile-edit-btn');
        const originalHTML = saveBtn.innerHTML;
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

        const statusVal = document.getElementById('edit-status').value.trim();
        if (!statusVal) {
            showNotification('الحالة لا يمكن أن تكون فارغة', 'error');
            saveBtn.disabled = false; saveBtn.innerHTML = originalHTML;
            return;
        }

        const payload = {
            status: statusVal,
            birthDate: document.getElementById('edit-birthdate').value || undefined,
            gender: document.getElementById('edit-gender').value,
            hometown: document.getElementById('edit-hometown').value.trim(),
            location: document.getElementById('edit-location').value.trim(),
            socialLinks: {
                instagram: document.getElementById('edit-instagram').value.trim(),
                youtube: document.getElementById('edit-youtube').value.trim(),
                tiktok: document.getElementById('edit-tiktok').value.trim()
            },
            education: educationEntries.filter(e => e.institution.trim()),
            job: {
                title: document.getElementById('edit-job-title').value.trim(),
                company: document.getElementById('edit-job-company').value.trim(),
                from: document.getElementById('edit-job-from').value.trim(),
                to: document.getElementById('edit-job-to').value.trim()
            },
            showVipBadge: document.getElementById('edit-show-vip').checked,
            showWallet: document.getElementById('edit-show-wallet').checked
        };

        try {
            const response = await fetch('/api/users/updateProfile', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(payload)
            });
            const result = await response.json();
            if (!response.ok) {
                showNotification(result.message || 'تعذر حفظ التغييرات', 'error');
                saveBtn.disabled = false; saveBtn.innerHTML = originalHTML;
                return;
            }
            localStorage.setItem('user', JSON.stringify(result.data.user));
            showNotification('تم حفظ ملفك الشخصي ✅', 'success');
            modal.remove();
            renderProfileHubBody(result.data.user); // ✅ يعيد رسم الخلفية (مركز الملف الشخصي) بالبيانات الجديدة فوراً
        } catch (error) {
            showNotification('حدث خطأ، حاول مجدداً', 'error');
            saveBtn.disabled = false; saveBtn.innerHTML = originalHTML;
        }
    });
}

        

        // --- ✅ دالة جديدة لعرض الملف الشخصي المصغر ---
async function showMiniProfileModal(userId) {
    // إزالة أي نافذة ملف شخصي مصغر سابقة أولاً
    const existingModal = document.getElementById('mini-profile-modal');
    if (existingModal) existingModal.remove();

    // ✅ الإصلاح 1 (السرعة): نعرض هيكل تحميل فوري بدل انتظار الطلبات — نافذة سفلية أنيقة
    const loadingShellHTML = `
        <div id="mini-profile-modal" class="fixed inset-0 bg-black/70 z-[310] flex items-end justify-center">
            <div class="bg-gradient-to-b from-gray-800 to-gray-900 rounded-t-2xl shadow-2xl w-full max-w-md text-white p-8 text-center border-t border-purple-500/25 animate-[slideUp_0.25s_ease-out]">
                <i class="fas fa-spinner fa-spin text-2xl text-purple-400 mb-3"></i>
                <p class="text-xs text-gray-400">جاري تحميل الملف الشخصي...</p>
            </div>
        </div>
    `;
    document.getElementById('game-container').insertAdjacentHTML('beforeend', loadingShellHTML);

    try {
        // ✅ الإصلاح 2 (السرعة): فحص الحظر + جلب بيانات المستخدم بالتوازي بدل التسلسل
        const [blockCheckResult, userResult] = await Promise.all([
            fetch(`/api/blocks/mutual-status/${userId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            }).then(r => r.json()),
            fetch(`/api/users/${userId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            }).then(r => r.json())
        ]);

        const blockData = blockCheckResult.data;

        const loadingShell = document.getElementById('mini-profile-modal');
        if (loadingShell) loadingShell.remove();

        if (blockData.blockStatus.heBlockedMe) {
            showBlockedProfileModal(userId, blockData);
            return;
        }

        const profileUser = userResult.data.user;

        const selfUserData = JSON.parse(localStorage.getItem('user'));
        if (!selfUserData) {
            showNotification('يجب تسجيل الدخول أولاً', 'error');
            return;
        }

        const socialInfo = getSocialStatus(profileUser.socialStatus);
        const educationInfo = getEducationStatus(profileUser.educationStatus);
        const genderInfo = profileUser.gender === 'male' 
            ? { text: 'ذكر', icon: 'fa-mars', color: 'text-blue-400' }
            : { text: 'أنثى', icon: 'fa-venus', color: 'text-pink-400' };

        const friendButtonHTML = getFriendButtonHTML(profileUser, selfUserData);

        const blockedUsersIds = (selfUserData.blockedUsers || []).map(item => 
            item._id ? item._id.toString() : item.toString()
        );
        const profileUserIdStr = profileUser._id.toString();
        const isBlockedByMe = blockedUsersIds.includes(profileUserIdStr);

        const blockButtonHTML = isBlockedByMe ? 
            `<button class="action-btn unblock-action-btn" data-user-id="${profileUser._id}">
                <i class="fas fa-unlock"></i>
                <span class="text-xs mt-1">رفع الحظر</span>
            </button>` : 
            `<button class="action-btn block-action-btn" data-user-id="${profileUser._id}">
                <i class="fas fa-ban"></i>
                <span class="text-xs mt-1">حظر</span>
            </button>`;

                        const modalHTML = `
         <div id="mini-profile-modal" class="fixed inset-0 bg-black/70 z-[310] flex items-end justify-center">
                <div class="bg-gradient-to-b from-gray-800 to-gray-900 rounded-t-2xl shadow-2xl w-full max-w-md text-white border-t border-x border-purple-500/25 overflow-hidden animate-[slideUp_0.25s_ease-out]" style="max-height:80vh; overflow-y:auto;">

                    <div class="relative bg-gradient-to-r from-purple-700/30 to-pink-700/25 pt-5 pb-3 px-4 text-center">
                        <img id="mini-profile-avatar-img" src="${profileUser.profileImage}" 
                             class="w-16 h-16 rounded-full mx-auto border-4 border-gray-900 object-cover shadow-lg cursor-pointer hover:opacity-90 transition ${profileUser.activeFrameClass || ''}" title="عرض الملف الكامل">
                        <h2 class="text-sm font-bold mt-2 flex items-center justify-center gap-1">${profileUser.username} ${getAgentBadgeHTML(profileUser.isAgent)}</h2>
                        <div class="text-[10px] text-gray-300 mt-1 cursor-pointer inline-flex items-center gap-1.5 copy-id-btn bg-black/25 px-2 py-0.5 rounded-full">
                           <i class="fas fa-id-card"></i>
                           <span>${profileUser.customId}</span>
                           <i class="fas fa-copy"></i>
                        </div>
                        <p class="text-[9px] text-purple-300/70 mt-1.5"><i class="fas fa-hand-pointer"></i> اضغط على الصورة لعرض التفاصيل الكاملة</p>
                        ${isBlockedByMe ? `
                            <div class="mt-2">
                                <span class="text-[10px] bg-red-900/50 text-red-300 px-2 py-0.5 rounded-full">
                                    <i class="fas fa-ban mr-1"></i> محظور من قبلك
                                </span>
                            </div>
                        ` : ''}
                    </div>

                    <p id="profile-user-status" class="text-[11px] text-gray-300 italic text-center px-4 py-2 border-b border-gray-700/50 truncate">
                        ${profileUser.status || '🚀 جاهز للتحديات!'}
                    </p>

                    <div class="grid grid-cols-2 divide-x divide-x-reverse divide-gray-700/50 border-b border-gray-700/50">
                        <div class="text-center py-2">
                            <div class="text-lg font-bold text-yellow-400">${profileUser.level}</div>
                            <div class="text-[10px] text-gray-400">المستوى</div>
                        </div>
                        <div class="text-center py-2">
                            <div class="text-lg font-bold text-purple-400">${profileUser.friendsCount ?? 0}</div>
                            <div class="text-[10px] text-gray-400">الأصدقاء</div>
                        </div>
                    </div>

                    <div class="grid grid-cols-2 gap-1.5 px-3 py-2.5 text-[11px]">
                        <div class="flex items-center gap-1.5 bg-gray-800/40 rounded-lg px-2 py-1.5">
                            <i class="fas ${genderInfo.icon} ${genderInfo.color} w-3 text-center"></i>
                            <span>${genderInfo.text}</span>
                        </div>
                        <div class="flex items-center gap-1.5 bg-gray-800/40 rounded-lg px-2 py-1.5">
                            <i class="fas fa-birthday-cake text-pink-400 w-3 text-center"></i>
                            <span>${profileUser.age} سنة</span>
                        </div>
                        <div class="flex items-center gap-1.5 bg-gray-800/40 rounded-lg px-2 py-1.5">
                            <i class="fas ${socialInfo.icon} text-red-400 w-3 text-center"></i>
                            <span>${socialInfo.text}</span>
                        </div>
                        <div class="flex items-center gap-1.5 bg-gray-800/40 rounded-lg px-2 py-1.5">
                            <i class="fas ${educationInfo.icon} text-blue-400 w-3 text-center"></i>
                            <span>${educationInfo.text}</span>
                        </div>
                    </div>

                    <div id="profile-action-buttons" class="grid grid-cols-6 gap-1 border-t border-gray-700/50 p-2 bg-black/10">
                        ${friendButtonHTML}
                        <button class="action-btn message-btn" data-user-id="${profileUser._id}">
                              <i class="fas fa-comment-dots"></i>
                           <span class="text-[9px] mt-0.5">رسالة</span>
                         </button>
                        <button class="action-btn gift-action-btn text-pink-400 hover:bg-pink-900" data-user-id="${profileUser._id}">
                            <i class="fas fa-gift"></i>
                            <span class="text-[9px] mt-0.5">هدية</span>
                        </button>
                        ${blockButtonHTML}
                        <button class="action-btn report-user-btn text-orange-400 hover:bg-orange-900" data-user-id="${profileUser._id}" data-username="${profileUser.username}">
                            <i class="fas fa-flag"></i>
                            <span class="text-[9px] mt-0.5">إبلاغ</span>
                        </button>
                        <button class="action-btn close-mini-profile-btn">
                            <i class="fas fa-times"></i>
                            <span class="text-[9px] mt-0.5">إغلاق</span>
                        </button>
                    </div>
                </div>
            </div>
        `;

         document.getElementById('game-container').insertAdjacentHTML('beforeend', modalHTML);
        const modal = document.getElementById('mini-profile-modal');
        modal.dataset.userId = profileUser._id;
        
        // ✅ الإصلاح 3 (الوميض): تم حذف معالج زر الصداقة المكرر من هنا نهائياً.
        // المعالج العام في document.body يتكفل به وحده الآن، فلا يوجد استدعاء مزدوج بعد اليوم
        modal.addEventListener('click', (e) => {
            if (e.target.id === 'mini-profile-modal') {
                modal.remove();
                return;
            }

            if (e.target.closest('#mini-profile-avatar-img')) {
                const targetUid = profileUser._id;
                modal.remove();
                showFullProfilePage(targetUid);
                return;
            }
            
            if (e.target.closest('.copy-id-btn')) {
                const idToCopy = profileUser.customId;
                
                navigator.clipboard.writeText(idToCopy)
                    .then(() => {
                        const copyNotification = document.createElement('div');
                        copyNotification.innerHTML = `
                            <div class="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 
                                        bg-green-500/90 text-white px-6 py-3 rounded-full shadow-2xl 
                                        flex items-center gap-3 z-[300] animate-pulse">
                                <i class="fas fa-check-circle text-xl"></i>
                                <span class="font-bold">تم نسخ الـ ID!</span>
                            </div>
                        `;
                        document.body.appendChild(copyNotification);
                        
                        setTimeout(() => {
                            copyNotification.remove();
                        }, 2000);
                    })
                    .catch(err => {
                        console.error('Failed to copy ID:', err);
                        showNotification('فشل نسخ الـ ID', 'error');
                    });
                return;
            }

                       if (e.target.closest('.message-btn')) {
                const clickedUserId = e.target.closest('.message-btn').dataset.userId;
                const username = e.target.closest('.message-btn').closest('#mini-profile-modal')?.querySelector('h2')?.textContent || 'المستخدم';
                
                // ✅ الإصلاح: إذا كانت نفس المحادثة مفتوحة أصلاً خلف البروفايل، نغلق البروفايل فقط
                // بدل فتح نافذة دردشة مكررة فوقها
                const existingChatModal = document.getElementById('private-chat-modal');
                if (existingChatModal && existingChatModal.dataset.targetUserId === clickedUserId) {
                    modal.remove();
                } else {
                    modal.remove();
                    openPrivateChat(clickedUserId, username);
                }
                return;
            }

                        // زر إرسال هدية
            if (e.target.closest('.gift-action-btn')) {
                if (profileUser.isBot) {
                    showFloatingAlert('لا يمكن إرسال هدايا لهذا الحساب', 'fa-robot', 'bg-purple-600');
                    return;
                }
                const giftTargetId = e.target.closest('.gift-action-btn').dataset.userId;
                const giftUsername = modal.querySelector('h2')?.textContent || 'المستخدم';
                showGiftStoreModal(giftTargetId, giftUsername);
                return;
            }
            
            if (e.target.closest('.block-action-btn')) {
                if (profileUser.isBot) {
                    showFloatingAlert('لا يمكنك حظر الحساب الرسمي للمنصة', 'fa-robot', 'bg-purple-600');
                    return;
                }
                const userIdToBlock = e.target.closest('.block-action-btn').dataset.userId;
                blockUser(userIdToBlock, modal);
                return;
            }
            
            if (e.target.closest('.unblock-action-btn')) {
                const userIdToUnblock = e.target.closest('.unblock-action-btn').dataset.userId;
                unblockUser(userIdToUnblock, modal);
                return;
            }
                        if (e.target.closest('.report-user-btn')) {
                if (profileUser.isBot) {
                    showFloatingAlert('لا يمكن الإبلاغ عن الحساب الرسمي للمنصة', 'fa-robot', 'bg-purple-600');
                    return;
                }
                const btn = e.target.closest('.report-user-btn');
                showReportModal({ type: 'user', reportedUserId: btn.dataset.userId, reportedUsername: btn.dataset.username });
                return;
            }
            
            if (e.target.closest('.close-mini-profile-btn')) {
                modal.remove();
                return;
            }
        });

    } catch (error) {
        console.error("Error showing mini profile:", error);
        const loadingShell = document.getElementById('mini-profile-modal');
        if (loadingShell) loadingShell.remove();
                showNotification('لا يمكن عرض ملف المستخدم حاليًا.', 'error');
    }
}

// --- ✅ صفحة الملف الشخصي الكامل — نافذة سفلية كبيرة بكل التفاصيل (المستوى، الهدايا، الإحصائيات) ---
// ✅ إغلاق بمؤثر انزلاق للأسفل (بدل اختفاء فوري) — يطابق مؤثر الدخول (slideUp) باتجاه معاكس،
// وينتظر انتهاء الأنيميشن فعلياً قبل حذف العنصر من الـDOM
function closeFullProfilePage() {
    const page = document.getElementById('full-profile-page');
    const sheet = document.getElementById('full-profile-sheet');
    if (!page || !sheet) { page?.remove(); return; }
    page.classList.add('full-profile-backdrop-exit');
    sheet.classList.add('full-profile-exit');
    setTimeout(() => page.remove(), 280);
}

async function showFullProfilePage(userId) {
    const existing = document.getElementById('full-profile-page');
    if (existing) existing.remove();

    const shellHTML = `
        <div id="full-profile-page" class="full-profile-page-backdrop">
            <div id="full-profile-sheet" class="full-profile-sheet">
                <button id="close-full-profile" class="full-profile-close-btn"><i class="fas fa-times"></i></button>
                <div id="full-profile-body" class="flex-1 overflow-y-auto">
                    <div class="text-center text-gray-400 py-16"><i class="fas fa-spinner fa-spin text-2xl"></i></div>
                </div>
            </div>
        </div>
    `;
    document.getElementById('game-container').insertAdjacentHTML('beforeend', shellHTML);
    const page = document.getElementById('full-profile-page');
    document.getElementById('close-full-profile').addEventListener('click', closeFullProfilePage);
    page.addEventListener('click', (e) => { if (e.target.id === 'full-profile-page') closeFullProfilePage(); });

    try {
        const userRes = await fetch(`/api/users/${userId}`, { headers: { 'Authorization': `Bearer ${token}` } }).then(r => r.json());

        if (userRes.status !== 'success') throw new Error();
        const u = userRes.data.user;
        const socialInfo = getSocialStatus(u.socialStatus);
        const educationInfo = getEducationStatus(u.educationStatus);
        const genderInfo = u.gender === 'male' ? { text: 'ذكر', icon: 'fa-mars', color: 'text-blue-400' } : { text: 'أنثى', icon: 'fa-venus', color: 'text-pink-400' };

        const body = document.getElementById('full-profile-body');
        body.innerHTML = `
            <div class="full-profile-cover">
                <img src="${u.profileImage}" class="full-profile-avatar ${u.activeFrameClass || ''}">
            </div>
            <div class="full-profile-identity">
                <h2 class="full-profile-name">${escapeHtml(u.username)} ${getAgentBadgeHTML(u.isAgent)}</h2>
                <p class="full-profile-id">ID: ${escapeHtml(String(u.customId || ''))}</p>
                <div class="full-profile-badge-row">
                    <span class="full-profile-mini-badge"><i class="fas fa-star text-yellow-400"></i> Lv.${u.level || 1}</span>
                    <span class="full-profile-mini-badge"><i class="fas ${genderInfo.icon} ${genderInfo.color}"></i> ${genderInfo.text}</span>
                    <span class="full-profile-mini-badge"><i class="fas fa-birthday-cake text-pink-400"></i> ${u.age} سنة</span>
                </div>
            </div>

            <div class="full-profile-stats-row">
                <button type="button" id="full-profile-following-stat" class="full-profile-stat-clickable">
                    <span class="full-profile-stat-num">${u.followingCount ?? 0}</span>
                    <span class="full-profile-stat-label">متابَعة</span>
                </button>
                <button type="button" id="full-profile-followers-stat" class="full-profile-stat-clickable">
                    <span class="full-profile-stat-num">${u.followersCount ?? 0}</span>
                    <span class="full-profile-stat-label">متابعون</span>
                </button>
            </div>

            <!-- ✅ بطاقة "الإنجازات" — واجهة فقط حالياً (سيُبنى نظامها لاحقاً)، بشارة "قريباً" واضحة -->
            <div class="px-4 mb-3">
                <div class="full-profile-achievements-card">
                    <div class="full-profile-card-header">
                        <span><i class="fas fa-medal"></i> الإنجازات</span>
                        <span class="full-profile-soon-tag">قريباً</span>
                    </div>
                    <div class="full-profile-achievements-row">
                        ${Array.from({ length: 5 }, () => '<span class="full-profile-achievement-slot"><i class="fas fa-trophy"></i></span>').join('')}
                    </div>
                </div>
            </div>

            <!-- ✅ بطاقتا "نادي المعجبين" و"الحماة" — واجهة فقط حالياً، جنباً إلى جنب -->
            <div class="grid grid-cols-2 gap-2 px-4 mb-4">
                <div class="full-profile-mini-card">
                    <i class="fas fa-users full-profile-mini-card-icon" style="color:#f472b6"></i>
                    <p class="full-profile-mini-card-title">نادي المعجبين</p>
                    <span class="full-profile-soon-tag">قريباً</span>
                </div>
                <div class="full-profile-mini-card">
                    <i class="fas fa-shield-halved full-profile-mini-card-icon" style="color:#60a5fa"></i>
                    <p class="full-profile-mini-card-title">الحماة</p>
                    <span class="full-profile-soon-tag">قريباً</span>
                </div>
            </div>

            <p class="text-xs text-gray-400 px-4 mb-2">المعلومات الشخصية</p>
            <div class="grid grid-cols-2 gap-2 px-4 mb-4 text-xs">
                <div class="flex items-center gap-2 bg-gray-800/40 rounded-lg px-3 py-2">
                    <i class="fas ${socialInfo.icon} text-red-400 w-4 text-center"></i><span>${socialInfo.text}</span>
                </div>
                <div class="flex items-center gap-2 bg-gray-800/40 rounded-lg px-3 py-2">
                    <i class="fas ${educationInfo.icon} text-blue-400 w-4 text-center"></i><span>${educationInfo.text}</span>
                </div>
            </div>

            <div class="px-4 pb-4">
                <p class="text-xs text-gray-400 mb-1">الحالة</p>
                <p class="text-xs text-gray-200 italic bg-gray-800/40 rounded-lg px-3 py-2">${escapeHtml(u.status || '🚀 جاهز للتحديات!')}</p>
            </div>

            ${userId !== myUserId ? `
            <div class="px-4 pb-5 flex items-center gap-2">
                <button id="full-profile-follow-btn" class="full-profile-action-btn full-profile-action-follow ${u.isFollowing ? 'following' : ''}">
                    <i class="fas ${u.isFollowing ? 'fa-check' : 'fa-plus'}"></i> ${u.isFollowing ? 'متابَع' : 'متابعة'}
                </button>
                <button id="full-profile-message-btn" class="full-profile-action-btn full-profile-action-icon" title="رسالة"><i class="fas fa-comment-dots"></i></button>
                <button id="full-profile-like-gift-btn" class="full-profile-action-btn full-profile-action-icon" title="إعجاب / هدية سريعة"><i class="fas fa-heart"></i></button>
                <button id="full-profile-poke-btn" class="full-profile-action-btn full-profile-action-icon" title="نكزة"><i class="fas fa-hand-point-up"></i></button>
            </div>
            ` : ''}
        `;

        document.getElementById('full-profile-following-stat').addEventListener('click', () => {
            showFollowConnectionsSheet(userId, u.username, 'following');
        });
        document.getElementById('full-profile-followers-stat').addEventListener('click', () => {
            showFollowConnectionsSheet(userId, u.username, 'followers');
        });

        if (userId !== myUserId) {
            document.getElementById('full-profile-follow-btn').addEventListener('click', async () => {
                const btn = document.getElementById('full-profile-follow-btn');
                const nowFollowing = !btn.classList.contains('following');
                btn.disabled = true;
                try {
                    const response = await fetch(`/api/users/${userId}/follow`, { method: nowFollowing ? 'POST' : 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
                    const result = await response.json();
                    if (response.ok) {
                        btn.classList.toggle('following', nowFollowing);
                        btn.innerHTML = nowFollowing ? '<i class="fas fa-check"></i> متابَع' : '<i class="fas fa-plus"></i> متابعة';
                    } else {
                        showNotification(result.message || 'تعذر تنفيذ الطلب', 'error');
                    }
                } catch (error) {
                    showNotification('حدث خطأ، حاول مجدداً', 'error');
                } finally {
                    btn.disabled = false;
                }
            });
            document.getElementById('full-profile-message-btn').addEventListener('click', () => {
                closeFullProfilePage();
                openPrivateChat(userId, u.username);
            });
            document.getElementById('full-profile-like-gift-btn').addEventListener('click', () => {
                showQuickGiftPicker(userId, u.username);
            });
            document.getElementById('full-profile-poke-btn').addEventListener('click', async (e) => {
                const btn = e.currentTarget;
                btn.disabled = true;
                try {
                    const response = await fetch(`/api/users/${userId}/poke`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` } });
                    if (response.ok) showNotification(`تم نكز ${u.username} 👋`, 'success');
                    else { const r = await response.json(); showNotification(r.message || 'تعذر إرسال النكزة', 'error'); }
                } catch (error) {
                    showNotification('حدث خطأ، حاول مجدداً', 'error');
                } finally {
                    btn.disabled = false;
                }
            });
        }
    } catch (error) {
        console.error('[FULL PROFILE] Error:', error);
        document.getElementById('full-profile-body').innerHTML = `<div class="text-center text-red-400 py-16">فشل تحميل الملف الشخصي</div>`;
    }
}

// ✅ هدية سريعة — شريط صور أفقي (شريط فيلم) بدل نافذة متجر الهدايا الكاملة: اختيار هدية
// واحدة بلمسة، وزر إرسال واحد كبير أسفله (كمية 1 دائماً). يعيد استخدام كتالوج/بطاقة الهدايا
// الموجودَين أصلاً (renderGiftCardHTML، /api/gifts/shop) بدل بناء نظام مستقل من الصفر
async function showQuickGiftPicker(targetUserId, targetUsername) {
    document.getElementById('quick-gift-picker')?.remove();
    const modal = document.createElement('div');
    modal.id = 'quick-gift-picker';
    modal.className = 'fixed inset-0 bg-black/75 z-[335] flex items-end justify-center';
    modal.innerHTML = `
        <div class="quick-gift-card">
            <div class="flex items-center justify-between p-3 border-b border-gray-700 flex-shrink-0">
                <p class="font-bold text-sm"><i class="fas fa-heart text-pink-400"></i> إعجاب سريع لـ ${escapeHtml(targetUsername)}</p>
                <button id="close-quick-gift" class="profile-hub-icon-btn"><i class="fas fa-times"></i></button>
            </div>
            <div id="quick-gift-strip" class="quick-gift-strip">
                <div class="w-full text-center text-gray-400 py-8"><i class="fas fa-spinner fa-spin"></i></div>
            </div>
            <div class="p-3 border-t border-gray-700 flex-shrink-0">
                <button id="quick-gift-send-btn" class="profile-hub-action-btn profile-hub-action-primary w-full justify-center" disabled>
                    <i class="fas fa-paper-plane"></i> اختر هدية أولاً
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target.id === 'quick-gift-picker') modal.remove(); });
    document.getElementById('close-quick-gift').addEventListener('click', () => modal.remove());

    let selectedGift = null;
    try {
        const response = await fetch('/api/gifts/shop', { headers: { 'Authorization': `Bearer ${token}` } });
        const result = await response.json();
        const strip = document.getElementById('quick-gift-strip');
        if (!strip) return;
        const gifts = result.status === 'success' ? result.data.gifts : [];
        if (!gifts || gifts.length === 0) {
            strip.innerHTML = '<p class="text-xs text-gray-500 w-full text-center py-8">لا توجد هدايا متاحة حالياً</p>';
            return;
        }
        strip.innerHTML = gifts.map(g => `
            <button type="button" class="quick-gift-item" data-gift-id="${g._id}" data-gift-name="${escapeHtml(g.name)}" data-gift-image="${g.imageUrl || ''}" data-gift-icon="${g.icon || '🎁'}" data-gift-price="${g.discountedPrice || g.price}">
                <div class="quick-gift-item-visual">${g.imageUrl ? `<img src="${g.imageUrl}">` : `<span>${g.icon || '🎁'}</span>`}</div>
                <span class="quick-gift-item-name">${escapeHtml(g.name)}</span>
                <span class="quick-gift-item-price"><i class="fas fa-coins"></i> ${g.discountedPrice || g.price}</span>
            </button>
        `).join('');
        const sendBtn = document.getElementById('quick-gift-send-btn');
        strip.querySelectorAll('.quick-gift-item').forEach(item => {
            item.addEventListener('click', () => {
                strip.querySelectorAll('.quick-gift-item').forEach(i => i.classList.remove('selected'));
                item.classList.add('selected');
                selectedGift = {
                    id: item.dataset.giftId, name: item.dataset.giftName,
                    image: item.dataset.giftImage, icon: item.dataset.giftIcon, price: item.dataset.giftPrice
                };
                sendBtn.disabled = false;
                sendBtn.innerHTML = `<i class="fas fa-paper-plane"></i> إرسال ${escapeHtml(selectedGift.name)}`;
            });
        });
    } catch (error) {
        const strip = document.getElementById('quick-gift-strip');
        if (strip) strip.innerHTML = '<p class="text-xs text-red-400 w-full text-center py-8">تعذر تحميل الهدايا</p>';
    }

    document.getElementById('quick-gift-send-btn').addEventListener('click', async () => {
        if (!selectedGift) return;
        const sendBtn = document.getElementById('quick-gift-send-btn');
        sendBtn.disabled = true;
        sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        try {
            const response = await fetch('/api/gifts/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ receiverId: targetUserId, giftId: selectedGift.id, quantity: 1, context: 'private_chat' })
            });
            const result = await response.json();
            if (!response.ok) {
                showNotification(result.message || 'تعذر إرسال الهدية', 'error');
                sendBtn.disabled = false;
                sendBtn.innerHTML = `<i class="fas fa-paper-plane"></i> إرسال ${escapeHtml(selectedGift.name)}`;
                return;
            }
            const syncedUser = JSON.parse(localStorage.getItem('user'));
            if (syncedUser) { syncedUser.coins = result.data.newSenderCoins; localStorage.setItem('user', JSON.stringify(syncedUser)); }
            const coinsEl = document.getElementById('coins');
            if (coinsEl) coinsEl.textContent = result.data.newSenderCoins;
            modal.remove();
            showGiftThankYouModal(targetUsername, selectedGift);
        } catch (error) {
            showNotification('حدث خطأ، حاول مجدداً', 'error');
            sendBtn.disabled = false;
            sendBtn.innerHTML = `<i class="fas fa-paper-plane"></i> إرسال ${escapeHtml(selectedGift.name)}`;
        }
    });
}

// ✅ نافذة شكر بعد إرسال هدية سريعة — احتفال بصري بسيط (قصاصات ورقية + قفزة الصورة) بدل
// إغلاق صامت، تشجيعاً للتفاعل المتكرر
function showGiftThankYouModal(targetUsername, gift) {
    document.getElementById('gift-thank-you-modal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'gift-thank-you-modal';
    modal.className = 'fixed inset-0 bg-black/75 z-[340] flex items-center justify-center p-4';
    modal.innerHTML = `
        <div class="gift-thankyou-card">
            <div class="gift-thankyou-visual">${gift.image ? `<img src="${gift.image}">` : `<span>${gift.icon || '🎁'}</span>`}</div>
            <p class="gift-thankyou-title">شكراً لدعمك يا ${escapeHtml(targetUsername)}! 💜</p>
            <p class="gift-thankyou-sub">تم إرسال "${escapeHtml(gift.name)}" بنجاح</p>
            <button id="close-gift-thankyou" class="profile-hub-action-btn profile-hub-action-primary w-full justify-center mt-3">تمام</button>
        </div>
    `;
    document.body.appendChild(modal);
    fireConfettiBurst(['#ec4899', '#a855f7', '#fbbf24']);
    document.getElementById('close-gift-thankyou').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => { if (e.target.id === 'gift-thank-you-modal') modal.remove(); });
}

        // --- 🧩 دالة مساعدة: تُرجع HTML شريط إدخال الدردشة الخاصة (نص مرة واحدة، تُستخدم بأكثر من مكان) ---
function getChatInputAreaHTML() {
    return `
        <div id="chat-options-bar" class="hidden mb-3 p-3 bg-gray-800/50 rounded-xl">
            <div class="grid grid-cols-3 gap-3 text-center">
                <button class="chat-media-btn" data-type="image">
                    <i class="fas fa-image text-2xl text-green-400 mb-1"></i>
                    <span class="text-xs">صورة</span>
                </button>
                <button class="chat-media-btn" data-type="video">
                    <i class="fas fa-video text-2xl text-blue-400 mb-1"></i>
                    <span class="text-xs">فيديو</span>
                </button>
                <button class="chat-media-btn" data-type="file">
                    <i class="fas fa-file text-2xl text-yellow-400 mb-1"></i>
                    <span class="text-xs">ملف</span>
                </button>
            </div>
        </div>
        
        <div class="flex items-center gap-2">
            <button id="toggle-chat-options" class="bg-gray-700 hover:bg-gray-600 w-10 h-10 rounded-full flex items-center justify-center">
                <i class="fas fa-plus text-gray-300"></i>
            </button>

            <button id="open-inline-gift-btn" class="bg-pink-600/80 hover:bg-pink-600 w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" title="إرسال هدية">
                <i class="fas fa-gift text-white"></i>
            </button>
            
            <div class="flex-1 relative">
                <input type="text" id="private-message-input" 
                       placeholder="اكتب رسالتك هنا..." 
                       maxlength="200"
                       class="w-full bg-gray-700 border border-gray-600 rounded-full py-3 px-5 pr-12 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent">
                <div id="private-char-count" class="absolute top-1/2 right-4 transform -translate-y-1/2 text-xs text-gray-500">0/200</div>
            </div>
            
            <button id="send-private-message" 
    class="dynamic-send-btn bg-purple-600 hover:bg-purple-700 w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300"
    data-mode="voice">
<i class="fas fa-microphone text-white"></i>
</button>
        </div>
    `;
}

// --- 🔓 إعادة شريط الإدخال الطبيعي فوراً بعد رفع الحظر، دون إغلاق وإعادة فتح النافذة بالكامل ---
function restoreChatInputArea(targetUserId) {
    const inputArea = document.getElementById('private-chat-input-area');
    if (!inputArea) return;

    inputArea.innerHTML = getChatInputAreaHTML();
    setupPrivateChatEvents(targetUserId);
}

        
// --- 📨 دالة فتح الدردشة الخاصة ---
async function openPrivateChat(targetUserId, targetUsername = 'المستخدم', miniMode = false) {
    console.log(`[CHAT] Opening private chat with: ${targetUserId} (${targetUsername})`);
    
    const profileModal = document.getElementById('mini-profile-modal');
    if (profileModal) profileModal.remove();

    // ✅ منع تكرار نوافذ الدردشة: إذا فيه نافذة مفتوحة لشخص آخر، نغلقها أولاً
    const existingChatModal = document.getElementById('private-chat-modal');
    if (existingChatModal) existingChatModal.remove();

    // ✅ وضع مصغّر: نافذة عائمة صغيرة بزاوية الشاشة (تبقي الغرفة ظاهرة خلفها) بدل تغطية الشاشة كاملة —
    // يُستخدم عند فتح الدردشة من فقاعة رسالة واردة وأنت داخل غرفة صوتية
    const wrapperClass = miniMode
        ? 'fixed bottom-20 md:bottom-6 left-2 md:left-6 z-[300] w-[88vw] max-w-[320px]'
        : 'fixed inset-0 bg-black/80 flex items-center justify-center z-[300] p-2 md:p-4';
    const cardClass = miniMode
        ? 'bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl shadow-2xl w-full h-[65vh] max-h-[420px] flex flex-col overflow-hidden border-2 border-purple-500/40'
        : 'bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl h-[85vh] md:h-[80vh] flex flex-col overflow-hidden border-2 border-purple-500/30';

    const chatHTML = `
        <div id="private-chat-modal" data-target-user-id="${targetUserId}" class="${wrapperClass}">
            <div class="${cardClass}">
                
                <div class="flex items-center justify-between p-4 bg-gray-900/80 border-b border-gray-700">
                    <div class="flex items-center gap-3">
                        <button id="close-private-chat" class="text-gray-400 hover:text-white p-2 rounded-full hover:bg-gray-700">
                            <i class="fas fa-arrow-right text-lg"></i>
                        </button>
                        <img id="chat-user-avatar" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Crect width='40' height='40' fill='%234b5563'/%3E%3C/svg%3E" alt="${targetUsername}" 
                             class="w-10 h-10 rounded-full border-2 border-purple-500 object-cover">
                        <div>
                            <h3 id="chat-user-name" class="font-bold text-white">${targetUsername}</h3>
                            <p id="chat-user-status" class="text-xs text-gray-400">
                                <i class="fas fa-circle text-green-500 mr-1"></i> متصل الآن
                            </p>
                        </div>
                    </div>
                    
                    <div class="flex items-center gap-2">
                        <button id="chat-actions-btn" class="chat-action-btn" title="إجراءات">
                            <i class="fas fa-ellipsis-v text-gray-400 hover:text-white"></i>
                        </button>
                        <button id="chat-call-btn" class="chat-action-btn" title="مكالمة صوتية">
                            <i class="fas fa-phone-alt text-gray-400 hover:text-blue-400"></i>
                        </button>
                        <button id="chat-info-btn" class="chat-action-btn" title="معلومات">
                            <i class="fas fa-info-circle text-gray-400 hover:text-purple-400"></i>
                        </button>
                    </div>
                </div>
                
                <div id="private-chat-messages" class="flex-1 overflow-y-auto p-4 space-y-3 bg-gradient-to-b from-gray-900 to-gray-800">
                    <div class="text-center text-gray-500 py-8">
                        <i class="fas fa-spinner fa-spin text-2xl mb-3"></i>
                        <p class="text-sm">جاري تحميل المحادثة...</p>
                    </div>
                </div>
                
                                <div id="private-chat-input-area" class="p-3 border-t border-gray-700 bg-gray-900/50">
                    ${getChatInputAreaHTML()}
                </div>
    `;
    
    document.getElementById('game-container').insertAdjacentHTML('beforeend', chatHTML);
    
    setupPrivateChatEvents(targetUserId);

    const [blockCheckResult] = await Promise.allSettled([
        fetch(`/api/blocks/mutual-status/${targetUserId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        }).then(r => r.json()),
        loadChatUserData(targetUserId),
        loadChatHistoryFromServer(targetUserId)
    ]);

        if (blockCheckResult.status === 'fulfilled') {
        const blockResult = blockCheckResult.value;
        const status = blockResult?.data?.blockStatus;

        // ✅ الإصلاح: لا نمنع الشخص المحظور من فتح الدردشة أو الكتابة إطلاقاً
        // رسائله تُرسل من ناحيته بشكل طبيعي تماماً، دون أي إشارة تكشف له أنه محظور

        if (status?.iBlockedHim) {
            lockChatForBlockedUser(targetUserId, targetUsername);
        }
    }
}

// --- 🔒 قفل شريط الإدخال عند وجود حظر من طرفي أنا للمستخدم الآخر ---
function lockChatForBlockedUser(targetUserId, targetUsername) {
    const inputArea = document.getElementById('private-chat-input-area');
    if (!inputArea) return;

    inputArea.innerHTML = `
        <div class="text-center">
            <p class="text-sm text-red-400 mb-3">
                <i class="fas fa-ban mr-1"></i> لقد قمت بحظر ${targetUsername}، لا يمكنك مراسلته
            </p>
            <div class="flex gap-2">
                <button id="locked-chat-unblock-btn" class="flex-1 bg-green-600 hover:bg-green-700 text-white py-2.5 rounded-lg text-sm font-bold">
                    <i class="fas fa-unlock mr-1"></i> رفع الحظر
                </button>
                <button id="locked-chat-delete-btn" class="flex-1 bg-red-600 hover:bg-red-700 text-white py-2.5 rounded-lg text-sm font-bold">
                    <i class="fas fa-trash mr-1"></i> حذف المحادثة
                </button>
            </div>
        </div>
    `;

        document.getElementById('locked-chat-unblock-btn').addEventListener('click', () => {
        unblockUser(targetUserId, null);
    });

    document.getElementById('locked-chat-delete-btn').addEventListener('click', () => {
        showConfirmationModal('هل أنت متأكد من حذف هذه المحادثة من قائمتك؟', async () => {
            try {
                const response = await fetch(`/api/private-chat/chat/${targetUserId}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (response.ok) {
                    showNotification('تم حذف المحادثة', 'success');
                    const modal = document.getElementById('private-chat-modal');
                    if (modal) modal.remove();
                    if (document.getElementById('messages-list-container')) loadMessagesList();
                } else {
                    showNotification('فشل حذف المحادثة', 'error');
                }
            } catch (error) {
                console.error('[DELETE CHAT] Error:', error);
                showNotification('خطأ في الاتصال بالخادم', 'error');
            }
        });
    });
}

// شارة كاملة (للأماكن الواسعة: البروفايل المصغر، الشريط الجانبي)
function getAgentBadgeHTML(isAgent) {
    if (!isAgent) return '';
    return `<span class="inline-flex items-center gap-1 bg-gradient-to-r from-green-500 to-emerald-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full align-middle" title="وكيل شحن معتمد"><i class="fas fa-shield-halved"></i> وكيل موثّق</span>`;
}

// أيقونة مصغرة (للأماكن الضيقة: قائمة الرسائل، رأس الدردشة)
function getAgentBadgeIconHTML(isAgent) {
    if (!isAgent) return '';
    return `<i class="fas fa-shield-halved text-green-400 text-xs" title="وكيل شحن معتمد"></i>`;
}

// تطبيق إطار الصورة الشخصية (كلاس CSS ثابت، وليس Tailwind ديناميكي)
function applyFrameToAvatar(imgEl, activeFrameClass) {
    if (!imgEl) return;
    imgEl.classList.forEach(cls => {
        if (cls.startsWith('profile-frame-')) imgEl.classList.remove(cls);
    });
    if (activeFrameClass) {
        imgEl.classList.add(activeFrameClass);
    }
}
        

// =================================================
// ============ نظام الهدايا (Gifts) ================
// =================================================

async function showGiftStoreModal(targetUserId, targetUsername) {
    const existing = document.getElementById('gift-store-modal');
    if (existing) existing.remove();

    const shellHTML = `
        <div id="gift-store-modal" class="fixed inset-0 bg-black/80 flex items-center justify-center z-[320] p-4">
            <div class="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl shadow-2xl w-full max-w-lg text-white border border-gray-700 max-h-[85vh] flex flex-col">
                    <div class="flex items-center justify-between p-4 border-b border-gray-700 flex-shrink-0">
                    <h3 class="text-lg font-bold flex items-center gap-2"><i class="fas fa-gift text-pink-400"></i> إرسال هدية لـ ${targetUsername}</h3>
                    <div class="flex items-center gap-1">
                        <button id="gift-store-support-btn" class="report-issue-icon-btn" title="الإبلاغ عن مشكلة"><i class="fas fa-exclamation-triangle"></i></button>
                        <button id="close-gift-store" class="text-gray-400 hover:text-white p-2"><i class="fas fa-times"></i></button>
                    </div>
                </div>
                <div id="gift-store-body" class="p-4 overflow-y-auto flex-1">
                    <div class="text-center text-gray-400 py-10"><i class="fas fa-spinner fa-spin text-2xl"></i></div>
                </div>
                <div id="gift-store-footer"></div>
            </div>
        </div>
    `;

    document.getElementById('game-container').insertAdjacentHTML('beforeend', shellHTML);
    const modal = document.getElementById('gift-store-modal');

    // ✅ إغلاق مباشر بدون تأكيد — إرسال هدية ليس عملية بيانات طويلة يخشى فقدانها
     document.getElementById('close-gift-store').addEventListener('click', () => modal.remove());
    document.getElementById('gift-store-support-btn').addEventListener('click', () => showQuickSupportModal('gift_issue', 'مشكلة في إرسال الهدايا'));
    modal.addEventListener('click', (e) => { if (e.target.id === 'gift-store-modal') modal.remove(); });

    try {
        const response = await fetch('/api/gifts/shop', { headers: { 'Authorization': `Bearer ${token}` } });
        const result = await response.json();
        if (!response.ok || result.status !== 'success') throw new Error('فشل تحميل المتجر');

        const gifts = result.data.gifts;
        const currentUser = JSON.parse(localStorage.getItem('user'));
        const body = document.getElementById('gift-store-body');
        const footer = document.getElementById('gift-store-footer');
        if (!body || !footer) return;

        body.innerHTML = `<div id="gift-cards-grid" class="grid grid-cols-3 gap-2">${gifts.map(g => renderGiftCardHTML(g)).join('')}</div>`;
        footer.innerHTML = renderGiftFooterHTML(currentUser.coins || 0);

        wireGiftImageFallbacks(body);
        const { getSelectedGift, getQuantity } = wireGiftSelectionAndQty(modal, () => {});

        const sendBtn = footer.querySelector('.gift-send-main-btn');
        setupGiftSendButton(sendBtn, async () => {
            const gift = getSelectedGift();
            const quantity = getQuantity();
            if (!gift) return false;

            const localUser = JSON.parse(localStorage.getItem('user'));
            const totalCost = gift.price * quantity;
            if (!localUser || localUser.coins < totalCost) {
                showFloatingAlert('رصيد الكوينز غير كافٍ للإرسال', 'fa-coins', 'bg-red-500');
                return false;
            }

            // ✅ تحديث متفائل فوري
            localUser.coins -= totalCost;
            localStorage.setItem('user', JSON.stringify(localUser));
            const coinsEl = document.getElementById('coins');
            if (coinsEl) coinsEl.textContent = localUser.coins;
            footer.querySelectorAll('.gift-footer-balance').forEach(el => el.textContent = localUser.coins);

            showGiftFloatingAnimation(gift.imageUrl, gift.name, 'أنت', quantity, targetUserId);

            try {
                const response2 = await fetch('/api/gifts/send', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ receiverId: targetUserId, giftId: gift.id, quantity, context: 'private_chat' })
                });
                const result2 = await response2.json();

                if (response2.ok) {
                    const syncedUser = JSON.parse(localStorage.getItem('user'));
                    if (syncedUser) {
                        syncedUser.coins = result2.data.newSenderCoins;
                        localStorage.setItem('user', JSON.stringify(syncedUser));
                    }
                    if (coinsEl) coinsEl.textContent = result2.data.newSenderCoins;
                    footer.querySelectorAll('.gift-footer-balance').forEach(el => el.textContent = result2.data.newSenderCoins);
                    if (result2.data.message) displayPrivateMessage(result2.data.message, true);

                    // ✅ عداد الدعم أسفل المقعد لو المستلم قاعد بنفس الغرفة المعروضة حالياً
                    notifyRoomGiftSupport(targetUserId, gift.price * quantity);
                    return true;
                } else {
                    const revertUser = JSON.parse(localStorage.getItem('user'));
                    if (revertUser) {
                        revertUser.coins += totalCost;
                        localStorage.setItem('user', JSON.stringify(revertUser));
                        if (coinsEl) coinsEl.textContent = revertUser.coins;
                        footer.querySelectorAll('.gift-footer-balance').forEach(el => el.textContent = revertUser.coins);
                    }
                    showFloatingAlert(result2.message || 'فشل إرسال الهدية', 'fa-exclamation-circle', 'bg-red-500');
                    return false;
                }
            } catch (error) {
                console.error('[GIFT SEND] Error:', error);
                return false;
            }
        });

    } catch (error) {
        console.error('[GIFT STORE] Error:', error);
        const body = document.getElementById('gift-store-body');
        if (body) body.innerHTML = `<div class="text-center text-red-400 py-10">فشل تحميل المتجر</div>`;
    }
}

// ✅ نافذة هدايا الغرفة — تحديد مستلم واحد أو عدة مستلمين من المقاعد الفعلية الجالسين حالياً، أو "الجميع"
// ✅ نافذة هدايا الغرفة — مسندلة من الأسفل بالهاتف (نافذة صغيرة مركزية بالكمبيوتر)، خلفية
// معتمة كباقي نوافذ المشروع، والضغط خارجها يغلقها — بلا هيدر/عنوان (أيقونة الهدية بشريط
// الغرفة أصلاً كافية كسياق)، بأسلوب نوافذ تطبيقات الهواتف المصغّرة.
async function showRoomGiftModal(roomId) {
    const existing = document.getElementById('room-gift-modal');
    if (existing) existing.remove();

    const shellHTML = `
        <div id="room-gift-modal" class="fixed inset-0 bg-black/60 flex items-end md:items-center justify-center z-[320] p-3">
            <div class="room-gift-sheet w-full md:max-w-sm text-white flex flex-col animate-[slideUp_0.25s_ease-out]">
                <div class="w-9 h-1 bg-gray-600 rounded-full mx-auto mt-2 mb-1 md:hidden flex-shrink-0"></div>
                <div class="gift-sheet-header flex-shrink-0">
                    <div id="room-gift-avatars" class="room-gift-avatar-row flex-1"></div>
                </div>
                <div id="room-gift-body" class="px-3 pb-2 overflow-y-auto flex-1">
                    <div class="text-center text-gray-400 py-10"><i class="fas fa-spinner fa-spin text-2xl"></i></div>
                </div>
                <div id="room-gift-footer"></div>
            </div>
        </div>
    `;

    document.getElementById('game-container').insertAdjacentHTML('beforeend', shellHTML);
    const modal = document.getElementById('room-gift-modal');
    modal.addEventListener('click', (e) => { if (e.target.id === 'room-gift-modal') modal.remove(); });

    try {
        const url = roomId === 'main' ? '/api/voice-room' : `/api/voice-room/rooms/${roomId}`;
        const [roomRes, shopRes] = await Promise.all([
            fetch(url, { headers: { 'Authorization': `Bearer ${token}` } }).then(r => r.json()),
            fetch('/api/gifts/shop', { headers: { 'Authorization': `Bearer ${token}` } }).then(r => r.json())
        ]);

        const gifts = shopRes.data.gifts;
        const currentUser = JSON.parse(localStorage.getItem('user')) || {};
        // 🐛 إصلاح: نفسي كنت أظهر ضمن قائمة "من أهدي؟" لو كنت جالساً على مقعد — تحديد هدية
        // لنفسي يُرفَض بالسيرفر بالفعل، لكن الواجهة كانت تخصم الرصيد وتُظهر شارة "دعمت نفسي"
        // على مقعدي بشكل متفائل قبل تأكيد السيرفر أصلاً؛ استبعادي من القائمة هنا يمنع المشكلة
        // من جذرها (لا خيار لاختيار نفسي إطلاقاً)، لا مجرد رفض الطلب لاحقاً بعد فوات الأوان
        const myIdStr = currentUser._id ? currentUser._id.toString() : null;
        const seatedUsers = (roomRes.seats || []).filter(s => s.user && s.user.id !== myIdStr).map(s => s.user);

        let selectedUserIds = new Set();
        let audienceMode = 'selected';

        const body = document.getElementById('room-gift-body');
        const footer = document.getElementById('room-gift-footer');
        if (!body || !footer) return;

        document.getElementById('room-gift-avatars').innerHTML = `
            ${seatedUsers.length === 0 ? '<p class="text-[11px] text-gray-500 py-1.5">لا يوجد أحد قاعد على مقعد حالياً</p>' : `
                <button id="select-all-seated-btn" class="room-gift-all-btn relative flex flex-col items-center gap-1 flex-shrink-0" title="إرسال للجميع">
                    <span class="room-gift-all-circle rg-avatar-img">All</span>
                    <span class="text-[8px] leading-tight text-gray-400">${seatedUsers.length}</span>
                </button>
                ${seatedUsers.map(u => `
                    <button class="room-gift-avatar-btn relative flex flex-col items-center gap-1 flex-shrink-0" data-user-id="${u.id}" data-username="${escapeHtml(u.username)}" title="${escapeHtml(u.username)}">
                        <span class="relative inline-block">
                            <img src="${u.profileImage}" class="rg-avatar-img">
                            <span class="rg-selected-badge hidden absolute -top-1 -left-1 w-3.5 h-3.5 bg-pink-500 rounded-full border-2 border-gray-900 items-center justify-center">
                                <i class="fas fa-check text-white" style="font-size:6px"></i>
                            </span>
                        </span>
                        <span class="text-[8px] leading-tight truncate w-10 text-center">${escapeHtml(u.username)}</span>
                    </button>
                `).join('')}
            `}
        `;
        body.innerHTML = `
            <div class="gift-category-tabs mb-2"></div>
            <div id="room-gift-cards-grid" class="room-gift-cards-grid grid grid-cols-3 gap-2">
                ${gifts.map(g => renderGiftCardHTML(g)).join('')}
            </div>
        `;
        footer.innerHTML = renderGiftFooterHTML(currentUser.coins || 0);

        wireGiftImageFallbacks(body);
        wireGiftCategoryTabs(body, gifts, '#room-gift-cards-grid');

        function markAllSelectedVisual(isAll) {
            document.getElementById('select-all-seated-btn')?.querySelector('.rg-avatar-img')?.classList.toggle('room-gift-all-active', isAll);
        }
        function clearIndividualSelectionVisuals() {
            modal.querySelectorAll('.room-gift-avatar-btn').forEach(b => {
                b.querySelector('.rg-avatar-img')?.classList.remove('ring-2', 'ring-pink-500');
                b.querySelector('.rg-selected-badge')?.classList.add('hidden');
                b.classList.remove('bg-pink-900/40');
            });
        }

        document.getElementById('select-all-seated-btn')?.addEventListener('click', () => {
            audienceMode = 'all';
            selectedUserIds.clear();
            clearIndividualSelectionVisuals();
            markAllSelectedVisual(true);
        });

        modal.querySelectorAll('.room-gift-avatar-btn').forEach(avatarBtn => {
            avatarBtn.addEventListener('click', () => {
                audienceMode = 'selected';
                markAllSelectedVisual(false);
                const uid = avatarBtn.dataset.userId;
                const img = avatarBtn.querySelector('.rg-avatar-img');
                const badge = avatarBtn.querySelector('.rg-selected-badge');
                if (selectedUserIds.has(uid)) {
                    selectedUserIds.delete(uid);
                    img.classList.remove('ring-2', 'ring-pink-500');
                    badge.classList.add('hidden');
                    avatarBtn.classList.remove('bg-pink-900/40');
                } else {
                    selectedUserIds.add(uid);
                    img.classList.add('ring-2', 'ring-pink-500');
                    badge.classList.remove('hidden');
                    badge.classList.add('flex');
                    avatarBtn.classList.add('bg-pink-900/40');
                }
            });
        });

        const { getSelectedGift, getQuantity } = wireGiftSelectionAndQty(modal, () => {});

        const sendBtn = footer.querySelector('.gift-send-main-btn');
        setupGiftSendButton(sendBtn, async () => {
            const gift = getSelectedGift();
            const quantity = getQuantity();
            if (!gift) return false;

            const recipients = audienceMode === 'all'
                ? seatedUsers.map(u => u.id)
                : [...selectedUserIds];
            if (recipients.length === 0) {
                showFloatingAlert('اختر مستلماً واحداً على الأقل', 'fa-user', 'bg-amber-500');
                return false;
            }

            const totalCost = gift.price * quantity * recipients.length;
            const localUser = JSON.parse(localStorage.getItem('user'));
            if (!localUser || localUser.coins < totalCost) {
                showFloatingAlert('رصيد الكوينز غير كافٍ للإرسال', 'fa-coins', 'bg-red-500');
                return false;
            }

            // ✅ تحديث متفائل فوري — نفس الرقم الذي سيؤكده السيرفر بالضبط لاحقاً (خصم واحد
            // بنداء واحد)، فلا "قفزة" مرئية للرصيد أبداً (كانت المشكلة سابقاً: حلقة نداءات
            // متتالية، كل استجابة ترجع الرصيد بعد خصم مستلم واحد فقط، فيبدو الرصيد "يصعد
            // وينزل" بالتتابع قبل أن يستقر أخيراً على الرقم الصحيح)
            localUser.coins -= totalCost;
            localStorage.setItem('user', JSON.stringify(localUser));
            const coinsEl = document.getElementById('coins');
            if (coinsEl) coinsEl.textContent = localUser.coins;
            footer.querySelectorAll('.gift-footer-balance').forEach(el => el.textContent = localUser.coins);

            // 🐛 إصلاح: كان يُستدعى هنا محلياً بالتفاؤل (نسخة) بينما صدى السيرفر room-gift-announcement
            // يستدعي أيضاً مؤثراً مختلفاً تماماً (showRoomGiftFlyAnimation المصغّر السابق) — يتعارضان
            // بصرياً وأحدهما فعلياً "لا يعمل" كما يُحس. الحل: مصدر حقيقة واحد فقط — صدى السيرفر
            // (بث لكل مستلم فوراً عبر Promise.all أصلاً) يشغّل المؤثر الكبير الوحيد لكل الحاضرين
            // (المرسل والمستلمين والمشاهدين) بنفس اللحظة تماماً — لا نداء محلي هنا بعد الآن
            //
            // 🐛 إصلاح إضافي: كان هذا النداء يُطلَق هنا بالتفاؤل أيضاً — أي فشل لاحق (رصيد غير
            // كافٍ فعلياً بالسيرفر، رفض هدية-لنفسي، انقطاع شبكة، حد معدّل) يُبقي شارة "الدعم"
            // ظاهرة على مقعد المستلم رغم عدم وصول الهدية فعلياً أبداً، ولا تراجع عنها (بعكس
            // الرصيد الذي يعود بـrevertOptimisticDeduction أدناه). نُطلقه الآن فقط بعد تأكيد
            // نجاح السيرفر صراحة (انظر أسفل هذا الاستدعاء نفسه)

            const revertOptimisticDeduction = () => {
                const revertUser = JSON.parse(localStorage.getItem('user'));
                if (!revertUser) return;
                revertUser.coins += totalCost;
                localStorage.setItem('user', JSON.stringify(revertUser));
                if (coinsEl) coinsEl.textContent = revertUser.coins;
                footer.querySelectorAll('.gift-footer-balance').forEach(el => el.textContent = revertUser.coins);
            };

            try {
                // ✅ نداء شبكة واحد لكل المستلمين دفعة واحدة (بدل حلقة نداء لكل مستلم) — أسرع،
                // ويصل للجميع بنفس اللحظة فعلياً، ويرجع رصيداً نهائياً واحداً موثوقاً
                const response = await fetch('/api/gifts/send-batch', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ recipientIds: recipients, giftId: gift.id, quantity, roomId: roomId === 'main' ? undefined : roomId })
                });
                const result = await response.json();

                if (response.ok) {
                    const syncedUser = JSON.parse(localStorage.getItem('user'));
                    if (syncedUser) {
                        syncedUser.coins = result.data.newSenderCoins;
                        localStorage.setItem('user', JSON.stringify(syncedUser));
                    }
                    if (coinsEl) coinsEl.textContent = result.data.newSenderCoins;
                    footer.querySelectorAll('.gift-footer-balance').forEach(el => el.textContent = result.data.newSenderCoins);
                    // ✅ يُطلَق فقط بعد تأكيد نجاح السيرفر صراحة — راجع الشرح أعلى هذي الدالة
                    recipients.forEach(receiverId => notifyRoomGiftSupport(receiverId, gift.price * quantity));
                    return true;
                }

                revertOptimisticDeduction();
                // ✅ حد معدّل الإرسال (429) أثناء ضغط مستمر سريع: لا نقاطع المستخدم ولا نزعجه
                // بتنبيه — فقط نتراجع عن خصم هذي المحاولة ونكمل بهدوء بالتكرار التالي تلقائياً
                if (response.status === 429) return true;
                showFloatingAlert(result.message || 'تعذر إرسال الهدية', 'fa-exclamation-circle', 'bg-red-500');
                return false;
            } catch (error) {
                console.error('[ROOM GIFT] Error sending:', error);
                revertOptimisticDeduction();
                return false;
            }
        });

    } catch (error) {
        console.error('[ROOM GIFT] Error:', error);
        const body = document.getElementById('room-gift-body');
        if (body) body.innerHTML = `<div class="text-center text-red-400 py-10">فشل تحميل البيانات</div>`;
    }
}

// ✅ دالة موحّدة لبناء كارد الهدية (تُستخدم بالخاصة والعامة)
// ✅ دالة موحّدة لبناء كارد الهدية — الصورة الحقيقية أولاً، واحتياطي أنيق فقط عند الفشل الفعلي
// onerror يُربط عبر JavaScript بعد الإدراج (لا inline) حتى لا يخالف سياسة الأمان CSP
function renderGiftCardHTML(g) {
    return `
        <button type="button" class="gift-card-wrapper bg-gray-800/50 border border-gray-700 rounded-xl p-2 transition-all flex flex-col items-center w-full"
             data-gift-id="${g._id}" data-gift-name="${g.name}" data-gift-price="${g.discountedPrice || g.price}" data-gift-icon="${g.icon || '🎁'}" data-gift-image="${g.imageUrl || ''}">
            <div class="gift-visual-slot w-10 h-10 flex items-center justify-center mx-auto pointer-events-none">
                ${g.imageUrl ? `<img src="${g.imageUrl}" class="gift-visual-img w-10 h-10 object-contain">` : `<span class="text-3xl">${g.icon || '🎁'}</span>`}
            </div>
            <span class="text-[11px] font-bold text-center truncate w-full mt-1 pointer-events-none">${g.name}</span>
            <span class="text-[10px] text-yellow-400 pointer-events-none"><i class="fas fa-coins"></i> ${g.discountedPrice || g.price}</span>
        </button>
    `;
}

// ✅ تذييل موحّد لكل نوافذ الهدايا: الرصيد أسفل (بدل أعلى النافذة)، قائمة كمية مسندلة (1/7/77/777)،
// وزر إرسال دائري واحد (بدل زر داخل كل كارد) — نفس الشكل بكل مكان بالمشروع
function renderGiftFooterHTML(coins) {
    return `
        <div class="gift-footer flex items-center gap-2 p-3 border-t border-gray-700 bg-gray-900/60 flex-shrink-0">
            <span class="text-xs text-yellow-400 flex items-center gap-1 flex-shrink-0 font-bold">
                <i class="fas fa-coins"></i> <span class="gift-footer-balance">${coins}</span>
            </span>
            <div class="flex-1"></div>
            <div class="gift-qty-segmented" role="group">
                ${[1, 7, 77, 777].map((n, i) => `<button type="button" data-qty="${n}" class="gift-qty-segment${i === 0 ? ' active' : ''}">×${n}</button>`).join('')}
            </div>
            <button type="button" class="gift-send-main-btn" disabled title="اختر هدية أولاً">
                <i class="fas fa-paper-plane"></i> إرسال
                <span class="gift-send-badge hidden">0</span>
            </button>
        </div>
    `;
}

// ✅ يربط تفاعل الكروت (اختيار فقط) + قائمة الكمية داخل أي نافذة هدايا — يُستدعى بعد إدراج القالب
// callbacks.onSelectGift(giftData|null) يُستدعى عند تغيّر الهدية المختارة
function wireGiftSelectionAndQty(rootEl, onSelectGift) {
    let selectedGift = null;
    let quantity = 1;

    // ✅ تفويض أحداث على الحاوية الثابتة بدل ربط مباشر بكل كارد — يبقى يعمل تلقائياً حتى
    // لو أُعيد بناء شبكة الهدايا لاحقاً (فلترة حسب التصنيف مثلاً) بلا أي إعادة ربط يدوية
    rootEl.addEventListener('click', (e) => {
        const card = e.target.closest('.gift-card-wrapper');
        if (!card || !rootEl.contains(card)) return;
        const wasSelected = card.classList.contains('gift-card-selected');
        rootEl.querySelectorAll('.gift-card-wrapper').forEach(c => c.classList.remove('gift-card-selected'));
        if (wasSelected) {
            selectedGift = null;
        } else {
            card.classList.add('gift-card-selected');
            selectedGift = {
                id: card.dataset.giftId,
                name: card.dataset.giftName,
                price: parseFloat(card.dataset.giftPrice),
                icon: card.dataset.giftIcon,
                imageUrl: card.dataset.giftImage
            };
        }
        const sendBtn = rootEl.querySelector('.gift-send-main-btn');
        if (sendBtn) sendBtn.disabled = !selectedGift;
        onSelectGift(selectedGift, quantity);
    });

    // ✅ اختيار الكمية: segmented control مكشوف دائماً — شريحة واحدة فقط محدَّدة بأي لحظة
    rootEl.querySelectorAll('.gift-qty-segment').forEach(seg => {
        seg.addEventListener('click', () => {
            rootEl.querySelectorAll('.gift-qty-segment').forEach(s => s.classList.remove('active'));
            seg.classList.add('active');
            quantity = parseInt(seg.dataset.qty);
            onSelectGift(selectedGift, quantity);
        });
    });

    return { getSelectedGift: () => selectedGift, getQuantity: () => quantity };
}

// ✅ زر الإرسال الدائري: الضغط المطوّل يحوّله لعدّاد متحرك (حجم/ظل/رقم متزايد)، والإفلات يعيده طبيعياً.
// fireOnce() يُستدعى بشكل متسارع تدريجياً أثناء الاستمرار بالضغط (سريع بشكل معقول، وليس فائق السرعة)
function setupGiftSendButton(btn, fireOnce) {
    if (!btn) return;
    const badge = btn.querySelector('.gift-send-badge');

    let sentCount = 0;
    let inFlight = 0;
    const MAX_CONCURRENT = 4;
    let active = false;
    let rampTimeout = null;
    let intervalMs = 260;
    const MIN_INTERVAL = 140; // ✅ سقف سرعة معقول (وليس فائق السرعة) بناءً على طلب صريح
    const ACCEL_FACTOR = 0.9;

    async function fireWrapper() {
        if (!active) return;
        sentCount++;
        if (badge) {
            badge.textContent = sentCount > 99 ? '99+' : sentCount;
            badge.classList.remove('hidden');
        }
        inFlight++;
        try {
            const ok = await fireOnce();
            if (ok === false) stopSending();
        } finally {
            inFlight--;
        }
    }

    function scheduleNext() {
        if (!active) return;
        rampTimeout = setTimeout(() => {
            if (!active) return;
            if (inFlight < MAX_CONCURRENT) fireWrapper();
            intervalMs = Math.max(MIN_INTERVAL, Math.round(intervalMs * ACCEL_FACTOR));
            scheduleNext();
        }, intervalMs);
    }

    function startSending() {
        if (active || btn.disabled) return;
        active = true;
        sentCount = 0;
        intervalMs = 260;
        btn.classList.add('gift-sending');
        fireWrapper();
        scheduleNext();
    }

    function stopSending() {
        if (!active) return;
        active = false;
        clearTimeout(rampTimeout);
        rampTimeout = null;
        btn.classList.remove('gift-sending');
        setTimeout(() => badge?.classList.add('hidden'), 400);
    }

    btn.addEventListener('mousedown', startSending);
    btn.addEventListener('touchstart', (e) => { e.preventDefault(); startSending(); }, { passive: false });
    btn.addEventListener('mouseup', stopSending);
    btn.addEventListener('mouseleave', stopSending);
    btn.addEventListener('touchend', stopSending);
}


// ✅ يُستدعى بعد إدراج أي مجموعة كروت هدايا بالصفحة، يربط احتياطي الصورة عبر JS (متوافق مع CSP)
function wireGiftImageFallbacks(containerEl) {
    containerEl.querySelectorAll('.gift-visual-img').forEach(img => {
        img.addEventListener('error', function() {
            const icon = this.closest('.gift-card-wrapper')?.dataset.giftIcon || '🎁';
            const slot = this.closest('.gift-visual-slot');
            if (slot) slot.innerHTML = `<span class="text-3xl">${icon}</span>`;
        }, { once: true });
    });
}

// ✅ شريط تصنيفات مقسَّم (segmented control) فوق شبكة الهدايا — تصفية محلية فقط (القائمة
// محمّلة أصلاً بالكامل، بلا أي طلب سيرفر إضافي)، ومُعاد استخدامه بكل نوافذ الهدايا. يُخفى
// تلقائياً لو كل الهدايا بتصنيف واحد فقط (لا فائدة من شريط بخيار وحيد)
const GIFT_CATEGORY_LABELS = { common: 'عادية', rare: 'نادرة', epic: 'أسطورية', legendary: 'خرافية' };
function wireGiftCategoryTabs(rootEl, gifts, gridSelector) {
    const tabsEl = rootEl.querySelector('.gift-category-tabs');
    const gridEl = rootEl.querySelector(gridSelector);
    if (!tabsEl || !gridEl) return;
    const present = ['common', 'rare', 'epic', 'legendary'].filter(c => gifts.some(g => (g.category || 'common') === c));
    if (present.length <= 1) return;

    tabsEl.innerHTML = `
        <button type="button" class="gift-category-tab active" data-cat="all">الكل</button>
        ${present.map(c => `<button type="button" class="gift-category-tab" data-cat="${c}">${GIFT_CATEGORY_LABELS[c]}</button>`).join('')}
    `;
    tabsEl.querySelectorAll('.gift-category-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            tabsEl.querySelectorAll('.gift-category-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const cat = tab.dataset.cat;
            const filtered = cat === 'all' ? gifts : gifts.filter(g => (g.category || 'common') === cat);
            gridEl.innerHTML = filtered.map(renderGiftCardHTML).join('');
            wireGiftImageFallbacks(gridEl);
            // ✅ أي اختيار سابق قد يختفي بصرياً بالتبويب الجديد (تصنيف مختلف) — نُعطّل زر
            // الإرسال حتى اختيار جديد صريح، بدل إبقائه فعّالاً بلا أي تحديد ظاهر بالشبكة
            const sendBtn = rootEl.querySelector('.gift-send-main-btn');
            if (sendBtn) sendBtn.disabled = true;
        });
    });
}
// --- ⚡ محرك الإرسال المتسارع (نسخة سريعة وآمنة): إرسال متراكب بدون انتظار كل رد، مع تحديث متفائل فوري ---
// --- ⚡ محرك الإرسال المتسارع (نسخة ذكية بتسارع مستمر وسلس) ---
function setupRapidGiftButton(targetUserId, getSelectedGift, btn, counterLabel) {
    if (!btn) return;

    let sentCount = 0;
    let inFlight = 0;
    let requestSeq = 0;        // ✅ رقم تسلسلي لكل طلب إرسال
    let latestAppliedSeq = 0;  // ✅ آخر رقم تسلسلي طُبِّق رصيده فعلياً
    const MAX_CONCURRENT = 4; // آمن الآن لأن الخصم في السيرفر أصبح ذرياً (atomic)
    let active = false;
    let rampTimeout = null;
    let intervalMs = 260;      // نقطة الانطلاق
    const MIN_INTERVAL = 60;   // أقصى سرعة ممكنة (يمنع إغراق الخادم)
    const ACCEL_FACTOR = 0.88; // كل نبضة أسرع من سابقتها بنسبة 12%

    async function fireOneGift() {
        const gift = getSelectedGift();
        if (!gift || !active) return;

        const localUser = JSON.parse(localStorage.getItem('user'));
        if (!localUser || localUser.coins < gift.price) {
            stopRapidSending();
            showFloatingAlert('رصيد الكوينز غير كافٍ للإرسال', 'fa-coins', 'bg-red-500');
            return;
        }

        // ✅ تحديث متفائل فوري: نخصم محلياً قبل رد الخادم لإحساس فوري بالسرعة
        localUser.coins -= gift.price;
        localStorage.setItem('user', JSON.stringify(localUser));
        const coinsEl = document.getElementById('coins');
        if (coinsEl) coinsEl.textContent = localUser.coins;
        const balanceEl = document.getElementById('gift-store-balance');
        if (balanceEl) balanceEl.textContent = localUser.coins;

                sentCount++;
        const mySeq = ++requestSeq; // ✅ كل طلب يأخذ رقماً تسلسلياً فريداً
        if (counterLabel) {
            counterLabel.textContent = `أُرسل ×${sentCount}`;
            counterLabel.classList.remove('hidden');
        }
        showGiftFloatingAnimation(gift.imageUrl, gift.name, 'أنت', sentCount);

        inFlight++;
        try {
            const response = await fetch('/api/gifts/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ receiverId: targetUserId, giftId: gift.id, quantity: 1, context: 'private_chat' })
            });
            const result = await response.json();

            if (response.ok) {
                // ✅ نطبّق فقط رصيد الرد الأحدث زمنياً — يمنع ارتداد الرقم لقيمة قديمة خاطئة
                // في حال وصل رد متأخر بعد رد أحدث منه بسبب تسابق الطلبات المتزامنة
                if (mySeq > latestAppliedSeq) {
                    latestAppliedSeq = mySeq;
                    const syncedUser = JSON.parse(localStorage.getItem('user'));
                    if (syncedUser) {
                        syncedUser.coins = result.data.newSenderCoins;
                        localStorage.setItem('user', JSON.stringify(syncedUser));
                    }
                    if (coinsEl) coinsEl.textContent = result.data.newSenderCoins;
                    if (balanceEl) balanceEl.textContent = result.data.newSenderCoins;
                }
                if (result.data.message) displayPrivateMessage(result.data.message, true);
            } else {
                // ✅ فشل: نعيد الرصيد المخصوم تفاؤلياً ونوقف السلسلة
                const revertUser = JSON.parse(localStorage.getItem('user'));
                if (revertUser) {
                    revertUser.coins += gift.price;
                    localStorage.setItem('user', JSON.stringify(revertUser));
                    if (coinsEl) coinsEl.textContent = revertUser.coins;
                    if (balanceEl) balanceEl.textContent = revertUser.coins;
                }
                stopRapidSending();
                showFloatingAlert(result.message || 'فشل إرسال الهدية', 'fa-exclamation-circle', 'bg-red-500');
            }
        } catch (error) {
            console.error('[RAPID GIFT] Error:', error);
        } finally {
            inFlight--;
        }
    }

    function scheduleNext() {
        if (!active) return;
        rampTimeout = setTimeout(() => {
            if (!active) return;
            if (inFlight < MAX_CONCURRENT) fireOneGift();
            intervalMs = Math.max(MIN_INTERVAL, Math.round(intervalMs * ACCEL_FACTOR));
            scheduleNext();
        }, intervalMs);
    }

    function startRapidSending() {
        if (active) return;
        active = true;
        intervalMs = 260;
        fireOneGift(); // إرسال فوري عند أول لمسة
        scheduleNext();
    }

    function stopRapidSending() {
        active = false;
        clearTimeout(rampTimeout);
        rampTimeout = null;
    }

    btn.addEventListener('mousedown', startRapidSending);
    btn.addEventListener('touchstart', (e) => { e.preventDefault(); startRapidSending(); }, { passive: false });
    btn.addEventListener('mouseup', stopRapidSending);
    btn.addEventListener('mouseleave', stopRapidSending);
    btn.addEventListener('touchend', stopRapidSending);
}

// --- 🎊 تأثير عائم احترافي عند استقبال/إرسال هدية ---
function showGiftFloatingAnimation(giftImage, giftName, fromUsername, quantity = 1, targetUserId = null) {
    const container = document.createElement('div');
    container.className = 'gift-float-container';
    container.innerHTML = `
        <div class="gift-float-card">
            <img src="${giftImage || ''}" class="gift-float-image">
            <div class="gift-float-text">
                <span class="gift-float-sender">${fromUsername}</span>
                <span class="gift-float-name">أرسل ${giftName}${quantity > 1 ? ' × ' + quantity : ''} 🎁</span>
            </div>
        </div>
        <div class="gift-float-sparkles">
            ${'✨'.repeat(5).split('').map((s, i) => `<span style="--i:${i}">${s}</span>`).join('')}
        </div>
    `;
    document.body.appendChild(container);

    // ✅ ربط احتياطي عبر JS بدل onerror الممنوع بسياسة CSP
    const imgEl = container.querySelector('.gift-float-image');
    if (imgEl) {
        imgEl.addEventListener('error', function () {
            const fallback = document.createElement('span');
            fallback.textContent = '🎁';
            fallback.style.fontSize = '2rem';
            this.replaceWith(fallback);
        }, { once: true });
    }

    // ✅ لو المستلم قاعد فعلياً بنفس الغرفة المعروضة حالياً، تطير الهدية نحو مقعده بالضبط
    // (وإلا: تطفو بالمنتصف وتتلاشى كالسابق — يشمل حالة كونه "مشاهداً" غير جالس)
    const targetSeatEl = targetUserId ? document.querySelector(`#voice-chat-grid [data-user-id="${targetUserId}"]`) : null;
    const card = container.querySelector('.gift-float-card');
    if (targetSeatEl && card) {
        // ✅ تطفو بمكانها بمنتصف الشاشة (~ثانيتين بالضبط كما طُلب) قبل الانطلاق نحو المستلم
        const FLOAT_BEFORE_FLY_MS = 2000;
        setTimeout(() => {
            const startRect = card.getBoundingClientRect();
            const endRect = targetSeatEl.getBoundingClientRect();
            const dx = (endRect.left + endRect.width / 2) - (startRect.left + startRect.width / 2);
            const dy = (endRect.top + endRect.height / 2) - (startRect.top + startRect.height / 2);
            card.style.setProperty('--fly-x', `${dx}px`);
            card.style.setProperty('--fly-y', `${dy}px`);
            card.classList.add('gift-fly-to-seat');
            setTimeout(() => {
                targetSeatEl.classList.add('seat-gift-impact');
                setTimeout(() => targetSeatEl.classList.remove('seat-gift-impact'), 500);
            }, 850);
        }, FLOAT_BEFORE_FLY_MS);
        setTimeout(() => container.remove(), FLOAT_BEFORE_FLY_MS + 1250);
        return;
    }

    setTimeout(() => container.remove(), 3500);
}

// ✅ يبلّغ الغرفة المعروضة حالياً (إن كان المستلم قاعداً فيها) بتحديث عداد الدعم أسفل مقعده
function notifyRoomGiftSupport(targetUserId, value) {
    if (!currentVoiceRoomId) return;
    const seatEl = document.querySelector(`#voice-chat-grid [data-user-id="${targetUserId}"]`);
    if (!seatEl) return; // المستلم غير قاعد بالغرفة المعروضة حالياً — لا شيء لتحديثه
    socket.emit('room-gift-support', { roomId: currentVoiceRoomId, seatNumber: parseInt(seatEl.dataset.seat), value });
}

// =====================================================
// ✅ إعلان هدية داخل الغرفة — فقاعة ذهبية بالدردشة + شريط جانبي عائم (أسلوب TikTok Live) +
// أيقونة تطير من منتصف الغرفة نحو مقعد المستلم. يستبدل الرسالة الخاصة/الفقاعة العائمة السابقتين
// =====================================================
function appendRoomGiftChatMessage({ fromUsername, toUsername, giftName, giftIcon, giftImage, quantity }) {
    const box = document.getElementById('room-chat-messages');
    if (!box) return;
    const el = document.createElement('div');
    el.className = 'room-chat-message room-chat-gift-bubble';
    const qtyText = quantity > 1 ? `×${quantity} ` : '';
    const iconHtml = giftImage ? `<img src="${giftImage}" class="room-chat-gift-inline-img" alt="">` : `<span>${giftIcon || '🎁'}</span>`;
    el.innerHTML = `
        <i class="fas fa-gift room-chat-gift-bubble-icon"></i>
        <p class="room-chat-msg-line">
            <b>${escapeHtml(fromUsername)}</b> أرسل ${qtyText}${escapeHtml(giftName)} ${iconHtml} إلى <b>${escapeHtml(toUsername)}</b>
        </p>
    `;
    box.appendChild(el);
    box.scrollTop = box.scrollHeight;
}

// ✅ حالة الشريط الحالي — يسمح بجمع الإرسالات المتكررة (نفس المُرسل/نفس الهدية) بعدّاد
// ×N واحد بدل إعادة إنشاء الشريط من الصفر في كل مرة (كانت تبدو كومضات متلاحقة مزعجة)
let roomGiftBannerState = null; // { key, count, timer }
function showRoomGiftSideBanner({ fromUsername, fromProfileImage, toUsername, giftName, giftImage, giftIcon, quantity }) {
    const key = `${fromUsername}::${giftName}`;
    let el = document.getElementById('room-gift-side-banner');
    const isSameStreak = el && roomGiftBannerState && roomGiftBannerState.key === key;

    if (isSameStreak) {
        roomGiftBannerState.count += (quantity || 1);
        const countEl = el.querySelector('.room-gift-banner-count');
        if (countEl) countEl.textContent = `×${roomGiftBannerState.count}`;
        // ✅ نبضة صغيرة تلفت الانتباه للعدّاد المتزايد
        countEl?.classList.remove('room-gift-banner-count'); void countEl?.offsetWidth; countEl?.classList.add('room-gift-banner-count');
        el.classList.remove('room-gift-banner-out');
    } else {
        el?.remove();
        el = document.createElement('div');
        el.id = 'room-gift-side-banner';
        el.className = 'room-gift-side-banner';
        el.innerHTML = `
            <img src="${fromProfileImage}" class="room-gift-banner-avatar">
            <div class="room-gift-banner-text">
                <b>${escapeHtml(fromUsername)}</b>
                <span>أرسل ${escapeHtml(giftName)} إلى ${escapeHtml(toUsername)}</span>
            </div>
            ${giftImage ? `<img src="${giftImage}" class="room-gift-banner-icon">` : `<span class="room-gift-banner-icon-emoji">${giftIcon || '🎁'}</span>`}
            <span class="room-gift-banner-count">×${quantity || 1}</span>
        `;
        document.body.appendChild(el);
        roomGiftBannerState = { key, count: quantity || 1, timer: null };
    }

    clearTimeout(roomGiftBannerState.timer);
    roomGiftBannerState.timer = setTimeout(() => {
        el.classList.add('room-gift-banner-out');
        setTimeout(() => {
            el.remove();
            if (roomGiftBannerState?.key === key) roomGiftBannerState = null;
        }, 400);
    }, 3000);
}




 // =================================================
// ============ نظام شراء الكوينزات =================
// =================================================

let buyCoinsInfoCache = null;

async function showBuyCoinsModal() {
    const existing = document.getElementById('buy-coins-modal');
    if (existing) existing.remove();

    const shellHTML = `
        <div id="buy-coins-modal" class="fixed inset-0 bg-black/80 flex items-center justify-center z-[320] p-4">
            <div class="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl shadow-2xl w-full max-w-md text-white border border-gray-700 max-h-[88vh] flex flex-col">
                    <div class="flex items-center justify-between p-4 border-b border-gray-700">
                    <h3 class="text-lg font-bold flex items-center gap-2">
                        <i class="fas fa-coins text-yellow-400"></i> شحن الكوينزات
                    </h3>
                    <div class="flex items-center gap-1">
                        <button id="coins-support-btn" class="report-issue-icon-btn" title="الإبلاغ عن مشكلة"><i class="fas fa-exclamation-triangle"></i></button>
                        <button id="close-buy-coins" class="text-gray-400 hover:text-white p-2"><i class="fas fa-times"></i></button>
                    </div>
                </div>
                <div id="buy-coins-body" class="p-4 overflow-y-auto flex-1">
                    <div class="text-center text-gray-400 py-10">
                        <i class="fas fa-spinner fa-spin text-2xl mb-2"></i>
                        <p class="text-sm">جاري التحميل...</p>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.getElementById('game-container').insertAdjacentHTML('beforeend', shellHTML);
        const modal = document.getElementById('buy-coins-modal');
    attachCloseConfirmation(modal, '#close-buy-coins');
        document.getElementById('coins-support-btn').addEventListener('click', () => showQuickSupportModal('payment_issue', 'مشكلة في شراء الكوينز'));

    try {
        const [infoRes, pendingRes] = await Promise.all([
            fetch('/api/coin-purchase/info', { headers: { 'Authorization': `Bearer ${token}` } }).then(r => r.json()),
            fetch('/api/coin-purchase/my-pending', { headers: { 'Authorization': `Bearer ${token}` } }).then(r => r.json())
        ]);

        if (infoRes.status !== 'success') throw new Error('فشل تحميل بيانات الدفع');

        buyCoinsInfoCache = infoRes.data;
        const pendingPurchases = pendingRes.status === 'success' ? pendingRes.data.purchases : [];

        renderBuyCoinsHome(pendingPurchases);

    } catch (error) {
        console.error('[BUY COINS] Error:', error);
        const body = document.getElementById('buy-coins-body');
        if (body) body.innerHTML = `<div class="text-center text-red-400 py-10"><i class="fas fa-exclamation-circle text-2xl mb-2"></i><p class="text-sm">فشل تحميل بيانات الدفع</p></div>`;
    }
}

function renderBuyCoinsHome(pendingPurchases) {
    const body = document.getElementById('buy-coins-body');
    if (!body) return;

    const pendingHTML = (pendingPurchases && pendingPurchases.length > 0) ? `
        <div class="bg-yellow-900/20 border border-yellow-600/30 rounded-xl p-3 mb-4">
            <p class="text-xs text-yellow-300 mb-2"><i class="fas fa-info-circle mr-1"></i> لديك طلبات شحن سابقة لم تكتمل:</p>
            <div class="space-y-2">
                ${pendingPurchases.map(p => `
                    <div class="flex items-center justify-between bg-black/20 rounded-lg p-2">
                        <span class="text-xs">${p.amountUSD}$ (${p.coinsAmount} كوينز) - ${p.method === 'sham_cash' ? 'شام كاش' : 'فيزا'}</span>
                        <button class="resume-purchase-btn text-xs bg-purple-600 hover:bg-purple-700 px-3 py-1 rounded-full" data-purchase-id="${p._id}" data-method="${p.method}">استكمال</button>
                    </div>
                `).join('')}
            </div>
        </div>
    ` : '';

    body.innerHTML = `
        ${pendingHTML}
        <p class="text-sm text-gray-400 mb-3">اختر طريقة الدفع المناسبة لك:</p>
        <div class="space-y-3">
                    <div class="space-y-3">
            <button class="payment-method-btn w-full flex items-center gap-3 bg-gray-800/50 hover:bg-gray-700/60 border border-gray-700 rounded-xl p-4 transition" data-method="balance">
                <div class="w-12 h-12 bg-green-600/20 rounded-full flex items-center justify-center"><i class="fas fa-wallet text-green-400 text-xl"></i></div>
                <div class="text-right flex-1">
                    <p class="font-bold text-sm">من رصيدك الحالي</p>
                    <p class="text-xs text-gray-400">تحويل فوري بدون انتظار الإدارة</p>
                </div>
                <i class="fas fa-chevron-left text-gray-500"></i>
            </button>
            <button class="payment-method-btn w-full flex items-center gap-3 bg-gray-800/50 hover:bg-gray-700/60 border border-gray-700 rounded-xl p-4 transition" data-method="sham_cash">
                <div class="w-12 h-12 bg-blue-600/20 rounded-full flex items-center justify-center"><i class="fas fa-wallet text-blue-400 text-xl"></i></div>
                <div class="text-right flex-1">
                    <p class="font-bold text-sm">شام كاش</p>
                    <p class="text-xs text-gray-400">تحويل فوري عبر QR</p>
                </div>
                <i class="fas fa-chevron-left text-gray-500"></i>
            </button>
            <button class="payment-method-btn w-full flex items-center gap-3 bg-gray-800/50 hover:bg-gray-700/60 border border-gray-700 rounded-xl p-4 transition" data-method="visa">
                <div class="w-12 h-12 bg-purple-600/20 rounded-full flex items-center justify-center"><i class="fas fa-credit-card text-purple-400 text-xl"></i></div>
                <div class="text-right flex-1">
                    <p class="font-bold text-sm">فيزا / بطاقة بنكية</p>
                    <p class="text-xs text-gray-400">تحويل عبر تطبيق البنك</p>
                </div>
                <i class="fas fa-chevron-left text-gray-500"></i>
            </button>
            <button class="payment-method-btn w-full flex items-center gap-3 bg-gray-800/50 hover:bg-gray-700/60 border border-gray-700 rounded-xl p-4 transition" data-method="agent">
                <div class="w-12 h-12 bg-green-600/20 rounded-full flex items-center justify-center"><i class="fas fa-user-tie text-green-400 text-xl"></i></div>
                <div class="text-right flex-1">
                    <p class="font-bold text-sm">عبر وكيل</p>
                    <p class="text-xs text-gray-400">تواصل مباشر مع وكيل شحن</p>
                </div>
                <i class="fas fa-chevron-left text-gray-500"></i>
            </button>
        </div>
    `;

        body.querySelectorAll('.payment-method-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const method = btn.dataset.method;
            if (method === 'agent') {
                renderAgentList();
            } else if (method === 'balance') {
                renderBalancePurchaseEntry();
            } else {
                renderAmountEntry(method);
            }
        });
    });

    body.querySelectorAll('.resume-purchase-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            renderReceiptUpload(btn.dataset.purchaseId);
        });
    });
}

function renderAmountEntry(method) {
    const body = document.getElementById('buy-coins-body');
    if (!body) return;

    const info = buyCoinsInfoCache;
    const methodLabel = method === 'sham_cash' ? 'شام كاش' : 'فيزا / بطاقة بنكية';

    body.innerHTML = `
        <button id="back-to-methods" class="text-sm text-gray-400 hover:text-white mb-4 flex items-center gap-1">
            <i class="fas fa-arrow-right"></i> رجوع
        </button>
        <h4 class="font-bold mb-3">${methodLabel} - حدد المبلغ</h4>
        <div class="mb-4">
            <label class="text-xs text-gray-400 mb-1 block">المبلغ بالدولار ($)</label>
            <input type="number" id="purchase-amount-input" min="${info.minUSD}" max="${info.maxUSD}" value="${info.minUSD}"
                   class="w-full bg-gray-700 border border-gray-600 rounded-lg p-3 text-white">
            <p class="text-xs text-gray-500 mt-1">الحد الأدنى ${info.minUSD}$ - الحد الأقصى ${info.maxUSD}$</p>
        </div>
        <div class="bg-gray-900/50 rounded-xl p-3 mb-4 flex justify-between items-center">
            <span class="text-sm text-gray-400">ستحصل على</span>
            <span id="calculated-coins" class="font-bold text-yellow-400">${info.minUSD * info.coinRate} <i class="fas fa-coins"></i></span>
        </div>
        <button id="continue-purchase-btn" class="w-full bg-purple-600 hover:bg-purple-700 text-white py-2.5 rounded-lg font-bold">
            متابعة
        </button>
    `;

    document.getElementById('back-to-methods').addEventListener('click', () => renderBuyCoinsHome([]));

    const amountInput = document.getElementById('purchase-amount-input');
    amountInput.addEventListener('input', () => {
        const val = parseFloat(amountInput.value) || 0;
        document.getElementById('calculated-coins').innerHTML = `${Math.round(val * info.coinRate)} <i class="fas fa-coins"></i>`;
    });

    document.getElementById('continue-purchase-btn').addEventListener('click', async () => {
        const amount = parseFloat(amountInput.value);
        if (!amount || amount < info.minUSD || amount > info.maxUSD) {
            showNotification(`المبلغ يجب أن يكون بين ${info.minUSD}$ و ${info.maxUSD}$`, 'error');
            return;
        }

        const continueBtn = document.getElementById('continue-purchase-btn');
        continueBtn.disabled = true;
        continueBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

        try {
            const response = await fetch('/api/coin-purchase/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ method, amountUSD: amount })
            });
            const result = await response.json();

            if (response.ok) {
                renderPaymentDetails(result.data.purchase, method);
            } else {
                showNotification(result.message || 'فشل إنشاء طلب الشراء', 'error');
                continueBtn.disabled = false;
                continueBtn.textContent = 'متابعة';
            }
        } catch (error) {
            console.error('[PURCHASE CREATE] Error:', error);
            showNotification('خطأ في الاتصال بالخادم', 'error');
            continueBtn.disabled = false;
            continueBtn.textContent = 'متابعة';
        }
    });
}



function renderBalancePurchaseEntry() {
    const body = document.getElementById('buy-coins-body');
    const info = buyCoinsInfoCache;
    const localUser = JSON.parse(localStorage.getItem('user')) || {};

    body.innerHTML = `
        <button id="back-to-methods" class="text-sm text-gray-400 hover:text-white mb-4 flex items-center gap-1"><i class="fas fa-arrow-right"></i> رجوع</button>
        <div class="bg-gray-900/50 rounded-xl p-3 mb-4 flex justify-between items-center">
            <span class="text-sm text-gray-400">رصيدك المتاح</span>
            <span class="font-bold text-green-400">${(localUser.balance || 0).toFixed(2)}$</span>
        </div>
        <div class="mb-4">
            <label class="text-xs text-gray-400 mb-1 block">المبلغ بالدولار ($)</label>
            <input type="number" id="balance-purchase-amount" min="${info.minUSD}" value="${info.minUSD}" class="w-full bg-gray-700 border border-gray-600 rounded-lg p-3 text-white">
        </div>
        <div class="bg-gray-900/50 rounded-xl p-3 mb-4 flex justify-between items-center">
            <span class="text-sm text-gray-400">ستحصل على</span>
            <span id="balance-purchase-coins" class="font-bold text-yellow-400">${info.minUSD * info.coinRate} <i class="fas fa-coins"></i></span>
        </div>
        <button id="confirm-balance-purchase-btn" class="w-full bg-green-600 hover:bg-green-700 text-white py-2.5 rounded-lg font-bold">تأكيد الشراء الفوري</button>
    `;

    document.getElementById('back-to-methods').addEventListener('click', () => renderBuyCoinsHome([]));

    const amountInput = document.getElementById('balance-purchase-amount');
    amountInput.addEventListener('input', () => {
        const val = parseFloat(amountInput.value) || 0;
        document.getElementById('balance-purchase-coins').innerHTML = `${Math.round(val * info.coinRate)} <i class="fas fa-coins"></i>`;
    });

    document.getElementById('confirm-balance-purchase-btn').addEventListener('click', async () => {
        const amount = parseFloat(amountInput.value);
        if (!amount || amount < info.minUSD) { showNotification('مبلغ غير صالح', 'error'); return; }
        if (amount > (localUser.balance || 0)) { showNotification('رصيدك غير كافٍ لهذا المبلغ', 'error'); return; }

        const btn = document.getElementById('confirm-balance-purchase-btn');
        btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

        try {
            const response = await fetch('/api/coin-purchase/buy-with-balance', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ amountUSD: amount })
            });
            const result = await response.json();
            if (response.ok) {
                await refreshUserData();
                document.getElementById('buy-coins-body').innerHTML = `
                    <div class="text-center py-8">
                        <i class="fas fa-check-circle text-5xl text-green-400 mb-4"></i>
                        <p class="font-bold mb-2">${result.message}</p>
                        <button id="close-balance-success-btn" class="bg-green-600 hover:bg-green-700 text-white py-2.5 px-6 rounded-lg font-bold mt-2">حسناً</button>
                    </div>`;
                document.getElementById('close-balance-success-btn').addEventListener('click', () => document.getElementById('buy-coins-modal')?.remove());
            } else {
                showNotification(result.message || 'فشل الشراء', 'error');
                btn.disabled = false; btn.textContent = 'تأكيد الشراء الفوري';
            }
        } catch (error) {
            showNotification('خطأ في الاتصال بالخادم', 'error');
            btn.disabled = false; btn.textContent = 'تأكيد الشراء الفوري';
        }
    });
}

        

function renderPaymentDetails(purchase, method) {
    const body = document.getElementById('buy-coins-body');
    if (!body) return;

    const info = buyCoinsInfoCache;

    let detailsHTML = '';
    if (method === 'sham_cash') {
        detailsHTML = `
            <div class="text-center mb-4">
                <img src="${info.shamCash.qrImageUrl}" class="w-40 h-40 mx-auto rounded-xl border border-gray-700 object-contain bg-white p-2" onerror="this.style.display='none'">
            </div>
            <div class="bg-gray-900/50 rounded-xl p-3 mb-3">
                <p class="text-xs text-gray-400 mb-1">رقم المحفظة</p>
                <div class="flex items-center justify-between">
                    <span id="wallet-number-text" class="font-bold text-sm">${info.shamCash.walletNumber}</span>
                    <button id="copy-wallet-btn" class="text-purple-400 hover:text-purple-300"><i class="fas fa-copy"></i></button>
                </div>
            </div>
            <div class="bg-gray-900/50 rounded-xl p-3 mb-4">
                <p class="text-xs text-gray-400 mb-1">اسم صاحب الحساب</p>
                <span class="font-bold text-sm">${info.shamCash.accountHolderName}</span>
            </div>
        `;
    } else {
        detailsHTML = `
            <div class="bg-gray-900/50 rounded-xl p-3 mb-3">
                <p class="text-xs text-gray-400 mb-1">رقم البطاقة</p>
                <div class="flex items-center justify-between">
                    <span id="wallet-number-text" class="font-bold text-sm">${info.visa.cardNumber}</span>
                    <button id="copy-wallet-btn" class="text-purple-400 hover:text-purple-300"><i class="fas fa-copy"></i></button>
                </div>
            </div>
            <div class="bg-gray-900/50 rounded-xl p-3 mb-3">
                <p class="text-xs text-gray-400 mb-1">اسم صاحب البطاقة</p>
                <span class="font-bold text-sm">${info.visa.accountHolderName}</span>
            </div>
            <p class="text-xs text-gray-500 mb-4">${info.visa.instructions}</p>
        `;
    }

    body.innerHTML = `
        <div class="text-center mb-4">
            <p class="text-sm text-gray-400">المبلغ المطلوب تحويله</p>
            <p class="text-2xl font-bold text-yellow-400">${purchase.amountUSD}$</p>
            <p class="text-xs text-gray-500">= ${purchase.coinsAmount} كوينز</p>
        </div>
        ${detailsHTML}
        <button id="i-transferred-btn" class="w-full bg-green-600 hover:bg-green-700 text-white py-2.5 rounded-lg font-bold">
            <i class="fas fa-check mr-1"></i> لقد قمت بالتحويل
        </button>
    `;

    const copyBtn = document.getElementById('copy-wallet-btn');
    if (copyBtn) {
        copyBtn.addEventListener('click', () => {
            const text = document.getElementById('wallet-number-text').textContent;
            navigator.clipboard.writeText(text).then(() => showNotification('تم النسخ', 'success'));
        });
    }

    document.getElementById('i-transferred-btn').addEventListener('click', () => {
        renderReceiptUpload(purchase._id);
    });
}

// ✅ هذه الشاشة تُستخدم أيضاً عند الضغط على "استكمال" لطلب سابق بعد إعادة تحميل الصفحة
function renderReceiptUpload(purchaseId) {
    const body = document.getElementById('buy-coins-body');
    if (!body) return;

    body.innerHTML = `
        <div class="text-center mb-4">
            <i class="fas fa-receipt text-3xl text-purple-400 mb-2"></i>
            <p class="text-sm font-bold">أرفق صورة إشعار التحويل</p>
            <p class="text-xs text-gray-500 mt-1">سيتم مراجعة طلبك وإيداع الرصيد خلال 5 إلى 10 دقائق كحد أقصى</p>
        </div>
        <div id="receipt-drop-zone" class="border-2 border-dashed border-gray-600 rounded-xl p-4 text-center cursor-pointer hover:border-purple-500 transition-colors bg-gray-900/50 mb-4">
            <div id="receipt-upload-content">
                <i class="fas fa-cloud-upload-alt text-3xl text-gray-500 mb-2"></i>
                <p class="text-sm">اضغط لاختيار صورة الإشعار</p>
            </div>
            <img id="receipt-preview-img" class="hidden max-h-40 mx-auto rounded-lg mt-2">
            <input type="file" id="receipt-file-input" class="hidden" accept="image/*">
        </div>
        <button id="submit-receipt-btn" class="w-full bg-purple-600 hover:bg-purple-700 text-white py-2.5 rounded-lg font-bold disabled:opacity-50" disabled>
            إرسال الطلب
        </button>
    `;

    let selectedFile = null;
    const dropZone = document.getElementById('receipt-drop-zone');
    const fileInput = document.getElementById('receipt-file-input');
    const submitBtn = document.getElementById('submit-receipt-btn');

    dropZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            selectedFile = e.target.files[0];
            const reader = new FileReader();
            reader.onload = (ev) => {
                document.getElementById('receipt-upload-content').classList.add('hidden');
                const previewImg = document.getElementById('receipt-preview-img');
                previewImg.src = ev.target.result;
                previewImg.classList.remove('hidden');
            };
            reader.readAsDataURL(selectedFile);
            submitBtn.disabled = false;
        }
    });

    submitBtn.addEventListener('click', async () => {
        if (!selectedFile) return;
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الإرسال...';

        try {
            const formData = new FormData();
            formData.append('file', selectedFile);

            const response = await fetch(`/api/coin-purchase/${purchaseId}/receipt`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });
            const result = await response.json();

            if (response.ok) {
                renderPurchaseSuccess();
            } else {
                showNotification(result.message || 'فشل إرسال الإشعار', 'error');
                submitBtn.disabled = false;
                submitBtn.textContent = 'إرسال الطلب';
            }
        } catch (error) {
            console.error('[RECEIPT UPLOAD] Error:', error);
            showNotification('خطأ في الاتصال بالخادم', 'error');
            submitBtn.disabled = false;
            submitBtn.textContent = 'إرسال الطلب';
        }
    });
}

function renderPurchaseSuccess() {
    const body = document.getElementById('buy-coins-body');
    if (!body) return;

    body.innerHTML = `
        <div class="text-center py-8">
            <i class="fas fa-check-circle text-5xl text-green-400 mb-4"></i>
            <p class="font-bold mb-2">تم استلام طلبك بنجاح</p>
            <p class="text-sm text-gray-400 mb-6">سيتم إيداع الرصيد في حسابك خلال 5 إلى 10 دقائق كحد أقصى</p>
            <button id="close-success-btn" class="bg-purple-600 hover:bg-purple-700 text-white py-2.5 px-6 rounded-lg font-bold">حسناً</button>
        </div>
    `;

    document.getElementById('close-success-btn').addEventListener('click', () => {
        const modal = document.getElementById('buy-coins-modal');
        if (modal) modal.remove();
    });
}

function renderAgentList() {
    const body = document.getElementById('buy-coins-body');
    if (!body) return;

    const info = buyCoinsInfoCache;
    const agents = info.agents || [];

    body.innerHTML = `
        <button id="back-to-methods" class="text-sm text-gray-400 hover:text-white mb-4 flex items-center gap-1">
            <i class="fas fa-arrow-right"></i> رجوع
        </button>
        <h4 class="font-bold mb-3">تواصل مع وكيل شحن</h4>
        ${agents.length === 0 ? `
            <div class="text-center text-gray-400 py-10">
                <i class="fas fa-user-slash text-3xl mb-3"></i>
                <p class="text-sm">لا يوجد وكلاء متاحين حالياً</p>
            </div>
        ` : agents.map(agent => `
            <div class="flex items-center gap-3 bg-gray-800/50 rounded-xl p-3 mb-3">
                <img src="${agent.profileImage}" class="w-12 h-12 rounded-full object-cover border-2 ${agent.isOnline ? 'border-green-500' : 'border-gray-600'}">
                <div class="flex-1 min-w-0">
                    <p class="font-bold text-sm truncate">${agent.username}</p>
                    <p class="text-xs ${agent.isOnline ? 'text-green-400' : 'text-gray-500'}">${agent.isOnline ? 'متصل الآن' : 'غير متصل'}</p>
                </div>
                <div class="flex gap-2">
                    ${agent.whatsapp ? `
                        <a href="https://wa.me/${agent.whatsapp}" target="_blank" class="w-9 h-9 bg-green-600 hover:bg-green-700 rounded-full flex items-center justify-center">
                            <i class="fab fa-whatsapp text-white"></i>
                        </a>
                    ` : ''}
                    <button class="agent-chat-btn w-9 h-9 bg-purple-600 hover:bg-purple-700 rounded-full flex items-center justify-center" data-agent-id="${agent.id}" data-agent-name="${agent.username}">
                        <i class="fas fa-comment-dots text-white"></i>
                    </button>
                </div>
            </div>
        `).join('')}
    `;

    document.getElementById('back-to-methods').addEventListener('click', () => renderBuyCoinsHome([]));

                body.querySelectorAll('.agent-chat-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const agentId = btn.dataset.agentId;
            const agentName = btn.dataset.agentName;

            // ✅ الإصلاح: إغلاق نافذة الشحن أولاً — كانت أعلى ترتيباً (z-index أكبر) من نافذة الدردشة فتغطيها
            document.getElementById('buy-coins-modal')?.remove();

            await openPrivateChat(agentId, agentName);
            setTimeout(() => {
                sendPrivateMessage(agentId, 'مرحباً 👋 أرغب بشحن رصيد كوينز، الرجاء المساعدة 💰');
            }, 600);
        });
    });
}

// ✅ يُستخدم لأي نافذة "عملية جارية" حتى لا يُفقد تقدم المستخدم بضغطة إغلاق عرضية
function attachCloseConfirmation(modalEl, closeButtonSelector) {
    function requestClose() {
        showConfirmationModal('هل أنت متأكد أنك تريد الخروج؟ سيتم إلغاء العملية الحالية.', () => {
            modalEl.remove();
        });
    }
    const closeBtn = modalEl.querySelector(closeButtonSelector);
    if (closeBtn) {
        const newBtn = closeBtn.cloneNode(true);
        closeBtn.parentNode.replaceChild(newBtn, closeBtn);
        newBtn.addEventListener('click', requestClose);
    }
    modalEl.addEventListener('click', (e) => {
        if (e.target === modalEl) requestClose();
    });
}

        

// =================================================
// ============ نظام سحب الرصيد ======================
// =================================================

async function showWithdrawModal() {
    const existing = document.getElementById('withdraw-modal');
    if (existing) existing.remove();

    const shellHTML = `
        <div id="withdraw-modal" class="fixed inset-0 bg-black/80 flex items-center justify-center z-[320] p-4">
            <div class="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl shadow-2xl w-full max-w-md text-white border border-gray-700 max-h-[88vh] flex flex-col">
                                <div class="flex items-center justify-between p-4 border-b border-gray-700">
                    <h3 class="text-lg font-bold flex items-center gap-2"><i class="fas fa-money-bill-wave text-green-400"></i> سحب الرصيد</h3>
                    <div class="flex items-center gap-1">
                        <button id="withdraw-support-btn" class="report-issue-icon-btn" title="الإبلاغ عن مشكلة"><i class="fas fa-exclamation-triangle"></i></button>
                        <button id="close-withdraw" class="text-gray-400 hover:text-white p-2"><i class="fas fa-times"></i></button>
                    </div>
                </div>
                <div id="withdraw-body" class="p-4 overflow-y-auto flex-1"></div>
            </div>
        </div>
    `;

    document.getElementById('game-container').insertAdjacentHTML('beforeend', shellHTML);
    const modal = document.getElementById('withdraw-modal');
    attachCloseConfirmation(modal, '#close-withdraw');
    document.getElementById('withdraw-support-btn').addEventListener('click', () => showQuickSupportModal('payment_issue', 'مشكلة في طلب السحب'));

    renderWithdrawHome();
}

async function renderWithdrawHome() {
    const body = document.getElementById('withdraw-body');
    const user = JSON.parse(localStorage.getItem('user'));

    let myWithdrawals = [];
    try {
        const res = await fetch('/api/withdrawals/my-withdrawals', { headers: { 'Authorization': `Bearer ${token}` } });
        const result = await res.json();
        if (res.ok) myWithdrawals = result.data.withdrawals;
    } catch (e) { console.error(e); }

    const statusLabel = { pending: ['قيد المراجعة', 'text-yellow-400'], completed: ['تم القبول ✓', 'text-green-400'], rejected: ['مرفوض', 'text-red-400'] };

    body.innerHTML = `
        <div class="bg-gray-900/50 rounded-xl p-3 mb-4 flex justify-between items-center">
            <span class="text-sm text-gray-400">رصيدك المتاح</span>
            <span class="font-bold text-green-400">${user.balance.toFixed(2)}$</span>
        </div>
        <div class="space-y-3 mb-4">
            <button class="withdraw-method-btn w-full flex items-center gap-3 bg-gray-800/50 hover:bg-gray-700/60 border border-gray-700 rounded-xl p-4" data-method="sham_cash">
                <i class="fas fa-wallet text-blue-400 text-xl"></i>
                <div class="text-right flex-1"><p class="font-bold text-sm">سحب عبر شام كاش</p><p class="text-xs text-gray-400">خلال ساعة إلى 3 ساعات</p></div>
                <i class="fas fa-chevron-left text-gray-500"></i>
            </button>
            <button class="withdraw-method-btn w-full flex items-center gap-3 bg-gray-800/50 hover:bg-gray-700/60 border border-gray-700 rounded-xl p-4" data-method="office">
                <i class="fas fa-building text-orange-400 text-xl"></i>
                <div class="text-right flex-1"><p class="font-bold text-sm">سحب عبر مكتب</p><p class="text-xs text-gray-400">خلال يوم إلى 3 أيام</p></div>
                <i class="fas fa-chevron-left text-gray-500"></i>
            </button>
        </div>
        ${myWithdrawals.length > 0 ? `
            <p class="text-xs text-gray-400 mb-2">طلباتك السابقة</p>
            <div class="space-y-2">
                ${myWithdrawals.slice(0, 5).map(w => `
                    <div class="bg-gray-900/40 rounded-lg p-2.5 flex justify-between items-center text-xs">
                        <span>${w.amount}$ - ${w.method === 'sham_cash' ? 'شام كاش' : 'مكتب'}</span>
                        <span class="${statusLabel[w.status][1]} font-bold">${statusLabel[w.status][0]}</span>
                    </div>
                    ${w.status === 'rejected' && w.rejectionReason ? `<p class="text-[11px] text-red-400 px-2">السبب: ${w.rejectionReason}</p>` : ''}
                `).join('')}
            </div>
        ` : ''}
    `;

    body.querySelectorAll('.withdraw-method-btn').forEach(btn => {
        btn.addEventListener('click', () => renderWithdrawForm(btn.dataset.method));
    });
}

function renderWithdrawForm(method) {
    const body = document.getElementById('withdraw-body');
    const user = JSON.parse(localStorage.getItem('user'));

    const fieldsHTML = method === 'sham_cash' ? `
        <div class="mb-3">
            <label class="text-xs text-gray-400 mb-1 block">رابط محفظة شام كاش</label>
            <input type="text" id="w-wallet" class="w-full bg-gray-700 border border-gray-600 rounded-lg p-2.5 text-sm" placeholder="رابط المحفظة">
        </div>
    ` : `
        <div class="grid grid-cols-2 gap-2 mb-3">
            <div><label class="text-xs text-gray-400 mb-1 block">البلد</label><input type="text" id="w-country" class="w-full bg-gray-700 border border-gray-600 rounded-lg p-2.5 text-sm"></div>
            <div><label class="text-xs text-gray-400 mb-1 block">المحافظة</label><input type="text" id="w-governorate" class="w-full bg-gray-700 border border-gray-600 rounded-lg p-2.5 text-sm"></div>
        </div>
        <div class="mb-3"><label class="text-xs text-gray-400 mb-1 block">المنطقة</label><input type="text" id="w-area" class="w-full bg-gray-700 border border-gray-600 rounded-lg p-2.5 text-sm"></div>
        <div class="mb-3"><label class="text-xs text-gray-400 mb-1 block">رقم الهاتف</label><input type="text" id="w-phone" class="w-full bg-gray-700 border border-gray-600 rounded-lg p-2.5 text-sm"></div>
    `;

    body.innerHTML = `
        <button id="back-to-withdraw-home" class="text-sm text-gray-400 hover:text-white mb-4 flex items-center gap-1"><i class="fas fa-arrow-right"></i> رجوع</button>
        <div class="mb-3"><label class="text-xs text-gray-400 mb-1 block">الاسم الكامل</label><input type="text" id="w-fullname" class="w-full bg-gray-700 border border-gray-600 rounded-lg p-2.5 text-sm"></div>
        ${fieldsHTML}
        <div class="mb-4">
            <label class="text-xs text-gray-400 mb-1 block">المبلغ المراد سحبه ($)</label>
            <input type="number" id="w-amount" min="5" max="${user.balance}" class="w-full bg-gray-700 border border-gray-600 rounded-lg p-2.5 text-sm">
            <p class="text-xs text-gray-500 mt-1">رصيدك المتاح: ${user.balance.toFixed(2)}$ — الحد الأدنى 5$</p>
        </div>
        <button id="submit-withdraw-btn" class="w-full bg-green-600 hover:bg-green-700 text-white py-2.5 rounded-lg font-bold">إرسال طلب السحب</button>
    `;

    document.getElementById('back-to-withdraw-home').addEventListener('click', renderWithdrawHome);

    document.getElementById('submit-withdraw-btn').addEventListener('click', async () => {
        const fullName = document.getElementById('w-fullname').value.trim();
        const amount = parseFloat(document.getElementById('w-amount').value);

        if (!fullName) { showNotification('يرجى إدخال الاسم الكامل', 'error'); return; }
        if (!amount || amount < 5) { showNotification('الحد الأدنى للسحب 5$', 'error'); return; }
        if (amount > user.balance) { showNotification('المبلغ يتجاوز رصيدك المتاح', 'error'); return; }

        const payload = { method, amount, fullName };
        if (method === 'sham_cash') {
            const wallet = document.getElementById('w-wallet').value.trim();
            if (!wallet) { showNotification('يرجى إدخال رابط المحفظة', 'error'); return; }
            payload.walletNumber = wallet;
        } else {
            const country = document.getElementById('w-country').value.trim();
            const governorate = document.getElementById('w-governorate').value.trim();
            const area = document.getElementById('w-area').value.trim();
            const phone = document.getElementById('w-phone').value.trim();
            if (!country || !governorate || !area || !phone) { showNotification('يرجى إكمال كل بيانات المكتب', 'error'); return; }
            payload.officeInfo = { country, governorate, area, phone };
        }

        const btn = document.getElementById('submit-withdraw-btn');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

        try {
            const response = await fetch('/api/withdrawals/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(payload)
            });
            const result = await response.json();

                 if (response.ok) {
                // ✅ الإصلاح: تحديث فوري وحقيقي من الخادم بدل تعديل يدوي محلي فقط
                await refreshUserData();

                const modal = document.getElementById('withdraw-modal');
                if (modal) modal.remove();
            } else {
                showNotification(result.message || 'فشل إرسال الطلب', 'error');
                btn.disabled = false;
                btn.textContent = 'إرسال طلب السحب';
            }
        } catch (error) {
            showNotification('خطأ في الاتصال بالخادم', 'error');
            btn.disabled = false;
            btn.textContent = 'إرسال طلب السحب';
        }
    });
}


        // =================================================
// ============ نظام شحن الرصيد (USD) ================
// =================================================

async function showDepositModal() {
    const existing = document.getElementById('deposit-modal');
    if (existing) existing.remove();

    const shellHTML = `
        <div id="deposit-modal" class="fixed inset-0 bg-black/80 flex items-center justify-center z-[320] p-4">
            <div class="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl shadow-2xl w-full max-w-md text-white border border-gray-700 max-h-[88vh] flex flex-col">
                                <div class="flex items-center justify-between p-4 border-b border-gray-700">
                    <h3 class="text-lg font-bold flex items-center gap-2"><i class="fas fa-wallet text-blue-400"></i> شحن الرصيد</h3>
                    <div class="flex items-center gap-1">
                        <button id="deposit-support-btn" class="report-issue-icon-btn" title="الإبلاغ عن مشكلة"><i class="fas fa-exclamation-triangle"></i></button>
                        <button id="close-deposit" class="text-gray-400 hover:text-white p-2"><i class="fas fa-times"></i></button>
                    </div>
                </div>
                <div id="deposit-body" class="p-4 overflow-y-auto flex-1">
                    <div class="text-center text-gray-400 py-10"><i class="fas fa-spinner fa-spin text-2xl"></i></div>
                </div>
            </div>
        </div>
    `;
    document.getElementById('game-container').insertAdjacentHTML('beforeend', shellHTML);
    const modal = document.getElementById('deposit-modal');
    attachCloseConfirmation(modal, '#close-deposit');
        document.getElementById('deposit-support-btn').addEventListener('click', () => showQuickSupportModal('payment_issue', 'مشكلة في شحن الرصيد'));

    try {
        const [infoRes, pendingRes] = await Promise.all([
            fetch('/api/deposits/wallet-info', { headers: { 'Authorization': `Bearer ${token}` } }).then(r => r.json()),
            fetch('/api/deposits/my-deposits', { headers: { 'Authorization': `Bearer ${token}` } }).then(r => r.json())
        ]);

        if (infoRes.status !== 'success') throw new Error();
        window._depositInfoCache = infoRes.data;

        const pendingWithoutReceipt = (pendingRes.data?.deposits || []).find(d => d.status === 'pending' && !d.receiptImage);
        if (pendingWithoutReceipt) {
            renderDepositReceiptUpload(pendingWithoutReceipt._id, pendingWithoutReceipt.amount);
        } else {
            renderDepositAmountEntry();
        }
    } catch (error) {
        document.getElementById('deposit-body').innerHTML = `<div class="text-center text-red-400 py-10">فشل تحميل بيانات الشحن</div>`;
    }
}

function renderDepositAmountEntry() {
    const body = document.getElementById('deposit-body');
    const info = window._depositInfoCache;

    body.innerHTML = `
        <div class="mb-4">
            <label class="text-xs text-gray-400 mb-1 block">المبلغ بالدولار ($)</label>
            <input type="number" id="deposit-amount-input" min="${info.minUSD}" max="${info.maxUSD}" value="${info.minUSD}"
                   class="w-full bg-gray-700 border border-gray-600 rounded-lg p-3 text-white">
            <p class="text-xs text-gray-500 mt-1">الحد الأدنى ${info.minUSD}$ - الحد الأقصى ${info.maxUSD}$</p>
        </div>
        <button id="continue-deposit-btn" class="w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg font-bold">متابعة</button>
    `;

    document.getElementById('continue-deposit-btn').addEventListener('click', async () => {
        const amount = parseFloat(document.getElementById('deposit-amount-input').value);
        if (!amount || amount < info.minUSD || amount > info.maxUSD) {
            showNotification(`المبلغ يجب أن يكون بين ${info.minUSD}$ و ${info.maxUSD}$`, 'error');
            return;
        }
        const btn = document.getElementById('continue-deposit-btn');
        btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

        try {
            const response = await fetch('/api/deposits/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ amount })
            });
            const result = await response.json();
            if (response.ok) {
                renderDepositPaymentDetails(result.data.deposit);
            } else {
                showNotification(result.message || 'فشل إنشاء الطلب', 'error');
                btn.disabled = false; btn.textContent = 'متابعة';
            }
        } catch (error) {
            showNotification('خطأ في الاتصال بالخادم', 'error');
            btn.disabled = false; btn.textContent = 'متابعة';
        }
    });
}

function renderDepositPaymentDetails(deposit) {
    const body = document.getElementById('deposit-body');
    const info = window._depositInfoCache;

    body.innerHTML = `
        <div class="text-center mb-4">
            <p class="text-sm text-gray-400">المبلغ المطلوب تحويله</p>
            <p class="text-2xl font-bold text-blue-400">${deposit.amount}$</p>
        </div>
        <div class="bg-gray-900/50 rounded-xl p-3 mb-3">
            <p class="text-xs text-gray-400 mb-1">رقم محفظة شام كاش</p>
            <div class="flex items-center justify-between">
                <span id="deposit-wallet-text" class="font-bold text-sm">${info.shamCash.walletNumber}</span>
                <button id="copy-deposit-wallet" class="text-blue-400 hover:text-blue-300"><i class="fas fa-copy"></i></button>
            </div>
        </div>
        <div class="bg-gray-900/50 rounded-xl p-3 mb-4">
            <p class="text-xs text-gray-400 mb-1">اسم صاحب الحساب</p>
            <span class="font-bold text-sm">${info.shamCash.accountHolderName}</span>
        </div>
        <button id="i-transferred-deposit-btn" class="w-full bg-green-600 hover:bg-green-700 text-white py-2.5 rounded-lg font-bold">
            <i class="fas fa-check mr-1"></i> لقد قمت بالتحويل
        </button>
    `;

    document.getElementById('copy-deposit-wallet').addEventListener('click', () => {
        navigator.clipboard.writeText(document.getElementById('deposit-wallet-text').textContent)
            .then(() => showNotification('تم النسخ', 'success'));
    });
    document.getElementById('i-transferred-deposit-btn').addEventListener('click', () => {
        renderDepositReceiptUpload(deposit._id, deposit.amount);
    });
}

function renderDepositReceiptUpload(depositId, amount) {
    const body = document.getElementById('deposit-body');
    body.innerHTML = `
        <div class="text-center mb-4">
            <i class="fas fa-receipt text-3xl text-blue-400 mb-2"></i>
            <p class="text-sm font-bold">أرفق صورة إشعار التحويل (${amount}$)</p>
            <p class="text-xs text-gray-500 mt-1">سيتم مراجعة طلبك وإيداع الرصيد من قبل الإدارة</p>
        </div>
        <div id="deposit-drop-zone" class="border-2 border-dashed border-gray-600 rounded-xl p-4 text-center cursor-pointer hover:border-blue-500 transition-colors bg-gray-900/50 mb-4">
            <div id="deposit-upload-content">
                <i class="fas fa-cloud-upload-alt text-3xl text-gray-500 mb-2"></i>
                <p class="text-sm">اضغط لاختيار صورة الإشعار</p>
            </div>
            <img id="deposit-preview-img" class="hidden max-h-40 mx-auto rounded-lg mt-2">
            <input type="file" id="deposit-file-input" class="hidden" accept="image/*">
        </div>
        <button id="submit-deposit-receipt-btn" class="w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg font-bold disabled:opacity-50" disabled>إرسال الطلب</button>
    `;

    let selectedFile = null;
    const dropZone = document.getElementById('deposit-drop-zone');
    const fileInput = document.getElementById('deposit-file-input');
    const submitBtn = document.getElementById('submit-deposit-receipt-btn');

    dropZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            selectedFile = e.target.files[0];
            const reader = new FileReader();
            reader.onload = (ev) => {
                document.getElementById('deposit-upload-content').classList.add('hidden');
                const previewImg = document.getElementById('deposit-preview-img');
                previewImg.src = ev.target.result;
                previewImg.classList.remove('hidden');
            };
            reader.readAsDataURL(selectedFile);
            submitBtn.disabled = false;
        }
    });

    submitBtn.addEventListener('click', async () => {
        if (!selectedFile) return;
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الإرسال...';

        try {
            const formData = new FormData();
            formData.append('file', selectedFile);
            const response = await fetch(`/api/deposits/${depositId}/receipt`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });
            const result = await response.json();
            if (response.ok) {
                const body = document.getElementById('deposit-body');
                body.innerHTML = `
                    <div class="text-center py-8">
                        <i class="fas fa-check-circle text-5xl text-green-400 mb-4"></i>
                        <p class="font-bold mb-2">تم استلام طلبك بنجاح</p>
                        <p class="text-sm text-gray-400 mb-6">سيتم إيداع الرصيد بعد مراجعة الإدارة</p>
                        <button id="close-deposit-success-btn" class="bg-blue-600 hover:bg-blue-700 text-white py-2.5 px-6 rounded-lg font-bold">حسناً</button>
                    </div>
                `;
                document.getElementById('close-deposit-success-btn').addEventListener('click', () => {
                    document.getElementById('deposit-modal')?.remove();
                });
            } else {
                showNotification(result.message || 'فشل إرسال الإشعار', 'error');
                submitBtn.disabled = false; submitBtn.textContent = 'إرسال الطلب';
            }
        } catch (error) {
            showNotification('خطأ في الاتصال بالخادم', 'error');
            submitBtn.disabled = false; submitBtn.textContent = 'إرسال الطلب';
        }
    });
}



// =================================================
// ============ نظام البلاغات (Reports) ==============
// =================================================

function escapeHtmlClient(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

async function showReportModal(context) {
    // context: { type: 'message'|'user', reportedUserId, reportedUsername, messageId, messageContent, messageType, roomId }
    const existing = document.getElementById('report-modal');
    if (existing) existing.remove();

    const reasons = [
        { value: 'harassment', label: 'مضايقة / تحرش' },
        { value: 'spam', label: 'رسائل مزعجة' },
        { value: 'inappropriate_content', label: 'محتوى غير لائق' },
        { value: 'fraud', label: 'احتيال' },
        { value: 'fake_account', label: 'حساب مزيف' },
        { value: 'cheating', label: 'غش / تلاعب' },
        { value: 'payment_issue', label: 'مشكلة بالدفع' },
        { value: 'other', label: 'أخرى' }
    ];

    const modalHTML = `
        <div id="report-modal" class="fixed inset-0 bg-black/80 flex items-center justify-center z-[500] p-4">
            <div class="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl shadow-2xl w-full max-w-md text-white border border-red-500/30 max-h-[88vh] flex flex-col">
                <div class="flex items-center justify-between p-4 border-b border-gray-700">
                    <h3 class="text-lg font-bold flex items-center gap-2"><i class="fas fa-flag text-red-400"></i> الإبلاغ عن ${context.type === 'user' ? 'مستخدم' : 'رسالة'}</h3>
                    <button id="close-report-modal" class="text-gray-400 hover:text-white p-2"><i class="fas fa-times"></i></button>
                </div>
                <div class="p-4 overflow-y-auto flex-1">
                    <p class="text-sm text-gray-400 mb-3">أنت تُبلغ عن: <strong class="text-white">${escapeHtmlClient(context.reportedUsername || 'مستخدم')}</strong></p>

                    ${context.messageContent || (context.messageType && context.messageType !== 'text') ? `
                        <div class="bg-black/30 rounded-lg p-3 mb-4 text-xs text-gray-300 border-r-2 border-red-500">
                            ${context.messageType && context.messageType !== 'text' ? `<i class="fas fa-paperclip mr-1"></i> رسالة ${context.messageType}` : escapeHtmlClient((context.messageContent || '').substring(0, 150))}
                        </div>
                    ` : ''}

                    <p class="text-xs text-gray-400 mb-2">اختر السبب:</p>
                    <div id="report-reason-chips" class="grid grid-cols-2 gap-2 mb-4">
                        ${reasons.map(r => `<button type="button" class="report-reason-chip text-xs py-2 px-2 rounded-lg border border-gray-600 hover:border-red-400 transition" data-value="${r.value}">${r.label}</button>`).join('')}
                    </div>

                    <div class="form-group mb-3">
                        <label class="text-xs text-gray-400 mb-1 block">تفاصيل إضافية <span id="details-required-star" class="hidden text-red-400">*</span></label>
                        <textarea id="report-details-input" rows="3" maxlength="500" class="w-full bg-gray-700 border border-gray-600 rounded-lg p-2.5 text-sm" placeholder="اشرح المشكلة بمزيد من التفصيل..."></textarea>
                    </div>

                    <div class="mb-2">
                        <label class="text-xs text-gray-400 mb-1 block">إرفاق صورة (اختياري)</label>
                        <div id="report-evidence-dropzone" class="border-2 border-dashed border-gray-600 rounded-lg p-3 text-center cursor-pointer hover:border-red-400 text-xs text-gray-400">
                            <div id="report-evidence-placeholder"><i class="fas fa-camera mb-1"></i><p>اضغط لإرفاق لقطة شاشة</p></div>
                            <img id="report-evidence-preview" class="hidden max-h-24 mx-auto rounded">
                        </div>
                        <input type="file" id="report-evidence-input" class="hidden" accept="image/*">
                    </div>
                </div>
                <div class="p-4 border-t border-gray-700">
                    <button id="submit-report-btn" class="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2.5 rounded-lg disabled:opacity-50" disabled>
                        <i class="fas fa-paper-plane mr-1"></i> إرسال البلاغ
                    </button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    const modal = document.getElementById('report-modal');
    let selectedReason = null;
    let evidenceUrl = null;

    document.getElementById('close-report-modal').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => { if (e.target.id === 'report-modal') modal.remove(); });

    const submitBtn = document.getElementById('submit-report-btn');
    const detailsInput = document.getElementById('report-details-input');
    const starEl = document.getElementById('details-required-star');

    function checkFormValid() {
        const detailsOk = selectedReason !== 'other' || detailsInput.value.trim().length >= 5;
        submitBtn.disabled = !selectedReason || !detailsOk;
    }

    modal.querySelectorAll('.report-reason-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            modal.querySelectorAll('.report-reason-chip').forEach(c => c.classList.remove('bg-red-600', 'border-red-500'));
            chip.classList.add('bg-red-600', 'border-red-500');
            selectedReason = chip.dataset.value;
            starEl.classList.toggle('hidden', selectedReason !== 'other');
            checkFormValid();
        });
    });
    detailsInput.addEventListener('input', checkFormValid);

    const dropzone = document.getElementById('report-evidence-dropzone');
    const fileInput = document.getElementById('report-evidence-input');
    dropzone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) { showNotification('الصورة كبيرة جداً (حد أقصى 5MB)', 'error'); return; }

        const reader = new FileReader();
        reader.onload = (ev) => {
            document.getElementById('report-evidence-placeholder').classList.add('hidden');
            const img = document.getElementById('report-evidence-preview');
            img.src = ev.target.result;
            img.classList.remove('hidden');
        };
        reader.readAsDataURL(file);

        try {
            const formData = new FormData();
            formData.append('file', file);
            const response = await fetch('/api/reports/upload-evidence', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });
            const result = await response.json();
            if (response.ok) evidenceUrl = result.data.url;
            else showNotification(result.message || 'فشل رفع الصورة', 'error');
        } catch (err) {
            showNotification('خطأ في رفع الصورة', 'error');
        }
    });

    submitBtn.addEventListener('click', async () => {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        try {
            const payload = {
                type: context.type,
                reportedUserId: context.reportedUserId,
                reason: selectedReason,
                details: detailsInput.value.trim(),
                messageId: context.messageId || undefined,
                roomId: context.roomId || undefined,
                messageContent: context.messageContent || undefined,
                messageType: context.messageType || undefined,
                evidenceUrl: evidenceUrl || undefined
            };
            const response = await fetch('/api/reports', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(payload)
            });
            const result = await response.json();
            if (response.ok) {
                showNotification('تم إرسال بلاغك بنجاح، سنراجعه قريباً', 'success');
                modal.remove();
            } else {
                showNotification(result.message || 'فشل إرسال البلاغ', 'error');
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fas fa-paper-plane mr-1"></i> إرسال البلاغ';
            }
        } catch (error) {
            showNotification('خطأ في الاتصال بالخادم', 'error');
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-paper-plane mr-1"></i> إرسال البلاغ';
        }
    });
}


        function skeletonList(count = 5) {
    return Array.from({ length: count }).map(() => `
        <div class="skeleton-card">
            <div class="skeleton-circle" style="width:40px;height:40px;"></div>
            <div style="flex:1;">
                <div class="skeleton-line" style="width:60%;margin-bottom:6px;"></div>
                <div class="skeleton-line" style="width:35%;"></div>
            </div>
        </div>
    `).join('');
}
        


// ✅ نافذة دعم فني سريعة قابلة لإعادة الاستخدام بأي قسم (دفع/هدايا/استبدال/إطارات)
function showQuickSupportModal(type, contextLabel) {
    const quickOptions = {
        payment_issue: ['لم يصلني الرصيد بعد التحويل', 'المبلغ المُستلَم غير مطابق', 'رقم المحفظة غير صحيح', 'مشكلة أخرى بالدفع'],
        gift_issue: ['لم تصلني الهدية المُرسَلة', 'خصم كوينز بدون إرسال هدية', 'مشكلة أخرى بالهدايا'],
        redemption_issue: ['لم يصلني مقابل الاستبدال', 'قيمة الاستبدال غير صحيحة', 'مشكلة أخرى بالاستبدال'],
        frame_issue: ['الإطار المُشترى لم يُفعَّل', 'مدة صلاحية الإطار خاطئة', 'مشكلة أخرى بالإطارات'],
        general: ['استفسار عام', 'مشكلة تقنية']
    };
    const options = quickOptions[type] || quickOptions.general;

    const existing = document.getElementById('quick-support-modal');
    if (existing) existing.remove();

    const modalHTML = `
        <div id="quick-support-modal" class="fixed inset-0 bg-black/80 flex items-center justify-center z-[600] p-4">
            <div class="bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm text-white border border-purple-500/30">
                <div class="flex items-center justify-between p-4 border-b border-gray-700">
                    <h3 class="text-lg font-bold flex items-center gap-2"><i class="fas fa-life-ring text-purple-400"></i> ${escapeHtmlClient(contextLabel)}</h3>
                    <button id="close-quick-support" class="text-gray-400 hover:text-white p-2"><i class="fas fa-times"></i></button>
                </div>
                <div class="p-4">
                    <p class="text-xs text-gray-400 mb-2">اختر المشكلة:</p>
                    <div id="quick-support-chips" class="flex flex-col gap-2 mb-3">
                        ${options.map(o => `<button type="button" class="quick-support-chip text-right text-sm py-2 px-3 rounded-lg border border-gray-600 hover:border-purple-400">${o}</button>`).join('')}
                    </div>
                    <textarea id="quick-support-details" rows="3" maxlength="500" class="w-full bg-gray-700 border border-gray-600 rounded-lg p-2.5 text-sm" placeholder="تفاصيل إضافية (اختياري)..."></textarea>
                    <button id="submit-quick-support" class="w-full mt-3 bg-purple-600 hover:bg-purple-700 text-white font-bold py-2.5 rounded-lg disabled:opacity-50" disabled>
                        <i class="fas fa-paper-plane mr-1"></i> إرسال للدعم الفني
                    </button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    const modal = document.getElementById('quick-support-modal');
    let selectedOption = null;

    document.getElementById('close-quick-support').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => { if (e.target.id === 'quick-support-modal') modal.remove(); });

    const submitBtn = document.getElementById('submit-quick-support');
    modal.querySelectorAll('.quick-support-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            modal.querySelectorAll('.quick-support-chip').forEach(c => c.classList.remove('bg-purple-600', 'border-purple-500'));
            chip.classList.add('bg-purple-600', 'border-purple-500');
            selectedOption = chip.textContent;
            submitBtn.disabled = false;
        });
    });

    submitBtn.addEventListener('click', async () => {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        try {
            const response = await fetch('/api/support/tickets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({
                    type, subject: selectedOption || contextLabel,
                    message: `${selectedOption || ''}\n${document.getElementById('quick-support-details').value.trim()}`.trim()
                })
            });
            const result = await response.json();
            if (response.ok) { showNotification('تم إرسال طلبك للدعم الفني بنجاح', 'success'); modal.remove(); }
            else { showNotification(result.message || 'فشل الإرسال', 'error'); submitBtn.disabled = false; submitBtn.innerHTML = '<i class="fas fa-paper-plane mr-1"></i> إرسال للدعم الفني'; }
        } catch (error) {
            showNotification('خطأ بالاتصال', 'error');
            submitBtn.disabled = false; submitBtn.innerHTML = '<i class="fas fa-paper-plane mr-1"></i> إرسال للدعم الفني';
        }
    });
}


        

async function loadGiftsReceivedSummary() {
    const body = document.getElementById('gifts-received-body');
    if (!body) return;

    try {
        const response = await fetch('/api/gift-redemption/summary', { headers: { 'Authorization': `Bearer ${token}` } });
        const result = await response.json();
        if (!response.ok) throw new Error();

        const d = result.data;

                body.innerHTML = `
               <div class="flex justify-end mb-1">
                <button id="redemption-support-btn" class="report-issue-btn"><i class="fas fa-exclamation-triangle"></i> الإبلاغ عن مشكلة</button>
            </div>
            <div class="bg-gray-900/50 rounded-xl p-4 mb-4 text-center">
                <p class="text-3xl font-bold text-pink-400">${d.totalGiftsCount}</p>
                <p class="text-xs text-gray-400">هدية قابلة للاستبدال (${d.totalCoinsValue} كوينز)</p>
            </div>
            ${d.totalGiftsCount > 0 ? `
                <p class="text-xs text-gray-500 mb-3 text-center">نسبة الاستبدال ${d.redemptionRatePercent}% (خصم منصة بسيط لضمان عدالة النظام)</p>
                <div class="grid grid-cols-2 gap-3">
                    <button id="redeem-to-balance-btn" class="bg-green-600 hover:bg-green-700 text-white py-3 rounded-lg text-sm font-bold">
                        <i class="fas fa-dollar-sign"></i><br>${d.usdIfRedeemed}$
                        <p class="text-[10px] font-normal opacity-80">تحويل لرصيد</p>
                    </button>
                    <button id="redeem-to-coins-btn" class="bg-yellow-600 hover:bg-yellow-700 text-white py-3 rounded-lg text-sm font-bold">
                        <i class="fas fa-coins"></i><br>${d.coinsIfRedeemed}
                        <p class="text-[10px] font-normal opacity-80">تحويل لكوينز</p>
                    </button>
                </div>
            ` : '<p class="text-center text-gray-500 text-sm">لا توجد هدايا جديدة قابلة للاستبدال</p>'}
        `;

        document.getElementById('redeem-to-balance-btn')?.addEventListener('click', () => confirmRedeem('balance'));
        document.getElementById('redeem-to-coins-btn')?.addEventListener('click', () => confirmRedeem('coins'));
                document.getElementById('redemption-support-btn')?.addEventListener('click', () => showQuickSupportModal('redemption_issue', 'مشكلة في استبدال الهدايا'));

    } catch (error) {
        body.innerHTML = '<p class="text-center text-red-400 text-sm">فشل تحميل بيانات الهدايا</p>';
    }
}

function confirmRedeem(redeemTo) {
    const label = redeemTo === 'balance' ? 'رصيد الدولار' : 'الكوينز';
    showConfirmationModal(`هل أنت متأكد من استبدال جميع هداياك القابلة للاستبدال إلى ${label}؟ هذا الإجراء لا يمكن التراجع عنه.`, async () => {
        try {
            const response = await fetch('/api/gift-redemption/redeem', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ redeemTo })
            });
            const result = await response.json();
            if (response.ok) {
                showNotification(result.message, 'success');
                await refreshUserData();
                showSettingsView();
            } else {
                showNotification(result.message || 'فشل الاستبدال', 'error');
            }
        } catch (error) {
            showNotification('خطأ في الاتصال بالخادم', 'error');
        }
    });
}


        
   async function showPublicGiftModal() {
    const existing = document.getElementById('public-gift-modal');
    if (existing) existing.remove();

    const shellHTML = `
        <div id="public-gift-modal" class="fixed inset-0 bg-black/60 flex items-end md:items-center justify-center z-[320] p-3">
            <div class="room-gift-sheet w-full md:max-w-sm text-white flex flex-col animate-[slideUp_0.25s_ease-out]">
                <div class="w-9 h-1 bg-gray-600 rounded-full mx-auto mt-2 mb-1 md:hidden flex-shrink-0"></div>
                <div class="gift-sheet-header flex-shrink-0">
                    <div id="public-gift-avatars" class="room-gift-avatar-row flex-1"></div>
                    <button id="public-gift-support-btn" class="report-issue-icon-btn flex-shrink-0" title="الإبلاغ عن مشكلة"><i class="fas fa-exclamation-triangle"></i></button>
                </div>
                <div id="public-gift-body" class="px-3 pb-2 overflow-y-auto flex-1">
                    <div class="text-center text-gray-400 py-10"><i class="fas fa-spinner fa-spin"></i></div>
                </div>
                <div id="public-gift-footer"></div>
            </div>
        </div>
    `;

    document.getElementById('game-container').insertAdjacentHTML('beforeend', shellHTML);
    const modal = document.getElementById('public-gift-modal');

    document.getElementById('public-gift-support-btn').addEventListener('click', () => showQuickSupportModal('gift_issue', 'مشكلة في هدايا الشات العام'));
    modal.addEventListener('click', (e) => { if (e.target.id === 'public-gift-modal') modal.remove(); });

    try {
        const [onlineRes, shopRes] = await Promise.all([
            fetch('/api/users/online/public-room', { headers: { 'Authorization': `Bearer ${token}` } }).then(r => r.json()),
            fetch('/api/gifts/shop', { headers: { 'Authorization': `Bearer ${token}` } }).then(r => r.json())
        ]);

        const onlineUsers = onlineRes.data.users;
        const gifts = shopRes.data.gifts;
        const localUserSnapshot = JSON.parse(localStorage.getItem('user')) || {};

        let selectedUserIds = new Set();
        let audienceMode = 'selected';

        const body = document.getElementById('public-gift-body');
        const footer = document.getElementById('public-gift-footer');
        document.getElementById('public-gift-avatars').innerHTML = `
            <button id="select-all-online-btn" class="room-gift-all-btn relative flex flex-col items-center gap-1 flex-shrink-0" title="إرسال للجميع">
                <span class="room-gift-all-circle rg-avatar-img">All</span>
                <span class="text-[8px] leading-tight text-gray-400">${onlineUsers.length}</span>
            </button>
            ${onlineUsers.length === 0 ? '<p class="text-[11px] text-gray-500 py-1.5">لا يوجد أشخاص متصلون حالياً</p>' : onlineUsers.map(u => `
                <button class="public-gift-avatar-btn relative flex flex-col items-center gap-1 flex-shrink-0" data-user-id="${u._id}" data-username="${escapeHtml(u.username)}" title="${escapeHtml(u.username)}">
                    <span class="relative inline-block">
                        <img src="${u.profileImage}" class="rg-avatar-img ${u.activeFrameClass || ''}">
                        <span class="rg-selected-badge hidden absolute -top-1 -left-1 w-3.5 h-3.5 bg-pink-500 rounded-full border-2 border-gray-900 items-center justify-center">
                            <i class="fas fa-check text-white" style="font-size:6px"></i>
                        </span>
                    </span>
                    <span class="text-[8px] leading-tight truncate w-10 text-center">${escapeHtml(u.username)}</span>
                </button>
            `).join('')}
        `;
        body.innerHTML = `
            <div class="gift-category-tabs mb-2"></div>
            <div id="public-gift-cards-grid" class="room-gift-cards-grid grid grid-cols-3 gap-2">
                ${gifts.map(g => renderGiftCardHTML(g)).join('')}
            </div>
        `;
        footer.innerHTML = `
            <div class="flex items-center gap-2 p-3 border-t border-gray-700 bg-gray-900/60 flex-shrink-0">
                <span class="text-xs text-yellow-400 flex items-center gap-1 flex-shrink-0 font-bold">
                    <i class="fas fa-coins"></i> <span id="pg-balance">${localUserSnapshot.coins || 0}</span>
                </span>
                <span id="pg-send-counter" class="hidden text-[11px] text-gray-400 flex-1 text-center"></span>
                <div class="flex-1"></div>
                <button type="button" id="public-gift-send-btn" class="gift-send-main-btn" disabled title="اختر هدية أولاً">
                    <i class="fas fa-paper-plane"></i> إرسال
                </button>
            </div>
        `;

        wireGiftImageFallbacks(body);
        wireGiftCategoryTabs(body, gifts, '#public-gift-cards-grid');

        function markAllSelectedVisual(isAll) {
            document.getElementById('select-all-online-btn')?.querySelector('.rg-avatar-img')?.classList.toggle('room-gift-all-active', isAll);
        }

        function clearIndividualSelectionVisuals() {
            modal.querySelectorAll('.public-gift-avatar-btn').forEach(b => {
                b.querySelector('.rg-avatar-img')?.classList.remove('ring-2', 'ring-pink-500');
                b.querySelector('.rg-selected-badge')?.classList.add('hidden');
                b.classList.remove('bg-pink-900/40');
            });
        }

        document.getElementById('select-all-online-btn').addEventListener('click', function() {
            audienceMode = 'all';
            selectedUserIds.clear();
            clearIndividualSelectionVisuals();
            markAllSelectedVisual(true);
        });

        modal.querySelectorAll('.public-gift-avatar-btn').forEach(avatarBtn => {
            avatarBtn.addEventListener('click', () => {
                audienceMode = 'selected';
                markAllSelectedVisual(false);
                const uid = avatarBtn.dataset.userId;
                const img = avatarBtn.querySelector('.rg-avatar-img');
                const badge = avatarBtn.querySelector('.rg-selected-badge');
                if (selectedUserIds.has(uid)) {
                    selectedUserIds.delete(uid);
                    img.classList.remove('ring-2', 'ring-pink-500');
                    badge.classList.add('hidden');
                    avatarBtn.classList.remove('bg-pink-900/40');
                } else {
                    selectedUserIds.add(uid);
                    img.classList.add('ring-2', 'ring-pink-500');
                    badge.classList.remove('hidden');
                    badge.classList.add('flex');
                    avatarBtn.classList.add('bg-pink-900/40');
                }
            });
        });

        // 🐛 إصلاح: هذا القسم كان معطّلاً بالكامل — الكود القديم كان يتوقّع بنية كارد قديمة
        // (زر توسيع داخلي .gift-card-toggle) لم تعد موجودة إطلاقاً بقالب renderGiftCardHTML
        // الموحّد الحالي، فكان `.querySelector('.gift-card-toggle')` يرجع null ويرمي خطأ فوراً
        // عند فتح النافذة — يظهر معه "فشل تحميل البيانات" دوماً. الحل: تحديد الهدية بالضغط
        // على الكارد نفسه (تفويض أحداث يبقى يعمل حتى بعد إعادة رسم الشبكة بفلترة التصنيفات)،
        // وزر إرسال واحد ثابت بالتذييل يستخدم نفس محرك الإرسال المتسارع الأصلي والسليم أصلاً
        let selectedGift = null;
        body.addEventListener('click', (e) => {
            const card = e.target.closest('.gift-card-wrapper');
            if (!card || !body.contains(card)) return;
            const wasSelected = card.classList.contains('gift-card-selected');
            body.querySelectorAll('.gift-card-wrapper').forEach(c => c.classList.remove('gift-card-selected'));
            const sendBtn = document.getElementById('public-gift-send-btn');
            if (wasSelected) {
                selectedGift = null;
                if (sendBtn) sendBtn.disabled = true;
            } else {
                card.classList.add('gift-card-selected');
                selectedGift = {
                    id: card.dataset.giftId,
                    name: card.dataset.giftName,
                    price: parseFloat(card.dataset.giftPrice),
                    icon: card.dataset.giftIcon,
                    imageUrl: card.dataset.giftImage
                };
                if (sendBtn) sendBtn.disabled = false;
            }
        });

        setupRapidPublicGiftButton(
            () => selectedGift,
            () => ({ audienceMode, selectedUserIds, onlineCount: onlineUsers.length }),
            document.getElementById('public-gift-send-btn'),
            document.getElementById('pg-send-counter')
        );

    } catch (error) {
        console.error('[PUBLIC GIFT] Error:', error);
        document.getElementById('public-gift-body').innerHTML = `<div class="text-center text-red-400 py-10">فشل تحميل البيانات</div>`;
    }
}

// --- ⚡ محرك الإرسال المتسارع لهدايا الشات العام: ضغطة = هدية، استمرار الضغط = تسارع تلقائي، بدون إغلاق النافذة ---
// --- ⚡ محرك الإرسال المتسارع لهدايا الشات العام (نفس منطق الدردشة الخاصة تماماً) ---
function setupRapidPublicGiftButton(getSelectedGift, getAudience, btn, counterLabel) {
    if (!btn) return;

    let sentCount = 0;
    let inFlight = 0;
    let requestSeq = 0;
    let latestAppliedSeq = 0;
    const MAX_CONCURRENT = 3;
    let active = false;
    let rampTimeout = null;
    let intervalMs = 300;
    const MIN_INTERVAL = 90;
    const ACCEL_FACTOR = 0.87;

    async function fireOnePublicGift() {
        const gift = getSelectedGift();
        const { audienceMode, selectedUserIds, onlineCount } = getAudience();
        if (!gift || !active) return;

        const recipientCount = audienceMode === 'all' ? onlineCount : selectedUserIds.size;
        if (recipientCount === 0) {
            stopRapidSending();
            showFloatingAlert('يجب اختيار شخص أولاً', 'fa-user-plus', 'bg-yellow-500');
            return;
        }

        const localUser = JSON.parse(localStorage.getItem('user'));
        const cost = gift.price * recipientCount;
        if (!localUser || localUser.coins < cost) {
            stopRapidSending();
            showFloatingAlert('رصيد الكوينز غير كافٍ', 'fa-coins', 'bg-red-500');
            return;
        }

        // ✅ تحديث متفائل فوري
        localUser.coins -= cost;
        localStorage.setItem('user', JSON.stringify(localUser));
        const coinsEl = document.getElementById('coins');
        if (coinsEl) coinsEl.textContent = localUser.coins;
        const balanceEl = document.getElementById('pg-balance');
        if (balanceEl) balanceEl.textContent = localUser.coins;

                sentCount++;
        const mySeq = ++requestSeq;
        if (counterLabel) {
            counterLabel.textContent = `أُرسل ×${sentCount}`;
            counterLabel.classList.remove('hidden');
        }
        showGiftFloatingAnimation(gift.imageUrl, gift.name, 'أنت', sentCount);

        inFlight++;
        try {
            const payload = {
                giftId: gift.id,
                audience: audienceMode,
                recipientIds: audienceMode === 'selected' ? Array.from(selectedUserIds) : []
            };
            const response = await fetch('/api/gifts/send-public', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(payload)
            });
            const result = await response.json();

            if (response.ok) {
                if (mySeq > latestAppliedSeq) {
                    latestAppliedSeq = mySeq;
                    const syncedUser = JSON.parse(localStorage.getItem('user'));
                    if (syncedUser) {
                        syncedUser.coins = result.data.newCoins;
                        localStorage.setItem('user', JSON.stringify(syncedUser));
                    }
                    if (coinsEl) coinsEl.textContent = result.data.newCoins;
                    if (balanceEl) balanceEl.textContent = result.data.newCoins;
                }
            } else {
                const revertUser = JSON.parse(localStorage.getItem('user'));
                if (revertUser) {
                    revertUser.coins += cost;
                    localStorage.setItem('user', JSON.stringify(revertUser));
                    if (coinsEl) coinsEl.textContent = revertUser.coins;
                    if (balanceEl) balanceEl.textContent = revertUser.coins;
                }
                // ✅ حد معدّل الإرسال (429) أثناء ضغط مستمر سريع: لا نقاطع المستخدم ولا نزعجه
                // بتنبيه — فقط نتراجع عن خصم هذي المحاولة ونكمل بهدوء بالتكرار التالي تلقائياً
                if (response.status !== 429) {
                    stopRapidSending();
                    showFloatingAlert(result.message || 'فشل إرسال الهدية', 'fa-exclamation-circle', 'bg-red-500');
                }
            }
        } catch (error) {
            console.error('[RAPID PUBLIC GIFT] Error:', error);
        } finally {
            inFlight--;
        }
    }

    function scheduleNext() {
        if (!active) return;
        rampTimeout = setTimeout(() => {
            if (!active) return;
            if (inFlight < MAX_CONCURRENT) fireOnePublicGift();
            intervalMs = Math.max(MIN_INTERVAL, Math.round(intervalMs * ACCEL_FACTOR));
            scheduleNext();
        }, intervalMs);
    }

    function startRapidSending() {
        if (active) return;
        active = true;
        intervalMs = 300;
        fireOnePublicGift();
        scheduleNext();
    }

    function stopRapidSending() {
        active = false;
        clearTimeout(rampTimeout);
        rampTimeout = null;
    }

    btn.addEventListener('mousedown', startRapidSending);
    btn.addEventListener('touchstart', (e) => { e.preventDefault(); startRapidSending(); }, { passive: false });
    btn.addEventListener('mouseup', stopRapidSending);
    btn.addEventListener('mouseleave', stopRapidSending);
    btn.addEventListener('touchend', stopRapidSending);
}

        
// =================================================
// ============ قسم المتصدرين (Leaderboard) =========
// =================================================

// ✅ يفتح شاشة "المتصدرين" مباشرة على تبويب "الغرف" — نداء واحد يضبط الاختيار المبدئي
// ثم يُشغّل التنقّل القياسي (يُقرأ ويُصفَّر داخل showLeaderboardView نفسها فور تنفيذها)
let leaderboardInitialTabOverride = null;
function goToRoomRankingsLeaderboard() {
    leaderboardInitialTabOverride = 'rooms';
    switchToView('leaderboard');
}

async function showLeaderboardView() {
    const initialType = leaderboardInitialTabOverride || 'senders';
    leaderboardInitialTabOverride = null;
    mainContent.innerHTML = `
        <div class="flex flex-col h-full">
            <h2 class="text-xl font-bold mb-3 flex items-center gap-2"><i class="fas fa-trophy text-yellow-400"></i> المتصدرين</h2>
            <div id="lb-range-row" class="flex gap-2 mb-2">
                <button class="lb-range-btn flex-1 py-1.5 rounded-lg text-xs font-bold bg-purple-600 text-white" data-range="week">هذا الأسبوع</button>
                <button class="lb-range-btn flex-1 py-1.5 rounded-lg text-xs font-bold bg-gray-700 text-gray-300" data-range="month">هذا الشهر</button>
                <button class="lb-range-btn flex-1 py-1.5 rounded-lg text-xs font-bold bg-gray-700 text-gray-300" data-range="year">هذا العام</button>
            </div>
            <div class="flex gap-2 mb-4">
                <button id="lb-tab-senders" class="flex-1 py-2 rounded-lg text-sm font-bold bg-pink-600 text-white"><i class="fas fa-hand-holding-heart mr-1"></i> الأكثر إهداءً</button>
                <button id="lb-tab-receivers" class="flex-1 py-2 rounded-lg text-sm font-bold bg-gray-700 text-gray-300"><i class="fas fa-crown mr-1"></i> الأكثر تلقياً</button>
                <button id="lb-tab-rooms" class="flex-1 py-2 rounded-lg text-sm font-bold bg-gray-700 text-gray-300"><i class="fas fa-trophy mr-1"></i> الغرف</button>
            </div>
            <div id="leaderboard-list-container" class="flex-grow overflow-y-auto space-y-2 pr-1">
                <div class="text-center text-gray-400 py-16"><i class="fas fa-spinner fa-spin text-3xl"></i></div>
            </div>
        </div>
    `;

    let currentType = initialType;
    let currentRange = 'week';

    document.querySelectorAll('.lb-range-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            currentRange = btn.dataset.range;
            document.querySelectorAll('.lb-range-btn').forEach(b => { b.classList.remove('bg-purple-600', 'text-white'); b.classList.add('bg-gray-700', 'text-gray-300'); });
            btn.classList.remove('bg-gray-700', 'text-gray-300'); btn.classList.add('bg-purple-600', 'text-white');
            loadLeaderboard(currentType, currentRange);
        });
    });

    document.getElementById('lb-tab-senders').addEventListener('click', function() {
        currentType = 'senders';
        setLeaderboardTab('senders');
        loadLeaderboard(currentType, currentRange);
    });
    document.getElementById('lb-tab-receivers').addEventListener('click', function() {
        currentType = 'receivers';
        setLeaderboardTab('receivers');
        loadLeaderboard(currentType, currentRange);
    });
    // ✅ تبويب "الغرف" — نفس منصّة التتويج (أول 3 + قائمة) المُستخدَمة سابقاً بنافذة منفصلة
    // داخل الغرفة، مدموجة الآن هنا كتبويب ثالث بدل واجهة مستقلة (ترتيب لا يتعلّق بفترة زمنية،
    // فشريط الفترات يُخفى معه)
    document.getElementById('lb-tab-rooms').addEventListener('click', function() {
        currentType = 'rooms';
        setLeaderboardTab('rooms');
        loadLeaderboard(currentType, currentRange);
    });

    setLeaderboardTab(currentType);
    await loadLeaderboard(currentType, currentRange);
}


function setLeaderboardTab(type) {
    const sendersBtn = document.getElementById('lb-tab-senders');
    const receiversBtn = document.getElementById('lb-tab-receivers');
    const roomsBtn = document.getElementById('lb-tab-rooms');
    const rangeRow = document.getElementById('lb-range-row');
    if (!sendersBtn || !receiversBtn || !roomsBtn) return;

    [sendersBtn, receiversBtn, roomsBtn].forEach(btn => {
        btn.classList.remove('bg-pink-600', 'text-white');
        btn.classList.add('bg-gray-700', 'text-gray-300');
    });
    const activeBtn = type === 'senders' ? sendersBtn : (type === 'receivers' ? receiversBtn : roomsBtn);
    activeBtn.classList.add('bg-pink-600', 'text-white');
    activeBtn.classList.remove('bg-gray-700', 'text-gray-300');
    if (rangeRow) rangeRow.classList.toggle('hidden', type === 'rooms'); // ✅ لا فترة زمنية لترتيب الغرف — تراكمي دائماً
}

async function loadLeaderboard(type, range = 'week') {
    const container = document.getElementById('leaderboard-list-container');
    if (!container) return;

    container.innerHTML = `<div class="text-center text-gray-400 py-16"><i class="fas fa-spinner fa-spin text-3xl"></i></div>`;

    if (type === 'rooms') {
        try {
            const response = await fetch('/api/voice-room/rankings', { headers: { 'Authorization': `Bearer ${token}` } });
            const result = await response.json();
            const rooms = (response.ok && result.rooms) ? result.rooms : [];
            if (rooms.length === 0) {
                container.innerHTML = '<div class="text-center text-gray-400 py-16"><i class="fas fa-trophy text-4xl mb-4"></i><p>لا توجد غرف متصدّرة بعد — كن أول من يتصدّر! 🏆</p></div>';
                return;
            }
            renderRoomRankingsBody(container, rooms);
        } catch (error) {
            container.innerHTML = '<div class="text-center text-red-400 py-16">تعذر تحميل الترتيب، حاول مجدداً</div>';
        }
        return;
    }

    const endpoint = type === 'senders' ? '/api/gifts/leaderboard/top-senders' : '/api/gifts/leaderboard/top-receivers';

    try {
        const response = await fetch(`${endpoint}?range=${range}`, { headers: { 'Authorization': `Bearer ${token}` } });
        const result = await response.json();
        if (!response.ok) throw new Error();

        const leaders = result.data.leaders;
        if (!leaders || leaders.length === 0) {
            container.innerHTML = `<div class="text-center text-gray-400 py-16"><i class="fas fa-gift text-4xl mb-4"></i><p>لا توجد بيانات لهذه الفترة</p></div>`;
            return;
        }

        const valueKey = type === 'senders' ? 'totalSpent' : 'totalReceived';
        const rankColors = ['from-yellow-400 to-orange-500', 'from-gray-300 to-gray-500', 'from-orange-600 to-orange-800'];

        container.innerHTML = leaders.map((leader, index) => `
            <div class="flex items-center gap-3 p-3 rounded-xl bg-gray-800/40 hover:bg-gray-700/40 transition">
                <div class="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${index < 3 ? `bg-gradient-to-br ${rankColors[index]} text-white` : 'bg-gray-700 text-gray-300'}">${index + 1}</div>
                <img src="${leader.profileImage}" class="w-11 h-11 rounded-full object-cover border-2 border-gray-600 ${leader.activeFrameClass || ''}">
                <div class="flex-1 min-w-0">
                    <p class="font-bold text-sm truncate">${leader.username}</p>
                    <p class="text-xs text-gray-400">${leader.giftsCount} هدية</p>
                </div>
                <span class="font-bold text-yellow-400 flex items-center gap-1 text-sm"><i class="fas fa-coins"></i> ${leader[valueKey].toLocaleString()}</span>
            </div>
        `).join('');

    } catch (error) {
        container.innerHTML = `<div class="text-center text-red-400 py-16">فشل تحميل المتصدرين</div>`;
    }
}


        


// --- 📡 دالة تحميل تاريخ المحادثة من الخادم ---
// --- 📡 دالة تحميل تاريخ المحادثة من الخادم ---
async function loadChatHistoryFromServer(targetUserId) {
    const messagesContainer = document.getElementById('private-chat-messages');
    if (!messagesContainer) return;
    
    try {
        console.log(`[CHAT] Loading chat history with ${targetUserId}`);
        
        const response = await fetch(`/api/private-chat/chat/${targetUserId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const result = await response.json();
        
        if (response.ok && result.status === 'success') {
            const emptyState = messagesContainer.querySelector('.text-center');
            if (emptyState) emptyState.remove();
            
            result.data.messages.forEach(message => {
                const isMyMessage = message.sender._id === JSON.parse(localStorage.getItem('user'))._id;
                displayPrivateMessage(message, isMyMessage);
            });
            
            updateChatHeader(result.data.chat);
            
            console.log(`✅ [CHAT] Loaded ${result.data.messages.length} messages`);
            
            if (result.data.unreadCount > 0) {
                markMessagesAsDelivered(result.data.messages);
            }

            // ✅ جديد: تصفير عداد غير المقروء + تحديث شارة الرسائل والقائمة إن كانت مفتوحة
            try {
                await fetch(`/api/private-chat/chat/${targetUserId}/read`, {
                    method: 'PUT',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                refreshMessagesNavBadge();
                if (document.getElementById('messages-list-container')) {
                    loadMessagesList();
                }
            } catch (readError) {
                console.error('[CHAT] Error marking chat as read:', readError);
            }
            
        } else {
            console.warn('[CHAT] No chat history or error:', result.message);
        }
        
    } catch (error) {
        console.error('[CHAT] Error loading chat history:', error);
    }
}

// --- 🔄 دالة تحديث رأس الدردشة ---
function formatLastSeen(dateString) {
    if (!dateString) return '';
    const diffMs = Date.now() - new Date(dateString).getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'آخر ظهور: الآن';
    if (mins < 60) return `آخر ظهور: منذ ${mins} د`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `آخر ظهور: منذ ${hours} س`;
    return `آخر ظهور: ${new Date(dateString).toLocaleDateString('ar-SA')}`;
}

function updateChatHeader(chatData) {
    if (!chatData || !chatData.participants) return;
    
    const currentUserId = JSON.parse(localStorage.getItem('user'))._id;
    const otherParticipant = chatData.participants.find(p => p._id.toString() !== currentUserId.toString());
    
    if (otherParticipant) {
        const avatar = document.getElementById('chat-user-avatar');
        const chatModal = document.getElementById('private-chat-modal');
        
        if (avatar) avatar.src = otherParticipant.profileImage;
        if (chatModal) {
            chatModal.dataset.otherUserId = otherParticipant._id;
            chatModal.dataset.otherUserOnline = String(!!otherParticipant.isOnline);
            chatModal.dataset.otherUserLastActive = otherParticipant.lastActive || '';
        }
        // ✅ لا نلمس اسم/شارات المستخدم هنا إطلاقاً — loadChatUserData هي المسؤول الوحيد عنها
        // لمنع تضارب التزامن الذي كان يمحو شارة الوكيل/أيقونة البوت
        if (!otherParticipant.isBot) restoreOnlineStatusDisplay();
    }
}

// --- 📨 دالة تعليم الرسائل كـ "تم التسليم" ---
async function markMessagesAsDelivered(messages) {
    const currentUserId = JSON.parse(localStorage.getItem('user'))._id;
    
    // تصفية الرسائل المرسلة لي
    const messagesToMark = messages.filter(msg => 
        msg.receiver.toString() === currentUserId && 
        !msg.status.delivered
    );
    
    if (messagesToMark.length === 0) return;
    
    try {
        // تحديث حالة كل رسالة
        for (const message of messagesToMark) {
            const response = await fetch('/api/private-chat/message/status', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    messageId: message._id,
                    status: 'delivered'
                })
            });
            
            if (response.ok) {
                // تحديث الواجهة
                const messageElement = document.querySelector(`[data-message-id="${message._id}"]`);
                if (messageElement) {
                    messageElement.querySelector('.message-status').innerHTML = `
                        <i class="fas fa-check-double text-gray-400 text-xs" title="تم التسليم"></i>
                    `;
                }
            }
        }
        
    } catch (error) {
        console.error('[CHAT] Error marking messages as delivered:', error);
    }
}
        

// --- 📥 دالة تحميل بيانات المستخدم للدردشة ---
async function loadChatUserData(userId) {
    try {
        const response = await fetch(`/api/users/${userId}/mini-profile`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            const result = await response.json();
            if (result.status === 'success') {
                const user = result.data;
                
                const avatar = document.getElementById('chat-user-avatar');
                const name = document.getElementById('chat-user-name');
                const chatModal = document.getElementById('private-chat-modal');
                
                if (avatar) { avatar.src = user.profileImage; applyFrameToAvatar(avatar, user.activeFrameClass); }
                if (chatModal) chatModal.dataset.isBot = user.isBot ? 'true' : 'false';

                if (user.isBot) {
                    if (name) name.innerHTML = `${user.username} <span class="text-purple-400"><i class="fas fa-robot"></i></span>`;
                    const statusEl = document.getElementById('chat-user-status');
                    if (statusEl) statusEl.innerHTML = '<span class="text-purple-300"><i class="fas fa-shield-halved"></i> حساب رسمي</span>';
                    setupPrivateChatEvents(userId);
                } else {
                    // ✅ المصدر الوحيد لكتابة الاسم + الشارة — لا يُكتب فوقه من أي مكان آخر
                    if (name) name.innerHTML = `${user.username} ${getAgentBadgeIconHTML(user.isAgent)}`;
                }
            }
        }
    } catch (error) {
        console.error('[CHAT] Error loading user data:', error);
    }
}

// --- 📜 دالة تحميل تاريخ المحادثة ---
async function loadChatHistory(targetUserId) {
    const messagesContainer = document.getElementById('private-chat-messages');
    if (!messagesContainer) return;
    
    // TODO: جلب الرسائل من API
    // سيتم تنفيذها لاحقاً عند بناء الخادم
}

// --- 🎮 دالة إعداد أحداث الدردشة ---
function setupPrivateChatEvents(targetUserId) {
    const chatModal = document.getElementById('private-chat-modal');
    if (!chatModal) return;

    // ✅ إذا كانت المحادثة مع البوت، نعطّل شريط الإدخال بالكامل (قراءة فقط)
    if (chatModal.dataset.isBot === 'true') {
        const inputArea = document.getElementById('private-chat-input-area');
        if (inputArea) {
            inputArea.innerHTML = `
                <div class="text-center py-2">
                    <p class="text-xs text-gray-400"><i class="fas fa-robot mr-1 text-purple-400"></i> هذا حساب بوت رسمي، لا يمكن الرد عليه</p>
                </div>
            `;
        }
        const closeBtn = document.getElementById('close-private-chat');
        if (closeBtn) closeBtn.addEventListener('click', () => chatModal.remove());
        chatModal.addEventListener('click', (e) => { if (e.target.id === 'private-chat-modal') chatModal.remove(); });
        return; // لا نُكمل لباقي منطق الإدخال والرد
    }
    
    // 1. زر الإغلاق
    const closeBtn = document.getElementById('close-private-chat');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            chatModal.remove();
        });
    }
    
    // 2. إغلاق بالنقر على الخلفية
    chatModal.addEventListener('click', (e) => {
        if (e.target.id === 'private-chat-modal') {
            chatModal.remove();
        }
    });
    
    // 3. عداد الأحرف
    const messageInput = document.getElementById('private-message-input');
    const charCounter = document.getElementById('private-char-count');
    
        let typingEmitTimeout = null;
    let isCurrentlyTyping = false;
    if (messageInput && charCounter) {
        messageInput.addEventListener('input', () => {
            const length = messageInput.value.length;
            charCounter.textContent = `${length}/200`;
            
            if (length > 180) {
                charCounter.classList.add('text-red-400');
            } else {
                charCounter.classList.remove('text-red-400');
            }

            // ✅ إرسال حدث "يكتب الآن" مع تهدئة (throttle) لتفادي إغراق الخادم بأحداث لكل حرف
            if (!isCurrentlyTyping) {
                isCurrentlyTyping = true;
                socket.emit('typing-start', { targetUserId });
            }
            clearTimeout(typingEmitTimeout);
            typingEmitTimeout = setTimeout(() => {
                isCurrentlyTyping = false;
                socket.emit('typing-stop', { targetUserId });
            }, 2000);
        });
    }


    // تحديث زر الإرسال بناءً على حالة حقل النص
function updateSendButton() {
    const sendBtn = document.getElementById('send-private-message');
    if (messageInput.value.trim() === '') {
        // حالة فارغة: زر تسجيل صوتي
        sendBtn.innerHTML = '<i class="fas fa-microphone text-white"></i>';
        sendBtn.dataset.mode = 'voice';
        sendBtn.title = 'تسجيل صوتي (اضغط مع الاستمرار)';
    } else {
        // حالة بها نص: زر إرسال
        sendBtn.innerHTML = '<i class="fas fa-paper-plane text-white"></i>';
        sendBtn.dataset.mode = 'text';
        sendBtn.title = 'إرسال الرسالة';
    }
}

// استدعاء الدالة عند التحميل أولاً
updateSendButton();

// تحديث الزر عند كتابة/مسح النص
messageInput.addEventListener('input', updateSendButton);
    

// 4. زر الإرسال (ديناميكي)
const sendBtn = document.getElementById('send-private-message');
if (sendBtn && messageInput) {
    sendBtn.removeEventListener('click', sendBtn.clickHandler);

    sendBtn.clickHandler = () => {
        if (sendBtn.dataset.mode === 'voice') {
            startWhatsAppStyleRecording(targetUserId);
        } else {
            // ✅ الإصلاح: تمرير معرف الرسالة المردود عليها
            const replyId = replyingToPrivateMessage ? replyingToPrivateMessage._id : null;
            sendPrivateMessage(targetUserId, messageInput.value.trim(), replyId);
            messageInput.value = '';
            if (charCounter) charCounter.textContent = '0/200';
            updateSendButton();
        }
    };

    sendBtn.addEventListener('click', sendBtn.clickHandler);
}

    // 5. إرسال بـ Enter
if (messageInput) {
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (sendBtn.dataset.mode === 'text') {
                // ✅ الإصلاح: تمرير معرف الرسالة المردود عليها هنا أيضاً
                const replyId = replyingToPrivateMessage ? replyingToPrivateMessage._id : null;
                sendPrivateMessage(targetUserId, messageInput.value.trim(), replyId);
                messageInput.value = '';
                if (charCounter) charCounter.textContent = '0/200';
                updateSendButton();
            }
        }
    });
}
    
    // 6. زر فتح الخيارات
    const toggleBtn = document.getElementById('toggle-chat-options');
    const optionsBar = document.getElementById('chat-options-bar');
    
    if (toggleBtn && optionsBar) {
        toggleBtn.addEventListener('click', () => {
            optionsBar.classList.toggle('hidden');
            toggleBtn.querySelector('i').classList.toggle('fa-plus');
            toggleBtn.querySelector('i').classList.toggle('fa-times');
        });
    }

    // 8. زر معلومات المستخدم (فتح الملف الشخصي)
    const infoBtn = document.getElementById('chat-info-btn');
    if (infoBtn) {
        infoBtn.addEventListener('click', () => {
            showMiniProfileModal(targetUserId);
        });
    }

    // 9. زر مكالمة صوتية (الميزة غير متوفرة حالياً - نعرض ذلك بصراحة بدل زر بلا وظيفة)
    const callBtn = document.getElementById('chat-call-btn');
    if (callBtn) {
        callBtn.addEventListener('click', () => {
            showNotification('ميزة المكالمات الصوتية غير متوفرة حالياً', 'info');
        });
    }

    // 10. زر الإجراءات (قائمة منسدلة: عرض الملف / حظر / فك حظر)
    const actionsBtn = document.getElementById('chat-actions-btn');
    if (actionsBtn) {
        actionsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleChatActionsMenu(actionsBtn, targetUserId);
        });
    }
        // 11. زر الهدايا المدمج بشريط الكتابة
    const inlineGiftBtn = document.getElementById('open-inline-gift-btn');
    if (inlineGiftBtn) {
        inlineGiftBtn.addEventListener('click', () => {
            const chatUserName = document.getElementById('chat-user-name')?.textContent?.trim() || 'المستخدم';
            showGiftStoreModal(targetUserId, chatUserName);
        });
    }
    
    // 7. أزرار الوسائط
    document.querySelectorAll('.chat-media-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const type = this.dataset.type;
            handleMediaButtonClick(type, targetUserId);
        });
    });
}


// --- 📋 قائمة إجراءات الدردشة الخاصة (منسدلة) ---
function toggleChatActionsMenu(anchorBtn, targetUserId) {
    const existing = document.getElementById('chat-actions-dropdown');
    if (existing) {
        existing.remove();
        return;
    }

    const selfUserData = JSON.parse(localStorage.getItem('user'));
    const blockedUsersIds = (selfUserData?.blockedUsers || []).map(item => 
        item._id ? item._id.toString() : item.toString()
    );
    const isBlockedByMe = blockedUsersIds.includes(targetUserId.toString());

    const rect = anchorBtn.getBoundingClientRect();

    const menuHTML = `
        <div id="chat-actions-dropdown" class="fixed bg-gray-800 border border-gray-700 rounded-xl shadow-2xl w-48 z-[310] overflow-hidden"
             style="top: ${rect.bottom + 8}px; left: ${Math.max(rect.left - 140, 8)}px;">
            <button id="chat-menu-view-profile" class="w-full text-right px-4 py-3 text-sm text-gray-200 hover:bg-gray-700 flex items-center gap-2">
                <i class="fas fa-user text-purple-400"></i> عرض الملف الشخصي
            </button>
            <button id="chat-menu-block-toggle" class="w-full text-right px-4 py-3 text-sm ${isBlockedByMe ? 'text-green-400' : 'text-red-400'} hover:bg-gray-700 flex items-center gap-2 border-t border-gray-700">
                <i class="fas ${isBlockedByMe ? 'fa-unlock' : 'fa-ban'}"></i> ${isBlockedByMe ? 'فك الحظر' : 'حظر المستخدم'}
            </button>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', menuHTML);
    const menu = document.getElementById('chat-actions-dropdown');

    document.getElementById('chat-menu-view-profile').addEventListener('click', () => {
        menu.remove();
        showMiniProfileModal(targetUserId);
    });

    document.getElementById('chat-menu-block-toggle').addEventListener('click', () => {
        menu.remove();
        if (isBlockedByMe) {
            unblockUser(targetUserId, null);
        } else {
            blockUser(targetUserId, null);
        }
    });

    // إغلاق القائمة عند النقر خارجها
    setTimeout(() => {
        document.addEventListener('click', function closeMenuOnce(e) {
            if (!menu.contains(e.target) && e.target !== anchorBtn) {
                menu.remove();
                document.removeEventListener('click', closeMenuOnce);
            }
        });
    }, 0);
}

        
// --- 🎮 دالة معالجة أزرار الوسائط ---
function handleMediaButtonClick(type, targetUserId) {
    console.log(`[CHAT] Media button clicked: ${type} for user ${targetUserId}`);
    
    switch(type) {
        case 'image':
            showImageUploadModal(targetUserId);
            break;
        case 'video':
            // ✅ الإصلاح: تفعيل نافذة رفع الفيديو الفعلية بدل رسالة "قريباً"
            showVideoUploadModal(targetUserId);
            break;
        case 'voice':
           startWhatsAppStyleRecording(targetUserId);
            break;
        case 'file':
            showNotification('إرسال الملفات قريباً...', 'info');
            break;
    }
}



    
    
 // =================================================
// 🎤 دالة تسجيل الصوت بنظام مبسط (بدون سحب)
// =================================================
function startWhatsAppStyleRecording(targetUserId) {
    console.log(`[VOICE] Starting simplified recording for: ${targetUserId}`);
    
    if (window.isRecordingActive) {
        console.log('[VOICE] Recording already in progress');
        return;
    }
    
    const chatModal = document.getElementById('private-chat-modal');
    if (!chatModal) {
        console.error('[VOICE] Chat modal not found');
        return;
    }
    
    const originalInput = document.getElementById('private-message-input');
    const originalSendBtn = document.getElementById('send-private-message');
    const originalCharCounter = document.getElementById('private-char-count');
    
    if (!originalInput || !originalSendBtn) {
        console.error('[VOICE] Required elements not found');
        return;
    }
    
    window.isRecordingActive = true;
    
    originalInput.style.display = 'none';
    if (originalCharCounter) originalCharCounter.style.display = 'none';
    
    const recordingUI = document.createElement('div');
    recordingUI.id = 'voice-recording-ui';
    recordingUI.className = 'flex items-center justify-between w-full bg-gray-800 rounded-full px-6 py-4 shadow-lg border-2 border-purple-600';
    recordingUI.innerHTML = `
        <div class="flex items-center gap-4">
            <div id="recording-indicator" class="relative">
                <div class="w-10 h-10 bg-red-500 rounded-full flex items-center justify-center animate-pulse">
                    <i class="fas fa-microphone text-white"></i>
                </div>
                <div class="absolute -top-1 -right-1 w-4 h-4 bg-red-600 rounded-full border-2 border-gray-800"></div>
            </div>
            
            <div class="flex flex-col">
                <p id="recording-status" class="text-sm font-bold text-white">جاري التسجيل...</p>
                <p id="recording-timer" class="text-xs text-gray-300">00:00</p>
                <p class="text-xs text-gray-400 mt-1">الحد الأقصى: 15 ثانية</p>
            </div>
        </div>
        
        <div class="flex items-center gap-4">
            <button id="cancel-recording" 
                    class="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-red-600 text-white rounded-full transition-all duration-300">
                <i class="fas fa-times"></i>
                <span class="text-sm">إلغاء</span>
            </button>
            
            <button id="send-recording" 
                    class="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-full transition-all duration-300 hidden">
                <i class="fas fa-paper-plane"></i>
                <span class="text-sm">إرسال</span>
            </button>
            
            <button id="stop-recording" 
                    class="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-full transition-all duration-300">
                <i class="fas fa-stop"></i>
                <span class="text-sm">توقف</span>
            </button>
        </div>
    `;
    
    originalInput.parentNode.insertBefore(recordingUI, originalInput.nextSibling);
    
    let mediaRecorder = null;
    let mediaStream = null; // ✅ جديد: نحتفظ بالـ stream نفسه للتحكم بإطفاء المايك يدوياً
    let audioChunks = [];
    let isRecording = true;
    let recordingStartTime = null;
    let recordingTimer = null;
    let recordingDuration = 0;
    
    const recordingIndicator = document.getElementById('recording-indicator');
    const recordingTimerElement = document.getElementById('recording-timer');
    const recordingStatus = document.getElementById('recording-status');
    const cancelBtn = document.getElementById('cancel-recording');
    const sendBtn = document.getElementById('send-recording');
    const stopBtn = document.getElementById('stop-recording');
    
    socket.emit('recording-voice', { targetUserId, isRecording: true });
    startRecording();
    
    async function startRecording() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });
            
            mediaStream = stream; // ✅ نحفظ المرجع
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];
            
            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunks.push(event.data);
                }
            };
            
            mediaRecorder.start();
            recordingStartTime = Date.now();
            startTimer();
            
        } catch (error) {
            console.error('[VOICE] Error starting recording:', error);
            showNotification('فشل الوصول إلى الميكروفون', 'error');
            cleanupRecordingUI();
        }
    }
    
    function startTimer() {
        recordingTimer = setInterval(() => {
            recordingDuration = Math.floor((Date.now() - recordingStartTime) / 1000);
            
            const minutes = Math.floor(recordingDuration / 60).toString().padStart(2, '0');
            const seconds = (recordingDuration % 60).toString().padStart(2, '0');
            recordingTimerElement.textContent = `${minutes}:${seconds}`;
            
            if (recordingDuration >= 13) {
                recordingTimerElement.classList.add('text-red-400', 'font-bold');
            }
            
            if (recordingDuration >= 15) {
                stopRecording();
                showNotification('تم الوصول للحد الأقصى (15 ثانية)', 'info');
            }
            
        }, 1000);
    }
    
    // ✅ الإصلاح الأساسي: إطفاء المايك فوراً عند الضغط على "توقف" — مو بعد الإرسال
    function stopRecording() {
        if (mediaRecorder && isRecording) {
            mediaRecorder.stop();
            isRecording = false;
            
            if (recordingTimer) {
                clearInterval(recordingTimer);
                recordingTimer = null;
            }

            // ✅ إطفاء المايك مباشرة هنا — هذا هو سبب بقاء أيقونة "استخدام المايك" شغالة سابقاً
            if (mediaStream) {
                mediaStream.getTracks().forEach(track => track.stop());
                mediaStream = null;
            }
            
            recordingIndicator.classList.remove('animate-pulse');
            recordingStatus.textContent = 'تم التسجيل ✓';
            recordingStatus.classList.add('text-green-400');
            
            stopBtn.classList.add('hidden');
            sendBtn.classList.remove('hidden');
        }
    }
    
    function cancelRecording() {
        if (mediaRecorder) {
            if (isRecording) mediaRecorder.stop();
            isRecording = false;
            
            if (recordingTimer) {
                clearInterval(recordingTimer);
                recordingTimer = null;
            }

            // ✅ إطفاء المايك عند الإلغاء أيضاً
            if (mediaStream) {
                mediaStream.getTracks().forEach(track => track.stop());
                mediaStream = null;
            }
            
            showNotification('تم إلغاء التسجيل', 'info');
            cleanupRecordingUI();
        }
    }
    
    // ✅ الإصلاح الثاني: نغلق واجهة التسجيل فوراً عند الضغط على إرسال (إحساس سريع)
    // ثم يرفع الصوت بالخلفية ويظهر كفقاعة "جاري الإرسال" داخل الدردشة مباشرة
    function sendRecording() {
        if (audioChunks.length === 0) {
            showNotification('لا يوجد تسجيل لإرساله', 'error');
            return;
        }
        
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        const finalDuration = recordingDuration;

        // إغلاق فوري لواجهة التسجيل — لا ننتظر اكتمال الرفع
        cleanupRecordingUI();

        // الرفع والإرسال يحدثان بالخلفية مع فقاعة متفائلة فورية بالدردشة
        sendVoiceMessage(audioBlob, finalDuration, targetUserId);
    }
    
        function cleanupRecordingUI() {
        socket.emit('recording-voice', { targetUserId, isRecording: false });
        console.log('[VOICE] Cleaning up recording UI');
        
        if (recordingUI && recordingUI.parentNode) {
            recordingUI.remove();
        }
        
        if (originalInput) {
            originalInput.style.display = '';
            originalInput.value = '';
            originalInput.focus();
        }
        
        if (originalCharCounter) {
            originalCharCounter.style.display = '';
            originalCharCounter.textContent = '0/200';
        }
        
        if (originalSendBtn) {
            originalSendBtn.removeEventListener('click', originalSendBtn.clickHandler);
            originalSendBtn.innerHTML = '<i class="fas fa-microphone text-white"></i>';
            originalSendBtn.dataset.mode = 'voice';
            originalSendBtn.title = 'تسجيل صوتي';
            originalSendBtn.classList.remove('bg-red-600', 'bg-green-600');
            originalSendBtn.classList.add('bg-purple-600');
            originalSendBtn.clickHandler = function() {
                if (this.dataset.mode === 'voice') {
                    startWhatsAppStyleRecording(targetUserId);
                } else {
                    const input = document.getElementById('private-message-input');
                    if (input) {
                        sendPrivateMessage(targetUserId, input.value.trim());
                        input.value = '';
                        const counter = document.getElementById('private-char-count');
                        if (counter) counter.textContent = '0/200';
                        updateSendButton();
                    }
                }
            };
            originalSendBtn.addEventListener('click', originalSendBtn.clickHandler);
        }
        
        window.isRecordingActive = false;
        console.log('[VOICE] isRecordingActive set to false');
    }
    
    if (cancelBtn) cancelBtn.addEventListener('click', cancelRecording);
    if (sendBtn) sendBtn.addEventListener('click', sendRecording);
    if (stopBtn) stopBtn.addEventListener('click', stopRecording);
}
        

   // --- 🖼️ دالة عرض نافذة رفع الصور ---
function showImageUploadModal(targetUserId) {
    console.log(`[IMAGE UPLOAD] Opening for user: ${targetUserId}`);

    const optionsBar = document.getElementById('chat-options-bar');
    if (optionsBar) optionsBar.classList.add('hidden');

    const modalHTML = `
        <div id="image-upload-modal" class="fixed inset-0 bg-black/80 flex items-center justify-center z-[350] p-4">
            <div class="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl shadow-2xl w-full max-w-md text-white border border-gray-700">

                <div class="flex items-center justify-between p-4 border-b border-gray-700">
                    <h3 class="text-lg font-bold"><i class="fas fa-image mr-2 text-green-400"></i>إرسال صورة</h3>
                    <button class="close-image-modal text-gray-400 hover:text-white p-2"><i class="fas fa-times"></i></button>
                </div>

                <div class="p-4">
                    <div id="drop-zone" class="border-2 border-dashed border-gray-600 rounded-xl p-4 text-center cursor-pointer hover:border-green-500 transition-colors bg-gray-900/50 mb-4">
                        <div id="upload-area-content">
                            <i class="fas fa-cloud-upload-alt text-3xl text-gray-500 mb-2"></i>
                            <p class="font-medium text-sm mb-1">اسحب وأفلت الصورة هنا</p>
                            <p class="text-xs text-gray-400">(حد أقصى 5MB)</p>
                        </div>
                        <div id="image-preview" class="hidden">
                            <img id="preview-image" class="max-w-full max-h-32 rounded-lg mx-auto">
                            <div class="text-xs text-gray-400 mt-2 flex justify-between">
                                <span id="file-name" class="truncate"></span>
                                <span id="file-size"></span>
                            </div>
                        </div>
                        <div id="upload-progress" class="hidden mt-3">
                            <div class="flex justify-between text-xs mb-1">
                                <span>جاري الرفع...</span>
                                <span id="progress-percent">0%</span>
                            </div>
                            <div class="w-full bg-gray-700 h-1.5 rounded-full overflow-hidden">
                                <div id="progress-bar" class="bg-green-500 h-1.5 rounded-full transition-all" style="width:0%"></div>
                            </div>
                        </div>
                        <input type="file" id="image-file-input" class="hidden" accept="image/*">
                    </div>

                    <div class="bg-gray-900/30 p-3 rounded-xl mb-4">
                        <h4 class="font-bold text-sm mb-2 flex items-center gap-2"><i class="fas fa-shield-alt text-blue-400"></i>خيارات الحماية</h4>
                        <div class="grid grid-cols-2 gap-2 text-sm">
                            <label class="flex items-center gap-2 cursor-pointer hover:bg-gray-800/50 p-1 rounded">
                                <input type="checkbox" id="view-once" class="w-4 h-4"> مشاهدة مرة واحدة
                            </label>
                            <label class="flex items-center gap-2 cursor-pointer hover:bg-gray-800/50 p-1 rounded">
                                <input type="checkbox" id="disable-save" class="w-4 h-4"> منع الحفظ
                            </label>
                            <label class="flex items-center gap-2 cursor-pointer hover:bg-gray-800/50 p-1 rounded">
                                <input type="checkbox" id="add-watermark" class="w-4 h-4"> علامة مائية
                            </label>
                            <label class="flex items-center gap-2 cursor-pointer hover:bg-gray-800/50 p-1 rounded">
                                <input type="checkbox" id="disable-reply" class="w-4 h-4"> منع الرد
                            </label>
                        </div>
                    </div>

                    <div class="flex gap-2">
                        <button id="cancel-image-upload" class="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded-lg text-sm transition">إلغاء</button>
                        <button id="send-image-button" class="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg text-sm transition disabled:opacity-50" disabled>إرسال</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    // ✅ الإصلاح الجوهري: insertAdjacentHTML لا يهدم عناصر الدردشة الخاصة الموجودة أصلاً
    document.getElementById('game-container').insertAdjacentHTML('beforeend', modalHTML);
    setupImageUploadEvents(targetUserId);
}

      function bindPrivateMessageEvents(messageElement, message) {
    const viewBtn = messageElement.querySelector('.view-image-btn');
    if (viewBtn) {
        viewBtn.addEventListener('click', () => {
            showFullImage(viewBtn.dataset.imageUrl, message);
        });
    }

    const viewOnceBtn = messageElement.querySelector('.view-once-image-btn');
    if (viewOnceBtn) {
        viewOnceBtn.addEventListener('click', function() {
            const imgUrl = this.dataset.imageUrl;
            const msgId = this.dataset.messageId;
            openViewOnceImage(msgId, imgUrl, messageElement);
        });
    }

    // ✅ جديد: زر مشاهدة الفيديو مرة واحدة
    const viewOnceVideoBtn = messageElement.querySelector('.view-once-video-btn');
    if (viewOnceVideoBtn) {
        viewOnceVideoBtn.addEventListener('click', function() {
            const videoUrl = this.dataset.videoUrl;
            const msgId = this.dataset.messageId;
            openViewOnceVideo(msgId, videoUrl, messageElement);
        });
    }

    const voiceBtn = messageElement.querySelector('.play-voice-btn');
    if (voiceBtn) {
        voiceBtn.addEventListener('click', () => {
            playVoiceMessage(voiceBtn.dataset.voiceUrl, messageElement);
        });
    }

    const videoBtn = messageElement.querySelector('.play-video-btn');
    if (videoBtn) {
        videoBtn.addEventListener('click', () => {
            showVideoPlayer(videoBtn.dataset.videoUrl, message);
        });
    }

    const replyBtn = messageElement.querySelector('.reply-private-btn');
    if (replyBtn && !message.sender?.isBot) {
        replyBtn.addEventListener('click', () => {
            const msgId = replyBtn.dataset.messageId;
            showReplyPrivateBar(msgId, message);
        });
    }
}

// --- 🎮 دالة إعداد أحداث رفع الصور ---
function setupImageUploadEvents(targetUserId) {
    const modal = document.getElementById('image-upload-modal');
    if (!modal) return;

    let selectedFile = null;
    let uploadInProgress = false;

    // ✅ دالة الإغلاق مع التنظيف الكامل
    function cleanupAndClose() {
        if (uploadInProgress) {
            showNotification('انتظر اكتمال الرفع', 'warning');
            return;
        }
        
        // إزالة النافذة
        if (modal && modal.parentNode) {
            modal.remove();
        }
        
        // إعادة تمكين الدردشة
        const chatInput = document.getElementById('private-message-input');
        if (chatInput) chatInput.disabled = false;
        
        const sendBtn = document.getElementById('send-private-message');
        if (sendBtn) sendBtn.disabled = false;
        
        // إزالة أي ظل أو حظر
        document.body.style.overflow = '';
    }

    // 1. أزرار الإغلاق
    const closeBtn = modal.querySelector('.close-image-modal');
    const cancelBtn = modal.querySelector('#cancel-image-upload');

    if (closeBtn) closeBtn.addEventListener('click', cleanupAndClose);
    if (cancelBtn) cancelBtn.addEventListener('click', cleanupAndClose);

    // 2. إغلاق بالنقر على الخلفية
    modal.addEventListener('click', (e) => {
        if (e.target.id === 'image-upload-modal') {
            cleanupAndClose();
        }
    });

    // 3. اختيار ملف
    const fileInput = modal.querySelector('#image-file-input');
    const dropZone = modal.querySelector('#drop-zone');
    const sendButton = modal.querySelector('#send-image-button');

    if (dropZone) {
        dropZone.addEventListener('click', () => {
            if (!uploadInProgress && fileInput) fileInput.click();
        });

        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (!uploadInProgress) dropZone.classList.add('border-green-500', 'bg-gray-800/50');
        });

        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('border-green-500', 'bg-gray-800/50');
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('border-green-500', 'bg-gray-800/50');
            if (!uploadInProgress && e.dataTransfer.files.length > 0) {
                handleFileSelection(e.dataTransfer.files[0]);
            }
        });
    }

    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                handleFileSelection(e.target.files[0]);
            }
            fileInput.value = '';
        });
    }

    function handleFileSelection(file) {
        const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (!validTypes.includes(file.type)) {
            showNotification('نوع الملف غير مدعوم', 'error');
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            showNotification('حجم الصورة يتجاوز 5MB', 'error');
            return;
        }

        selectedFile = file;

        const previewImage = modal.querySelector('#preview-image');
        const fileName = modal.querySelector('#file-name');
        const fileSize = modal.querySelector('#file-size');
        const uploadArea = modal.querySelector('#upload-area-content');
        const imagePreview = modal.querySelector('#image-preview');

        if (uploadArea) uploadArea.classList.add('hidden');
        if (imagePreview) imagePreview.classList.remove('hidden');

        const reader = new FileReader();
        reader.onload = (e) => {
            if (previewImage) previewImage.src = e.target.result;
        };
        reader.readAsDataURL(file);

        if (fileName) fileName.textContent = file.name;
        if (fileSize) fileSize.textContent = formatFileSize(file.size);

        if (sendButton) {
            sendButton.disabled = false;
        }
    }

    // 4. زر الإرسال
    if (sendButton) {
        sendButton.addEventListener('click', async () => {
            if (!selectedFile || uploadInProgress) return;
            await uploadAndSendImage(selectedFile, targetUserId, modal);
        });
    }

    // 5. تعطيل الدردشة مؤقتاً أثناء رفع الصورة
    const chatInput = document.getElementById('private-message-input');
    if (chatInput) chatInput.disabled = true;
    
    const sendChatBtn = document.getElementById('send-private-message');
    if (sendChatBtn) sendChatBtn.disabled = true;
}


        


    let replyingToPrivateMessage = null;

function showReplyPrivateBar(messageId, message) {
    replyingToPrivateMessage = message;

    const chatModal = document.getElementById('private-chat-modal');
    if (!chatModal) return;

    let replyBar = document.getElementById('reply-private-bar');
    if (!replyBar) {
        replyBar = document.createElement('div');
        replyBar.id = 'reply-private-bar';
        replyBar.className = 'p-2 bg-gray-600 rounded-t-lg text-sm flex justify-between items-center mx-3';
        // ✅ الإصلاح: نبحث عن شريط الإدخال داخل نافذة الدردشة الخاصة نفسها فقط
        const inputArea = chatModal.querySelector('.p-3.border-t');
        if (inputArea && inputArea.parentNode) {
            inputArea.parentNode.insertBefore(replyBar, inputArea);
        }
    }

    replyBar.innerHTML = `
        <span>الرد على <strong>${message.sender?.username || 'مستخدم'}</strong></span>
        <button id="cancel-private-reply" class="text-red-400 hover:text-red-600">&times;</button>
    `;

    document.getElementById('cancel-private-reply').addEventListener('click', () => {
        replyingToPrivateMessage = null;
        replyBar.remove();
    });
}


        // --- 🎬 دالة عرض نافذة رفع الفيديو ---
function showVideoUploadModal(targetUserId) {
    console.log(`[VIDEO UPLOAD] Opening for user: ${targetUserId}`);

    const optionsBar = document.getElementById('chat-options-bar');
    if (optionsBar) optionsBar.classList.add('hidden');

    const modalHTML = `
        <div id="video-upload-modal" class="fixed inset-0 bg-black/80 flex items-center justify-center z-[350] p-4">
            <div class="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl shadow-2xl w-full max-w-md text-white border border-gray-700">

                <div class="flex items-center justify-between p-4 border-b border-gray-700">
                    <h3 class="text-lg font-bold"><i class="fas fa-video mr-2 text-blue-400"></i>إرسال فيديو</h3>
                    <button class="close-video-modal text-gray-400 hover:text-white p-2"><i class="fas fa-times"></i></button>
                </div>

                <div class="p-4">
                    <div id="video-drop-zone" class="border-2 border-dashed border-gray-600 rounded-xl p-4 text-center cursor-pointer hover:border-blue-500 transition-colors bg-gray-900/50 mb-4">
                        <div id="video-upload-area-content">
                            <i class="fas fa-file-video text-3xl text-gray-500 mb-2"></i>
                            <p class="font-medium text-sm mb-1">اسحب وأفلت الفيديو هنا</p>
                            <p class="text-xs text-gray-400">(حد أقصى 30 ثانية - 10MB)</p>
                        </div>
                        <div id="video-preview" class="hidden">
                            <video id="preview-video" class="max-w-full max-h-32 rounded-lg mx-auto" controls></video>
                            <div class="text-xs text-gray-400 mt-2 flex justify-between">
                                <span id="video-file-name" class="truncate"></span>
                                <span id="video-file-size"></span>
                            </div>
                        </div>
                        <div id="video-upload-progress" class="hidden mt-3">
                            <div class="flex justify-between text-xs mb-1">
                                <span>جاري الرفع...</span>
                                <span id="video-progress-percent">0%</span>
                            </div>
                            <div class="w-full bg-gray-700 h-1.5 rounded-full overflow-hidden">
                                <div id="video-progress-bar" class="bg-blue-500 h-1.5 rounded-full transition-all" style="width:0%"></div>
                            </div>
                        </div>
                        <input type="file" id="video-file-input" class="hidden" accept="video/mp4,video/webm">
                    </div>

                    <div class="bg-gray-900/30 p-3 rounded-xl mb-4">
                        <h4 class="font-bold text-sm mb-2 flex items-center gap-2"><i class="fas fa-shield-alt text-blue-400"></i>خيارات الخصوصية</h4>
                        <div class="grid grid-cols-2 gap-2 text-sm">
                            <label class="flex items-center gap-2 cursor-pointer hover:bg-gray-800/50 p-1 rounded">
                                <input type="checkbox" id="video-view-once" class="w-4 h-4"> مشاهدة مرة واحدة
                            </label>
                            <label class="flex items-center gap-2 cursor-pointer hover:bg-gray-800/50 p-1 rounded">
                                <input type="checkbox" id="video-disable-save" class="w-4 h-4"> منع الحفظ
                            </label>
                            <label class="flex items-center gap-2 cursor-pointer hover:bg-gray-800/50 p-1 rounded">
                                <input type="checkbox" id="video-add-watermark" class="w-4 h-4"> علامة مائية
                            </label>
                        </div>
                    </div>

                    <div class="flex gap-2">
                        <button id="cancel-video-upload" class="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded-lg text-sm transition">إلغاء</button>
                        <button id="send-video-button" class="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg text-sm transition disabled:opacity-50" disabled>إرسال</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.getElementById('game-container').insertAdjacentHTML('beforeend', modalHTML);
    setupVideoUploadEvents(targetUserId);
}

// --- 🎮 دالة إعداد أحداث رفع الفيديو ---
function setupVideoUploadEvents(targetUserId) {
    const modal = document.getElementById('video-upload-modal');
    if (!modal) return;

    let selectedFile = null;
    let uploadInProgress = false;

    function cleanupAndClose() {
        if (uploadInProgress) {
            showNotification('انتظر اكتمال الرفع', 'warning');
            return;
        }
        if (modal && modal.parentNode) modal.remove();

        const chatInput = document.getElementById('private-message-input');
        if (chatInput) chatInput.disabled = false;
        const sendBtn = document.getElementById('send-private-message');
        if (sendBtn) sendBtn.disabled = false;
    }

    const closeBtn = modal.querySelector('.close-video-modal');
    const cancelBtn = modal.querySelector('#cancel-video-upload');
    if (closeBtn) closeBtn.addEventListener('click', cleanupAndClose);
    if (cancelBtn) cancelBtn.addEventListener('click', cleanupAndClose);

    modal.addEventListener('click', (e) => {
        if (e.target.id === 'video-upload-modal') cleanupAndClose();
    });

    const fileInput = modal.querySelector('#video-file-input');
    const dropZone = modal.querySelector('#video-drop-zone');
    const sendButton = modal.querySelector('#send-video-button');

    if (dropZone) {
        dropZone.addEventListener('click', () => {
            if (!uploadInProgress && fileInput) fileInput.click();
        });
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (!uploadInProgress) dropZone.classList.add('border-blue-500', 'bg-gray-800/50');
        });
        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('border-blue-500', 'bg-gray-800/50');
        });
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('border-blue-500', 'bg-gray-800/50');
            if (!uploadInProgress && e.dataTransfer.files.length > 0) {
                handleVideoSelection(e.dataTransfer.files[0]);
            }
        });
    }

    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) handleVideoSelection(e.target.files[0]);
            fileInput.value = '';
        });
    }

    function handleVideoSelection(file) {
        const validTypes = ['video/mp4', 'video/webm'];
        if (!validTypes.includes(file.type)) {
            showNotification('نوع الفيديو غير مدعوم (mp4 أو webm فقط)', 'error');
            return;
        }

        if (file.size > 10 * 1024 * 1024) {
            showNotification('حجم الفيديو يتجاوز 10MB', 'error');
            return;
        }

        // التحقق من المدة قبل الرفع
        const tempVideo = document.createElement('video');
        tempVideo.preload = 'metadata';
        tempVideo.onloadedmetadata = () => {
            window.URL.revokeObjectURL(tempVideo.src);
            if (tempVideo.duration > 30) {
                showNotification('مدة الفيديو تتجاوز 30 ثانية', 'error');
                return;
            }

            selectedFile = file;
            selectedFile._duration = Math.round(tempVideo.duration);

            const previewVideo = modal.querySelector('#preview-video');
            const fileName = modal.querySelector('#video-file-name');
            const fileSize = modal.querySelector('#video-file-size');
            const uploadArea = modal.querySelector('#video-upload-area-content');
            const videoPreview = modal.querySelector('#video-preview');

            if (uploadArea) uploadArea.classList.add('hidden');
            if (videoPreview) videoPreview.classList.remove('hidden');
            if (previewVideo) previewVideo.src = URL.createObjectURL(file);
            if (fileName) fileName.textContent = file.name;
            if (fileSize) fileSize.textContent = formatFileSize(file.size);
            if (sendButton) sendButton.disabled = false;
        };
        tempVideo.src = URL.createObjectURL(file);
    }

    if (sendButton) {
        sendButton.addEventListener('click', async () => {
            if (!selectedFile || uploadInProgress) return;
            await uploadAndSendVideo(selectedFile, targetUserId, modal);
        });
    }

    const chatInput = document.getElementById('private-message-input');
    if (chatInput) chatInput.disabled = true;
    const sendChatBtn = document.getElementById('send-private-message');
    if (sendChatBtn) sendChatBtn.disabled = true;

    // نستخدم متغير uploadInProgress من نطاق الدالة الخارجية عبر uploadAndSendVideo
    modal._setUploadInProgress = (val) => { uploadInProgress = val; };
}

// --- 📤 دالة رفع وإرسال الفيديو ---
async function uploadAndSendVideo(file, targetUserId, modal) {
    const sendButton = modal.querySelector('#send-video-button');
    const progressBar = modal.querySelector('#video-progress-bar');
    const progressPercent = modal.querySelector('#video-progress-percent');
    const uploadProgress = modal.querySelector('#video-upload-progress');
    const dropZone = modal.querySelector('#video-drop-zone');

    const viewOnce = modal.querySelector('#video-view-once').checked;
    const disableSave = modal.querySelector('#video-disable-save').checked;
    const addWatermark = modal.querySelector('#video-add-watermark').checked;

    function reEnablePrivateChat() {
        const chatInput = document.getElementById('private-message-input');
        if (chatInput) chatInput.disabled = false;
        const sendChatBtn = document.getElementById('send-private-message');
        if (sendChatBtn) sendChatBtn.disabled = false;
    }

    try {
        if (modal._setUploadInProgress) modal._setUploadInProgress(true);
        if (sendButton) sendButton.disabled = true;
        if (dropZone) dropZone.style.pointerEvents = 'none';
        if (uploadProgress) uploadProgress.classList.remove('hidden');

        const formData = new FormData();
        formData.append('file', file);
        formData.append('receiverId', targetUserId);
        formData.append('duration', (file._duration || 0).toString());
        formData.append('metadata', JSON.stringify({
            disableSave: disableSave,
            hasWatermark: addWatermark
        }));

        simulateUploadProgress(progressBar, progressPercent, 3000);

        const response = await fetch('/api/chat-media/video', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });

        const result = await response.json();

        if (response.ok) {
            const metadata = {
                thumbnail: result.data.thumbnail,
                publicId: result.data.publicId,
                fileSize: result.data.bytes,
                format: result.data.format,
                duration: result.data.duration,
                viewOnce: viewOnce,
                disableSave: disableSave,
                hasWatermark: addWatermark
            };

            await sendPrivateMessage(targetUserId, result.data.url, null, 'video', metadata);

            reEnablePrivateChat();
            modal.remove();
            showNotification('تم إرسال الفيديو بنجاح', 'success');

        } else {
            throw new Error(result.message || 'فشل رفع الفيديو');
        }

    } catch (error) {
        console.error('[VIDEO UPLOAD] Error:', error);
        showNotification(error.message || 'فشل رفع الفيديو', 'error');

        const sendButtonRetry = modal.querySelector('#send-video-button');
        const uploadProgressRetry = modal.querySelector('#video-upload-progress');
        if (sendButtonRetry) sendButtonRetry.disabled = false;
        if (uploadProgressRetry) uploadProgressRetry.classList.add('hidden');

        reEnablePrivateChat();

    } finally {
        if (modal._setUploadInProgress) modal._setUploadInProgress(false);
        const dropZoneRetry = modal.querySelector('#video-drop-zone');
        if (dropZoneRetry) dropZoneRetry.style.pointerEvents = 'auto';
    }
}
    

        

// --- 📤 دالة إرسال الرسالة الصوتية (متفائلة وسريعة) ---
async function sendVoiceMessage(audioBlob, duration, targetUserId) {
    console.log(`[VOICE] Sending voice message: ${duration}s, ${audioBlob.size} bytes`);
    
    if (duration > 15) {
        showNotification('مدة التسجيل تتجاوز 15 ثانية', 'error');
        return;
    }
    
    if (duration < 1) {
        showNotification('التسجيل قصير جداً', 'error');
        return;
    }

    const tempId = 'voice-temp-' + Date.now();
    const currentUserId = JSON.parse(localStorage.getItem('user'))._id;

    // ✅ الإصلاح: نعرض فقاعة "جاري الإرسال" فوراً بمجرد الضغط على إرسال
    // بدل انتظار اكتمال الرفع بالكامل قبل ظهور أي شيء بالمحادثة
    displayPrivateMessage({
        _id: tempId,
        sender: currentUserId,
        receiver: targetUserId,
        type: 'voice',
        content: '',
        metadata: { duration: duration, uploading: true },
        createdAt: new Date().toISOString(),
        status: { sent: false, delivered: false, seen: false }
    }, true);
    
    try {
        const audioFile = new File([audioBlob], `voice_${Date.now()}.webm`, {
            type: 'audio/webm'
        });
        
        const formData = new FormData();
        formData.append('file', audioFile);
        formData.append('receiverId', targetUserId);
        formData.append('duration', duration.toString());
        
        const uploadResponse = await fetch('/api/chat-media/voice', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });
        
        const uploadResult = await uploadResponse.json();

        if (!uploadResponse.ok) {
            throw new Error(uploadResult.message || 'فشل رفع الرسالة الصوتية');
        }

        const metadata = {
            duration: duration,
            publicId: uploadResult.data.publicId,
            fileSize: uploadResult.data.bytes,
            format: uploadResult.data.format
        };

        const sendResponse = await fetch('/api/private-chat/message', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                receiverId: targetUserId,
                content: uploadResult.data.url,
                type: 'voice',
                metadata: metadata
            })
        });

        const sendResult = await sendResponse.json();
        const tempElement = document.querySelector(`[data-message-id="${tempId}"]`);

        if (sendResponse.ok) {
            // ✅ نستبدل الفقاعة المؤقتة بالفقاعة الحقيقية القابلة للتشغيل
            if (tempElement) tempElement.remove();
            displayPrivateMessage(sendResult.data.message, true);
            updateUnreadCount(targetUserId, sendResult.data.unreadCount || 0);
        } else {
            if (tempElement) tempElement.remove();
            showNotification(sendResult.message || 'فشل إرسال الرسالة الصوتية', 'error');
        }
        
    } catch (error) {
        console.error('[VOICE UPLOAD] Error:', error);
        const tempElement = document.querySelector(`[data-message-id="${tempId}"]`);
        if (tempElement) tempElement.remove();
        showNotification(error.message || 'فشل إرسال الرسالة الصوتية', 'error');
    }
}

  // --- 🔊 دالة تشغيل الرسائل الصوتية ---
async function playVoiceMessage(audioUrl, messageElement) {
    console.log('[CHAT] 🎵 Playing voice message:', audioUrl);
    
    const playBtn = messageElement.querySelector('.play-voice-btn');
    const progressBar = messageElement.querySelector('.voice-progress');
    
    if (!playBtn || !progressBar) {
        console.error('[CHAT] ❌ Play button or progress bar not found');
        return;
    }
    
    try {
        // إذا كان الصوت مشغلاً بالفعل، أوقفه
        if (playBtn.classList.contains('playing')) {
            console.log('[CHAT] ⏸️ Stopping current audio');
            playBtn.innerHTML = '<i class="fas fa-play text-white"></i>';
            playBtn.classList.remove('playing');
            progressBar.style.width = '0%';
            
            if (window.currentAudio) {
                window.currentAudio.pause();
                window.currentAudio.currentTime = 0;
                window.currentAudio = null;
            }
            return;
        }
        
        // ✅ إيقاف أي صوت آخر قيد التشغيل
        if (window.currentAudio) {
            console.log('[CHAT] 🛑 Stopping previous audio');
            window.currentAudio.pause();
            window.currentAudio = null;
            
            // إعادة تعيين الأزرار الأخرى
            document.querySelectorAll('.play-voice-btn.playing').forEach(btn => {
                btn.innerHTML = '<i class="fas fa-play text-white"></i>';
                btn.classList.remove('playing');
            });
            document.querySelectorAll('.voice-progress').forEach(bar => {
                bar.style.width = '0%';
            });
        }
        
        // بدء التشغيل
        console.log('[CHAT] ▶️ Starting playback');
        playBtn.innerHTML = '<i class="fas fa-pause text-white"></i>';
        playBtn.classList.add('playing');
        
        // ✅ إنشاء عنصر الصوت مع إعدادات أفضل
        const audio = new Audio();
        audio.src = audioUrl;
        audio.preload = 'auto'; // ⭐ جديد: تحميل الصوت مسبقاً
        audio.volume = 1.0;     // ⭐ جديد: التأكد من مستوى الصوت
        
        window.currentAudio = audio;
        
        // ✅ انتظار تحميل البيانات قبل التشغيل
        audio.addEventListener('loadedmetadata', () => {
            console.log('[CHAT] 📊 Audio loaded, duration:', audio.duration, 'seconds');
        });
        
        // ✅ تحديث شريط التقدم
        audio.addEventListener('timeupdate', () => {
            if (audio.duration) {
                const progress = (audio.currentTime / audio.duration) * 100;
                progressBar.style.width = `${progress}%`;
            }
        });
        
        // ✅ عند الانتهاء
        audio.addEventListener('ended', () => {
            console.log('[CHAT] ✅ Audio playback ended');
            playBtn.innerHTML = '<i class="fas fa-play text-white"></i>';
            playBtn.classList.remove('playing');
            progressBar.style.width = '0%';
            window.currentAudio = null;
        });
        
        // ✅ عند الخطأ - تفاصيل أكثر
        audio.addEventListener('error', (e) => {
            console.error('[CHAT] ❌ Audio error:', {
                error: e,
                code: audio.error?.code,
                message: audio.error?.message,
                url: audioUrl
            });
            
            playBtn.innerHTML = '<i class="fas fa-exclamation-triangle text-white"></i>';
            playBtn.classList.remove('playing');
            progressBar.style.width = '0%';
            
            let errorMsg = 'تعذر تشغيل الرسالة الصوتية';
            if (audio.error) {
                switch(audio.error.code) {
                    case 1: errorMsg = 'تم إلغاء تحميل الصوت'; break;
                    case 2: errorMsg = 'خطأ في الشبكة'; break;
                    case 3: errorMsg = 'تعذر فك تشفير الصوت'; break;
                    case 4: errorMsg = 'تنسيق الصوت غير مدعوم'; break;
                }
            }
            
            showNotification(errorMsg, 'error');
            window.currentAudio = null;
        });
        
        // ✅ بدء التشغيل مع معالجة الوعد
        console.log('[CHAT] 🚀 Calling audio.play()');
        const playPromise = audio.play();
        
        if (playPromise !== undefined) {
            playPromise
                .then(() => {
                    console.log('[CHAT] ✅ Playback started successfully');
                })
                .catch(error => {
                    console.error('[CHAT] ❌ Play failed:', error);
                    playBtn.innerHTML = '<i class="fas fa-play text-white"></i>';
                    playBtn.classList.remove('playing');
                    
                    if (error.name === 'NotAllowedError') {
                        showNotification('يجب النقر على الصفحة أولاً لتشغيل الصوت', 'warning');
                    } else {
                        showNotification('فشل تشغيل الصوت: ' + error.message, 'error');
                    }
                });
        }
        
        // ✅ تحديث حالة "تمت المشاهدة" للرسالة
        const messageId = messageElement.dataset.messageId;
        if (messageId) {
            updateMessageViewStatus(messageId);
        }
        
    } catch (error) {
        console.error('[VOICE PLAYBACK] Catch error:', error);
        playBtn.innerHTML = '<i class="fas fa-play text-white"></i>';
        playBtn.classList.remove('playing');
        showNotification('خطأ غير متوقع في تشغيل الصوت', 'error');
    }
}

// --- 👁️ دالة تحديث حالة المشاهدة ---
async function updateMessageViewStatus(messageId) {
    try {
        await fetch('/api/private-chat/message/status', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                messageId: messageId,
                status: 'seen'
            })
        });
    } catch (error) {
        console.error('[CHAT] Error updating view status:', error);
    }
}  


        

// --- 📤 دالة رفع وإرسال الصورة ---
async function uploadAndSendImage(file, targetUserId, modal) {
    const sendButton = modal.querySelector('#send-image-button');
    const progressBar = modal.querySelector('#progress-bar');
    const progressPercent = modal.querySelector('#progress-percent');
    const uploadProgress = modal.querySelector('#upload-progress');
    const dropZone = modal.querySelector('#drop-zone');

    const viewOnce = modal.querySelector('#view-once').checked;
    const disableSave = modal.querySelector('#disable-save').checked;
    const addWatermark = modal.querySelector('#add-watermark').checked;
    const disableReply = modal.querySelector('#disable-reply').checked;

    // ✅ دالة مساعدة جديدة: تعيد تفعيل نافذة الدردشة الخاصة دائماً
    function reEnablePrivateChat() {
        const chatInput = document.getElementById('private-message-input');
        if (chatInput) chatInput.disabled = false;
        const sendChatBtn = document.getElementById('send-private-message');
        if (sendChatBtn) sendChatBtn.disabled = false;
    }

    try {
        if (sendButton) sendButton.disabled = true;
        if (dropZone) dropZone.style.pointerEvents = 'none';
        if (uploadProgress) uploadProgress.classList.remove('hidden');

        const formData = new FormData();
        formData.append('file', file);
        formData.append('receiverId', targetUserId);
        formData.append('metadata', JSON.stringify({
            viewOnce: viewOnce,
            disableSave: disableSave,
            hasWatermark: addWatermark,
            disableReply: disableReply
        }));

        simulateUploadProgress(progressBar, progressPercent, 2000);

        const response = await fetch('/api/chat-media/image', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });

        const result = await response.json();

        if (response.ok) {
            const metadata = {
                thumbnail: result.data.thumbnail,
                publicId: result.data.publicId,
                fileSize: result.data.bytes,
                format: result.data.format,
                dimensions: { width: result.data.width, height: result.data.height },
                viewOnce: viewOnce,
                disableSave: disableSave,
                hasWatermark: addWatermark,
                disableReply: disableReply
            };

            await sendPrivateMessage(targetUserId, result.data.url, null, 'image', metadata);

            // ✅ الإصلاح الأساسي: إعادة تفعيل الدردشة الخاصة قبل إغلاق نافذة الرفع
            reEnablePrivateChat();

            modal.remove();
            showNotification('تم إرسال الصورة بنجاح', 'success');

        } else {
            throw new Error(result.message || 'فشل رفع الصورة');
        }

    } catch (error) {
        console.error('[IMAGE UPLOAD] Error:', error);
        showNotification(error.message || 'فشل رفع الصورة', 'error');

        const sendButtonRetry = modal.querySelector('#send-image-button');
        const uploadProgressRetry = modal.querySelector('#upload-progress');
        if (sendButtonRetry) sendButtonRetry.disabled = false;
        if (uploadProgressRetry) uploadProgressRetry.classList.add('hidden');

        // ✅ إعادة التفعيل حتى في حالة الفشل
        reEnablePrivateChat();

    } finally {
        const dropZoneRetry = modal.querySelector('#drop-zone');
        if (dropZoneRetry) dropZoneRetry.style.pointerEvents = 'auto';
    }
}

// --- ⏳ دالة محاكاة تقدم الرفع ---
function simulateUploadProgress(progressBar, progressPercent, duration) {
    if (!progressBar || !progressPercent) return;
    
    let progress = 0;
    const interval = 50;
    const totalSteps = duration / interval;
    const increment = 100 / totalSteps;
    
    const timer = setInterval(() => {
        progress += increment;
        if (progress > 95) progress = 95; // توقف عند 95% للانتظار الرفع الحقيقي
        
        progressBar.style.width = `${progress}%`;
        progressPercent.textContent = `${Math.round(progress)}%`;
        
        if (progress >= 95) {
            clearInterval(timer);
        }
    }, interval);
}

// --- 📏 دالة تنسيق حجم الملف ---
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
} 

        
// ✅ غلاف موحّد لـ fetch بمهلة زمنية — يمنع بقاء الزر معلقاً للأبد عند تعطّل الشبكة
async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(id);
        return response;
    } catch (error) {
        clearTimeout(id);
        if (error.name === 'AbortError') {
            throw new Error('انتهت مهلة الاتصال بالخادم، تحقق من اتصالك بالإنترنت وحاول مجدداً');
        }
        throw error;
    }
}

        

// --- 📤 دالة إرسال رسالة نصية ---
async function sendPrivateMessage(receiverId, message, replyTo = null, type = 'text', metadata = {}) {
    if (type === 'text' && !message) {
        showNotification('اكتب رسالة أولاً', 'error');
        return;
    }

    if (type === 'text' && message && message.length > 200) {
        showNotification('الرسالة طويلة جداً (200 حرف كحد أقصى)', 'error');
        return;
    }

    console.log(`[CHAT] Sending ${type} message to ${receiverId}`, replyTo ? `(reply to ${replyTo})` : '');

    // ✅ الإصلاح: نأخذ بيانات الرسالة الأصلية الكاملة (النوع + المحتوى) من المتغير
    // الذي عبأناه في showReplyPrivateBar، بدل استخدام نص وهمي "..."
    const repliedMessageData = (replyTo && replyingToPrivateMessage && replyingToPrivateMessage._id === replyTo)
        ? replyingToPrivateMessage
        : null;

    const tempId = Date.now().toString();
    displayPrivateMessage({
        _id: tempId,
        sender: JSON.parse(localStorage.getItem('user'))._id,
        receiver: receiverId,
        type: type,
        content: message,
        replyTo: repliedMessageData ? {
            _id: repliedMessageData._id,
            type: repliedMessageData.type,
            content: repliedMessageData.content,
            sender: repliedMessageData.sender
        } : null,
        metadata: metadata,
        createdAt: new Date().toISOString(),
        status: { sent: true, delivered: false, seen: false }
    }, true);

    try {
        const payload = {
            receiverId: receiverId,
            content: message,
            type: type,
            metadata: metadata
        };

        if (replyTo) {
            payload.replyTo = replyTo;
        }

        const response = await fetch('/api/private-chat/message', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

                if (response.ok) {
            console.log('✅ [CHAT] Message sent successfully:', result.data.message._id);

            // ✅ الإصلاح الجذري: نستبدل الفقاعة المؤقتة (ذات المعرف الوهمي) بفقاعة حقيقية
            // تحمل الـ _id الفعلي القادم من قاعدة البيانات، بدل الاكتفاء بتعديل الـ dataset فقط.
            // هذا يضمن أن أزرار "تعديل" و"حذف" تُرسل دائماً بالمعرف الصحيح للرسالة،
            // وإلا فإن أي محاولة تعديل/حذف لرسالة أُرسلت للتو كانت تفشل بصمت (السبب الجذري للمشكلة).
            const tempElement = document.querySelector(`[data-message-id="${tempId}"]`);
            if (tempElement) tempElement.remove();
            displayPrivateMessage(result.data.message, true);

            updateUnreadCount(receiverId, result.data.unreadCount || 0);

            const replyBar = document.getElementById('reply-private-bar');
            if (replyBar) replyBar.remove();
            replyingToPrivateMessage = null;

        } else {
            showNotification(result.message || 'فشل إرسال الرسالة', 'error');
        }

    } catch (error) {
        console.error('[CHAT] Error sending message:', error);
        showNotification('خطأ في الاتصال بالخادم', 'error');
    }
}



        
// --- 💬 دالة عرض رسالة في الدردشة ---
function displayPrivateMessage(message, isMyMessage = false) {
    const messagesContainer = document.getElementById('private-chat-messages');
    if (!messagesContainer) return;

    if (document.querySelector(`[data-message-id="${message._id}"]`)) return;

    const emptyState = messagesContainer.querySelector('.text-center');
    if (emptyState) emptyState.remove();

    const messageElement = document.createElement('div');
    messageElement.className = `flex ${isMyMessage ? 'justify-end' : 'justify-start'} mb-3 new-message`;
    messageElement.dataset.messageId = message._id;

    let messageContent = '';
    const meta = message.metadata || {};

    switch (message.type) {
        case 'text':
            messageContent = `<p class="text-white text-sm">${escapeHtml(message.content)}</p>`;
            break;

        case 'image':
    if (meta.viewOnce) {
        const alreadyViewed = meta.deleted || (message.status && message.status.seen);
        if (isMyMessage) {
            messageContent = `
                <div class="flex items-center gap-2 bg-black/20 rounded-lg px-3 py-2 text-xs">
                    <i class="fas fa-eye${alreadyViewed ? '' : '-slash'} ${alreadyViewed ? 'text-green-400' : 'text-yellow-400'}"></i>
                    <span>صورة (مشاهدة مرة واحدة)</span>
                    <span class="ml-auto ${alreadyViewed ? 'text-green-400' : 'text-gray-400'}" data-view-once-status="${message._id}">
                        ${alreadyViewed ? 'تم فتحها ✓' : 'لم تُفتح بعد'}
                    </span>
                </div>
            `;
        } else if (alreadyViewed) {
            messageContent = `
                <div class="flex items-center gap-2 bg-gray-700/60 rounded-lg px-3 py-2 text-xs text-gray-400">
                    <i class="fas fa-eye-slash"></i>
                    <span>تمت مشاهدة هذه الصورة</span>
                </div>
            `;
        } else {
            messageContent = `
                <button class="view-once-image-btn bg-gray-700 hover:bg-gray-600 rounded-lg px-3 py-1.5 text-sm transition flex items-center gap-2" 
                        data-image-url="${message.content}" 
                        data-message-id="${message._id}">
                    <i class="fas fa-eye text-yellow-400"></i>
                    <span>مشاهدة مرة واحدة</span>
                </button>
            `;
        }
    } else {
        const watermarkBadge = meta.hasWatermark ? `<span class="absolute top-2 left-2 bg-black/50 text-xs px-2 py-0.5 rounded-full"><i class="fas fa-copyright"></i> منصة التحديات</span>` : '';
        messageContent = `
            <div class="relative">
                <img src="${message.content}" class="rounded-lg max-w-[250px] max-h-[250px] object-contain cursor-pointer view-image-btn" data-image-url="${message.content}" alt="صورة">
                ${watermarkBadge}
                ${meta.disableSave ? `<span class="absolute bottom-2 left-2 bg-red-500/80 text-xs px-2 py-0.5 rounded-full"><i class="fas fa-download-slash"></i> حفظ معطل</span>` : ''}
            </div>
        `;
    }
    break;

                                        case 'gift':
            messageContent = `
                <div class="flex items-center gap-3 bg-gradient-to-r from-pink-600/30 to-purple-600/30 border border-pink-500/30 p-3 rounded-lg">
                    <div class="gift-msg-img-slot w-10 h-10 flex items-center justify-center flex-shrink-0">
                        ${meta.giftImage ? `<img src="${meta.giftImage}" class="gift-msg-img w-10 h-10 object-contain">` : `<span class="text-2xl">🎁</span>`}
                    </div>
                    <div>
                        <p class="text-sm font-bold">🎁 هدية ${escapeHtml(message.content)}</p>
                        <p class="text-xs text-gray-300">${meta.giftPrice || 0} كوينز</p>
                    </div>
                </div>
            `;
            break;

                case 'voice':
            if (meta.uploading) {
                // ✅ جديد: شكل مبسط أثناء الرفع (بدون رابط تشغيل بعد لأنه ما وصل بعد)
                messageContent = `
                    <div class="flex items-center gap-3 bg-black/30 p-3 rounded-lg opacity-80">
                        <div class="w-10 h-10 bg-purple-500/60 rounded-full flex items-center justify-center">
                            <i class="fas fa-spinner fa-spin text-white text-sm"></i>
                        </div>
                        <div class="flex-1">
                            <div class="flex justify-between text-sm">
                                <span>جاري الإرسال...</span>
                                <span>${meta.duration || 0} ثانية</span>
                            </div>
                        </div>
                    </div>
                `;
            } else {
                messageContent = `
                    <div class="flex items-center gap-3 bg-black/30 p-3 rounded-lg">
                        <button class="play-voice-btn w-10 h-10 bg-purple-500 rounded-full flex items-center justify-center hover:bg-purple-600" data-voice-url="${message.content}">
                            <i class="fas fa-play text-white"></i>
                        </button>
                        <div class="flex-1">
                            <div class="flex justify-between text-sm">
                                <span>رسالة صوتية</span>
                                <span>${meta.duration || 0} ثانية</span>
                            </div>
                            <div class="w-full bg-gray-600 h-2 rounded-full mt-2">
                                <div class="voice-progress bg-purple-400 h-2 rounded-full" style="width:0%"></div>
                            </div>
                        </div>
                    </div>
                `;
            }
            break;

        case 'video':
    if (meta.viewOnce) {
        const alreadyViewed = meta.deleted || (message.status && message.status.seen);
        if (isMyMessage) {
            messageContent = `
                <div class="flex items-center gap-2 bg-black/20 rounded-lg px-3 py-2 text-xs">
                    <i class="fas fa-eye${alreadyViewed ? '' : '-slash'} ${alreadyViewed ? 'text-green-400' : 'text-yellow-400'}"></i>
                    <span>فيديو (مشاهدة مرة واحدة)</span>
                    <span class="ml-auto ${alreadyViewed ? 'text-green-400' : 'text-gray-400'}" data-view-once-status="${message._id}">
                        ${alreadyViewed ? 'تم فتحها ✓' : 'لم تُفتح بعد'}
                    </span>
                </div>
            `;
        } else if (alreadyViewed) {
            messageContent = `
                <div class="flex items-center gap-2 bg-gray-700/60 rounded-lg px-3 py-2 text-xs text-gray-400">
                    <i class="fas fa-eye-slash"></i>
                    <span>تمت مشاهدة هذا الفيديو</span>
                </div>
            `;
        } else {
            messageContent = `
                <button class="view-once-video-btn bg-gray-700 hover:bg-gray-600 rounded-lg px-3 py-1.5 text-sm transition flex items-center gap-2"
                        data-video-url="${message.content}"
                        data-message-id="${message._id}">
                    <i class="fas fa-eye text-yellow-400"></i>
                    <span>مشاهدة فيديو مرة واحدة</span>
                </button>
            `;
        }
    } else {
        // ✅ الإصلاح: أبعاد صريحة أكبر (250×180) + زر تشغيل أوضح وأكبر بدل الحجم الصغير جداً السابق
        const videoWatermark = meta.hasWatermark ? '<span class="absolute top-2 left-2 bg-black/50 text-xs px-2 py-0.5 rounded-full"><i class="fas fa-copyright"></i> منصة التحديات</span>' : '';
        messageContent = `
            <div class="relative rounded-lg overflow-hidden w-[250px] h-[180px] bg-black">
                <img src="${meta.thumbnail || 'data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 250 180%27%3E%3Crect width=%27250%27 height=%27180%27 fill=%27%23374151%27/%3E%3C/svg%3E'}" class="w-full h-full object-cover">
                <button class="absolute inset-0 flex items-center justify-center play-video-btn bg-black/20 hover:bg-black/40 transition-colors" data-video-url="${message.content}">
                    <div class="w-14 h-14 bg-purple-600/90 rounded-full flex items-center justify-center shadow-lg">
                        <i class="fas fa-play text-white text-2xl ml-1"></i>
                    </div>
                </button>
                ${videoWatermark}
                <div class="absolute bottom-2 right-2 bg-black/60 px-2 py-0.5 rounded text-xs text-white">
                    <i class="fas fa-video mr-1"></i>${meta.duration ? meta.duration + 'ث' : 'فيديو'}
                </div>
            </div>
        `;
    }
    break;


            

            default:
            messageContent = `<p class="text-white text-sm">${escapeHtml(message.content || 'رسالة')}</p>`;
    }

    // ===== الرد (Reply) =====
    let replySection = '';
    if (message.replyTo && !meta.disableReply) {
                const replySender = escapeHtml(message.replyTo.sender?.username || 'مستخدم');
        const replyType = message.replyTo.type || 'text';
        let replyIcon = '';
        let replyPreviewText = '';

        // ✅ الإصلاح: نعرض تسمية مناسبة حسب نوع الرسالة المردود عليها
        // بدل عرض الرابط الخام للصورة/الصوت أو نقاط "..." وهمية
        switch (replyType) {
            case 'image':
                replyIcon = '<i class="fas fa-image text-green-400 mr-1"></i>';
                replyPreviewText = 'صورة';
                break;
            case 'voice':
                replyIcon = '<i class="fas fa-microphone text-purple-400 mr-1"></i>';
                replyPreviewText = 'رسالة صوتية';
                break;
            case 'video':
                replyIcon = '<i class="fas fa-video text-blue-400 mr-1"></i>';
                replyPreviewText = 'فيديو';
                break;
            default:
                replyPreviewText = escapeHtml((message.replyTo.content || 'رسالة').substring(0, 50));
        }

        replySection = `
            <div class="mb-2 p-2 bg-black/20 rounded-lg border-r-2 border-purple-500">
                <p class="text-xs font-bold text-purple-300">${replySender}</p>
                <p class="text-xs text-gray-300 truncate flex items-center">${replyIcon}${replyPreviewText}</p>
            </div>
        `;
    }

    // ===== حالة الرسالة (نمط واتساب) =====
    let statusIcon = '';
    if (isMyMessage) {
        if (message.status?.seen) statusIcon = '<i class="fas fa-check-double text-blue-400 text-xs" title="تمت المشاهدة"></i>';
        else if (message.status?.delivered) statusIcon = '<i class="fas fa-check-double text-gray-400 text-xs" title="تم التسليم"></i>';
        else statusIcon = '<i class="fas fa-check text-gray-400 text-xs" title="تم الإرسال"></i>';
    }

    // ===== زر الرد (إلا إذا ممنوع) =====
    let replyButton = '';
    if (!meta.disableReply && !message.sender?.isBot) {
        replyButton = `
            <button class="reply-private-btn text-gray-400 hover:text-purple-400 text-xs ml-2" data-message-id="${message._id}">
                <i class="fas fa-reply"></i> رد
            </button>
        `;
    }

    // ✅ زر ثابت دائماً ظاهر (بدون حاجة لسحب أو تمرير) لفتح قائمة تعديل/حذف
    const optionsButton = `
        <button class="msg-options-btn text-gray-400 hover:text-white text-xs ml-1" data-message-id="${message._id}">
            <i class="fas fa-ellipsis-v"></i>
        </button>
    `;

    messageElement.innerHTML = `
        <div class="max-w-xs md:max-w-md ${isMyMessage ? 'bg-purple-600' : 'bg-gray-700'} rounded-2xl p-3 ${isMyMessage ? 'rounded-tr-none' : 'rounded-tl-none'}">
            ${!isMyMessage ? `
                <div class="flex items-center gap-2 mb-1">
                    <img src="${message.sender?.profileImage || 'https://via.placeholder.com/20'}" class="w-5 h-5 rounded-full">
                    <span class="text-xs font-bold">${message.sender?.username || 'مستخدم'}</span>
                </div>
            ` : ''}

            ${replySection}

            <div class="message-content">
                ${messageContent}
            </div>

            <div class="flex justify-between items-center mt-2">
                <span class="text-xs opacity-70">${new Date(message.createdAt).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}</span>
                    <div class="flex items-center gap-1">
                    ${statusIcon}
                    ${replyButton}
                    ${optionsButton}
                </div>
            </div>
        </div>
    `;

                     messagesContainer.appendChild(messageElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    // ✅ ربط احتياطي (fallback) عبر JavaScript بدل onerror المباشر الممنوع بسياسة CSP
    const giftImgEl = messageElement.querySelector('.gift-msg-img');
    if (giftImgEl) {
        giftImgEl.addEventListener('error', function () {
            const slot = this.closest('.gift-msg-img-slot');
            if (slot) slot.innerHTML = '<span class="text-2xl">🎁</span>';
        }, { once: true });
    }

    attachMessageOptionsMenu(messageElement, message, isMyMessage);
    bindPrivateMessageEvents(messageElement, message);
}

// --- ⋮ قائمة منسدلة صغيرة: تعديل / حذف للجميع / حذف لدي فقط ---
function attachMessageOptionsMenu(messageElement, message, isMyMessage) {
    const btn = messageElement.querySelector('.msg-options-btn');
    if (!btn) return;
    const isBotMessage = message.sender?.isBot === true;

    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const existing = document.getElementById('msg-options-dropdown');
        if (existing) { existing.remove(); return; }

        const createdAt = new Date(message.createdAt).getTime();
        const ageMs = Date.now() - createdAt;
        // ✅ إصلاح: "حذف لدى الجميع" مسموح فقط لمرسل الرسالة الفعلي (كان الشرط يتجاهل isMyMessage سابقاً)
        const canDelete5Min = isMyMessage && !isBotMessage && ageMs < 5 * 60 * 1000;
        const canEdit = isMyMessage && !isBotMessage && message.type === 'text' && ageMs < 2 * 60 * 1000;

        const rect = btn.getBoundingClientRect();
        const menuHTML = `
            <div id="msg-options-dropdown" class="fixed bg-gray-800 border border-gray-700 rounded-xl shadow-2xl w-44 z-[310] overflow-hidden text-sm"
                 style="top: ${rect.bottom + 6}px; left: ${Math.max(rect.left - 130, 8)}px;">
                ${canEdit ? `<button class="w-full text-right px-4 py-2.5 text-gray-200 hover:bg-gray-700 flex items-center gap-2 msg-menu-edit"><i class="fas fa-pen text-blue-400"></i> تعديل</button>` : ''}
                ${canDelete5Min ? `<button class="w-full text-right px-4 py-2.5 text-red-400 hover:bg-gray-700 flex items-center gap-2 msg-menu-delete-everyone border-t border-gray-700"><i class="fas fa-trash"></i> حذف لدى الجميع</button>` : ''}
                <button class="w-full text-right px-4 py-2.5 text-gray-300 hover:bg-gray-700 flex items-center gap-2 msg-menu-delete-me border-t border-gray-700"><i class="fas fa-eye-slash"></i> حذف لدي فقط</button>
                ${!isMyMessage && !isBotMessage ? `<button class="w-full text-right px-4 py-2.5 text-orange-400 hover:bg-gray-700 flex items-center gap-2 msg-menu-report border-t border-gray-700"><i class="fas fa-flag"></i> الإبلاغ عن الرسالة</button>` : ''}
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', menuHTML);
        const menu = document.getElementById('msg-options-dropdown');

        menu.querySelector('.msg-menu-edit')?.addEventListener('click', () => { menu.remove(); startInlineEdit(messageElement, message); });
        menu.querySelector('.msg-menu-delete-everyone')?.addEventListener('click', () => {
            menu.remove();
            showConfirmationModal('هل تريد حذف هذه الرسالة لدى الطرفين؟', () => deleteMessageRequest(message._id, 'everyone', messageElement));
        });
        menu.querySelector('.msg-menu-delete-me')?.addEventListener('click', () => {
            menu.remove();
            showConfirmationModal('هل تريد حذف هذه الرسالة من عندك فقط؟', () => deleteMessageRequest(message._id, 'me', messageElement));
        });
        menu.querySelector('.msg-menu-report')?.addEventListener('click', () => {
            menu.remove();
            showReportModal({
                type: 'message', reportedUserId: message.sender?._id || message.sender,
                reportedUsername: message.sender?.username || 'مستخدم', messageId: message._id,
                messageContent: message.type === 'text' ? message.content : undefined,
                messageType: message.type, roomId: message.chatId || undefined
            });
        });

        setTimeout(() => {
            document.addEventListener('click', function closeOnce(ev) {
                if (!menu.contains(ev.target) && ev.target !== btn) { menu.remove(); document.removeEventListener('click', closeOnce); }
            });
        }, 0);
    });
}

async function deleteMessageRequest(messageId, scope, messageElement) {
    try {
        const response = await fetch('/api/private-chat/message', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ messageId, scope })
        });
        const result = await response.json();
        if (response.ok) {
            messageElement.remove();
        } else {
            showNotification(result.message || 'فشل حذف الرسالة', 'error');
        }
    } catch (error) {
        showNotification('خطأ في الاتصال بالخادم', 'error');
    }
}

function startInlineEdit(messageElement, message) {
    const contentEl = messageElement.querySelector('.message-content p');
    if (!contentEl) return;

    const currentText = message.content;
    contentEl.innerHTML = `<input type="text" class="edit-msg-input w-full bg-black/30 text-white rounded p-1 text-sm" value="${escapeHtml(currentText)}" maxlength="200">`;
    const input = contentEl.querySelector('.edit-msg-input');
    input.focus();

    input.addEventListener('keypress', async (e) => {
        if (e.key !== 'Enter') return;
        const newText = input.value.trim();
        if (!newText || newText === currentText) {
            contentEl.innerHTML = `<p class="text-white text-sm">${escapeHtml(currentText)}</p>`;
            return;
        }
        try {
            const response = await fetch('/api/private-chat/message/edit', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ messageId: message._id, newContent: newText })
            });
            const result = await response.json();
            if (response.ok) {
                contentEl.innerHTML = `<p class="text-white text-sm">${newText} <span class="text-[10px] text-gray-400">(معدّلة)</span></p>`;
                message.content = newText;
            } else {
                showNotification(result.message || 'فشل التعديل', 'error');
                contentEl.innerHTML = `<p class="text-white text-sm">${currentText}</p>`;
            }
        } catch (error) {
            contentEl.innerHTML = `<p class="text-white text-sm">${currentText}</p>`;
        }
    });
}

// --- 🖼️ نافذة عرض صورة عادية ---
function showFullImage(imageUrl, message) {
    const existing = document.getElementById('full-image-viewer');
    if (existing) existing.remove();

    const viewerHTML = `
        <div id="full-image-viewer" class="fixed inset-0 bg-black/90 flex items-center justify-center z-[400] p-4">
            <button id="close-full-image" class="absolute top-4 right-4 text-white text-2xl w-10 h-10 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center">
                <i class="fas fa-times"></i>
            </button>
            <img src="${imageUrl}" class="max-w-full max-h-full rounded-lg object-contain">
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', viewerHTML);

    const viewer = document.getElementById('full-image-viewer');
    const close = () => viewer.remove();

    document.getElementById('close-full-image').addEventListener('click', close);
    viewer.addEventListener('click', (e) => {
        if (e.target.id === 'full-image-viewer') close();
    });
}

// --- 👁️ نافذة مشاهدة الصورة لمرة واحدة (تصميم مرتب + إغلاق تلقائي) ---
function openViewOnceImage(messageId, imageUrl, messageElement) {
    const existing = document.getElementById('view-once-viewer');
    if (existing) existing.remove();

    const VIEW_SECONDS = 8; // مدة العرض بالثواني قبل الإغلاق التلقائي
    let remaining = VIEW_SECONDS;

    const viewerHTML = `
        <div id="view-once-viewer" class="fixed inset-0 bg-black/95 flex items-center justify-center z-[400] p-6">
            <div class="relative w-full max-w-xs">
                <div class="flex items-center justify-between mb-2 text-white text-xs">
                    <span class="flex items-center gap-1 text-yellow-400">
                        <i class="fas fa-eye"></i> مشاهدة مرة واحدة
                    </span>
                    <span id="view-once-timer" class="font-mono">00:${VIEW_SECONDS.toString().padStart(2, '0')}</span>
                </div>
                <div class="rounded-xl overflow-hidden border border-yellow-500/30 shadow-2xl">
                    <img src="${imageUrl}" class="w-full max-h-[60vh] object-contain bg-black">
                </div>
                <div class="w-full bg-gray-700 h-1 rounded-full mt-2 overflow-hidden">
                    <div id="view-once-progress" class="bg-yellow-400 h-1" style="width:100%"></div>
                </div>
                <button id="close-view-once" class="mt-4 w-full bg-gray-800 hover:bg-gray-700 text-white text-sm py-2 rounded-lg">
                    <i class="fas fa-times mr-1"></i> إغلاق
                </button>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', viewerHTML);

    const viewer = document.getElementById('view-once-viewer');
    const timerEl = document.getElementById('view-once-timer');
    const progressEl = document.getElementById('view-once-progress');
    let countdownInterval = null;

    const closeViewer = () => {
        if (countdownInterval) clearInterval(countdownInterval);
        if (viewer && viewer.parentNode) viewer.remove();
    };

    document.getElementById('close-view-once').addEventListener('click', closeViewer);
    viewer.addEventListener('click', (e) => {
        if (e.target.id === 'view-once-viewer') closeViewer();
    });

    countdownInterval = setInterval(() => {
        remaining--;
        if (timerEl) timerEl.textContent = `00:${Math.max(remaining, 0).toString().padStart(2, '0')}`;
        if (progressEl) progressEl.style.width = `${(remaining / VIEW_SECONDS) * 100}%`;
        if (remaining <= 0) closeViewer();
    }, 1000);

    // تحديث شكل الرسالة فوراً لدى المُشاهِد
    if (messageElement) {
        const btn = messageElement.querySelector('.view-once-image-btn');
        if (btn) {
            btn.outerHTML = `
                <div class="flex items-center gap-2 bg-gray-700/60 rounded-lg px-3 py-2 text-xs text-gray-400">
                    <i class="fas fa-eye-slash"></i>
                    <span>تمت مشاهدة هذه الصورة</span>
                </div>
            `;
        }
    }

    markMessageAsViewed(messageId);
}

        // --- 👁️ نافذة مشاهدة الفيديو لمرة واحدة (نفس فلسفة الصورة + مشغل فيديو) ---
function openViewOnceVideo(messageId, videoUrl, messageElement) {
    const existing = document.getElementById('view-once-viewer');
    if (existing) existing.remove();

    const VIEW_SECONDS = 20; // مدة أطول قليلاً من الصورة لأن الفيديو يحتاج وقت مشاهدة
    let remaining = VIEW_SECONDS;

    const viewerHTML = `
        <div id="view-once-viewer" class="fixed inset-0 bg-black/95 flex items-center justify-center z-[400] p-6">
            <div class="relative w-full max-w-sm">
                <div class="flex items-center justify-between mb-2 text-white text-xs">
                    <span class="flex items-center gap-1 text-yellow-400">
                        <i class="fas fa-eye"></i> مشاهدة مرة واحدة
                    </span>
                    <span id="view-once-timer" class="font-mono">00:${VIEW_SECONDS.toString().padStart(2, '0')}</span>
                </div>
                <div class="rounded-xl overflow-hidden border border-yellow-500/30 shadow-2xl bg-black">
                    <video id="view-once-video-el" src="${videoUrl}" class="w-full max-h-[55vh] object-contain" controls autoplay></video>
                </div>
                <div class="w-full bg-gray-700 h-1 rounded-full mt-2 overflow-hidden">
                    <div id="view-once-progress" class="bg-yellow-400 h-1" style="width:100%"></div>
                </div>
                <button id="close-view-once" class="mt-4 w-full bg-gray-800 hover:bg-gray-700 text-white text-sm py-2 rounded-lg">
                    <i class="fas fa-times mr-1"></i> إغلاق
                </button>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', viewerHTML);

    const viewer = document.getElementById('view-once-viewer');
    const timerEl = document.getElementById('view-once-timer');
    const progressEl = document.getElementById('view-once-progress');
    const videoEl = document.getElementById('view-once-video-el');
    let countdownInterval = null;

    const closeViewer = () => {
        if (countdownInterval) clearInterval(countdownInterval);
        if (videoEl) videoEl.pause();
        if (viewer && viewer.parentNode) viewer.remove();
    };

    document.getElementById('close-view-once').addEventListener('click', closeViewer);
    viewer.addEventListener('click', (e) => {
        if (e.target.id === 'view-once-viewer') closeViewer();
    });

    countdownInterval = setInterval(() => {
        remaining--;
        if (timerEl) timerEl.textContent = `00:${Math.max(remaining, 0).toString().padStart(2, '0')}`;
        if (progressEl) progressEl.style.width = `${(remaining / VIEW_SECONDS) * 100}%`;
        if (remaining <= 0) closeViewer();
    }, 1000);

    if (messageElement) {
        const btn = messageElement.querySelector('.view-once-video-btn');
        if (btn) {
            btn.outerHTML = `
                <div class="flex items-center gap-2 bg-gray-700/60 rounded-lg px-3 py-2 text-xs text-gray-400">
                    <i class="fas fa-eye-slash"></i>
                    <span>تمت مشاهدة هذا الفيديو</span>
                </div>
            `;
        }
    }

    markMessageAsViewed(messageId);
}

// --- 👁️ تعليم رسالة كـ "تمت مشاهدتها" (يُشعر المرسل عبر Socket تلقائياً) ---
async function markMessageAsViewed(messageId) {
    try {
        const response = await fetch('/api/private-chat/message/status', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ messageId: messageId, status: 'seen' })
        });
        if (!response.ok) console.warn('[VIEW ONCE] فشل تحديث حالة المشاهدة');
    } catch (error) {
        console.error('[VIEW ONCE] خطأ:', error);
    }
}
        

// --- 🎵 دالة ربط أحداث الوسائط ---
function bindMediaEvents(messageElement, message) {
    // صور
    const imageBtn = messageElement.querySelector('.view-image-btn');
    if (imageBtn) {
        imageBtn.addEventListener('click', () => {
            showImageViewer(imageBtn.dataset.imageUrl, message);
        });
    }
    
    // صوت
    const voiceBtn = messageElement.querySelector('.play-voice-btn');
    if (voiceBtn) {
        voiceBtn.addEventListener('click', () => {
            playVoiceMessage(voiceBtn.dataset.voiceUrl, messageElement);
        });
    }
    
    // فيديو
    const videoBtn = messageElement.querySelector('.play-video-btn');
    if (videoBtn) {
        videoBtn.addEventListener('click', () => {
            showVideoPlayer(videoBtn.dataset.videoUrl, message);
        });
    }
}

// --- 🔄 دالة تحديث حالة الرسالة ---
function updateMessageStatus(messageElement, status) {
    const statusContainer = messageElement.querySelector('.message-status');
    if (!statusContainer) return;
    
    if (status.seen) {
        statusContainer.innerHTML = '<i class="fas fa-check-double text-blue-400 text-xs" title="مقروءة"></i>';
    } else if (status.delivered) {
        statusContainer.innerHTML = '<i class="fas fa-check-double text-gray-400 text-xs" title="تم التسليم"></i>';
    }
}


        
        
        
    // --- ✅ دالة لعرض بروفايل مستخدم حظرك (مصممة بشكل أفضل) ---
function showBlockedProfileModal(userId, blockData) {
    // جلب مستوى المستخدم الحالي
    const user = JSON.parse(localStorage.getItem('user'));
    const userLevel = user ? user.level : 1;
    
    // زر الرسالة (يعمل من المستوى 4)
    const messageButtonHTML = userLevel >= 4 ? 
        `<button id="send-one-message-btn" data-user-id="${userId}" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition mb-4">
            <i class="fas fa-paper-plane mr-2"></i>
            إرسال رسالة واحدة (25 حرف)
        </button>` :
        `<button class="w-full bg-gray-700 text-gray-500 font-bold py-3 rounded-lg mb-4 cursor-not-allowed" disabled>
            <i class="fas fa-lock mr-2"></i>
            إرسال رسالة (تصل عند المستوى ${4})
        </button>`;

    const modalHTML = `
        <div id="blocked-profile-modal" class="fixed inset-0 bg-black/70 flex items-center justify-center z-[310] p-4">
            <div class="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl shadow-2xl w-full max-w-sm text-white transform scale-95 transition-transform duration-300 border-2 border-red-500/30">
                
                <!-- المحتوى البسيط -->
                <div class="flex flex-col items-center p-8">
                    <!-- علامة التعجب مع تأثير hover -->
                    <div class="relative group mb-8">
                        <div class="w-24 h-24 rounded-full bg-red-500/20 flex items-center justify-center border-4 border-red-500/50 transition-transform group-hover:scale-110 duration-300">
                            <i class="fas fa-exclamation-triangle text-4xl text-red-400"></i>
                        </div>
                        
                        <!-- النص المنبثق (يظهر عند التمرير) -->
                        <div class="absolute -top-16 left-1/2 transform -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-all duration-300 pointer-events-none z-10">
                            <div class="bg-gray-900 text-sm text-gray-300 px-4 py-3 rounded-lg border border-gray-700 shadow-2xl whitespace-nowrap">
                                <div class="flex items-center gap-2">
                                    <i class="fas fa-info-circle text-blue-400"></i>
                                    <span>هذا المستخدم قد يكون قد حظرك</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- الاسم -->
                    <h2 class="text-xl font-bold text-gray-300 mb-3">${blockData.targetUser.username}</h2>
                    
                    <!-- الرسالة البسيطة -->
                    <p class="text-gray-400 text-center mb-8 leading-relaxed">
                        <span class="block mb-2">لا يمكن عرض الملف الشخصي</span>
                        <span class="text-sm text-gray-500">قد يكون المستخدم قد حظرك أو قام بإخفاء ملفه الشخصي</span>
                    </p>
                    
                    <!-- زر إرسال رسالة (يعمل من المستوى 4) -->
                    ${messageButtonHTML}
                    
                    <!-- زر الإغلاق -->
                    <button class="w-full bg-gray-800 hover:bg-gray-700 text-white font-bold py-3 rounded-lg transition close-blocked-modal-btn">
                        <i class="fas fa-times mr-2"></i>
                        إغلاق
                    </button>
                </div>
            </div>
        </div>
    `;
    
        document.getElementById('game-container').insertAdjacentHTML('beforeend', modalHTML);
    
    const modal = document.getElementById('blocked-profile-modal');
    
    // تأثير الظهور
    setTimeout(() => {
        modal.querySelector('.transform').classList.remove('scale-95');
    }, 50);
    
    // --- ✅ event delegation للنافذة الجديدة ---
    modal.addEventListener('click', (e) => {
        // 1. إغلاق بالنقر على الخلفية
        if (e.target.id === 'blocked-profile-modal') {
            modal.remove();
            return;
        }
        
        // 2. زر الإغلاق
        if (e.target.closest('.close-blocked-modal-btn')) {
            modal.remove();
            return;
        }
        
        // 3. زر إرسال رسالة (إذا كان المستوى 4 أو أعلى)
        if (e.target.closest('#send-one-message-btn') && userLevel >= 4) {
            const targetUserId = e.target.closest('#send-one-message-btn').dataset.userId;
            showOneMessageModal(targetUserId, blockData.targetUser.username);
            return;
        }
    });
}

async function sendOneTimeMessageRequest(receiverId, content, payExtra) {
    const response = await fetch('/api/private-chat/one-time-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ receiverId, content, payExtra })
    });
    const data = await response.json();
    return { ok: response.ok, data };
}

// ✅ نافذة أنيقة تخبر المستخدم بعدم كفاية الرصيد وتعرض له زر شحن مباشر
function showInsufficientCoinsModal(message) {
    const existing = document.getElementById('insufficient-coins-modal');
    if (existing) existing.remove();

    const html = `
        <div id="insufficient-coins-modal" class="fixed inset-0 bg-black/70 flex items-center justify-center z-[400] p-4">
            <div class="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl shadow-2xl w-full max-w-xs text-white p-6 text-center border border-yellow-600/30">
                <i class="fas fa-coins text-4xl text-yellow-400 mb-3"></i>
                <p class="text-sm mb-5">${message}</p>
                <div class="flex gap-2">
                    <button id="ic-cancel-btn" class="flex-1 bg-gray-700 hover:bg-gray-600 py-2 rounded-lg text-sm">إلغاء</button>
                    <button id="ic-topup-btn" class="flex-1 bg-yellow-600 hover:bg-yellow-700 py-2 rounded-lg text-sm font-bold">شحن كوينزات</button>
                </div>
            </div>
        </div>
    `;
    document.getElementById('game-container').insertAdjacentHTML('beforeend', html);
    const modal = document.getElementById('insufficient-coins-modal');

    document.getElementById('ic-cancel-btn').addEventListener('click', () => modal.remove());
    document.getElementById('ic-topup-btn').addEventListener('click', () => {
        modal.remove();
        showBuyCoinsModal();
    });
}

        

// --- ✅ دالة نافذة إرسال رسالة واحدة ---
function showOneMessageModal(targetUserId, targetUsername) {
    const modalHTML = `
                <div id="one-message-modal" class="fixed inset-0 bg-black/70 flex items-center justify-center z-[330] p-4">
            <div class="bg-gradient-to-br from-gray-800 to-blue-900/30 rounded-2xl shadow-2xl w-full max-w-sm text-white transform scale-95 transition-transform duration-300 border-2 border-blue-500/30">
                
                <div class="p-6">
                    <h3 class="text-lg font-bold mb-4 flex items-center gap-3">
                        <i class="fas fa-paper-plane text-blue-400"></i>
                        إرسال رسالة لـ ${targetUsername}
                    </h3>
                    
                    <div class="mb-4">
                        <textarea id="one-message-input" 
                                  class="w-full bg-gray-700 border border-gray-600 rounded-lg p-3 text-sm h-32"
                                  placeholder="اكتب رسالتك هنا... (حد أقصى 25 حرف)"
                                  maxlength="25"></textarea>
                        <div class="flex justify-between items-center mt-2 text-xs text-gray-400">
                            <span id="message-char-count">0/25</span>
                            <span class="text-blue-400">رسالة واحدة فقط</span>
                        </div>
                    </div>
                    
                    <div class="flex gap-3">
                        <button id="cancel-one-message" class="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 rounded-lg transition">
                            إلغاء
                        </button>
                        <button id="send-one-message" class="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition">
                            إرسال
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.getElementById('game-container').insertAdjacentHTML('beforeend', modalHTML);
    
    const modal = document.getElementById('one-message-modal');
    const oneMsgInput = document.getElementById('one-message-input'); // ✅ اسم مختلف تماماً يمنع أي تعارض
    const charCount = document.getElementById('message-char-count');
    
    setTimeout(() => {
        modal.querySelector('.transform').classList.remove('scale-95');
    }, 50);
    
    oneMsgInput.addEventListener('input', () => {
        charCount.textContent = `${oneMsgInput.value.length}/25`;
    });
    
    document.getElementById('send-one-message').addEventListener('click', async () => {
        const messageText = oneMsgInput.value.trim(); // ✅ اسم متغير محلي مستقل بالكامل
        
        if (!messageText) {
            showNotification('اكتب رسالة أولاً', 'error');
            return;
        }
        if (messageText.length > 25) {
            showNotification('الرسالة طويلة جداً (25 حرف كحد أقصى)', 'error');
            return;
        }
        
        const sendBtn = document.getElementById('send-one-message');
        sendBtn.disabled = true;
        sendBtn.textContent = 'جاري الإرسال...';

           try {
            const response = await sendOneTimeMessageRequest(targetUserId, messageText, false);

            if (response.ok) {
                showNotification(response.data.message, 'success');
                modal.remove();
                const blockedModal = document.getElementById('blocked-profile-modal');
                if (blockedModal) blockedModal.remove();
                return;
            }

            if (response.data.code === 'PAYMENT_REQUIRED') {
                showConfirmationModal(response.data.message + ' هل تريد المتابعة؟', async () => {
                    const paidResponse = await sendOneTimeMessageRequest(targetUserId, messageText, true);
                    if (paidResponse.ok) {
                        showNotification(paidResponse.data.message, 'success');
                        modal.remove();
                        const blockedModal = document.getElementById('blocked-profile-modal');
                        if (blockedModal) blockedModal.remove();
                        await refreshUserData();
                    } else if (paidResponse.data.code === 'INSUFFICIENT_COINS') {
                        showInsufficientCoinsModal(paidResponse.data.message);
                    } else {
                        showNotification(paidResponse.data.message || 'فشل إرسال الرسالة', 'error');
                    }
                });
                sendBtn.disabled = false;
                sendBtn.textContent = 'إرسال';
                return;
            }

            if (response.data.code === 'INSUFFICIENT_COINS') {
                showInsufficientCoinsModal(response.data.message);
                sendBtn.disabled = false;
                sendBtn.textContent = 'إرسال';
                return;
            }

            showNotification(response.data.message || 'فشل إرسال الرسالة', 'error');
            sendBtn.disabled = false;
            sendBtn.textContent = 'إرسال';

        } catch (error) {
            console.error('[ONE TIME MESSAGE] Error:', error);
            showNotification('خطأ في الاتصال بالخادم', 'error');
            sendBtn.disabled = false;
            sendBtn.textContent = 'إرسال';
        }
    });
    
    document.getElementById('cancel-one-message').addEventListener('click', () => {
        modal.remove();
    });
    
    modal.addEventListener('click', (e) => {
        if (e.target.id === 'one-message-modal') {
            modal.remove();
        }
    });
}
        
// --- ✅ دالة جديدة لتوليد HTML زر الصداقة الملون ---
function getFriendButtonHTML(profileUser, selfUser) {
    // ✅ تحويل كل الـ IDs إلى String للمقارنة الصحيحة
    const profileUserIdStr = profileUser._id.toString();
    
    // ✅ استخراج IDs من مصفوفات المستخدم الحالي
    const friendsIds = (selfUser.friends || []).map(item => 
        item._id ? item._id.toString() : item.toString()
    );
    
    const sentRequestsIds = (selfUser.friendRequestsSent || []).map(user => 
        user._id ? user._id.toString() : user.toString()
    );
    
    const receivedRequestsIds = (selfUser.friendRequestsReceived || []).map(user => 
        user._id ? user._id.toString() : user.toString()
    );
    
    // ✅ استخراج IDs من المحظورين
    const blockedUsersIds = (selfUser.blockedUsers || []).map(item => 
        item._id ? item._id.toString() : item.toString()
    );

    let friendButtonHTML = '';

    // ✅ منطق أزرار الصداقة + الحظر
    if (friendsIds.includes(profileUserIdStr)) {
        friendButtonHTML = `<button class="action-btn friend-btn" data-action="remove-friend" data-user-id="${profileUser._id}"><i class="fas fa-user-check"></i><span>صديق</span></button>`;
    } else if (sentRequestsIds.includes(profileUserIdStr)) {
        friendButtonHTML = `<button class="action-btn sent-btn" data-action="cancel-request" data-user-id="${profileUser._id}"><i class="fas fa-user-clock"></i><span>مُرسَل</span></button>`;
    } else if (receivedRequestsIds.includes(profileUserIdStr)) {
        friendButtonHTML = `<button class="action-btn received-btn" data-action="accept-request" data-user-id="${profileUser._id}"><i class="fas fa-user-check"></i><span>قبول</span></button>`;
    } else if (blockedUsersIds.includes(profileUserIdStr)) {
        // ✅ إذا كان محظوراً - زر فك الحظر
        friendButtonHTML = `<button class="action-btn unblock-btn" data-action="unblock" data-user-id="${profileUser._id}"><i class="fas fa-user-lock"></i><span>محظور</span></button>`;
    } else {
        // ✅ إذا لم يكن شيئاً - زر إضافة
        friendButtonHTML = `<button class="action-btn add-btn" data-action="send-request" data-user-id="${profileUser._id}"><i class="fas fa-user-plus"></i><span>إضافة</span></button>`;
    }
    
    console.log('[FIXED] Generated button:', friendButtonHTML);
    return friendButtonHTML;
}


    // =================================================
    // =========== قسم الدردشة (Chat Section) ==========
    // =================================================

        const messageInput = document.getElementById('messageInput');
    const charCounter = document.getElementById('char-counter');
    let publicTypingTimeout = null;
    let isPublicTyping = false;
    messageInput.addEventListener('input', () => {
        const currentLength = messageInput.value.length;
        charCounter.textContent = `${currentLength}/300`;
        if (currentLength > 280) charCounter.classList.add('text-red-400');
        else charCounter.classList.remove('text-red-400');

        if (!isPublicTyping) { isPublicTyping = true; socket.emit('typing-start', { roomId: 'public' }); }
        clearTimeout(publicTypingTimeout);
        publicTypingTimeout = setTimeout(() => { isPublicTyping = false; socket.emit('typing-stop', { roomId: 'public' }); }, 2000);
    });

    const publicTypers = new Map();
    socket.on('publicUserTyping', ({ userId, username, isTyping }) => {
        const indicator = document.getElementById('public-typing-indicator');
        if (!indicator) return;
        if (isTyping) publicTypers.set(userId, username);
        else publicTypers.delete(userId);

        const names = Array.from(publicTypers.values());
        if (names.length === 0) indicator.textContent = '';
        else if (names.length === 1) indicator.innerHTML = `<i class="fas fa-pen mr-1"></i> ${names[0]} يكتب الآن...`;
        else indicator.innerHTML = `<i class="fas fa-pen mr-1"></i> ${names.length} أشخاص يكتبون الآن...`;
    });

     
    const sendBtn = document.getElementById('sendBtn');
    const chatMessages = document.getElementById('chat-messages');
        

   // --- ✅ أضف هذا الكود لتفعيل النقر على الصور ---
chatMessages.addEventListener('click', (e) => {
    // تحقق مما إذا كانت النقرة على صورة ولها data-user-id
    if (e.target.tagName === 'IMG' && e.target.dataset.userId) {
        const userId = e.target.dataset.userId;
        // لا تفتح نافذة للمستخدم نفسه
        if (userId === user._id) return;
        
        showMiniProfileModal(userId);
    }
});
    // --- استبدل دالة sendMessage بهذه ---
function sendMessage() {
    const message = messageInput.value.trim();
    if (message) {
        const messageData = { message: message };
        if (replyingToMessage) {
            messageData.replyTo = replyingToMessage._id;
        }
        socket.emit('sendMessage', messageData);
        messageInput.value = '';
        // إخفاء شريط الرد بعد الإرسال
        const replyBar = document.getElementById('reply-bar');
        if (replyBar) replyBar.remove();
        replyingToMessage = null;
        // إعادة تعيين عداد الأحرف
        document.getElementById('char-counter').textContent = '0/300';
    }
}


    sendBtn.addEventListener('click', sendMessage);
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });
        const publicGiftBtn = document.getElementById('public-gift-btn');
    if (publicGiftBtn) {
        publicGiftBtn.addEventListener('click', showPublicGiftModal);
    }

    // --- استبدل دالة displayMessage بهذه النسخة ---
function displayMessage(message) {
    if (!message || !message.sender) return;

    const isMyMessage = message.sender._id === user._id;
    const messageElement = document.createElement('div');
    messageElement.dataset.messageId = message._id;
    const senderBubbleClass = message.sender.activeBubbleSkinClass || '';
    // ✅ حجم موحّد أنيق ومضغوط على كل الشاشات (كمبيوتر وهاتف) — لا فرق بينهما بعد الآن
    messageElement.className = 'message-container px-2.5 py-2 rounded-xl mb-2 flex items-start gap-2 relative group max-w-full ' + (senderBubbleClass || (isMyMessage ? 'bg-purple-800/80' : 'bg-gray-700/70'));

    let replyHTML = '';
    if (message.replyTo && message.replyTo.sender) {
        replyHTML = `
            <div class="reply-snippet bg-black/20 px-2 py-1 rounded-md mb-1 border-l-2 border-purple-400">
                 <p class="font-bold text-[10px] text-purple-300">${escapeHtml(message.replyTo.sender.username)}</p>
                <p class="text-[10px] text-gray-300 truncate">${escapeHtml(message.replyTo.content || 'رسالة')}</p>
            </div>
        `;
    }

                messageElement.innerHTML = `
        <img src="${message.sender.profileImage}" alt="${message.sender.username}" 
             class="w-7 h-7 rounded-full cursor-pointer hover:ring-2 hover:ring-purple-400 flex-shrink-0 ${message.sender.activeFrameClass || ''}" data-user-id="${message.sender._id}">
        <div class="min-w-0 flex-1">
            ${replyHTML}
            <p class="font-bold text-[11px] leading-tight ${isMyMessage ? 'text-yellow-300' : 'text-purple-300'}">${escapeHtml(message.sender.username)}</p>
             <p class="text-white text-[13px] leading-snug break-words">${escapeHtml(message.content)}</p>
        </div>
        <div class="flex flex-col gap-1 flex-shrink-0">
            <button class="reply-btn text-gray-400 hover:text-purple-400 text-[10px]" title="رد">
                <i class="fas fa-reply"></i>
            </button>
            ${!isMyMessage ? `<button class="report-public-msg-btn text-gray-400 hover:text-red-400 text-[10px]" title="إبلاغ"><i class="fas fa-exclamation-triangle"></i></button>` : ''}
        </div>
    `;

    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    messageElement.querySelector('.reply-btn').addEventListener('click', () => {
        showReplyBar(message);
    });

    const reportPublicBtn = messageElement.querySelector('.report-public-msg-btn');
    if (reportPublicBtn) {
        reportPublicBtn.addEventListener('click', () => {
            showReportModal({
                type: 'message',
                reportedUserId: message.sender._id,
                reportedUsername: message.sender.username,
                messageId: message._id,
                messageContent: message.content,
                messageType: 'text',
                roomId: 'public'
            });
        });
    }

    // --- ✅ منطق توميض الرسالة المردود عليها ---
    if (message.replyTo) {
        const originalMessageElement = document.querySelector(`[data-message-id="${message.replyTo._id}"]`);
        if (originalMessageElement) {
            originalMessageElement.classList.add('flash-animation');
            setTimeout(() => originalMessageElement.classList.remove('flash-animation'), 1000);
        }
    }
    // ✅ تمت إزالة كود "المرآة" القديم — النافذة السفلية بالهاتف تنقل عنصر #chat-messages الحقيقي بدل نسخه (انظر تعديل showMobilePublicChatSheet)
}



    socket.on('newMessage', displayMessage);

    // 📍 استبدل دالة loadChatHistory بالكامل بهذا الكود
async function loadChatHistory() {
    try {
        // 1️⃣ جلب بيانات المستخدم الحالي من localStorage
        const user = JSON.parse(localStorage.getItem('user'));
        if (!user || !user.blockedUsers) {
            console.log('[CHAT] No user data or blocked list found');
            return;
        }
        
        // 2️⃣ جلب الرسائل من الخادم
        const response = await fetch('/api/messages/public-room', { 
            headers: { 'Authorization': `Bearer ${token}` } 
        });
        const result = await response.json();
        
        if (response.ok && result.status === 'success') {
            // 3️⃣ تنظيف الشات أولاً
            chatMessages.innerHTML = '';
            
            // 4️⃣ فلترة إضافية على العميل (للأمان الزائد)
            const blockedUsersIds = user.blockedUsers.map(id => 
                typeof id === 'object' ? id._id.toString() : id.toString()
            );
            
            console.log(`[CHAT FILTER] Blocked IDs:`, blockedUsersIds);
            
            // 5️⃣ عرض الرسائل المفلترة فقط
            result.data.messages.forEach(message => {
                // التحقق إذا كان المرسل محظوراً
                const senderId = message.sender._id.toString();
                const isBlocked = blockedUsersIds.includes(senderId);
                
                if (!isBlocked) {
                    displayMessage(message);
                } else {
                    console.log(`[CHAT FILTER] Client filtered message from: ${message.sender.username}`);
                }
            });
            
            console.log(`[CHAT] Loaded ${result.data.messages.length} messages, displayed after client filter`);
        }
    } catch (error) {
        console.error('Failed to load chat history:', error);
    }
}
    loadChatHistory();

// --- 🔢 دالة تحديث العداد غير المقروء ---
function updateUnreadCount(userId, count) {
    // TODO: تحديث في قائمة الدردشات لاحقاً
    console.log(`[CHAT] Unread count for ${userId}: ${count}`);
}

// --- 📋 دالة تحديث بادج قائمة الدردشات ---
function updateChatListBadge() {
    // TODO: تحديث عندما نضيف قائمة الدردشات
}

// --- 🖼️ دالة عرض الصور ---
function showImageViewer(imageUrl, message) {
    console.log('[CHAT] Showing image:', imageUrl);
    
    if (message.metadata?.viewOnce) {
        showNotification('⚠️ هذه الصورة للعرض مرة واحدة فقط', 'warning');
    }
    
    // TODO: إنشاء نافذة عرض الصور
    showNotification('عرض الصورة قريباً...', 'info');
}

// --- 🎵 دالة تشغيل الصوت (حقيقية - ليست محاكاة) ---
async function playVoiceMessage(voiceUrl, messageElement) {
    console.log('[CHAT] 🎵 Playing voice message:', voiceUrl);
    
    const playBtn = messageElement.querySelector('.play-voice-btn');
    const progressBar = messageElement.querySelector('.voice-progress');
    
    if (!playBtn || !progressBar) {
        console.error('[CHAT] ❌ Play button or progress bar not found');
        return;
    }
    
    try {
        // إذا كان الصوت مشغلاً بالفعل، أوقفه
        if (playBtn.classList.contains('playing')) {
            console.log('[CHAT] ⏸️ Stopping current audio');
            playBtn.innerHTML = '<i class="fas fa-play text-white"></i>';
            playBtn.classList.remove('playing');
            progressBar.style.width = '0%';
            
            if (window.currentAudio) {
                window.currentAudio.pause();
                window.currentAudio.currentTime = 0;
                window.currentAudio = null;
            }
            return;
        }
        
        // إيقاف أي صوت آخر قيد التشغيل
        if (window.currentAudio) {
            console.log('[CHAT] 🛑 Stopping previous audio');
            window.currentAudio.pause();
            window.currentAudio = null;
            
            // إعادة تعيين الأزرار الأخرى
            document.querySelectorAll('.play-voice-btn.playing').forEach(btn => {
                btn.innerHTML = '<i class="fas fa-play text-white"></i>';
                btn.classList.remove('playing');
            });
            document.querySelectorAll('.voice-progress').forEach(bar => {
                bar.style.width = '0%';
            });
        }
        
        // بدء التشغيل
        console.log('[CHAT] ▶️ Starting playback');
        playBtn.innerHTML = '<i class="fas fa-pause text-white"></i>';
        playBtn.classList.add('playing');
        
        // إنشاء عنصر الصوت
        const audio = new Audio();
        audio.src = voiceUrl;
        audio.preload = 'auto';
        audio.volume = 1.0;
        
        window.currentAudio = audio;
        
        // عند تحميل البيانات
        audio.addEventListener('loadedmetadata', () => {
            console.log('[CHAT] 📊 Audio loaded, duration:', audio.duration, 'seconds');
        });
        
        // تحديث شريط التقدم
        audio.addEventListener('timeupdate', () => {
            if (audio.duration) {
                const progress = (audio.currentTime / audio.duration) * 100;
                progressBar.style.width = `${progress}%`;
            }
        });
        
        // عند الانتهاء
        audio.addEventListener('ended', () => {
            console.log('[CHAT] ✅ Audio playback ended');
            playBtn.innerHTML = '<i class="fas fa-play text-white"></i>';
            playBtn.classList.remove('playing');
            progressBar.style.width = '0%';
            window.currentAudio = null;
        });
        
        // عند الخطأ
        audio.addEventListener('error', (e) => {
            console.error('[CHAT] ❌ Audio error:', {
                error: e,
                code: audio.error?.code,
                message: audio.error?.message,
                url: voiceUrl
            });
            
            playBtn.innerHTML = '<i class="fas fa-exclamation-triangle text-white"></i>';
            playBtn.classList.remove('playing');
            progressBar.style.width = '0%';
            
            let errorMsg = 'تعذر تشغيل الرسالة الصوتية';
            if (audio.error) {
                switch(audio.error.code) {
                    case 1: errorMsg = 'تم إلغاء تحميل الصوت'; break;
                    case 2: errorMsg = 'خطأ في الشبكة'; break;
                    case 3: errorMsg = 'تعذر فك تشفير الصوت'; break;
                    case 4: errorMsg = 'تنسيق الصوت غير مدعوم'; break;
                }
            }
            
            showNotification(errorMsg, 'error');
            window.currentAudio = null;
        });
        
        // بدء التشغيل
        console.log('[CHAT] 🚀 Calling audio.play()');
        const playPromise = audio.play();
        
        if (playPromise !== undefined) {
            playPromise
                .then(() => {
                    console.log('[CHAT] ✅ Playback started successfully');
                })
                .catch(error => {
                    console.error('[CHAT] ❌ Play failed:', error);
                    playBtn.innerHTML = '<i class="fas fa-play text-white"></i>';
                    playBtn.classList.remove('playing');
                    
                    if (error.name === 'NotAllowedError') {
                        showNotification('اضغط في أي مكان بالصفحة أولاً', 'warning');
                    } else {
                        showNotification('فشل تشغيل الصوت', 'error');
                    }
                });
        }
        
    } catch (error) {
        console.error('[VOICE PLAYBACK] Catch error:', error);
        playBtn.innerHTML = '<i class="fas fa-play text-white"></i>';
        playBtn.classList.remove('playing');
        showNotification('خطأ في تشغيل الصوت', 'error');
    }
}

// --- 🎬 دالة تشغيل الفيديو الفعلية ---
function showVideoPlayer(videoUrl, message) {
    console.log('[CHAT] Playing video:', videoUrl);

    const existing = document.getElementById('video-player-modal');
    if (existing) existing.remove();

    const meta = message.metadata || {};
    const disableSaveBadge = meta.disableSave
        ? `<span class="absolute top-3 left-3 bg-red-500/80 text-white text-xs px-2 py-1 rounded-full"><i class="fas fa-download-slash mr-1"></i>حفظ معطل</span>`
        : '';

    const viewerHTML = `
        <div id="video-player-modal" class="fixed inset-0 bg-black/95 flex items-center justify-center z-[400] p-4">
            <div class="relative w-full max-w-lg">
                <button id="close-video-player" class="absolute -top-10 right-0 text-white text-2xl w-10 h-10 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center">
                    <i class="fas fa-times"></i>
                </button>
                <div class="relative rounded-xl overflow-hidden border border-gray-700">
                    <video src="${videoUrl}" class="w-full max-h-[70vh] bg-black" controls autoplay ${meta.disableSave ? 'controlsList="nodownload"' : ''}></video>
                    ${disableSaveBadge}
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', viewerHTML);

    const viewer = document.getElementById('video-player-modal');
    const close = () => {
        const video = viewer.querySelector('video');
        if (video) video.pause();
        viewer.remove();
    };

    document.getElementById('close-video-player').addEventListener('click', close);
    viewer.addEventListener('click', (e) => {
        if (e.target.id === 'video-player-modal') close();
    });
}

        

   // 📩 مستمع لاستقبال رسائل خاصة
socket.on('privateMessageReceived', async (data) => {
    console.log('[CHAT] Private message received:', data.message?._id);
    
    const chatModal = document.getElementById('private-chat-modal');
    const targetUserId = chatModal?.dataset?.targetUserId;
    
    if (chatModal && targetUserId === data.senderId) {
        // عرض الرسالة في الدردشة المفتوحة
        displayPrivateMessage(data.message, false);
        
        // ✅ المحادثة مفتوحة فعلياً الآن → تُصبح "مُشاهَدة" فوراً بلا انتظار (بدل الاكتفاء بـ"تم التسليم")
        try {
            await fetch(`/api/private-chat/chat/${data.senderId}/read`, {
                method: 'PUT', headers: { 'Authorization': `Bearer ${token}` }
            });
        } catch (error) { console.error('[CHAT] Error marking as seen instantly:', error); }
        
        } else {
        // ✅ داخل غرفة (وضع ملء الشاشة): فقاعة عائمة بأسلوب ماسنجر + تحديث شارة أيقونة الرسائل
        // بدل الاعتماد على شريط التنقل السفلي المخفي بهذا الوضع
        if (document.body.classList.contains('in-voice-room')) {
            lastRoomDMSender = {
                id: data.senderId,
                username: data.senderName,
                profileImage: data.message?.sender?.profileImage || 'https://i.ibb.co/601T5nRV/7d580cf284dbd895ae2db4b598ec8bb2.jpg'
            };
            roomUnreadDMCount++;
            updateRoomMessagesBadge();
            showIncomingDMBubble(data.senderId, data.senderName, lastRoomDMSender.profileImage);
        }
        // ✅ لا إشعار جانبي مطلقاً — فقط تحديث شارة العداد (رقم على الأيقونة)
        refreshMessagesNavBadge();
        if (document.getElementById('messages-list-container')) {
            loadMessagesList();
        }
    }
});

// 🔄 مستمع لتحديث حالة الرسالة
// ✅ لا نُحدّث الشكل الظاهر للعلامة (✓ مقابل ✓✓) بشكل حي أثناء بقاء المحادثة مفتوحة عند المرسل —
// العلامة الزرقاء المزدوجة تظهر فقط عند إعادة فتح/تحميل المحادثة من جديد (loadChatHistoryFromServer)
socket.on('messageStatusUpdated', (data) => {
    console.log('[CHAT] Message status updated:', data.messageId, data.status);

    const messageElement = document.querySelector(`[data-message-id="${data.messageId}"]`);
    if (messageElement) {
        const statusContainer = messageElement.querySelector('.message-status');
        if (statusContainer && false) { // ✅ معطّل عمداً — التحديث الحي للعلامة الزرقاء متوقف بطلب المستخدم
            if (data.status === 'seen') {
                statusContainer.innerHTML = '<i class="fas fa-check-double text-blue-400 text-xs" title="مقروءة"></i>';
            } else if (data.status === 'delivered') {
                statusContainer.innerHTML = '<i class="fas fa-check-double text-gray-400 text-xs" title="تم التسليم"></i>';
            }
        }

        // ✅ تحديث شارة "مشاهدة مرة واحدة" لدى المرسل فور فتح المستقبل لها
        if (data.status === 'seen') {
            const viewOnceStatus = messageElement.querySelector(`[data-view-once-status="${data.messageId}"]`);
            if (viewOnceStatus) {
                viewOnceStatus.textContent = 'تم فتحها ✓';
                viewOnceStatus.classList.remove('text-gray-400');
                viewOnceStatus.classList.add('text-green-400');
                const icon = viewOnceStatus.parentElement.querySelector('i.fas');
                if (icon) {
                    icon.classList.remove('fa-eye-slash', 'text-yellow-400');
                    icon.classList.add('fa-eye', 'text-green-400');
                }
            }
        }
    }
});     


        

// --- ✅ أضف هذا المستمع الجديد ---
// --- ✅ استبدل مستمع friendshipUpdate بهذا ---
socket.on('friendshipUpdate', async () => {
    console.log('[SOCKET] Received friendship update. Refetching self user data.');
    try {
        const selfUserResponse = await fetch(`/api/users/me/details`, { headers: { 'Authorization': `Bearer ${token}` } });
        const selfUserResult = await selfUserResponse.json();
        if (selfUserResponse.ok) {
            const updatedUser = selfUserResult.data.user;
            localStorage.setItem('user', JSON.stringify(updatedUser));
            updateUIWithUserData(updatedUser); // ✅ تحديث الواجهة بالكامل
            
            // (اختياري) إذا كانت نافذة الملف الشخصي مفتوحة، أعد رسمها
            const modal = document.getElementById('mini-profile-modal');
            const userIdInModal = modal?.dataset.userId;
            if (modal && userIdInModal) {
                showMiniProfileModal(userIdInModal);
            }
        }
    } catch (error) {
        console.error('Failed to refetch user data after friendship update:', error);
    }
});

// --- ✅ أضف هذا الكود لربط الأيقونات الجديدة ---
// --- ✅ ربط بطاقة الأصدقاء ---
document.getElementById('friends-card').addEventListener('click', (e) => {
    // منع الفتح عند النقر على العناصر الداخلية
    if (!e.target.closest('#friends-avatars')) {
        showFriendsListModal();
    }
});
document.getElementById('friend-requests-nav-item').addEventListener('click', (e) => {
    e.preventDefault(); // منع السلوك الافتراضي للرابط
    showFriendRequestsModal();
});


// دالة لعرض نافذة طلبات الصداقة
async function showFriendRequestsModal() {
    const modalId = 'friend-requests-modal';
    const localUser = JSON.parse(localStorage.getItem('user')) || {};

    const renderList = (list) => {
        if (!list || list.length === 0) return '<p class="text-gray-400">لا توجد طلبات حاليًا.</p>';
        return list.map(sender => `
            <div class="flex items-center justify-between p-2 rounded-lg hover:bg-gray-700/50">
                <div class="flex items-center gap-3">
                    <img src="${sender.profileImage}" data-user-id="${sender._id}" class="w-10 h-10 rounded-full cursor-pointer user-image">
                    <span>${sender.username}</span>
                </div>
                <div class="flex gap-2">
                    <button class="friend-action-btn bg-blue-600 hover:bg-blue-700 text-white text-xs py-1 px-3 rounded-full" data-action="accept-request" data-user-id="${sender._id}">قبول</button>
                    <button class="friend-action-btn bg-gray-600 hover:bg-gray-700 text-white text-xs py-1 px-3 rounded-full" data-action="reject-request" data-user-id="${sender._id}">رفض</button>
                </div>
            </div>
        `).join('');
    };

    // ✅ عرض فوري من البيانات المحفوظة محلياً — استجابة لحظية بدون أي انتظار
    const html = `
        <div id="${modalId}" class="modal-backdrop fixed inset-0 bg-black/70 flex items-center justify-center z-[250] p-4">
            <div class="modal-content bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md text-white p-6">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-lg font-bold">طلبات الصداقة</h3>
                    <button class="text-gray-400 hover:text-white p-1" onclick="document.getElementById('${modalId}')?.remove()"><i class="fas fa-times"></i></button>
                </div>
                <div class="space-y-2 max-h-80 overflow-y-auto pr-2">${renderList(localUser.friendRequestsReceived)}</div>
            </div>
        </div>
    `;
    document.getElementById('game-container').insertAdjacentHTML('beforeend', html);

    // ✅ تحديث صامت بالخلفية (لا يُظهر أي مؤشر تحميل، فقط يستبدل القائمة إن تغيّرت)
    try {
        const response = await fetch('/api/users/me/details', { headers: { 'Authorization': `Bearer ${token}` } });
        const result = await response.json();
        if (response.ok) {
            const modalElement = document.getElementById(modalId);
            if (modalElement) modalElement.querySelector('.space-y-2').innerHTML = renderList(result.data.user.friendRequestsReceived);
        }
    } catch (error) { /* العرض المحلي كافٍ عند فشل الشبكة */ }
}


// --- ✅ استبدل دالة showFriendsListModal بهذه النسخة النظيفة ---
async function showFriendsListModal() {
    const modalId = 'friends-list-modal';
    // --- ❌ تم حذف onclick من هنا ---
    const loadingHTML = `
        <div id="${modalId}" class="modal-backdrop fixed inset-0 bg-black/70 flex items-center justify-center z-[250] p-4">
            <div class="modal-content bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md text-white p-6">
                <h3 class="text-lg font-bold mb-4">قائمة الأصدقاء</h3>
                <div class="text-center p-6"><i class="fas fa-spinner fa-spin text-3xl"></i></div>
            </div>
        </div>
    `;
    // ... (باقي الكود يبقى كما هو)
        document.getElementById('game-container').insertAdjacentHTML('beforeend', loadingHTML);

    try {
        const response = await fetch('/api/users/me/details', { headers: { 'Authorization': `Bearer ${token}` } });
        const result = await response.json();
        if (!response.ok) throw new Error('Failed to load friends');

        const friends = result.data.user.friends;
        let contentHTML = '<p class="text-gray-400">ليس لديك أصدقاء بعد.</p>';

        if (friends && friends.length > 0) {
            contentHTML = friends.map(friend => `
                <div class="flex items-center justify-between p-2 rounded-lg hover:bg-gray-700/50">
                    <div class="flex items-center gap-3">
                        <img src="${friend.profileImage}" data-user-id="${friend._id}" class="w-10 h-10 rounded-full cursor-pointer user-image">
                        <span>${friend.username}</span>
                    </div>
                    <button class="friend-action-btn bg-red-600 hover:bg-red-700 text-white text-xs py-1 px-3 rounded-full" data-action="remove-friend" data-user-id="${friend._id}">حذف</button>
                </div>
            `).join('');
        }

        const modalElement = document.getElementById(modalId);
        if (modalElement) {
            modalElement.querySelector('.modal-content').innerHTML = `
                <h3 class="text-lg font-bold mb-4">قائمة الأصدقاء</h3>
                <div class="space-y-2 max-h-80 overflow-y-auto pr-2">${contentHTML}</div>
            `;
        }

    } catch (error) {
        const modalElement = document.getElementById(modalId);
        if (modalElement) modalElement.querySelector('.modal-content').innerHTML = '<p class="text-red-400">فشل تحميل الأصدقاء.</p>';
    }
}

// --- ✅ دالة تحديث صور الأصدقاء المصغرة ---
async function updateFriendsAvatars(friendsList) {
    const friendsAvatars = document.getElementById('friends-avatars');
    if (!friendsAvatars) return;
    
    friendsAvatars.innerHTML = '';
    
    if (!friendsList || friendsList.length === 0) {
        friendsAvatars.innerHTML = '<p class="text-xs text-gray-500">لا توجد أصدقاء بعد</p>';
        return;
    }
    
    // عرض أول 5 أصدقاء فقط
    const displayFriends = friendsList.slice(0, 5);
    
    displayFriends.forEach(friend => {
        const avatar = document.createElement('div');
        avatar.className = 'relative';
        avatar.title = friend.username;
        
        avatar.innerHTML = `
            <img src="${friend.profileImage}" 
                 alt="${friend.username}"
                 class="w-10 h-10 rounded-full border-2 border-gray-600 hover:border-purple-500 cursor-pointer transition-all"
                 data-user-id="${friend._id}">
        `;
        
        friendsAvatars.appendChild(avatar);
    });
    
    // إذا كان هناك أكثر من 5 أصدقاء
    if (friendsList.length > 5) {
        const moreCount = document.createElement('div');
        moreCount.className = 'w-10 h-10 rounded-full bg-gray-700 border-2 border-gray-600 flex items-center justify-center text-xs font-bold';
        moreCount.textContent = `+${friendsList.length - 5}`;
        moreCount.title = `${friendsList.length - 5} صديق إضافي`;
        
        friendsAvatars.appendChild(moreCount);
    }
}

        
       // =================================================
    // ======== قسم التحديات (Battles Section) =========
    // =================================================

    // ✅ الإصلاح الجذري: تم حذف "const battlesContainer = ..." من هنا لأنه كان يُنفَّذ
    // عند تحميل الصفحة، وفي تلك اللحظة #battle-rooms-container غير موجود بالـ DOM إطلاقاً
    // (يُنشأ فقط لاحقاً داخل showChallengesView() عند فتح تبويب التحديات). هذا كان يجعل
    // المتغير null للأبد، وأي استخدام له كان يرمي خطأ متزامن يوقف كل الكود بعده في نفس
    // الدالة (نافذة اللعبة، تحديث كلمة المرور، تعديل الحالة، مميزات المستوى...).
    // الحل: نجلب العنصر بشكل حي (fresh) في كل استدعاء، ونستخدم تفويض الأحداث عبر
    // mainContent المستقر (لا يُعاد إنشاؤه أبداً) بدل عنصر يتغير محتواه باستمرار.

    function displayBattleCard(battle) {
        const container = document.getElementById('battle-rooms-container');
        if (!container) return; // المستخدم غادر قسم التحديات قبل وصول الرد
        const card = document.createElement('div');
        card.className = 'battle-card bg-gray-700/50 p-3 rounded-lg flex justify-between items-center';
        card.dataset.battleId = battle._id;
        card.dataset.isPrivate = battle.isPrivate;

        const maxPlayers = battle.type === '1v1' ? 2 : battle.type === '2v2' ? 4 : 8;
        const privateIcon = battle.isPrivate ? '<i class="fas fa-lock text-yellow-400 ml-2"></i>' : '';

        card.innerHTML = `
            <div class="flex items-center gap-3">
                <span class="font-bold text-purple-300">${battle.type}</span>
                ${privateIcon}
                <div class="flex items-center gap-1 text-yellow-400"><i class="fas fa-coins"></i><span>${battle.betAmount}</span></div>
                <div class="flex -space-x-2">${battle.players.map(p => `<img src="${p.profileImage}" alt="${p.username}" class="w-8 h-8 rounded-full border-2 border-gray-600">`).join('')}</div>
            </div>
            <div class="flex items-center gap-3">
                <span class="text-sm text-gray-400">${battle.players.length} / ${maxPlayers}</span>
                <button class="join-battle-btn bg-green-600 hover:bg-green-700 text-white text-xs font-bold py-1 px-3 rounded-full">انضم</button>
            </div>
        `;
        container.appendChild(card);
    }

    async function loadAvailableBattles() {
        const loadingState = document.getElementById('battles-loading-state');
        const emptyState = document.getElementById('battles-empty-state');
        const container = document.getElementById('battle-rooms-container');
        if (!loadingState || !emptyState || !container) return; // القسم غير مفتوح حالياً

        loadingState.classList.remove('hidden');
        emptyState.classList.add('hidden');
        container.querySelectorAll('.battle-card').forEach(card => card.remove());

        try {
            const response = await fetch('/api/battles', { headers: { 'Authorization': `Bearer ${token}` } });
            const result = await response.json();
            loadingState.classList.add('hidden');
            if (response.ok && result.status === 'success') {
                if (result.data.battles.length === 0) {
                    emptyState.classList.remove('hidden');
                } else {
                    result.data.battles.forEach(displayBattleCard);
                }
            } else {
                showNotification('فشل تحميل التحديات', 'error');
                emptyState.classList.remove('hidden');
            }
        } catch (error) {
            console.error('Failed to load battles:', error);
            loadingState.classList.add('hidden');
            emptyState.classList.remove('hidden');
        }
    }

    // ✅ تفويض أحداث "انضم" عبر mainContent المستقر بدل battlesContainer الذي كان null دائماً
    mainContent.addEventListener('click', async (e) => {
        const joinBtn = e.target.closest('.join-battle-btn');
        if (!joinBtn) return;

        const battleCard = joinBtn.closest('.battle-card');
        if (!battleCard) return;
        const battleId = battleCard.dataset.battleId;
        const isPrivate = battleCard.dataset.isPrivate === 'true';

        joinBtn.disabled = true;
        joinBtn.textContent = 'جاري...';

        let password = null;
        if (isPrivate) {
            password = prompt("هذا التحدي خاص، يرجى إدخال كلمة المرور:");
            if (password === null) {
                joinBtn.disabled = false;
                joinBtn.textContent = 'انضم';
                return;
            }
        }

        try {
            const response = await fetch(`/api/battles/${battleId}/join`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ password: password })
            });
            const result = await response.json();
            if (!response.ok) {
                alert(result.message || 'فشل الانضمام');
                joinBtn.disabled = false;
                joinBtn.textContent = 'انضم';
            }
        } catch (error) {
            alert('خطأ في الاتصال بالخادم');
            joinBtn.disabled = false;
            joinBtn.textContent = 'انضم';
        }
    });

    // --- استبدل دالة showCreateBattleModal بالكامل بهذه النسخة ---

function showCreateBattleModal() {
    const modal = document.createElement('div');
    modal.id = 'create-battle-modal';
    modal.className = 'fixed inset-0 bg-black/60 flex items-center justify-center z-50';
    
    const modalHTML = `
        <div class="bg-gray-200 dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-sm text-gray-800 dark:text-white transition-colors duration-300">
            <h3 class="text-lg font-bold mb-4">إنشاء تحدي جديد</h3>
            <form id="create-battle-form" class="space-y-4">
                <div>
                    <label class="text-sm">نوع التحدي</label>
                    <select name="type" class="w-full bg-gray-300 dark:bg-gray-700 border border-gray-400 dark:border-gray-600 rounded-lg p-2 mt-1 transition-colors duration-300">
                        <option value="1v1">1 ضد 1</option>
                        <option value="2v2">2 ضد 2</option>
                        <option value="4v4">4 ضد 4</option>
                    </select>
                </div>
                <div>
                    <label class="text-sm">مبلغ الرهان ($)</label>
                    <input type="number" name="betAmount" value="1" min="1" class="w-full bg-gray-300 dark:bg-gray-700 border border-gray-400 dark:border-gray-600 rounded-lg p-2 mt-1 transition-colors duration-300">
                </div>
                <div class="flex items-center">
                    <input type="checkbox" id="isPrivate" name="isPrivate" class="w-4 h-4 rounded">
                    <label for="isPrivate" class="mr-2 text-sm">تحدي خاص</label>
                </div>
                <div id="password-field" class="hidden">
                    <label class="text-sm">كلمة المرور</label>
                    <input type="password" name="password" class="w-full bg-gray-300 dark:bg-gray-700 border border-gray-400 dark:border-gray-600 rounded-lg p-2 mt-1 transition-colors duration-300">
                </div>
                <div class="flex justify-end gap-3 pt-4">
                    <button type="button" id="cancel-create-battle" class="bg-gray-500 hover:bg-gray-600 text-white py-2 px-4 rounded-lg">إلغاء</button>
                    <button type="submit" class="bg-purple-600 hover:bg-purple-700 text-white py-2 px-4 rounded-lg">تأكيد</button>
                </div>
            </form>
        </div>
    `;
    
    modal.innerHTML = modalHTML;
    document.body.appendChild(modal);

    // --- ✅✅ الإصلاح هنا: الكود المحدث لربط الأحداث ---
    // ربط الأحداث بعد إضافة النافذة إلى DOM
    const cancelButton = modal.querySelector('#cancel-create-battle');
    const battleForm = modal.querySelector('#create-battle-form');
    const privateCheckbox = modal.querySelector('#isPrivate');

    if (cancelButton) {
        cancelButton.addEventListener('click', () => modal.remove());
    }
    
    // إغلاق النافذة عند النقر على الخلفية
    modal.addEventListener('click', (e) => {
        if (e.target.id === 'create-battle-modal') {
            modal.remove();
        }
    });

    if (privateCheckbox) {
        privateCheckbox.addEventListener('change', (e) => {
            modal.querySelector('#password-field').classList.toggle('hidden', !e.target.checked);
        });
    }

        if (battleForm) {
        battleForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const data = Object.fromEntries(formData.entries());
            
            data.betAmount = parseFloat(data.betAmount);
            data.isPrivate = data.isPrivate === 'on';

            if (!data.type || !data.betAmount || data.betAmount <= 0) {
                showNotification('يرجى إدخال مبلغ رهان صالح.', 'error');
                return;
            }
            if (data.isPrivate && !data.password) {
                showNotification('يرجى إدخال كلمة مرور للتحدي الخاص.', 'error');
                return;
            }

            // ✅ نمط التحميل الموحّد: تعطيل الزر + دوّارة بدل النص أثناء الطلب
            const submitBtn = battleForm.querySelector('button[type="submit"]');
            const originalBtnHTML = submitBtn.innerHTML;
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

            try {
                const response = await fetch('/api/battles', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify(data)
                });
                const result = await response.json();

                if (response.ok && result.status === 'success') {
                    showNotification('تم إنشاء التحدي بنجاح!', 'success');
                    modal.remove();
                } else {
                    showNotification(result.message || 'فشل إنشاء التحدي', 'error');
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = originalBtnHTML;
                }
            } catch (error) {
                showNotification('خطأ في الاتصال بالخادم', 'error');
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalBtnHTML;
            }
        });
    }
}

        // ✅ تم حذف السطر المكرر لربط زر "create-battle-btn" من هنا — كان يُنفَّذ عند تحميل
    // الصفحة والزر غير موجود بعد بالـ DOM (يُنشأ فقط داخل showChallengesView)، فكان يرمي
    // خطأ متزامن يوقف كل الكود التالي. الربط الصحيح موجود أصلاً داخل showChallengesView().

    socket.on('newBattle', (battle) => {
        const emptyState = document.getElementById('battles-empty-state');
        if (emptyState) emptyState.classList.add('hidden');
        displayBattleCard(battle);
    });

    socket.on('battleUpdate', (updatedBattle) => {
        const cardToUpdate = document.querySelector(`.battle-card[data-battle-id="${updatedBattle._id}"]`);
        if (cardToUpdate) cardToUpdate.remove();
        if (updatedBattle.status === 'waiting') {
            displayBattleCard(updatedBattle);
        }
        const container = document.getElementById('battle-rooms-container');
        const emptyState = document.getElementById('battles-empty-state');
        if (container && emptyState && container.querySelectorAll('.battle-card').length === 0) {
            emptyState.classList.remove('hidden');
        }
    });

    // =================================================
    // =========== قسم اللعبة (Game Section) ===========
    // =================================================

    function showGameWindow() {
        const gameContainer = document.getElementById('game-container');
        if (!gameContainer) return;
        // --- استبدل متغير modalHTML داخل دالة showGameWindow بهذا ---
const modalHTML = `
    <div id="game-modal" class="fixed inset-0 bg-black/80 flex items-center justify-center z-[200] p-4">
        <div class="bg-gray-800 border-2 border-purple-500 rounded-2xl shadow-2xl p-4 sm:p-6 w-full max-w-2xl text-white text-center">
            <h2 class="text-xl sm:text-2xl font-bold mb-4">لعبة النقرات الأسرع!</h2>
            <div id="game-status" class="mb-4 sm:mb-6 h-20 sm:h-24 flex items-center justify-center">
                <p class="text-2xl">استعد...</p>
            </div>
            <div class="grid grid-cols-2 gap-2 sm:gap-6 items-center">
                <!-- اللاعب الحالي -->
                <div class="flex flex-col items-center">
                    <p class="text-base sm:text-xl font-bold mb-2">${user.username} (أنت)</p>
                    
                    <!-- ✅ الإصلاح: أزرار متجاوبة -->
                    <button id="click-btn" class="w-32 h-32 sm:w-48 sm:h-48 bg-purple-600 rounded-full text-4xl sm:text-5xl font-bold shadow-lg transform transition hover:scale-105 active:scale-95 focus:outline-none">
                        انقر!
                    </button>
                    
                    <p class="mt-2 sm:mt-4 text-2xl sm:text-3xl">النقاط: <span id="my-score">0</span></p>
                </div>
                <!-- الخصم -->
                <div class="flex flex-col items-center">
                    <p class="text-base sm:text-xl font-bold mb-2">الخصم</p>
                    
                    <!-- ✅ الإصلاح: أزرار متجاوبة -->
                    <div class="w-32 h-32 sm:w-48 sm:h-48 bg-gray-700 rounded-full flex items-center justify-center">
                        <i class="fas fa-user-secret text-5xl sm:text-6xl text-gray-500"></i>
                    </div>
                    
                    <p class="mt-2 sm:mt-4 text-2xl sm:text-3xl">النقاط: <span id="opponent-score">0</span></p>
                </div>
            </div>
        </div>
    </div>
`;

        gameContainer.innerHTML = modalHTML;
        const clickBtn = document.getElementById('click-btn');
        if (clickBtn) {
            clickBtn.addEventListener('click', () => {
                const gameModal = document.getElementById('game-modal');
                const battleId = gameModal.dataset.battleId;
                if (battleId) socket.emit('playerClick', { battleId });
            });
        }
    }

    function updateGameState(gameState) {
        const gameModal = document.getElementById('game-modal');
        if (!gameModal || !gameState || typeof gameState.scores === 'undefined') return;
        const scores = gameState.scores;
        const myScore = scores[user._id] || 0;
        const playerIds = Object.keys(scores);
        const opponentId = playerIds.find(id => id !== user._id);
        const opponentScore = opponentId ? (scores[opponentId] || 0) : 0;
        gameModal.querySelector('#my-score').textContent = myScore;
        gameModal.querySelector('#opponent-score').textContent = opponentScore;
    }

    socket.on('battleCountdown', ({ countdown, battleId }) => {
        let gameModal = document.getElementById('game-modal');
        if (!gameModal) {
            showGameWindow();
            gameModal = document.getElementById('game-modal');
            gameModal.dataset.battleId = battleId;
        }
        const statusDiv = gameModal.querySelector('#game-status');
        if (statusDiv) statusDiv.innerHTML = `<p class="text-6xl font-bold animate-ping">${countdown}</p>`;
    });

    socket.on('gameStarted', ({ gameState }) => {
        const gameModal = document.getElementById('game-modal');
        if (!gameModal) return;
        const statusDiv = gameModal.querySelector('#game-status');
        statusDiv.innerHTML = `<p class="text-6xl font-bold text-green-400">انطلق!</p>`;
        let timer = gameState.timer;
        const timerInterval = setInterval(() => {
            const statusDiv = gameModal.querySelector('#game-status');
            if (statusDiv) statusDiv.innerHTML = `<div class="text-5xl font-mono">${timer}</div>`;
            timer--;
            if (timer < 0) {
                clearInterval(timerInterval);
                const clickBtn = document.getElementById('click-btn');
                if (clickBtn) clickBtn.disabled = true;
            }
        }, 1000);
        updateGameState(gameState);
    });

    socket.on('gameStateUpdate', (gameState) => {
        updateGameState(gameState);
    });

    socket.on('gameEnded', ({ battle, winnerId }) => {
        const gameModal = document.getElementById('game-modal');
        if (!gameModal) return;
        const statusDiv = gameModal.querySelector('#game-status');
        let message = '';
        if (!winnerId) {
            message = '<p class="text-4xl font-bold text-yellow-400">تعادل!</p>';
        } else if (winnerId === user._id) {
            message = '<p class="text-4xl font-bold text-green-400">لقد فزت!</p>';
        } else {
            message = '<p class="text-4xl font-bold text-red-400">لقد خسرت!</p>';
        }
        if (statusDiv) statusDiv.innerHTML = message;
        setTimeout(() => {
            const modal = document.getElementById('game-modal');
            if (modal) modal.remove();
        }, 5000);
    });

    // --- أضف هذه الدالة الجديدة ---
function showReplyBar(message) {
    replyingToMessage = message;
    let replyBar = document.getElementById('reply-bar');
    if (!replyBar) {
        replyBar = document.createElement('div');
        replyBar.id = 'reply-bar';
        replyBar.className = 'p-2 bg-gray-600 rounded-t-lg text-sm flex justify-between items-center';
    }
    // ✅ يدعم كلا الوضعين: نافذة الهاتف السفلية أو شريط الدردشة بسطح المكتب
    const mobileModal = document.getElementById('mobile-public-chat-modal');
    const targetContainer = mobileModal
        ? mobileModal.querySelector('.p-3.border-t')
        : document.querySelector('.chat-input-container');
    if (targetContainer && targetContainer.parentNode) {
        targetContainer.parentNode.insertBefore(replyBar, targetContainer);
    }
    replyBar.innerHTML = `
        <span>الرد على <strong>${message.sender.username}</strong></span>
        <button id="cancel-reply" class="text-red-400 hover:text-red-600">&times;</button>
    `;
    document.getElementById('cancel-reply').addEventListener('click', () => {
        replyingToMessage = null;
        replyBar.remove();
    });
}


  // --- أضف هذه الدالة الجديدة في نهاية app.js ---
async function handlePasswordUpdate(e) {
    e.preventDefault();
    const currentPassword = document.getElementById('current-password').value;
    const newPassword = document.getElementById('new-password').value;
    const newPasswordConfirm = document.getElementById('new-password-confirm').value;

    if (newPassword.length < 6) {
        showNotification('كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل.', 'error');
        return;
    }
    if (newPassword !== newPasswordConfirm) {
        showNotification('كلمتا المرور الجديدتان غير متطابقتين.', 'error');
        return;
    }

    const updateBtn = e.target.querySelector('button[type="submit"]');
    updateBtn.disabled = true;
    updateBtn.textContent = 'جاري التحديث...';

    try {
        const response = await fetch('/api/auth/updateMyPassword', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ currentPassword, newPassword, newPasswordConfirm })
        });
        const result = await response.json();
        if (response.ok) {
            showNotification('تم تغيير كلمة المرور بنجاح!', 'success');
            // تحديث التوكن المحلي بالتوكن الجديد
            localStorage.setItem('token', result.token);
            e.target.reset(); // تفريغ الحقول
        } else {
            showNotification(result.message || 'فشل تحديث كلمة المرور', 'error');
        }
    } catch (error) {
        showNotification('خطأ في الاتصال بالخادم', 'error');
    } finally {
        updateBtn.disabled = false;
        updateBtn.textContent = 'تحديث كلمة المرور';
    }
}

// --- ✅ دالة جديدة: تحديث الحالة النصية ---
async function updateUserStatus(newStatus) {
    try {
        const response = await fetch('/api/users/updateStatus', {
            method: 'PATCH',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ status: newStatus })
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showNotification('تم تحديث حالتك بنجاح!', 'success');
            
            // تحديث localStorage
            const localUser = JSON.parse(localStorage.getItem('user'));
            localUser.status = newStatus;
            localStorage.setItem('user', JSON.stringify(localUser));
            
            // تحديث الواجهة
            document.getElementById('user-status-text').textContent = newStatus;
            
            
            return true;
        } else {
            showNotification(result.message || 'فشل تحديث الحالة', 'error');
            return false;
        }
        
    } catch (error) {
        showNotification('خطأ في الاتصال بالخادم', 'error');
        return false;
    }
}
        
// --- ✅ ربط أيقونة تعديل الحالة ---
document.getElementById('edit-status-btn').addEventListener('click', () => {
    showStatusEditModal();
});
// --- ✅ ربط زر عرض مميزات المستوى ---
document.getElementById('show-level-perks').addEventListener('click', showLevelPerksModal);
        
// --- ✅ دالة عرض نافذة تعديل الحالة ---
function showStatusEditModal() {
    const currentStatus = document.getElementById('user-status-text').textContent;
    
    const modalHTML = `
        <div id="status-edit-modal" class="fixed inset-0 bg-black/70 flex items-center justify-center z-[250] p-4">
            <div class="bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm text-white p-6">
                <h3 class="text-lg font-bold mb-4">✏️ تعديل حالتك</h3>
                <textarea id="status-input" class="w-full bg-gray-700 border border-gray-600 rounded-lg p-3 text-sm" 
                          rows="3" maxlength="100" placeholder="اكتب حالتك هنا...">${currentStatus}</textarea>
                <div class="flex justify-between items-center mt-2 text-xs text-gray-400">
                    <span id="status-char-count">${currentStatus.length}/100</span>
                    <span>يمكنك استخدام إيموجي 🚀</span>
                </div>
                <div class="flex justify-end gap-3 mt-6">
                    <button id="cancel-status-edit" class="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded-lg">إلغاء</button>
                    <button id="save-status" class="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-lg">حفظ</button>
                </div>
            </div>
        </div>
    `;
    
        document.getElementById('game-container').insertAdjacentHTML('beforeend', modalHTML);
    
    const modal = document.getElementById('status-edit-modal');
    const statusInput = document.getElementById('status-input');
    const charCount = document.getElementById('status-char-count');
    
    // تحديث عداد الأحرف
    statusInput.addEventListener('input', () => {
        charCount.textContent = `${statusInput.value.length}/100`;
    });
    
    // حفظ الحالة
    document.getElementById('save-status').addEventListener('click', async () => {
        const newStatus = statusInput.value.trim();
        if (newStatus && newStatus.length <= 100) {
            const success = await updateUserStatus(newStatus);
            if (success) {
                modal.remove();
            }
        } else {
            showNotification('الحالة يجب أن تكون بين 1 و100 حرف', 'error');
        }
    });
    
    // إلغاء
    document.getElementById('cancel-status-edit').addEventListener('click', () => {
        modal.remove();
    });
    
    // إغلاق بالنقر على الخلفية
    modal.addEventListener('click', (e) => {
        if (e.target.id === 'status-edit-modal') {
            modal.remove();
        }
    });
}



// --- ✅ دالة عرض مميزات المستوى التالي ---
function showLevelPerksModal() {
    const currentLevel = parseInt(document.getElementById('userLevel').textContent);
    const nextLevel = currentLevel + 1;
    
    const perksByLevel = {
        2: ["🎨 لون اسم مميز في الدردشة", "💬 5 رسائل يومية إضافية"],
        3: ["🖼️ إطارات خاصة للصورة الشخصية", "🎁 هدية 50 عملة"],
        5: ["👑 لقب 'محارب'", "⭐ دخول غرف خاصة"],
        10: ["🏆 لقب 'بطل'", "🚀 سرعة تحميل أسرع", "🎯 مكافأة 500 XP"],
    };
    
    const currentPerks = perksByLevel[currentLevel] || ["🚀 بداية رحلة التحديات!"];
    const nextPerks = perksByLevel[nextLevel] || ["🔜 مزايا قادمة..."];
    
    const modalHTML = `
        <div id="level-perks-modal" class="fixed inset-0 bg-black/70 flex items-center justify-center z-[250] p-4">
            <div class="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl shadow-2xl w-full max-w-md text-white p-6 border-2 border-yellow-500/30">
                <div class="text-center mb-6">
                    <div class="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-r from-yellow-500 to-orange-500 rounded-full mb-4">
                        <i class="fas fa-trophy text-2xl"></i>
                    </div>
                    <h3 class="text-xl font-bold">مميزات المستوى</h3>
                    <p class="text-gray-400 text-sm">المستوى الحالي: <span class="text-yellow-400 font-bold">${currentLevel}</span></p>
                </div>
                
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <!-- المستوى الحالي -->
                    <div class="bg-gray-800/50 p-4 rounded-xl">
                        <h4 class="font-bold text-green-400 mb-3 flex items-center gap-2">
                            <i class="fas fa-check-circle"></i> مميزاتك الحالية
                        </h4>
                        <ul class="space-y-2 text-sm">
                            ${currentPerks.map(perk => `<li class="flex items-start gap-2"><i class="fas fa-star text-yellow-400 mt-1"></i> ${perk}</li>`).join('')}
                        </ul>
                    </div>
                    
                    <!-- المستوى التالي -->
                    <div class="bg-gray-800/50 p-4 rounded-xl border border-yellow-500/30">
                        <h4 class="font-bold text-yellow-400 mb-3 flex items-center gap-2">
                            <i class="fas fa-arrow-up"></i> المستوى ${nextLevel} القادم
                        </h4>
                        <ul class="space-y-2 text-sm">
                            ${nextPerks.map(perk => `<li class="flex items-start gap-2"><i class="fas fa-gift text-purple-400 mt-1"></i> ${perk}</li>`).join('')}
                        </ul>
                        <div class="mt-4 pt-3 border-t border-gray-700">
                            <p class="text-xs text-gray-400">
                                تحتاج <span class="text-yellow-400 font-bold">${calculateRequiredXp(currentLevel) - parseInt(document.getElementById('currentXP').textContent)}</span> XP إضافية
                            </p>
                        </div>
                    </div>
                </div>
                
                <div class="mt-6 pt-4 border-t border-gray-700">
                    <div class="flex justify-between text-sm">
                        <span class="text-gray-400">تقدمك الحالي:</span>
                        <span class="font-bold">${document.getElementById('currentXP').textContent} / ${document.getElementById('requiredXP').textContent} XP</span>
                    </div>
                    <div class="w-full bg-gray-700 rounded-full h-2 mt-2">
                        <div class="bg-gradient-to-r from-yellow-400 to-orange-500 h-2 rounded-full" 
                             style="width: ${(parseInt(document.getElementById('currentXP').textContent) / parseInt(document.getElementById('requiredXP').textContent) * 100)}%"></div>
                    </div>
                </div>
                
                <div class="flex justify-center mt-6">
                    <button id="close-perks-modal" class="bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-6 rounded-lg transition">
                        إغلاق
                    </button>
                </div>
            </div>
        </div>
    `;
    
        document.getElementById('game-container').insertAdjacentHTML('beforeend', modalHTML);
    
    const modal = document.getElementById('level-perks-modal');
    
    // إغلاق النافذة
    document.getElementById('close-perks-modal').addEventListener('click', () => {
        modal.remove();
    });
    
    modal.addEventListener('click', (e) => {
        if (e.target.id === 'level-perks-modal') {
            modal.remove();
        }
    });
}

// --- ✅ ربط شريط XP لعرض المميزات ---
document.querySelector('.mt-4').addEventListener('click', showLevelPerksModal);
        

}); // نهاية document.addEventListener
