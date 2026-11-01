// Canned GitHub personas for the simulated analysis (verbatim from the mockup's github-analyze.js).
// Three deliberate personas so switching the sample learner changes the result visibly.
export const GITHUB_PROFILES = {
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
// Sample accounts in the picker (lets the user try "wrong account" and "cancel" paths without signing out).
export const GITHUB_ACCOUNTS = [
  { email: 'minhanh@codi.vn', name: 'Minh Anh' },
  { email: 'quocanh@codi.vn', name: 'Quốc Anh' },
  { email: 'thaolinh@codi.vn', name: 'Thảo Linh' },
];

// Generic fallback so a brand-new sample user still sees a result.
export function fallbackProfile(email) {
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
