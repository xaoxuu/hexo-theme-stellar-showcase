import { Octokit } from '@octokit/rest';
import fs from 'fs';
import path from 'path';
import { loadConfig, logger, handleError, writeJsonToFile } from './utils.js';
import { PATHS } from './constants.js';
import fetch from 'node-fetch';

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
  request: { fetch }
});

async function getIssues() {
  const config = loadConfig('issue_parser');
  const [owner, repo] = (config.repo || process.env.GITHUB_REPOSITORY).split('/');
  const params = {
    owner,
    repo,
    state: 'open'
  };

  // 添加排序
  if (config.sort === 'updated-desc') {
    params.sort = 'updated';
    params.direction = 'desc';
  } else {
    // 默认按创建时间排序
    params.sort = 'created';
    params.direction = 'desc';
  }

  try {
    const { data: issues } = await octokit.issues.listForRepo(params);
    
    // 过滤黑名单标签的 issues
    const blacklistLabels = config.exclude || [];
    const filteredIssues = issues.filter(issue => {
      const issueLabels = issue.labels.map(label => label.name);
      return !blacklistLabels.some(blacklistLabel => issueLabels.includes(blacklistLabel));
    });
    
    return filteredIssues;
  } catch (error) {
    handleError(error, 'Error fetching issues');
    throw error;
  }
}

async function processIssue(issue, config) {
  try {
    logger('info', `Processing issue #${issue.number}`);
    if (!issue.body) {
      logger('warn', `Issue #${issue.number} has no body content, skipping...`);
      return null;
    }

    const match = issue.body.match(/```json\s*\{[\s\S]*?\}\s*```/m);
    const jsonMatch = match ? match[0].match(/\{[\s\S]*?\}/m) : null;

    if (!jsonMatch) {
      logger('warn', `No JSON content found in issue #${issue.number}`);
      return null;
    }

    logger('info', `Found JSON content in issue #${issue.number}`);
    const jsonData = JSON.parse(jsonMatch[0]);
    jsonData.issue_number = issue.number;
    jsonData.labels = issue.labels.map(label => ({
      name: label.name,
      color: label.color
    }));
    
    return jsonData;
  } catch (error) {
    handleError(error, `Error processing issue #${issue.number}`);
    return null;
  }
}

async function parseIssues() {
  const config = loadConfig('issue_parser');
  if (!config.enabled) {
    logger('info', 'Issue parser is disabled in config');
    return;
  }

  try {
    const issues = await getIssues();
    logger('info', `Found ${issues.length} issues to process`);

    const parsedData = {
      version: 'v2',
      content: []
    };

    for (const issue of issues) {
      const processedData = await processIssue(issue, config);
      if (processedData) {
        parsedData.content.push(processedData);
      }
    }

    const outputPath = path.join(process.cwd(), PATHS.DATA);
    if (writeJsonToFile(outputPath, parsedData)) {
      logger('info', 'Successfully generated v2/data.json');
    }

  } catch (error) {
    handleError(error, 'Error processing issues');
    process.exit(1);
  }
}

parseIssues();
