# Hướng dẫn kiểm thử đơn vị & Kịch bản Demo SWP391 (Unit Testing Guide)

Tài liệu hướng dẫn tiêu chuẩn viết unit test, cấu trúc test suite, chiến lược cô lập phụ thuộc (mocking) và kịch bản demo 8–10 phút phục vụ môn học **SWP391**.

---

## 1. Triết lý & Công nghệ kiểm thử

Dự án Codi sử dụng **Vitest** làm framework unit test chính thức:

- **Chọn test theo outcome và rủi ro**: Mỗi test cần chỉ ra hành vi quan sát được hoặc bất biến an toàn được bảo vệ, cùng lỗi thực tế khiến test thất bại. Giữ các trường hợp phân biệt về phân quyền, tiền, mất dữ liệu và ranh giới đầu vào; không thêm test chỉ để đạt số lượng hay tỷ lệ coverage.
- **Gộp theo hành vi, không theo tên**: Chỉ bỏ trường hợp trùng khi đầu vào, nhánh và outcome đã được bảo vệ tương đương. Các guard cho phép/từ chối, trạng thái pending/error và biến thể đầu vào công khai vẫn cần được giữ.
- **Oracle độc lập**: Assert kết quả mong đợi cụ thể từ yêu cầu/fixture, không chỉ so hai hàm dùng chung logic hoặc kiểm tra mock trả lại đúng giá trị đã cấu hình.
- **Môi trường thực thi**: Logic thuần mặc định chạy Node.js; test component có thể chọn happy-dom theo từng file. Cấu hình thuộc [vitest.config.ts](../vitest.config.ts).
- **Nguyên tắc cô lập**: Unit/component tests không cần PostgreSQL thật, Redis hay external API secrets. Fixture nhỏ, xác định được dùng làm đầu vào; không thay thế logic production bằng kết quả giả.
- **Ranh giới Mocking (Mock Boundaries)**:
  - Mock ở tầng biên hạ tầng: `@/services` (auth, db), `next/headers`, `next/server`.
  - **Tuyệt đối không mock** hàm hoặc logic nghiệp vụ đang được kiểm thử.
  - Sử dụng `beforeEach` / `afterEach` để reset trạng thái mocks, đảm bảo tính độc lập giữa các ca kiểm thử.
  - Mock biên hạ tầng vẫn hữu ích khi chạy hàm/component production thật và kiểm tra kết quả hoặc side effect quan trọng (kể cả không được ghi dữ liệu khi bị từ chối). Mock SQL không chứng minh transaction/lock của PostgreSQL; render response giả không chứng minh đã lưu dữ liệu.

---

## 2. Ma trận chức năng kiểm thử & Test Cases

| Nhóm chức năng | Module nguồn | File kiểm thử | Các ca kiểm thử chính (Test Cases) |
|---|---|---|---|
| **Phân quyền & RBAC** | `packages/auth/src/rbac.ts` | `packages/auth/src/rbac.test.ts` | • Trả về danh sách `roleId` active của user<br>• User không có role trả về `[]`<br>• Đếm số lượng active holders, fallback 0 khi rỗng<br>• `requireRole` cho phép khi khớp role, ném `ForbiddenError` khi thiếu role hoặc allowedRoles rỗng |
| **Cập nhật Role Admin** | `apps/web/src/app/dashboard/admin/actions.ts` | `apps/web/src/app/dashboard/admin/actions.test.ts` | • Chặn khi không có session (Unauthorized)<br>• Chặn khi actor không phải ADMIN (Forbidden)<br>• Chặn tự hạ role khi là Admin cuối cùng (count ≤ 1)<br>• Cho phép tự đổi role khi còn Admin khác (count > 1)<br>• Tự giữ ADMIN không cần đếm lại<br>• Thu hồi mọi role active cũ và cấp role mới cho target user<br>• Lan truyền lỗi DB khi transaction thất bại |
| **PATCH Hồ sơ cá nhân** | `apps/web/src/app/api/user/profile/route.ts` | `apps/web/src/app/api/user/profile/route.test.ts` | • 401 Unauthorized khi thiếu session<br>• 400 Bad Request khi name rỗng, null, số, khoảng trắng (`it.each`)<br>• 200 OK khi hợp lệ: trim tên, gửi sang Better Auth kèm headers, trả payload id/name/email<br>• 500 khi Better Auth API lỗi có thông điệp / không có thông điệp<br>• 500 khi body JSON malformed |
| **Tìm kiếm & Lọc Catalogue** | `apps/web/src/lib/filter-course-catalog.ts` | `apps/web/src/lib/filter-course-catalog.test.ts` | • Query rỗng / khoảng trắng trả toàn bộ khoá học (`it.each`)<br>• Match title / description / topics không phân biệt hoa thường<br>• Trả `[]` khi không có kết quả<br>• Lọc chính xác theo category, level và kết hợp AND<br>• Immutability: bảo toàn thứ tự, không biến đổi mảng đầu vào |

---

## 3. Mẫu viết test: Arrange – Act – Assert (AAA)

Tất cả các ca kiểm thử phải tuân thủ nghiêm ngặt mô hình AAA:

```ts
it("cập nhật thành công, gọi Better Auth với name đã trim và trả về 200", async () => {
  // 1. Arrange: Chuẩn bị dữ liệu và hành vi giả lập (mock setup)
  const rawName = "  Tran Thi B  ";
  const trimmedName = "Tran Thi B";
  mockGetSession.mockResolvedValue({
    user: { id: "user-42", email: "tranthib@codi.vn" },
  });
  mockUpdateUser.mockResolvedValue({ success: true });
  const request = createJsonRequest({ name: rawName });

  // 2. Act: Thực thi chức năng cần kiểm thử
  const response = await PATCH(request);
  const data = await response.json();

  // 3. Assert: Kiểm tra kết quả trả về và tương tác mock
  expect(response.status).toBe(200);
  expect(data.user.name).toBe(trimmedName);
  expect(mockUpdateUser).toHaveBeenCalledWith({
    body: { name: trimmedName },
    headers: expect.anything(),
  });
});
```

---

## 4. Các lệnh kiểm thử cục bộ

```bash
# 1. Chạy toàn bộ unit test một lần (CI mode)
pnpm test

# 2. Chạy chế độ watch (phục vụ phát triển TDD)
pnpm test:watch

# 3. Chạy kiểm thử kèm báo cáo độ phủ mã nguồn (Coverage Gate)
pnpm test:coverage
```

### Coverage và gate hiện hành

Coverage giúp tìm vùng chưa được thực thi, không chứng minh outcome đúng hay là mục tiêu để tăng số test. Nguồn sự thật cho phạm vi đo/ngưỡng đang được thực thi là [vitest.config.ts](../vitest.config.ts); lệnh và điều kiện CI nằm trong [workflow CI](../.github/workflows/ci.yml). Giữ nguyên các gate này cho đến khi có quyết định thay đổi riêng; báo cáo kết quả pass/fail thực tế, không hạ ngưỡng hoặc che lỗi để việc tinh gọn test được xanh.

Khi bàn giao, ghi candidate, lệnh, exit code và giới hạn chứng minh. Chỉ báo cáo coverage/thời gian của lần chạy có bằng chứng; không dùng tỷ lệ hay test count thay cho kiểm tra các outcome cần bảo vệ.

---

## 5. Kịch bản Demo Hội đồng SWP391 (8–10 phút)

| Thời lượng | Nội dung trình bày | Thao tác thực tế | Mục tiêu chứng minh |
|---|---|---|---|
| **0:00 – 1:00** | Giới thiệu kiến trúc kiểm thử | Mở file `vitest.config.ts`, giải thích Node runner, module alias và ranh giới unit test | Làm rõ phân biệt giữa Unit Test (nhanh, cô lập) và Integration / E2E test |
| **1:00 – 3:00** | Cấu trúc AAA & Table-Driven Tests | Trình chiếu `apps/web/src/lib/filter-course-catalog.test.ts` | Minh họa pattern Arrange-Act-Assert và `it.each` với các bộ dữ liệu boundary/whitespace |
| **3:00 – 5:00** | Mock biên hạ tầng & An toàn phân quyền | Trình chiếu `actions.test.ts` (Admin self-demotion lockout) và `route.test.ts` (PATCH profile validation) | Giải thích outcome, guard và assert không ghi dữ liệu khi bị từ chối; không coi mock DB là bằng chứng PostgreSQL |
| **5:00 – 6:30** | **Failure & Recovery có kiểm soát** | Trong worktree dùng một lần, không secrets/DB/provider/runtime đang dùng: chạy test catalogue xanh, tạm đảo ưu tiên title-match trong hàm production `filterCourseCatalog`, chạy lại test hẹp và ghi lỗi outcome/exit code. Khôi phục chính xác bytes source ban đầu, kiểm tra diff/hash rồi chạy xanh lại; không sửa assertion để tạo RED | Chứng minh test phân biệt một hồi quy production thật. Chỉ thực hiện khi được phép sửa tạm source trong môi trường cô lập; không đưa mutation vào commit |
| **6:30 – 8:00** | Báo cáo Coverage V8 & Giới hạn bằng chứng | Chạy `pnpm test:coverage`, đọc kết quả và gate thực tế, mở báo cáo HTML nếu được sinh ra | Nêu vùng chưa đo/chưa kiểm và outcome được bảo vệ; coverage cao không chứng minh persistence, UI trình duyệt hay provider |
| **8:00 – 10:00** | Tích hợp CI Gate trên GitHub Actions | Mở `.github/workflows/ci.yml`, chỉ ra job `unit-test` chạy trong fast/full lane và điều kiện `ci-gate` bắt buộc `UNIT_TEST=success` | Chứng minh quy trình CI tự động chặn code lỗi không thể merge vào nhánh `develop` |

---

## 6. Giới hạn & Khuyến nghị tương lai

- **Unit tests kiểm thử logic thuần và điều kiện rẽ nhánh**: Các hành vi phụ thuộc sâu vào cơ chế vật lý của RDBMS (như PostgreSQL row-level locks `for update`, concurrent race conditions, transaction rollback khi crash phần cứng) cần được kiểm thử bằng integration tests riêng với cơ sở dữ liệu thật trong môi trường staging.
- **E2E trên trình duyệt thật**: luồng UI được kiểm bằng Playwright (`pnpm test:e2e`, spec `apps/web/e2e/*.spec.ts`), tách khỏi Vitest. Cách chạy và biến môi trường: [ui-test-flows.md §5](ui-test-flows.md#5-chạy-test).
- **Component tests với happy-dom**: Có thể kiểm tra tương tác của component production với biên fetch/router được mock, nhưng không thay thế trình duyệt thật, hydration toàn ứng dụng, media playback hay save/reopen qua DB. Ví dụ: [catalog-search.test.ts](../apps/web/src/app/courses/catalog-search.test.ts). Phân biệt rõ kết quả đã chạy, chưa chạy và bị chặn vì thiếu fixture; không biến thiếu fixture thành PASS.
