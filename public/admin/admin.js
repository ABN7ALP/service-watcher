// Admin Dashboard JavaScript
class AdminDashboard {
    constructor() {
        this.token = localStorage.getItem('adminToken');
        this.adminData = JSON.parse(localStorage.getItem('adminData') || '{}');
        this.currentPage = 'dashboard';
        this.socket = null;
        
        this.init();
    }

    async init() {
        if (!this.checkAuth()) {
            window.location.href = '/admin-login.html';
            return;
        }

        this.setupEventListeners();
        this.loadCurrentPage();
        this.initSocket();
        this.updateAdminInfo();
        this.startAutoRefresh();
    }

    checkAuth() {
        if (!this.token) return false;
        
        // Check token expiration
        try {
            const payload = JSON.parse(atob(this.token.split('.')[1]));
            const isExpired = payload.exp * 1000 < Date.now();
            if (isExpired) {
                this.logout();
                return false;
            }
            return true;
        } catch (error) {
            return false;
        }
    }

    setupEventListeners() {
        // Menu navigation
        document.querySelectorAll('.menu-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const page = item.dataset.page;
                this.switchPage(page);
            });
        });

        // Logout button
        document.querySelector('.btn-logout')?.addEventListener('click', () => {
            this.logout();
        });

        // Search functionality
        const userSearch = document.getElementById('userSearch');
        if (userSearch) {
            let searchTimeout;
            userSearch.addEventListener('input', (e) => {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => {
                    this.searchUsers(e.target.value);
                }, 500);
            });
        }

        // Modal close buttons
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal-close') || 
                e.target.classList.contains('modal-overlay')) {
                this.closeModal(e.target.closest('.modal-overlay').id);
            }
        });

        // Ban user confirmation
        document.getElementById('confirmBan')?.addEventListener('click', () => {
            this.confirmBanUser();
        });

        // Mobile menu toggle
        const mobileToggle = document.createElement('button');
        mobileToggle.className = 'mobile-menu-toggle';
        mobileToggle.innerHTML = '<i class="fas fa-bars"></i>';
        document.body.appendChild(mobileToggle);
        
        mobileToggle.addEventListener('click', () => {
            document.querySelector('.admin-sidebar').classList.toggle('active');
        });
    }

    switchPage(page) {
        // Update active menu item
        document.querySelectorAll('.menu-item').forEach(item => {
            item.classList.remove('active');
        });
        document.querySelector(`.menu-item[data-page="${page}"]`)?.classList.add('active');

        // Hide all pages
        document.querySelectorAll('.page').forEach(pageEl => {
            pageEl.classList.remove('active');
        });

        // Show selected page
        const pageElement = document.getElementById(`${page}-page`);
        if (pageElement) {
            pageElement.classList.add('active');
            this.currentPage = page;
            this.loadPageData(page);
        }
    }

    async loadPageData(page) {
        switch (page) {
            case 'dashboard':
                await this.loadDashboard();
                break;
            case 'users':
                await this.loadUsers();
                break;
            case 'transactions':
                await this.loadTransactions();
                break;
            case 'withdrawals':
                await this.loadWithdrawals();
                break;
            case 'deposits':
                await this.loadDeposits();
                break;
            case 'battles':
                await this.loadBattles();
                break;
            case 'gifts':
                await this.loadGifts();
                break;
            case 'logs':
                await this.loadLogs();
                break;
            case 'settings':
                await this.loadSettings();
                break;
        }
    }

    async loadDashboard() {
        try {
            const response = await fetch('/api/admin/dashboard', {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (!response.ok) {
                if (response.status === 401) {
                    this.logout();
                    return;
                }
                throw new Error('Failed to load dashboard');
            }

            const data = await response.json();
            
            if (data.success) {
                this.updateDashboardStats(data.stats);
                this.updateTopUsers(data.topUsers);
            }
        } catch (error) {
            console.error('Error loading dashboard:', error);
            this.showToast('فشل تحميل البيانات', 'error');
        }
    }

    updateDashboardStats(stats) {
        // Update stat cards
        document.getElementById('totalUsers').textContent = stats.totalUsers.toLocaleString();
        document.getElementById('onlineUsers').textContent = stats.onlineUsers.toLocaleString();
        document.getElementById('totalDeposits').textContent = `$${stats.totalDeposits.toLocaleString()}`;
        document.getElementById('pendingDeposits').textContent = stats.pendingDeposits;
        document.getElementById('totalWithdrawals').textContent = `$${stats.totalWithdrawals.toLocaleString()}`;
        document.getElementById('pendingWithdrawals').textContent = stats.pendingWithdrawals;
        document.getElementById('activeBattles').textContent = stats.activeBattles;
        document.getElementById('todayTransactions').textContent = stats.todayTransactions;
        
        // Update last update time
        document.getElementById('lastUpdate').textContent = new Date().toLocaleTimeString('ar-SA');
    }

    updateTopUsers(topUsers) {
        this.updateTopUsersList('topDepositors', topUsers.depositors, 'totalDeposited', '$');
        this.updateTopUsersList('topGifters', topUsers.gifters, 'totalGifted', 'عملة');
        this.updateTopUsersList('topWinners', topUsers.winners, 'totalWon', '$');
    }

    updateTopUsersList(elementId, users, field, suffix = '') {
        const container = document.getElementById(elementId);
        if (!container) return;

        container.innerHTML = '';
        
        if (!users || users.length === 0) {
            container.innerHTML = '<div class="empty-state">لا توجد بيانات</div>';
            return;
        }

        users.forEach((user, index) => {
            const userElement = document.createElement('div');
            userElement.className = 'top-user-item';
            userElement.innerHTML = `
                <div class="rank rank-${index + 1}">${index + 1}</div>
                <img src="${user.profileImage || 'https://via.placeholder.com/45'}" 
                     alt="${user.username}" 
                     class="top-user-avatar"
                     onerror="this.src='https://via.placeholder.com/45'">
                <div class="top-user-info">
                    <div class="username">${user.username}</div>
                    <div class="value">${user[field].toLocaleString()}${suffix}</div>
                </div>
            `;
            
            userElement.addEventListener('click', () => {
                this.showUserDetails(user._id);
            });
            
            container.appendChild(userElement);
        });
    }

    async loadUsers(page = 1, search = '') {
        try {
            const response = await fetch(`/api/admin/users?page=${page}&limit=50&search=${encodeURIComponent(search)}`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to load users');
            }

            const data = await response.json();
            
            if (data.success) {
                this.renderUsersTable(data.users);
                this.renderUsersPagination(data.totalPages, data.currentPage);
            }
        } catch (error) {
            console.error('Error loading users:', error);
            this.showToast('فشل تحميل المستخدمين', 'error');
        }
    }

    renderUsersTable(users) {
        const tbody = document.getElementById('usersTableBody');
        if (!tbody) return;

        tbody.innerHTML = '';
        
        if (!users || users.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="9" class="text-center py-5">
                        <div class="empty-state">
                            <i class="fas fa-users fa-2x"></i>
                            <p>لا يوجد مستخدمين</p>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        users.forEach(user => {
            const row = document.createElement('tr');
            
            // Calculate time since last activity
            const lastActive = new Date(user.lastActive);
            const now = new Date();
            const diffHours = Math.floor((now - lastActive) / (1000 * 60 * 60));
            let lastActiveText;
            
            if (diffHours < 1) {
                lastActiveText = 'الآن';
            } else if (diffHours < 24) {
                lastActiveText = `قبل ${diffHours} ساعة`;
            } else {
                lastActiveText = lastActive.toLocaleDateString('ar-SA');
            }

            // Determine status
            let statusClass, statusText;
            if (user.isBanned) {
                statusClass = 'status-banned';
                statusText = 'محظور';
            } else if (user.isOnline) {
                statusClass = 'status-online';
                statusText = 'متصل';
            } else {
                statusClass = 'status-offline';
                statusText = 'غير متصل';
            }

            row.innerHTML = `
                <td>${user._id.toString().slice(-6)}</td>
                <td>
                    <img src="${user.profileImage || 'https://via.placeholder.com/40'}" 
                         alt="${user.username}" 
                         class="user-avatar"
                         onerror="this.src='https://via.placeholder.com/40'">
                </td>
                <td><strong>${user.username}</strong></td>
                <td>${user.email}</td>
                <td>${user.phone || 'غير محدد'}</td>
                <td><strong>$${user.balance?.toFixed(2) || '0.00'}</strong></td>
                <td>
                    <span class="status-badge ${statusClass}">${statusText}</span>
                </td>
                <td>${lastActiveText}</td>
                <td>
                    <button class="btn-action btn-view" title="عرض" onclick="admin.showUserDetails('${user._id}')">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="btn-action btn-edit" title="تعديل" onclick="admin.editUser('${user._id}')">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-action btn-ban" title="حظر" onclick="admin.showBanModal('${user._id}', '${user.username}')">
                        <i class="fas fa-ban"></i>
                    </button>
                </td>
            `;
            
            tbody.appendChild(row);
        });
    }

    renderUsersPagination(totalPages, currentPage) {
        const pagination = document.getElementById('usersPagination');
        if (!pagination) return;

        pagination.innerHTML = '';
        
        // Previous button
        const prevLi = document.createElement('li');
        prevLi.className = `page-item ${currentPage === 1 ? 'disabled' : ''}`;
        prevLi.innerHTML = `
            <a class="page-link" href="#" onclick="admin.loadUsers(${currentPage - 1})">
                <i class="fas fa-chevron-right"></i>
            </a>
        `;
        pagination.appendChild(prevLi);

        // Page numbers
        const startPage = Math.max(1, currentPage - 2);
        const endPage = Math.min(totalPages, currentPage + 2);
        
        for (let i = startPage; i <= endPage; i++) {
            const pageLi = document.createElement('li');
            pageLi.className = `page-item ${i === currentPage ? 'active' : ''}`;
            pageLi.innerHTML = `
                <a class="page-link" href="#" onclick="admin.loadUsers(${i})">${i}</a>
            `;
            pagination.appendChild(pageLi);
        }

        // Next button
        const nextLi = document.createElement('li');
        nextLi.className = `page-item ${currentPage === totalPages ? 'disabled' : ''}`;
        nextLi.innerHTML = `
            <a class="page-link" href="#" onclick="admin.loadUsers(${currentPage + 1})">
                <i class="fas fa-chevron-left"></i>
            </a>
        `;
        pagination.appendChild(nextLi);
    }

    async showUserDetails(userId) {
        try {
            const response = await fetch(`/api/admin/users/${userId}`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to load user details');
            }

            const data = await response.json();
            
            if (data.success) {
                this.renderUserDetailsModal(data);
            }
        } catch (error) {
            console.error('Error loading user details:', error);
            this.showToast('فشل تحميل تفاصيل المستخدم', 'error');
        }
    }

    renderUserDetailsModal(data) {
        const { user, transactions, battles, stats } = data;
        
        const modalHTML = `
            <div class="modal-overlay active" id="userDetailsModal">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3><i class="fas fa-user"></i> تفاصيل المستخدم: ${user.username}</h3>
                        <button class="modal-close">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="modal-body">
                        <div class="row">
                            <div class="col-md-4">
                                <div class="user-profile-section text-center">
                                    <img src="${user.profileImage || 'https://via.placeholder.com/150'}" 
                                         alt="${user.username}" 
                                         class="img-fluid rounded-circle mb-3"
                                         style="width: 150px; height: 150px; object-fit: cover;"
                                         onerror="this.src='https://via.placeholder.com/150'">
                                    <h4>${user.username}</h4>
                                    <p class="text-muted">ID: ${user._id}</p>
                                    
                                    <div class="user-status mb-3">
                                        ${user.isBanned ? 
                                            '<span class="badge bg-danger">محظور</span>' : 
                                            user.isOnline ? 
                                            '<span class="badge bg-success">متصل</span>' : 
                                            '<span class="badge bg-secondary">غير متصل</span>'
                                        }
                                        ${user.isAdmin ? '<span class="badge bg-warning ms-1">مدير</span>' : ''}
                                    </div>
                                </div>
                            </div>
                            
                            <div class="col-md-8">
                                <div class="user-info-section">
                                    <h5><i class="fas fa-info-circle"></i> المعلومات الأساسية</h5>
                                    <div class="table-responsive">
                                        <table class="table table-sm">
                                            <tbody>
                                                <tr>
                                                    <th>البريد الإلكتروني:</th>
                                                    <td>${user.email}</td>
                                                </tr>
                                                <tr>
                                                    <th>رقم الهاتف:</th>
                                                    <td>${user.phone || 'غير محدد'}</td>
                                                </tr>
                                                <tr>
                                                    <th>الجنس:</th>
                                                    <td>${user.gender === 'male' ? 'ذكر' : 'أنثى'}</td>
                                                </tr>
                                                <tr>
                                                    <th>العمر:</th>
                                                    <td>${user.age || 'غير محدد'}</td>
                                                </tr>
                                                <tr>
                                                    <th>الحالة الاجتماعية:</th>
                                                    <td>${this.getRelationshipText(user.relationship)}</td>
                                                </tr>
                                                <tr>
                                                    <th>المستوى التعليمي:</th>
                                                    <td>${this.getEducationText(user.education)}</td>
                                                </tr>
                                                <tr>
                                                    <th>تاريخ التسجيل:</th>
                                                    <td>${new Date(user.createdAt).toLocaleString('ar-SA')}</td>
                                                </tr>
                                                <tr>
                                                    <th>آخر نشاط:</th>
                                                    <td>${new Date(user.lastActive).toLocaleString('ar-SA')}</td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                    
                                    <h5 class="mt-4"><i class="fas fa-chart-line"></i> الإحصائيات</h5>
                                    <div class="row">
                                        <div class="col-6">
                                            <div class="stat-item">
                                                <small>الرصيد</small>
                                                <h4>$${user.balance?.toFixed(2) || '0.00'}</h4>
                                            </div>
                                        </div>
                                        <div class="col-6">
                                            <div class="stat-item">
                                                <small>العملات</small>
                                                <h4>${user.coins?.toLocaleString() || '0'}</h4>
                                            </div>
                                        </div>
                                        <div class="col-6">
                                            <div class="stat-item">
                                                <small>المستوى</small>
                                                <h4>${user.level || '1'}</h4>
                                            </div>
                                        </div>
                                        <div class="col-6">
                                            <div class="stat-item">
                                                <small>نسبة الفوز</small>
                                                <h4>${stats.winRate?.toFixed(1) || '0'}%</h4>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div class="row mt-3">
                                        <div class="col-6">
                                            <div class="stat-item">
                                                <small>إجمالي الشحن</small>
                                                <h4>$${user.totalDeposited?.toFixed(2) || '0.00'}</h4>
                                            </div>
                                        </div>
                                        <div class="col-6">
                                            <div class="stat-item">
                                                <small>إجمالي السحب</small>
                                                <h4>$${user.totalWithdrawn?.toFixed(2) || '0.00'}</h4>
                                            </div>
                                        </div>
                                        <div class="col-6">
                                            <div class="stat-item">
                                                <small>إجمالي الربح</small>
                                                <h4>$${user.totalWon?.toFixed(2) || '0.00'}</h4>
                                            </div>
                                        </div>
                                        <div class="col-6">
                                            <div class="stat-item">
                                                <small>إجمالي الخسارة</small>
                                                <h4>$${user.totalLost?.toFixed(2) || '0.00'}</h4>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <div class="row mt-4">
                            <div class="col-12">
                                <h5><i class="fas fa-history"></i> آخر المعاملات</h5>
                                <div class="table-responsive">
                                    <table class="table table-sm">
                                        <thead>
                                            <tr>
                                                <th>التاريخ</th>
                                                <th>النوع</th>
                                                <th>المبلغ</th>
                                                <th>الحالة</th>
                                                <th>الوصف</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            ${transactions.slice(0, 5).map(tx => `
                                                <tr>
                                                    <td>${new Date(tx.createdAt).toLocaleDateString('ar-SA')}</td>
                                                    <td>
                                                        <span class="badge ${this.getTransactionBadgeClass(tx.type)}">
                                                            ${this.getTransactionTypeText(tx.type)}
                                                        </span>
                                                    </td>
                                                    <td class="${tx.amount < 0 ? 'text-danger' : 'text-success'}">
                                                        ${tx.amount > 0 ? '+' : ''}${tx.amount.toFixed(2)} ${tx.currency}
                                                    </td>
                                                    <td>
                                                        <span class="badge ${this.getStatusBadgeClass(tx.status)}">
                                                            ${this.getStatusText(tx.status)}
                                                        </span>
                                                    </td>
                                                    <td>${tx.description || '-'}</td>
                                                </tr>
                                            `).join('')}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                        
                        <div class="row mt-4">
                            <div class="col-12">
                                <h5><i class="fas fa-gamepad"></i> آخر التحديات</h5>
                                <div class="table-responsive">
                                    <table class="table table-sm">
                                        <thead>
                                            <tr>
                                                <th>التاريخ</th>
                                                <th>النوع</th>
                                                <th>الرهان</th>
                                                <th>الحالة</th>
                                                <th>النتيجة</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            ${battles.slice(0, 5).map(battle => `
                                                <tr>
                                                    <td>${new Date(battle.createdAt).toLocaleDateString('ar-SA')}</td>
                                                    <td>${battle.type}</td>
                                                    <td>$${battle.teamA[0]?.betAmount || '0'}</td>
                                                    <td>
                                                        <span class="badge ${this.getBattleStatusBadgeClass(battle.status)}">
                                                            ${this.getBattleStatusText(battle.status)}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        ${battle.winner ? 
                                                            (battle.winner === 'teamA' && battle.teamA.some(p => p.user?.toString() === user._id.toString()) ||
                                                             battle.winner === 'teamB' && battle.teamB.some(p => p.user?.toString() === user._id.toString()) ?
                                                             '<span class="text-success">فوز</span>' : 
                                                             '<span class="text-danger">خسارة</span>') :
                                                            '<span class="text-muted">-</span>'
                                                        }
                                                    </td>
                                                </tr>
                                            `).join('')}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" onclick="admin.closeModal('userDetailsModal')">
                            إغلاق
                        </button>
                        ${!user.isBanned ? `
                            <button class="btn btn-danger" onclick="admin.showBanModal('${user._id}', '${user.username}')">
                                <i class="fas fa-ban"></i> حظر
                            </button>
                        ` : `
                            <button class="btn btn-success" onclick="admin.unbanUser('${user._id}')">
                                <i class="fas fa-check"></i> إلغاء الحظر
                            </button>
                        `}
                        <button class="btn btn-warning" onclick="admin.editUser('${user._id}')">
                            <i class="fas fa-edit"></i> تعديل
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHTML);
    }

    showBanModal(userId, username) {
        const modalHTML = `
            <div class="modal-overlay active" id="banUserModal">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3><i class="fas fa-ban"></i> حظر المستخدم: ${username}</h3>
                        <button class="modal-close">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="modal-body">
                        <form id="banForm">
                            <div class="mb-3">
                                <label for="banReason" class="form-label">سبب الحظر</label>
                                <textarea class="form-control" id="banReason" rows="3" required 
                                          placeholder="أدخل سبب الحظر..."></textarea>
                            </div>
                            <div class="mb-3">
                                <label for="banDuration" class="form-label">مدة الحظر (أيام)</label>
                                <input type="number" class="form-control" id="banDuration" 
                                       min="1" placeholder="اترك فارغًا للحظر الدائم">
                                <div class="form-text">اترك الحقل فارغًا للحظر الدائم</div>
                            </div>
                            <div class="mb-3">
                                <label for="banNotes" class="form-label">ملاحظات إضافية</label>
                                <textarea class="form-control" id="banNotes" rows="2"
                                          placeholder="ملاحظات إضافية (اختياري)..."></textarea>
                            </div>
                        </form>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" onclick="admin.closeModal('banUserModal')">
                            إلغاء
                        </button>
                        <button class="btn btn-danger" onclick="admin.confirmBanUser('${userId}')">
                            <i class="fas fa-ban"></i> تأكيد الحظر
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHTML);
    }

    async confirmBanUser(userId) {
        const reason = document.getElementById('banReason').value;
        const duration = document.getElementById('banDuration').value;
        
        if (!reason.trim()) {
            this.showToast('يرجى إدخال سبب الحظر', 'error');
            return;
        }

        try {
            const response = await fetch(`/api/admin/users/${userId}/ban`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify({
                    reason,
                    duration: duration ? parseInt(duration) : null
                })
            });

            if (!response.ok) {
                throw new Error('Failed to ban user');
            }

            const data = await response.json();
            
            if (data.success) {
                this.showToast('تم حظر المستخدم بنجاح', 'success');
                this.closeModal('banUserModal');
                this.closeModal('userDetailsModal');
                this.loadUsers(); // Refresh users list
            }
        } catch (error) {
            console.error('Error banning user:', error);
            this.showToast('فشل حظر المستخدم', 'error');
        }
    }

    async unbanUser(userId) {
        if (!confirm('هل أنت متأكد من إلغاء حظر هذا المستخدم؟')) {
            return;
        }

        try {
            const response = await fetch(`/api/admin/users/${userId}/unban`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to unban user');
            }

            const data = await response.json();
            
            if (data.success) {
                this.showToast('تم إلغاء حظر المستخدم بنجاح', 'success');
                this.closeModal('userDetailsModal');
                this.loadUsers(); // Refresh users list
            }
        } catch (error) {
            console.error('Error unbanning user:', error);
            this.showToast('فشل إلغاء حظر المستخدم', 'error');
        }
    }

    async editUser(userId) {
        // Implementation for edit user modal
        this.showToast('ميزة التعديل قيد التطوير', 'info');
    }

    async searchUsers(searchTerm) {
        await this.loadUsers(1, searchTerm);
    }

    async loadTransactions() {
        // Implementation for transactions page
        this.showToast('صفحة المعاملات قيد التطوير', 'info');
    }

    async loadWithdrawals() {
        // Implementation for withdrawals page
        this.showToast('صفحة طلبات السحب قيد التطوير', 'info');
    }

    async loadDeposits() {
        // Implementation for deposits page
        this.showToast('صفحة طلبات الشحن قيد التطوير', 'info');
    }

    async loadBattles() {
        // Implementation for battles page
        this.showToast('صفحة التحديات قيد التطوير', 'info');
    }

    async loadGifts() {
        // Implementation for gifts page
        this.showToast('صفحة الهدايا قيد التطوير', 'info');
    }

    async loadLogs() {
        // Implementation for logs page
        this.showToast('صفحة السجلات قيد التطوير', 'info');
    }

    async loadSettings() {
        // Implementation for settings page
        this.showToast('صفحة الإعدادات قيد التطوير', 'info');
    }

    initSocket() {
        const socketUrl = window.location.hostname === 'localhost' 
            ? 'http://localhost:5000'
            : window.location.origin;
        
        this.socket = io(`${socketUrl}/admin`, {
            auth: {
                token: this.token
            }
        });

        this.socket.on('connect', () => {
            console.log('✅ Admin socket connected');
        });

        this.socket.on('disconnect', () => {
            console.log('❌ Admin socket disconnected');
        });

        this.socket.on('connect_error', (error) => {
            console.error('Admin socket connection error:', error);
        });

        // Handle real-time updates
        this.socket.on('initial-admin-data', (data) => {
            console.log('Received initial admin data:', data);
        });

        this.socket.on('user-activities', (activities) => {
            // Update real-time activities
        });

        this.socket.on('user-message', (message) => {
            // Monitor user messages
        });

        this.socket.on('battle-created', (battle) => {
            // New battle created
        });

        this.socket.on('admin-notification', (notification) => {
            this.showToast(notification.message, notification.type);
        });
    }

    updateAdminInfo() {
        const adminNameElement = document.getElementById('adminName');
        if (adminNameElement && this.adminData.username) {
            adminNameElement.textContent = this.adminData.username;
        }
    }

    startAutoRefresh() {
        // Auto refresh dashboard every 30 seconds
        setInterval(() => {
            if (this.currentPage === 'dashboard') {
                this.loadDashboard();
            }
        }, 30000);
    }

    logout() {
        localStorage.removeItem('adminToken');
        localStorage.removeItem('adminData');
        
        if (this.socket) {
            this.socket.disconnect();
        }
        
        window.location.href = '/admin-login.html';
    }

    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.remove();
        }
    }

    showToast(message, type = 'info') {
        // Remove existing toasts
        document.querySelectorAll('.admin-toast').forEach(toast => toast.remove());
        
        const toast = document.createElement('div');
        toast.className = `admin-toast toast-${type}`;
        toast.innerHTML = `
            <div class="toast-content">
                <i class="fas fa-${type === 'success' ? 'check-circle' : 
                                  type === 'error' ? 'exclamation-circle' : 
                                  type === 'warning' ? 'exclamation-triangle' : 'info-circle'}"></i>
                <span>${message}</span>
            </div>
            <button class="toast-close" onclick="this.parentElement.remove()">
                <i class="fas fa-times"></i>
            </button>
        `;
        
        document.body.appendChild(toast);
        
        // Auto remove after 5 seconds
        setTimeout(() => {
            if (toast.parentElement) {
                toast.remove();
            }
        }, 5000);
    }

    // Helper methods for text conversion
    getRelationshipText(relationship) {
        const relationships = {
            'single': 'أعزب',
            'married': 'متزوج',
            'divorced': 'مطلق',
            'relationship': 'في علاقة',
            'other': 'أخرى'
        };
        return relationships[relationship] || 'غير محدد';
    }

    getEducationText(education) {
        const educations = {
            'student': 'طالب',
            'graduate': 'متخرج',
            'uneducated': 'غير متعلم',
            'other': 'أخرى'
        };
        return educations[education] || 'غير محدد';
    }

    getTransactionTypeText(type) {
        const types = {
            'deposit': 'شحن',
            'withdrawal': 'سحب',
            'bet': 'رهان',
            'win': 'ربح',
            'loss': 'خسارة',
            'gift_send': 'إرسال هدية',
            'gift_receive': 'استلام هدية',
            'commission': 'عمولة'
        };
        return types[type] || type;
    }

    getTransactionBadgeClass(type) {
        const classes = {
            'deposit': 'bg-success',
            'withdrawal': 'bg-warning',
            'bet': 'bg-info',
            'win': 'bg-success',
            'loss': 'bg-danger',
            'gift_send': 'bg-primary',
            'gift_receive': 'bg-info',
            'commission': 'bg-secondary'
        };
        return classes[type] || 'bg-secondary';
    }

    getStatusText(status) {
        const statuses = {
            'pending': 'قيد الانتظار',
            'completed': 'مكتمل',
            'failed': 'فشل',
            'cancelled': 'ملغي'
        };
        return statuses[status] || status;
    }

    getStatusBadgeClass(status) {
        const classes = {
            'pending': 'bg-warning',
            'completed': 'bg-success',
            'failed': 'bg-danger',
            'cancelled': 'bg-secondary'
        };
        return classes[status] || 'bg-secondary';
    }

    getBattleStatusText(status) {
        const statuses = {
            'waiting': 'في الانتظار',
            'ready': 'جاهز',
            'in_progress': 'جاري',
            'completed': 'منتهي',
            'cancelled': 'ملغي'
        };
        return statuses[status] || status;
    }

    getBattleStatusBadgeClass(status) {
        const classes = {
            'waiting': 'bg-info',
            'ready': 'bg-primary',
            'in_progress': 'bg-warning',
            'completed': 'bg-success',
            'cancelled': 'bg-danger'
        };
        return classes[status] || 'bg-secondary';
    }

    loadCurrentPage() {
        const hash = window.location.hash.substring(1) || 'dashboard';
        this.switchPage(hash);
        
        // Update URL hash when switching pages
        window.addEventListener('hashchange', () => {
            const newHash = window.location.hash.substring(1) || 'dashboard';
            if (newHash !== this.currentPage) {
                this.switchPage(newHash);
            }
        });
    }
}

// Add CSS for toasts
const toastCSS = `
    .admin-toast {
        position: fixed;
        top: 20px;
        left: 20px;
        right: 20px;
        max-width: 400px;
        margin: 0 auto;
        background: white;
        border-radius: 10px;
        padding: 15px 20px;
        box-shadow: 0 5px 20px rgba(0, 0, 0, 0.15);
        display: flex;
        align-items: center;
        justify-content: space-between;
        z-index: 9999;
        animation: slideDown 0.3s ease;
    }
    
    .toast-success {
        border-right: 4px solid #27ae60;
    }
    
    .toast-error {
        border-right: 4px solid #e74c3c;
    }
    
    .toast-warning {
        border-right: 4px solid #f39c12;
    }
    
    .toast-info {
        border-right: 4px solid #3498db;
    }
    
    .toast-content {
        display: flex;
        align-items: center;
        gap: 10px;
        flex: 1;
    }
    
    .toast-content i {
        font-size: 1.2rem;
    }
    
    .toast-success .toast-content i {
        color: #27ae60;
    }
    
    .toast-error .toast-content i {
        color: #e74c3c;
    }
    
    .toast-warning .toast-content i {
        color: #f39c12;
    }
    
    .toast-info .toast-content i {
        color: #3498db;
    }
    
    .toast-close {
        background: none;
        border: none;
        color: #95a5a6;
        cursor: pointer;
        padding: 5px;
        font-size: 1rem;
    }
    
    @keyframes slideDown {
        from {
            opacity: 0;
            transform: translateY(-20px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }
`;

const style = document.createElement('style');
style.textContent = toastCSS;
document.head.appendChild(style);

// Initialize admin dashboard
const admin = new AdminDashboard();

// Export for use in HTML
window.admin = admin;
