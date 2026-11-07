<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import {
  BookOutlined,
  CheckCircleOutlined,
  DatabaseOutlined,
  FileTextOutlined,
  FlagOutlined,
  LockOutlined,
  LogoutOutlined,
  SafetyCertificateOutlined,
  SearchOutlined,
  SettingOutlined,
  StopOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons-vue';
import { message, Modal } from 'ant-design-vue';
import { apiErrorMessage } from '@/api/http';
import {
  apiAdminBooks,
  apiAdminMe,
  apiAdminOrganizationAdmins,
  apiAdminOrganizations,
  apiAdminPosts,
  apiAdminReportAction,
  apiAdminReports,
  apiAdminSetBookStatus,
  apiAdminSetPostStatus,
  apiAdminSetUserStatus,
  apiAdminSettings,
  apiAdminStats,
  apiAdminUpdateSetting,
  apiAdminUpsertOrganizationAdmin,
  apiAdminUsers,
  apiOrgLogin,
  apiOrganization,
  apiOrgUnlock,
  apiSqlLogin,
  clearAdminSession,
  getAdminSession,
  getAdminToken,
  saveAdminSession,
  type AdminBook,
  type AdminIdentity,
  type AdminOrganization,
  type AdminOrganizationRow,
  type AdminPost,
  type AdminReport,
  type AdminStats,
  type AdminUser,
  type OrganizationAdminRow,
  type SystemSettingRow,
} from '@/api/admin';

type PortalMode = 'org' | 'sql';
type Phase = 'loading' | 'gate' | 'login' | 'dashboard' | 'error';
type TabKey = 'reports' | 'posts' | 'books' | 'users' | 'organizations' | 'settings';

const route = useRoute();
const mode = computed<PortalMode>(() => (route.name === 'sql-admin' ? 'sql' : 'org'));
const orgCode = computed(() => String(route.params.orgCode || '001'));

const phase = ref<Phase>('loading');
const organization = ref<AdminOrganization | null>(null);
const admin = ref<AdminIdentity | null>(null);
const gateToken = ref('');
const gatePassword = ref('');
const gateLoading = ref(false);
const loginUsername = ref('');
const loginPassword = ref('');
const loginLoading = ref(false);
const authError = ref('');
const pageError = ref('');

const isDeveloper = computed(() => admin.value?.scope === 'sql');
const portalTitle = computed(() =>
  isDeveloper.value ? 'SQL 开发者管理系统' : '组织管理后台',
);
const portalSubtitle = computed(() =>
  isDeveloper.value ? '开发者高权限控制台' : organization.value?.name || `组织 ${orgCode.value}`,
);

const activeTab = ref<TabKey>('reports');
const stats = ref<AdminStats>({ pendingReports: 0, posts: 0, books: 0, blockedUsers: 0, users: 0 });
const statsLoading = ref(false);

const reports = ref<AdminReport[]>([]);
const reportsLoading = ref(false);
const reportPage = ref(1);
const reportTotal = ref(0);
const reportStatus = ref<'0' | 'all'>('0');
const reportPageSize = 8;

const posts = ref<AdminPost[]>([]);
const postsLoading = ref(false);
const postPage = ref(1);
const postTotal = ref(0);
const postQuery = ref('');
const postPageSize = 10;

const books = ref<AdminBook[]>([]);
const booksLoading = ref(false);
const bookPage = ref(1);
const bookTotal = ref(0);
const bookQuery = ref('');
const bookPageSize = 10;

const users = ref<AdminUser[]>([]);
const usersLoading = ref(false);
const userPage = ref(1);
const userTotal = ref(0);
const userQuery = ref('');
const userPageSize = 10;

const organizations = ref<AdminOrganizationRow[]>([]);
const orgAdmins = ref<OrganizationAdminRow[]>([]);
const settings = ref<SystemSettingRow[]>([]);
const developerLoading = ref(false);
const orgAdminForm = ref({ orgCode: '001', username: '', password: '', displayName: '' });
const settingDraft = ref<Record<string, string>>({});

const tabLabel = computed(() => {
  const labels: Record<TabKey, string> = {
    reports: '举报处理',
    posts: '文章管理',
    books: '图书管理',
    users: '用户管理',
    organizations: '组织管理',
    settings: '系统设置',
  };
  return labels[activeTab.value];
});

function formatTime(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value.includes('T') ? value : value.replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', { hour12: false });
}

function handleAuthError(error: unknown) {
  const status = (error as { response?: { status?: number } })?.response?.status;
  if (status === 401) {
    clearAdminSession();
    admin.value = null;
    phase.value = 'gate';
    authError.value = '管理员登录已过期，请重新验证';
    return true;
  }
  return false;
}

async function loadStats() {
  statsLoading.value = true;
  try {
    stats.value = await apiAdminStats();
  } catch (error) {
    if (!handleAuthError(error)) message.error(apiErrorMessage(error));
  } finally {
    statsLoading.value = false;
  }
}

async function loadReports() {
  reportsLoading.value = true;
  try {
    const data = await apiAdminReports({
      page: reportPage.value,
      size: reportPageSize,
      status: reportStatus.value === 'all' ? 'all' : 0,
    });
    reports.value = data.list;
    reportTotal.value = data.total;
  } catch (error) {
    if (!handleAuthError(error)) message.error(apiErrorMessage(error));
  } finally {
    reportsLoading.value = false;
  }
}

async function loadPosts() {
  postsLoading.value = true;
  try {
    const data = await apiAdminPosts({ page: postPage.value, size: postPageSize, q: postQuery.value.trim() });
    posts.value = data.list;
    postTotal.value = data.total;
  } catch (error) {
    if (!handleAuthError(error)) message.error(apiErrorMessage(error));
  } finally {
    postsLoading.value = false;
  }
}

async function loadBooks() {
  booksLoading.value = true;
  try {
    const data = await apiAdminBooks({ page: bookPage.value, size: bookPageSize, q: bookQuery.value.trim() });
    books.value = data.list;
    bookTotal.value = data.total;
  } catch (error) {
    if (!handleAuthError(error)) message.error(apiErrorMessage(error));
  } finally {
    booksLoading.value = false;
  }
}

async function loadUsers() {
  usersLoading.value = true;
  try {
    const data = await apiAdminUsers({ page: userPage.value, size: userPageSize, q: userQuery.value.trim() });
    users.value = data.list;
    userTotal.value = data.total;
  } catch (error) {
    if (!handleAuthError(error)) message.error(apiErrorMessage(error));
  } finally {
    usersLoading.value = false;
  }
}

async function loadDeveloperData() {
  if (!isDeveloper.value) return;
  developerLoading.value = true;
  try {
    const [orgResult, adminResult, settingResult] = await Promise.all([
      apiAdminOrganizations(),
      apiAdminOrganizationAdmins(),
      apiAdminSettings(),
    ]);
    organizations.value = orgResult.list;
    orgAdmins.value = adminResult.list;
    settings.value = settingResult.list;
    settingDraft.value = Object.fromEntries(settingResult.list.map((item) => [item.key, item.value]));
  } catch (error) {
    if (!handleAuthError(error)) message.error(apiErrorMessage(error));
  } finally {
    developerLoading.value = false;
  }
}

async function loadInitial() {
  await Promise.all([
    loadStats(),
    loadReports(),
    ...(isDeveloper.value ? [loadDeveloperData()] : []),
  ]);
}

function sessionMatches() {
  const saved = getAdminSession();
  if (!saved || !getAdminToken()) return null;
  if (mode.value === 'sql') {
    if (saved.admin.scope !== 'sql') {
      clearAdminSession();
      return null;
    }
    return saved;
  }
  if (saved.admin.scope !== 'org' || saved.organization?.code !== orgCode.value) {
    clearAdminSession();
    return null;
  }
  return saved;
}

async function init() {
  phase.value = 'loading';
  authError.value = '';
  pageError.value = '';
  gateToken.value = '';
  gatePassword.value = '';
  loginUsername.value = '';
  loginPassword.value = '';
  activeTab.value = 'reports';

  const saved = sessionMatches();
  if (saved) {
    try {
      const me = await apiAdminMe();
      const valid =
        mode.value === 'sql'
          ? me.admin.scope === 'sql'
          : me.admin.scope === 'org' && me.organization?.code === orgCode.value;
      if (valid) {
        admin.value = me.admin;
        organization.value = me.organization;
        phase.value = 'dashboard';
        await loadInitial();
        return;
      }
      clearAdminSession();
    } catch {
      clearAdminSession();
    }
  }

  if (mode.value === 'sql') {
    admin.value = null;
    organization.value = null;
    phase.value = 'gate';
    return;
  }

  try {
    const result = await apiOrganization(orgCode.value);
    organization.value = result.organization;
    admin.value = null;
    phase.value = 'gate';
  } catch (error) {
    pageError.value = apiErrorMessage(error);
    phase.value = 'error';
  }
}

async function submitGate() {
  if (!gatePassword.value) {
    authError.value = mode.value === 'sql' ? '请输入 SQL 开发者系统密码' : '请输入组织系统密码';
    return;
  }
  gateLoading.value = true;
  authError.value = '';
  try {
    if (mode.value === 'sql') {
      const session = await apiSqlLogin(gatePassword.value);
      saveAdminSession(session);
      admin.value = session.admin;
      organization.value = null;
      gatePassword.value = '';
      phase.value = 'dashboard';
      await loadInitial();
      return;
    }
    const result = await apiOrgUnlock(orgCode.value, gatePassword.value);
    gateToken.value = result.gateToken;
    organization.value = result.organization;
    gatePassword.value = '';
    phase.value = 'login';
  } catch (error) {
    authError.value = apiErrorMessage(error);
  } finally {
    gateLoading.value = false;
  }
}

async function submitLogin() {
  if (!loginUsername.value.trim() || !loginPassword.value) {
    authError.value = '请输入组织管理员账号和个人登录密码';
    return;
  }
  if (!gateToken.value) {
    phase.value = 'gate';
    authError.value = '组织验证已过期，请重新输入系统密码';
    return;
  }
  loginLoading.value = true;
  authError.value = '';
  try {
    const session = await apiOrgLogin(orgCode.value, gateToken.value, loginUsername.value.trim(), loginPassword.value);
    saveAdminSession(session);
    admin.value = session.admin;
    organization.value = session.organization;
    loginPassword.value = '';
    phase.value = 'dashboard';
    await loadInitial();
  } catch (error) {
    authError.value = apiErrorMessage(error);
  } finally {
    loginLoading.value = false;
  }
}

function logout() {
  clearAdminSession();
  admin.value = null;
  gateToken.value = '';
  loginUsername.value = '';
  loginPassword.value = '';
  authError.value = '';
  phase.value = 'gate';
}

function onTabChange(key: string | number) {
  activeTab.value = key as TabKey;
  if (key === 'posts' && !posts.value.length) void loadPosts();
  if (key === 'books' && !books.value.length) void loadBooks();
  if (key === 'users' && !users.value.length) void loadUsers();
  if ((key === 'organizations' || key === 'settings') && isDeveloper.value) void loadDeveloperData();
}

function onReportPage(page: number) {
  reportPage.value = page;
  void loadReports();
}

function onPostPage(page: number) {
  postPage.value = page;
  void loadPosts();
}

function onBookPage(page: number) {
  bookPage.value = page;
  void loadBooks();
}

function onUserPage(page: number) {
  userPage.value = page;
  void loadUsers();
}

function searchPosts() {
  postPage.value = 1;
  void loadPosts();
}

function searchBooks() {
  bookPage.value = 1;
  void loadBooks();
}

function searchUsers() {
  userPage.value = 1;
  void loadUsers();
}

function changeReportFilter(value: string | number) {
  reportStatus.value = value as '0' | 'all';
  reportPage.value = 1;
  void loadReports();
}

async function handleReport(report: AdminReport, action: 'dismiss' | 'remove_post' | 'remove_book' | 'block_user') {
  const targetLabel = report.targetType === 'book' ? '图书' : '文章';
  const messages: Record<string, string> = {
    dismiss: '忽略这条举报？',
    remove_post: '下架这篇被举报的文章？',
    remove_book: '下架这本被举报的图书？',
    block_user: `封锁该${targetLabel}的作者/上传者？封锁后该用户将无法登录和发言。`,
  };
  Modal.confirm({
    title: '确认操作',
    content: messages[action],
    okText: '确认',
    cancelText: '取消',
    okType: action === 'dismiss' ? 'default' : 'danger',
    async onOk() {
      try {
        await apiAdminReportAction(report.id, action);
        message.success(action === 'dismiss' ? '已忽略举报' : '处理完成');
        await Promise.all([loadReports(), loadStats()]);
        if (action === 'remove_post') await loadPosts();
        if (action === 'remove_book') await loadBooks();
        if (action === 'block_user') await loadUsers();
      } catch (error) {
        if (!handleAuthError(error)) message.error(apiErrorMessage(error));
      }
    },
  });
}

async function setPostStatus(post: AdminPost, status: number) {
  Modal.confirm({
    title: status === 1 ? '恢复文章' : '下架文章',
    content: status === 1 ? '确认恢复这篇文章？' : '确认下架这篇文章？下架后普通用户将无法看到。',
    okText: '确认',
    cancelText: '取消',
    okType: status === 1 ? 'default' : 'danger',
    async onOk() {
      try {
        await apiAdminSetPostStatus(post.id, status);
        message.success(status === 1 ? '文章已恢复' : '文章已下架');
        await Promise.all([loadPosts(), loadStats(), loadReports()]);
      } catch (error) {
        if (!handleAuthError(error)) message.error(apiErrorMessage(error));
      }
    },
  });
}

async function setBookStatus(book: AdminBook, status: number) {
  Modal.confirm({
    title: status === 1 ? '恢复图书' : '下架图书',
    content: status === 1 ? '确认恢复这本图书？' : '确认下架这本图书？下架后普通用户将无法阅读和下载。',
    okText: '确认',
    cancelText: '取消',
    okType: status === 1 ? 'default' : 'danger',
    async onOk() {
      try {
        await apiAdminSetBookStatus(book.id, status);
        message.success(status === 1 ? '图书已恢复' : '图书已下架');
        await Promise.all([loadBooks(), loadStats(), loadReports()]);
      } catch (error) {
        if (!handleAuthError(error)) message.error(apiErrorMessage(error));
      }
    },
  });
}

async function setUserStatus(user: AdminUser, status: number) {
  Modal.confirm({
    title: status === 1 ? '解除封锁' : '封锁用户',
    content: status === 1 ? `确认解除对「${user.nickname}」的封锁？` : `确认封锁「${user.nickname}」？封锁后该用户将无法登录和发言，文章 / 图书 / 主页也会隐藏。`,
    okText: '确认',
    cancelText: '取消',
    okType: status === 1 ? 'default' : 'danger',
    async onOk() {
      try {
        await apiAdminSetUserStatus(user.id, status);
        message.success(status === 1 ? '已解除封锁' : '用户已封锁，内容已隐藏');
        await Promise.all([loadUsers(), loadStats(), loadReports()]);
      } catch (error) {
        if (!handleAuthError(error)) message.error(apiErrorMessage(error));
      }
    },
  });
}

async function submitOrgAdmin() {
  const form = orgAdminForm.value;
  if (!form.orgCode.trim() || !form.username.trim() || !form.password) {
    message.error('请填写组织编号、管理员账号和密码');
    return;
  }
  try {
    const result = await apiAdminUpsertOrganizationAdmin({
      orgCode: form.orgCode.trim(),
      username: form.username.trim(),
      password: form.password,
      displayName: form.displayName.trim(),
    });
    message.success(result.updated ? '组织管理员已更新' : '组织管理员已创建');
    orgAdminForm.value = { orgCode: '001', username: '', password: '', displayName: '' };
    await loadDeveloperData();
  } catch (error) {
    if (!handleAuthError(error)) message.error(apiErrorMessage(error));
  }
}

async function saveSetting(key: string) {
  const value = (settingDraft.value[key] || '').trim();
  if (!value) {
    message.error('设置值不能为空');
    return;
  }
  try {
    await apiAdminUpdateSetting(key, value);
    message.success('系统设置已保存');
    await loadDeveloperData();
  } catch (error) {
    if (!handleAuthError(error)) message.error(apiErrorMessage(error));
  }
}

onMounted(init);
watch([() => route.name, orgCode], init);
</script>

<template>
  <div class="admin-page">
    <div v-if="phase === 'loading'" class="admin-center">
      <a-spin size="large" />
      <p class="loading-text">正在验证管理入口...</p>
    </div>

    <div v-else-if="phase === 'error'" class="admin-center">
      <div class="admin-error-card">
        <h2>无法进入管理后台</h2>
        <p>{{ pageError || '组织不存在或已停用' }}</p>
        <a-button type="primary" href="/">返回社区首页</a-button>
      </div>
    </div>

    <div v-else-if="phase === 'gate' || phase === 'login'" class="admin-auth-page">
      <div class="auth-decor" aria-hidden="true">
        <span class="auth-star">★</span>
        <span class="auth-ring ring-one"></span>
        <span class="auth-ring ring-two"></span>
      </div>
      <section class="admin-auth-card">
        <header class="auth-head">
          <div class="auth-brand">
            <span class="brand-mark">★</span>
            <div>
              <h1>{{ mode === 'sql' ? 'SQL' : '赤光社' }}</h1>
              <p>R E D L I G H T · {{ portalTitle }}</p>
            </div>
          </div>
          <span class="org-chip">
            <template v-if="mode === 'sql'">开发者</template>
            <template v-else>组织 {{ orgCode }} · {{ organization?.name }}</template>
          </span>
        </header>

        <div v-if="mode === 'org'" class="auth-steps">
          <span class="auth-step" :class="{ active: phase === 'gate', done: phase === 'login' }">1 系统验证</span>
          <span class="auth-step-line"></span>
          <span class="auth-step" :class="{ active: phase === 'login' }">2 个人验证</span>
        </div>

        <div v-if="phase === 'gate'" class="auth-body" data-testid="admin-gate">
          <span class="auth-icon"><LockOutlined /></span>
          <h2 v-if="mode === 'sql'">SQL 开发者系统</h2>
          <h2 v-else>第一级 · 组织系统密码</h2>
          <p v-if="mode === 'sql'" class="auth-desc">请输入 SQL 开发者系统密码，进入高权限开发管理控制台。</p>
          <p v-else class="auth-desc">请输入组织系统密码；该密码保存在 SQL 系统设置中，可由开发者修改。</p>
          <label class="auth-field">
            <span>{{ mode === 'sql' ? '开发者系统密码' : '组织系统密码' }}</span>
            <a-input-password
              v-model:value="gatePassword"
              size="large"
              :placeholder="mode === 'sql' ? '请输入 SQL 开发者系统密码' : '请输入组织系统密码'"
              data-testid="admin-gate-password"
              @press-enter="submitGate"
            />
          </label>
          <p v-if="authError" class="auth-error" data-testid="admin-auth-error">{{ authError }}</p>
          <a-button type="primary" size="large" block :loading="gateLoading" data-testid="admin-gate-submit" @click="submitGate">
            {{ mode === 'sql' ? '进入 SQL 管理系统' : '下一步' }}
          </a-button>
        </div>

        <div v-else class="auth-body" data-testid="admin-login">
          <span class="auth-icon"><SafetyCertificateOutlined /></span>
          <h2>第二级 · 组织管理员验证</h2>
          <p class="auth-desc">系统密码已通过。请输入「{{ organization?.name }}」的组织管理员个人账号和密码。</p>
          <label class="auth-field">
            <span>管理员账号</span>
            <a-input
              v-model:value="loginUsername"
              size="large"
              placeholder="请输入管理员账号"
              autocomplete="username"
              data-testid="admin-username"
            >
              <template #prefix><UserOutlined /></template>
            </a-input>
          </label>
          <label class="auth-field">
            <span>个人登录密码</span>
            <a-input-password
              v-model:value="loginPassword"
              size="large"
              placeholder="请输入个人登录密码"
              autocomplete="current-password"
              data-testid="admin-password"
              @press-enter="submitLogin"
            />
          </label>
          <p v-if="authError" class="auth-error" data-testid="admin-auth-error">{{ authError }}</p>
          <a-button type="primary" size="large" block :loading="loginLoading" data-testid="admin-login-submit" @click="submitLogin">
            进入组织管理后台
          </a-button>
          <button class="auth-back" type="button" @click="phase = 'gate'; authError = ''">返回上一步</button>
        </div>

        <footer class="auth-foot">
          {{ mode === 'sql' ? 'SQL 开发者系统拥有更高管理权限，请谨慎操作' : '此入口仅限组织管理员使用 · 请妥善保管账号密码与系统密码' }}
        </footer>
      </section>
    </div>

    <template v-else>
      <header class="admin-header">
        <div class="admin-brand">
          <span class="brand-mark">★</span>
          <div>
            <strong>赤光社 · {{ portalTitle }}</strong>
            <span>
              <template v-if="isDeveloper">开发者高权限控制台 <em>SQL</em></template>
              <template v-else>{{ organization?.name }} <em>组织 {{ orgCode }}</em></template>
            </span>
          </div>
        </div>
        <div class="admin-account">
          <span class="admin-who"><UserOutlined /> {{ admin?.displayName }} <em>@{{ admin?.username }}</em></span>
          <button class="admin-logout" type="button" data-testid="admin-logout" @click="logout">
            <LogoutOutlined /> 退出后台
          </button>
        </div>
      </header>

      <main class="admin-main" data-testid="admin-dashboard">
        <div class="admin-title-row">
          <div>
            <h2>管理概览</h2>
            <p>处理社区举报，维护文章、图书和用户秩序。</p>
          </div>
          <span class="admin-live"><CheckCircleOutlined /> 管理员已登录</span>
        </div>

        <section class="stat-grid" :class="{ loading: statsLoading }">
          <div class="stat-card">
            <span class="stat-icon red"><FlagOutlined /></span>
            <div><strong>{{ stats.pendingReports }}</strong><span>待处理举报</span></div>
          </div>
          <div class="stat-card">
            <span class="stat-icon ink"><FileTextOutlined /></span>
            <div><strong>{{ stats.posts }}</strong><span>文章总数</span></div>
          </div>
          <div class="stat-card">
            <span class="stat-icon gold"><BookOutlined /></span>
            <div><strong>{{ stats.books }}</strong><span>图书总数</span></div>
          </div>
          <div class="stat-card">
            <span class="stat-icon gray"><StopOutlined /></span>
            <div><strong>{{ stats.blockedUsers }}</strong><span>已封锁用户</span></div>
          </div>
        </section>

        <section class="admin-panel">
          <a-tabs v-model:activeKey="activeTab" class="admin-tabs" @change="onTabChange">
            <a-tab-pane key="reports">
              <template #tab><FlagOutlined /> 举报处理 <span v-if="stats.pendingReports" class="tab-badge">{{ stats.pendingReports }}</span></template>
              <div class="panel-toolbar">
                <div class="panel-heading"><h3>举报队列</h3><span>共 {{ reportTotal }} 条</span></div>
                <a-segmented
                  :value="reportStatus"
                  :options="[{ label: '待处理', value: '0' }, { label: '全部', value: 'all' }]"
                  @change="changeReportFilter"
                />
              </div>

              <a-spin :spinning="reportsLoading">
                <div v-if="!reports.length" class="admin-empty">暂无举报，社区秩序良好。</div>
                <div v-else class="report-list" data-testid="admin-report-list">
                  <article v-for="report in reports" :key="report.id" class="report-card">
                    <div class="report-top">
                      <span class="report-type">{{ report.targetType === 'book' ? '图书举报' : '文章举报' }}</span>
                      <span class="report-reason">{{ report.reason }}</span>
                      <span class="report-status" :class="{ handled: report.status !== 0 }">
                        {{ report.status === 0 ? '待处理' : report.status === 2 ? '已忽略' : '已处理' }}
                      </span>
                      <time>{{ formatTime(report.createdAt) }}</time>
                    </div>
                    <h4 class="report-target">{{ report.target?.title || `内容 #${report.targetId}` }}</h4>
                    <p class="report-detail">{{ report.detail || '举报人未填写补充说明' }}</p>
                    <div class="report-meta">
                      <span>举报人：{{ report.reporter.nickname }}<em v-if="report.reporter.username">@{{ report.reporter.username }}</em></span>
                      <span v-if="report.target?.author || report.target?.uploader">
                        作者：
                        {{ report.target.author?.nickname || report.target.uploader?.nickname }}
                        <em v-if="report.target.author?.username || report.target.uploader?.username">
                          @{{ report.target.author?.username || report.target.uploader?.username }}
                        </em>
                      </span>
                      <span>目标状态：{{ report.target?.status === 1 ? '正常展示' : '已下架' }}</span>
                    </div>
                    <div class="report-actions" v-if="report.status === 0">
                      <a-button danger size="small" data-testid="admin-remove-target" @click="handleReport(report, report.targetType === 'book' ? 'remove_book' : 'remove_post')">
                        {{ report.targetType === 'book' ? '下架图书' : '下架文章' }}
                      </a-button>
                      <a-button danger ghost size="small" data-testid="admin-block-author" @click="handleReport(report, 'block_user')">
                        {{ report.targetType === 'book' ? '封锁上传者' : '封锁作者' }}
                      </a-button>
                      <a-button size="small" data-testid="admin-dismiss-report" @click="handleReport(report, 'dismiss')">忽略</a-button>
                    </div>
                  </article>
                </div>
                <a-pagination
                  v-if="reportTotal > reportPageSize"
                  class="admin-pagination"
                  :current="reportPage"
                  :total="reportTotal"
                  :page-size="reportPageSize"
                  :show-size-changer="false"
                  @change="onReportPage"
                />
              </a-spin>
            </a-tab-pane>

            <a-tab-pane key="posts">
              <template #tab><FileTextOutlined /> 文章管理</template>
              <div class="panel-toolbar">
                <div class="panel-heading"><h3>文章列表</h3><span>共 {{ postTotal }} 篇</span></div>
                <div class="search-row">
                  <a-input v-model:value="postQuery" placeholder="搜索文章正文" allow-clear @press-enter="searchPosts">
                    <template #prefix><SearchOutlined /></template>
                  </a-input>
                  <a-button type="primary" ghost @click="searchPosts">搜索</a-button>
                </div>
              </div>
              <a-spin :spinning="postsLoading">
                <div v-if="!posts.length" class="admin-empty">暂无文章。</div>
                <div v-else class="manage-list">
                  <article v-for="post in posts" :key="post.id" class="manage-row">
                    <div class="manage-main">
                      <div class="manage-title">
                        <span class="manage-id">#{{ post.id }}</span>
                        <span>{{ post.content.slice(0, 80) || '(无正文)' }}</span>
                      </div>
                      <div class="manage-meta">
                        <span>{{ post.author.nickname }} <em v-if="post.author.username">@{{ post.author.username }}</em></span>
                        <span v-if="post.author.communityNo">社区号 {{ post.author.communityNo }}</span>
                        <span>{{ formatTime(post.createdAt) }}</span>
                      </div>
                    </div>
                    <span class="status-tag" :class="post.status === 1 ? 'ok' : 'off'">{{ post.status === 1 ? '正常' : '已下架' }}</span>
                    <a-button
                      size="small"
                      :danger="post.status === 1"
                      @click="setPostStatus(post, post.status === 1 ? 0 : 1)"
                    >
                      {{ post.status === 1 ? '下架' : '恢复' }}
                    </a-button>
                  </article>
                </div>
                <a-pagination v-if="postTotal > postPageSize" class="admin-pagination" :current="postPage" :total="postTotal" :page-size="postPageSize" :show-size-changer="false" @change="onPostPage" />
              </a-spin>
            </a-tab-pane>

            <a-tab-pane key="books">
              <template #tab><BookOutlined /> 图书管理</template>
              <div class="panel-toolbar">
                <div class="panel-heading"><h3>图书列表</h3><span>共 {{ bookTotal }} 本</span></div>
                <div class="search-row">
                  <a-input v-model:value="bookQuery" placeholder="搜索书名 / 作者" allow-clear @press-enter="searchBooks">
                    <template #prefix><SearchOutlined /></template>
                  </a-input>
                  <a-button type="primary" ghost @click="searchBooks">搜索</a-button>
                </div>
              </div>
              <a-spin :spinning="booksLoading">
                <div v-if="!books.length" class="admin-empty">暂无图书。</div>
                <div v-else class="manage-list">
                  <article v-for="book in books" :key="book.id" class="manage-row book-row">
                    <img class="manage-cover" :src="book.coverUrl || '/uploads/images/default-cover.svg'" :alt="book.title" />
                    <div class="manage-main">
                      <div class="manage-title"><span class="manage-id">#{{ book.id }}</span> {{ book.title }}</div>
                      <div class="manage-meta">
                        <span>{{ book.author }}</span>
                        <span>{{ book.category }}</span>
                        <span>上传者：{{ book.uploader.nickname }}</span>
                        <span>{{ formatTime(book.createdAt) }}</span>
                      </div>
                    </div>
                    <span class="status-tag" :class="book.status === 1 ? 'ok' : 'off'">{{ book.status === 1 ? '正常' : '已下架' }}</span>
                    <a-button size="small" :danger="book.status === 1" @click="setBookStatus(book, book.status === 1 ? 0 : 1)">
                      {{ book.status === 1 ? '下架' : '恢复' }}
                    </a-button>
                  </article>
                </div>
                <a-pagination v-if="bookTotal > bookPageSize" class="admin-pagination" :current="bookPage" :total="bookTotal" :page-size="bookPageSize" :show-size-changer="false" @change="onBookPage" />
              </a-spin>
            </a-tab-pane>

            <a-tab-pane key="users">
              <template #tab><TeamOutlined /> 用户管理</template>
              <div class="panel-toolbar">
                <div class="panel-heading"><h3>用户列表</h3><span>共 {{ userTotal }} 人</span></div>
                <div class="search-row">
                  <a-input v-model:value="userQuery" placeholder="搜索昵称 / ID / 社区号 / 邮箱" allow-clear @press-enter="searchUsers">
                    <template #prefix><SearchOutlined /></template>
                  </a-input>
                  <a-button type="primary" ghost @click="searchUsers">搜索</a-button>
                </div>
              </div>
              <a-spin :spinning="usersLoading">
                <div v-if="!users.length" class="admin-empty">暂无用户。</div>
                <div v-else class="manage-list">
                  <article v-for="user in users" :key="user.id" class="manage-row">
                    <div class="manage-main">
                      <div class="manage-title"><span class="manage-id">#{{ user.id }}</span> {{ user.nickname }}</div>
                      <div class="manage-meta">
                        <span v-if="user.username">@{{ user.username }}</span>
                        <span v-if="user.communityNo">社区号 {{ user.communityNo }}</span>
                        <span>{{ user.email }}</span>
                        <span>{{ formatTime(user.createdAt) }}</span>
                      </div>
                    </div>
                    <span class="status-tag" :class="user.status === 1 ? 'ok' : 'off'">{{ user.status === 1 ? '正常' : '已封锁' }}</span>
                    <a-button size="small" :danger="user.status === 1" @click="setUserStatus(user, user.status === 1 ? 0 : 1)">
                      {{ user.status === 1 ? '封锁' : '解除封锁' }}
                    </a-button>
                  </article>
                </div>
                <a-pagination v-if="userTotal > userPageSize" class="admin-pagination" :current="userPage" :total="userTotal" :page-size="userPageSize" :show-size-changer="false" @change="onUserPage" />
              </a-spin>
            </a-tab-pane>
            <a-tab-pane v-if="isDeveloper" key="organizations">
              <template #tab><DatabaseOutlined /> 组织管理</template>
              <a-spin :spinning="developerLoading">
                <div class="panel-heading developer-heading"><h3>组织与管理员</h3><span>SQL 开发者专属</span></div>
                <div class="dev-org-list">
                  <div v-for="org in organizations" :key="org.code" class="dev-org-card">
                    <strong>{{ org.name }}</strong>
                    <span>组织 {{ org.code }} · {{ org.adminCount }} 名管理员 · {{ org.status === 1 ? '启用' : '停用' }}</span>
                  </div>
                </div>
                <div class="manage-list">
                  <article v-for="item in orgAdmins" :key="item.id" class="manage-row">
                    <div class="manage-main">
                      <div class="manage-title"><span class="manage-id">#{{ item.id }}</span> {{ item.displayName }}</div>
                      <div class="manage-meta">
                        <span>@{{ item.username }}</span>
                        <span>组织 {{ item.orgCode }}</span>
                        <span>最后登录：{{ formatTime(item.lastLoginAt) }}</span>
                      </div>
                    </div>
                    <span class="status-tag" :class="item.status === 1 ? 'ok' : 'off'">{{ item.status === 1 ? '启用' : '停用' }}</span>
                  </article>
                </div>

                <div class="dev-form">
                  <h4>创建 / 重置组织管理员</h4>
                  <div class="dev-form-grid">
                    <a-input v-model:value="orgAdminForm.orgCode" placeholder="组织编号，如 001" />
                    <a-input v-model:value="orgAdminForm.username" placeholder="管理员账号" />
                    <a-input v-model:value="orgAdminForm.displayName" placeholder="显示名称" />
                    <a-input-password v-model:value="orgAdminForm.password" placeholder="个人密码，至少 8 位" />
                  </div>
                  <a-button type="primary" ghost @click="submitOrgAdmin">保存组织管理员</a-button>
                </div>
              </a-spin>
            </a-tab-pane>

            <a-tab-pane v-if="isDeveloper" key="settings">
              <template #tab><SettingOutlined /> 系统设置</template>
              <a-spin :spinning="developerLoading">
                <div class="panel-heading developer-heading"><h3>SQL 系统设置</h3><span>可直接在数据库 SQL 中修改</span></div>
                <div class="settings-list">
                  <div v-for="item in settings" :key="item.key" class="setting-row">
                    <div class="setting-meta">
                      <strong>{{ item.key }}</strong>
                      <span>{{ item.key === 'org.001.gate_password' ? '组织 001 的第一级系统密码' : '系统配置项' }} · 更新于 {{ formatTime(item.updatedAt) }}</span>
                    </div>
                    <div class="setting-edit">
                      <a-input v-model:value="settingDraft[item.key]" />
                      <a-button type="primary" ghost @click="saveSetting(item.key)">保存</a-button>
                    </div>
                  </div>
                </div>
                <p class="settings-tip">
                  也可直接执行：<code>UPDATE system_settings SET value = '新密码' WHERE setting_key = 'org.001.gate_password';</code>
                </p>
              </a-spin>
            </a-tab-pane>
          </a-tabs>
        </section>

        <footer class="admin-footer">
          <span>赤光社 RedLight · {{ tabLabel }} · {{ isDeveloper ? 'SQL 开发者系统' : `组织 ${orgCode}` }}</span>
          <span>{{ isDeveloper ? '高权限操作，请谨慎使用' : '举报处理会记录处理人，请谨慎操作' }}</span>
        </footer>
      </main>
    </template>
  </div>
</template>

<style scoped>
.admin-page {
  min-height: 100vh;
  background:
    radial-gradient(circle at 12% 0%, rgba(212, 175, 55, 0.08), transparent 30%),
    #f6f3ee;
  color: var(--rl-text);
}

.admin-center {
  display: flex;
  min-height: 100vh;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
}

.loading-text {
  color: var(--rl-text-secondary);
  font-size: 13px;
}

.admin-error-card {
  max-width: 420px;
  padding: 34px;
  border: 1px solid var(--rl-border);
  border-radius: 10px;
  background: #fff;
  text-align: center;
  box-shadow: var(--rl-shadow);
}

.admin-error-card h2 {
  margin: 0 0 8px;
  font-family: var(--rl-serif);
  font-size: 20px;
}

.admin-error-card p {
  margin: 0 0 20px;
  color: var(--rl-text-secondary);
  font-size: 13px;
}

/* 登录门禁 */
.admin-auth-page {
  position: relative;
  display: flex;
  min-height: 100vh;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  padding: 24px;
  background:
    linear-gradient(135deg, rgba(139, 0, 0, 0.96), rgba(200, 16, 46, 0.88)),
    #8b0000;
}

.auth-decor {
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0.12;
}

.auth-star {
  position: absolute;
  top: 16%;
  left: 14%;
  color: #f3d27a;
  font-size: 120px;
}

.auth-ring {
  position: absolute;
  border: 2px solid #f3d27a;
  border-radius: 50%;
}

.ring-one {
  right: 10%;
  bottom: -120px;
  width: 420px;
  height: 420px;
}

.ring-two {
  right: 18%;
  bottom: -40px;
  width: 260px;
  height: 260px;
}

.admin-auth-card {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 470px;
  padding: 28px 30px 20px;
  border-radius: 12px;
  background: #fdfbf7;
  box-shadow: 0 24px 80px rgba(45, 10, 10, 0.35);
}

.auth-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.auth-brand {
  display: flex;
  align-items: center;
  gap: 10px;
}

.brand-mark {
  display: inline-flex;
  width: 34px;
  height: 34px;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--rl-primary);
  color: #f7df9e;
  font-size: 19px;
}

.auth-brand h1 {
  margin: 0;
  color: var(--rl-text);
  font-family: var(--rl-serif);
  font-size: 22px;
  letter-spacing: 2px;
}

.auth-brand p {
  margin: 2px 0 0;
  color: var(--rl-text-secondary);
  font-size: 9px;
  letter-spacing: 0.8px;
}

.org-chip {
  padding: 3px 8px;
  border: 1px solid #eadfca;
  border-radius: 10px;
  background: #fbf6ea;
  color: #8a6b32;
  font-size: 10px;
  white-space: nowrap;
}

.auth-steps {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 24px 0 20px;
}

.auth-step {
  color: #ada294;
  font-size: 11px;
}

.auth-step.active {
  color: var(--rl-primary);
  font-weight: 600;
}

.auth-step.done {
  color: #56805d;
}

.auth-step-line {
  width: 40px;
  height: 1px;
  background: var(--rl-border);
}

.auth-body {
  text-align: left;
}

.auth-icon {
  display: inline-flex;
  width: 38px;
  height: 38px;
  align-items: center;
  justify-content: center;
  border-radius: 9px;
  background: #fff1f0;
  color: var(--rl-primary);
  font-size: 19px;
}

.auth-body h2 {
  margin: 12px 0 5px;
  font-family: var(--rl-serif);
  font-size: 20px;
}

.auth-desc {
  margin: 0 0 18px;
  color: var(--rl-text-secondary);
  font-size: 12px;
  line-height: 1.7;
}

.auth-field {
  display: block;
  margin-bottom: 14px;
}

.auth-field > span {
  display: block;
  margin-bottom: 5px;
  color: var(--rl-text-tertiary);
  font-size: 12px;
}

.auth-error {
  margin: -4px 0 12px;
  color: var(--rl-primary);
  font-size: 12px;
}

.auth-back {
  display: block;
  margin: 12px auto 0;
  border: none;
  background: transparent;
  color: var(--rl-text-secondary);
  font-size: 11px;
  cursor: pointer;
}

.auth-back:hover {
  color: var(--rl-primary);
}

.auth-foot {
  margin-top: 22px;
  padding-top: 12px;
  border-top: 1px solid var(--rl-border-light);
  color: #b3a489;
  font-size: 10px;
  text-align: center;
}

/* 后台框架 */
.admin-header {
  display: flex;
  min-height: 66px;
  align-items: center;
  justify-content: space-between;
  padding: 0 28px;
  background: #8b0000;
  color: #fff;
  box-shadow: 0 2px 12px rgba(80, 0, 0, 0.18);
}

.admin-brand {
  display: flex;
  align-items: center;
  gap: 11px;
}

.admin-brand .brand-mark {
  background: #d4af37;
  color: #6f0d0d;
}

.admin-brand strong {
  display: block;
  font-family: var(--rl-serif);
  font-size: 16px;
  letter-spacing: 1px;
}

.admin-brand span span,
.admin-brand > div > span {
  display: block;
  margin-top: 2px;
  color: rgba(255, 255, 255, 0.68);
  font-size: 11px;
}

.admin-brand em {
  font-style: normal;
  opacity: 0.7;
}

.admin-account {
  display: flex;
  align-items: center;
  gap: 16px;
}

.admin-who {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: rgba(255, 255, 255, 0.86);
  font-size: 12px;
}

.admin-who em {
  color: rgba(255, 255, 255, 0.55);
  font-style: normal;
}

.admin-logout {
  display: inline-flex;
  height: 30px;
  align-items: center;
  gap: 5px;
  padding: 0 10px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 5px;
  background: transparent;
  color: #fff;
  font-family: inherit;
  font-size: 11px;
  cursor: pointer;
}

.admin-logout:hover {
  background: rgba(255, 255, 255, 0.1);
}

.admin-main {
  max-width: 1180px;
  margin: 0 auto;
  padding: 24px 24px 14px;
}

.admin-title-row {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.admin-title-row h2 {
  margin: 0;
  font-family: var(--rl-serif);
  font-size: 22px;
}

.admin-title-row p {
  margin: 4px 0 0;
  color: var(--rl-text-secondary);
  font-size: 12px;
}

.admin-live {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #56805d;
  font-size: 11px;
}

.stat-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 16px;
}

.stat-card {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 15px 16px;
  border: 1px solid var(--rl-border-light);
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 2px 8px rgba(80, 50, 30, 0.04);
}

.stat-icon {
  display: inline-flex;
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  font-size: 17px;
}

.stat-icon.red {
  background: #fff1f0;
  color: var(--rl-primary);
}

.stat-icon.ink {
  background: #f2f0ec;
  color: #5f5248;
}

.stat-icon.gold {
  background: #fdf6e8;
  color: #a88138;
}

.stat-icon.gray {
  background: #f1f2f4;
  color: #7d838b;
}

.stat-card strong {
  display: block;
  font-size: 21px;
  line-height: 1.1;
}

.stat-card span:not(.stat-icon) {
  display: block;
  margin-top: 3px;
  color: var(--rl-text-secondary);
  font-size: 11px;
}

.admin-panel {
  overflow: hidden;
  border: 1px solid var(--rl-border-light);
  border-radius: 9px;
  background: #fff;
  box-shadow: 0 2px 10px rgba(80, 50, 30, 0.04);
}

.admin-tabs :deep(.ant-tabs-nav) {
  margin: 0;
  padding: 0 20px;
  background: #fff;
}

.admin-tabs :deep(.ant-tabs-tab) {
  padding: 13px 0;
  font-size: 13px;
}

.admin-tabs :deep(.ant-tabs-content-holder) {
  padding: 18px 20px 20px;
}

.tab-badge {
  display: inline-block;
  min-width: 16px;
  margin-left: 3px;
  padding: 0 4px;
  border-radius: 8px;
  background: #fff1f0;
  color: var(--rl-primary);
  font-size: 10px;
  line-height: 16px;
  text-align: center;
}

.panel-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.panel-heading {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.panel-heading h3 {
  margin: 0;
  font-size: 14px;
}

.panel-heading span {
  color: var(--rl-text-secondary);
  font-size: 11px;
}

.search-row {
  display: flex;
  gap: 6px;
  width: min(360px, 48vw);
}

.search-row :deep(.ant-input-affix-wrapper) {
  border-color: var(--rl-border);
}

.admin-empty {
  padding: 50px 20px;
  color: var(--rl-text-secondary);
  font-size: 12px;
  text-align: center;
}

.admin-pagination {
  margin-top: 16px;
  text-align: right;
}

/* 举报卡片 */
.report-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.report-card {
  padding: 13px 14px;
  border: 1px solid var(--rl-border-light);
  border-left: 3px solid #e0b4b9;
  border-radius: 6px;
  background: #fffdfb;
}

.report-top {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 7px;
}

.report-type,
.report-reason,
.report-status {
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 10px;
  line-height: 17px;
}

.report-type {
  background: #f2f0ec;
  color: #5f5248;
}

.report-reason {
  background: #fff1f0;
  color: var(--rl-primary);
}

.report-status {
  background: #fdf6e8;
  color: #9b732c;
}

.report-status.handled {
  background: #f1f2f4;
  color: #7d838b;
}

.report-top time {
  margin-left: auto;
  color: #b3a489;
  font-size: 10px;
}

.report-target {
  margin: 9px 0 4px;
  font-family: var(--rl-serif);
  font-size: 14px;
}

.report-detail {
  margin: 0 0 7px;
  color: var(--rl-text-secondary);
  font-size: 12px;
  line-height: 1.6;
}

.report-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 5px 15px;
  color: #9b9287;
  font-size: 10px;
}

.report-meta em {
  font-style: normal;
}

.report-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
  padding-top: 9px;
  border-top: 1px dashed var(--rl-border-light);
}

/* 管理列表 */
.manage-list {
  display: flex;
  flex-direction: column;
}

.manage-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 0;
  border-bottom: 1px solid var(--rl-border-light);
}

.manage-row:last-child {
  border-bottom: none;
}

.manage-main {
  min-width: 0;
  flex: 1;
}

.manage-title {
  overflow: hidden;
  color: var(--rl-text);
  font-size: 13px;
  line-height: 1.5;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.manage-id {
  margin-right: 4px;
  color: #b3a489;
  font-family: ui-monospace, monospace;
  font-size: 10px;
}

.manage-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 3px 12px;
  margin-top: 3px;
  color: #9b9287;
  font-size: 10px;
}

.manage-meta em {
  font-style: normal;
}

.manage-cover {
  width: 34px;
  height: 46px;
  flex-shrink: 0;
  border-radius: 3px;
  object-fit: cover;
  background: #eee;
}

.status-tag {
  flex-shrink: 0;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 10px;
  line-height: 17px;
}

.status-tag.ok {
  background: #edf6ef;
  color: #56805d;
}

.status-tag.off {
  background: #f1f2f4;
  color: #7d838b;
}

.admin-footer {
  display: flex;
  justify-content: space-between;
  padding: 16px 2px 2px;
  color: #b3a489;
  font-size: 10px;
}

.developer-heading {
  margin-bottom: 12px;
}

.dev-org-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.dev-org-card {
  display: flex;
  min-width: 200px;
  flex-direction: column;
  gap: 3px;
  padding: 10px 12px;
  border: 1px solid var(--rl-border-light);
  border-radius: 6px;
  background: #fbf9f5;
}

.dev-org-card strong {
  font-size: 13px;
}

.dev-org-card span {
  color: var(--rl-text-secondary);
  font-size: 10px;
}

.dev-form {
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px dashed var(--rl-border-light);
}

.dev-form h4 {
  margin: 0 0 10px;
  font-size: 13px;
}

.dev-form-grid {
  display: grid;
  grid-template-columns: 120px 1fr 1fr 1.2fr;
  gap: 8px;
  margin-bottom: 10px;
}

.settings-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 12px;
  border: 1px solid var(--rl-border-light);
  border-radius: 6px;
  background: #fbf9f5;
}

.setting-meta {
  min-width: 0;
}

.setting-meta strong {
  display: block;
  color: var(--rl-text);
  font-family: ui-monospace, monospace;
  font-size: 12px;
}

.setting-meta span {
  display: block;
  margin-top: 2px;
  color: var(--rl-text-secondary);
  font-size: 10px;
}

.setting-edit {
  display: flex;
  width: min(420px, 48%);
  gap: 6px;
}

.settings-tip {
  margin: 14px 0 0;
  color: var(--rl-text-secondary);
  font-size: 11px;
  line-height: 1.7;
}

.settings-tip code {
  padding: 1px 4px;
  border-radius: 3px;
  background: #f2f0ec;
  color: #6b4f36;
  font-family: ui-monospace, monospace;
  font-size: 10px;
}

@media (max-width: 860px) {
  .admin-header {
    padding: 0 16px;
  }

  .admin-who {
    display: none;
  }

  .admin-main {
    padding: 18px 14px 10px;
  }

  .stat-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .panel-toolbar {
    align-items: flex-start;
    flex-direction: column;
  }

  .search-row {
    width: 100%;
  }

  .auth-head {
    flex-direction: column;
  }

  .admin-auth-card {
    padding: 24px 20px 16px;
  }

  .report-top time {
    width: 100%;
    margin-left: 0;
  }
}

@media (max-width: 520px) {
  .stat-grid {
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  .stat-card {
    padding: 11px;
  }

  .stat-card strong {
    font-size: 18px;
  }

  .stat-icon {
    width: 30px;
    height: 30px;
    font-size: 14px;
  }

  .admin-tabs :deep(.ant-tabs-nav) {
    padding: 0 10px;
  }

  .admin-tabs :deep(.ant-tabs-content-holder) {
    padding: 14px 12px;
  }

  .admin-title-row {
    align-items: flex-start;
    flex-direction: column;
  }

  .manage-row {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .manage-row .status-tag {
    margin-left: auto;
  }

  .admin-footer {
    flex-direction: column;
    gap: 4px;
  }
}
</style>
