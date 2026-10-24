# PR #160 — bàn giao bằng chứng tích hợp #165

Theo [review của blu1606](https://github.com/blu1606/Codi/pull/160#pullrequestreview-5601141995), phần CTA standalone và CI/build hiện tại đã được chấp nhận. Hồ sơ này bổ sung source của bản tích hợp không còn truy xuất được từ GitHub, log gốc và kiểm tra đăng nhập thật cho hai trạng thái còn thiếu. Việc nghiệm thu/merge vẫn thuộc reviewer.

## Khôi phục chính xác commit runtime

- Commit: `c20c4ef21c6463f85f374a42f0b7c43d38d28ccd`.
- Git tree: `9311c95765c2f4d3df14717c87e42deb5c06b23d`.
- Base develop: `437c1e8df16969a54b1fb96f0ff3e02a09c15e7a`.
- [runtime-c20c4ef.bundle](runtime-c20c4ef.bundle) giữ bốn merge commit tích hợp #165/#133/#160/#144; `git bundle verify` đã đạt. Đây là snapshot lịch sử đúng phiên bản được review yêu cầu, không phải head mới của từng dependency PR.

Bundle chỉ chứa các object chưa có trên các nhánh remote lúc đóng gói. Năm prerequisite commit đã được công bố trước đó: `8f8ead1`, `a7d6018`, `45d3bd5`, `dacdad8`, `437c1e8`. Từ clone của Codi, lấy các lịch sử PR rồi nhập bundle:

```powershell
git fetch origin develop pull/133/head pull/144/head pull/160/head pull/165/head
git bundle verify docs/ui-review/issue-156/integration-handoff/runtime-c20c4ef.bundle
git fetch ./docs/ui-review/issue-156/integration-handoff/runtime-c20c4ef.bundle refs/heads/review/165-integration-20261021:refs/heads/qa/pr160-frozen-integration
git show --no-patch --format='%H %T %P' qa/pr160-frozen-integration
```

Các hash đầy đủ, hash nguồn chạy mới và checksum artifact nằm trong [manifest.json](manifest.json).

## Artifact lịch sử được giữ nguyên

| Artifact                                                                                                                        | Nội dung và giới hạn                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Log build tích hợp](historical/integration-build.log) + [kết quả dừng CLI](historical/old-build-interruption-tool-output.json) | Có compile/type/static-route output; CLI còn chạy và bị ngắt. **Không phải build exit 0.**                                                                                    |
| [Start production](historical/production-start-tool-output.json)                                                                | Output gốc của server localhost:3265 ở lượt #165 và lượt CTA #160 sau đó.                                                                                                     |
| [Playwright #165 nguyên bản](historical/pr165-playwright-original.json.gz)                                                      | Toàn bộ JSON reporter của lượt 11:08 UTC: 8 ca, kèm ảnh/health attachment. Không phải JSON tóm tắt. [Checksum trước nén](historical/report-checksum.json).                    |
| [Playwright/cleanup #165](historical/pr165-playwright-cleanup-tool-output.json)                                                 | Các chunk terminal còn giữ, gồm kết quả 8 pass và cleanup; không tuyên bố đây là toàn bộ stdout của lượt cũ.                                                                  |
| [Playwright/cleanup CTA #160 trên tích hợp](historical/cta-playwright-cleanup-tool-output.json)                                 | Năm chunk gốc: tạo fixture, bốn case desktop/mobile sáng/tối, 4 pass, cleanup và exit 0. Khớp lượt 13:43 UTC trong [báo cáo trước](../real-session/integration/results.json). |
| [Stop server #165](historical/pr165-server-stop-tool-output.json)                                                               | Giữ cả cảnh báo Better Auth plugin order.                                                                                                                                     |
| [Unit](historical/integration-tests.log), [TypeScript](historical/integration-types.log)                                        | Log lịch sử của đúng bản tích hợp; không ghi thành lần chạy mới.                                                                                                              |

Các JSON `*-tool-output.json` được trích nguyên output của các lời gọi công cụ đã lưu trước review mới, giữ timestamp/call ID/chunk ID/mã thoát quan sát được. Chúng không phải stdout được dựng lại từ kết quả tóm tắt. Log build giữ nguyên encoding ban đầu.

Nguồn runner/spec được lưu ở [historical/source](historical/source). Cặp `knowledge-map-review.spec.ts` / `verify-knowledge-map-browser.mjs` khớp Git blob trong commit đã công bố `f190c71`; cặp CTA khớp `29bd760`. Đã giữ cả `fixtures.ts`, `env.ts`, `playwright.config.ts` đi kèm. Các exclusion health có sẵn (gồm hydration warning) được giữ trong source, không xóa khỏi hồ sơ.

Để giải nén và xem từng case cùng health attachment, từ repo root:

```powershell
node docs/ui-review/issue-156/integration-handoff/tools/inspect-report.mjs docs/ui-review/issue-156/integration-handoff/historical/pr165-playwright-original.json.gz pr165-original-report.json
```

## Kiểm tra bổ sung

Runner `apps/web/scripts/verify-knowledge-map-cta.mjs --allow-dev-db --edge-states` tạo hai identity và hai khóa QA ngẫu nhiên. Một bản đồ có trạng thái `ready` dù có các concept/bài đã xuất bản; bản đồ còn lại `confirmed` và có một concept accepted không gắn bài. Đăng nhập qua form thật, API/map response không bị intercept. Tài khoản có enrollment/path/mastery được chuẩn bị trong DB; đây không phải kiểm chứng signup hoặc tiến trình học tự nhiên.

Mỗi lượt có bốn case: 1280×800 / 375×844 × sáng/tối. Hai trạng thái được assert trong từng case:

| State                               | UI                                                                                         | Server/API                                                                    |
| ----------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| Truy cập thẳng bản đồ chưa xác nhận | Empty state, không graph/list control/panel/CTA; có link về lộ trình                       | HTTP 200, `confirmed:false`, `nodes:[]`, `edges:[]` dù fixture có concept/bài |
| Concept chưa có bài liên quan       | Hiện “Chưa có bài được xuất bản cho khái niệm này.”, mastery “Chưa học”, không có link bài | HTTP 200, concept có `level:0`, `locked:false`, `lessons:[]`                  |

Không có document overflow ở các viewport trên. Kiểm tra bản đồ chưa xác nhận ở đây là truy cập trực tiếp và lọc dữ liệu server; không chứng nhận việc ẩn tab ở mọi màn hình khác. Flow L12/S13c và ảnh mockup tham chiếu vẫn ở [README của module](../README.md#ảnh-đối-chiếu).

Kết quả mới ngày 21/10/2026, cùng runner/spec đã commit trong đợt bổ sung này:

| Server / runtime                                          | Kết quả                              | Log gốc / mã thoát                                                                                                                                                                | Báo cáo đầy đủ                                                                                                             |
| --------------------------------------------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| #160 riêng, application source không đổi so với `4981058` | 4 pass, 0 fail/skip/flaky; 15:02 UTC | [Log và cleanup](current/standalone/playwright-cleanup.log), [exit 0](current/standalone/playwright-cleanup.log.json), [start server](current/standalone/server.log)              | [JSON reporter gốc](current/standalone/playwright-original.json.gz), [chỉ mục/checksum](current/standalone/summary.json)   |
| Tích hợp #165, `c20c4ef`                                  | 4 pass, 0 fail/skip/flaky; 15:20 UTC | [Log và cleanup](current/integration-edge-playwright-cleanup.log), [exit 0](current/integration-edge-playwright-cleanup.log.json), [start server](current/integration-server.log) | [JSON reporter gốc](current/integration/playwright-original.json.gz), [chỉ mục/checksum](current/integration/summary.json) |

Tổng cộng **8 case / 16 ảnh**, cả tám `browser-health` attachment đều `[]` (không phải chỉ kết quả sau filter). Không chạy model hoặc gửi email trong fixture này. Cả hai lượt báo cleanup thành công: `finally` chỉ xóa identity/course của lượt chạy, kiểm tra không còn session, credential, enrollment hoặc skill của lượt đó. Server QA đã dừng sau lượt kiểm tra. Không chạy lại các case CTA đã được reviewer chấp nhận khi log/ảnh/source cũ đã khôi phục được.

### Giới hạn build phải giữ khi nghiệm thu

- [Build Turbopack mới](current/build.log) trên nguyên source `c20c4ef` compile, type check và tạo đủ **44 trang**, nhưng CLI vẫn chưa tự thoát; đã ngắt tiến trình sau kiểm tra trình duyệt. **Không ghi thành build exit 0.** [Trạng thái các lần thử](current/build-attempts.json).
- Lần mới dùng `NEXT_TELEMETRY_DISABLED=1`, `NEXT_TURBOPACK_USE_WORKER=0`, `NEXT_USE_POST_BUILD=1`; flag cuối tách tối ưu cache/compaction theo mã Next cục bộ. Không tắt type check hoặc đổi application/config source. Việc thử các flag này vẫn chưa giải quyết việc CLI giữ tiến trình.
- [Build webpack](current/build-webpack-type-failure.log) thực sự **exit 1** ([metadata](current/build-webpack-type-failure.log.json)): `.next/types/app/profile/github/page.ts` không chấp nhận tham số props có thể là `undefined` của `GithubProfilePage` trong snapshot. Log còn giữ cảnh báo dynamic dependency từ Varlock. Đây là giới hạn được phát hiện khi chạy lại snapshot, chưa sửa trong PR CTA.
- Browser tích hợp chạy bằng artifact Turbopack vừa tạo sau khi bảng route đã xuất hiện, trong lúc CLI còn chờ đóng. Bằng chứng này xác minh UI/API trên source đó; không thay thế điều kiện full build/deploy hoặc nghiệm thu dependency PR.
- Các lần bị sandbox từ chối hoặc bị ngắt trước đó giữ riêng trong `current/build-*.log` và [lượt browser bị từ chối](current/standalone/playwright-sandbox-denied.log). Chúng không được tính là pass. Build/CI của head #160 trên develop hiện tại đã được reviewer chấp nhận trong review liên kết ở đầu; không gán kết quả đó cho snapshot tích hợp cũ.
- TypeScript của checkout #160 và standards được kiểm tra lại trong đợt này; [log TypeScript](current/types.log), [log standards](current/standards.log). Không có thay đổi application/schema/mockup nên không chạy lại toàn bộ Vitest đã được chấp nhận ở review trước.

### Ảnh đăng nhập thật — #160 riêng

| State                 | Desktop light                                                  | Desktop dark                                                  | 375px light                                                   | 375px dark                                                   |
| --------------------- | -------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------ |
| Chưa xác nhận         | [Ảnh](current/standalone/unconfirmed-desktop-light.png)        | [Ảnh](current/standalone/unconfirmed-desktop-dark.png)        | [Ảnh](current/standalone/unconfirmed-mobile-light.png)        | [Ảnh](current/standalone/unconfirmed-mobile-dark.png)        |
| Chưa có bài liên quan | [Ảnh](current/standalone/no-related-lessons-desktop-light.png) | [Ảnh](current/standalone/no-related-lessons-desktop-dark.png) | [Ảnh](current/standalone/no-related-lessons-mobile-light.png) | [Ảnh](current/standalone/no-related-lessons-mobile-dark.png) |

### Ảnh đăng nhập thật — tích hợp #165

| State                 | Desktop light                                                   | Desktop dark                                                   | 375px light                                                    | 375px dark                                                    |
| --------------------- | --------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------- |
| Chưa xác nhận         | [Ảnh](current/integration/unconfirmed-desktop-light.png)        | [Ảnh](current/integration/unconfirmed-desktop-dark.png)        | [Ảnh](current/integration/unconfirmed-mobile-light.png)        | [Ảnh](current/integration/unconfirmed-mobile-dark.png)        |
| Chưa có bài liên quan | [Ảnh](current/integration/no-related-lessons-desktop-light.png) | [Ảnh](current/integration/no-related-lessons-desktop-dark.png) | [Ảnh](current/integration/no-related-lessons-mobile-light.png) | [Ảnh](current/integration/no-related-lessons-mobile-dark.png) |

Các ảnh full-page có thể giữ vị trí sticky header sau cuộn đến panel; không dùng chúng để chứng nhận lại header toàn sản phẩm. Chỉ có identity/catalog QA tạm trong ảnh.

## Chạy lại

Khởi động production server của source cần kiểm tra với `BETTER_AUTH_URL` khớp origin. Từ `apps/web` của checkout #160 có runner/spec bổ sung, trỏ đến server cần kiểm tra:

```powershell
$env:E2E_BASE_URL = 'http://localhost:3265'
node scripts/verify-knowledge-map-cta.mjs --allow-dev-db --edge-states

# Bốn ca CTA/prerequisite guard đã có:
node scripts/verify-knowledge-map-cta.mjs --allow-dev-db
```

Runner cần DB development đã có migration của các dependency; không chạy migration/schema trong lượt này. Không commit `.env`, mật khẩu hoặc browser storage state. [tools/capture-command.mjs](tools/capture-command.mjs) ghi stdout/stderr UTF-8 và metadata mã thoát khi tiến trình con thực sự đóng; dùng từ đúng thư mục `apps/web`, truyền đường dẫn log rồi các đối số Node của lệnh cần chạy.
