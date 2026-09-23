# Node.js Demo App - VPS Linux & CI/CD Project

Dự án mẫu phục vụ hoàn chỉnh 10 tiêu chí bài thi Quản trị Website trên VPS Linux.

## Các Endpoint tích hợp sẵn:
1. `GET /`: Trang chủ kiểm tra Uptime, Node version, Bộ nhớ RAM thực tế.
2. `GET /health`: Health-check endpoint phục vụ **Tiêu chí 9 (Uptime Kuma)**.
3. `GET /api/cache-test`: So sánh tốc độ có Cache và không có Cache phục vụ **Tiêu chí 3 & 4 (Redis NoSQL Cache)**.
4. `GET /api/seed-db`: Tự động tạo bảng `users` và sinh 50.000 dòng dữ liệu test.
5. `GET /api/index-benchmark?email=user45000@example.com`: Chạy `EXPLAIN` và đo tốc độ trước/sau khi đánh Index phục vụ **Tiêu chí 5**.

## Cách đẩy lên GitHub:
```bash
git init
git add .
git commit -m "feat: initial commit vps demo app"
git branch -M main
git remote add origin https://github.com/<tai-khoan-cua-ban>/<ten-repo>.git
git push -u origin main
```

## Cách triển khai trên VPS:
```bash
cd /home/*/htdocs/*/
git clone https://github.com/<tai-khoan-cua-ban>/<ten-repo>.git .
npm install
pm2 start ecosystem.config.js
pm2 save
```
