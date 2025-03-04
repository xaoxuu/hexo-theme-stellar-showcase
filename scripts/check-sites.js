import { Octokit } from '@octokit/rest';
import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';
import { loadConfig, logger, handleError, withRetry, validateSiteData } from './utils.js';
import { SITE_STATUS, ISSUE_LABELS, API, PATHS } from './constants.js';

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
      const themeVersion = themeMetaTag.attr('theme-version') || (() => {
        const content = themeMetaTag.attr('content');
        if (content) {
          const versionMatch = content.match(/\/tree\/([\d.]+)(?:\/|$)/);
          return versionMatch ? versionMatch[1] : null;
        }
        return null;
      })();
      
      if (themeName === API.THEME_NAME) {
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
    const { data: issues } = await octokit.issues.listForRepo({
      owner,
      repo,
      state: 'open'
    });
    
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

async function processData() {
  const config = loadConfig('site_checker');
  if (!config.enabled) {
    logger('info', 'Site checker is disabled in config');
    return;
  }

  try {
    const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/');
    const validSites = await getOpenIssues();
    
    for (const item of validSites) {
      logger('info', `Checking site: ${item.url}`);
      const checkSiteWithRetry = () => checkSite(item.url);
      const result = await withRetry(checkSiteWithRetry, config.retry_times);
      
      let labels = [];
      switch (result.status) {
        case SITE_STATUS.STELLAR:
          // 如果是 Stellar 主题，只保留版本号标签
          labels = [`${result.version}`];
          break;
        case SITE_STATUS.NOT_STELLAR:
          // 保留原有标签，添加 NOT_STELLAR 标签
          labels = [...(item.labels.map(label => label.name) || []), ISSUE_LABELS.NOT_STELLAR];
          break;
        case SITE_STATUS.ERROR:
          // 保留原有标签，添加 NETWORK_ERROR 标签
          labels = [...(item.labels.map(label => label.name) || []), ISSUE_LABELS.NETWORK_ERROR];
          break;
      }
      
      // 去重标签
      labels = [...new Set(labels)];
      
      await updateIssueLabels(owner, repo, item.issue_number, labels);
    }
  } catch (error) {
    handleError(error, 'Error processing data');
    process.exit(1);
  }
}

processData();