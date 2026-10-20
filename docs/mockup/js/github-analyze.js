/**
 * github-analyze.js — Simulated "Connect & analyze your GitHub" flow.
 *
 * Entry points:
 *   Codi.github.openConnect({ returnTo })  — Codi consent → account picker → GitHub permission → analyzing → result stored
 *   Codi.github.stateFor(userId)           — { connected, username, analyzedAt, result }
 *   Codi.github.isConnected()              — true if current user has an analysis
 *
 * Routes:
 *   /github/analysis   — view the latest stored result for the current learner
 *
 * Everything is mocked: three canned profiles map to the three sample learner e-mails. Any other
 * handle falls back to a generic "polyglot beginner" profile. No network calls, no OAuth.
 * Lives inside Codi.ensure('githubAnalysis', ...) so it survives route changes and prototype reloads
 * until the storage version bumps.
 */
(function () {
  'use strict';
  const { html, icon, ui, raw } = Codi;
  const store = () => Codi.ensure('githubAnalysis', () => ({ byUser: {} }));

  // ───────────────────────── mock profiles ─────────────────────────
  // Three deliberate personas so switching the sample learner changes the result visibly.
  // Each profile lists language share (0..1), top repos, and the course IDs Codi should recommend.
  const PROFILES = {
    'minhanh@codi.vn': {
      handle: 'minhanh-codi', name: 'Minh Anh',
      languages: [
        { name: 'JavaScript', color: '#f1e05a', share: 0.52 },
        { name: 'TypeScript', color: '#3178c6', share: 0.18 },
        { name: 'HTML',       color: '#e34c26', share: 0.14 },
        { name: 'CSS',        color: '#563d7c', share: 0.10 },
        { name: 'Python',     color: '#3572a5', share: 0.06 },
      ],
      repos: [
        { name: 'format-price',  lang: 'JavaScript', desc: 'Bài tập format tiền tệ VND cho khoá JS nền tảng.', updated: '2 tuần trước', fork: false, stars: 2 },
        { name: 'portfolio-v2',  lang: 'TypeScript', desc: 'Trang portfolio Next.js, dùng server components.', updated: '1 tháng trước', fork: false, stars: 8 },
        { name: 'awesome-vue',   lang: 'JavaScript', desc: 'Danh sách tài nguyên Vue mình đóng góp PR.', updated: '3 tháng trước', fork: true, stars: 0 },
        { name: 'leetcode-js',   lang: 'JavaScript', desc: 'Lời giải LeetCode bằng JavaScript, có test.', updated: '2 ngày trước', fork: false, stars: 1 },
      ],
      summary: 'Chủ yếu viết JavaScript ở frontend, bắt đầu quen TypeScript. Mảng cần luyện: Node.js phía server và Git nâng cao.',
      // Four-stop mastery per domain (0 Chưa thấy · 1 Mới học · 2 Đang vững · 3 Thành thạo),
      // reused by the result page and by the AI advisor's context prompt.
      understanding: {
        headline: 'Frontend đang vững, backend và kiểm thử còn mỏng.',
        level: {
          frontend: { stop: 2, label: 'Đang vững', note: 'React 1,5 năm · bắt đầu dùng TypeScript thực chiến' },
          backend:  { stop: 1, label: 'Mới học',   note: 'Chưa có repo API phía server; chỉ fetch từ client' },
          data:     { stop: 0, label: 'Chưa thấy', note: 'Không có notebook hay script xử lý dữ liệu' },
          devops:   { stop: 1, label: 'Mới học',   note: 'Dùng Git branch tốt, chưa có GitHub Actions' },
          testing:  { stop: 1, label: 'Mới học',   note: 'Có vài file Jest trong repo LeetCode' },
        },
      },
      tech: [
        { group: 'Frontend', items: [
          { name: 'React', uses: 6, last: '2 ngày trước', confidence: 'high' },
          { name: 'Next.js (App Router)', uses: 1, last: '1 tháng trước', confidence: 'medium' },
          { name: 'Vue (fork)', uses: 1, last: '3 tháng trước', confidence: 'low' },
        ] },
        { group: 'Styling', items: [
          { name: 'Tailwind CSS', uses: 3, last: '2 tuần trước', confidence: 'medium' },
          { name: 'CSS Modules', uses: 2, last: '1 tháng trước', confidence: 'medium' },
        ] },
        { group: 'Công cụ & kiểm thử', items: [
          { name: 'Git', uses: 24, last: 'Hôm nay', confidence: 'medium' },
          { name: 'ESLint + Prettier', uses: 4, last: '2 tuần trước', confidence: 'medium' },
          { name: 'Jest', uses: 2, last: '2 tuần trước', confidence: 'low' },
        ] },
      ],
      signals: [
        { kind: 'good', label: 'Commit đều đặn', detail: '412 commit trong 12 tháng, trung bình 8 commit/tuần.' },
        { kind: 'good', label: 'Có bộ test', detail: '2/4 repo chính có Jest; LeetCode repo có 36 test đạt.' },
        { kind: 'warn', label: 'Chưa có CI/CD', detail: 'Không thấy workflow trong `.github/workflows` của repo nào.' },
        { kind: 'warn', label: 'Fork chưa đồng bộ', detail: '`awesome-vue` đi sau upstream khoảng 3 tháng.' },
      ],
      gaps: [
        { label: 'Chưa có API phía server', hint: 'Node + REST là bước tiếp phù hợp để làm sản phẩm hoàn chỉnh.' },
        { label: 'Chưa có repo deploy công khai', hint: 'Thêm một bản Vercel hoặc Netlify để nhà tuyển dụng thử ngay.' },
        { label: 'Dùng TypeScript chưa sâu', hint: 'Mới ở mức type cơ bản, chưa thấy generic hoặc utility type.' },
      ],
      recommend: ['course-ts-001', 'course-node-001', 'course-git-001'],
      recommendWhy: {
        'course-ts-001': 'TS đã chiếm 18% code của bạn — khoá này giúp dùng chắc type và generics.',
        'course-node-001': 'Chưa thấy repo backend; cần Node + REST để làm sản phẩm hoàn chỉnh.',
        'course-git-001': 'Có 2 fork chưa đồng bộ với upstream — ôn lại nhánh và rebase.',
      },
      stats: { repos: 24, stars: 11, followers: 7, following: 15, contribYear: 412 },
    },
    'quocanh@codi.vn': {
      handle: 'quocanh-dev', name: 'Quốc Anh',
      languages: [
        { name: 'Python', color: '#3572a5', share: 0.44 },
        { name: 'Jupyter Notebook', color: '#da5b0b', share: 0.26 },
        { name: 'SQL', color: '#e38c00', share: 0.14 },
        { name: 'JavaScript', color: '#f1e05a', share: 0.10 },
        { name: 'R', color: '#198ce7', share: 0.06 },
      ],
      repos: [
        { name: 'sales-dashboard', lang: 'Python', desc: 'Dashboard phân tích doanh thu bằng Streamlit.', updated: '1 tuần trước', fork: false, stars: 14 },
        { name: 'nlp-vn-sentiment', lang: 'Jupyter Notebook', desc: 'Phân loại cảm xúc tiếng Việt dùng PhoBERT.', updated: '2 tháng trước', fork: false, stars: 23 },
        { name: 'postgres-notes', lang: 'SQL', desc: 'Ghi chú và script PostgreSQL dùng hằng ngày.', updated: '3 tuần trước', fork: false, stars: 5 },
        { name: 'scikit-learn', lang: 'Python', desc: 'Fork của scikit-learn, mình đóng PR nhỏ.', updated: '6 tháng trước', fork: true, stars: 0 },
      ],
      summary: 'Mạnh phân tích dữ liệu Python. Thiếu phần web để trình bày kết quả cho người dùng cuối.',
      understanding: {
        headline: 'Dữ liệu/ML đã chắc, cần phần web để sản phẩm có người dùng cuối.',
        level: {
          frontend: { stop: 1, label: 'Mới học',   note: 'Chỉ có vài trang HTML/JS tĩnh và app Streamlit.' },
          backend:  { stop: 1, label: 'Mới học',   note: 'Có script Flask nhỏ nhưng chưa có API chuẩn REST.' },
          data:     { stop: 3, label: 'Thành thạo', note: 'Pandas, Jupyter, PhoBERT — 586 commit/năm chủ yếu quanh dữ liệu.' },
          devops:   { stop: 1, label: 'Mới học',   note: 'Có Dockerfile cho sales-dashboard, chưa có CI.' },
          testing:  { stop: 2, label: 'Đang vững', note: 'Dùng pytest + fixture ở `nlp-vn-sentiment`.' },
        },
      },
      tech: [
        { group: 'Dữ liệu & ML', items: [
          { name: 'pandas', uses: 12, last: '1 tuần trước', confidence: 'high' },
          { name: 'scikit-learn', uses: 6, last: '1 tháng trước', confidence: 'high' },
          { name: 'Jupyter', uses: 14, last: '1 tuần trước', confidence: 'high' },
          { name: 'PhoBERT / HuggingFace', uses: 3, last: '2 tháng trước', confidence: 'medium' },
          { name: 'matplotlib + seaborn', uses: 10, last: '3 tuần trước', confidence: 'high' },
        ] },
        { group: 'Backend', items: [
          { name: 'FastAPI', uses: 1, last: '2 tháng trước', confidence: 'low' },
          { name: 'Streamlit', uses: 4, last: '1 tuần trước', confidence: 'high' },
          { name: 'PostgreSQL', uses: 5, last: '3 tuần trước', confidence: 'medium' },
        ] },
        { group: 'Công cụ', items: [
          { name: 'Docker', uses: 2, last: '1 tháng trước', confidence: 'medium' },
          { name: 'pytest', uses: 3, last: '2 tháng trước', confidence: 'medium' },
          { name: 'Git', uses: 31, last: 'Hôm nay', confidence: 'medium' },
        ] },
      ],
      signals: [
        { kind: 'good', label: 'Notebook mạch lạc', detail: 'Mọi notebook đều có mục lục và markdown giải thích.' },
        { kind: 'good', label: 'Đóng góp open-source', detail: 'PR nhỏ vào scikit-learn đã merge.' },
        { kind: 'good', label: 'Có Dockerfile', detail: 'sales-dashboard chạy được bằng `docker compose up`.' },
        { kind: 'warn', label: 'Chưa có web app người dùng cuối', detail: 'Toàn bộ sản phẩm vẫn ở trong Streamlit, chưa có UI riêng.' },
      ],
      gaps: [
        { label: 'Chưa có frontend thật', hint: 'Một khoá React giúp đưa dashboard tới người dùng, không chỉ Streamlit.' },
        { label: 'Chưa có kiểu dữ liệu đầu/đuôi API', hint: 'TypeScript giúp giữ type nhất quán giữa API Python và UI.' },
      ],
      recommend: ['course-py-001', 'course-react-001', 'course-ts-001'],
      recommendWhy: {
        'course-py-001': 'Củng cố nền Python và pandas; nối trực tiếp với các notebook của bạn.',
        'course-react-001': 'Thiếu phần giao diện — React giúp đưa dashboard tới người dùng, không chỉ Streamlit.',
        'course-ts-001': 'Khi làm web cùng Python, TypeScript giúp giữ type từ API tới UI.',
      },
      stats: { repos: 31, stars: 48, followers: 22, following: 9, contribYear: 586 },
    },
    'thaolinh@codi.vn': {
      handle: 'thaolinh-react', name: 'Thảo Linh',
      languages: [
        { name: 'TypeScript', color: '#3178c6', share: 0.38 },
        { name: 'JavaScript', color: '#f1e05a', share: 0.22 },
        { name: 'CSS', color: '#563d7c', share: 0.16 },
        { name: 'Go', color: '#00add8', share: 0.14 },
        { name: 'HTML', color: '#e34c26', share: 0.10 },
      ],
      repos: [
        { name: 'todo-app', lang: 'TypeScript', desc: 'Ứng dụng công việc dùng React + reducer.', updated: '4 ngày trước', fork: false, stars: 6 },
        { name: 'design-system', lang: 'TypeScript', desc: 'Bộ component dùng chung cho các dự án nội bộ.', updated: '2 tuần trước', fork: false, stars: 19 },
        { name: 'go-cli-notes', lang: 'Go', desc: 'CLI ghi chú nhanh viết bằng Go.', updated: '1 tháng trước', fork: false, stars: 4 },
        { name: 'next.js', lang: 'JavaScript', desc: 'Fork của Next.js để thử change.', updated: '5 tháng trước', fork: true, stars: 0 },
      ],
      summary: 'Thành thạo React + TypeScript. Có thể mở rộng sang Next.js app router và kiểm thử Jest.',
      understanding: {
        headline: 'Frontend thành thạo, nền quy trình kỹ thuật đã chuẩn — hợp để lên fullstack.',
        level: {
          frontend: { stop: 3, label: 'Thành thạo', note: 'React + TypeScript hơn 2 năm, có design system riêng.' },
          backend:  { stop: 1, label: 'Mới học',    note: 'CLI nhỏ bằng Go, chưa có HTTP service hoàn chỉnh.' },
          data:     { stop: 0, label: 'Chưa thấy',  note: 'Không có repo xử lý dữ liệu.' },
          devops:   { stop: 2, label: 'Đang vững',  note: 'Có GitHub Actions build + test cho design system.' },
          testing:  { stop: 2, label: 'Đang vững',  note: '`design-system` có 180 test, coverage 86%.' },
        },
      },
      tech: [
        { group: 'Frontend', items: [
          { name: 'React', uses: 18, last: '4 ngày trước', confidence: 'high' },
          { name: 'TypeScript', uses: 22, last: '4 ngày trước', confidence: 'high' },
          { name: 'Vite', uses: 6, last: '2 tuần trước', confidence: 'high' },
          { name: 'Storybook', uses: 3, last: '2 tuần trước', confidence: 'medium' },
          { name: 'Radix UI', uses: 2, last: '2 tuần trước', confidence: 'medium' },
        ] },
        { group: 'Backend & công cụ', items: [
          { name: 'Go', uses: 4, last: '1 tháng trước', confidence: 'medium' },
          { name: 'Node CLI', uses: 2, last: '2 tháng trước', confidence: 'medium' },
          { name: 'GitHub Actions', uses: 5, last: '2 tuần trước', confidence: 'medium' },
          { name: 'Docker', uses: 1, last: '3 tháng trước', confidence: 'low' },
        ] },
        { group: 'Kiểm thử', items: [
          { name: 'Jest + Testing Library', uses: 6, last: '4 ngày trước', confidence: 'high' },
          { name: 'Playwright (e2e)', uses: 1, last: '1 tháng trước', confidence: 'medium' },
          { name: 'ESLint config riêng', uses: 3, last: '2 tuần trước', confidence: 'high' },
        ] },
      ],
      signals: [
        { kind: 'good', label: 'CI/CD đầy đủ', detail: 'Design system có workflow build + test + release theo tag.' },
        { kind: 'good', label: 'Coverage cao', detail: 'Design system đạt 86% coverage theo Jest report.' },
        { kind: 'good', label: 'Review quy củ', detail: '48 PR trong 12 tháng, mỗi PR đều có review và changelog.' },
        { kind: 'warn', label: 'Chưa có service backend', detail: 'CLI Go là bước khởi đầu, chưa có API HTTP phục vụ UI.' },
      ],
      gaps: [
        { label: 'Chưa có Next.js app', hint: 'Server components là bước tiếp để làm fullstack cùng React/TS.' },
        { label: 'Chưa áp dụng rõ SOLID', hint: 'Design system cần hướng dẫn tách trách nhiệm khi mở rộng component.' },
      ],
      recommend: ['course-next-001', 'course-jest-001', 'course-solid-001'],
      recommendWhy: {
        'course-next-001': 'React/TS đã chắc — Next.js là bước tiếp để làm fullstack với server components.',
        'course-jest-001': 'Design system cần test đầy đủ; Jest giúp giữ ổn định khi mở rộng.',
        'course-solid-001': 'Code sạch và nguyên tắc SOLID giúp duy trì design system lâu dài.',
      },
      stats: { repos: 42, stars: 74, followers: 38, following: 12, contribYear: 721 },
    },
  };
  // Three sample Google accounts in the picker. The first always matches the current user when possible,
  // the rest let the lecturer try "wrong account" and "cancel" paths without signing out.
  const ACCOUNTS = [
    { email: 'minhanh@codi.vn', name: 'Minh Anh' },
    { email: 'quocanh@codi.vn', name: 'Quốc Anh' },
    { email: 'thaolinh@codi.vn', name: 'Thảo Linh' },
  ];

  function profileFor(email) {
    if (PROFILES[email]) return PROFILES[email];
    // generic fallback so a brand-new sample user still sees a result
    return {
      handle: (email || 'learner').split('@')[0], name: 'Người học',
      languages: [
        { name: 'JavaScript', color: '#f1e05a', share: 0.40 },
        { name: 'HTML', color: '#e34c26', share: 0.30 },
        { name: 'CSS', color: '#563d7c', share: 0.30 },
      ],
      repos: [{ name: 'hello-codi', lang: 'JavaScript', desc: 'Repo đầu tiên của mình trên GitHub.', updated: '1 tuần trước', fork: false, stars: 0 }],
      summary: 'Mới bắt đầu học — ưu tiên nền JavaScript và một khoá nền tảng.',
      understanding: {
        headline: 'Mới làm quen GitHub — ưu tiên nền tảng ngôn ngữ và quy trình.',
        level: {
          frontend: { stop: 1, label: 'Mới học', note: 'Vài file HTML/CSS/JS cơ bản.' },
          backend:  { stop: 0, label: 'Chưa thấy', note: '' },
          data:     { stop: 0, label: 'Chưa thấy', note: '' },
          devops:   { stop: 0, label: 'Chưa thấy', note: 'Chưa thấy commit theo nhánh.' },
          testing:  { stop: 0, label: 'Chưa thấy', note: '' },
        },
      },
      tech: [{ group: 'Ngôn ngữ', items: [{ name: 'JavaScript', uses: 1, confidence: 'low' }, { name: 'HTML/CSS', uses: 1, confidence: 'low' }] }],
      signals: [{ kind: 'warn', label: 'Mới có 1 repo', detail: 'Chưa đủ dữ liệu để Codi đánh giá chi tiết.' }],
      gaps: [{ label: 'Chưa có dự án hoàn chỉnh', hint: 'Làm 1 dự án nhỏ end-to-end sẽ giúp Codi gợi ý chính xác hơn.' }],
      recommend: ['course-js-001', 'course-git-001'],
      recommendWhy: { 'course-js-001': 'Nền JavaScript vững trước khi học framework.', 'course-git-001': 'Giúp quản lý repo đầu tiên gọn gàng.' },
      stats: { repos: 1, stars: 0, followers: 0, following: 0, contribYear: 12 },
    };
  }

  // ───────────────────────── state helpers ─────────────────────────
  function stateFor(userId) {
    const s = store().byUser[userId];
    return s ? { connected: true, username: s.username, analyzedAt: s.analyzedAt, result: s.result } : { connected: false };
  }
  const isConnected = () => {
    const uid = Codi.state.currentUserId; return !!(uid && store().byUser[uid]);
  };
  function saveAnalysis(userId, account) {
    const result = profileFor(account.email);
    store().byUser[userId] = { username: result.handle, email: account.email, analyzedAt: new Date().toISOString(), result };
    Codi.set(() => {}, { render: false });
    return result;
  }
  function disconnect(userId) {
    delete store().byUser[userId];
    Codi.set(() => {});
    ui.toast('Đã ngắt kết nối GitHub.', { type: 'success' });
  }

  // ───────────────────────── connect flow (sheet) ─────────────────────────
  // Four steps packaged in one sheet so the user can see progress without losing context.
  // step: consent → picker → permission → analyzing → result (also "canceled" / "denied")
  let sheet = null; let flow = null;

  function body() {
    if (flow.step === 'consent') return consentBody();
    if (flow.step === 'picker') return pickerBody();
    if (flow.step === 'permission') return permissionBody();
    if (flow.step === 'analyzing') return analyzingBody();
    if (flow.step === 'result') return resultBody(flow.result, flow.account);
    if (flow.step === 'canceled') return ui.alert({ type: 'warn', title: 'Bạn đã huỷ kết nối GitHub', body: 'Không có dữ liệu nào được lưu.', actions: html`<button class="btn btn-primary btn-sm" data-gh-step="consent">Thử lại</button><button class="btn btn-ghost btn-sm" data-close>Đóng</button>` });
    if (flow.step === 'denied') return ui.alert({ type: 'danger', title: 'Codi chưa được GitHub cấp quyền', body: 'Mình cần đọc danh sách repo công khai và ngôn ngữ chính để gợi ý khoá học sát với bạn. Không ghi gì vào GitHub của bạn.', actions: html`<button class="btn btn-primary btn-sm" data-gh-step="permission">Thử lại với GitHub</button><button class="btn btn-ghost btn-sm" data-close>Đóng</button>` });
    return '';
  }
  function footer() {
    if (flow.step === 'consent') return html`<button class="btn btn-ghost" data-close>Huỷ</button><button class="btn btn-primary" data-gh-step="picker">Tôi đồng ý · Tiếp tục</button>`;
    if (flow.step === 'picker') return html`<button class="btn btn-ghost" data-gh-cancel>Huỷ</button>`;
    if (flow.step === 'permission') return html`<button class="btn btn-ghost" data-gh-cancel>Chọn tài khoản khác</button>
      <button class="btn btn-ghost" data-gh-step="denied">Từ chối</button>
      <button class="btn btn-primary" data-gh-step="analyzing">Cho phép</button>`;
    if (flow.step === 'analyzing') return html`<button class="btn btn-ghost" data-gh-cancel>Dừng</button>`;
    if (flow.step === 'result') return html`<button class="btn btn-ghost" data-close>Đóng</button><a class="btn btn-primary" href="#/github/analysis" data-close>Mở trang phân tích</a>`;
    return html`<button class="btn btn-ghost" data-close>Đóng</button>`;
  }
  function refresh() { if (sheet) { sheet.setBody(body()); sheet.setFooter(footer()); } }

  function consentBody() {
    return html`<div class="stack-4 gh-consent">
      <div class="gh-brandline"><span class="gh-brand">${icon('book-open', { cls: 'icon-sm' })} Codi</span><span class="gh-brand-arrow">${icon('arrow-right', { cls: 'icon-sm' })}</span><span class="gh-brand">${icon('github', { cls: 'icon-sm' })} GitHub</span></div>
      <h3 style="margin:0">Kết nối GitHub để Codi gợi ý khoá học sát với bạn</h3>
      <p class="small">Codi sẽ đọc một vài thông tin công khai trong tài khoản GitHub của bạn, chỉ dùng để phân tích và gợi ý khoá học. Codi không ghi, không chia sẻ, bạn ngắt kết nối bất kỳ lúc nào.</p>
      <ul class="gh-consent-list">
        <li>${icon('check', { cls: 'icon-sm text-success' })} <span><strong>Danh sách repo công khai</strong> — tên, mô tả, ngày cập nhật.</span></li>
        <li>${icon('check', { cls: 'icon-sm text-success' })} <span><strong>Ngôn ngữ lập trình chính</strong> — tỉ lệ dòng code mỗi ngôn ngữ.</span></li>
        <li>${icon('check', { cls: 'icon-sm text-success' })} <span><strong>Tên hiển thị và ảnh đại diện</strong> — để Codi biết chào bạn.</span></li>
        <li>${icon('x', { cls: 'icon-sm text-danger' })} <span><strong>Không truy cập</strong> repo riêng tư, email, SSH key, hay bất kỳ quyền ghi nào.</span></li>
      </ul>
      <p class="xsmall muted">Bước tiếp theo là màn chọn tài khoản Google rồi màn cấp quyền của GitHub. Đây là bản mô phỏng — không gửi dữ liệu ra ngoài.</p>
    </div>`;
  }
  function pickerBody() {
    return html`<div class="stack-4 gh-google">
      <div class="gh-google-head"><span class="gh-g">G</span>oogle</div>
      <p class="small"><strong>Chọn tài khoản</strong> để tiếp tục với <strong>Codi</strong></p>
      <ul class="gh-accounts">${ACCOUNTS.map((a) => html`<li><button type="button" class="gh-account" data-gh-pick="${a.email}">
        <span class="gh-avatar" aria-hidden="true">${a.name.charAt(0)}</span>
        <span class="gh-account-main"><span class="gh-account-name">${a.name}</span><span class="gh-account-email">${a.email}</span></span>
        ${icon('chevron-right', { cls: 'icon-sm' })}</button></li>`)}
        <li><button type="button" class="gh-account is-add" data-gh-cancel>${icon('plus', { cls: 'icon-sm' })} <span class="gh-account-email">Dùng tài khoản khác</span></button></li></ul>
      <p class="xsmall muted">Bản mô phỏng — không mở Google thật và không lưu mật khẩu của bạn.</p>
    </div>`;
  }
  function permissionBody() {
    const a = flow.account;
    return html`<div class="stack-4 gh-perm">
      <div class="gh-perm-head"><span class="gh-gh">${icon('github', { cls: 'icon-sm' })}</span><span>Cấp quyền cho ứng dụng</span></div>
      <div class="gh-perm-card">
        <strong>Codi</strong> muốn truy cập tài khoản GitHub <span class="mono">${a.email}</span>.
      </div>
      <ul class="gh-perm-list">
        <li>${icon('check', { cls: 'icon-sm text-success' })} <span>Đọc hồ sơ công khai: tên, ảnh, repo công khai.</span></li>
        <li>${icon('check', { cls: 'icon-sm text-success' })} <span>Đọc thống kê ngôn ngữ của các repo công khai.</span></li>
        <li>${icon('x', { cls: 'icon-sm text-danger' })} <span>Không truy cập repo riêng tư, email riêng tư, hay ghi dữ liệu.</span></li>
      </ul>
      <p class="xsmall muted">Màn mô phỏng GitHub OAuth. Bấm <strong>Cho phép</strong> để Codi phân tích, hoặc <strong>Từ chối</strong> nếu bạn không đồng ý.</p>
    </div>`;
  }
  function analyzingBody() {
    const steps = flow.steps;
    return html`<div class="stack-4 gh-run">
      <div class="ai-thinking-row" aria-busy="true" aria-live="polite"><span class="typing" aria-hidden="true"><i></i><i></i><i></i></span><span>Đang phân tích profile GitHub…</span></div>
      <ol class="gh-steps">${steps.map((s) => html`<li class="gh-step is-${s.state}">
        <span class="gh-step-dot" aria-hidden="true">${s.state === 'done' ? icon('check', { cls: 'icon-sm' }) : s.state === 'running' ? '' : ''}</span>
        <span>${s.label}</span>${s.hint ? html` <span class="xsmall muted">— ${s.hint}</span>` : ''}</li>`)}</ol>
      <p class="xsmall muted">Rời cửa sổ cũng được — khi quay lại bạn vẫn thấy kết quả.</p>
    </div>`;
  }
  function resultBody(r, acc) {
    const lv = (r.understanding && r.understanding.level) || {};
    const chips = DOMAINS.map((d) => lv[d.key]).filter((x) => x && x.stop >= 2);
    return html`<div class="stack-4 gh-result-sheet">
      <p class="small"><strong>${r.name}</strong> · <span class="mono">@${r.handle}</span> · ${r.stats.repos} repo · ${r.stats.contribYear} đóng góp 12 tháng</p>
      ${r.understanding && r.understanding.headline ? html`<p class="small"><strong>Codi hiểu:</strong> ${r.understanding.headline}</p>` : html`<p class="small">${r.summary}</p>`}
      ${chips.length ? html`<div class="gh-mini-chips">${DOMAINS.map((d) => { const x = lv[d.key]; if (!x) return ''; return html`<span class="gh-mini-chip is-stop-${x.stop}">${d.label} · ${x.label}</span>`; })}</div>` : ''}
      ${languageBars(r.languages)}
      <p class="xsmall muted">Codi gợi ý ${r.recommend.length} khoá học — mở trang phân tích để xem chi tiết công nghệ, điểm mạnh và chỗ còn mỏng.</p>
    </div>`;
  }

  // Horizontal labelled bars (Uxcel pattern) — language name on the left, percentage on the right.
  function languageBars(langs, opts) {
    opts = opts || {};
    return html`<ol class="gh-langs ${opts.big ? 'is-big' : ''}" aria-label="Ngôn ngữ trong repo công khai">
      ${langs.map((l) => html`<li class="gh-lang"><span class="gh-lang-dot" aria-hidden="true" style="background:${l.color}"></span>
        <span class="gh-lang-name">${l.name}</span>
        <span class="gh-lang-bar" aria-hidden="true"><span style="width:${Math.round(l.share * 100)}%; background:${l.color}"></span></span>
        <span class="gh-lang-pct">${Math.round(l.share * 100)}%</span></li>`)}</ol>`;
  }

  // ───────────────────────── analyzing timer ─────────────────────────
  let timer = null;
  function startAnalyzing() {
    flow.steps = [
      { label: 'Đọc hồ sơ công khai', state: 'running' },
      { label: 'Tải danh sách repo công khai', state: 'pending', hint: '' },
      { label: 'Thống kê ngôn ngữ', state: 'pending' },
      { label: 'So khớp với khoá học của Codi', state: 'pending' },
    ];
    refresh();
    let i = 0;
    timer = setInterval(() => {
      if (!flow) { clearInterval(timer); return; }
      flow.steps[i].state = 'done';
      if (i + 1 < flow.steps.length) { flow.steps[i + 1].state = 'running'; i += 1; refresh(); return; }
      clearInterval(timer); timer = null;
      const result = saveAnalysis(Codi.state.currentUserId, flow.account);
      flow.result = result; flow.step = 'result'; refresh();
    }, 700);
  }

  // ───────────────────────── public: open the flow ─────────────────────────
  function openConnect(opts) {
    opts = opts || {};
    if (!Codi.state.currentUserId) { Codi.action && Codi.action; ui.toast('Đăng nhập để kết nối GitHub.', { type: 'warn' }); return; }
    flow = { step: 'consent', account: null, result: null, returnTo: opts.returnTo || null, steps: [] };
    sheet = ui.sheet({
      title: 'Kết nối và phân tích GitHub', body: body(), footer: footer(),
      onClose: () => { if (timer) { clearInterval(timer); timer = null; } flow = null; sheet = null; },
      onMount(h) {
        h.el.addEventListener('click', (e) => {
          const next = e.target.closest('[data-gh-step]'); if (next) { flow.step = next.dataset.ghStep; if (flow.step === 'analyzing') startAnalyzing(); else refresh(); return; }
          const pick = e.target.closest('[data-gh-pick]'); if (pick) { flow.account = ACCOUNTS.find((a) => a.email === pick.dataset.ghPick); flow.step = 'permission'; refresh(); return; }
          const cancel = e.target.closest('[data-gh-cancel]'); if (cancel) { if (timer) { clearInterval(timer); timer = null; } flow.step = 'canceled'; refresh(); }
        });
      },
    });
  }

  // ───────────────────────── result page ─────────────────────────
  // Standalone route the user can return to from Settings or notification links.
  // ───────────────────────── understanding block ─────────────────────────
  // Four-stop mastery bars aligned with Codi's existing scale (Chưa thấy · Mới học · Đang vững · Thành thạo),
  // then grouped tech chips with per-item confidence dots, then positive signals and gaps.
  const DOMAINS = [
    { key: 'frontend', label: 'Frontend', icon: 'layout' },
    { key: 'backend',  label: 'Backend / API', icon: 'server' },
    { key: 'data',     label: 'Dữ liệu & AI', icon: 'bar-chart' },
    { key: 'devops',   label: 'DevOps / CI', icon: 'git-branch' },
    { key: 'testing',  label: 'Kiểm thử', icon: 'check-circle' },
  ];
  function masteryBar(stop) {
    // 0..3 scale: four cells, filled from the left, using existing mastery palette (slot-N via charts.css).
    return html`<span class="gh-mastery" aria-hidden="true" data-stop="${stop}">${[0, 1, 2, 3].map((i) => html`<i class="${i <= stop ? 'is-on' : ''}"></i>`)}</span>`;
  }
  function understandingSection(r) {
    if (!r.understanding) return '';
    const u = r.understanding;
    return html`<section class="section gh-under" aria-labelledby="gh-under-h">
      <div class="row-between" style="margin-bottom:12px">
        <h2 id="gh-under-h" style="margin:0">Codi hiểu bạn như thế nào</h2>
        <span class="xsmall muted">Suy ra từ repo công khai, không phải điểm đánh giá chính thức</span>
      </div>
      ${u.headline ? html`<p class="lede" style="margin-bottom:16px; max-width:68ch">${u.headline}</p>` : ''}

      <div class="grid-2">
        <div class="card"><div class="card-body stack-3">
          <h3 class="small strong" style="margin:0">Mức hiểu biết theo mảng</h3>
          <ol class="gh-domains">${DOMAINS.map((d) => { const lv = (u.level || {})[d.key] || { stop: 0, label: 'Chưa thấy' }; return html`<li class="gh-domain">
            <span class="gh-domain-head"><span class="gh-domain-icon">${icon(d.icon, { cls: 'icon-sm' })}</span><span class="gh-domain-name">${d.label}</span><span class="gh-domain-level is-stop-${lv.stop}">${lv.label}</span></span>
            ${masteryBar(lv.stop)}
            ${lv.note ? html`<span class="xsmall muted">${lv.note}</span>` : ''}</li>`; })}</ol>
        </div></div>

        <div class="card"><div class="card-body stack-3">
          <h3 class="small strong" style="margin:0">Công nghệ Codi thấy bạn dùng</h3>
          ${(r.tech || []).map((g) => html`<div class="gh-tech-group">
            <span class="xsmall muted">${g.group}</span>
            <ul class="gh-tech-chips">${g.items.map((t) => html`<li class="gh-tech is-conf-${t.confidence}"><span class="gh-tech-dot" aria-hidden="true"></span><span>${t.name}</span>${t.uses ? html`<span class="xsmall muted">${t.uses} repo${t.last ? ` · ${t.last}` : ''}</span>` : ''}</li>`)}</ul>
          </div>`)}
          <p class="xsmall muted">Chấm đậm = tin cậy cao (dùng nhiều, mới gần đây); chấm mờ = tin cậy thấp.</p>
        </div></div>
      </div>

      <div class="grid-2" style="margin-top:16px">
        <div class="card"><div class="card-body stack-2">
          <h3 class="small strong" style="margin:0">Điểm Codi tin</h3>
          <ul class="gh-signals">${(r.signals || []).filter((s) => s.kind === 'good').map((s) => html`<li class="gh-signal is-good"><span class="gh-signal-icon">${icon('check-circle', { cls: 'icon-sm' })}</span><div class="stack-1"><strong class="small">${s.label}</strong><span class="xsmall muted">${s.detail}</span></div></li>`)}</ul>
        </div></div>
        <div class="card"><div class="card-body stack-2">
          <h3 class="small strong" style="margin:0">Chỗ Codi chưa thấy</h3>
          <ul class="gh-signals">${(r.signals || []).filter((s) => s.kind === 'warn').map((s) => html`<li class="gh-signal is-warn"><span class="gh-signal-icon">${icon('alert-triangle', { cls: 'icon-sm' })}</span><div class="stack-1"><strong class="small">${s.label}</strong><span class="xsmall muted">${s.detail}</span></div></li>`)}
            ${(r.gaps || []).map((g) => html`<li class="gh-signal is-gap"><span class="gh-signal-icon">${icon('target', { cls: 'icon-sm' })}</span><div class="stack-1"><strong class="small">${g.label}</strong><span class="xsmall muted">${g.hint}</span></div></li>`)}</ul>
        </div></div>
      </div>
    </section>`;
  }

  // ───────────────────────── context for AI advisor ─────────────────────────
  // Short Vietnamese paragraph other modules can prepend to their prompts so Codi "nhớ" bạn.
  function contextFor(userId) {
    const s = stateFor(userId); if (!s.connected) return '';
    const r = s.result; const u = r.understanding || {}; const lv = u.level || {};
    const strong = DOMAINS.filter((d) => (lv[d.key] || {}).stop >= 2).map((d) => `${d.label.toLowerCase()} (${lv[d.key].label.toLowerCase()})`);
    const weak   = DOMAINS.filter((d) => (lv[d.key] || {}).stop <= 1).map((d) => d.label.toLowerCase());
    const topTech = (r.tech || []).flatMap((g) => g.items).filter((t) => t.confidence === 'high').map((t) => t.name).slice(0, 4);
    const parts = [];
    parts.push(`Người học đã kết nối GitHub (@${s.username}, ${r.stats.repos} repo, ${r.stats.contribYear} đóng góp/năm).`);
    if (u.headline) parts.push(u.headline);
    if (strong.length) parts.push(`Mạnh: ${strong.join(', ')}.`);
    if (weak.length) parts.push(`Mỏng: ${weak.join(', ')}.`);
    if (topTech.length) parts.push(`Hay dùng: ${topTech.join(', ')}.`);
    return parts.join(' ');
  }

  function resultPage() {
    const uid = Codi.state.currentUserId;
    if (!uid) return html`<div class="page page-narrow">${ui.empty({ icon: 'lock', title: 'Đăng nhập để xem phân tích', body: 'Phân tích GitHub chỉ hiện cho tài khoản đã kết nối.', actions: html`<a class="btn btn-primary" href="#/login">Đăng nhập</a>` })}</div>`;
    const s = stateFor(uid);
    if (!s.connected) {
      return html`<div class="page">
        <div class="page-header"><div><h1>Phân tích GitHub</h1><p class="muted">Kết nối GitHub để Codi gợi ý khoá học sát với kỹ năng hiện tại của bạn.</p></div></div>
        <div class="card"><div class="card-body stack-4">
          <p>Codi phân tích danh sách repo công khai và ngôn ngữ bạn hay viết, sau đó so khớp với các khoá học hiện có để tìm bước đi tiếp theo. Toàn bộ chỉ đọc, không ghi, bạn ngắt kết nối bất kỳ lúc nào.</p>
          <div><button class="btn btn-primary" data-action="gh-connect">${icon('github', { cls: 'icon-sm' })} Kết nối GitHub</button></div>
        </div></div>
      </div>`;
    }
    const r = s.result; const d = new Date(s.analyzedAt);
    const when = `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    return html`<div class="page">
      <div class="page-header">
        <div class="row" style="gap:12px"><span class="gh-avatar gh-avatar-lg" aria-hidden="true">${r.name.charAt(0)}</span>
          <div class="stack-1"><h1 style="font-size:var(--text-xl); margin:0">${r.name} · <span class="mono">@${r.username || r.handle}</span></h1><p class="small muted" style="margin:0">Phân tích lúc ${when} · ${r.stats.repos} repo công khai · ${r.stats.contribYear} đóng góp 12 tháng gần nhất</p></div></div>
        <div class="row" style="gap:8px"><button class="btn btn-secondary btn-sm" data-action="gh-reanalyze">${icon('rotate-ccw', { cls: 'icon-sm' })} Phân tích lại</button><button class="btn btn-ghost btn-sm" data-action="gh-disconnect">${icon('x', { cls: 'icon-sm' })} Ngắt kết nối</button></div>
      </div>

      <div class="grid-2 section">
        <div class="card"><div class="card-body stack-3">
          <h2 class="small strong" style="margin:0">Điểm mạnh theo ngôn ngữ</h2>
          ${languageBars(r.languages, { big: true })}
          <p class="xsmall muted">Tỉ lệ dòng code trong các repo công khai. Codi dùng số này cùng với mục tiêu học để gợi ý khoá.</p>
        </div></div>
        <div class="card"><div class="card-body stack-3">
          <h2 class="small strong" style="margin:0">Codi nhận xét</h2>
          <p>${r.summary}</p>
          <ul class="stack-2 small"><li><strong>${r.stats.repos}</strong> repo · <strong>${r.stats.stars}</strong> star · <strong>${r.stats.followers}</strong> người theo dõi</li>
            <li><strong>${r.stats.contribYear}</strong> đóng góp trong 12 tháng qua</li>
            <li>Ngôn ngữ chính: <strong>${r.languages[0].name}</strong></li></ul>
        </div></div>
      </div>

      ${understandingSection(r)}

      <h2 class="section" style="margin-bottom:12px">Khoá học Codi gợi ý cho bạn</h2>
      <ul class="ai-courses">${r.recommend.map((cid, k) => { const c = Codi.course(cid); if (!c) return ''; return html`<li class="ai-course">
        ${ui.thumb(c, { small: true })}
        <div class="ai-course-main">
          <a class="ai-course-title" href="#/courses/${c.slug}">${c.title}</a>
          <span class="ai-course-meta">${Codi.levelLabel(c.level)} · ${Codi.lessons(c).length} bài · <span class="od-nowrap">${c.price ? Codi.fmt.vnd(c.price) : 'Miễn phí'}</span></span>
          ${r.recommendWhy[cid] ? html`<span class="ai-course-why">${r.recommendWhy[cid]}</span>` : ''}
        </div>
        <div class="ai-course-cta">${k === 0 ? html`<span class="badge badge-accent">Phù hợp nhất</span>` : ''}<a class="btn btn-primary btn-sm" href="#/courses/${c.slug}">Xem khoá học</a></div>
      </li>`; })}</ul>

      <h2 class="section" style="margin-bottom:12px">Repo công khai gần đây (${r.repos.length})</h2>
      <ul class="gh-repos">${r.repos.map((rp) => { const col = (r.languages.find((l) => l.name === rp.lang) || {}).color || '#64748b'; return html`<li class="gh-repo">
        <div class="gh-repo-main"><a class="gh-repo-name" href="https://github.com/${r.username || r.handle}/${rp.name}" target="_blank" rel="noopener">${rp.name}</a>
          ${rp.fork ? html`<span class="badge badge-neutral">Fork</span>` : ''}
          <span class="gh-repo-desc">${rp.desc}</span></div>
        <div class="gh-repo-meta"><span class="gh-lang-mark"><span class="gh-lang-dot" style="background:${col}" aria-hidden="true"></span>${rp.lang}</span>
          <span class="xsmall muted">★ ${rp.stars}</span>
          <span class="xsmall muted">Cập nhật ${rp.updated}</span></div>
      </li>`; })}</ul>
    </div>`;
  }

  Codi.route('/github/analysis', resultPage, { title: 'Phân tích GitHub', role: ['learner', 'lecturer', 'admin'] });

  // ───────────────────────── public hook actions ─────────────────────────
  Codi.action('gh-connect', () => openConnect());
  Codi.action('gh-reanalyze', () => openConnect({ returnTo: '/github/analysis' }));
  Codi.action('gh-disconnect', async () => {
    const r = await ui.confirm({ title: 'Ngắt kết nối GitHub?', body: 'Dữ liệu phân tích hiện tại sẽ bị xoá. Bạn có thể kết nối lại bất kỳ lúc nào.', confirmLabel: 'Ngắt kết nối' });
    if (r.ok) disconnect(Codi.state.currentUserId);
  });

  Codi.github = { openConnect, stateFor, isConnected, disconnect, contextFor };
})();
