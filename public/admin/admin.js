// ==================================================================
// Admin Dashboard — نسخة كاملة منظمة
// ==================================================================

const escapeHtml = (str) => {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
};
const formatDate = (d) => new Date(d).toLocaleString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

class AdminDashboard {
    constructor() {
        this.token = localStorage.getItem('token');
        this.adminData = JSON.parse(localStorage.getItem('user') || '{}');
        this.currentPage = 'dashboard';
        this.socket = null;
        this.state = { users: {} };
        this.init();
    }

    async init() {
        if (!this.checkAuth()) { window.location.href = '/login.html'; return; }
        this.setupEventListeners();
        this.loadCurrentPage();
        this.initSocket();
        this.updateAdminInfo();
        this.startAutoRefresh();
    }

    checkAuth() {
        if (!this.token || !this.adminData || !this.adminData.isAdmin) return false;
        try {
            const payload = JSON.parse(atob(this.token.split('.')[1]));
            if (payload.exp * 1000 < Date.now()) { this.logout(); return false; }
            return true;
        } catch { return false; }
    }

    async api(method, path, body) {
        const options = { method, headers: { 'Authorization': `Bearer ${this.token}` } };
        if (body !== undefined) {
            options.headers['Content-Type'] = 'application/json';
            options.body = JSON.stringify(body);
        }
        const response = await fetch(`/api/admin${path}`, options);
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            if (response.status === 401 || response.status === 403) {
                this.showToast('انتهت صلاحية الجلسة، يرجى تسجيل الدخول من جديد', 'error');
                setTimeout(() => this.logout(), 1500);
            }
            throw new Error(data.message || `خطأ (${response.status})`);
        }
        return data;
    }

    // ---------- نظام نوافذ موحّد ----------
    openModal(html) {
        const root = document.getElementById('admin-modal-root');
        const wrapper = document.createElement('div');
        wrapper.innerHTML = html.trim();
        const modalEl = wrapper.firstElementChild;
        root.appendChild(modalEl);
        modalEl.addEventListener('click', (e) => {
            if (e.target === modalEl || e.target.closest('.modal-close') || e.target.closest('[data-dismiss]')) modalEl.remove();
        });
        return modalEl;
    }

    confirmAction(message, onConfirm, danger = true) {
        const modal = this.openModal(`
            <div class="modal-overlay active">
                <div class="modal-content" style="max-width:420px;">
                    <div class="modal-body text-center py-4">
                        <i class="fas fa-exclamation-triangle fa-2x mb-3" style="color:${danger ? '#e74c3c' : '#3498db'}"></i>
                        <p>${escapeHtml(message)}</p>
                        <div class="d-flex gap-2 justify-content-center mt-4">
                            <button class="btn btn-secondary" data-dismiss>إلغاء</button>
                            <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="confirmActionBtn">تأكيد</button>
                        </div>
                    </div>
                </div>
            </div>
        `);
        modal.querySelector('#confirmActionBtn').addEventListener('click', async () => { modal.remove(); await onConfirm(); });
    }

    // ✅ نافذة إدخال نصي أنيقة بدل prompt() الأصلي (غير قابل للتنسيق أصلاً)
    promptModal(title, placeholder, onSubmit, { defaultValue = '', confirmText = 'تأكيد', danger = false } = {}) {
        const modal = this.openModal(`
            <div class="modal-overlay active">
                <div class="modal-content" style="max-width:420px;">
                    <div class="modal-header"><h3>${escapeHtml(title)}</h3><button class="modal-close"><i class="fas fa-times"></i></button></div>
                    <div class="modal-body">
                        <textarea class="form-control" id="promptModalInput" rows="3" placeholder="${escapeHtml(placeholder)}">${escapeHtml(defaultValue)}</textarea>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" data-dismiss>إلغاء</button>
                        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="promptModalConfirm">${escapeHtml(confirmText)}</button>
                    </div>
                </div>
            </div>
        `);
        const input = modal.querySelector('#promptModalInput');
        input.focus();
        modal.querySelector('#promptModalConfirm').addEventListener('click', () => {
            const value = input.value.trim();
            modal.remove();
            onSubmit(value);
        });
    }

    setupEventListeners() {
        document.querySelectorAll('.menu-item').forEach(item => {
            item.addEventListener('click', (e) => { e.preventDefault(); this.switchPage(item.dataset.page); });
        });
        document.querySelector('.btn-logout')?.addEventListener('click', () => this.logout());

        const userSearch = document.getElementById('userSearch');
        if (userSearch) {
            let t;
            userSearch.addEventListener('input', (e) => {
                clearTimeout(t);
                t = setTimeout(() => this.loadUsers(1, e.target.value), 450);
            });
        }

        document.getElementById('depositsStatusFilter')?.addEventListener('change', () => this.loadDeposits(1));
        document.getElementById('coinPurchasesStatusFilter')?.addEventListener('change', () => this.loadCoinPurchases(1));
        document.getElementById('withdrawalStatusFilter')?.addEventListener('change', () => this.loadWithdrawals());
        document.getElementById('battlesStatusFilter')?.addEventListener('change', () => this.loadBattles());
        document.getElementById('reportsStatusFilter')?.addEventListener('change', () => this.loadReports());
                document.getElementById('logsSeverityFilter')?.addEventListener('change', () => this.loadLogs(1));
        document.getElementById('transactionsTypeFilter')?.addEventListener('change', () => this.loadTransactions(1));
        document.getElementById('addGiftBtn')?.addEventListener('click', () => this.showGiftFormModal());

        let txSearchTimer;
        document.getElementById('transactionsSearch')?.addEventListener('input', (e) => {
            clearTimeout(txSearchTimer);
            txSearchTimer = setTimeout(() => this.loadTransactions(1, e.target.value), 450);
        });

        const mobileToggle = document.createElement('button');
        mobileToggle.className = 'mobile-menu-toggle';
        mobileToggle.innerHTML = '<i class="fas fa-bars"></i>';
        document.body.appendChild(mobileToggle);
        mobileToggle.addEventListener('click', () => document.querySelector('.admin-sidebar').classList.toggle('active'));
    }

    switchPage(page) {
        document.querySelectorAll('.menu-item').forEach(i => i.classList.remove('active'));
        document.querySelector(`.menu-item[data-page="${page}"]`)?.classList.add('active');
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        let pageEl = document.getElementById(`${page}-page`);
        if (!pageEl) {
            pageEl = document.getElementById('placeholder-page');
            if (!pageEl) {
                pageEl = document.createElement('div');
                pageEl.id = 'placeholder-page';
                pageEl.className = 'page';
                document.querySelector('.admin-main').appendChild(pageEl);
            }
            pageEl.innerHTML = `<div class="page-header"><h1><i class="fas fa-tools"></i> قيد الإنشاء</h1></div>`;
        }
        pageEl.classList.add('active');
        this.currentPage = page;
        this.loadPageData(page);
        document.querySelector('.admin-sidebar').classList.remove('active');
    }

    loadPageData(page) {
        const map = {
            dashboard: () => this.loadDashboard(),
            users: () => this.loadUsers(),
            deposits: () => this.loadDeposits(1),
            coinpurchases: () => this.loadCoinPurchases(1),
            withdrawals: () => this.loadWithdrawals(),
            transactions: () => this.loadTransactions(1),
            battles: () => this.loadBattles(),
            gifts: () => this.loadGifts(),
            reports: () => this.loadReports(),
            logs: () => this.loadLogs(1),
            settings: () => this.loadSettings()
        };
        map[page]?.();
    }

    renderPagination(containerId, totalPages, currentPage, onClick) {
        const el = document.getElementById(containerId);
        if (!el) return;
        el.innerHTML = '';
        if (!totalPages || totalPages <= 1) return;
        const startPage = Math.max(1, currentPage - 2);
        const endPage = Math.min(totalPages, currentPage + 2);
        const mk = (label, page, disabled, active) => {
            const li = document.createElement('li');
            li.className = `page-item ${disabled ? 'disabled' : ''} ${active ? 'active' : ''}`;
            const a = document.createElement('a');
            a.className = 'page-link'; a.href = '#'; a.innerHTML = label;
            if (!disabled) a.addEventListener('click', (e) => { e.preventDefault(); onClick(page); });
            li.appendChild(a);
            return li;
        };
        el.appendChild(mk('<i class="fas fa-chevron-right"></i>', currentPage - 1, currentPage === 1, false));
        for (let i = startPage; i <= endPage; i++) el.appendChild(mk(i, i, false, i === currentPage));
        el.appendChild(mk('<i class="fas fa-chevron-left"></i>', currentPage + 1, currentPage === totalPages, false));
    }

    // ================= Dashboard =================
    async loadDashboard() {
        try {
            const data = await this.api('GET', '/dashboard');
            const s = data.stats;
            document.getElementById('totalUsers').textContent = s.totalUsers.toLocaleString();
            document.getElementById('totalDeposits').textContent = `$${s.totalDeposits.toLocaleString()}`;
            document.getElementById('pendingDeposits').textContent = s.pendingDeposits;
            document.getElementById('totalWithdrawals').textContent = `$${s.totalWithdrawals.toLocaleString()}`;
            document.getElementById('pendingWithdrawals').textContent = s.pendingWithdrawals;
            document.getElementById('activeBattles').textContent = s.activeBattles;
            document.getElementById('todayTransactions').textContent = s.todayTransactions;
            document.getElementById('lastUpdate').textContent = new Date().toLocaleTimeString('ar-SA');

            this.renderAttentionPanel(s);
            this.renderTopList('topDepositors', data.topUsers.depositors, 'totalDeposited', '$');
            this.renderTopList('topGifters', data.topUsers.gifters, 'totalGifted', ' كوينز');
            this.renderTopList('topWinners', data.topUsers.winners, 'totalWon', '$');
        } catch (error) {
            this.showToast(error.message, 'error');
        }
    }

    renderAttentionPanel(stats) {
        const el = document.getElementById('attention-panel');
        if (!el) return;
        const items = [
            { count: stats.pendingDeposits, label: 'طلب شحن رصيد بانتظار المراجعة', icon: 'fa-file-invoice-dollar', page: 'deposits' },
            { count: stats.pendingCoinPurchases, label: 'طلب شراء كوينز بانتظار المراجعة', icon: 'fa-coins', page: 'coinpurchases' },
            { count: stats.pendingWithdrawals, label: 'طلب سحب بانتظار المراجعة', icon: 'fa-money-bill-wave', page: 'withdrawals' },
            { count: stats.pendingReports, label: 'بلاغ بانتظار المراجعة', icon: 'fa-flag', page: 'reports' }
        ].filter(i => i.count > 0);

        if (items.length === 0) {
            el.innerHTML = `<div class="activity-item success"><div class="activity-icon"><i class="fas fa-check-circle"></i></div><div class="activity-content"><div class="title">لا توجد مهام عاجلة الآن</div><div class="description">كل الطلبات تمت مراجعتها 👏</div></div></div>`;
            return;
        }
        el.innerHTML = `<h5 class="mb-3"><i class="fas fa-bell text-warning"></i> يحتاج انتباهك الآن</h5>` + items.map(i => `
            <div class="activity-item warning" data-goto="${i.page}" style="cursor:pointer;">
                <div class="activity-icon"><i class="fas ${i.icon}"></i></div>
                <div class="activity-content"><div class="title">${i.count} ${i.label}</div></div>
                <i class="fas fa-chevron-left" style="align-self:center;color:#bbb;"></i>
            </div>
        `).join('');
        el.querySelectorAll('[data-goto]').forEach(item => item.addEventListener('click', () => this.switchPage(item.dataset.goto)));
    }

    renderTopList(elId, users, field, suffix) {
        const c = document.getElementById(elId);
        if (!c) return;
        if (!users || users.length === 0) { c.innerHTML = '<div class="empty-state">لا توجد بيانات</div>'; return; }
        c.innerHTML = users.map((u, i) => `
            <div class="top-user-item" data-user-id="${u._id}" style="cursor:pointer;">
                <div class="rank rank-${i + 1}">${i + 1}</div>
                <img src="${u.profileImage || 'https://i.ibb.co/601T5nRV/7d580cf284dbd895ae2db4b598ec8bb2.jpg'}" class="top-user-avatar">
                <div class="top-user-info"><div class="username">${escapeHtml(u.username)}</div>
                <div class="value">${(u[field] || 0).toLocaleString()}${suffix}</div></div>
            </div>
        `).join('');
        c.querySelectorAll('.top-user-item').forEach(item => item.addEventListener('click', () => this.showUserDetails(item.dataset.userId)));
    }

    // ================= Users =================
    async loadUsers(page = 1, search = '') {
        try {
            const data = await this.api('GET', `/users?page=${page}&limit=50&search=${encodeURIComponent(search)}`);
            this.state.users = { page, search };
            const tbody = document.getElementById('usersTableBody');
            if (!data.users || data.users.length === 0) {
                tbody.innerHTML = `<tr><td colspan="9" class="text-center py-5"><div class="empty-state"><i class="fas fa-users fa-2x"></i><p>لا يوجد مستخدمون</p></div></td></tr>`;
                this.renderPagination('usersPagination', 0, 1, () => {});
                return;
            }
            tbody.innerHTML = data.users.map(u => `
                <tr>
                    <td title="اضغط للنسخ" class="copy-id-cell" data-id="${u.customId}">${u.customId || u._id.slice(-6)}</td>
                    <td><img src="${u.profileImage || 'https://i.ibb.co/601T5nRV/7d580cf284dbd895ae2db4b598ec8bb2.jpg'}" class="user-avatar"></td>
                    <td><strong>${escapeHtml(u.username)}</strong> ${u.isAdmin ? '<span class="status-badge status-pending">مدير</span>' : ''} ${u.isAgent ? '<span class="status-badge status-online">وكيل</span>' : ''}</td>
                    <td>${escapeHtml(u.email)}</td>
                    <td><strong>$${(u.balance || 0).toFixed(2)}</strong></td>
                    <td>${(u.coins || 0).toLocaleString()}</td>
                    <td>${u.level || 1}</td>
                    <td><span class="status-badge ${u.isBanned ? 'status-banned' : 'status-online'}">${u.isBanned ? 'محظور' : 'نشط'}</span></td>
                    <td>
                        <button class="btn-action btn-view" title="عرض" data-action="view" data-id="${u._id}"><i class="fas fa-eye"></i></button>
                        <button class="btn-action btn-edit" title="تعديل الرصيد" data-action="funds" data-id="${u._id}"><i class="fas fa-coins"></i></button>
                        <button class="btn-action btn-ban" title="${u.isBanned ? 'إلغاء الحظر' : 'حظر'}" data-action="${u.isBanned ? 'unban' : 'ban'}" data-id="${u._id}" data-username="${escapeHtml(u.username)}"><i class="fas ${u.isBanned ? 'fa-unlock' : 'fa-ban'}"></i></button>
                    </td>
                </tr>
            `).join('');

            tbody.querySelectorAll('button[data-action]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const { action, id, username } = btn.dataset;
                    if (action === 'view') this.showUserDetails(id);
                    if (action === 'funds') this.showAdjustFundsModal(id);
                    if (action === 'ban') this.showBanModal(id, username);
                    if (action === 'unban') this.confirmAction(`هل تريد إلغاء حظر ${username}؟`, () => this.unbanUser(id), false);
                });
            });
            tbody.querySelectorAll('.copy-id-cell').forEach(td => td.addEventListener('click', () => {
                navigator.clipboard.writeText(td.dataset.id).then(() => this.showToast('تم نسخ المعرّف', 'success'));
            }));

            this.renderPagination('usersPagination', data.totalPages, data.currentPage, (p) => this.loadUsers(p, search));
        } catch (error) { this.showToast(error.message, 'error'); }
    }

    async showUserDetails(userId) {
        try {
            const data = await this.api('GET', `/users/${userId}`);
            const { user, transactions, stats } = data;

            const modal = this.openModal(`
                <div class="modal-overlay active">
                    <div class="modal-content" style="max-width:820px;">
                        <div class="modal-header">
                            <h3><i class="fas fa-user"></i> ملف المستخدم</h3>
                            <button class="modal-close"><i class="fas fa-times"></i></button>
                        </div>
                        <div class="modal-body">
                            <div class="d-flex align-items-center gap-3 mb-4" style="border-bottom:1px solid #eee;padding-bottom:16px;">
                                <img src="${user.profileImage}" style="width:85px;height:85px;border-radius:50%;object-fit:cover;border:3px solid var(--admin-primary);">
                                <div style="flex:1;">
                                    <h4 style="margin:0;">${escapeHtml(user.username)}</h4>
                                    <p class="text-muted" style="margin:0;font-size:0.85rem;">${escapeHtml(user.email)} · ID: ${user.customId}</p>
                                    <div class="mt-2">
                                        ${user.isBanned ? `<span class="status-badge status-banned">محظور — ${escapeHtml(user.banReason || '')}</span>` : '<span class="status-badge status-online">نشط</span>'}
                                        ${user.isAdmin ? '<span class="status-badge status-pending">مدير</span>' : ''}
                                        ${user.isAgent ? '<span class="status-badge status-completed">وكيل شحن</span>' : ''}
                                    </div>
                                </div>
                            </div>

                            <div class="stats-grid" style="grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px;">
                                <div class="stat-card success" style="padding:15px;"><div class="stat-info"><h3 style="font-size:1.3rem;">$${(user.balance || 0).toFixed(2)}</h3><p>الرصيد</p></div></div>
                                <div class="stat-card warning" style="padding:15px;"><div class="stat-info"><h3 style="font-size:1.3rem;">${(user.coins || 0).toLocaleString()}</h3><p>الكوينز</p></div></div>
                                <div class="stat-card primary" style="padding:15px;"><div class="stat-info"><h3 style="font-size:1.3rem;">${user.level}</h3><p>المستوى</p></div></div>
                                <div class="stat-card info" style="padding:15px;"><div class="stat-info"><h3 style="font-size:1.3rem;">${stats.winRate.toFixed(0)}%</h3><p>نسبة الفوز (${stats.totalBattles} تحدي)</p></div></div>
                            </div>

                            <h6><i class="fas fa-history"></i> آخر المعاملات</h6>
                            <div class="table-responsive" style="max-height:220px;overflow-y:auto;">
                                <table class="table table-sm">
                                    <thead><tr><th>التاريخ</th><th>النوع</th><th>المبلغ</th><th>الحالة</th></tr></thead>
                                    <tbody>
                                        ${(transactions.slice(0, 10)).map(tx => `
                                            <tr>
                                                <td>${formatDate(tx.createdAt)}</td>
                                                <td>${this.txTypeText(tx.type)}</td>
                                                <td class="${tx.amount < 0 ? 'text-danger' : 'text-success'}">${tx.amount > 0 ? '+' : ''}${tx.amount} ${tx.currency}</td>
                                                <td>${this.statusText(tx.status)}</td>
                                            </tr>
                                        `).join('') || '<tr><td colspan="4" class="text-center text-muted">لا توجد معاملات بعد</td></tr>'}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button class="btn btn-secondary" data-dismiss>إغلاق</button>
                            <button class="btn btn-success" id="fundsBtn"><i class="fas fa-coins"></i> تعديل الرصيد</button>
                            <button class="btn ${user.isAgent ? 'btn-secondary' : 'btn-info text-white'}" id="agentBtn">${user.isAgent ? 'إلغاء صلاحية الوكيل' : 'تعيين كوكيل شحن'}</button>
                            ${!user.isBanned
                                ? `<button class="btn btn-danger" id="banBtn"><i class="fas fa-ban"></i> حظر</button>`
                                : `<button class="btn btn-success" id="unbanBtn"><i class="fas fa-check"></i> إلغاء الحظر</button>`}
                        </div>
                    </div>
                </div>
            `);

            modal.querySelector('#fundsBtn').addEventListener('click', () => { modal.remove(); this.showAdjustFundsModal(userId); });
            modal.querySelector('#agentBtn').addEventListener('click', () => this.toggleAgentStatus(userId, !user.isAgent, modal));
            modal.querySelector('#banBtn')?.addEventListener('click', () => { modal.remove(); this.showBanModal(userId, user.username); });
            modal.querySelector('#unbanBtn')?.addEventListener('click', () => this.confirmAction(`إلغاء حظر ${user.username}؟`, async () => { await this.unbanUser(userId); modal.remove(); }, false));
        } catch (error) { this.showToast(error.message, 'error'); }
    }

    showBanModal(userId, username) {
        const modal = this.openModal(`
            <div class="modal-overlay active">
                <div class="modal-content" style="max-width:450px;">
                    <div class="modal-header"><h3><i class="fas fa-ban"></i> حظر ${escapeHtml(username)}</h3><button class="modal-close"><i class="fas fa-times"></i></button></div>
                    <div class="modal-body">
                        <div class="form-group"><label>سبب الحظر *</label><textarea class="form-control" id="banReasonInput" rows="3" required></textarea></div>
                        <div class="form-group"><label>مدة الحظر (أيام)</label><input type="number" class="form-control" id="banDurationInput" min="1" placeholder="اترك فارغاً للحظر الدائم"></div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" data-dismiss>إلغاء</button>
                        <button class="btn btn-danger" id="confirmBanBtn"><i class="fas fa-ban"></i> تأكيد الحظر</button>
                    </div>
                </div>
            </div>
        `);
        modal.querySelector('#confirmBanBtn').addEventListener('click', async () => {
            const reason = modal.querySelector('#banReasonInput').value.trim();
            const duration = modal.querySelector('#banDurationInput').value;
            if (!reason) { this.showToast('يرجى إدخال سبب الحظر', 'error'); return; }
            try {
                await this.api('POST', `/users/${userId}/ban`, { reason, duration: duration ? parseInt(duration) : null });
                this.showToast('تم حظر المستخدم بنجاح', 'success');
                modal.remove();
                document.getElementById('admin-modal-root').querySelectorAll('.modal-overlay').forEach(m => m.remove());
                this.loadUsers(this.state.users.page || 1, this.state.users.search || '');
            } catch (error) { this.showToast(error.message, 'error'); }
        });
    }

    async unbanUser(userId) {
        try {
            await this.api('POST', `/users/${userId}/unban`);
            this.showToast('تم إلغاء الحظر بنجاح', 'success');
            this.loadUsers(this.state.users.page || 1, this.state.users.search || '');
        } catch (error) { this.showToast(error.message, 'error'); }
    }

    async toggleAgentStatus(userId, makeAgent, parentModal) {
        if (makeAgent) {
            this.promptModal('تعيين كوكيل شحن', 'رقم واتساب الوكيل (مع رمز الدولة)...', async (whatsapp) => {
                if (!whatsapp) return;
                try {
                    await this.api('POST', `/users/${userId}/set-agent`, { isAgent: true, agentWhatsapp: whatsapp });
                    this.showToast('تم تعيين الوكيل', 'success');
                    if (parentModal) parentModal.remove();
                    this.showUserDetails(userId);
                } catch (error) { this.showToast(error.message, 'error'); }
            }, { confirmText: 'تعيين' });
        } else {
            try {
                await this.api('POST', `/users/${userId}/set-agent`, { isAgent: false, agentWhatsapp: null });
                this.showToast('تم إلغاء صلاحية الوكيل', 'success');
                if (parentModal) parentModal.remove();
                this.showUserDetails(userId);
            } catch (error) { this.showToast(error.message, 'error'); }
        }
    }

    showAdjustFundsModal(userId) {
        const modal = this.openModal(`
            <div class="modal-overlay active">
                <div class="modal-content" style="max-width:450px;">
                    <div class="modal-header"><h3><i class="fas fa-coins"></i> تعديل الرصيد</h3><button class="modal-close"><i class="fas fa-times"></i></button></div>
                    <div class="modal-body">
                        <p class="text-muted small">استخدم قيمة سالبة للخصم، وموجبة للإضافة.</p>
                        <div class="form-group"><label>تغيير الرصيد ($)</label><input type="number" step="0.01" class="form-control" id="balanceChangeInput" value="0"></div>
                        <div class="form-group"><label>تغيير الكوينز</label><input type="number" class="form-control" id="coinsChangeInput" value="0"></div>
                        <div class="form-group"><label>السبب * (سيُسجَّل في سجل التدقيق)</label><textarea class="form-control" id="fundsReasonInput" rows="2" required></textarea></div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" data-dismiss>إلغاء</button>
                        <button class="btn btn-success" id="confirmFundsBtn"><i class="fas fa-check"></i> تأكيد التعديل</button>
                    </div>
                </div>
            </div>
        `);
        modal.querySelector('#confirmFundsBtn').addEventListener('click', async () => {
            const balanceChange = parseFloat(modal.querySelector('#balanceChangeInput').value) || 0;
            const coinsChange = parseInt(modal.querySelector('#coinsChangeInput').value) || 0;
            const reason = modal.querySelector('#fundsReasonInput').value.trim();
            try {
                const result = await this.api('POST', `/users/${userId}/adjust-funds`, { balanceChange, coinsChange, reason });
                this.showToast(result.message, 'success');
                modal.remove();
                this.loadUsers(this.state.users.page || 1, this.state.users.search || '');
            } catch (error) { this.showToast(error.message, 'error'); }
        });
    }

    // ================= Deposits =================
    async loadDeposits(page = 1) {
        const status = document.getElementById('depositsStatusFilter')?.value || 'pending';
        try {
            const data = await this.api('GET', `/deposits?status=${status}&page=${page}`);
            const c = document.getElementById('depositsListContainer');
            if (!data.deposits.length) { c.innerHTML = '<div class="empty-state"><i class="fas fa-inbox fa-2x"></i><p>لا توجد طلبات</p></div>'; this.renderPagination('depositsPagination', 0, 1, () => {}); return; }

            c.innerHTML = data.deposits.map(d => `
                <div class="top-user-item" style="align-items:flex-start;">
                    <img src="${d.user?.profileImage || 'https://i.ibb.co/601T5nRV/7d580cf284dbd895ae2db4b598ec8bb2.jpg'}" class="top-user-avatar">
                    <div class="top-user-info" style="flex:2">
                        <div class="username">${escapeHtml(d.user?.username || 'مستخدم محذوف')}</div>
                        <div style="font-size:0.85rem;color:#7f8c8d;">المبلغ: <strong>$${d.amount}</strong> | ${formatDate(d.createdAt)}
                        ${d.receiptImage ? `<br><a href="${d.receiptImage}" target="_blank">عرض الإيصال <i class="fas fa-external-link-alt"></i></a>` : '<br><span class="text-warning">لم يُرفَع إيصال بعد</span>'}
                        </div>
                    </div>
                    ${d.status === 'pending' ? `
                        <div style="display:flex; gap:6px;">
                            <button class="btn-action btn-view" data-approve="${d._id}" title="قبول"><i class="fas fa-check"></i></button>
                            <button class="btn-action btn-delete" data-reject="${d._id}" title="رفض"><i class="fas fa-times"></i></button>
                        </div>
                    ` : `<span class="status-badge ${d.status === 'completed' ? 'status-completed' : 'status-banned'}">${this.statusText(d.status)}</span>`}
                </div>
            `).join('');

            c.querySelectorAll('[data-approve]').forEach(btn => btn.addEventListener('click', () =>
                this.confirmAction('تأكيد الموافقة على طلب الشحن؟', async () => {
                    await this.api('POST', `/deposits/${btn.dataset.approve}/approve`);
                    this.showToast('تمت الموافقة', 'success'); this.loadDeposits(page);
                }, false)
            ));
            c.querySelectorAll('[data-reject]').forEach(btn => btn.addEventListener('click', () => {
                this.promptModal('رفض طلب الشحن', 'سبب الرفض...', (reason) => {
                    this.api('POST', `/deposits/${btn.dataset.reject}/reject`, { reason })
                        .then(() => { this.showToast('تم الرفض', 'success'); this.loadDeposits(page); })
                        .catch(e => this.showToast(e.message, 'error'));
                }, { confirmText: 'رفض', danger: true });
            }));

            this.renderPagination('depositsPagination', data.totalPages, data.currentPage, (p) => this.loadDeposits(p));
        } catch (error) { this.showToast(error.message, 'error'); }
    }

    // ================= Coin Purchases =================
    async loadCoinPurchases(page = 1) {
        const status = document.getElementById('coinPurchasesStatusFilter')?.value || 'pending_review';
        try {
            const data = await this.api('GET', `/coin-purchases?status=${status}&page=${page}`);
            const c = document.getElementById('coinPurchasesListContainer');
            if (!data.purchases.length) { c.innerHTML = '<div class="empty-state"><i class="fas fa-inbox fa-2x"></i><p>لا توجد طلبات</p></div>'; this.renderPagination('coinPurchasesPagination', 0, 1, () => {}); return; }

            c.innerHTML = data.purchases.map(p => `
                <div class="top-user-item" style="align-items:flex-start;">
                    <img src="${p.user?.profileImage || 'https://i.ibb.co/601T5nRV/7d580cf284dbd895ae2db4b598ec8bb2.jpg'}" class="top-user-avatar">
                    <div class="top-user-info" style="flex:2">
                        <div class="username">${escapeHtml(p.user?.username || 'مستخدم محذوف')}</div>
                        <div style="font-size:0.85rem;color:#7f8c8d;">${p.amountUSD}$ → ${p.coinsAmount} كوينز | ${p.method === 'sham_cash' ? 'شام كاش' : 'فيزا'} | ${formatDate(p.createdAt)}
                        ${p.receiptImage ? `<br><a href="${p.receiptImage}" target="_blank">عرض الإيصال <i class="fas fa-external-link-alt"></i></a>` : ''}
                        </div>
                    </div>
                    ${p.status === 'pending_review' ? `
                        <div style="display:flex; gap:6px;">
                            <button class="btn-action btn-view" data-approve="${p._id}" title="قبول"><i class="fas fa-check"></i></button>
                            <button class="btn-action btn-delete" data-reject="${p._id}" title="رفض"><i class="fas fa-times"></i></button>
                        </div>
                    ` : `<span class="status-badge ${p.status === 'approved' ? 'status-completed' : 'status-banned'}">${p.status === 'approved' ? 'مقبول' : p.status === 'rejected' ? 'مرفوض' : 'بانتظار الدفع'}</span>`}
                </div>
            `).join('');

            c.querySelectorAll('[data-approve]').forEach(btn => btn.addEventListener('click', () =>
                this.confirmAction('تأكيد الموافقة وإيداع الكوينز؟', async () => {
                    await this.api('POST', `/coin-purchases/${btn.dataset.approve}/approve`);
                    this.showToast('تمت الموافقة', 'success'); this.loadCoinPurchases(page);
                }, false)
            ));
            c.querySelectorAll('[data-reject]').forEach(btn => btn.addEventListener('click', () => {
                this.promptModal('رفض طلب الشراء', 'سبب الرفض...', (reason) => {
                    this.api('POST', `/coin-purchases/${btn.dataset.reject}/reject`, { reason })
                        .then(() => { this.showToast('تم الرفض', 'success'); this.loadCoinPurchases(page); })
                        .catch(e => this.showToast(e.message, 'error'));
                }, { confirmText: 'رفض', danger: true });
            }));

            this.renderPagination('coinPurchasesPagination', data.totalPages, data.currentPage, (p) => this.loadCoinPurchases(p));
        } catch (error) { this.showToast(error.message, 'error'); }
    }

    // ================= Withdrawals =================
    async loadWithdrawals() {
        const status = document.getElementById('withdrawalStatusFilter')?.value || 'pending';
        try {
            const data = await this.api('GET', `/withdrawals?status=${status}`);
            const c = document.getElementById('withdrawalsListContainer');
            if (!data.data.withdrawals.length) { c.innerHTML = '<div class="empty-state"><i class="fas fa-inbox fa-2x"></i><p>لا توجد طلبات</p></div>'; return; }

            c.innerHTML = data.data.withdrawals.map(w => `
                <div class="top-user-item" style="align-items:flex-start;">
                    <img src="${w.user?.profileImage || 'https://i.ibb.co/601T5nRV/7d580cf284dbd895ae2db4b598ec8bb2.jpg'}" class="top-user-avatar">
                    <div class="top-user-info" style="flex:2">
                        <div class="username">${escapeHtml(w.user?.username || 'مستخدم محذوف')}</div>
                        <div style="font-size:0.85rem;color:#7f8c8d;">
                            ${w.method === 'sham_cash' ? `شام كاش - المحفظة: ${escapeHtml(w.walletNumber || '')}` : `مكتب - ${escapeHtml(w.officeInfo?.country || '')}/${escapeHtml(w.officeInfo?.governorate || '')} - ${escapeHtml(w.officeInfo?.phone || '')}`}
                            <br>الاسم: ${escapeHtml(w.fullName)} | المبلغ: <strong>${w.amount}$</strong>
                        </div>
                    </div>
                    ${w.status === 'pending' ? `
                        <div style="display:flex; gap:6px;">
                            <button class="btn-action btn-view" data-approve="${w._id}" title="قبول"><i class="fas fa-check"></i></button>
                            <button class="btn-action btn-delete" data-reject="${w._id}" title="رفض"><i class="fas fa-times"></i></button>
                        </div>
                    ` : `<span class="status-badge ${w.status === 'completed' ? 'status-completed' : 'status-banned'}">${w.status === 'completed' ? 'مقبول' : 'مرفوض'}</span>`}
                </div>
            `).join('');

            c.querySelectorAll('[data-approve]').forEach(btn => btn.addEventListener('click', () =>
                this.confirmAction('تأكيد الموافقة على السحب؟', async () => {
                    await this.api('POST', `/withdrawals/${btn.dataset.approve}/review`, { action: 'approve' });
                    this.showToast('تمت الموافقة', 'success'); this.loadWithdrawals();
                }, false)
            ));
            c.querySelectorAll('[data-reject]').forEach(btn => btn.addEventListener('click', () => {
                this.promptModal('رفض طلب السحب', 'سبب الرفض...', (reason) => {
                    this.api('POST', `/withdrawals/${btn.dataset.reject}/review`, { action: 'reject', reason })
                        .then(() => { this.showToast('تم الرفض واسترداد الرصيد', 'success'); this.loadWithdrawals(); })
                        .catch(e => this.showToast(e.message, 'error'));
                }, { confirmText: 'رفض', danger: true });
            }));
        } catch (error) { this.showToast(error.message, 'error'); }
    }

    // ================= Transactions =================
    async loadTransactions(page = 1, search = '') {
        const type = document.getElementById('transactionsTypeFilter')?.value || 'all';
        try {
            const data = await this.api('GET', `/transactions?type=${type}&page=${page}&search=${encodeURIComponent(search)}`);
            const c = document.getElementById('transactionsListContainer');
            if (!data.transactions.length) { c.innerHTML = '<div class="empty-state"><i class="fas fa-inbox fa-2x"></i><p>لا توجد معاملات بعد — ستظهر هنا نتائج المعارك والتعديلات اليدوية للرصيد</p></div>'; this.renderPagination('transactionsPagination', 0, 1, () => {}); return; }

            c.innerHTML = `<table class="table table-hover"><thead><tr><th>المستخدم</th><th>النوع</th><th>المبلغ</th><th>الحالة</th><th>الوصف</th><th>التاريخ</th></tr></thead><tbody>
                ${data.transactions.map(tx => `
                    <tr>
                        <td>${escapeHtml(tx.user?.username || '-')}</td>
                        <td>${this.txTypeText(tx.type)}</td>
                        <td class="${tx.amount < 0 ? 'text-danger' : 'text-success'}">${tx.amount > 0 ? '+' : ''}${tx.amount} ${tx.currency}</td>
                        <td>${this.statusText(tx.status)}</td>
                        <td>${escapeHtml(tx.description || '-')}</td>
                        <td>${formatDate(tx.createdAt)}</td>
                    </tr>
                `).join('')}
            </tbody></table>`;

            this.renderPagination('transactionsPagination', data.totalPages, data.currentPage, (p) => this.loadTransactions(p, search));
        } catch (error) { this.showToast(error.message, 'error'); }
    }

    // ================= Battles =================
    async loadBattles() {
        const status = document.getElementById('battlesStatusFilter')?.value || 'active';
        try {
            const data = await this.api('GET', `/battles?status=${status}`);
            const c = document.getElementById('battlesListContainer');
            if (!data.battles.length) { c.innerHTML = '<div class="empty-state"><i class="fas fa-gamepad fa-2x"></i><p>لا توجد تحديات</p></div>'; return; }

            c.innerHTML = `<table class="table table-hover"><thead><tr><th>النوع</th><th>الرهان</th><th>اللاعبون</th><th>الحالة</th><th>الفائز</th><th>إجراء</th></tr></thead><tbody>
                ${data.battles.map(b => {
                    const players = (b.players || []).map(p => escapeHtml(p.username)).join('، ') || '-';
                    const canForceEnd = ['waiting', 'in-progress'].includes(b.status);
                    return `
                    <tr>
                        <td>${b.type}</td>
                        <td>$${b.betAmount}</td>
                        <td>${players}</td>
                        <td>${this.battleStatusText(b.status)}</td>
                        <td>${b.winner || '-'}</td>
                        <td>${canForceEnd ? `<button class="btn-action btn-delete" data-force-end="${b._id}" title="إنهاء قسري + استرداد"><i class="fas fa-stop-circle"></i></button>` : '-'}</td>
                    </tr>`;
                }).join('')}
            </tbody></table>`;

            c.querySelectorAll('[data-force-end]').forEach(btn => btn.addEventListener('click', () =>
                this.confirmAction('إنهاء التحدي قسرياً واسترداد الرهانات لكل اللاعبين؟', async () => {
                    const r = await this.api('POST', `/battles/${btn.dataset.forceEnd}/force-end`, { refund: true });
                    this.showToast(r.message, 'success'); this.loadBattles();
                })
            ));
        } catch (error) { this.showToast(error.message, 'error'); }
    }

    // ================= Gifts =================
    async loadGifts() {
        try {
            const data = await this.api('GET', '/gifts');
            const c = document.getElementById('giftsGridContainer');
            if (!data.gifts || !data.gifts.length) { c.innerHTML = '<div class="empty-state"><i class="fas fa-gift fa-2x"></i><p>لا توجد هدايا بعد</p></div>'; return; }

            c.innerHTML = data.gifts.map(g => `
                <div class="stat-card ${g.isActive ? 'success' : 'danger'}" style="flex-direction:column;align-items:flex-start;">
                    <div style="display:flex;align-items:center;gap:12px;width:100%;">
                        <img src="${g.imageUrl}" style="width:50px;height:50px;object-fit:contain;">
                        <div style="flex:1;">
                            <strong>${escapeHtml(g.name)}</strong><br>
                            <span class="text-muted small">${g.category} — ${g.discountedPrice || g.price} كوينز</span>
                        </div>
                    </div>
                    <div style="display:flex;gap:6px;margin-top:12px;">
                        <button class="btn-action btn-edit" data-edit="${g._id}"><i class="fas fa-edit"></i></button>
                        <button class="btn-action btn-delete" data-delete="${g._id}" data-name="${escapeHtml(g.name)}"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
            `).join('');

            c.querySelectorAll('[data-edit]').forEach(btn => btn.addEventListener('click', () => {
                const gift = data.gifts.find(g => g._id === btn.dataset.edit);
                this.showGiftFormModal(gift);
            }));
            c.querySelectorAll('[data-delete]').forEach(btn => btn.addEventListener('click', () =>
                this.confirmAction(`حذف هدية "${btn.dataset.name}" نهائياً؟`, async () => {
                    await this.api('DELETE', `/gifts/${btn.dataset.delete}`);
                    this.showToast('تم حذف الهدية', 'success'); this.loadGifts();
                })
            ));
        } catch (error) { this.showToast(error.message, 'error'); }
    }

    showGiftFormModal(gift = null) {
        const isEdit = !!gift;
        const modal = this.openModal(`
            <div class="modal-overlay active">
                <div class="modal-content" style="max-width:500px;">
                    <div class="modal-header"><h3>${isEdit ? 'تعديل هدية' : 'إضافة هدية جديدة'}</h3><button class="modal-close"><i class="fas fa-times"></i></button></div>
                    <div class="modal-body">
                        <div class="form-group"><label>الاسم *</label><input type="text" class="form-control" id="giftName" value="${escapeHtml(gift?.name || '')}"></div>
                        <div class="form-group"><label>الوصف</label><input type="text" class="form-control" id="giftDesc" value="${escapeHtml(gift?.description || '')}"></div>
                        <div class="form-group"><label>رابط الصورة *</label><input type="text" class="form-control" id="giftImage" value="${escapeHtml(gift?.imageUrl || '')}"></div>
                        <div class="form-group"><label>السعر (كوينز) *</label><input type="number" class="form-control" id="giftPrice" value="${gift?.price || 10}" min="10"></div>
                        <div class="form-group"><label>الفئة</label>
                            <select class="form-control" id="giftCategory">
                                ${['common', 'rare', 'epic', 'legendary'].map(c => `<option value="${c}" ${gift?.category === c ? 'selected' : ''}>${c}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group"><label>نسبة الخصم %</label><input type="number" class="form-control" id="giftDiscount" value="${gift?.discount || 0}" min="0" max="100"></div>
                        <div class="form-group"><label>ترتيب العرض</label><input type="number" class="form-control" id="giftSortOrder" value="${gift?.sortOrder || 0}"></div>
                        <div class="form-group"><label><input type="checkbox" id="giftIsActive" ${gift?.isActive !== false ? 'checked' : ''}> نشطة (تظهر بالمتجر)</label></div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" data-dismiss>إلغاء</button>
                        <button class="btn btn-primary" id="saveGiftBtn">${isEdit ? 'حفظ التعديلات' : 'إضافة الهدية'}</button>
                    </div>
                </div>
            </div>
        `);
        modal.querySelector('#saveGiftBtn').addEventListener('click', async () => {
            const payload = {
                name: modal.querySelector('#giftName').value.trim(),
                description: modal.querySelector('#giftDesc').value.trim(),
                imageUrl: modal.querySelector('#giftImage').value.trim(),
                price: parseFloat(modal.querySelector('#giftPrice').value),
                category: modal.querySelector('#giftCategory').value,
                discount: parseFloat(modal.querySelector('#giftDiscount').value) || 0,
                sortOrder: parseInt(modal.querySelector('#giftSortOrder').value) || 0,
                isActive: modal.querySelector('#giftIsActive').checked
            };
            if (!payload.name || !payload.imageUrl || !payload.price) { this.showToast('يرجى تعبئة الحقول الإلزامية', 'error'); return; }
            try {
                if (isEdit) await this.api('PUT', `/gifts/${gift._id}`, payload);
                else await this.api('POST', '/gifts', payload);
                this.showToast('تم الحفظ بنجاح', 'success');
                modal.remove();
                this.loadGifts();
            } catch (error) { this.showToast(error.message, 'error'); }
        });
    }

    // ================= Reports =================
        async loadReports() {
        const status = document.getElementById('reportsStatusFilter')?.value || 'pending';
        try {
            const data = await this.api('GET', `/reports?status=${status}`);
            const c = document.getElementById('reportsListContainer');
            if (!data.reports.length) { c.innerHTML = '<div class="empty-state"><i class="fas fa-flag fa-2x"></i><p>لا توجد بلاغات حالياً — تصل تلقائياً عند ضغط المستخدمين على زر الإبلاغ (⚠️) في الدردشة أو الملف الشخصي</p></div>'; return; }

            const priorityBadge = { low: 'status-online', medium: 'status-pending', high: 'status-banned', critical: 'status-banned' };

            c.innerHTML = data.reports.map(r => `
                <div class="activity-item ${r.priority === 'high' || r.priority === 'critical' ? 'danger' : 'warning'}">
                    <div class="activity-icon"><i class="fas fa-flag"></i></div>
                    <div class="activity-content">
                        <div class="title">${escapeHtml(r.reporter?.username || 'محذوف')} أبلغ عن ${escapeHtml(r.reportedUser?.username || 'محذوف')}
                            <span class="status-badge ${priorityBadge[r.priority] || 'status-pending'}">${r.priority}</span>
                            ${r.reportedUser?.isBanned ? '<span class="status-badge status-banned">محظور بالفعل</span>' : ''}
                        </div>
                        <div class="description">${this.reasonText(r.reason)} ${r.details ? '— ' + escapeHtml(r.details) : ''}</div>
                        <div class="activity-time">${formatDate(r.createdAt)}</div>
                    </div>
                    <div style="display:flex;gap:6px;">
                        <button class="btn-action btn-view" data-investigate="${r._id}" title="تحقيق ومراجعة كاملة"><i class="fas fa-search"></i></button>
                    </div>
                </div>
            `).join('');

            c.querySelectorAll('[data-investigate]').forEach(btn => btn.addEventListener('click', () => {
                const report = data.reports.find(r => r._id === btn.dataset.investigate);
                this.showInvestigationModal(report);
            }));
        } catch (error) { this.showToast(error.message, 'error'); }
    }

    reasonText(reason) {
        const m = { harassment: 'مضايقة/تحرش', spam: 'رسائل مزعجة', inappropriate_content: 'محتوى غير لائق', fraud: 'احتيال', fake_account: 'حساب مزيف', cheating: 'غش/تلاعب', payment_issue: 'مشكلة دفع', other: 'أخرى' };
        return m[reason] || reason;
    }

    async showInvestigationModal(report) {
        try {
            const data = await this.api('GET', `/investigate/${report.reportedUser._id}`);
            const { targetUser, chats, relatedReports } = data;

            const modal = this.openModal(`
                <div class="modal-overlay active">
                    <div class="modal-content" style="max-width:1100px;">
                        <div class="modal-header">
                            <h3><i class="fas fa-user-secret"></i> تحقيق ومراجعة: ${escapeHtml(targetUser.username)}</h3>
                            <button class="modal-close"><i class="fas fa-times"></i></button>
                        </div>
                        <div class="modal-body" style="padding:0;">
                            <div style="display:grid; grid-template-columns: 280px 1fr;">
                                <div style="border-left:1px solid #eee; padding:16px; overflow-y:auto; max-height:600px;">
                                    <div class="mb-3" style="padding:10px;background:#fff3cd;border-radius:8px;">
                                        <strong>البلاغ الحالي</strong>
                                        <p class="small mb-1">السبب: ${this.reasonText(report.reason)}</p>
                                        <p class="small mb-1">${escapeHtml(report.details || '')}</p>
                                        ${report.evidence && report.evidence.length ? `<a href="${report.evidence[0]}" target="_blank"><img src="${report.evidence[0]}" style="max-width:100%;border-radius:6px;margin-top:6px;"></a>` : ''}
                                    </div>
                                    ${relatedReports.length > 1 ? `<p class="small text-muted mb-2"><i class="fas fa-history"></i> بلاغات سابقة عن هذا المستخدم: ${relatedReports.length}</p>` : ''}
                                    <hr>
                                    <p class="small text-muted mb-2">محادثاته الخاصة (${chats.length})</p>
                                    <div id="investigation-chat-tabs"></div>
                                </div>
                                <div id="investigation-chat-viewer" style="padding:16px; overflow-y:auto; max-height:600px; background:#f9fafb;">
                                    <p class="text-center text-muted py-5">اختر محادثة من القائمة لعرضها</p>
                                </div>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button class="btn btn-secondary" data-dismiss>إغلاق</button>
                            <button class="btn btn-outline-warning" id="inv-warn-btn">تحذير</button>
                            <button class="btn btn-outline-danger" id="inv-tempban-btn">حظر 3 أيام</button>
                            <button class="btn btn-danger" id="inv-permban-btn">حظر دائم</button>
                            <button class="btn btn-outline-secondary" id="inv-dismiss-btn">رفض البلاغ</button>
                        </div>
                    </div>
                </div>
            `);

                        const tabsContainer = modal.querySelector('#investigation-chat-tabs');
            const viewer = modal.querySelector('#investigation-chat-viewer');

            const renderMsgBubble = (m, isTarget) => {
                let contentHtml = '';
                if (m.type === 'image') contentHtml = `<a href="${m.content}" target="_blank"><img src="${m.content}" style="max-width:200px;border-radius:8px;"></a>`;
                else if (!m.type || m.type === 'text') contentHtml = escapeHtml(m.content);
                else contentHtml = `<em>[${m.type}]</em>`;
                return `
                    <div class="mb-2" style="display:flex; ${isTarget ? 'justify-content:flex-end' : ''};">
                        <div style="max-width:70%; background:${isTarget ? '#fee2e2' : '#e0f2fe'}; padding:8px 12px; border-radius:10px;">
                            <div class="small fw-bold">${escapeHtml(m.sender?.username || '-')}</div>
                            <div class="small">${contentHtml}</div>
                            <div class="small text-muted">${formatDate(m.createdAt)}</div>
                        </div>
                    </div>
                `;
            };

            let tabsHTML = '';
            // ✅ تبويب الشات العام (يظهر أولاً إن وُجدت رسائل عامة)
            if (data.publicMessages && data.publicMessages.length) {
                tabsHTML += `<button class="btn btn-sm w-100 mb-1 text-start inv-chat-tab" data-public="1" style="background:#fef3c7;border:1px solid #fbbf24;">
                    <i class="fas fa-globe"></i> آخر ${data.publicMessages.length} رسائل بالشات العام
                </button>`;
            }
            if (chats.length === 0 && (!data.publicMessages || !data.publicMessages.length)) {
                tabsContainer.innerHTML = '<p class="small text-muted">لا توجد أي محادثات لهذا المستخدم</p>';
            } else {
                tabsHTML += chats.map((c, i) => `
                    <button class="btn btn-sm w-100 mb-1 text-start inv-chat-tab" data-index="${i}" style="background:#f1f5f9;border:1px solid #e2e8f0;">
                        <i class="fas fa-comment-dots"></i> ${escapeHtml(c.otherParticipant?.username || 'مستخدم محذوف')}
                    </button>
                `).join('');
                tabsContainer.innerHTML = tabsHTML;

                tabsContainer.querySelectorAll('.inv-chat-tab[data-public]').forEach(btn => {
                    btn.addEventListener('click', () => {
                        viewer.innerHTML = data.publicMessages.map(m => renderMsgBubble(m, m.sender?._id === targetUser._id)).join('')
                            || '<p class="text-center text-muted">لا توجد رسائل</p>';
                    });
                });
                tabsContainer.querySelectorAll('.inv-chat-tab[data-index]').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const chat = chats[btn.dataset.index];
                        viewer.innerHTML = chat.messages.map(m => renderMsgBubble(m, m.sender?._id === targetUser._id)).join('')
                            || '<p class="text-center text-muted">لا توجد رسائل</p>';
                    });
                });
                tabsContainer.querySelector('.inv-chat-tab')?.click();
            }

            const resolveAndClose = async (action, notes, duration) => {
                try {
                    await this.api('POST', `/reports/${report._id}/resolve`, { status: 'resolved', action, notes, duration });
                    this.showToast('تم اتخاذ الإجراء بنجاح', 'success');
                    modal.remove();
                    this.loadReports();
                } catch (error) { this.showToast(error.message, 'error'); }
            };

            modal.querySelector('#inv-warn-btn').addEventListener('click', () => {
                this.promptModal('تحذير المستخدم', 'نص التحذير...', (notes) => resolveAndClose('warning', notes), { confirmText: 'إرسال تحذير' });
            });
            modal.querySelector('#inv-tempban-btn').addEventListener('click', () => {
                this.promptModal('حظر مؤقت 3 أيام', 'سبب الحظر...', (notes) => { if (notes) resolveAndClose('ban', notes, 3); }, { confirmText: 'حظر 3 أيام', danger: true });
            });
            modal.querySelector('#inv-permban-btn').addEventListener('click', () => {
                this.promptModal('حظر دائم', 'سبب الحظر...', (notes) => { if (notes) resolveAndClose('ban', notes, null); }, { confirmText: 'حظر دائم', danger: true });
            });
            modal.querySelector('#inv-dismiss-btn').addEventListener('click', () => {
                this.confirmAction('رفض هذا البلاغ (اعتباره غير صحيح)؟', () => resolveAndClose('no_action', 'تم رفض البلاغ بعد المراجعة'), false);
            });
        } catch (error) { this.showToast(error.message, 'error'); }
    }

    // ================= Logs =================
        async loadLogs(page = 1) {
        const severity = document.getElementById('logsSeverityFilter')?.value || '';
        try {
            const data = await this.api('GET', `/logs?page=${page}&limit=50${severity ? '&severity=' + severity : ''}`);
            const c = document.getElementById('logsListContainer');
            if (!data.logs || !data.logs.length) { c.innerHTML = '<div class="empty-state"><i class="fas fa-history fa-2x"></i><p>لا توجد سجلات</p></div>'; this.renderPagination('logsPagination', 0, 1, () => {}); return; }

            c.innerHTML = `<table class="table table-hover"><thead><tr><th>المدير</th><th>الإجراء</th><th>الهدف</th><th>الخطورة</th><th>التاريخ</th><th>تفاصيل</th></tr></thead><tbody>
                ${data.logs.map((log, i) => `
                    <tr>
                        <td>${escapeHtml(log.admin?.username || '-')}</td>
                        <td>${this.actionText(log.action)}</td>
                        <td>${escapeHtml(log.targetUser?.username || '-')}</td>
                        <td><span class="status-badge ${log.severity === 'critical' || log.severity === 'error' ? 'status-banned' : log.severity === 'warning' ? 'status-pending' : 'status-online'}">${log.severity}</span></td>
                        <td>${formatDate(log.createdAt)}</td>
                        <td><button class="btn-action btn-view" data-log-details="${i}"><i class="fas fa-eye"></i></button></td>
                    </tr>
                `).join('')}
            </tbody></table>`;

            c.querySelectorAll('[data-log-details]').forEach(btn => btn.addEventListener('click', () => {
                this.showLogDetailsModal(data.logs[btn.dataset.logDetails]);
            }));

            this.renderPagination('logsPagination', data.totalPages, data.currentPage, (p) => this.loadLogs(p));
        } catch (error) { this.showToast(error.message, 'error'); }
    }

    showLogDetailsModal(log) {
        this.openModal(`
            <div class="modal-overlay active">
                <div class="modal-content" style="max-width:600px;">
                    <div class="modal-header"><h3><i class="fas fa-file-alt"></i> تفاصيل الحدث</h3><button class="modal-close"><i class="fas fa-times"></i></button></div>
                    <div class="modal-body">
                        <table class="table table-sm">
                            <tr><th>المدير</th><td>${escapeHtml(log.admin?.username || '-')}</td></tr>
                            <tr><th>الإجراء</th><td>${this.actionText(log.action)}</td></tr>
                            <tr><th>الهدف</th><td>${escapeHtml(log.targetUser?.username || '-')}</td></tr>
                            <tr><th>الخطورة</th><td>${log.severity}</td></tr>
                            <tr><th>عنوان IP</th><td>${escapeHtml(log.ipAddress || '-')}</td></tr>
                            <tr><th>التاريخ</th><td>${formatDate(log.createdAt)}</td></tr>
                        </table>
                        <p class="small text-muted mb-1">البيانات الكاملة:</p>
                        <pre style="background:#f5f5f5;padding:12px;border-radius:8px;font-size:0.8rem;max-height:250px;overflow:auto;direction:ltr;text-align:left;">${escapeHtml(JSON.stringify(log.details || {}, null, 2))}</pre>
                    </div>
                </div>
            </div>
        `);
    }

    actionText(action) {
        const m = {
            login: 'تسجيل دخول', logout: 'تسجيل خروج', ban_user: 'حظر مستخدم', unban_user: 'فك حظر',
            manual_transaction: 'تعديل رصيد يدوي', approve_deposit: 'قبول شحن', reject_deposit: 'رفض شحن',
            approve_withdrawal: 'قبول سحب', reject_withdrawal: 'رفض سحب', update_permissions: 'تحديث صلاحيات',
            create_gift: 'إضافة هدية', update_gift: 'تعديل هدية', delete_gift: 'حذف هدية',
            update_settings: 'تحديث إعدادات', system_maintenance: 'إجراء نظامي', mass_notification: 'إشعار جماعي'
        };
        return m[action] || action;
    }

       async loadSettings() {
        try {
            const data = await this.api('GET', '/settings');
            const s = data.settings;
            const c = document.getElementById('settingsFormContainer');
            c.innerHTML = `
                <div class="row">
                    <div class="col-md-6">
                        <h6 class="mb-3"><i class="fas fa-coins text-warning"></i> إعدادات الكوينز والشحن</h6>
                        <div class="form-group"><label>سعر صرف الكوينز (كوينز لكل 1$)</label><input type="number" class="form-control" id="s-coinRate" value="${s.coinExchangeRate}"></div>
                        <div class="form-group"><label>الحد الأدنى للشحن ($)</label><input type="number" class="form-control" id="s-minPurchase" value="${s.minPurchaseUSD}"></div>
                        <div class="form-group"><label>الحد الأقصى للشحن ($)</label><input type="number" class="form-control" id="s-maxPurchase" value="${s.maxPurchaseUSD}"></div>
                    </div>
                    <div class="col-md-6">
                        <h6 class="mb-3"><i class="fas fa-money-bill-wave text-success"></i> إعدادات السحب</h6>
                        <div class="form-group"><label>الحد الأدنى للسحب ($)</label><input type="number" class="form-control" id="s-minWithdraw" value="${s.minWithdrawUSD}"></div>
                        <div class="form-group"><label>رسوم السحب (لكل 10$)</label><input type="number" step="0.01" class="form-control" id="s-withdrawFee" value="${s.withdrawalFeePer10USD}"></div>
                        <div class="form-group"><label>نسبة عمولة التحديات %</label><input type="number" step="0.01" class="form-control" id="s-commission" value="${(s.battleCommissionRate * 100).toFixed(2)}">
                            <small class="text-muted">⚠️ هذا الحقل تجريبي: بعض أجزاء نظام التحديات لا تزال تستخدم قيمة ثابتة بالكود، سيتم توحيدها بتحديث قادم.</small>
                        </div>
                    </div>
                </div>
                <hr>
                <div class="row">
                    <div class="col-md-6">
                        <h6 class="mb-3"><i class="fas fa-wallet text-info"></i> محفظة شام كاش</h6>
                        <div class="form-group"><label>رقم المحفظة</label><input type="text" class="form-control" id="s-shamWallet" value="${escapeHtml(s.shamCashWallet)}"></div>
                        <div class="form-group"><label>اسم صاحب الحساب</label><input type="text" class="form-control" id="s-shamHolder" value="${escapeHtml(s.shamCashHolderName)}"></div>
                        <div class="form-group"><label>رابط صورة QR</label><input type="text" class="form-control" id="s-shamQr" value="${escapeHtml(s.shamCashQrUrl)}"></div>
                    </div>
                    <div class="col-md-6">
                        <h6 class="mb-3"><i class="fas fa-credit-card text-primary"></i> بطاقة فيزا</h6>
                        <div class="form-group"><label>رقم البطاقة</label><input type="text" class="form-control" id="s-visaNumber" value="${escapeHtml(s.visaCardNumber)}"></div>
                        <div class="form-group"><label>اسم صاحب البطاقة</label><input type="text" class="form-control" id="s-visaHolder" value="${escapeHtml(s.visaHolderName)}"></div>
                    </div>
                </div>
                <hr>
                <h6 class="mb-3"><i class="fas fa-tools text-danger"></i> وضع الصيانة</h6>
                <div class="form-group">
                    <label><input type="checkbox" id="s-maintenance" ${s.maintenanceMode ? 'checked' : ''}> تفعيل وضع الصيانة (يمنع تسجيل الدخول لغير المدراء)</label>
                </div>
                <div class="form-group"><label>رسالة الصيانة</label><textarea class="form-control" id="s-maintenanceMsg" rows="2">${escapeHtml(s.maintenanceMessage)}</textarea></div>
                <button class="btn btn-primary mt-2" id="saveSettingsBtn"><i class="fas fa-save"></i> حفظ كل التغييرات</button>
            `;

            document.getElementById('saveSettingsBtn').addEventListener('click', async () => {
                const payload = {
                    coinExchangeRate: parseFloat(document.getElementById('s-coinRate').value),
                    minPurchaseUSD: parseFloat(document.getElementById('s-minPurchase').value),
                    maxPurchaseUSD: parseFloat(document.getElementById('s-maxPurchase').value),
                    minWithdrawUSD: parseFloat(document.getElementById('s-minWithdraw').value),
                    withdrawalFeePer10USD: parseFloat(document.getElementById('s-withdrawFee').value),
                    battleCommissionRate: parseFloat(document.getElementById('s-commission').value) / 100,
                    shamCashWallet: document.getElementById('s-shamWallet').value.trim(),
                    shamCashHolderName: document.getElementById('s-shamHolder').value.trim(),
                    shamCashQrUrl: document.getElementById('s-shamQr').value.trim(),
                    visaCardNumber: document.getElementById('s-visaNumber').value.trim(),
                    visaHolderName: document.getElementById('s-visaHolder').value.trim(),
                    maintenanceMode: document.getElementById('s-maintenance').checked,
                    maintenanceMessage: document.getElementById('s-maintenanceMsg').value.trim()
                };
                try {
                    await this.api('POST', '/settings', payload);
                    this.showToast('تم حفظ الإعدادات بنجاح', 'success');
                } catch (error) { this.showToast(error.message, 'error'); }
            });
        } catch (error) { this.showToast(error.message, 'error'); }
    }
    txTypeText(type) {
        const m = { deposit: 'شحن', withdrawal: 'سحب', bet: 'رهان', win: 'فوز', loss: 'خسارة', gift_send: 'إرسال هدية', gift_receive: 'استلام هدية', commission: 'عمولة' };
        return m[type] || type;
    }
    statusText(status) {
        const m = { pending: 'قيد الانتظار', completed: 'مكتمل', failed: 'فشل', cancelled: 'ملغي' };
        return m[status] || status;
    }
    battleStatusText(status) {
        const m = { waiting: 'انتظار', 'in-progress': 'جارٍ', completed: 'مكتمل', cancelled: 'ملغى' };
        return m[status] || status;
    }

    updateAdminInfo() {
        const el = document.getElementById('adminName');
        if (el && this.adminData.username) el.textContent = this.adminData.username;
        const imgEl = document.getElementById('adminAvatarImg');
        if (imgEl) imgEl.src = this.adminData.profileImage || 'https://i.ibb.co/601T5nRV/7d580cf284dbd895ae2db4b598ec8bb2.jpg';
    }

    initSocket() {
        const socketUrl = window.location.hostname === 'localhost' ? 'http://localhost:5000' : window.location.origin;
        this.socket = io(`${socketUrl}/admin`, { auth: { token: this.token } });
        this.socket.on('connect', () => console.log('✅ Admin socket connected'));
        this.socket.on('admin-notification', (n) => this.showToast(n.message, n.type));
    }

    startAutoRefresh() {
        setInterval(() => { if (this.currentPage === 'dashboard') this.loadDashboard(); }, 30000);
    }

    logout() {
        if (this.socket) this.socket.disconnect();
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/login.html';
    }

    showToast(message, type = 'info') {
        document.querySelectorAll('.admin-toast').forEach(t => t.remove());
        const toast = document.createElement('div');
        toast.className = `admin-toast toast-${type}`;
        toast.innerHTML = `<div class="toast-content"><i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i><span>${escapeHtml(message)}</span></div><button class="toast-close" onclick="this.parentElement.remove()"><i class="fas fa-times"></i></button>`;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 5000);
    }

    loadCurrentPage() {
        const hash = window.location.hash.substring(1) || 'dashboard';
        this.switchPage(hash);
        window.addEventListener('hashchange', () => {
            const h = window.location.hash.substring(1) || 'dashboard';
            if (h !== this.currentPage) this.switchPage(h);
        });
    }
}

const toastCSS = `
    .admin-toast { position: fixed; top: 20px; left: 20px; right: 20px; max-width: 400px; margin: 0 auto; background: white; border-radius: 10px; padding: 15px 20px; box-shadow: 0 5px 20px rgba(0,0,0,0.15); display: flex; align-items: center; justify-content: space-between; z-index: 9999; animation: slideDown 0.3s ease; }
    .toast-success { border-right: 4px solid #27ae60; } .toast-error { border-right: 4px solid #e74c3c; }
    .toast-warning { border-right: 4px solid #f39c12; } .toast-info { border-right: 4px solid #3498db; }
    .toast-content { display: flex; align-items: center; gap: 10px; flex: 1; }
    .toast-success .toast-content i { color: #27ae60; } .toast-error .toast-content i { color: #e74c3c; }
    .toast-warning .toast-content i { color: #f39c12; } .toast-info .toast-content i { color: #3498db; }
    .toast-close { background: none; border: none; color: #95a5a6; cursor: pointer; padding: 5px; }
    @keyframes slideDown { from { opacity:0; transform: translateY(-20px);} to { opacity:1; transform: translateY(0);} }
`;
const style = document.createElement('style');
style.textContent = toastCSS;
document.head.appendChild(style);

const admin = new AdminDashboard();
window.admin = admin;
