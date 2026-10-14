# AGENTS.md — Codi

Hướng dẫn cho mọi AI coding agent (Claude Code, Codex, Cursor, Copilot…) làm việc trong repo này.
Claude Code đọc file này qua `CLAUDE.md`.

Codi: nền tảng bán khoá học lập trình, cá nhân hoá lộ trình bằng AI. Đồ án SWP391 — Team 4.
Monorepo pnpm: `apps/web` (Next.js App Router), `packages/{auth,config,db,ui}`.
Stack: Next.js 16 · React · TypeScript · Drizzle ORM + PostgreSQL (Supabase) · Better Auth · Tailwind v4 + shadcn/ui ·
AI SDK · Vitest. Next.js 16 có breaking change — đọc `apps/web/AGENTS.md` trước khi viết code Next.

## 1. Source of truth: `docs/mockup/`

Mockup clickable trong `docs/mockup/` là **nguồn sự thật** cho nghiệp vụ. Mọi tính năng đều là "chuyển mockup sang code thật".

Thứ tự ưu tiên khi có mâu thuẫn:

1. `docs/mockup/STATE-MACHINES.md` — enum trạng thái, chuyển trạng thái, điều kiện, side effect.
2. `docs/mockup/PRODUCT.md` — luồng (§5), danh sách màn hình + state (§6), quy tắc tương tác (§7), quyết định (§10).
3. `docs/mockup/js/*.js` — hành vi tham chiếu khi hai file trên chưa nói rõ.
4. `docs/mockup/DESIGN-TOKENS.md` — giá trị token.
5. Code hiện có trong `apps/web` — chỉ thắng ở phần kỹ thuật (stack, kiến trúc), **không** thắng ở nghiệp vụ.

### Được khác / không được khác

| Không được khác (phải khớp mockup) | Được tự do |
|---|---|
| Thứ tự bước, điều kiện tiên quyết, ai được làm gì (role) | Bố cục, composition component, khoảng cách |
| Giá trị enum state + chuyển trạng thái hợp lệ + guard | Chọn component shadcn, animation |
| Mọi screen state liệt kê trong `PRODUCT.md` §6 (loading/empty/error/edge) | Cách chia component, tên file |
| Side effect (thông báo, enrol, xoá khỏi giỏ, cập nhật lộ trình…) | Microcopy phụ (giữ nguyên copy trạng thái/CTA chính) |
| Design token (màu, font, radius, mastery, chart palette) | Cải thiện UX miễn không đổi state/luồng |
| Quy tắc §7: confirm vs undo, lý do bắt buộc, không auto-redirect, mastery không chỉ bằng màu, AI không chấm điểm/không giải hộ | |

Nếu thấy mockup sai hoặc thiếu: **dừng, ghi vào PR/issue và hỏi** — không tự sửa nghiệp vụ trong code,
không sửa `docs/mockup/**` trong PR tính năng.

### Không port từ mockup

Dev drawer "Kịch bản thử nghiệm", scenario flags, `localStorage` state, seed data, `Codi.wait()` giả latency,
hash router. Mỗi scenario flag tương ứng một tình huống thật app phải xử lý (xem `STATE-MACHINES.md`).

## 2. Quy trình cho mỗi module

Dùng skill `codi-mockup-parity` (`.claude/skills/` hoặc `.agents/skills/`). Tóm tắt:

1. Mỗi việc có **issue trước** (sub-issue của epic). Đọc mục "Screens", "States" trong issue.
2. Mở `docs/mockup/README.md` → module map → file JS + route thật tương ứng.
3. Đọc phần entity liên quan trong `STATE-MACHINES.md`; định nghĩa enum state **một chỗ** (schema Drizzle / `const` TS),
   không rải string literal.
4. Chặn chuyển trạng thái sai ở **server** (server action / route handler), không chỉ ẩn nút ở client.
5. Viết unit test (Vitest) cho từng transition + guard.
6. Chụp màn hình từng state (light + dark, desktop + mobile cho luồng learner) cạnh ảnh mockup cùng state.
7. PR vào `develop`, body có `Closes #<issue>`, bảng screenshot và checklist parity.

## 3. Quy ước code

- Branch tách từ `develop`: `feat/<module>`, `fix/…`, `docs/…`. Conventional commits: `feat(cart): …`.
- Token: chỉ class semantic (`bg-primary`, `text-muted-foreground`, `bg-success-soft`…). Không màu primitive
  (`text-red-500`), không hex trong TSX. Icon: `lucide-react`.
- UI tiếng Việt; giá VND (`1.290.000 ₫`); ngày `dd/MM/yyyy`.
- Form: validate khi touch, lỗi inline dưới control, lỗi server trong Alert, nút loading giữ chiều rộng.
- Hành động tiền/ảnh hưởng người khác → confirm dialog nêu hậu quả (+ lý do nếu ảnh hưởng người khác).
  Hành động tự đảo ngược trên dữ liệu của chính mình → làm ngay + toast "Hoàn tác".
- Kiểm tra quyền theo role ở server (`packages/auth`), không tin client.
- Không commit `.env*`, secret, credential.

## 4. Lệnh

```bash
pnpm install
pnpm run dev:web          # chạy app
pnpm run check:standards  # vi phạm design token
pnpm run check-types
pnpm test                 # Vitest
pnpm test:coverage
pnpm db:generate && pnpm db:migrate   # đổi schema
```

Chạy mockup: mở `docs/mockup/index.html` bằng trình duyệt (Alt+K để đổi vai trò / ép state).

## 5. Tài liệu khác

`docs/contributing.md` (PR flow) · `docs/tech-stack.md` · `docs/design-guidelines.md` (nền tảng; token lấy theo
`docs/mockup/DESIGN-TOKENS.md` nếu khác) · `docs/unit-testing.md` · `docs/local-setup.md`.
