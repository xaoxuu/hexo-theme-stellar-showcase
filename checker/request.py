# -*- coding: utf-8 -*-
# 参考自： https://github.com/volantis-x/examples/ 感谢 @MHuiG
import random
import time
import requests
import yaml
requests.packages.urllib3.disable_warnings()

def load_config():
    f = open('config.yml', 'r',encoding='utf-8')
    ystr = f.read()
    ymllist = yaml.load(ystr, Loader=yaml.FullLoader)
    return ymllist

# 反反爬虫
def getRandUa():
  first_num = random.randint(55, 62)
  third_num = random.randint(0, 3200)
  fourth_num = random.randint(0, 140)
  os_type = [
      '(Windows NT 6.1; WOW64)', '(Windows NT 10.0; WOW64)', '(X11; Linux x86_64)',
      '(Macintosh; Intel Mac OS X 10_12_6)'
  ]
  chrome_version = 'Chrome/{}.0.{}.{}'.format(first_num, third_num, fourth_num)

  ua = ' '.join(['Mozilla/5.0', random.choice(os_type), 'AppleWebKit/537.36',
                  '(KHTML, like Gecko)', chrome_version, 'Safari/537.36']
                )
  return ua

def make_req(link,header):
  result = ''
  config = load_config()
  try:
    requests.adapters.DEFAULT_RETRIES = 55
    s = requests.session()
    s.keep_alive = False # 关闭多余连接
    r = s.get(link, headers=header, timeout=config['request']['timeout'],verify=False)
    s.close()
    r.encoding = 'utf-8'
    result = r.text.encode("gbk", 'ignore').decode('gbk', 'ignore')
    print(str(r))
    if str(r) == '<Response [404]>':
        result = 'error::404'
        return result
    if str(r) != '<Response [200]>':
        result = 'error::not200'
        return result
  except Exception as e:
      print(e)
      print(e.__traceback__.tb_frame.f_globals["__file__"])
      print(e.__traceback__.tb_lineno)
      result = 'error'
  return result

def get_data(link,header_ua_random=False):
    result = ''
    ua = getRandUa()
    # if header_ua_random:
    #   ua = getRandUa()
    # else:
    #   ua = 'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
    print(ua)
    header = {
      'User-Agent': ua,
      "Connection": "close",
      }
    result=make_req(link,header)
    return result
