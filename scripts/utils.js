import fs from 'fs';
import path from 'path';

export function logger(level, message, ...args) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`, ...args);
}

export function handleError(error, context) {
  if (error.response) {
    logger('error', `${context}: ${error.response.status} - ${error.response.statusText}`);
  } else if (error.request) {
    logger('error', `${context}: No response received`);
  } else {
    logger('error', `${context}: ${error.message}`);
  }
}

export function writeJsonToFile(filePath, data) {
  try {
    const dirPath = path.dirname(filePath);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    handleError(error, `Error writing to file ${filePath}`);
    return false;
  }
}

export async function withRetry(fn, retries = 3, delay = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}