/**
 * 代理层 - 请求/响应处理
 */
import https from 'https';
import { getConfig } from '../config/index.js';
import { detectProvider, rewritePath } from '../providers/detector.js';
import { sanitizeRequest } from '../utils/sanitize.js';
import { 
  log, 
  logSeparator, 
  formatRequestLog, 
  formatResponseLog,
  formatTokenUsage 
} from '../utils/logger.js';
import { truncate } from '../utils/sanitize.js';
import { addLogToBatch } from '../db/repository.js';

let requestId = 0;

/**
 * 处理代理请求
 */
export async function handleProxyRequest(req, res) {
  const id = ++requestId;
  const startTime = Date.now();
  const config = getConfig();
  
  // 读取请求体
  const body = await readBody(req);
  let requestData = null;
  try {
    requestData = body ? JSON.parse(body) : null;
  } catch (e) {
    requestData = body;
  }
  
  // 检测供应商
  const provider = detectProvider(req);
  const { path: targetPath, provider: finalProvider } = rewritePath(req, provider);
  
  if (!finalProvider.host) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unknown provider' }));
    return;
  }

  // 日志输出
  if (config.get('logRequests')) {
    logSeparator();
    log(`>>> REQUEST #${id}`, formatRequestLog(id, req, finalProvider, requestData, truncate));
    
    if (requestData?.messages) {
      log('📝 Messages:', requestData.messages.map(m => ({
        role: m.role,
        content: truncate(m.content, config.get('maxContentLength')),
      })));
    }
    if (requestData?.system) {
      log('⚙️  System:', truncate(requestData.system, config.get('maxSystemLength')));
    }
    if (requestData?.tools?.length) {
      log('🔧 Tools:', requestData.tools.slice(0, 5).map(t => t.name || t.function?.name || t.type));
    }
  }

  // 转发请求
  const timeout = config.get('timeout');
  const proxyReq = https.request({
    hostname: finalProvider.host,
    port: 443,
    path: targetPath,
    method: req.method,
    headers: { ...req.headers, host: finalProvider.host },
    timeout,
  }, (proxyRes) => {
    handleProxyResponse(id, proxyRes, res, startTime, finalProvider, req, requestData);
  });

  proxyReq.on('error', (error) => {
    log(`❌ Proxy error #${id}: ${error.message}`);
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Proxy error', message: error.message }));
    }
  });

  proxyReq.on('timeout', () => {
    log(`⏱️ Proxy timeout #${id}`);
    proxyReq.destroy();
    if (!res.headersSent) {
      res.writeHead(504, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Gateway timeout' }));
    }
  });

  if (body) proxyReq.write(body);
  proxyReq.end();
}

/**
 * 处理代理响应
 */
function handleProxyResponse(id, proxyRes, clientRes, startTime, provider, req, requestData) {
  const chunks = [];
  const isStreaming = proxyRes.headers['content-type']?.includes('text/event-stream');
  const duration = Date.now() - startTime;
  const config = getConfig();

  // 先发送响应头
  clientRes.writeHead(proxyRes.statusCode || 200, proxyRes.headers);

  proxyRes.on('data', (chunk) => {
    chunks.push(chunk);
    clientRes.write(chunk);
  });

  proxyRes.on('end', () => {
    clientRes.end();

    // 解析响应
    const fullBody = Buffer.concat(chunks).toString('utf-8');
    let responseData = null;
    let usage = null;

    if (!isStreaming) {
      try {
        responseData = JSON.parse(fullBody);
        usage = responseData?.usage;
      } catch {}
    } else {
      // 解析 SSE 流中的 usage（多种格式）
      // 格式1: "usage": {"prompt_tokens": 10, "completion_tokens": 20}
      // 格式2: "usage": {"input_tokens": 10, "output_tokens": 20}
      // 格式3: data: [DONE] 前的最后一个 data 块
      
      // 尝试匹配所有 usage 格式
      const usagePatterns = [
        /"usage":\s*(\{[^}]+\})/g,
        /"prompt_tokens":\s*(\d+).*?"completion_tokens":\s*(\d+)/,
        /"input_tokens":\s*(\d+).*?"output_tokens":\s*(\d+)/,
      ];
      
      // 尝试从最后一个 data 块解析
      const lastDataMatch = fullBody.match(/data:\s*(\{.*?\})\s*$/);
      if (lastDataMatch) {
        try {
          const lastData = JSON.parse(lastDataMatch[1]);
          if (lastData.usage) {
            usage = lastData.usage;
          }
        } catch {}
      }
      
      // 如果没找到，尝试全局搜索
      if (!usage) {
        for (const pattern of usagePatterns) {
          const match = fullBody.match(pattern);
          if (match) {
            try {
              if (match[2]) {
                // 格式2/3: 捕获组
                usage = {
                  prompt_tokens: parseInt(match[1]),
                  completion_tokens: parseInt(match[2]),
                };
              } else {
                // 格式1: JSON 对象
                usage = JSON.parse(match[1]);
              }
              break;
            } catch {}
          }
        }
      }
    }

    // 保存到数据库（异步，不阻塞响应）
    addLogToBatch({
      timestamp: new Date().toISOString(),
      provider: provider.providerId,
      model: responseData?.model || requestData?.model,
      method: req.method,
      path: req.url,
      status: proxyRes.statusCode,
      durationMs: duration,
      isStreaming,
      usage,
      details: sanitizeRequest(requestData),
    }).catch(err => {
      console.error('Failed to add log to batch:', err.message);
    });

    // 日志输出
    if (config.get('logResponses')) {
      log(`<<< RESPONSE #${id}`, formatResponseLog(
        id, provider.providerId, proxyRes.statusCode, duration, isStreaming, usage
      ));

      const tokenUsage = formatTokenUsage(usage);
      if (tokenUsage) {
        log('📊 Token Usage:', tokenUsage);
      }
    }
  });
}

/**
 * 读取请求体
 */
function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
  });
}
