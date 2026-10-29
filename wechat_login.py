"""Run the reviewed MP-only collector on loopback with a small NJU setup page."""
import os
import secrets
import sys
from http.cookies import SimpleCookie
from pathlib import Path

os.umask(0o077)
BASE = Path(os.environ.get("WECHAT_COLLECTOR_ROOT") or Path(__file__).parent / ".local/wechat-collector").resolve()
sys.path.insert(0, str(BASE))
from app_mp import app
from flask import Response
from werkzeug.serving import make_server, WSGIRequestHandler

SESSION = secrets.token_urlsafe(32)
PORT = 5291
AUTHORITY = f"127.0.0.1:{PORT}"
SETUP = '''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>连接公众号来源 · NJU Know</title>
<style>*{box-sizing:border-box}body{margin:0;background:#f6f5f8;color:#302936;font:16px/1.7 system-ui,sans-serif;padding:28px 16px}main{max-width:560px;margin:0 auto;background:white;border:1px solid #e4dfea;border-radius:20px;padding:28px}h1{font-size:24px;color:#672881;margin:0 0 12px}p{font-size:14px;color:#68616e}button{border:0;background:#672881;color:#fff;border-radius:10px;padding:12px 18px;font-size:15px;cursor:pointer}button:disabled{opacity:.55}#qr{display:block;width:256px;max-width:100%;height:auto;margin:18px auto}#qr[hidden]{display:none}.state{background:#f4f0f7;padding:14px;border-radius:10px;white-space:pre-wrap}.small{font-size:12px}a{color:#672881}</style>
<main><h1>连接公众号来源</h1><p>采集器已在本机运行。请用微信扫码，并在手机上确认登录<strong>微信读书</strong>。登录后，我会继续验证南大公众号的新文章。</p><p>登录凭据保存在本机独立的数据目录，网站仅接收公开文章信息。</p><button id="login">生成微信读书登录二维码</button><img id="qr" hidden alt="微信读书登录二维码"><p class="state" id="status" role="status">等待生成二维码</p><p class="small">二维码通常几分钟内过期；若过期，重新点击按钮生成即可。若手机显示的服务不是微信读书，请不要确认。</p></main>
<script>
const button=document.querySelector('#login'),status=document.querySelector('#status'),qr=document.querySelector('#qr');
let polling=null;
async function check(){try{const response=await fetch('/api/auth/status',{cache:'no-store'});const data=await response.json();if(data.logged_in){status.textContent='登录已成功。可以回到聊天告诉我“已扫码”，我会继续接入和验证。';qr.hidden=true;button.hidden=true;if(polling)clearInterval(polling);return true;}const s=data.login_state||{};if(s.message)status.textContent=s.message;if(s.status==='expired'||s.status==='failed'){if(polling)clearInterval(polling);button.disabled=false;}return false;}catch{status.textContent='本机服务暂时未响应，请回到聊天告诉我。';}}
button.addEventListener('click',async()=>{button.disabled=true;status.textContent='正在向微信获取登录二维码…';try{const response=await fetch('/api/auth/qrcode',{method:'POST'});const data=await response.json();if(!response.ok||!data.qrcode_url)throw Error(data.error||'未生成二维码');qr.src=data.qrcode_url;qr.hidden=false;status.textContent='请用微信扫码，并在手机上确认登录微信读书。';button.disabled=false;button.textContent='刷新登录二维码';if(polling)clearInterval(polling);polling=setInterval(check,2500);}catch(error){status.textContent='获取二维码未完成：'+error.message;button.disabled=false;}});
check();
</script></html>'''


@app.get("/nju-setup")
def nju_setup():
    response = Response(SETUP, content_type="text/html; charset=utf-8")
    response.headers["Cache-Control"] = "no-store"
    response.headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://open.weixin.qq.com; frame-ancestors 'none'; base-uri 'none'"
    return response


class LocalOnly:
    def __init__(self, application):
        self.application = application

    def __call__(self, env, start):
        if env.get("HTTP_HOST") != AUTHORITY:
            start("403 Forbidden", [("Content-Type", "text/plain")])
            return [b"Local access only"]
        if env.get("REQUEST_METHOD") not in ("GET", "HEAD", "OPTIONS"):
            cookie = SimpleCookie()
            cookie.load(env.get("HTTP_COOKIE", ""))
            value = cookie.get("nju_collector_session")
            if not value or not secrets.compare_digest(value.value, SESSION):
                start("403 Forbidden", [("Content-Type", "text/plain")])
                return [b"Open the local setup page first"]

        def secure_start(status, headers, exc_info=None):
            headers = [(k, v) for k, v in headers if not k.lower().startswith("access-control-")]
            headers.extend([
                ("Set-Cookie", f"nju_collector_session={SESSION}; Path=/; HttpOnly; SameSite=Strict"),
                ("Referrer-Policy", "no-referrer"),
                ("X-Content-Type-Options", "nosniff"),
            ])
            return start(status, headers, exc_info)

        return self.application(env, secure_start)


class QuietRequestHandler(WSGIRequestHandler):
    def log_request(self, *args, **kwargs):
        pass


app.wsgi_app = LocalOnly(app.wsgi_app)
app.config["MAX_CONTENT_LENGTH"] = 1024 * 1024
server = make_server("127.0.0.1", PORT, app, threaded=True, request_handler=QuietRequestHandler)
print(f"READY http://{AUTHORITY}/nju-setup", flush=True)
server.serve_forever()
