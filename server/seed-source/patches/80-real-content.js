// Real lesson content from the Codi app (apps/web/scripts/data/js-course-content.json): F8 YouTube videos and
// javascript.info (Vietnamese, CC BY-NC) readings for the JavaScript course. Replaces the simulated materials.
patchSeed((db) => {
  const content = readSeedJson('js-course-content.json');
  const course = db.courses.find((c) => c.id === 'course-js-001');
  if (!course) return;
  course.contentAttribution = content.attribution;
  course.chapters.forEach((ch) => ch.lessons.forEach((l) => {
    const real = content.lessons[l.id];
    if (!real || l.type === 'code' || l.type === 'tutorial') return; // coding lessons keep their own workspace
    const videos = (real.videos || []).map((v, i) => ({
      id: `${l.id}-yt-${i + 1}`, type: 'video', title: v.title,
      url: `https://www.youtube.com/watch?v=${v.youtubeId}`, durationSeconds: v.durationSeconds,
    }));
    const pdf = (l.materials || []).filter((m) => m.type === 'pdf');
    l.materials = [...videos, ...pdf];
    const sources = (real.sources || []).map((s) => `- [${s.title}](${s.url}) (${s.license})`).join('\n');
    l.body = real.body + (sources ? `\n\n---\n\n**Nguồn tham khảo**\n\n${sources}` : '');
    l.sources = real.sources || [];
  }));
});
