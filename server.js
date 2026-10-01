require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const redis = require('redis');
const { exec } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// In-memory cache fallback nếu chưa bật Redis
const localCache = {};

// ==========================================
// 1. CẤU HÌNH KẾT NỐI REDIS (NoSQL & Cache)
// ==========================================
let redisClient = null;
const REDIS_URL = process.env.REDIS_URL || 'redis://:SecureRedisPassword123@127.0.0.1:6379';

(async () => {
    try {
        redisClient = redis.createClient({ url: REDIS_URL });
        redisClient.on('error', (err) => console.log('[Redis] Chờ kết nối:', err.message));
        await redisClient.connect();
        console.log('[Redis] Kết nối thành công NoSQL Redis!');
    } catch (e) {
        console.log('[Redis] Chưa phát hiện Redis chạy, sử dụng RAM In-Memory Cache thay thế.');
    }
})();

// ==========================================
// 2. CẤU HÌNH KẾT NỐI MARIADB / MYSQL
// ==========================================
const dbConfig = {
    host: process.env.DB_HOST || '127.0.0.1',
    user: process.env.DB_USER || 'vpsuser',
    password: process.env.DB_PASSWORD || 'SecurePass123!',
    database: process.env.DB_NAME || 'testindexdb',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};
let dbPool = null;
try {
    dbPool = mysql.createPool(dbConfig);
} catch (err) {
    console.log('[MySQL] Pool khởi tạo lỗi:', err.message);
}

// ==========================================
// ENDPOINT 1: TRANG CHỦ (SYSTEM OPERATIONS DASHBOARD)
// ==========================================
app.get('/', (req, res) => {
    if (req.headers['accept'] && req.headers['accept'].includes('application/json') && !req.headers['accept'].includes('text/html')) {
        return res.json({
            status: 'online',
            service: 'Cloud Operations Console',
            node_version: process.version,
            uptime_seconds: Math.floor(process.uptime()),
            memory_usage_mb: (process.memoryUsage().rss / 1024 / 1024).toFixed(2),
            timestamp: new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
        });
    }

    const html = `<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Trung Tâm Vận Hành & Quản Trị Hệ Thống VPS</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg: #090d16;
            --card-bg: rgba(19, 27, 46, 0.75);
            --border: rgba(255, 255, 255, 0.08);
            --accent: #2563eb;
            --accent-glow: rgba(37, 99, 235, 0.35);
            --green: #10b981;
            --orange: #f59e0b;
            --purple: #8b5cf6;
            --text-main: #f8fafc;
            --text-sub: #94a3b8;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: 'Inter', sans-serif;
            background-color: var(--bg);
            color: var(--text-main);
            min-height: 100vh;
            padding: 35px 20px;
            background-image: radial-gradient(at 0% 0%, rgba(37, 99, 235, 0.18) 0px, transparent 50%),
                              radial-gradient(at 100% 100%, rgba(139, 92, 246, 0.15) 0px, transparent 50%);
        }
        .container { max-width: 1100px; margin: 0 auto; }
        header { text-align: center; margin-bottom: 35px; }
        .badge-list { display: flex; justify-content: center; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
        .badge {
            background: rgba(37, 99, 235, 0.15);
            border: 1px solid rgba(59, 130, 246, 0.4);
            color: #93c5fd;
            font-size: 0.8rem;
            font-weight: 600;
            padding: 5px 14px;
            border-radius: 999px;
            display: inline-flex;
            align-items: center;
            gap: 6px;
        }
        .badge-green { background: rgba(16, 185, 129, 0.15); border-color: rgba(16, 185, 129, 0.4); color: #6ee7b7; }
        .badge-purple { background: rgba(139, 92, 246, 0.15); border-color: rgba(139, 92, 246, 0.4); color: #c4b5fd; }
        h1 { font-size: 2.3rem; font-weight: 800; letter-spacing: -0.6px; margin-bottom: 8px; }
        p.subtitle { color: var(--text-sub); font-size: 1.05rem; }
        
        .grid-stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
            gap: 15px;
            margin-bottom: 30px;
        }
        .stat-card {
            background: var(--card-bg);
            border: 1px solid var(--border);
            border-radius: 14px;
            padding: 20px;
            backdrop-filter: blur(12px);
        }
        .stat-label { color: var(--text-sub); font-size: 0.85rem; margin-bottom: 6px; font-weight: 500; }
        .stat-value { font-size: 1.5rem; font-weight: 700; color: #fff; }

        .cards-container { display: grid; grid-template-columns: repeat(auto-fit, minmax(480px, 1fr)); gap: 20px; }
        @media (max-width: 768px) { .cards-container { grid-template-columns: 1fr; } }
        
        .action-card {
            background: var(--card-bg);
            border: 1px solid var(--border);
            border-radius: 16px;
            padding: 24px;
            backdrop-filter: blur(12px);
            display: flex;
            flex-direction: column;
            justify-content: space-between;
        }
        .card-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }
        .card-title { font-size: 1.2rem; font-weight: 700; display: flex; align-items: center; gap: 10px; }
        .card-desc { color: var(--text-sub); font-size: 0.92rem; line-height: 1.55; margin-bottom: 20px; }

        .btn {
            background: var(--accent);
            color: #fff;
            border: none;
            padding: 10px 20px;
            border-radius: 8px;
            font-weight: 600;
            font-size: 0.95rem;
            cursor: pointer;
            transition: all 0.2s;
            display: inline-flex;
            align-items: center;
            gap: 8px;
        }
        .btn:hover { opacity: 0.9; transform: translateY(-1px); box-shadow: 0 4px 15px var(--accent-glow); }
        .btn-green { background: var(--green); }
        .btn-purple { background: var(--purple); }

        .result-box {
            background: rgba(0, 0, 0, 0.45);
            border: 1px solid var(--border);
            border-radius: 10px;
            padding: 15px;
            margin-top: 15px;
            font-family: 'Consolas', 'Courier New', monospace;
            font-size: 0.88rem;
            min-height: 80px;
            white-space: pre-wrap;
            color: #cbd5e1;
            overflow-x: auto;
        }
        .tag-speed {
            display: inline-block;
            padding: 3px 8px;
            border-radius: 4px;
            font-weight: 700;
            margin-bottom: 8px;
        }
        .speed-fast { background: var(--green); color: #000; }
        .speed-slow { background: var(--orange); color: #000; }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <div class="badge-list">
                <span class="badge badge-green">● PM2: Cluster Active</span>
                <span class="badge">OS: Ubuntu 22.04 LTS</span>
                <span class="badge badge-purple">Node.js Engine ${process.version}</span>
                <span class="badge">Nginx & CloudPanel Managed</span>
            </div>
            <h1>TRUNG TÂM VẬN HÀNH & QUẢN TRỊ HỆ THỐNG VPS</h1>
            <p class="subtitle">Bảng điều khiển Vận hành Website, Tối ưu hóa Bộ nhớ đệm & Giám sát Hiệu năng Thời gian thực</p>
        </header>

        <!-- THÔNG SỐ HỆ THỐNG -->
        <div class="grid-stats">
            <div class="stat-card">
                <div class="stat-label">Thời gian Hoạt động (Uptime)</div>
                <div class="stat-value" id="uptime">${Math.floor(process.uptime())} giây</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Bộ nhớ RAM Tiêu thụ</div>
                <div class="stat-value">${(process.memoryUsage().rss / 1024 / 1024).toFixed(2)} MB</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Khu vực Máy chủ (Region)</div>
                <div class="stat-value">VN-ICT (GMT+7)</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Cơ chế Tự Phục Hồi</div>
                <div class="stat-value" style="color: #6ee7b7;">Auto-Restart Sẵn Sàng</div>
            </div>
        </div>

        <div class="cards-container">
            <!-- TỐI ƯU CACHE -->
            <div class="action-card">
                <div>
                    <div class="card-header">
                        <div class="card-title">⚡ Tối Ưu Hóa Bộ Nhớ Đệm (High-Speed Cache)</div>
                        <span class="badge badge-green">In-Memory / Redis</span>
                    </div>
                    <div class="card-desc">
                        Cơ chế lưu trữ đệm dữ liệu trên RAM giúp giải phóng tài nguyên CPU máy chủ và giảm thời gian phản hồi từ hàng giây xuống dưới 5ms.
                    </div>
                </div>
                <div>
                    <button class="btn btn-green" onclick="testCache()">🚀 Kiểm Tra Độ Trễ Phản Hồi</button>
                    <div class="result-box" id="cache-result">Nhấn nút bên trên để bắt đầu đo lường hiệu năng bộ nhớ đệm...</div>
                </div>
            </div>

            <!-- TỐI ƯU DATABASE INDEX -->
            <div class="action-card">
                <div>
                    <div class="card-header">
                        <div class="card-title">📊 Phân Tích Hiệu Năng Truy Vấn (Database Indexing)</div>
                        <span class="badge badge-purple">MariaDB 11.4 Engine</span>
                    </div>
                    <div class="card-desc">
                        Đánh giá kế hoạch thực thi truy vấn (Query Execution Plan) trên cơ sở dữ liệu lớn để kiểm chứng mức độ tối ưu hóa của chỉ mục B-Tree.
                    </div>
                </div>
                <div>
                    <div style="display: flex; gap: 10px; margin-bottom: 10px; flex-wrap: wrap;">
                        <button class="btn" style="background: #475569;" onclick="seedDb()">🌱 1. Sinh 50.000 Dữ Liệu</button>
                        <button class="btn btn-purple" onclick="benchmarkIndex()">🔍 2. Đo Kế Hoạch EXPLAIN</button>
                    </div>
                    <div class="result-box" id="index-result">Sẵn sàng phân tích truy vấn dữ liệu...</div>
                </div>
            </div>

            <!-- GIÁM SÁT HỆ THỐNG & BÁO CÁO TELEGRAM -->
            <div class="action-card" style="grid-column: 1 / -1;">
                <div>
                    <div class="card-header">
                        <div class="card-title">📡 Giám Sát Sức Khỏe Toàn Bộ Website & Bắn Báo Cáo Telegram</div>
                        <span class="badge badge-green">Telegram Bot Integrated</span>
                    </div>
                    <div class="card-desc">
                        Tự động quét trực tiếp trạng thái và đo độ trễ mạng của cả 3 trang web sinh viên trên VPS (HTML, PHP E-Commerce, Next.js StudyNode) cùng Cổng quản trị Node.js, sau đó tự động biên soạn và bắn bản tin báo cáo tức thì về Telegram Bot của bạn.
                    </div>
                </div>
                <div>
                    <div style="display: flex; gap: 10px; margin-bottom: 12px; flex-wrap: wrap;">
                        <button class="btn btn-green" onclick="checkAllSitesAndNotify()">📲 Quét Sức Khỏe 3 Site & Gửi Báo Cáo Telegram</button>
                        <button class="btn" onclick="checkHealth()">🩺 Kiểm Tra Cổng Nội Bộ (/health)</button>
                    </div>
                    <div class="result-box" id="health-result" style="min-height: 70px;">Bấm nút "Quét Sức Khỏe 3 Site & Gửi Báo Cáo Telegram" để bắt đầu kiểm tra và nhận bản tin trực tiếp qua Telegram...</div>
                </div>
            </div>

            <!-- TỰ ĐỘNG HÓA CI/CD & AUTO-ROLLBACK (GITHUB WEBHOOK) -->
            <div class="action-card" style="grid-column: 1 / -1;">
                <div>
                    <div class="card-header">
                        <div class="card-title">🔄 Tự Động Hóa CI/CD & Auto-Rollback (GitHub Webhook)</div>
                        <span class="badge badge-purple">GitHub Webhooks Ready</span>
                    </div>
                    <div class="card-desc">
                        Tích hợp GitHub Webhook để VPS tự động nhận tín hiệu Push từ GitHub repository, tự động kéo code mới nhất, build kiểm thử và khởi động lại dịch vụ không gián đoạn. Đặc biệt, hệ thống tích hợp <b>cơ chế Auto-Rollback tự động khôi phục về phiên bản cũ ngay lập tức</b> nếu phát hiện lỗi build, đồng thời phát cảnh báo qua Telegram Bot.
                    </div>
                </div>
                <div>
                    <div style="background: rgba(15, 23, 42, 0.6); border: 1px solid var(--border); border-radius: 10px; padding: 14px 18px; margin-bottom: 15px; font-size: 0.9rem;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                            <span style="color: #94a3b8;">🔗 <b>URL GitHub Webhook:</b></span>
                            <span class="badge badge-green" style="font-size: 0.75rem;">POST Endpoint Active</span>
                        </div>
                        <div style="display: flex; gap: 8px; align-items: center;">
                            <code style="background: rgba(0,0,0,0.5); padding: 7px 12px; border-radius: 6px; color: #6ee7b7; flex: 1; word-break: break-all; font-size: 0.9rem;">https://quangnode.sixforce.io.vn/api/github-webhook</code>
                            <button class="btn" style="padding: 7px 14px; font-size: 0.85rem;" onclick="navigator.clipboard.writeText('https://quangnode.sixforce.io.vn/api/github-webhook'); alert('Đã sao chép Webhook URL vào Clipboard!');">📋 Copy</button>
                        </div>
                        <div style="color: #94a3b8; font-size: 0.8rem; margin-top: 8px;">
                            ⚙️ Thiết lập trên GitHub: <i>Settings ➔ Webhooks ➔ Add webhook ➔ Payload URL (dán link trên) ➔ Content type: <b>application/json</b> ➔ Event: <b>Just the push event</b></i>.
                        </div>
                    </div>

                    <div style="display: flex; gap: 10px; align-items: center; margin-bottom: 12px; flex-wrap: wrap;">
                        <label style="color: var(--text-sub); font-size: 0.9rem; font-weight: 600;">Chọn dự án:</label>
                        <select id="deploy-target" style="background: rgba(0,0,0,0.6); color: #fff; border: 1px solid var(--border); border-radius: 8px; padding: 9px 14px; font-size: 0.9rem; outline: none;">
                            <option value="node">1. node-vps-app (quangnode.sixforce.io.vn)</option>
                            <option value="studynode">2. StudyNotion-NextJS (quangstudynode.sixforce.io.vn)</option>
                            <option value="php">3. PHP E-Commerce (quangphp.sixforce.io.vn)</option>
                            <option value="html">4. HTML Landing Page (quanghtml.sixforce.io.vn)</option>
                        </select>
                        <button class="btn btn-green" onclick="triggerDeploy(false)">🚀 1. Test Kích Hoạt Deploy (Thành Công)</button>
                        <button class="btn" style="background: #ef4444;" onclick="triggerDeploy(true)">⚠️ 2. Test Cơ Chế Auto-Rollback (Giả Lập Lỗi)</button>
                    </div>

                    <div class="result-box" id="deploy-result" style="min-height: 90px;">Chọn dự án và bấm nút bên trên để kích hoạt luồng CI/CD hoặc kiểm chứng cơ chế Rollback tự động...</div>
                </div>
            </div>
        </div>
    </div>

    <script>
        async function testCache() {
            const box = document.getElementById('cache-result');
            box.innerHTML = '⏳ Đang gửi yêu cầu và đo lường thời gian phản hồi mạng...';
            const t0 = performance.now();
            try {
                const res = await fetch('/api/cache-test');
                const data = await res.json();
                const totalMs = Math.round(performance.now() - t0);
                // Nhận biết thông minh nguồn dữ liệu
                const isCached = data.source.includes('CACHE');
                
                box.innerHTML = \`<span class="tag-speed \${isCached ? 'speed-fast' : 'speed-slow'}">\${isCached ? '⚡ PHẢN HỒI SIÊU TỐC TỪ CACHE' : '🐢 TRUY VẤN NẶNG TRỰC TIẾP'}</span>\\n\` +
                                \`Nguồn dữ liệu : \${data.source}\\n\` +
                                \`Thời gian xử lý: \${data.speed} (Độ trễ toàn trình: \${totalMs} ms)\\n\` +
                                \`Trạng thái    : \${data.note}\\n\\n\` +
                                JSON.stringify(data.data, null, 2);
            } catch (err) {
                box.innerHTML = '❌ Lỗi: ' + err.message;
            }
        }

        async function seedDb() {
            const box = document.getElementById('index-result');
            box.innerHTML = '⏳ Đang khởi tạo bảng và nạp 50.000 bản ghi dữ liệu mẫu... Vui lòng đợi khoảng 5-10 giây...';
            try {
                const res = await fetch('/api/seed-db');
                const data = await res.json();
                if (data.error) throw new Error(data.error);
                box.innerHTML = '✅ THÀNH CÔNG: ' + JSON.stringify(data, null, 2);
            } catch (err) {
                box.innerHTML = '❌ Lỗi kết nối CSDL: ' + err.message;
            }
        }

        async function benchmarkIndex() {
            const box = document.getElementById('index-result');
            box.innerHTML = '⏳ Đang phân tích kế hoạch thực thi EXPLAIN SELECT...';
            try {
                const res = await fetch('/api/index-benchmark?email=user45000@example.com');
                const data = await res.json();
                if (data.error) throw new Error(data.error);
                
                const isIndexed = data.explain_analysis.key_used !== 'NONE (Full Table Scan)';
                
                box.innerHTML = \`🎯 KẾT QUẢ PHÂN TÍCH HIỆU NĂNG TRUY VẤN:\\n\` +
                                \`-----------------------------------------\\n\` +
                                \`Trạng thái Index     : \${isIndexed ? '✅ ĐÃ CÓ CHỈ MỤC INDEX' : '⚠️ CHƯA CÓ INDEX (QUÉT TOÀN BẢNG)'}\\n\` +
                                \`Thời gian thực thi   : \${data.executionTime}\\n\` +
                                \`Loại truy cập (type) : \${data.explain_analysis.type}\\n\` +
                                \`Chỉ mục được dùng    : \${data.explain_analysis.key_used}\\n\` +
                                \`Số dòng quét (rows)  : \${data.explain_analysis.rows_scanned} dòng\\n\\n\` +
                                \`Dữ liệu tìm thấy: \` + JSON.stringify(data.data);
            } catch (err) {
                box.innerHTML = '❌ Lỗi: ' + err.message + '\\n(Gợi ý: Hãy bấm nút \"1. Sinh 50.000 Dữ Liệu\" trước khi đo kế hoạch)';
            }
        }

        async function checkAllSitesAndNotify() {
            const box = document.getElementById("health-result");
            box.innerHTML = "⏳ Đang đồng thời ping kiểm tra cả 3 trang web và tổng hợp số liệu... Vui lòng đợi trong giây lát...";
            try {
                const res = await fetch("/api/check-all-sites");
                const data = await res.json();
                
                const lines = [
                    "🎯 KẾT QUẢ QUÉT SỨC KHỎE CÁC WEBSITE TRÊN VPS:",
                    "----------------------------------------------------------------------"
                ];
                data.results.forEach((s, i) => {
                    const icon = s.healthy ? "✅" : "❌";
                    lines.push((i + 1) + ". " + icon + " [" + s.name + "]: HTTP " + s.status + " (" + s.statusText + ") | Độ trễ: " + s.latencyMs + " ms");
                    lines.push("   URL: " + s.url);
                });
                lines.push("----------------------------------------------------------------------");
                lines.push("📌 Tổng kết: " + data.summary);
                if (data.telegramSent) {
                    lines.push("🚀 [TELEGRAM]: ✅ Đã bắn bản tin báo cáo thành công về Telegram của bạn! Hãy mở Telegram để kiểm tra tin nhắn.");
                } else {
                    lines.push("⚠️ [TELEGRAM]: Không gửi được tin nhắn (hãy kiểm tra TELEGRAM_BOT_TOKEN hoặc Chat ID trong .env).");
                }
                box.innerHTML = lines.join(String.fromCharCode(10));
            } catch (err) {
                box.innerHTML = "❌ Lỗi khi quét dịch vụ: " + err.message;
            }
        }

        async function checkHealth() {
            const box = document.getElementById('health-result');
            try {
                const res = await fetch('/health');
                const data = await res.json();
                box.innerHTML = '✅ HTTP 200 OK | Trạng thái dịch vụ: ' + JSON.stringify(data);
            } catch (err) {
                box.innerHTML = '❌ Lỗi: ' + err.message;
            }
        }

        async function triggerDeploy(simulateError) {
            var box = document.getElementById('deploy-result');
            var sel = document.getElementById('deploy-target');
            var target = sel.value;
            var targetName = sel.options[sel.selectedIndex].text;
            
            var promptLines = [
                '⏳ [ĐANG THỰC THI CI/CD]: Đang kích hoạt tiến trình triển khai cho ' + targetName + '...',
                (simulateError ? '⚠️ Chế độ: GIẢ LẬP LỖI BUILD ĐỂ KIỂM CHỨNG AUTO-ROLLBACK...' : '🚀 Chế độ: DEPLOY MÃ NGUỒN MỚI TỪ GITHUB...'),
                'Vui lòng đợi giây lát (khoảng 3-10 giây)...'
            ];
            box.innerHTML = promptLines.join(String.fromCharCode(10));

            try {
                var res = await fetch('/api/trigger-deploy', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ project: target, simulate_error: simulateError })
                });
                var data = await res.json();
                
                var statusBadge = data.success ? '✅ DEPLOY THÀNH CÔNG RỰC RỠ' : '🛡️ AUTO-ROLLBACK ĐÃ KÍCH HOẠT THÀNH CÔNG';
                var resLines = [
                    '📌 TRẠNG THÁI: ' + statusBadge,
                    '⏱️ Thời gian xử lý: ' + data.durationMs + ' ms | Mã thoát (Exit code): ' + data.exitCode,
                    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
                    '📜 CHI TIẾT NHẬT KÝ THỰC THI (TERMINAL LOG):',
                    (data.output || '')
                ];
                box.innerHTML = resLines.join(String.fromCharCode(10));
            } catch (err) {
                box.innerHTML = '❌ Lỗi kết nối: ' + err.message;
            }
        }
    </script>
</body>
</html>`;
    res.send(html);
});

// ==========================================
// DỊCH VỤ TELEGRAM BOT & WEBHOOK TƯƠNG TÁC
// ==========================================
const teleKeyboards = {
    // Menu nút bấm lớn cố định dưới khung chat
    reply: {
        keyboard: [
            [{ text: '🚀 Quét sức khỏe website' }, { text: '📊 Thông số VPS' }]
        ],
        resize_keyboard: true,
        is_persistent: true
    },
    // Nút bấm trực tiếp ngay dưới tin nhắn kết quả
    inline: {
        inline_keyboard: [
            [
                { text: '🔄 Quét lại ngay', callback_data: 'check_now' },
                { text: '🌐 Mở Dashboard', url: 'https://quangnode.sixforce.io.vn' }
            ]
        ]
    }
};

async function sendTelegramAlert(text, replyMarkup = null, targetChatId = null) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = targetChatId || process.env.TELEGRAM_CHAT_ID;
    if (!token || !chatId) {
        console.log('[Telegram] Chưa cấu hình TELEGRAM_BOT_TOKEN hoặc TELEGRAM_CHAT_ID trong .env');
        return false;
    }
    try {
        const payload = {
            chat_id: chatId,
            text: text,
            parse_mode: 'HTML',
            disable_web_page_preview: true
        };
        if (replyMarkup) {
            payload.reply_markup = replyMarkup;
        }
        const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await response.json();
        return !!data.ok;
    } catch (err) {
        console.error('[Telegram] Gửi tin nhắn thất bại:', err.message);
        return false;
    }
}

// Hàm dùng chung quét đồng thời 3 website + Ops Console
async function performHealthCheck() {
    const SITES_LIST = [
        { id: 'html', name: 'Quang HTML', url: 'https://quanghtml.sixforce.io.vn', type: 'Static HTML (Nginx)' },
        { id: 'php', name: 'Quang PHP (E-Commerce)', url: 'https://quangphp.sixforce.io.vn', type: 'PHP 8.2 / MariaDB' },
        { id: 'studynode', name: 'Quang StudyNode', url: 'https://quangstudynode.sixforce.io.vn', type: 'Next.js App / Port 3001' },
        { id: 'node', name: 'Quang Node (Ops Console)', url: 'http://127.0.0.1:3000/health', displayUrl: 'https://quangnode.sixforce.io.vn', type: 'Express / Port 3000' }
    ];

    const results = await Promise.all(SITES_LIST.map(async (site) => {
        const start = performance.now();
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 6000);
            const resp = await fetch(site.url, { signal: controller.signal });
            clearTimeout(timer);
            const latency = Math.round(performance.now() - start);
            const ok = resp.status >= 200 && resp.status < 400;
            return {
                name: site.name,
                url: site.displayUrl || site.url,
                type: site.type,
                status: resp.status,
                statusText: resp.statusText || (ok ? 'OK' : 'Error'),
                latencyMs: latency,
                healthy: ok
            };
        } catch (e) {
            const latency = Math.round(performance.now() - start);
            return {
                name: site.name,
                url: site.displayUrl || site.url,
                type: site.type,
                status: 0,
                statusText: e.name === 'AbortError' ? 'Timeout (>6s)' : (e.message || 'Error'),
                latencyMs: latency,
                healthy: false
            };
        }
    }));

    const nowStr = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
    const healthyCount = results.filter(r => r.healthy).length;
    const totalCount = results.length;
    const allHealthy = healthyCount === totalCount;

    let teleMsg = `📊 <b>BÁO CÁO SỨC KHỎE CÁC WEBSITE TRÊN VPS</b>\n`;
    teleMsg += `⏰ Thời gian: <code>${nowStr}</code>\n`;
    teleMsg += `🖥️ Máy chủ: <b>Ubuntu 22.04 LTS (PM2 Cluster)</b>\n`;
    teleMsg += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

    results.forEach((r, idx) => {
        const icon = r.healthy ? '🟢' : '🔴';
        teleMsg += `${idx + 1}. ${icon} <b>${r.name}</b> (${r.type})\n`;
        teleMsg += `   • URL: ${r.url}\n`;
        teleMsg += `   • Trạng thái: <b>${r.status > 0 ? `HTTP ${r.status}` : 'MẤT KẾT NỐI'}</b> (${r.statusText})\n`;
        teleMsg += `   • Độ trễ: <b>${r.latencyMs} ms</b>\n\n`;
    });

    teleMsg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    teleMsg += `📌 <b>Tổng kết:</b> ${healthyCount}/${totalCount} dịch vụ hoạt động tốt (${allHealthy ? '100% HEALTHY ✅' : 'CÓ SỰ CỐ ⚠️'})\n`;
    teleMsg += `⚡ <i>Yêu cầu được kích hoạt từ Telegram Bot / Ops Dashboard</i>`;

    return { results, nowStr, healthyCount, totalCount, allHealthy, teleMsg };
}

// 1. API cho Frontend Dashboard Web gọi
app.get('/api/check-all-sites', async (req, res) => {
    const data = await performHealthCheck();
    const sent = await sendTelegramAlert(data.teleMsg, teleKeyboards.inline);
    res.json({
        success: true,
        telegramSent: sent,
        timestamp: data.nowStr,
        summary: `${data.healthyCount}/${data.totalCount} dịch vụ hoạt động bình thường (${data.allHealthy ? '100% Hoàn Hảo' : 'Có lỗi'})`,
        results: data.results
    });
});

// 2. Webhook đón nhận lệnh /check, nút bấm từ người dùng trên Telegram
app.post('/api/telegram-webhook', async (req, res) => {
    res.sendStatus(200); // Phản hồi ngay HTTP 200 cho Telegram
    const update = req.body;
    if (!update) return;

    const token = process.env.TELEGRAM_BOT_TOKEN;

    // Xử lý khi bấm nút inline "🔄 Quét lại ngay"
    if (update.callback_query) {
        const cb = update.callback_query;
        const chatId = cb.message?.chat?.id;
        if (token && cb.id) {
            fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ callback_query_id: cb.id, text: '⏳ Đang quét lại toàn bộ website...' })
            }).catch(() => { });
        }
        if (cb.data === 'check_now' && chatId) {
            const checkData = await performHealthCheck();
            await sendTelegramAlert(checkData.teleMsg, teleKeyboards.inline, chatId);
        }
        return;
    }

    // Xử lý tin nhắn văn bản / lệnh /check
    if (update.message && update.message.text) {
        const msg = update.message;
        const chatId = msg.chat.id;
        const rawText = msg.text.trim().toLowerCase();

        if (rawText === '/start' || rawText === '/help') {
            const welcome = `👋 <b>Xin chào ${msg.from?.first_name || 'bạn'}!</b>\n\n` +
                `Tôi là <b>Quang Monitor Bot</b> được kết nối trực tiếp với VPS Linux.\n\n` +
                `💡 <b>Bạn có thể điều khiển trực tiếp bằng:</b>\n` +
                `• Lệnh <code>/check</code> : Quét độ trễ và tình trạng của 3 website sinh viên.\n` +
                `• Lệnh <code>/vps</code> : Xem thông số RAM, Uptime máy chủ.\n` +
                `• Hoặc bấm ngay vào các <b>nút bấm lớn bên dưới màn hình</b>! 👇`;
            await sendTelegramAlert(welcome, teleKeyboards.reply, chatId);
            return;
        }

        if (rawText === '/vps' || rawText.includes('thông số vps')) {
            const memMb = (process.memoryUsage().rss / 1024 / 1024).toFixed(2);
            const uptimeSec = Math.floor(process.uptime());
            const uptimeHours = (uptimeSec / 3600).toFixed(1);
            const vpsMsg = `🖥️ <b>THÔNG SỐ MÁY CHỦ VPS HIỆN TẠI:</b>\n` +
                `━━━━━━━━━━━━━━━━━━━━━\n` +
                `• ⏱️ Uptime Node: <b>${uptimeSec} giây</b> (~${uptimeHours} giờ)\n` +
                `• 🧠 RAM Node.js: <b>${memMb} MB</b>\n` +
                `• ⚙️ Engine: <b>Node.js ${process.version}</b>\n` +
                `• 🚀 Quản lý tiến trình: <b>PM2 Cluster Active</b>\n` +
                `• 🌐 Web Server: <b>Nginx Reverse Proxy</b>\n` +
                `━━━━━━━━━━━━━━━━━━━━━\n` +
                `⚡ <i>Hệ thống đang vận hành ổn định.</i>`;
            await sendTelegramAlert(vpsMsg, teleKeyboards.inline, chatId);
            return;
        }

        if (rawText === '/check' || rawText === '/status' || rawText.includes('quét') || rawText.includes('check')) {
            await sendTelegramAlert('⏳ <i>Đang quét và đo độ trễ các website... Vui lòng đợi 1-2 giây...</i>', null, chatId);
            const checkData = await performHealthCheck();
            await sendTelegramAlert(checkData.teleMsg, teleKeyboards.inline, chatId);
            return;
        }
    }
});

// ==========================================
// ENDPOINT 2: HEALTH-CHECK (Tiêu chí 9 - Uptime Kuma)
// ==========================================
const healthHandler = (req, res) => {
    res.status(200).json({
        status: 'UP',
        uptime: `${Math.floor(process.uptime())}s`,
        service: 'Node.js VPS App',
        timestamp: new Date().toISOString()
    });
};
app.get('/health', healthHandler);
app.get('/api/health', healthHandler);

// ==========================================
// ENDPOINT 3: DEMO TỐI ƯU CACHE (Tiêu chí 3 & 4)
// ==========================================
app.get('/api/cache-test', async (req, res) => {
    const cacheKey = 'heavy_query_report';
    const startTime = Date.now();

    try {
        let cached = null;
        if (redisClient && redisClient.isOpen) {
            cached = await redisClient.get(cacheKey);
        } else {
            cached = localCache[cacheKey];
        }

        if (cached) {
            const executionTime = `${Date.now() - startTime} ms`;
            return res.json({
                source: redisClient && redisClient.isOpen ? 'REDIS NoSQL CACHE (TỐI ƯU)' : 'IN-MEMORY RAM CACHE',
                speed: executionTime,
                note: 'Dữ liệu được nạp tức thì từ RAM, không cần tính toán lại!',
                data: typeof cached === 'string' ? JSON.parse(cached) : cached
            });
        }

        await new Promise((resolve) => setTimeout(resolve, 1500));
        const payload = {
            reportName: "Báo cáo doanh thu quý",
            totalRecords: 150000,
            generatedAt: new Date().toISOString()
        };

        if (redisClient && redisClient.isOpen) {
            await redisClient.setEx(cacheKey, 60, JSON.stringify(payload));
        } else {
            localCache[cacheKey] = payload;
        }

        const executionTime = `${Date.now() - startTime} ms`;
        return res.json({
            source: 'DATABASE TRỰC TIẾP (CHẬM, CHƯA QUA CACHE)',
            speed: executionTime,
            note: 'Hãy nhấn F5 hoặc bấm nút lại để thấy tốc độ tăng vọt nhờ Cache!',
            data: payload
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// ENDPOINT 4: TỰ ĐỘNG KHỞI TẠO BẢNG 50.000 DÒNG (Tiêu chí 5)
// ==========================================
app.get('/api/seed-db', async (req, res) => {
    if (!dbPool) return res.status(500).json({ error: 'Chưa cấu hình DB' });
    try {
        const connection = await dbPool.getConnection();
        await connection.query(`CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            email VARCHAR(100),
            fullname VARCHAR(100),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );`);

        const [rows] = await connection.query(`SELECT COUNT(*) as count FROM users;`);
        if (rows[0].count < 50000) {
            console.log('Đang sinh 50.000 records mẫu...');
            for (let i = rows[0].count + 1; i <= 50000; i += 5000) {
                const batch = [];
                for (let j = i; j < i + 5000 && j <= 50000; j++) {
                    batch.push([`user${j}@example.com`, `Nguyen Van ${j}`]);
                }
                await connection.query(`INSERT INTO users (email, fullname) VALUES ?`, [batch]);
            }
        }
        connection.release();
        res.json({ message: 'Khởi tạo 50.000 dòng dữ liệu thành công!', total: 50000 });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// ENDPOINT 5: BENCHMARK INDEX TRƯỚC VÀ SAU (Tiêu chí 5)
// ==========================================
app.get('/api/index-benchmark', async (req, res) => {
    if (!dbPool) return res.status(500).json({ error: 'Chưa cấu hình DB' });
    const targetEmail = req.query.email || 'user45000@example.com';

    try {
        const connection = await dbPool.getConnection();

        const [explain] = await connection.query(`EXPLAIN SELECT * FROM users WHERE email = ?`, [targetEmail]);

        const start = process.hrtime();
        const [result] = await connection.query(`SELECT * FROM users WHERE email = ?`, [targetEmail]);
        const diff = process.hrtime(start);
        const timeMs = (diff[0] * 1000 + diff[1] / 1000000).toFixed(3);

        connection.release();

        res.json({
            targetEmail,
            executionTime: `${timeMs} ms`,
            explain_analysis: {
                type: explain[0].type,
                possible_keys: explain[0].possible_keys,
                key_used: explain[0].key || 'NONE (Full Table Scan)',
                rows_scanned: explain[0].rows
            },
            data: result[0] || null
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// ENDPOINT 6: GITHUB WEBHOOK LISTENER (Tiêu chí 8)
// ==========================================
const handleGithubWebhook = async (req, res) => {
    const event = req.headers['x-github-event'] || 'push';
    console.log(`[GitHub Webhook] Nhận sự kiện: ${event}`);

    if (event === 'ping') {
        return res.status(200).json({ status: 'ok', message: 'GitHub Ping Webhook received successfully!' });
    }

    const payload = req.body || {};
    const repoName = payload.repository?.name || '';
    const ref = payload.ref || '';
    const commitId = payload.after || payload.head_commit?.id || 'manual';

    console.log(`[GitHub Webhook] Repo: ${repoName} | Ref: ${ref} | Commit: ${commitId}`);

    let target = 'node';
    const lower = repoName.toLowerCase();
    if (lower.includes('study')) target = 'studynode';
    else if (lower.includes('php') || lower.includes('ecommerce')) target = 'php';
    else if (lower.includes('html') || lower.includes('landing')) target = 'html';
    else if (lower.includes('node')) target = 'node';

    res.status(200).json({
        success: true,
        message: 'GitHub Webhook received. Deployment started in background.',
        event,
        repository: repoName,
        target,
        commit: commitId
    });

    const cmd = `/bin/bash /root/scripts/deploy_site.sh ${target}`;
    exec(cmd, (error, stdout, stderr) => {
        if (error) {
            console.error(`[CI/CD Error] Rollback or fail on ${target}:`, error.message);
        } else {
            console.log(`[CI/CD Success] Deployed ${target} successfully:\n${stdout}`);
        }
    });
};
app.post('/api/github-webhook', handleGithubWebhook);
app.post('/github-webhook', handleGithubWebhook);

// ==========================================
// ENDPOINT 7: THỰC THI CI/CD HOẶC TEST ROLLBACK TỪ GIAO DIỆN / API
// ==========================================
app.post('/api/trigger-deploy', async (req, res) => {
    const target = req.body?.project || 'node';
    const simulateError = req.body?.simulate_error ? '--simulate-error' : '';

    const startTime = Date.now();
    const cmd = `/bin/bash /root/scripts/deploy_site.sh ${target} ${simulateError}`;

    exec(cmd, { timeout: 180000 }, (error, stdout, stderr) => {
        const durationMs = Date.now() - startTime;
        const output = (stdout || '') + (stderr ? '\n[STDERR]: ' + stderr : '');
        res.json({
            success: !error,
            exitCode: error ? (error.code || 1) : 0,
            project: target,
            durationMs,
            output
        });
    });
});

app.listen(PORT, () => {
    console.log(`>>> Web Server đang chạy tại http://localhost:${PORT}`);
});
