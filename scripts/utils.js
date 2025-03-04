import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { DEFAULT_CONFIG, PATHS } from './constants.js';

// 读取配置文件
export function loadConfig(section) {
  try {
    const configPath = path.join(process.cwd(), PATHS.CONFIG);
    const config = yaml.load(fs.readFileSync(configPath, 'utf8'));
    return section ? { ...DEFAULT_CONFIG, ...(config[section] || {}) } : { ...DEFAULT_CONFIG, ...config };
  } catch (error) {
    console.error('Error loading config:', error);
    return DEFAULT_CONFIG;
  }
}

// 日志记录工具
export function logger(type, message, data = null) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${type.toUpperCase()}: ${message}`;
  console.log(logMessage);
  if (data) {
    console.log(JSON.stringify(data, null, 2));
  }
}

// 数据验证工具
export function validateSiteData(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid data format');
  }
  if (!Array.isArray(data.content)) {
    throw new Error('Content must be an array');
  }
  return data.content.filter(item => {
    if (!item.url || typeof item.url !== 'string') {
      logger('warn', `Invalid site data: missing or invalid URL`, item);
      return false;
    }
    return true;
  });
}

// 错误处理工具
export function handleError(error, context = '') {
  const errorMessage = error.message || 'Unknown error';
  logger('error', `${context}: ${errorMessage}`);
  if (error.response) {
    logger('error', 'Response data:', error.response.data);
  }
  return {
    success: false,
    error: errorMessage,
    context
  };
}

// 重试机制工具
export async function withRetry(fn, retryTimes = DEFAULT_CONFIG.retry_times) {
  let lastError;
  for (let i = 0; i < retryTimes; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i < retryTimes - 1) {
        logger('info', `Retry attempt ${i + 1}/${retryTimes}`);
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
      }
    }
  }
  throw lastError;
}

// 文件操作工具
export function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

export function writeJsonToFile(filePath, data) {
  try {
    const dirPath = path.dirname(filePath);
    ensureDirectoryExists(dirPath);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    logger('info', `Successfully wrote to ${filePath}`);
    return true;
  } catch (error) {
    handleError(error, `Failed to write to ${filePath}`);
    return false;
  }
}