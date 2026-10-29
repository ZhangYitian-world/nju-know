"""Run the collector in CI, keeping all login state out of public artifacts."""
import json
import os
import subprocess
import sys
import shutil
import time
from datetime import datetime
from pathlib import Path

BASE = Path(__file__).resolve().parent
COLLECTOR = BASE / ".local/wechat-collector"
AUTH_CACHE = BASE / ".local/wechat-auth.enc"


def cipher(key):
    from cryptography.fernet import Fernet
    return Fernet(key.encode())


def restore_auth(bundle, cache):
    from cryptography.fernet import InvalidToken
    initial = bundle["accounts"]
    if not isinstance(initial, list) or not initial:
        raise ValueError("Missing account seed")
    if cache.exists():
        try:
            value = json.loads(cipher(bundle["key"]).decrypt(cache.read_bytes()))
            if isinstance(value, list) and value:
                print("加密授权缓存已验证并恢复。", flush=True)
                return value
        except (InvalidToken, ValueError, TypeError):
            # A new authorised seed/key safely supersedes an older cache.
            pass
    return initial


def save_auth(bundle, accounts, cache):
    from upload_wechat_auth import AUTH_FIELDS
    fields = AUTH_FIELDS | {"cooldown_until", "failures", "last_used"}
    minimal = [{k: v for k, v in account.items() if k in fields} for account in accounts]
    encrypted = cipher(bundle["key"]).encrypt(json.dumps(minimal, ensure_ascii=False).encode())
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_bytes(encrypted)
    cache.chmod(0o600)


def mask_values(bundle, accounts):
    if os.environ.get("GITHUB_ACTIONS") != "true":
        return
    values = [bundle["key"]]
    values.extend(value for account in accounts for value in account.values() if isinstance(value, str) and len(value) >= 8)
    for value in values:
        value = value.replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")
        print(f"::add-mask::{value}", flush=True)


def main():
    os.umask(0o077)
    raw = os.environ.get("WECHAT_CLOUD_AUTH", "")
    if not raw:
        print("未配置云端微信读书授权，保留已有公众号数据。")
        return
    try:
        bundle = json.loads(raw)
        accounts = restore_auth(bundle, AUTH_CACHE)
        mask_values(bundle, accounts)
    except Exception as error:
        print(f"云端授权准备未完成（{type(error).__name__}），保留已有公众号数据。")
        return
    auth_file = COLLECTOR / "data/account_pool.json"
    auth_file.parent.mkdir(parents=True, exist_ok=True)
    auth_file.write_text(json.dumps(accounts, ensure_ascii=False))
    auth_file.chmod(0o600)
    print("云端授权已准备，开始抓取公开文章元数据。", flush=True)
    started = time.time()
    try:
        env = {k: v for k, v in os.environ.items() if k not in ("WECHAT_CLOUD_AUTH", "GITHUB_TOKEN", "GH_TOKEN")}
        env["WECHAT_COLLECTOR_ROOT"] = str(COLLECTOR)
        # Upstream logs are not public. Only our sanitised status is printed.
        result = subprocess.run([sys.executable, str(BASE / "collect_wechat_local.py")], cwd=BASE,
                                env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=480)
        if result.returncode:
            print("云端采集未正常结束，保留上次可用数据。")
        else:
            path = BASE / "data/wechat_source_status.json"
            states = json.loads(path.read_text()) if path.exists() else []
            fresh = states and all(datetime.fromisoformat(s["checked_at"]).timestamp() >= started - 2 for s in states)
            if fresh:
                print(f"云端公众号检查完成：{len(states)} 个来源，{sum(s.get('status') == 'ok' for s in states)} 个正常。")
            else:
                print("云端采集未刷新来源状态，继续使用已有数据。")
    except Exception as error:
        print(f"云端采集未完成（{type(error).__name__}），保留上次可用数据。")
    finally:
        # Persist only authenticated ciphertext; never cache this directory.
        try:
            updated = json.loads(auth_file.read_text())
            save_auth(bundle, updated, AUTH_CACHE)
            print("授权状态已加密保存；公开缓存和网站中不包含登录凭据。")
        except Exception as error:
            print(f"授权状态缓存未更新（{type(error).__name__}）。")
        shutil.rmtree(COLLECTOR / "data", ignore_errors=True)


if __name__ == "__main__":
    main()
