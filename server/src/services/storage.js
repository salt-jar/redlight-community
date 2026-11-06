import fs from 'node:fs';

const PLACEHOLDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800" viewBox="0 0 600 800">
  <rect width="600" height="800" fill="#FAF8F5"/>
  <rect x="16" y="16" width="568" height="768" rx="8" fill="#FFFFFF" stroke="#E8DCC8" stroke-width="2"/>
  <rect x="16" y="16" width="568" height="12" fill="#C8102E"/>
  <g transform="translate(300 330)">
    <circle r="118" fill="#FFF1F0" stroke="#C8102E" stroke-width="3"/>
    <path d="M0 -86 L25 -26 L88 -26 L37 12 L56 74 L0 38 L-56 74 L-37 12 L-88 -26 L-25 -26 Z" fill="#C8102E"/>
    <circle r="146" fill="none" stroke="#D4AF37" stroke-width="2" stroke-dasharray="6 8"/>
  </g>
  <text x="300" y="560" text-anchor="middle" font-family="SimSun,serif" font-size="40" fill="#8B0000" letter-spacing="8">赤光文献馆</text>
  <text x="300" y="606" text-anchor="middle" font-family="'Microsoft YaHei',sans-serif" font-size="20" fill="#8C8C8C" letter-spacing="3">REDLIGHT LIBRARY</text>
  <path d="M120 690 Q300 730 480 690" fill="none" stroke="#D4AF37" stroke-width="2"/>
  <text x="300" y="728" text-anchor="middle" font-family="'Microsoft YaHei',sans-serif" font-size="16" fill="#A08C6A">为了新世界 · 学习理论 · 团结同志</text>
</svg>
`;

export function ensureStorage(config) {
  fs.mkdirSync(config.uploadDir, { recursive: true });
  fs.mkdirSync(config.tempDir, { recursive: true });
  fs.mkdirSync(config.booksDir, { recursive: true });
  fs.mkdirSync(config.imagesDir, { recursive: true });
  if (!fs.existsSync(config.placeholderCoverPath)) {
    fs.writeFileSync(config.placeholderCoverPath, PLACEHOLDER_SVG, 'utf8');
  }
}
