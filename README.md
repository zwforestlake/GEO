# GEO 智能优化引擎

运营工作台前后端分离版本：React + TypeScript 前端，FastAPI + SQLite 后端。

## 启动

后端：

```bash
cd backend
python3 -m pip install -r requirements.txt
python3 -m playwright install chromium
python3 -m uvicorn app.main:app --reload --port 8001
```

前端：

```bash
cd frontend
npm install
npm run dev
```

打开 `http://127.0.0.1:5175`。接口文档位于 `http://127.0.0.1:8001/docs`。

## 当前能力

- 六模块统一工作台、实时平台/品牌/FAQ/知识库统计。
- 品牌、FAQ、知识库的创建、删除与 SQLite 持久化。
- GEO 关键词评估与引用信源展示。
- GEO 结果查询内置官方网页监测模式，支持独立浏览器登录 profile、截图、显式引用与运行日志。
- 图文初稿生成、操作日志记录与清空。

官方网页监测第一版支持 ChatGPT 与 DeepSeek。平台要求人工登录时，在“GEO 结果查询”中切换到“官方网页监测”，打开独立登录浏览器，登录完成后关闭窗口并重试评估。豆包、混元、Claude 适配器保留为后续接入状态。
