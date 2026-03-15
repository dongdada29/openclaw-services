/**
 * 数据库层 - SQLite 初始化和连接管理
 * 支持 Bun 内置 SQLite 或 better-sqlite3
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { getConfig } from '../config/index.js';

// ES module 兼容 require
const require = createRequire(import.meta.url);

// 检测运行环境
export const isBun = typeof Bun !== 'undefined';

let db = null;

/**
 * 初始化数据库
 * Bun: 使用 bun:sqlite（内置，无需编译）
 * Node: 使用 better-sqlite3（需要编译）
 */
export function initDatabase() {
  const config = getConfig();
  const dbPath = config.get('dbPath');

  // 确保目录存在
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  if (isBun) {
    // Bun 内置 SQLite
    // @ts-ignore
    const { Database } = require('bun:sqlite');
    db = new Database(dbPath);
    
    // WAL 模式（Bun 用 exec）
    db.exec('PRAGMA journal_mode = WAL');
  } else {
    // Node.js - 使用 better-sqlite3
    // @ts-ignore
    const Database = require('better-sqlite3');
    db = new Database(dbPath);
    
    // WAL 模式
    if (db.pragma) {
      db.pragma('journal_mode = WAL');
    }
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
