// Builds seed-mockup.ts's input (scripts/data/mockup-seed.json and js-course-content.json) from the rebuild's
// seed: seed-source/data.js with every seed-source/patches/*.js applied, so the API serves the same users,
// courses and content the redesigned UI was built against. Same output shape as Codi's export-mockup-data.mjs
// (platform analytics series and study days are not seedable and are dropped).
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSeed } from './seed-source/load-seed.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(here, 'data');

// Timeline entries added by the rebuild's patches carry only a type; the importer requires a label.
const TIMELINE_LABEL = {
  created: 'Đã tạo đơn', paid: 'Đã nhận tiền', refunded: 'Đã hoàn tiền', failed: 'Thanh toán thất bại',
  expired: 'Mã thanh toán hết hạn', cancelled: 'Người mua đã huỷ',
};

// Fits the few rebuild-only shapes to the importer's schema (seed-mockup-mapping.ts mockupSnapshot).
function fitToImporter(data) {
  for (const order of data.orders || []) {
    for (const entry of order.timeline || []) {
      if (typeof entry.label !== 'string' || !entry.label) entry.label = TIMELINE_LABEL[entry.type] || entry.note || 'Ghi chú';
    }
  }
  for (const course of data.courses || []) {
    for (const chapter of course.chapters || []) {
      for (const lesson of chapter.lessons || []) {
        if (lesson.code && lesson.code.solutionCheck === null) delete lesson.code.solutionCheck;
      }
    }
  }
}

export function exportRebuildSeed() {
  const data = loadSeed();
  delete data.analytics;
  delete data.learnerStudyDays;
  fitToImporter(data);
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(path.join(dataDir, 'mockup-seed.json'), `${JSON.stringify(data, null, 2)}\n`);
  copyFileSync(path.join(here, 'seed-source', 'content', 'js-course-content.json'), path.join(dataDir, 'js-course-content.json'));
  return data;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const data = exportRebuildSeed();
  for (const [key, value] of Object.entries(data)) console.log(`${key}: ${Array.isArray(value) ? `${value.length} mục` : typeof value}`);
  console.log(`Đã ghi ${path.join(dataDir, 'mockup-seed.json')}`);
}
