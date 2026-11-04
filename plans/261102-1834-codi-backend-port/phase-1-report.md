# Phase 1 report: foundation

Status: done. Backend runs Codi's API on Hono against database `codi`; real sign-in is wired in the frontend shell;
every page still works (unported pages use the transitional JSON store). smoke 59/59 ok, flow passes.

## Layout

| Path | What |
|---|---|
| `frontend/` | The Vite app (moved with `git mv`, unchanged except auth wiring). Port 5190, proxies `/api` → 4100. |
| `backend/src/app/api/**/route.ts` | 45 Codi route files, verbatim. |
| `backend/src/app/dashboard/**/actions.ts` | 13 Codi `'use server'` modules (79 actions) + their two helpers (`course-queries.ts`, `submission-identity.ts`), verbatim. |
| `backend/src/lib/**` | The 109 lib files those import transitively (no tests, no React). |
| `backend/src/services.ts`, `env.server.ts` | Verbatim. `env.ts` is replaced (see Env). |
| `backend/packages/{db,auth,coding-runner,ui}` | Codi packages as npm workspaces (`ui` only carries `lib/mastery.ts`). db: schema + migrations + `createDb`; no varlock. |
| `backend/shims/{next,server-only}` | Local packages named `next` and `server-only`. |
| `backend/src/host/` | `next-routes.ts` (route mounting), `server-actions.ts` (actions endpoint). `src/server.ts` is the entry. |
| `backend/legacy/` | Old Express store, now mounted on Hono (`routes.js`). Delete in Phase 3. |
| `backend/scripts/` | `migrate.ts`, `seed.ts`, `export-rebuild-seed.mjs`, Codi's `seed-mockup*.ts` + `seed-quiz-revision.ts` (verbatim), `seed-source/` (rebuild seed + patches + `load-seed.js`). |

Vendored file set = transitive import closure of routes + actions + `services.ts` + seed scripts (computed by script, so
nothing unused was copied). Root is an npm workspace (`frontend`, `backend`, `backend/packages/*`, `backend/shims/*`);
`@codi-1/*` resolve as workspace packages, `@/` via `backend/tsconfig.json` paths (tsx honours them). Versions are
Codi's lockfile versions (drizzle-orm 1.0.0-rc.4, better-auth 1.7.5, ai 7.0.107, zod 4.6). Root `overrides` pin
`@better-auth/core` 1.7.5, `@better-auth/utils` 0.4.2 and `better-call` 1.4.0 as in Codi's lockfile.

Changes to vendored code (the only ones):
- `packages/auth/src/index.ts`: change-email / forget-password OTP without a Resend key logs the code instead of throwing.
- `packages/db/drizzle.config.ts`: no varlock import, local default URL.

## Shim design

- `next/request-context` (shim-only): `AsyncLocalStorage` store `{ request, setCookies[] }`; `applyResponseCookies` appends recorded `Set-Cookie` to the response.
- `next/headers`: `headers()` returns the active request's headers; `cookies()` get/getAll/has/set/delete, `set` records a serialized `Set-Cookie`. Throws "`cookies` was called outside a request scope." outside a request (Better Auth's `nextCookies` plugin expects that message).
- `next/server`: `NextRequest extends Request` (+ `nextUrl`, `cookies`), `NextResponse extends Response` (`json`, `redirect`, `next`), `after(fn)` runs on `setImmediate` and logs failures.
- `next/cache`: `revalidatePath`, `revalidateTag`, `updateTag`, `refresh`, `unstable_noStore` no-ops; `unstable_cache(fn)` returns fn.
- `server-only`: empty module. `next/navigation` is not needed (no action uses redirect/notFound).

## Router

- Startup walks `src/app/api/**/route.ts`; `[x]` → `:x`, `[...x]` → `*` (params.x = remaining segments). Static segments sort before params, params before catch-alls (`/orders/buy-now` before `/orders/:id`).
- Each exported GET/POST/PUT/PATCH/DELETE gets `(NextRequest, { params: Promise.resolve(params) })` inside the request context. An uncaught throw becomes 500 `{error:"Lỗi máy chủ. Vui lòng thử lại."}` (logged).
- `GET /api/health` → `{ok:true}` or 503.
- All 45 routes mount; none stubbed.

## Actions

`POST /api/actions/<module>/<exportName>`, body = JSON array of positional args (empty body = no args). `<module>` = folder under `src/app` without brackets, e.g. `dashboard/lecturer/courses/courseId/kmap`. Response = the return value as JSON (`undefined` → `null`; Dates → ISO strings). Errors: `ForbiddenError` → 403; message starting "Unauthorized" or equal to "Vui lòng đăng nhập." → 401; other errors → 500 `{error: message}` (database errors get a generic message). No action takes FormData. Frontend: `api.action('dashboard/lecturer', 'getLecturerCourses')`.

## Env

`backend/src/env.ts` reads `process.env` (loaded by `tsx --env-file-if-exists=.env`). Keys: `DATABASE_URL` (default `postgresql://codi:codi@localhost:5544/codi`; Supabase URLs are refused), `LEGACY_DATABASE_URL` (default `.../codi_rebuild`), `API_PORT` (4100), `BETTER_AUTH_URL` (`http://localhost:5190`, also the only trusted origin), `BETTER_AUTH_SECRET` (dev default, ≥32 chars, required in production), `SEED_ACCOUNT_PASSWORD` (`Codi@12345`), `AI_PROVIDER`, `AI_MODEL`, `GOOGLE_GENERATIVE_AI_API_KEY`, `OPENAI_API_KEY`, `RESEND_API_KEY`, `EMAIL_FROM`, `GOOGLE_CLIENT_ID/SECRET`, `GITHUB_CLIENT_ID/SECRET`, `R2_*`, `SEPAY_WEBHOOK_SECRET`, `SEPAY_BANK_CODE`, `SEPAY_ACCOUNT_NUMBER`, `GITHUB_PROFILE_BUDGET_KEY/SLOT/CANDIDATE_SHA`. The local `backend/.env` has AI, OAuth, SePay and GitHub-budget values copied from Codi's `.env`; R2 and Resend were deliberately not copied (they would write to Codi's real bucket / send real mail).

## Seed

`npm run seed`: pg_dump backup if `codi` has users (`../.codi-gc-preserved/db-backups/codi-<stamp>.dump`), drop/recreate schemas, Codi migrations, `export-rebuild-seed.mjs` (rebuild `data.js` + all patches → `scripts/data/mockup-seed.json`, gitignored; fills missing order-timeline labels and drops a null `solutionCheck` to fit the importer schema), Codi's `seed-mockup.ts` unchanged, then sets `user.image` (Pexels avatars), `emailVerified=false` for `usr-learner-010`, and `course_details.cover_image_url` (`/images/courses/<slug>.webp`) from the rebuild seed.

Ids: users and courses keep mockup ids (`usr-learner-001`, `course-js-001`). **Chapters and lessons get UUIDs** (`stableUuid('mockup:lesson:<id>')`, see `scripts/seed-mockup-mapping.ts`); learn routes reject non-UUID lesson ids. Assessments, orders, vouchers etc. use integer ids; order codes stay `CODIxxxxx`. 109 users, 9 courses (5 published), 120 orders, 145 enrolments.

## Frontend

- `frontend/src/lib/api.js`: `api(url, {method, body})`, `api.get/post/put/patch/del`, `api.action(module, name, ...args)`; `credentials:'include'`; throws `ApiError` (`message` = server `error`/`message`, `status`).
- `frontend/src/lib/use-api.js`: `useApi(url)` → `{data, loading, error, reload, setData}`; aborts stale requests.
- `codi.js`: boot loads snapshot + `GET /api/auth/get-session` + `GET /api/user/roles`; `Codi.session = {user, roles}`; `Codi.state.currentUserId` comes from the session (no longer from localStorage); `Codi.role()` prefers backend roles. `Codi.signIn(email, password)`, `Codi.signOut()`, `Codi.refreshSession()`.
- Login form → Better Auth email sign-in (wrong password / disabled account / 429 messages). Alt+K role switch signs in as the seeded account. Header / settings / search sign-out call `/api/auth/sign-out`.
- E2E (`.../scratchpad/e2e/login.js` `loginAs(ctx, userId)`): API sign-in via `ctx.request` (cookie shared with the context); smoke, flow, axe, mobile use it. Originals kept as `*.bak-localstorage`.

## Not done / open items for later phases

- Register, email OTP, social sign-in, forgot/reset password and settings password/session screens still use the in-browser simulation (shell phase). Social/OAuth callbacks are registered for Codi's domain, so real Google/GitHub sign-in will not work on localhost without new OAuth apps.
- Codi's `better-auth@1.7.5` patch (shared-GitHub-identity account linking) is not applied; only matters for GitHub linking edge cases.
- `/api/reset` (Alt+K "Đặt lại dữ liệu") resets only the legacy store, not `codi`. Use `npm run seed`.
- R2 is not configured: avatar upload (`POST /api/user/avatar`, `GET /api/avatar`) and assignment file upload return 500/503.
- Routes that skip checks in Codi itself (kept as is): `GET /api/payments/check-transaction/:id` is public; `GET /api/courses?include_hidden=true` has no auth check; conversations/discussions/tutor-threads skip the enrolment check.

## Contract: routes

Error bodies are `{error: string}` unless stated. "Origin check" = `Origin` header must equal the request origin (true through the Vite proxy). Better Auth errors are `{message, code}`.

| Method | Path | Auth | Request | Response |
|---|---|---|---|---|
| GET | /api/health | public | - | `{ok:true}`; 503 `{ok:false,error}` |
| GET | /api/snapshot · POST /api/sync · POST /api/reset | public (transitional) | sync: `{upserts,deletes,kv,kvDelete}` | legacy JSON store; removed in Phase 3 |
| GET | /api/admin/finance/:card | ADMIN | path card | always 404 `{status:"unavailable",message}` after the admin check; 401/403 |
| GET | /api/admin/finance/overview | ADMIN | query period=7/30/90/month (default 30) | FinanceData `{window,previousWindow,totals{gross,discount,net,paidOrders,averageOrderValue,refunds,refundCount},previousTotals,daily[],previousDaily[],statusDistribution[],courses[],paymentTime,vouchers[],reconciliation{underpaid,stalePending,flagged,items[]}}`; 400/401/403/500 |
| GET | /api/admin/insights/:card | ADMIN | card=users/courses/orders; query period | `{value,window}`; other card 404 `{status:"unavailable",message}`; 400/401/403/500 |
| GET | /api/admin/insights/overview | ADMIN | query period (default 30) | `{window,previousWindow,daily[],previousDaily[],totals,previousTotals,publishedCourses,funnel{signups,verified,purchased,firstLesson},courseStatus{draft,pending,rejected,published,hidden},completion[],operations{unansweredQuestions,unrepliedReviews}}` |
| GET | /api/ai | public (session optional) | - | `{user:{id,name}\|null,currentCourse:{id,slug,title,doneLessons,totalLessons}\|null,catalog:AdvisorCourseItem[],savedIntake\|null}` |
| POST | /api/ai | public (session optional) | `{prompt; intake?:{goal?,level?,hoursPerWeek?,skipped?[]}; history?:[{role:"user"/"ai",text,courseIds?}] ≤20}` | `{text,courses[≤3],table:{headers,rows}\|null,order[≤6 {id,slug,title,reason}],followups[],noMatch,logId,feedbackToken\|null,currentCourse}`; 400; 429 `{error,body,retryAfter}` (10/min/IP); 500 `{error,body}` (needs AI key) |
| POST | /api/ai/feedback | log owner or guest feedbackToken | `{logId?,feedbackToken?,vote:"up"/"down"/null,reason?,comment?}` | `{success:true,vote,reason}`; 400/403/404/500 |
| GET,POST | /api/auth/* | Better Auth | `POST sign-in/email {email,password,rememberMe?}`; `POST sign-up/email {name,email,password}`; `POST sign-out {}`; `GET get-session`; `POST update-user`, `change-password`, `unlink-account {accountId}`, `get-access-token {accountId}`; `GET list-accounts`; `POST sign-in/social`, `GET callback/:id`; email-otp: `send-verification-otp {email,type}`, `check-verification-otp {email,type,otp}`, `verify-email {email,otp}`, `sign-in/email-otp`, `forget-password/email-otp {email}`, `reset-password {email,otp,password}`, `request-email-change {newEmail}`, `change-email {newEmail,otp}`; account recovery (session): `account/password/request-reset {}`, `verify-reset {otp}`, `GET reset-status`, `reset {newPassword}` | sign-in → `{redirect,token,user}` + session cookie; get-session → `{session,user}` or `null`; recovery → `{success}` (`{email}` for request-reset/reset-status); errors `{message,code}` (401 INVALID_EMAIL_OR_PASSWORD; banned → 401 "Tài khoản đã bị vô hiệu hoá.") |
| GET | /api/avatar | public | query key | image bytes; plain-text 400/404/500 (needs R2) |
| GET | /api/courses | public | query sort=title/popular, limit 1-100, include_hidden=true | `{courses:[{id,slug,title,category,level,duration,description,price,instructorId,rating,reviewCount,createdAt,status,enrollmentCount,coverImageUrl,instructorName,topics[]}]}`; published only unless include_hidden |
| GET | /api/courses/:slug | public (published) | path slug | `{course:{...},instructor:{name,title,avatar,bio}\|null,rating,reviewCount,reviews?[],learningOutcomes[],requirements[],targetAudience,coverImageUrl,introVideoUrl,introVideoCaptionsUrl,chapters[{id,title,lessons[]}],summary{chapterCount,lessonCount,durationSeconds}}`; 400/404 |
| POST | /api/courses/enroll-free | LEARNER | `{courseId}` (Content-Type JSON required) | `{success:true,courseId}`; 400 paid/missing; 401/403/404/415 |
| POST | /api/courses/ownership | public (session optional) | `{courses:(string\|{id})[] ≤200}` | `{ownerships:{[courseId]:{ownership:"owned"/"pending-payment"/"in-cart"/"free"/"not-owned",pendingOrderId?}},ownership:<same>}` |
| GET | /api/github-profile | LEARNER | - | `{profile\|null}`; errors `{code,error}` |
| POST | /api/github-profile | LEARNER + origin check | `{consentVersion:"public-github-v1",githubProfileInput?}` | `{profile}`; errors `{code,error,retryAt?}` 400/401/403/409/429/502/503 (503 not_ready unless budget keys + openai + GitHub OAuth set)/504 |
| DELETE | /api/github-profile | LEARNER + origin + fresh session | - | `{disconnected:true}`; 400/401/403/409/503 |
| GET | /api/insights/knowledge-map | LEARNER (enrolled) | query course? | `{courses:[{id,title}],courseId,title,confirmed,nodes[{skill id,name,level 0-4,locked,recommended,lessons[]}],edges[]}` |
| GET | /api/insights/stats | LEARNER | query period=7/30/90/month, course=id/all | `{enrollments,completedLessons,previousCompletedLessons,studyMinutes,previousStudyMinutes,streak{current,best},weeklyGoalMinutes,weeklyGoalSet,days[],weeks[],calendar[],skills{total,mastered,items[]},diagnosticSkipped,courses[],scores[],quizzes[],window}` |
| GET | /api/learner/overview | LEARNER | - | `{name,courses[{id,title,slug,cover,hidden,goal,goalSetAt,weeklyGoalMinutes,lastActiveAt,pathStatus,showDiagnostic,complete,done,total,percent,nextLessonId,skills[],lessons[{id,title,status,lock,results[]}]}],continueCourseId,weekly{minutes,goalMinutes,assumed,courseId,streak,days[]},stats{active,completed,lessons,pending,answered,feedback},latestFeedback,recommendations[]}` |
| POST | /api/learner/overview | LEARNER + origin | `{type:"dismiss-diagnostic",courseId}` or `{type:"restore-diagnostic",courseId,dismissedAt}` | `{dismissedAt\|null}`; 400/401/403/409 |
| GET | /api/notifications | session | - | `{items[≤50 newest first],unreadCount}` |
| PATCH | /api/notifications | session + origin | `{all:true}` or `{id}` | `{success:true}`; 400/401/403/404 |
| GET | /api/orders/:id | owner | id = numeric id or `CODIxxxxx` | `{order:{id,code,subtotal,discountAmount,totalAmount,receivedAmount,status,failReason,isBuyNow,paymentDeadline,createdAt,paidAt,cancelledAt,voucherCode,items[{courseId,title,price,slug}]},bank:{bank,accountNumber,accountName}\|null}`; expires overdue pending; 404; 503 pending without SePay config |
| POST | /api/orders/:id/manual-check | owner | - | `{status,failReason,receivedAmount,totalAmount,checkedAt}` |
| POST | /api/orders/:id/new-code | owner | - | 201 `{orderId,orderCode}`; 400 not failed/expired; 409 |
| POST | /api/orders/buy-now | LEARNER | `{courseId}` (id or slug) | 201/200 `{orderId,orderCode,courseId,courseTitle,courseSlug,price,isExisting}`; 409 owned; 422 free |
| POST | /api/orders/cancel | owner | `{orderId?}` or `{orderCode?}` | `{success:true,message}` (items back to cart); 400/404 |
| POST | /api/orders/checkout | LEARNER | `{voucherCode?,replaceOrderId?}` (JSON) | 201 `{orderId,orderCode,totalAmount}` (free → paid); 400 empty cart; 409 `{error,code?:"PENDING_ORDER_EXISTS"}`; 503 without SePay config |
| GET | /api/payments/check-transaction/:id | public | id = transaction/order code | `{status}` (`"not_found"` if none) |
| POST | /api/payments/create-transaction | session | `{courseId\|courseSlug, orderCode?}` | `{transactionId,amount,receiver:{bankCode,accountNumber},course:{id,title,category}}`; 404/422/503 |
| POST | /api/payments/sepay/callback | webhook `Authorization: Apikey <SEPAY_WEBHOOK_SECRET>` | SePay `{transferType,accountNumber,content\|description (contains CODIxxxxx),transferAmount\|amountIn,id?,referenceCode?}` | `{success,message}` or `{success,underpaid:true,receivedAmount,targetTotal}`; errors `{success:false,message}` (dev: simulate payment by posting this with the local secret) |
| GET | /api/student/cart | LEARNER | query voucher? | `{items[{id,title,slug,price,level,category,coverImageUrl,lecturerName}],subtotal,discount,total,voucher\|null,voucherError?,removedOwnedTitles[],pendingOrder\|null,count,itemIds[]}` |
| POST | /api/student/cart | LEARNER | `{courseId}` (JSON) | 201 `{courseId,added:true}` / 200 `added:false`; 409 owned or `{error,orderCode}` pending |
| DELETE | /api/student/cart | LEARNER | `{courseId}` (JSON) | `{success:true,courseTitle?}` |
| GET | /api/student/profile | session | query year?, scope=activities? | `{activities[]}` or `{activities[],enrollments[{enrollment,course}],wishlist[],cart[],transactions[]}` (raw rows) |
| POST | /api/student/profile | session | `{type:"login"/"course_view"/"lesson_complete"/"quiz_complete"/"course_enrolled",courseId?,metadata?}` | 201 `{activity}` |
| POST | /api/user/avatar | session | multipart `file` (+`name`) or `{presetUrl\|syncUrl,name?}` | `{success:true,imageUrl,message}` (needs R2) |
| PATCH | /api/user/profile | session | `{name}` | `{success:true,message,user:{id,name,email}}`; 400 blank/unchanged |
| GET | /api/user/roles | public | - | `{roles:("LEARNER"/"LECTURER"/"ADMIN")[]}` ([] signed out) |
| POST | /api/vouchers/validate | LEARNER | `{code}` (JSON) | `{valid:true,voucher:{code,type,value,discount}}`; 400 with Vietnamese reason |
| GET | /api/learn/:courseId/access/:lessonId | LEARNER enrolled | lessonId = UUID | `{lessonId,allowed:true}`; 403/404/409 path not set up |
| GET | /api/learn/:courseId/lessons/:lessonId | LEARNER enrolled | - | LessonPlayerView `{lesson{id,title,chapterTitle,description,body,durationSeconds},materials[{id,title,type,url,durationSeconds}],media{[materialId]:{seconds?,pages?,pageCount?,lastPage?}},positionSeconds,studied,completed,checklist[{key,label,done,note,assessmentId?,tutorial?}],path:CoursePathView}` |
| POST | /api/learn/:courseId/lessons/:lessonId | LEARNER enrolled + origin | `{type:"open"\|"study"\|"complete"}` or `{type:"video",materialId,seconds,ended}` or `{type:"pdf-page",materialId,page,pages}` | media → `{kind:"media-progress",media,positionSeconds,studied,completed}`; else LessonPlayerView (complete adds `adjustment\|null`); 409 checklist incomplete |
| POST | /api/learn/:courseId/lessons/:lessonId/activity | LEARNER enrolled + origin | `{action:"start",trackerId,expectedOwner}` or `{action:"prepare"\|"heartbeat"\|"stop",trackerId}` | `{recorded,owner?}` |
| GET | /api/learn/:courseId/lessons/:lessonId/assessments/:assessmentId | LEARNER enrolled | assessmentId integer | AssessmentView `{id,type:quiz/assignment,title,instructions,maxScore,passingScore,submissionFormat,maxFileSizeMb,rubric,dueDays,questions[{id,text,codeSnippet,options[{id,text}]}],submission\|null{id,attempt,status,score,quizPercent,isPassed,submittedAt,gradedAt,feedback,fileName,fileUrl,linkUrl,answerText,draft,answers[],review[]},previousScore,previousQuizPercent,unavailableReason}` |
| POST | same | LEARNER enrolled + origin | `{type:"quiz-open"}`, `{type:"quiz-retake",submissionId}`, `{type:"quiz-answer",submissionId,questionId,optionId}`, `{type:"quiz-submit",submissionId,confirmUnanswered}`, `{type:"assignment-draft"\|"assignment-submit",linkUrl,answerText}`, `{type:"assignment-cancel"\|"assignment-remove-file"}` | AssessmentView; 400/409 |
| GET | .../assessments/:assessmentId/coding | LEARNER enrolled | - | CodingView `{id,title,instructions,language,available,starterCode,code,hints[],lockedHints,solution\|null,solutionAvailable,solutionViewed,runs,submits,failedSubmits,passed,score,tests[{id,name,input,expectedOutput}],lastRun\|null{mode,phase,durationMs,logs[],passed,total,hiddenPassed,hiddenTotal,outcomes[]}}`; 409 tutorial lesson; 503 |
| POST | .../assessments/:assessmentId/coding | LEARNER enrolled + origin | `{type:"draft"\|"run"\|"submit",code}` or `{type:"reset"\|"solution",confirmed:true}` | draft → `{saved:true,code}`; else CodingView; 409/413/429 (2 s cooldown)/503 (sandbox busy, non-JS) |
| GET | .../assessments/:assessmentId/file | LEARNER enrolled | query draft=1? | file stream (needs R2) |
| POST | .../assessments/:assessmentId/file | LEARNER enrolled + origin | `{type:"prepare",name,size}` or `{type:"confirm",token}` | prepare `{url,token,expiresIn}`; confirm AssessmentView; 503 without R2 |
| GET | .../assessments/:assessmentId/tutorial | LEARNER enrolled | - | TutorialView `{fileName,language,available,current,visited[],done,steps[{title,isSolution}],title,body,gated,code,lastRun}` |
| POST | .../assessments/:assessmentId/tutorial | LEARNER enrolled + origin | `{type:"step",step}`, `{type:"draft"\|"run",step,code}`, `{type:"reset"\|"solution",step,confirmed:true}` | draft `{saved:true,code}`; else TutorialView |
| GET | /api/learn/:courseId/lessons/:lessonId/conversations | LEARNER | - | `{conversation\|null{id,courseId,lessonId,lecturerName,status,fromAi,aiContext,messages[{id,authorId,isLecturer,text,at}],hasLecturerReply,createdAt}}` |
| POST | same | LEARNER | new `{text (10-5000),withCode?,withTest?,withAi?,code?,failingTest?,aiSummary?}`; reply `{conversationId,text}` | `{conversation}` or `{reply:{id,authorId,isLecturer:false,text,at}}`; service errors surface as 500 |
| GET | /api/learn/:courseId/lessons/:lessonId/discussions | LEARNER | - | `{questions[{id,courseId,lessonId,userId,name,avatar,text,status,createdAt,replies[]}]}` |
| POST | same | LEARNER | `{text (10-5000)}` | the new question (unwrapped) |
| GET | /api/learn/:courseId/lessons/:lessonId/tutor | LEARNER enrolled | - | TutorView `{lessonTitle,isCode,hintLevel,lecturerName,messages[{id,role,text,lines,diff,stopped,vote,reason,at}],conversation\|null}` |
| POST | same | LEARNER enrolled + origin | `{type:"ask",question,mode?,context?,retryOf?}` · `{type:"hint",context?}` · `{type:"vote",messageId,vote,reason?}` · `{type:"diff",messageId,state}` · `{type:"clear"}` · `{type:"escalate",text,code?,failingTest?,withSummary}` | ask → **streamed text/plain**; others TutorView; 429 `{error,retryAfter,view}` (8/min); 503 `{error,view}` AI unavailable |
| GET | /api/learn/:courseId/onboarding | LEARNER enrolled | - | OnboardingView `{canRequestPath,enrollment{learningGoal,selfAssessedLevel,weeklyGoalMinutes,goalDraft,goalStep,goalEditing,diagnosticStatus,diagnosticQuestionIndex,pathStatus,pathSource,goalSet},course{id,title},diagnostic\|null,attemptId,answers[],result\|null}` |
| POST | same | LEARNER enrolled + origin | `{type: goal-save-draft {step,draft} \| goal-commit {draft} \| goal-pick {step,value} \| goal-next/goal-back {step} \| goal-skip \| goal-edit \| goal-cancel \| fork-default \| fork-diagnostic \| diagnostic-start \| diagnostic-postpone \| diagnostic-retake \| request-path \| answer {attemptId,questionId,optionId,unknown} \| previous/next {attemptId,questionId} \| submit {attemptId}}` | OnboardingView; 409 invalid transition |
| GET | /api/learn/:courseId/path | LEARNER enrolled | - | CoursePathView `{course{id,title,slug},status,source,goal,hours,goalEditing,diagnosticStatus,showDiagnosticCard,pathId,rationale,highlights[],updating,update,review,recommendation,rows[{lessonId,reason,isSkippable,status,lock,mastery[]...}],currentLessonId,done,total,percent,complete}` |
| POST | same | LEARNER enrolled + origin | `{type:"sync"\|"retry"}`, `{type:"ack-highlights"\|"dismiss-update",pathId}`, `{type:"adjust",afterLessonId,option}`, `{type:"undo-adjust",pathId}`, `{type:"review",rating,text}` | CoursePathView; 409 |
| GET | /api/learn/:courseId/tutor/threads | LEARNER | - | `{threads[{lessonId,lessonTitle,firstQuestion,lastAt,messageCount}]}` |

## Contract: actions

`POST /api/actions/<module>/<action>`, body = JSON array of the args below. "own" = lecturer must own the course; "editable" = not while the course is pending review.

| Module | Action | Auth | Args | Returns |
|---|---|---|---|---|
| dashboard/admin | updateUserRole | ADMIN | (targetUserId, newRoleId) | null; throws (last active admin guard) |
| dashboard/admin | toggleUserBan | ADMIN | (targetUserId, ban: boolean, reason? required to ban) | null; ban deletes sessions |
| dashboard/admin | hideCourseAction | ADMIN | (courseId, reason) | `{success,title}` |
| dashboard/admin | unhideCourseAction | ADMIN | (courseId) | `{success,title}` |
| dashboard/admin | updateCoursePriceAction | ADMIN | (courseId, newPrice int ≥0) | `{success,title,oldPrice,newPrice}` |
| dashboard/admin | cancelAdminOrderAction | ADMIN | (orderId: number, reason) | `{success,orderCode}` |
| dashboard/admin | getAdminOrderDetailAction | ADMIN | (orderIdOrCode) | order summary + `items[{id,courseId,courseTitle,unitPrice}]` + `timeline[]`, or null |
| dashboard/admin | getAdminOrdersExportAction | ADMIN | ({range?:'7'/'30'/'90'/'all', status?, q?, overdueOnly?, reconciliationOnly?}) | `AdminOrderSummaryItem[]` (id,code,userId,buyerName,buyerEmail,totalAmount,status,needsReconciliation,...) |
| dashboard/admin | createVoucherAction | ADMIN | ({code,type:'percent'/'amount',value,description?,minOrderAmount?,usageLimit?,expiresAt?}) | `AdminVoucherItem` |
| dashboard/admin | updateVoucherAction | ADMIN | (voucherId, partial voucher) | `AdminVoucherItem` |
| dashboard/admin | toggleVoucherActiveAction | ADMIN | (voucherId, active) | `{success,code,isActive}` |
| dashboard/admin | getUserImpactCounts | ADMIN | (targetUserId) | `{ownedCourses,pendingOrders,taughtCourses}` |
| dashboard/admin | getAdminDashboardData | ADMIN | () | `{kpis{revenue30d,paidOrders30d,allOrders30d,newLearners30d,publishedCourses},todo{pendingCoursesCount,overdueOrdersCount,expiringVouchersCount,inactiveUsersCount},recentOrders[≤5]}` |
| dashboard/admin/publication | getAdminPublicationQueue | ADMIN | (tab?: 'pending'/'changes'/'approved') | `{tab,counts{pending,changes,approved},items[{id,title,instructorId,instructorName,category,level,price,status,round,openFlagsCount,submittedAt}]}` |
| dashboard/admin/publication | getAdminCourseReview | ADMIN | (courseId) | `{course,instructor\|null,details{learningOutcomes,requirements,targetAudience},round,roundsHistory[],autoCriteria,blockingReasons[]}` |
| dashboard/admin/publication | saveCriterionVerdict | ADMIN | (requestId, criterionId, status:'pass'/'fix'/'na'/null, note?) | `{success:true}` |
| dashboard/admin/publication | applyAutoCriteria | ADMIN | (requestId, courseId) | `{success:true,appliedCount}` |
| dashboard/admin/publication | addReviewFlag | ADMIN | (courseId, requestId, {targetType,lessonId?,targetLabel,severity:'must'/'should',comment ≥10,source?}) | `{success:true,flagId}` |
| dashboard/admin/publication | updateFlagStatus | ADMIN | (flagId, 'open'/'closed') | `{success:true}` |
| dashboard/admin/publication | deleteReviewFlag | ADMIN | (flagId) | `{success:true}` |
| dashboard/admin/publication | approvePublication | ADMIN | (courseId, requestId, approvedPrice int) | `{success:true}` |
| dashboard/admin/publication | requestChanges | ADMIN | (courseId, requestId, reason ≥5) | `{success:true}` |
| dashboard/admin/publication | rejectPublication | ADMIN | (courseId, requestId, reason ≥5) | `{success:true}` |
| dashboard/lecturer | getLecturerDashboardStats | LECTURER | () | `{counts{grading,questions,reviews,byStatus{draft,pending,rejected,published,hidden}},rejectedCourseAlert\|null}` |
| dashboard/lecturer | getLecturerCourses | LECTURER | (filterStatus? status/'all') | `[{id,slug,title,description,category,level,status,chaptersCount,lessonsCount,learnersCount,rejectReason,hideReason,createdAt,updatedAt}]` |
| dashboard/lecturer | createCourseDraft | LECTURER | ({title,summary,category,level}) | `{success:true,courseId}` or `{success:false,errors}` |
| dashboard/lecturer | saveAiCourseDraft | LECTURER | (payload object) | `{success:true,draftId}` |
| dashboard/lecturer | decideAiCourseDraft | LECTURER own draft | (draftId, 'accepted'/'discarded') | `{success:true}` |
| dashboard/lecturer/courses/courseId | getCourseEditorData | LECTURER own | (courseId) | `{course,details{learningOutcomes,requirements,targetAudience,coverImageUrl,introVideoUrl},chapters[+lessons[]],entryTest\|null,isLocked}` |
| dashboard/lecturer/courses/courseId | updateCourseInfo | own, editable | (courseId, {title,summary,category,level,learningOutcomes[],requirements[],proposedPrice?}) | `{success:true}` or `{success:false,errors}` |
| dashboard/lecturer/courses/courseId | addChapter | own, editable | (courseId, title?) | `{success:true,chapter}` |
| dashboard/lecturer/courses/courseId | renameChapter | own, editable | (courseId, chapterId, title) | `{success:true}` |
| dashboard/lecturer/courses/courseId | moveChapter | own, editable | (courseId, chapterId, -1/1) | `{success}` |
| dashboard/lecturer/courses/courseId | deleteChapter | own, editable | (courseId, chapterId) | `{success:true}`; throws if it has lessons |
| dashboard/lecturer/courses/courseId | addLesson | own, editable | (courseId, chapterId, title?) | `{success:true,lesson}` |
| dashboard/lecturer/courses/courseId | renameLesson | own, editable | (courseId, lessonId, title) | `{success:true}` |
| dashboard/lecturer/courses/courseId | moveLesson | own, editable | (courseId, lessonId, -1/1) | `{success}` |
| dashboard/lecturer/courses/courseId | deleteLesson | own, editable | (courseId, lessonId) | `{success:true,deletedLesson:LessonSnapshot}` |
| dashboard/lecturer/courses/courseId | restoreLesson | own, editable | (courseId, LessonSnapshot) | `{success:true}` |
| dashboard/lecturer/courses/courseId | getLessonDetails | own, editable | (courseId, lessonId) | `{lesson,materials[]}` |
| dashboard/lecturer/courses/courseId | updateLesson | own, editable | (courseId, lessonId, {title,description?,durationMinutes?,body?,isFreePreview?,materials?[{id?,type,title,url,fileSizeKb?,durationSeconds?}]}) | `{success:true}` |
| dashboard/lecturer/courses/courseId | getQuizBuilderData | LECTURER own | (courseId, lessonId \| 'entry') | `{course,lesson\|null,isEntry,isLocked,passingScore,questions[{id,text,explanation,correctIndex,options[],optionIds[],lessonId}],allCourseLessons?}` |
| dashboard/lecturer/courses/courseId | saveQuizData | own, editable | (courseId, lessonId, {passingScore 1-100,isEntry,questions[{id?,text,explanation?,correctIndex,options[],optionIds?,lessonId?,aiGenerated?,aiReviewed?}]}) | `{success:true}` |
| dashboard/lecturer/courses/courseId | generateAiQuizQuestions | own, editable | (courseId, lessonId, count=3, difficulty='medium', {sourceText?,focus?}) | `{success:true,questions}` or `{success:false,code,message,retryable}` (needs AI key) |
| dashboard/lecturer/courses/courseId/code | getCodingExerciseData | LECTURER own | (courseId, lessonId) | `{course,lesson,isLocked,exercise{id,assessmentId,title,durationMinutes,language,starterCode,solutionCode,solutionVerifiedAt,instructions[],hints[],tests[]}}` |
| dashboard/lecturer/courses/courseId/code | verifySolutionCode | own, editable | (courseId, lessonId, {solutionCode,language:'javascript',tests[]}) | `{ok,total,passed,phase,error,logs[],outcomes[]}` |
| dashboard/lecturer/courses/courseId/code | saveCodingExercise | own, editable | (courseId, lessonId, {title,durationMinutes?,language,instructions[],starterCode,solutionCode,hints?,tests[]}) | `{success:true,verifiedAt,testIds[]}` (all tests must pass) |
| dashboard/lecturer/courses/courseId/code | runPreviewCode | own, editable | (courseId, lessonId, {code,mode:'run'/'submit'}) | `{mode,phase,sampleOutcomes[],hiddenPassed,hiddenTotal,totalPassed,totalTests,allPass,logs[]}` |
| dashboard/lecturer/courses/courseId/code | generateAiCodingTestCases | own, editable | (courseId, lessonId, {solutionCode,instructions[],existingTests[]}) | `{success:true,tests[≤3]}` (sandbox, no LLM) |
| dashboard/lecturer/courses/courseId/kmap | getKnowledgeMapData | LECTURER own | (courseId) | `{course{id,title,status,knowledgeMapStatus,...},isLocked,concepts[{id,name,description,source,review,lessonIds}],edges[{from,to,source,review}],chapters,lessons,cycle\|null,defaultOrder\|null}` |
| dashboard/lecturer/courses/courseId/kmap | runKnowledgeMapAnalysis | own, editable | (courseId) | always throws (disabled in Codi) |
| dashboard/lecturer/courses/courseId/kmap | reviewKnowledgeMapItem | own, editable | (courseId, 'concept'/'edge', {skillId?,fromSkillId?,toSkillId?,review}) | `{success:true}` |
| dashboard/lecturer/courses/courseId/kmap | renameKnowledgeMapConcept | own, editable | (courseId, skillId, newName) | `{success:true}` |
| dashboard/lecturer/courses/courseId/kmap | addKnowledgeMapEdge | own, editable | (courseId, fromSkillId, toSkillId) | `{success:true}` |
| dashboard/lecturer/courses/courseId/kmap | acceptAllKnowledgeMap | own, editable | (courseId) | `{success:true,acceptedConceptsCount,acceptedEdgesCount,skippedEdgesCount}` |
| dashboard/lecturer/courses/courseId/kmap | confirmKnowledgeMap | own, editable | (courseId) | `{success:true}` |
| dashboard/lecturer/courses/courseId/publish | getPublicationData | LECTURER own | (courseId) | `{course{id,title,summary,description,status,price,proposedPrice,rejectReason,reviewOutcome,publishedAt,hiddenReason,knowledgeMapStatus},readiness{allOk,items[]},round\|null,isLocked}` |
| dashboard/lecturer/courses/courseId/publish | submitCourseForPublication | own (draft/rejected) | (courseId) | `{success:true}` |
| dashboard/lecturer/courses/courseId/publish | markFlagFixed | own | (courseId, flagId, reply ≥5) | `{success:true}` |
| dashboard/lecturer/courses/courseId/publish | reopenFlag | own | (courseId, flagId) | `{success:true}` |
| dashboard/lecturer/grading | getGradingQueueData | LECTURER | ({status?,courseId?,assignmentId?,date?,submissionId?}) | `{courses[],assignments[],counts{pending,graded},currentStatus,selectedCourseId,selectedAssignmentId,selectedDate,submissions[{id,studentName,studentEmail,studentAvatar,courseId,courseTitle,lessonId,lessonTitle,status,score,maxScore,submittedAt,gradedAt}],selectedSubmission\|null (rubric,rubricScores,history[],viewToken,nextPendingId)}` |
| dashboard/lecturer/grading | gradeSubmission | LECTURER (course instructor) | ({submissionId,viewToken,score,feedback?,reason?,rubricScores?,courseFilter?,assignmentFilter?,dateFilter?}) | `{success:true,submissionId,nextPendingId}` or `{success:false,error}` |
| dashboard/lecturer/grading | getAiGradingDraft | LECTURER | (submissionId) | always `{success:false,error:'AI unavailable, grade manually'}` |
| dashboard/lecturer/insights | getLecturerInsightsData | LECTURER | (period '7'/'30'/'90') | `{state:'no-courses'}`, `{state:'no-published'}` or `{state:'ready',window,previousWindow,totals,previousTotals,daily[],previousDaily[],courses[]}` |
| dashboard/lecturer/progress | getLecturerCoursesProgress | LECTURER | () | `[{courseId,title,status,learnersCount,averageCompletionRate}]` |
| dashboard/lecturer/progress | getCourseLearnerProgress | LECTURER own | (courseId) | `{courseId,courseTitle,totalLessons,learnersCount,averageCompletionRate,averageQuizScore,learners[{userId,name,avatar,progressPercent,...,lessons[]}],quizQuestions[]}` or null |
| dashboard/lecturer/questions | getLecturerQuestionsData | LECTURER | ({view?:'questions'/'conversations',status?,id?}) | `{view,status,counts{unanswered,answered,aiConversations},questions[],conversations[],selectedQuestion\|null,selectedConversation\|null}` |
| dashboard/lecturer/questions | replyToPublicQuestion | LECTURER owner | ({questionId,text}) | `{success:true}` or `{success:false,error}` |
| dashboard/lecturer/questions | replyToPrivateConversation | LECTURER owner or ADMIN | ({conversationId,text}) | `{success}` / `{success:false,error}` |
| dashboard/lecturer/questions | resolveConversation | LECTURER owner or ADMIN | ({conversationId}) | `{success}` / `{success:false,error}` |
| dashboard/lecturer/questions | reopenConversation | LECTURER owner or ADMIN | ({conversationId}) | `{success}` / `{success:false,error}` |
| dashboard/lecturer/reviews | getLecturerReviewsData | LECTURER | ({filter?:'all'/'unreplied'}) | `{filter,counts{all,unreplied},reviews[{id,courseId,courseTitle,learnerId,learnerName,learnerAvatar,rating,text,lecturerReply,repliedAt,createdAt}]}` |
| dashboard/lecturer/reviews | replyToCourseReview | LECTURER owner | ({reviewId,replyText}) | `{success,error?}` |
| dashboard/lecturer/reviews | deleteCourseReviewReply | LECTURER owner | ({reviewId}) | `{success,error?}` |
| dashboard/lecturer/snippets | getFeedbackSnippets | LECTURER | () | `[{id,title,body,createdAt}]` |
| dashboard/lecturer/snippets | createFeedbackSnippet | LECTURER | ({title ≤100,body ≤2000}) | `{success:true,snippet}` or `{success:false,errors}` |
| dashboard/lecturer/snippets | updateFeedbackSnippet | LECTURER own | (id, {title,body}) | `{success:true,snippet}` or `{success:false,errors}` |
| dashboard/lecturer/snippets | deleteFeedbackSnippet | LECTURER own | (id) | `{success:true,deletedSnippet}` |
| dashboard/lecturer/snippets | restoreFeedbackSnippet | LECTURER | ({title,body}) | `{success:true,snippet}` (new id) |

Notes for Phase 2: the coding sandbox (JavaScript only, QuickJS in worker threads) works locally; AI features use the
copied Gemini/OpenAI keys; Codi itself disables knowledge-map analysis and AI grading drafts; admin-only accounts get
403 on `replyToPublicQuestion` / review replies (they need LECTURER).
