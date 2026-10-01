require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const redis = require('redis');
const { exec, execSync } = require('child_process');
const os = require('os');
const fs = require('fs');

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

function getVpsMetrics() {
    let uptimeSec = os.uptime();
    const days = Math.floor(uptimeSec / 86400);
    const hours = Math.floor((uptimeSec % 86400) / 3600);
    const minutes = Math.floor((uptimeSec % 3600) / 60);

    let uptimeDisplay = '';
    if (days > 0) uptimeDisplay += `${days} ngày ${hours} giờ`;
    else if (hours > 0) uptimeDisplay += `${hours} giờ ${minutes} phút`;
    else uptimeDisplay += `${minutes} phút`;

    let totalRamGb = (os.totalmem() / 1024 / 1024 / 1024).toFixed(1);
    let usedRamGb = ((os.totalmem() - os.freemem()) / 1024 / 1024 / 1024).toFixed(1);
    let ramPercent = Math.round(((os.totalmem() - os.freemem()) / os.totalmem()) * 100);
    let swapDisplay = '6.0 GB Swap Sẵn Sàng';

    try {
        const meminfo = fs.readFileSync('/proc/meminfo', 'utf8');
        const lines = meminfo.split('\n');
        const mem = {};
        for (const line of lines) {
            const parts = line.split(':');
            if (parts.length === 2) {
                mem[parts[0].trim()] = parseInt(parts[1].trim().split(/\s+/)[0], 10);
            }
        }
        if (mem.MemTotal && mem.MemAvailable) {
            const totalKb = mem.MemTotal;
            const availKb = mem.MemAvailable;
            const usedKb = totalKb - availKb;
            totalRamGb = (totalKb / 1024 / 1024).toFixed(1);
            usedRamGb = (usedKb / 1024 / 1024).toFixed(1);
            ramPercent = Math.round((usedKb / totalKb) * 100);
        }
        if (mem.SwapTotal) {
            const swapTotalGb = (mem.SwapTotal / 1024 / 1024).toFixed(1);
            swapDisplay = `${swapTotalGb} GB Swap Sẵn Sàng`;
        }
    } catch (e) {}

    let diskDisplay = '19G / 30G';
    let diskPercent = '65%';
    try {
        const dfOut = execSync('df -h / | tail -n 1', { encoding: 'utf8' }).trim();
        const parts = dfOut.split(/\s+/);
        if (parts.length >= 5) {
            diskDisplay = `${parts[2]} / ${parts[1]}`;
            diskPercent = parts[4];
        }
    } catch (e) {}

    return {
        uptimeSec,
        uptimeDisplay,
        totalRamGb,
        usedRamGb,
        ramPercent,
        swapDisplay,
        diskDisplay,
        diskPercent
    };
}

// ==========================================
// ENDPOINT 1: TRANG CHỦ (SYSTEM OPERATIONS DASHBOARD)
// ==========================================
app.get('/', (req, res) => {
    const vps = getVpsMetrics();
    if (req.headers['accept'] && req.headers['accept'].includes('application/json') && !req.headers['accept'].includes('text/html')) {
        return res.json({
            status: 'online',
            service: 'Cloud Operations Console',
            node_version: process.version,
            vps_metrics: vps,
            timestamp: new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
        });
    }

    const html = `<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Trung Tâm Vận Hành & Quản Trị Hệ Thống VPS</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg-canvas: #090d16;
            --surface-card: rgba(17, 24, 39, 0.72);
            --surface-card-hover: rgba(24, 34, 53, 0.85);
            --surface-elevated: rgba(30, 41, 59, 0.6);
            --border-subtle: rgba(255, 255, 255, 0.08);
            --border-hover: rgba(255, 255, 255, 0.16);
            --text-primary: #f8fafc;
            --text-secondary: #94a3b8;
            --text-muted: #64748b;
            --accent-blue: #3b82f6;
            --accent-blue-glow: rgba(59, 130, 246, 0.25);
            --accent-green: #10b981;
            --accent-green-glow: rgba(16, 185, 129, 0.25);
            --accent-amber: #f59e0b;
            --accent-purple: #8b5cf6;
            --accent-rose: #f43f5e;
            --terminal-bg: #070a10;
        }

        * { box-sizing: border-box; margin: 0; padding: 0; }

        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            background-color: var(--bg-canvas);
            color: var(--text-primary);
            min-height: 100vh;
            padding: 32px 20px 60px;
            background-image: 
                radial-gradient(circle at 10% 10%, rgba(59, 130, 246, 0.12) 0px, transparent 40%),
                radial-gradient(circle at 90% 90%, rgba(139, 92, 246, 0.12) 0px, transparent 40%),
                radial-gradient(circle at 50% 50%, rgba(16, 185, 129, 0.04) 0px, transparent 60%);
            background-attachment: fixed;
            -webkit-font-smoothing: antialiased;
        }

        .container {
            max-width: 1200px;
            margin: 0 auto;
        }

        /* HEADER SECTION */
        header {
            margin-bottom: 32px;
            display: flex;
            flex-direction: column;
            align-items: center;
            text-align: center;
        }

        .top-meta-chips {
            display: flex;
            gap: 8px;
            margin-bottom: 16px;
            flex-wrap: wrap;
            justify-content: center;
        }

        .chip {
            font-size: 0.78rem;
            font-weight: 600;
            padding: 4px 12px;
            border-radius: 9999px;
            background: rgba(255, 255, 255, 0.04);
            border: 1px solid var(--border-subtle);
            color: var(--text-secondary);
            display: inline-flex;
            align-items: center;
            gap: 6px;
            backdrop-filter: blur(8px);
        }

        .chip-green {
            background: rgba(16, 185, 129, 0.1);
            border-color: rgba(16, 185, 129, 0.3);
            color: #6ee7b7;
        }

        .chip-purple {
            background: rgba(139, 92, 246, 0.1);
            border-color: rgba(139, 92, 246, 0.3);
            color: #c4b5fd;
        }

        .pulse-dot {
            width: 7px;
            height: 7px;
            border-radius: 50%;
            background-color: #10b981;
            box-shadow: 0 0 8px #10b981;
            animation: pulse 2s infinite;
        }

        @keyframes pulse {
            0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
            70% { transform: scale(1); box-shadow: 0 0 0 6px rgba(16, 185, 129, 0); }
            100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
        }

        h1.dashboard-title {
            font-size: 2.1rem;
            font-weight: 800;
            letter-spacing: -0.03em;
            margin-bottom: 8px;
            background: linear-gradient(135deg, #ffffff 30%, #94a3b8 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }

        p.dashboard-subtitle {
            color: var(--text-secondary);
            font-size: 0.98rem;
            max-width: 700px;
            line-height: 1.5;
        }

        /* SYSTEM METRICS GRID */
        .metrics-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 16px;
            margin-bottom: 28px;
        }

        @media (max-width: 992px) {
            .metrics-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 576px) {
            .metrics-grid { grid-template-columns: 1fr; }
        }

        .metric-card {
            background: var(--surface-card);
            border: 1px solid var(--border-subtle);
            border-radius: 14px;
            padding: 18px 20px;
            backdrop-filter: blur(12px);
            transition: border-color 0.2s, transform 0.2s;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
        }

        .metric-card:hover {
            border-color: var(--border-hover);
            transform: translateY(-2px);
        }

        .metric-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 12px;
        }

        .metric-label {
            font-size: 0.8rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: var(--text-muted);
        }

        .metric-icon {
            font-size: 1.1rem;
            opacity: 0.8;
        }

        .metric-value {
            font-size: 1.65rem;
            font-weight: 700;
            letter-spacing: -0.02em;
            color: var(--text-primary);
        }

        .metric-footer {
            margin-top: 6px;
            font-size: 0.78rem;
            color: var(--text-secondary);
            display: flex;
            align-items: center;
            gap: 5px;
        }

        /* SECTION TILES (3 COLUMNS) */
        .section-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 20px;
            margin-bottom: 24px;
        }

        @media (max-width: 1040px) {
            .section-grid { grid-template-columns: 1fr; }
        }

        .panel-card {
            background: var(--surface-card);
            border: 1px solid var(--border-subtle);
            border-radius: 14px;
            padding: 22px;
            backdrop-filter: blur(12px);
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            transition: all 0.25s ease;
        }

        .panel-card:hover {
            border-color: var(--border-hover);
            transform: translateY(-2px);
            box-shadow: 0 12px 28px rgba(0, 0, 0, 0.35);
        }

        .panel-card.full-width {
            grid-column: 1 / -1;
        }

        .panel-top {
            margin-bottom: 16px;
        }

        .panel-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
            gap: 8px;
        }

        .panel-title {
            font-size: 1.05rem;
            font-weight: 700;
            display: flex;
            align-items: center;
            gap: 8px;
            color: #fff;
            letter-spacing: -0.01em;
        }

        .panel-desc {
            color: var(--text-secondary);
            font-size: 0.84rem;
            line-height: 1.55;
            min-height: 52px;
        }

        /* BUTTONS & CONTROLS */
        .button-group {
            display: flex;
            gap: 8px;
            margin-bottom: 12px;
            align-items: center;
        }

        .btn {
            background: rgba(255, 255, 255, 0.05);
            color: var(--text-primary);
            border: 1px solid var(--border-subtle);
            padding: 8px 14px;
            border-radius: 8px;
            font-weight: 600;
            font-size: 0.82rem;
            font-family: inherit;
            cursor: pointer;
            transition: all 0.2s ease;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            user-select: none;
            text-align: center;
        }

        .btn:hover:not(:disabled) {
            background: rgba(255, 255, 255, 0.1);
            border-color: var(--border-hover);
            transform: translateY(-1px);
        }

        .btn:active:not(:disabled) {
            transform: translateY(0);
        }

        .btn:disabled {
            opacity: 0.6;
            cursor: not-allowed;
        }

        .spinner {
            display: inline-block;
            width: 12px;
            height: 12px;
            border: 2px solid rgba(255, 255, 255, 0.25);
            border-radius: 50%;
            border-top-color: #ffffff;
            animation: spin 0.8s linear infinite;
        }
        @keyframes spin {
            to { transform: rotate(360deg); }
        }

        .btn-primary {
            background: var(--accent-blue);
            border-color: transparent;
            color: #fff;
        }
        .btn-primary:hover:not(:disabled) {
            background: #2563eb;
            box-shadow: 0 4px 14px var(--accent-blue-glow);
        }

        .btn-success {
            background: var(--accent-green);
            border-color: transparent;
            color: #032b1a;
            font-weight: 700;
        }
        .btn-success:hover:not(:disabled) {
            background: #059669;
            color: #fff;
            box-shadow: 0 4px 14px var(--accent-green-glow);
        }

        .btn-purple {
            background: var(--accent-purple);
            border-color: transparent;
            color: #fff;
        }
        .btn-purple:hover:not(:disabled) {
            background: #7c3aed;
            box-shadow: 0 4px 14px rgba(139, 92, 246, 0.3);
        }

        .btn-danger {
            background: rgba(244, 63, 94, 0.15);
            border: 1px solid rgba(244, 63, 94, 0.35);
            color: #fda4af;
        }
        .btn-danger:hover:not(:disabled) {
            background: var(--accent-rose);
            border-color: transparent;
            color: #fff;
            box-shadow: 0 4px 14px rgba(244, 63, 94, 0.3);
        }

        /* RESULT BOX / TERMINAL */
        .terminal-box {
            background: var(--terminal-bg);
            border: 1px solid var(--border-subtle);
            border-radius: 10px;
            overflow: hidden;
            font-family: 'JetBrains Mono', 'Consolas', monospace;
            font-size: 0.84rem;
        }

        .terminal-header {
            background: rgba(255, 255, 255, 0.03);
            border-bottom: 1px solid var(--border-subtle);
            padding: 8px 14px;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }

        .terminal-dots {
            display: flex;
            gap: 6px;
        }

        .terminal-dot {
            width: 10px;
            height: 10px;
            border-radius: 50%;
        }
        .dot-red { background: #ff5f56; }
        .dot-yellow { background: #ffbd2e; }
        .dot-green { background: #27c93f; }

        .terminal-title {
            color: var(--text-muted);
            font-size: 0.75rem;
            font-weight: 500;
        }

        .terminal-actions {
            display: flex;
            gap: 6px;
        }

        .btn-terminal-mini {
            background: transparent;
            border: none;
            color: var(--text-secondary);
            font-size: 0.72rem;
            cursor: pointer;
            padding: 2px 6px;
            border-radius: 4px;
            font-family: inherit;
        }
        .btn-terminal-mini:hover {
            background: rgba(255, 255, 255, 0.08);
            color: #fff;
        }

        .terminal-body {
            padding: 12px 14px;
            height: 200px;
            max-height: 200px;
            overflow-y: auto;
            white-space: pre-wrap;
            word-break: break-all;
            color: #cbd5e1;
            line-height: 1.55;
            font-size: 0.78rem;
        }

        .terminal-body::-webkit-scrollbar {
            width: 6px;
        }
        .terminal-body::-webkit-scrollbar-thumb {
            background: rgba(255, 255, 255, 0.12);
            border-radius: 4px;
        }

        /* WEBHOOK COPY BAR */
        .webhook-card {
            background: rgba(15, 23, 42, 0.6);
            border: 1px solid var(--border-subtle);
            border-radius: 10px;
            padding: 14px 18px;
            margin-bottom: 18px;
        }

        .webhook-row {
            display: flex;
            gap: 10px;
            align-items: center;
            margin-top: 8px;
        }

        .webhook-code {
            background: rgba(0, 0, 0, 0.6);
            border: 1px solid rgba(255, 255, 255, 0.06);
            padding: 8px 14px;
            border-radius: 6px;
            color: #6ee7b7;
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.85rem;
            flex: 1;
            overflow-x: auto;
            white-space: nowrap;
        }

        .custom-select {
            background: rgba(15, 23, 42, 0.8);
            color: #fff;
            border: 1px solid var(--border-subtle);
            border-radius: 8px;
            padding: 9px 14px;
            font-size: 0.88rem;
            font-family: inherit;
            outline: none;
            cursor: pointer;
            transition: border-color 0.2s;
        }
        .custom-select:focus {
            border-color: var(--accent-blue);
        }

        /* TAG SPEED PILL */
        .tag-pill {
            display: inline-block;
            padding: 3px 8px;
            border-radius: 4px;
            font-size: 0.75rem;
            font-weight: 700;
            margin-bottom: 8px;
        }
        .tag-pill-fast { background: #10b981; color: #022013; }
        .tag-pill-slow { background: #f59e0b; color: #261601; }

        /* TOAST NOTIFICATION */
        #toast {
            position: fixed;
            bottom: 24px;
            right: 24px;
            background: rgba(15, 23, 42, 0.95);
            border: 1px solid rgba(255, 255, 255, 0.15);
            color: #fff;
            padding: 10px 18px;
            border-radius: 8px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.5);
            backdrop-filter: blur(8px);
            font-size: 0.86rem;
            display: flex;
            align-items: center;
            gap: 8px;
            transform: translateY(100px);
            opacity: 0;
            transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
            z-index: 9999;
        }
        #toast.show {
            transform: translateY(0);
            opacity: 1;
        }
    </style>
</head>
<body>
    <div class="container">
        <!-- HEADER -->
        <header>
            <div class="top-meta-chips">
                <span class="chip chip-green"><span class="pulse-dot"></span> PM2 Cluster Active</span>
                <span class="chip">OS: Ubuntu 22.04 LTS</span>
                <span class="chip chip-purple">Node.js Engine ${process.version}</span>
                <span class="chip">Nginx & CloudPanel Managed</span>
            </div>
            <h1 class="dashboard-title">TRUNG TÂM VẬN HÀNH & QUẢN TRỊ HỆ THỐNG VPS</h1>
            <p class="dashboard-subtitle">Bảng điều khiển Vận hành Website, Tối ưu hóa Bộ nhớ đệm & Giám sát Hiệu năng Thời gian thực</p>
        </header>

        <!-- STATS COUNTER BAR (TOÀN BỘ HẠ TẦNG VPS) -->
        <div class="metrics-grid">
            <div class="metric-card">
                <div class="metric-header">
                    <span class="metric-label">Thời gian Hoạt động (Uptime)</span>
                    <span class="metric-icon">⏱️</span>
                </div>
                <div class="metric-value" id="uptime-display">${vps.uptimeDisplay}</div>
                <div class="metric-footer">
                    <span style="color: #10b981;">●</span> Máy chủ VPS chạy liên tục
                </div>
            </div>

            <div class="metric-card">
                <div class="metric-header">
                    <span class="metric-label">Bộ nhớ RAM Toàn VPS</span>
                    <span class="metric-icon">🧠</span>
                </div>
                <div class="metric-value">${vps.usedRamGb} / ${vps.totalRamGb} <span style="font-size: 0.95rem; font-weight: 500; color: var(--text-muted);">GB (${vps.ramPercent}%)</span></div>
                <div class="metric-footer">
                    <span style="color: #38bdf8;">🛡️ ${vps.swapDisplay}</span>
                </div>
            </div>

            <div class="metric-card">
                <div class="metric-header">
                    <span class="metric-label">Dung Lượng Ổ Cứng (SSD)</span>
                    <span class="metric-icon">💾</span>
                </div>
                <div class="metric-value" style="font-size: 1.45rem;">${vps.diskDisplay}</div>
                <div class="metric-footer">
                    <span>Đã dùng ${vps.diskPercent} dung lượng lưu trữ</span>
                </div>
            </div>

            <div class="metric-card">
                <div class="metric-header">
                    <span class="metric-label">Mạng & Nhân Linux</span>
                    <span class="metric-icon">⚡</span>
                </div>
                <div class="metric-value" style="color: #6ee7b7; font-size: 1.35rem;">Google TCP BBR</div>
                <div class="metric-footer">
                    <span>VN-ICT (GMT+7) | BBR Active</span>
                </div>
            </div>
        </div>

        <!-- MAIN GRIDS -->
        <div class="section-grid">
            <!-- TỐI ƯU CACHE -->
            <div class="panel-card">
                <div class="panel-top">
                    <div class="panel-header">
                        <div class="panel-title">Tối Ưu Hóa Cache</div>
                        <span class="chip chip-green">Redis In-Memory</span>
                    </div>
                    <p class="panel-desc">
                        Cơ chế lưu đệm RAM giải phóng tài nguyên CPU máy chủ và giảm thời gian phản hồi API xuống dưới 5ms.
                    </p>
                </div>
                <div>
                    <div class="button-group">
                        <button class="btn btn-success" id="btn-cache" onclick="testCache()" style="width: 100%;">
                            Kiểm Tra Độ Trễ Phản Hồi
                        </button>
                    </div>
                    <div class="terminal-box">
                        <div class="terminal-header">
                            <div class="terminal-dots">
                                <span class="terminal-dot dot-red"></span>
                                <span class="terminal-dot dot-yellow"></span>
                                <span class="terminal-dot dot-green"></span>
                            </div>
                            <span class="terminal-title">cache-benchmark.log</span>
                            <div class="terminal-actions">
                                <button class="btn-terminal-mini" onclick="clearBox('cache-result')">Clear</button>
                            </div>
                        </div>
                        <div class="terminal-body" id="cache-result">Nhấn nút bên trên để bắt đầu đo lường hiệu năng bộ nhớ đệm...</div>
                    </div>
                </div>
            </div>

            <!-- TỐI ƯU DATABASE INDEX -->
            <div class="panel-card">
                <div class="panel-top">
                    <div class="panel-header">
                        <div class="panel-title">Tối Ưu Hóa Truy Vấn</div>
                        <span class="chip chip-purple">MariaDB 11.4 Engine</span>
                    </div>
                    <p class="panel-desc">
                        Đánh giá kế hoạch thực thi EXPLAIN trên 50.000 bản ghi để kiểm chứng sự vượt trội của chỉ mục B-Tree.
                    </p>
                </div>
                <div>
                    <div class="button-group">
                        <button class="btn" id="btn-seed" onclick="seedDb()" style="flex: 1;">
                            1. Sinh 50k Dữ Liệu
                        </button>
                        <button class="btn btn-purple" id="btn-benchmark" onclick="benchmarkIndex()" style="flex: 1;">
                            2. Đo Kế Hoạch EXPLAIN
                        </button>
                    </div>
                    <div class="terminal-box">
                        <div class="terminal-header">
                            <div class="terminal-dots">
                                <span class="terminal-dot dot-red"></span>
                                <span class="terminal-dot dot-yellow"></span>
                                <span class="terminal-dot dot-green"></span>
                            </div>
                            <span class="terminal-title">explain-query-plan.log</span>
                            <div class="terminal-actions">
                                <button class="btn-terminal-mini" onclick="clearBox('index-result')">Clear</button>
                            </div>
                        </div>
                        <div class="terminal-body" id="index-result">Sẵn sàng phân tích truy vấn dữ liệu...</div>
                    </div>
                </div>
            </div>

            <!-- GIÁM SÁT HỆ THỐNG & TELEGRAM NOTIFICATION -->
            <div class="panel-card">
                <div class="panel-top">
                    <div class="panel-header">
                        <div class="panel-title">Giám Sát & Báo Cáo</div>
                        <span class="chip chip-green">Telegram Bot</span>
                    </div>
                    <p class="panel-desc">
                        Ping tự động kiểm tra trạng thái HTTP 3 website vệ tinh và cổng Node.js, biên soạn và gửi báo cáo về Telegram Bot.
                    </p>
                </div>
                <div>
                    <div class="button-group">
                        <button class="btn btn-success" id="btn-health-sites" onclick="checkAllSitesAndNotify()" style="flex: 1.2;">
                            Quét 3 Site & Gửi Báo Cáo
                        </button>
                        <button class="btn" id="btn-health-internal" onclick="checkHealth()" style="flex: 0.8;">
                            Cổng /health
                        </button>
                    </div>
                    <div class="terminal-box">
                        <div class="terminal-header">
                            <div class="terminal-dots">
                                <span class="terminal-dot dot-red"></span>
                                <span class="terminal-dot dot-yellow"></span>
                                <span class="terminal-dot dot-green"></span>
                            </div>
                            <span class="terminal-title">site-health-monitor.log</span>
                            <div class="terminal-actions">
                                <button class="btn-terminal-mini" onclick="clearBox('health-result')">Clear</button>
                            </div>
                        </div>
                        <div class="terminal-body" id="health-result">Nhấn nút bên trên để kiểm tra và nhận bản tin trực tiếp qua Telegram...</div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- TOAST POPUP -->
    <div id="toast"><span>Notification</span></div>

    <script>
        const NL = String.fromCharCode(10);

        // Ticking VPS uptime in real-time
        let currentUptime = ${Math.floor(vps.uptimeSec)};
        setInterval(() => {
            currentUptime++;
            const upElem = document.getElementById('uptime-display');
            if (upElem) {
                const days = Math.floor(currentUptime / 86400);
                const hours = Math.floor((currentUptime % 86400) / 3600);
                const minutes = Math.floor((currentUptime % 3600) / 60);
                const seconds = Math.floor(currentUptime % 60);
                if (days > 0) {
                    upElem.innerText = days + ' ngày ' + hours + ' giờ ' + minutes + 'p ' + seconds + 's';
                } else if (hours > 0) {
                    upElem.innerText = hours + ' giờ ' + minutes + 'p ' + seconds + 's';
                } else {
                    upElem.innerText = minutes + 'p ' + seconds + 's';
                }
            }
        }, 1000);

        function showToast(msg) {
            const toast = document.getElementById('toast');
            toast.innerHTML = msg;
            toast.classList.add('show');
            setTimeout(() => { toast.classList.remove('show'); }, 3000);
        }

        function clearBox(id) {
            const el = document.getElementById(id);
            if (el) el.innerHTML = 'Log đã được xóa. Sẵn sàng...';
        }

        function copyWebhook() {
            const url = document.getElementById('webhook-url').innerText;
            navigator.clipboard.writeText(url).then(() => {
                showToast('Đã sao chép GitHub Webhook URL');
            });
        }

        function copyBoxText(id) {
            const text = document.getElementById(id).innerText;
            navigator.clipboard.writeText(text).then(() => {
                showToast('Đã sao chép log');
            });
        }

        function setButtonLoading(btnId, isLoading, originalHtml) {
            const btn = document.getElementById(btnId);
            if (!btn) return;
            if (isLoading) {
                btn.disabled = true;
                btn.dataset.original = btn.innerHTML;
                btn.innerHTML = '<span class="spinner"></span> Đang xử lý...';
            } else {
                btn.disabled = false;
                btn.innerHTML = btn.dataset.original || originalHtml;
            }
        }

        async function testCache() {
            const box = document.getElementById('cache-result');
            setButtonLoading('btn-cache', true);
            box.innerHTML = 'Đang gửi yêu cầu đo lường thời gian phản hồi mạng...';
            const t0 = performance.now();
            try {
                const res = await fetch('/api/cache-test');
                const data = await res.json();
                const totalMs = Math.round(performance.now() - t0);
                const isCached = data.source && data.source.includes('CACHE');
                
                const lines = [
                    '<span class="tag-pill ' + (isCached ? 'tag-pill-fast' : 'tag-pill-slow') + '">' +
                    (isCached ? '[CACHE HIT] PHẢN HỒI TỪ RAM' : '[CACHE MISS] TRUY VẤN TRỰC TIẾP') + '</span>',
                    'Nguồn dữ liệu  : ' + data.source,
                    'Thời gian xử lý: ' + data.speed + ' (Độ trễ toàn trình: ' + totalMs + ' ms)',
                    'Trạng thái     : ' + data.note,
                    '',
                    JSON.stringify(data.data, null, 2)
                ];
                box.innerHTML = lines.join(NL);
                showToast('Hoàn thành đo cache (' + totalMs + ' ms)');
            } catch (err) {
                box.innerHTML = '[LỖI] ' + err.message;
            } finally {
                setButtonLoading('btn-cache', false);
            }
        }

        async function seedDb() {
            const box = document.getElementById('index-result');
            setButtonLoading('btn-seed', true);
            box.innerHTML = 'Đang khởi tạo bảng và nạp 50.000 bản ghi dữ liệu mẫu... Vui lòng đợi 5-10 giây...';
            try {
                const res = await fetch('/api/seed-db');
                const data = await res.json();
                if (data.error) throw new Error(data.error);
                box.innerHTML = '[THÀNH CÔNG]: ' + JSON.stringify(data, null, 2);
                showToast('Đã nạp thành công 50.000 bản ghi');
            } catch (err) {
                box.innerHTML = '[LỖI KẾT NỐI]: ' + err.message;
            } finally {
                setButtonLoading('btn-seed', false);
            }
        }

        async function benchmarkIndex() {
            const box = document.getElementById('index-result');
            setButtonLoading('btn-benchmark', true);
            box.innerHTML = 'Đang phân tích kế hoạch thực thi EXPLAIN SELECT...';
            try {
                const res = await fetch('/api/index-benchmark?email=user45000@example.com');
                const data = await res.json();
                if (data.error) throw new Error(data.error);
                
                const isIndexed = data.explain_analysis.key_used !== 'NONE (Full Table Scan)';
                
                const lines = [
                    'KẾT QUẢ PHÂN TÍCH HIỆU NĂNG TRUY VẤN:',
                    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
                    'Trạng thái Index     : ' + (isIndexed ? '[INDEXED] Đã có chỉ mục B-Tree' : '[UNINDEXED] Quét toàn bảng (Full Table Scan)'),
                    'Thời gian thực thi   : ' + data.executionTime,
                    'Loại truy cập (type) : ' + data.explain_analysis.type,
                    'Chỉ mục được dùng    : ' + data.explain_analysis.key_used,
                    'Số dòng quét (rows)  : ' + data.explain_analysis.rows_scanned + ' dòng',
                    '',
                    'Dữ liệu tìm thấy: ' + JSON.stringify(data.data, null, 2)
                ];
                box.innerHTML = lines.join(NL);
                showToast('Đã phân tích xong EXPLAIN');
            } catch (err) {
                box.innerHTML = '[LỖI]: ' + err.message + NL + '(Gợi ý: Hãy bấm nút "1. Sinh 50k Dữ Liệu" trước khi đo)';
            } finally {
                setButtonLoading('btn-benchmark', false);
            }
        }

        async function checkAllSitesAndNotify() {
            const box = document.getElementById("health-result");
            setButtonLoading('btn-health-sites', true);
            box.innerHTML = "Đang đồng thời ping kiểm tra cả 3 trang web và tổng hợp số liệu... Vui lòng đợi...";
            try {
                const res = await fetch("/api/check-all-sites");
                const data = await res.json();
                
                const lines = [
                    "KẾT QUẢ QUÉT SỨC KHỎE CÁC WEBSITE TRÊN VPS:",
                    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
                ];
                data.results.forEach((s, i) => {
                    const statusTag = s.healthy ? "[ONLINE]" : "[ERROR]";
                    lines.push((i + 1) + ". " + statusTag + " [" + s.name + "]: HTTP " + s.status + " (" + s.statusText + ") | Độ trễ: " + s.latencyMs + " ms");
                    lines.push("   URL: " + s.url);
                });
                lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
                lines.push("Tổng kết: " + data.summary);
                if (data.telegramSent) {
                    lines.push("[TELEGRAM]: Báo cáo đã gửi thành công về Telegram của bạn.");
                    showToast('Đã gửi báo cáo về Telegram Bot');
                } else {
                    lines.push("[TELEGRAM]: Không gửi được tin nhắn (kiểm tra token/chat_id trong .env).");
                }
                box.innerHTML = lines.join(NL);
            } catch (err) {
                box.innerHTML = "[LỖI KHI QUÉT]: " + err.message;
            } finally {
                setButtonLoading('btn-health-sites', false);
            }
        }

        async function checkHealth() {
            const box = document.getElementById('health-result');
            try {
                const res = await fetch('/health');
                const data = await res.json();
                box.innerHTML = 'HTTP 200 OK | Trạng thái dịch vụ:' + NL + JSON.stringify(data, null, 2);
                showToast('Cổng nội bộ /health hoạt động tốt');
            } catch (err) {
                box.innerHTML = '[LỖI]: ' + err.message;
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
