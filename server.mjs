import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, 'data');
const IMAGES_DIR = path.join(__dirname, 'images');
const DATA_FILE = path.join(DATA_DIR, 'calendar-data.json');
const LEGACY_DATA_FILE = path.join(DATA_DIR, 'calendar-2027.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });
if (!fs.existsSync(DATA_FILE) && fs.existsSync(LEGACY_DATA_FILE)) {
  try { fs.copyFileSync(LEGACY_DATA_FILE, DATA_FILE); } catch (_) {}
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const VALID_IMG_EXTS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'];

/**
 * 掃描 images/ 資料夾中的所有圖片：
 * 1. 優先支援「每年分開儲存」命名格式：YYYY-MM.png (例如 2026-11.png, 2027-01.jpg) -> key 為 "2026-11"
 * 2. 相容舊版單純月份命名格式：01.png ~ 12.png -> 自動對應至 "2027-01" ~ "2027-12"
 */
function scanMonthImages() {
  const result = {};
  if (!fs.existsSync(IMAGES_DIR)) return result;
  const files = fs.readdirSync(IMAGES_DIR);

  // 先掃描舊版 01.png ~ 12.png 作為 2027 年預設對應
  for (let m = 1; m <= 12; m++) {
    const pad = String(m).padStart(2, '0');
    const match = files.find(f => {
      const ext = path.extname(f).toLowerCase();
      const base = path.basename(f, ext);
      return (base === pad || base === String(m)) && VALID_IMG_EXTS.includes(ext);
    });
    if (match) {
      const stat = fs.statSync(path.join(IMAGES_DIR, match));
      result[`2027-${pad}`] = `images/${encodeURIComponent(match)}?v=${stat.mtimeMs}`;
    }
  }

  // 再掃描 YYYY-MM.ext 或 YYYY-M.ext (會覆蓋同年月舊檔)
  for (const f of files) {
    const ext = path.extname(f).toLowerCase();
    if (!VALID_IMG_EXTS.includes(ext)) continue;
    const base = path.basename(f, ext);
    const mMatch = base.match(/^(\d{4})[-_](\d{1,2})$/);
    if (mMatch) {
      const yr = Number(mMatch[1]);
      const mo = Number(mMatch[2]);
      if (yr >= 1900 && yr <= 2200 && mo >= 1 && mo <= 12) {
        const key = `${yr}-${String(mo).padStart(2, '0')}`;
        const stat = fs.statSync(path.join(IMAGES_DIR, f));
        result[key] = `images/${encodeURIComponent(f)}?v=${stat.mtimeMs}`;
      }
    }
  }

  // 自動產生靜態設定檔 images/manifest.json，方便未來直接部署為純靜態 PWA 網頁時親友也能看到預設月曆圖
  try {
    fs.writeFileSync(path.join(IMAGES_DIR, 'manifest.json'), JSON.stringify(result, null, 2), 'utf-8');
  } catch (_) {}

  return result;
}

function readDataFile() {
  if (!fs.existsSync(DATA_FILE)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  } catch (e) {
    console.error('Error reading data file:', e);
    return null;
  }
}

export function startServer(preferredPort = 3207) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      // CORS headers for flexibility
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const pathname = decodeURIComponent(urlObj.pathname);

      // API: Get or save calendar data
      if (pathname === '/api/data') {
        if (req.method === 'GET') {
          const data = readDataFile();
          const folderImages = scanMonthImages();
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ data, folderImages }));
          return;
        }
        if (req.method === 'POST') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            try {
              const parsed = JSON.parse(body);
              fs.writeFileSync(DATA_FILE, JSON.stringify(parsed, null, 2), 'utf-8');
              res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
              res.end(JSON.stringify({ ok: true }));
            } catch (err) {
              res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
              res.end(JSON.stringify({ ok: false, error: err.message }));
            }
          });
          return;
        }
      }

      // API: Scan folder images
      if (pathname === '/api/images' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ folderImages: scanMonthImages() }));
        return;
      }

      // API: Upload image for a specific (year, month) and save to images/YYYY-MM.png
      if (pathname === '/api/upload-image' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          try {
            const { year = 2027, month, dataUrl } = JSON.parse(body);
            const y = Number(year) || 2027;
            const m = Number(month);
            if (!m || m < 1 || m > 12 || !dataUrl) {
              throw new Error('Invalid year, month, or image data');
            }
            const pad = String(m).padStart(2, '0');
            const ymKey = `${y}-${pad}`;
            const matches = dataUrl.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,(.+)$/);
            if (!matches) throw new Error('Invalid dataURL format');

            let ext = '.png';
            const mimeSub = matches[1].toLowerCase();
            if (mimeSub === 'jpeg' || mimeSub === 'jpg') ext = '.jpg';
            else if (mimeSub === 'webp') ext = '.webp';
            else if (mimeSub === 'gif') ext = '.gif';
            else if (mimeSub.includes('svg')) ext = '.svg';

            // Remove existing image files for this year-month so there is no ambiguity
            for (const existing of fs.readdirSync(IMAGES_DIR)) {
              const eExt = path.extname(existing).toLowerCase();
              const eBase = path.basename(existing, eExt);
              if (eBase === ymKey || eBase === `${y}_${pad}` || (y === 2027 && (eBase === pad || eBase === String(m)))) {
                try { fs.unlinkSync(path.join(IMAGES_DIR, existing)); } catch (_) {}
              }
            }

            const targetName = `${ymKey}${ext}`;
            const targetPath = path.join(IMAGES_DIR, targetName);
            const buffer = Buffer.from(matches[2], 'base64');
            fs.writeFileSync(targetPath, buffer);

            const stat = fs.statSync(targetPath);
            scanMonthImages();
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({
              ok: true,
              key: ymKey,
              imageUrl: `images/${targetName}?v=${stat.mtimeMs}`,
              savedAs: targetPath
            }));
          } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ ok: false, error: err.message }));
          }
        });
        return;
      }

      // API: Delete custom image for a specific (year, month)
      if (pathname === '/api/delete-image' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          try {
            const { year = 2027, month } = JSON.parse(body);
            const y = Number(year) || 2027;
            const m = Number(month);
            const pad = String(m).padStart(2, '0');
            const ymKey = `${y}-${pad}`;

            for (const existing of fs.readdirSync(IMAGES_DIR)) {
              const eExt = path.extname(existing).toLowerCase();
              const eBase = path.basename(existing, eExt);
              if (eBase === ymKey || eBase === `${y}_${pad}` || (y === 2027 && (eBase === pad || eBase === String(m)))) {
                try { fs.unlinkSync(path.join(IMAGES_DIR, existing)); } catch (_) {}
              }
            }

            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ ok: true, key: ymKey }));
          } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ ok: false, error: err.message }));
          }
        });
        return;
      }

      // Static file serving
      let safePath = pathname === '/' ? '/index.html' : pathname;
      const filePath = path.join(__dirname, safePath);

      // Prevent directory traversal
      if (!filePath.startsWith(__dirname)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': contentType });
        fs.createReadStream(filePath).pipe(res);
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        server.listen(0, '127.0.0.1');
      } else {
        console.error(err);
      }
    });

    server.listen(preferredPort, '127.0.0.1', () => {
      const addr = server.address();
      console.log(`==================================================`);
      console.log(`  AI 繪圖萬年桌面月曆伺服器已啟動！`);
      console.log(`  網址: http://127.0.0.1:${addr.port}`);
      console.log(`  圖片資料夾: ${IMAGES_DIR}`);
      console.log(`  資料檔案:   ${DATA_FILE}`);
      console.log(`==================================================`);
      resolve({ server, port: addr.port });
    });
  });
}

// If executed directly via `node server.mjs`
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  startServer(3207);
}
