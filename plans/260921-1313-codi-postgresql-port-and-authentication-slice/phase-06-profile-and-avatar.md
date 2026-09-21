---
phase: 6
title: "Profile and avatar"
status: pending
priority: P1
effort: "2-3d"
dependencies: [4]
---

# Phase 6: Profile and avatar

## Overview

Profile viewing and editing, plus avatar upload through a storage seam that works on an
ephemeral container filesystem.

Covers UC-08 Update Personal Profile. Can run in parallel with Phase 5.

## Requirements

- Functional: a signed-in user can view and edit their profile and change their avatar.
- Functional: avatars survive a container restart and a redeploy.
- Non-functional: an uploaded file is validated by content, not by its filename.

## Architecture

### Storage seam

```ts
interface StorageProvider {
  getUploadUrl(key: string, contentType: string): Promise<{ url: string; fields?: Record<string,string> }>
  getPublicUrl(key: string): string
  delete(key: string): Promise<void>
}
```

Two adapters: local disk for development, Cloudflare R2 for production, chosen by
`STORAGE_PROVIDER`. R2 because its free tier is 10 GB with **free egress**, and avatars are
read far more often than written.

This seam is not speculative. Render's container filesystem is ephemeral and Vercel's is
effectively read-only, so writing avatars to disk in production loses them on the next
deploy. The local adapter exists so development needs no cloud account.

**Presigned, client-direct upload** — the browser uploads to R2 and then tells the app the
key. This keeps image bytes out of the serverless request, which matters because Vercel caps
request bodies at 4.5 MB.

That choice has a consequence worth stating: the server never sees the bytes, so it cannot
validate them. Mitigate by constraining the presigned URL to a content type and size, and by
validating client-side before requesting the URL. The local adapter *does* pass through the
app, so the two paths differ — keep the difference deliberate and documented rather than
accidental.

### Avatar handling

Per `docs/design-guidelines.md`: **no cropper.** Centre-crop to square and downscale to
512px in the browser via `canvas` before upload. A cropper is real drag, zoom, and
keyboard-accessibility cost for something rendered at 96px or smaller. This also normalises
the upload to a predictable size and strips EXIF, including GPS coordinates, as a side
effect of re-encoding.

Fallback when no avatar is set: initials on a hue derived from the user id.

### Profile fields

Editable: `full_name`, `phone`, `avatar_url`, and preferred locale.

**Email is not editable in this slice.** Changing it means re-verification, and for an
OAuth-linked account it also desynchronises the provider identity (flagged at the end of
Phase 5). Show it read-only with a note. This is a deliberate scope cut, not an oversight.

An OAuth-only user has no `credential` account row, so the change-password section must be
hidden using `hasCredentialAccount()` from Phase 5. If Phase 5 has not landed, branch on the
`account` table directly rather than blocking.

## Related Code Files

- Create: `src/lib/providers/storage/{index,types,local,r2}.ts`
- Create: `src/app/api/storage/presign/route.ts`
- Create: `src/app/[locale]/(app)/profile/page.tsx`, `.../profile/edit/page.tsx`
- Create: `src/components/profile/{profile-form,avatar-upload,user-avatar}.tsx`
- Create: `src/lib/image.ts` (client-side crop + downscale)
- Modify: `messages/{vi,en}.json`, `.env.example`

## Implementation Steps

1. Define the seam and the local adapter, writing under `/storage` (already gitignored) and
   serving through a route handler.
2. Add the R2 adapter with `@aws-sdk/client-s3` plus `@aws-sdk/s3-request-presigner`, pointed
   at the R2 endpoint. Same SDK works for S3 and GCS, which is what keeps this portable.
3. Presign route: require a session, derive the key from the user id (**never** trust a
   client-supplied key — that is a path-traversal and overwrite vector), constrain content
   type to `image/jpeg|png|webp` and size to 5 MB.
4. Client-side crop and downscale to 512×512 webp before requesting the URL.
5. Avatar component with initials fallback and the upload states the design doc lists:
   empty, hover, uploading with progress, error.
6. Profile view and edit forms, reusing the Phase 4 validation conventions.
7. Persist `avatar_url` after a confirmed upload; delete the previous object so orphans do
   not accumulate.
8. Hide the password section for OAuth-only users.
9. Tests, including a rejected oversized file and a rejected wrong content type.

## Success Criteria

- [ ] A user can view their profile with name, email, avatar, roles, and join date
- [ ] Editing name and phone persists and is reflected immediately
- [ ] Avatar upload works on the local adapter and on R2 with real credentials
- [ ] Avatar survives `docker compose restart`
- [ ] Oversized and wrong-type files are rejected with translated messages
- [ ] Replacing an avatar deletes the previous object
- [ ] An OAuth-only user sees no password section
- [ ] Email renders read-only with an explanatory note, in both locales
- [ ] No unhandled rejection when storage is unreachable — a translated error appears

## Risk Assessment

**Client-supplied keys.** If the presign route accepts a key from the client, one user can
overwrite another's avatar. Always derive it server-side from the session.

**Presigned uploads bypass server validation.** Accepted deliberately above. The residual
risk is a user uploading a valid-content-type file that is not really an image; blast radius
is limited to their own avatar rendering broken.

**CORS on R2.** The bucket needs a CORS policy allowing PUT from the app origin. This is the
usual first failure and it presents as an opaque browser error — configure it before testing.

**Orphaned objects.** A failed or abandoned upload leaves an object with no database row.
Acceptable at this scale; note it rather than building a reaper.

**Two code paths.** Local proxies through the app, R2 goes direct. A bug can therefore appear
only in production. Test against real R2 credentials at least once before the demo.
