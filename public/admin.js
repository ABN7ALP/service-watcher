// أضف هذا الكود في ملف public/admin.js
document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '/'; // إذا لم يكن هناك توكن، أعده للصفحة الرئيسية
        return;
    }

    const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    };

    // --- التنقل بين الأقسام ---
    const navLinks = document.querySelectorAll('.nav-link');
    const contentSections = document.querySelectorAll('.content-section');

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

    // --- جلب البيانات وعرضها ---
    async function fetchData(url) {
        try {
            const response = await fetch(url, { headers });
            if (!response.ok) {
                if (response.status === 403) {
                    alert('الوصول مرفوض. يجب أن تكون مديراً.');
                    window.location.href = '/';
                }
                throw new Error('Network response was not ok');
            }
            return await response.json();
        } catch (error) {
            console.error('Fetch error:', error);
        }
    }

    async function loadDashboardStats() {
        const data = await fetchData('/api/admin/stats');
        if (!data) return;
        document.getElementById('stat-total-users').textContent = data.totalUsers;
        document.getElementById('stat-total-transactions').textContent = data.totalTransactions;
        document.getElementById('stat-pending-transactions').textContent = data.pendingTransactions;
        document.getElementById('stat-total-spins').textContent = data.totalSpins;
        document.getElementById('stat-total-wins').textContent = `$${data.totalWins.toFixed(2)}`;
        document.getElementById('stat-server-profit').textContent = `$${data.serverProfit.toFixed(2)}`;
    }

    async function loadTransactions() {
        const status = document.getElementById('filter-trans-status').value;
        const type = document.getElementById('filter-trans-type').value;
        const data = await fetchData(`/api/admin/transactions?status=${status}&type=${type}`);
        const tbody = document.querySelector('#transactions-table tbody');
        tbody.innerHTML = '';
        if (!data) return;
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
                        <button class="action-btn btn-approve" data-id="${t._id}" data-type="approve-trans"><i class="fas fa-check-circle"></i></button>
                        <button class="action-btn btn-reject" data-id="${t._id}" data-type="reject-trans"><i class="fas fa-times-circle"></i></button>
                    ` : ''}
                    ${t.receiptImage ? `<a href="${t.receiptImage}" target="_blank" class="action-btn"><i class="fas fa-receipt"></i></a>` : ''}
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    async function loadUsers() {
        const search = document.getElementById('user-search').value;
        const data = await fetchData(`/api/admin/users?search=${search}`);
        const tbody = document.querySelector('#users-table tbody');
        tbody.innerHTML = '';
        if (!data) return;
        data.forEach(u => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${u.username}</td>
                <td>${u.email}</td>
                <td>$${u.balance.toFixed(2)}</td>
                <td>${new Date(u.createdAt).toLocaleDateString('ar-EG')}</td>
                <td><span class="status-badge status-${u.isActive ? 'active' : 'inactive'}">${u.isActive ? 'نشط' : 'معطل'}</span></td>
                <td class="actions">
                    <button class="action-btn ${u.isActive ? 'btn-toggle-off' : 'btn-toggle-on'}" data-id="${u._id}" data-status="${u.isActive}" data-type="toggle-user">
                        <i class="fas ${u.isActive ? 'fa-toggle-off' : 'fa-toggle-on'}"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    // --- إدارة الإجراءات والنافذة المنبثقة ---
    const modal = document.getElementById('modal-container');
    let currentAction = null;

    document.querySelector('.main-content').addEventListener('click', (e) => {
        const target = e.target.closest('.action-btn');
        if (!target) return;

        const id = target.dataset.id;
        const type = target.dataset.type;
        
        currentAction = { id, type, status: target.dataset.status };

        const modalTitle = document.getElementById('modal-title');
        const modalBody = document.getElementById('modal-body');
        const extraInput = document.getElementById('modal-extra-input');
        extraInput.innerHTML = '';

        if (type === 'approve-trans') {
            modalTitle.textContent = 'تأكيد الموافقة';
            modalBody.textContent = 'هل أنت متأكد من أنك تريد الموافقة على هذه المعاملة؟';
        } else if (type === 'reject-trans') {
            modalTitle.textContent = 'تأكيد الرفض';
            modalBody.textContent = 'هل أنت متأكد من أنك تريد رفض هذه المعاملة؟';
            extraInput.innerHTML = '<textarea id="admin-note" placeholder="سبب الرفض (اختياري)"></textarea>';
        } else if (type === 'toggle-user') {
            const newStatus = currentAction.status === 'true' ? 'تعطيل' : 'تفعيل';
            modalTitle.textContent = `تأكيد ${newStatus}`;
            modalBody.textContent = `هل أنت متأكد من أنك تريد ${newStatus} هذا المستخدم؟`;
        }
        modal.classList.add('active'); // <-- التصحيح: نستخدم .add('active')
      });

    // زر الإلغاء
document.getElementById('modal-cancel-btn').addEventListener('click', () => {
    modal.classList.remove('active');
    currentAction = null;
});

// زر التأكيد
document.getElementById('modal-confirm-btn').addEventListener('click', async () => {
    if (!currentAction) return;

    const { id, type } = currentAction;
    let url, body, method = 'PUT';

    if (type === 'approve-trans') {
        url = `/api/admin/transactions/${id}/status`;
        body = { status: 'approved' };
    } 
    else if (type === 'reject-trans') {
        url = `/api/admin/transactions/${id}/status`;
        body = { 
            status: 'rejected',
            adminNote: document.getElementById('admin-note')?.value 
        };
    } 
    else if (type === 'toggle-user') {
        url = `/api/admin/users/${id}/status`;
        body = { isActive: !(currentAction.status === 'true') };
    }

    try {
        const response = await fetch(url, {
            method,
            headers,
            body: JSON.stringify(body)
        });

        if (!response.ok) throw new Error('Action failed');

        if (type.includes('trans')) {
            loadTransactions();
            loadDashboardStats();
        } else {
            loadUsers();
        }
    } catch (err) {
        console.error(err);
        alert('فشل تنفيذ الإجراء');
    } finally {
        modal.classList.remove('active');
        currentAction = null;
    }
});

    // --- تحميل البيانات الأولي وربط الفلاتر ---
    loadDashboardStats();
    loadTransactions();
    loadUsers();

    document.getElementById('filter-trans-status').addEventListener('change', loadTransactions);
    document.getElementById('filter-trans-type').addEventListener('change', loadTransactions);
    document.getElementById('user-search').addEventListener('input', loadUsers);
});
