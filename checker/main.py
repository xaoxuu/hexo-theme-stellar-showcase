# -*- coding: utf-8 -*-
# 参考自： https://github.com/volantis-x/examples/ 感谢 @MHuiG
import sys
from time import sleep, time
import requests
from bs4 import BeautifulSoup
import re
import yaml
import request
import json
import os

version = 'v2'
outputdir = version  # 输出文件结构变化时，更新输出路径版本
data_pool = []

def load_config():
    f = open('config.yml', 'r',encoding='utf-8')
    ystr = f.read()
    ymllist = yaml.load(ystr, Loader=yaml.FullLoader)
    return ymllist

def github_issuse(data_pool):
    print('\n')
    print('------- github issues start ----------')
    baselink = 'https://github.com/'
    config = load_config()
    try:
        for number in range(1, 1000):
            print("page="+str(number))
            if config['issues']['label']:
                label_plus = '+label%3A' + config['issues']['label']
            else:
                label_plus = ''
            github = request.get_data('https://github.com/' +
                             config['issues']['repo'] +
                             '/issues?q=is%3Aopen' + str(label_plus) + '&page=' + str(number))
            soup = BeautifulSoup(github, 'html.parser')
            main_content = soup.find_all('div',{'aria-label': 'Issues'})
            linklist = main_content[0].find_all('a', {'class': 'Link--primary'})
            if len(linklist) == 0:
                print('> end')
                break
            for item in linklist:
                issueslink = baselink + item['href']
                issues_page = request.get_data(issueslink)
                issues_soup = BeautifulSoup(issues_page, 'html.parser')
                try:
                    issues_id = issues_soup.find_all('span', {'class': 'f1-light'})[0].text.strip().split('#')[1]
                    print(issues_id)
                    issues_linklist = issues_soup.find_all('pre')
                    source = issues_linklist[0].text
                    issues_labels = set()
                    issues_labels_a = issues_soup.find_all('div', {'class': 'js-issue-labels'})[0].find_all('a', {'class': 'IssueLabel'})
                    for i in issues_labels_a:
                      issues_labels.add(i.text.strip())
                    print(issues_labels)
                    if "{" in source:
                        source = json.loads(source)
                        print(source["url"])
                        data_pool.append({'id': issues_id, 'url': source['url'], "labels": list(issues_labels)})
                except Exception as e:
                    print(e)
                    continue
    except Exception as e:
        print(e)
        print('> end')

    print('------- github issues end ----------')
    print('\n')



github_issuse(data_pool)

pattern1 = re.compile(r'stellar|Stellar')
pattern2 = re.compile(r'l_header|l_body')


def checker_url(item,header_ua_random=False):
    res={}
    try:
      print('check item:', item)
      data = request.get_data(item['url'],header_ua_random)
      if data == 'error::404':
        res['r'] = False
        res['e'] = "error::404"
        return res
      if data == 'error::not200':
        res['r'] = False
        res['e'] = "NETWORK ERROR"
        return res
      if data == 'error':
        res['r'] = False
        res['e'] = "NETWORK ERROR"
        return res
      result1 = pattern1.findall(data)
      result2 = pattern2.findall(data)

      if len(result1) > 0 and len(result2) > 0:
          res['r'] = True
          # <meta name="hexo-theme" content="https://github.com/xaoxuu/hexo-theme-stellar/tree/1.28.1" theme-name="Stellar" theme-version="1.28.1">
          # 输出主题版本标签，例如 res['v'] = '1.28.1'
          matchObj = re.match(r'(.*?) theme-version="(.*?)"', data, re.S|re.I)
          if matchObj:
            theme_version = matchObj.group(2)
            print('theme_version:', theme_version)
            res['v'] = theme_version
      else:
          res['r'] = False
          res['e'] = "NOT Stellar"
          res['d'] = data
          print(data)
    except Exception as e:
        res['r'] = False
        res['e'] = "NETWORK ERROR"
    return res

def delete_labels(issue_number,labels):
  try:
    config = load_config()
    url='https://api.github.com/repos/'+config['issues']['repo']+'/issues/'+issue_number+'/labels/'+labels
    handlers={
      "Authorization": "token "+sys.argv[1],
      "Accept": "application/vnd.github.v3+json"
    }
    r=requests.delete(url=url, headers=handlers)
    print(r.text.encode("gbk", 'ignore').decode('gbk', 'ignore'))
  except Exception as e:
    print(e)


print('------- checker start ----------')
error_pool=[]
for item in data_pool:
    result = checker_url(item)
    if not result['r']:
        item['error'] = result['e']
        if item['error'] == "NOT Stellar":
            sleep(20)
            result = checker_url(item,True)
            if not result['r']:
              item['error'] = result['e']
              item['data'] = result['d']
              error_pool.append(item)
        else:
            error_pool.append(item)
    else:
      print("OK", result)
      if 'v' in result:
        theme_version = result['v']
        labels = '["' + theme_version + '"]'
        print("add labels:", labels)
        add_labels(item['id'], labels)
      if "NETWORK WARNING" in item['labels']:
          print("delete label NETWORK WARNING...")
          delete_labels(item['id'],"NETWORK WARNING")

print('------- checker end ----------')
print('\n')

def add_labels(issue_number,labels):
  try:
    config = load_config()
    url='https://api.github.com/repos/'+config['issues']['repo']+'/issues/'+issue_number+'/labels'
    data= labels
    handlers={
      "Authorization": "token "+sys.argv[1],
      "Accept": "application/vnd.github.v3+json"
    }
    r=requests.post(url=url,data=data,headers=handlers)
    # print(r.text.encode("gbk", 'ignore').decode('gbk', 'ignore'))
  except Exception as e:
    print(e)

def Create_an_issue_comment_invalid(issue_number,invalid_data):
  try:
    config = load_config()
    url='https://api.github.com/repos/'+config['issues']['repo']+'/issues/'+issue_number+'/comments'
    data={"body":'''**⚠️ 抱歉，Github Actions 未能从您的网站识别到 Stellar 主题，现已下架。**\r\n\r\n如果您对处理结果有异议，请在下方留言告知。\r\n\r\n以下是 Github Actions 检测到的内容 [注: Github Actions 可能会触发网站防火墙]\r\n\r\n<details><summary>网站信息:</summary>\r\n\r\n```\r\n\r\n'''+invalid_data+'''\r\n\r\n```\r\n\r\n</details>\r\n\r\n'''}
    data=json.dumps(data)
    handlers={
      "Authorization": "token "+sys.argv[1],
      "Accept": "application/vnd.github.v3+json"
    }
    r=requests.post(url=url,data=data.encode(),headers=handlers)
    # print(r.text.encode("gbk", 'ignore').decode('gbk', 'ignore'))
  except Exception as e:
    print(e)

# https://docs.github.com/en/rest/reference/issues#update-an-issue
def Close_an_issue(issue_number):
  try:
    config = load_config()
    url='https://api.github.com/repos/'+config['issues']['repo']+'/issues/'+issue_number
    data='''{"state":"closed"}'''
    handlers={
      "Authorization": "token "+sys.argv[1],
      "Accept": "application/vnd.github.v3+json"
    }
    r=requests.patch(url=url,data=data.encode(),headers=handlers)
    # print(r.text.encode("gbk", 'ignore').decode('gbk', 'ignore'))
  except Exception as e:
    print(e)

print('------- error data start ----------')
for item in error_pool:
    print(item)
    if item['error'] == "NOT Stellar":
        add_labels(item['id'],'["Maybe NOT Stellar"]')
        Create_an_issue_comment_invalid(item['id'],item['data'])
        # Close_an_issue(item['id'])
    if item['error'] == "NETWORK ERROR":
        add_labels(item['id'],'["NETWORK WARNING"]')
        if item['url'] == "https://" or item['url'] == "":
            add_labels(item['id'],'["invalid"]')
            Create_an_issue_comment_invalid(item['id'],"无效 URL")
            # Close_an_issue(item['id'])
    if item['error'] == "error::404":
        add_labels(item['id'],'["NETWORK WARNING"]')
        add_labels(item['id'],'["invalid"]')
        Create_an_issue_comment_invalid(item['id'],"<Response [404]>")
        # Close_an_issue(item['id'])
print('------- error data end ----------')
print('\n')


def mkdir(path):
    folder = os.path.exists(path)
    if not folder:
        os.makedirs(path)
        print("create dir:", path)
    else:
        print("dir exists:", path)

mkdir(outputdir)
filename = outputdir + '/error.json'
with open(filename,'w',encoding='utf-8') as file_obj:
    data = {'version': version, 'content': error_pool}
    json.dump(data, file_obj, ensure_ascii=False, indent=2)
