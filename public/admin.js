// المكان: public/admin.js (الكود الكامل والمصحح)

document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('token');
    // التحقق من وجود توكن، وإلا إعادة التوجيه للصفحة الرئيسية
    if (!token) {
        alert('الوصول غير مسموح. يرجى تسجيل الدخول أولاً.');
        window.location.href = '/';
        return;
    }

    // إعداد Headers الافتراضية لكل الطلبات
    const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    };

    // --- عناصر الواجهة الرئيسية ---
    const navLinks = document.querySelectorAll('.nav-link');
    const contentSections = document.querySelectorAll('.content-section');
    const modal = document.getElementById('modal-container');

    // متغير لتخزين معلومات الإجراء الحالي في النافذة المنبثقة
    let currentAction = null;

    // --- دالة مركزية لجلب البيانات من الـ API ---
    async function fetchData(url) {
        try {
            const response = await fetch(url, { headers });
            if (!response.ok) {
                // التعامل مع الأخطاء الشائعة
                if (response.status === 401 || response.status === 403) {
                    alert('جلسة العمل انتهت أو أنك لا تملك صلاحية الوصول. سيتم إعادة توجيهك لصفحة الدخول.');
                    window.location.href = '/';
                }
                throw new Error(`Network response was not ok: ${response.statusText}`);
            }
            return await response.json();
        } catch (error) {
            console.error('Fetch error:', error);
            // يمكنك إضافة إشعار للمستخدم هنا بأن جلب البيانات فشل
        }
    }

    // --- دوال تحميل البيانات لكل قسم ---

    async function loadDashboardStats() {
        const data = await fetchData('/api/admin/stats');
        if (!data) return;
        document.getElementById('stat-total-users').textContent = data.totalUsers;
        document.getElementById('stat-total-transactions').textContent = data.totalTransactions;
        document.getElementById('stat-pending-transactions').textContent = data.pendingTransactions;
        document.getElementById('stat-total-spins').textContent = data.totalSpins;
        document.getElementById('stat-total-wins').textContent = `$${(data.totalWins || 0).toFixed(2)}`;
        document.getElementById('stat-server-profit').textContent = `$${(data.serverProfit || 0).toFixed(2)}`;
    }

    async function loadTransactions() {
        const status = document.getElementById('filter-trans-status').value;
        const type = document.getElementById('filter-trans-type').value;
        const data = await fetchData(`/api/admin/transactions?status=${status}&type=${type}`);
        const tbody = document.querySelector('#transactions-table tbody');
        tbody.innerHTML = ''; // تفريغ الجدول قبل ملئه
        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6">لا توجد معاملات تطابق هذه الفلاتر.</td></tr>';
            return;
        }
        data.forEach(t => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${t.user?.username || 'مستخدم محذوف'}</td>
                <td>${t.type === 'deposit' ? 'شحن' : 'سحب'}</td>
                <td>$${t.amount.toFixed(2)}</td>
                <td><span class="status-badge status-${t.status}">${t.status}</span></td>
                <td>${new Date(t.createdAt).toLocaleString('ar-EG')}</td>
                <td class="actions">
                    ${t.status === 'pending' ? `
                        <button class="action-btn btn-approve" title="موافقة" data-id="${t._id}" data-type="approve-trans"><i class="fas fa-check-circle"></i></button>
                        <button class="action-btn btn-reject" title="رفض" data-id="${t._id}" data-type="reject-trans"><i class="fas fa-times-circle"></i></button>
                    ` : ''}
                    ${t.receiptImage ? `<a href="${t.receiptImage}" target="_blank" title="عرض الإيصال" class="action-btn"><i class="fas fa-receipt"></i></a>` : ''}
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    async function loadUsers() {
        const search = document.getElementById('user-search').value;
        const data = await fetchData(`/api/admin/users?search=${search}`);
        const tbody = document.querySelector('#users-table tbody');
        tbody.innerHTML = ''; // تفريغ الجدول
        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6">لا يوجد مستخدمون يطابقون بحثك.</td></tr>';
            return;
        }
        data.forEach(u => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${u.username}</td>
                <td>${u.email}</td>
                <td>$${u.balance.toFixed(2)}</td>
                <td>${new Date(u.createdAt).toLocaleDateString('ar-EG')}</td>
                <td><span class="status-badge status-${u.isActive ? 'active' : 'inactive'}">${u.isActive ? 'نشط' : 'معطل'}</span></td>
                <td class="actions">
                    <button class="action-btn ${u.isActive ? 'btn-toggle-off' : 'btn-toggle-on'}" title="${u.isActive ? 'تعطيل الحساب' : 'تفعيل الحساب'}" data-id="${u._id}" data-status="${u.isActive}" data-type="toggle-user">
                        <i class="fas ${u.isActive ? 'fa-toggle-off' : 'fa-toggle-on'}"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    // --- منطق النافذة المنبثقة (Modal) ---

    function showModal(type, id, status) {
        currentAction = { id, type, status };

        const modalTitle = document.getElementById('modal-title');
        const modalBody = document.getElementById('modal-body');
        const extraInput = document.getElementById('modal-extra-input');
        extraInput.innerHTML = ''; // تفريغ أي مدخلات سابقة

        if (type === 'approve-trans') {
            modalTitle.textContent = 'تأكيد الموافقة';
            modalBody.textContent = 'هل أنت متأكد من أنك تريد الموافقة على هذه المعاملة؟';
        } else if (type === 'reject-trans') {
            modalTitle.textContent = 'تأكيد الرفض';
            modalBody.textContent = 'هل أنت متأكد من أنك تريد رفض هذه المعاملة؟';
            extraInput.innerHTML = '<textarea id="admin-note" placeholder="سبب الرفض (مهم للمستخدم)"></textarea>';
        } else if (type === 'toggle-user') {
            const newStatus = status === 'true' ? 'تعطيل' : 'تفعيل';
            modalTitle.textContent = `تأكيد ${newStatus}`;
            modalBody.textContent = `هل أنت متأكد من أنك تريد ${newStatus} هذا المستخدم؟`;
        }
        modal.classList.add('active');
    }

    function hideModal() {
        modal.classList.remove('active');
        currentAction = null;
    }

    async function handleConfirmAction() {
        if (!currentAction) return;
        const { id, type } = currentAction;
        let url, body, method = 'PUT';

        if (type === 'approve-trans') {
            url = `/api/admin/transactions/${id}/status`;
            body = { status: 'approved' };
        } else if (type === 'reject-trans') {
            url = `/api/admin/transactions/${id}/status`;
            body = { status: 'rejected', adminNote: document.getElementById('admin-note').value };
        } else if (type === 'toggle-user') {
            url = `/api/admin/users/${id}/status`;
            body = { isActive: !(currentAction.status === 'true') };
        }

        try {
            const response = await fetch(url, { method, headers, body: JSON.stringify(body) });
            if (!response.ok) throw new Error('Action failed');
            
            // إعادة تحميل البيانات في القسم المناسب بعد نجاح الإجراء
            if (type.includes('trans')) {
                await loadTransactions();
                await loadDashboardStats(); // تحديث الإحصائيات التي قد تتأثر
            } else if (type.includes('user')) {
                await loadUsers();
            }
        } catch (error) {
            console.error('Action error:', error);
            alert('فشل تنفيذ الإجراء. يرجى المحاولة مرة أخرى.');
        } finally {
            hideModal();
        }
    }

    // --- إعداد مستمعي الأحداث ---

    // التنقل بين الأقسام
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = link.dataset.target;

            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');

            contentSections.forEach(s => s.classList.remove('active'));
            document.getElementById(targetId).classList.add('active');
        });
    });

    // تفويض الأحداث للأزرار الديناميكية في الجداول
    document.querySelector('.main-content').addEventListener('click', (e) => {
        const target = e.target.closest('.action-btn');
        if (target && target.dataset.id) { // التأكد من أن الزر يحتوي على البيانات اللازمة
            showModal(target.dataset.type, target.dataset.id, target.dataset.status);
        }
    });

    // أزرار النافذة المنبثقة
    document.getElementById('modal-cancel-btn').addEventListener('click', hideModal);
    document.getElementById('modal-confirm-btn').addEventListener('click', handleConfirmAction);

    // الفلاتر والبحث
    document.getElementById('filter-trans-status').addEventListener('change', loadTransactions);
    document.getElementById('filter-trans-type').addEventListener('change', loadTransactions);
    
    // استخدام debounce للبحث لتقليل عدد الطلبات أثناء الكتابة
    let searchTimeout;
    document.getElementById('user-search').addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(loadUsers, 300); // انتظر 300 مللي ثانية بعد توقف المستخدم عن الكتابة
    });

    // --- التحميل الأولي للبيانات ---
    function initializePage() {
        loadDashboardStats();
        loadTransactions();
        loadUsers();
    }

    initializePage();
});
