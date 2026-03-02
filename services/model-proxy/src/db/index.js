/**
 * 数据库层 - SQLite 初始化和连接管理
 * 支持 Bun 内置 SQLite 或 better-sqlite3
 */
import fs from 'fs';
import path from 'path';
import { getConfig } from '../config/index.js';

// 检测运行环境
const isBun = typeof Bun !== 'undefined';

let db = null;
let DatabaseClass = null;

// 获取 SQLite 实现（延迟加载）
function getDatabaseClass() {
  if (DatabaseClass) return DatabaseClass;

  if (isBun) {
    // Bun 内置 SQLite
    const { Database } = require('bun:sqlite');
    DatabaseClass = Database;
  } else {
    // Node.js 使用 better-sqlite3
    DatabaseClass = require('better-sqlite3');
  }

  return DatabaseClass;
}

export function initDatabase() {
  const config = getConfig();
  const dbPath = config.get('dbPath');

  // 确保目录存在
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const Database = getDatabaseClass();
  db = new Database(dbPath);

  // WAL 模式
  if (db.pragma) {
    db.pragma('journal_mode = WAL');
  }

  // 创建表
  db.exec(`
    CREATE TABLE IF NOT EXISTS requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT,
      method TEXT,
      path TEXT,
      status INTEGER,
      duration_ms INTEGER,
      is_streaming INTEGER DEFAULT 0,
      input_tokens INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS request_details (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id INTEGER REFERENCES requests(id),
      messages TEXT,
      system TEXT,
      tools TEXT,
      has_images INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_requests_timestamp ON requests(timestamp);
    CREATE INDEX IF NOT EXISTS idx_requests_provider ON requests(provider);
    CREATE INDEX IF NOT EXISTS idx_requests_model ON requests(model);
  `);

  return db;
}

export function getDatabase() {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

export function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}
