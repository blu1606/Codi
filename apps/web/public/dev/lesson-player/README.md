Development media for issue #98. Course fixtures are explicitly labelled as development content.

- `slides.pdf`: three-page PDF authored in this repository; regenerate with `node scripts/prepare-lesson-player-fixtures.mjs` from `apps/web`.
- `flower.mp4`: MDN interactive examples CC0 flower clip, https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4 (about 5 seconds). Used to verify actual playback, end events and resume; unrelated to course subject matter.
- `missing.pdf` intentionally does not exist: exercises an actual material fetch failure and retry, with the lesson reading still available.
