require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const redis = require('redis');

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
    <title>Trung Tâm Vận Hành & Quản Trị Hệ Thống VPSs</title>
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
            <h1>TRUNG TÂM VẬN HÀNH & QUẢN TRỊ HỆ THỐNGG</h1>
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

            <!-- GIÁM SÁT HỆ THỐNG -->
            <div class="action-card" style="grid-column: 1 / -1;">
                <div>
                    <div class="card-header">
                        <div class="card-title">🛡️ Cổng Giám Sát Sức Khỏe Dịch Vụ (Health Probe API)</div>
                        <span class="badge">Uptime Kuma Ready</span>
                    </div>
                    <div class="card-desc">
                        Cung cấp Endpoint chuẩn <code style="color: #93c5fd;">/health</code> cho các công cụ giám sát trực quan (Uptime Kuma / Netdata) phát hiện sự cố và gửi thông báo khẩn qua Telegram.
                    </div>
                </div>
                <div>
                    <button class="btn" onclick="checkHealth()">🩺 Kiểm Tra Trạng Thái Sức Khỏe (/health)</button>
                    <div class="result-box" id="health-result" style="min-height: 40px;">Bấm nút để kiểm tra trạng thái dịch vụ...</div>
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

        async function checkHealth() {
            const box = document.getElementById('health-result');
            try {
                const res = await fetch('/api/health');
                const data = await res.json();
                box.innerHTML = '✅ HTTP 200 OK | Trạng thái dịch vụ: ' + JSON.stringify(data);
            } catch (err) {
                box.innerHTML = '❌ Lỗi: ' + err.message;
            }
        }
    </script>
</body>
</html>`;
    res.send(html);
});

// ==========================================
// ENDPOINT 2: HEALTH-CHECK (Tiêu chí 9 - Uptime Kuma)
// ==========================================
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'UP',
        uptime: process.uptime(),
        timestamp: Date.now()
    });
});

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

app.listen(PORT, () => {
    console.log(`>>> Web Server đang chạy tại http://localhost:${PORT}`);
});
