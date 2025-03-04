import { Octokit } from '@octokit/rest';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { loadConfig, logger, handleError, withRetry } from './utils.js';
import { SITE_STATUS, ISSUE_LABELS, API } from './constants.js';

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN
});

async function checkSite(url) {
  const config = loadConfig('site_checker');
  try {
    const response = await axios.get(url, {
      timeout: config.timeout
    });
    const $ = cheerio.load(response.data);
    const themeMetaTag = $(API.META_TAG);
    
    if (themeMetaTag.length > 0) {
      const themeName = themeMetaTag.attr('theme-name');
      const content = themeMetaTag.attr('content');
      const themeVersion = themeMetaTag.attr('theme-version') || (() => {
        if (content) {
          const versionMatch = content.match(/\/tree\/([\d.]+)(?:\/|$)/);
          return versionMatch ? versionMatch[1] : null;
        }
        return null;
      })();
      
      if (themeName === API.THEME_NAME || (content && content.includes('xaoxuu/hexo-theme-stellar') && themeVersion)) {
        return { status: SITE_STATUS.STELLAR, version: themeVersion };
      } else {
        return { status: SITE_STATUS.NOT_STELLAR };
      }
    } else {
      return { status: SITE_STATUS.NOT_STELLAR };
    }
  } catch (error) {
    handleError(error, `Error checking site ${url}`);
    return { status: SITE_STATUS.ERROR };
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

async function getOpenIssues() {
  const config = loadConfig('site_checker');
  const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/');
  
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
    
    return issues.map(issue => ({
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
  const config = loadConfig('site_checker');
  if (!config.enabled) {
    logger('info', 'Site checker is disabled in config');
    return;
  }

  try {
    const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/');
    const validSites = await getOpenIssues();
    let errors = [];
    
    // 创建并发控制池，最大并发数为 5
    const pool = new ConcurrencyPool(5);
    const checkPromises = validSites.map(item => {
      return pool.add(async () => {
        try {
          logger('info', `Checking #${issueNumber} site: ${item.url}`);
          const checkSiteWithRetry = () => checkSite(item.url);
          const result = await withRetry(checkSiteWithRetry, config.retry_times);
          
          let labels = [];
          switch (result.status) {
            case SITE_STATUS.STELLAR:
              labels = [`${result.version}`];
              break;
            case SITE_STATUS.NOT_STELLAR:
              labels = [...(item.labels.map(label => label.name) || []), ISSUE_LABELS.NOT_STELLAR];
              break;
            case SITE_STATUS.ERROR:
              labels = [...(item.labels.map(label => label.name) || []), ISSUE_LABELS.NETWORK_ERROR];
              break;
          }
          
          labels = [...new Set(labels)];
          await updateIssueLabels(owner, repo, item.issue_number, labels);
        } catch (error) {
          errors.push({ issue: item.issue_number, url: item.url, error: error.message });
          logger('error', `Error processing site ${item.url} (Issue #${item.issue_number}): ${error.message}`);
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