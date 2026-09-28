# Hướng dẫn kiểm thử đơn vị & Kịch bản Demo SWP391 (Unit Testing Guide)

Tài liệu hướng dẫn tiêu chuẩn viết unit test, cấu trúc test suite, chiến lược cô lập phụ thuộc (mocking) và kịch bản demo 8–10 phút phục vụ môn học **SWP391**.

---

## 1. Triết lý & Công nghệ kiểm thử

Dự án Codi sử dụng **Vitest** làm framework unit test chính thức:
- **Môi trường thực thi**: Node.js (nhanh, nhẹ, không kéo DOM/jsdom hay giả lập trình duyệt cồng kềnh cho logic thuần).
- **Nguyên tắc cô lập**: Kiểm thử unit chạy độc lập 100%, không yêu cầu database PostgreSQL thật, Redis hay external API secrets.
- **Ranh giới Mocking (Mock Boundaries)**:
  - Mock ở tầng biên hạ tầng: `@/services` (auth, db), `next/headers`, `next/server`.
  - **Tuyệt đối không mock** hàm hoặc logic nghiệp vụ đang được kiểm thử.
  - Sử dụng `beforeEach` / `afterEach` để reset trạng thái mocks, đảm bảo tính độc lập giữa các ca kiểm thử.

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

### Tiêu chuẩn Coverage Gate
Coverage được đo bằng công cụ V8 (`@vitest/coverage-v8`) với ngưỡng tối thiểu bắt buộc trên 4 module nghiệp vụ trọng điểm:
- **Statements**: ≥ 80% (Thực tế đạt: 100%)
- **Lines**: ≥ 80% (Thực tế đạt: 100%)
- **Functions**: ≥ 80% (Thực tế đạt: 100%)
- **Branches**: ≥ 75% (Thực tế đạt: 100%)

---

## 5. Kịch bản Demo Hội đồng SWP391 (8–10 phút)

| Thời lượng | Nội dung trình bày | Thao tác thực tế | Mục tiêu chứng minh |
|---|---|---|---|
| **0:00 – 1:00** | Giới thiệu kiến trúc kiểm thử | Mở file `vitest.config.ts`, giải thích Node runner, module alias và ranh giới unit test | Làm rõ phân biệt giữa Unit Test (nhanh, cô lập) và Integration / E2E test |
| **1:00 – 3:00** | Cấu trúc AAA & Table-Driven Tests | Trình chiếu `apps/web/src/lib/filter-course-catalog.test.ts` | Minh họa pattern Arrange-Act-Assert và `it.each` với các bộ dữ liệu boundary/whitespace |
| **3:00 – 5:00** | Mocking nghiệp vụ & An toàn phân quyền | Trình chiếu `actions.test.ts` (Admin self-demotion lockout) và `route.test.ts` (PATCH profile validation) | Chứng minh logic nghiệp vụ chặn rủi ro mất Admin cuối cùng và xác thực input người dùng |
| **5:00 – 6:30** | **Live Failure & Recovery Test** | Tạm sửa 1 assertion trong `actions.test.ts` để cố tình gây lỗi, chạy `pnpm test`. Quan sát terminal báo đỏ và exit code ≠ 0. Sau đó undo và chạy lại xanh | Chứng minh test bắt lỗi thực sự, không phải test rỗng hình thức |
| **6:30 – 8:00** | Báo cáo Coverage V8 & Ngưỡng chất lượng | Chạy `pnpm test:coverage`, hiển thị bảng thống kê 100% metrics trên terminal và mở file HTML trong `coverage/index.html` | Chứng minh toàn bộ các nhánh rẽ và câu lệnh nghiệp vụ đều được kiểm thử bảo vệ |
| **8:00 – 10:00** | Tích hợp CI Gate trên GitHub Actions | Mở `.github/workflows/ci.yml`, chỉ ra job `unit-test` chạy trong fast/full lane và điều kiện `ci-gate` bắt buộc `UNIT_TEST=success` | Chứng minh quy trình CI tự động chặn code lỗi không thể merge vào nhánh `develop` |

---

## 6. Giới hạn & Khuyến nghị tương lai

- **Unit tests kiểm thử logic thuần và điều kiện rẽ nhánh**: Các hành vi phụ thuộc sâu vào cơ chế vật lý của RDBMS (như PostgreSQL row-level locks `for update`, concurrent race conditions, transaction rollback khi crash phần cứng) cần được kiểm thử bằng integration tests riêng với cơ sở dữ liệu thật trong môi trường staging.
- **Không dùng DOM renderer**: Các test trên không render giao diện React (không dùng jsdom/RTL) nhằm tối ưu tốc độ thực thi trong CI pipeline (chỉ tốn ~1.5 giây).
