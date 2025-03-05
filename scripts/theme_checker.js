import { Octokit } from '@octokit/rest';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { config } from '../config.js';
import { logger, handleError, withRetry } from './utils.js';

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN
});

async function checkSite(url) {
  try {
    // 动态延时策略
    const { min, max } = config.request.delay;
    const delay = Math.floor(Math.random() * (max - min)) + min;
    await new Promise(resolve => setTimeout(resolve, delay));

    // 随机选择 User-Agent
    const userAgents = config.request.user_agents;
    const randomUserAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
    
    // 构建请求头
    const headers = {
      'User-Agent': randomUserAgent,
      ...config.request.headers
    };

    const response = await axios.get(url, {
      timeout: config.request.timeout,
      headers: headers,
      validateStatus: status => status < 500 // 允许除500以外的状态码
    });
    const $ = cheerio.load(response.data);
    const themeMetaTag = $(config.theme_checker.meta_tag);
    
    // 通用的版本号匹配函数
    const extractVersion = (content) => {
      if (!content) return null;
      // 匹配 URL 路径中的版本号
      const urlVersionMatch = content.match(/\/tree\/([\d.]+(?:-[\w.]+)?)/)?.[1];
      if (urlVersionMatch) return urlVersionMatch;
      // 匹配直接的版本号格式
      const directVersionMatch = content.match(/^\d+\.\d+\.\d+(?:-[\w.]+)?$/)?.[0];
      return directVersionMatch || null;
    };
    
    if (themeMetaTag.length > 0) {
      const themeName = themeMetaTag.attr(config.theme_checker.name_attr);
      const content = themeMetaTag.attr(config.theme_checker.content_attr);
      const themeVersion = themeMetaTag.attr(config.theme_checker.version_attr) || extractVersion(content);
      
      if (themeName === config.theme_checker.theme_name || (content && themeVersion)) {
        return { status: config.base.site_status.valid, version: themeVersion };
      }
    }
    
    // 尝试从备选meta标签中解析版本号
    const altThemeMetaTag = $(`meta[name="${config.theme_checker.theme_name}"]`);
    if (altThemeMetaTag.length > 0) {
      const content = altThemeMetaTag.attr('content');
      const version = extractVersion(content);
      if (version) {
        return { status: config.base.site_status.valid, version };
      }
    }
    
    return { status: config.base.site_status.invalid };
  } catch (error) {
    // 针对特定错误类型进行处理
    if (error.response) {
      if (error.response.status === 403) {
        logger('warn', `Access forbidden for site ${url}, possibly due to anti-crawling measures`);
      } else if (error.response.status === 429) {
        logger('warn', `Rate limited for site ${url}, will retry later`);
      }
    }
    handleError(error, `Error checking site ${url}`);
    return { status: config.base.site_status.error };
  }
}

async function updateIssueLabels(owner, repo, issueNumber, labels) {
  try {
    await octokit.issues.setLabels({
      owner,
      repo,
      issue_number: issueNumber,
      labels
    });
    logger('info', `Updated labels for issue #${issueNumber}`, labels);
  } catch (error) {
    handleError(error, `Error updating labels for issue #${issueNumber}`);
  }
}

async function getIssues() {
  const [owner, repo] = (config.base.debug_repo || process.env.GITHUB_REPOSITORY).split('/');
  
  try {
    const issues = [];
    for await (const response of octokit.paginate.iterator(octokit.issues.listForRepo, {
      owner,
      repo,
      state: 'open',
      per_page: 100
    })) {
      issues.push(...response.data);
    }
    
    // 过滤掉包含 exclude_labels 中定义的标签的 Issue
    const filteredIssues = issues.filter(issue => {
      const issueLabels = issue.labels.map(label => label.name);
      return !config.theme_checker.exclude_labels.some(excludeLabel => issueLabels.includes(excludeLabel));
    });

    // 根据 include_keyword 过滤 Issue
    const keywordFilteredIssues = filteredIssues.filter(issue => {
      if (!config.theme_checker.include_keyword) return true;
      return issue.body?.includes(config.theme_checker.include_keyword);
    });
    
    return keywordFilteredIssues.map(issue => ({
      url: issue.body?.match(/"url":\s*"([^"]+)"/)?.at(1),
      issue_number: issue.number,
      labels: issue.labels.map(label => ({
        name: label.name,
        color: label.color
      }))
    })).filter(item => item.url);
  } catch (error) {
    handleError(error, 'Error fetching issues');
    throw error;
  }
}

class ConcurrencyPool {
  constructor(maxConcurrency) {
    this.maxConcurrency = maxConcurrency;
    this.running = 0;
    this.queue = [];
  }

  async add(fn) {
    if (this.running >= this.maxConcurrency) {
      await new Promise(resolve => this.queue.push(resolve));
    }
    this.running++;
    try {
      return await fn();
    } finally {
      this.running--;
      if (this.queue.length > 0) {
        const next = this.queue.shift();
        next();
      }
    }
  }
}

async function processData() {
  if (!config.theme_checker.enabled) {
    logger('info', 'Site checker is disabled in config');
    return;
  }

  try {
    const [owner, repo] = (config.base.debug_repo || process.env.GITHUB_REPOSITORY).split('/');
    const validSites = await getIssues();
    let errors = [];
    
    // 创建并发控制池，最大并发数为 5
    const pool = new ConcurrencyPool(5);
    const checkPromises = validSites.map(item => {
      return pool.add(async () => {
        try {
          logger('info', `Checking #${item.issue_number} site: ${item.url}`);
          const checkSiteWithRetry = () => checkSite(item.url);
          const result = await withRetry(checkSiteWithRetry, config.theme_checker.retry_times);
          
          let labels = [];
          switch (result.status) {
            case config.base.site_status.valid:
              labels = [`${result.version}`];
              break;
            case config.base.site_status.invalid:
              labels = [...(item.labels.map(label => label.name) || []), config.theme_checker.error_labels.invalid];
              break;
            case config.base.site_status.error:
              labels = [...(item.labels.map(label => label.name) || []), config.theme_checker.error_labels.unreachable];
              break;
          }
          
          labels = [...new Set(labels)];
          await updateIssueLabels(owner, repo, item.issue_number, labels);
        } catch (error) {
          errors.push({ issue: item.issue_number, url: item.url, error: error.message });
          logger('error', `#${item.issue_number} Error processing site ${item.url} (Issue #${item.issue_number}): ${error.message}`);
        }
      });
    });

    // 等待所有检查任务完成
    await Promise.all(checkPromises);

    if (errors.length > 0) {
      logger('warn', `Completed with ${errors.length} errors:`);
      errors.forEach(err => {
        logger('warn', `Issue #${err.issue} (${err.url}): ${err.error}`);
      });
      process.exit(1);
    }
  } catch (error) {
    handleError(error, 'Error processing data');
    process.exit(1);
  }
}

processData();