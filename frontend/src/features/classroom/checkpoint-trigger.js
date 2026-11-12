/**
 * When the lesson video should stop for a classroom checkpoint.
 *
 * A checkpoint is due until the learner has answered or skipped it. Both are stored on the server debate session
 * (answering moves it to "debate", "Bỏ qua" to "skipped", the end of the debate to "closed"), so a reopened lesson
 * never stops again at a checkpoint the learner already dealt with. Opening a checkpoint without answering leaves it
 * at "question", so it is still due.
 */
export const checkpointDue = (session) => !session || session.phase === 'question';

/**
 * The checkpoint to pause at for one playback tick, or null.
 * - prev === null (first tick after the lesson opens, i.e. a resume): the earliest due checkpoint at or before `t`,
 *   because it was passed earlier without an answer.
 * - otherwise: a due checkpoint crossed between `prev` and `t` during normal playback; seeks (backwards, or a jump of
 *   more than 5 s) never trigger one.
 */
export function checkpointToPause(checkpoints, sessions, prev, t) {
  const due = (c) => checkpointDue(sessions && sessions[c.id]);
  if (prev === null) {
    return checkpoints.filter((c) => c.timestampSeconds <= t && due(c)).sort((a, b) => a.timestampSeconds - b.timestampSeconds)[0] || null;
  }
  if (t < prev || t - prev > 5) return null;
  return checkpoints.find((c) => prev < c.timestampSeconds && t >= c.timestampSeconds && due(c)) || null;
}
