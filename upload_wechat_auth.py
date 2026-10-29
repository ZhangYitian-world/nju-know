"""Explicitly upload the minimum authorised account seed to GitHub Secrets."""
import argparse
import json
import subprocess
from pathlib import Path

from cryptography.fernet import Fernet

BASE = Path(__file__).resolve().parent
AUTH_FIELDS = {
    "id", "vid", "token", "accessToken", "refreshToken", "skey", "cookie_str",
    "deviceId", "deviceName", "installId", "userAgent", "save_time", "status",
}


def prepare_bundle(accounts):
    if not isinstance(accounts, list):
        raise ValueError("Unexpected account store")
    clean = [{k: v for k, v in account.items() if k in AUTH_FIELDS}
             for account in accounts if isinstance(account, dict) and (account.get("token") or account.get("accessToken"))]
    if not clean:
        raise ValueError("No authorised accounts")
    return {"version": 1, "key": Fernet.generate_key().decode(), "accounts": clean}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", default="ZhangYitian-world/nju-know")
    parser.add_argument("--upload", action="store_true", help="Explicitly authorise transmission to the named GitHub repository Secret")
    args = parser.parse_args()
    if not args.upload:
        print(f"未上传。添加 --upload 才会将微信读书登录凭据保存到 {args.repo} 的 WECHAT_CLOUD_AUTH Secret。")
        return
    try:
        path = BASE / ".local/wechat-collector/data/account_pool.json"
        bundle = prepare_bundle(json.loads(path.read_text()))
        result = subprocess.run(["gh", "secret", "set", "WECHAT_CLOUD_AUTH", "--repo", args.repo],
                                input=json.dumps(bundle, ensure_ascii=False), text=True,
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=45)
        if result.returncode:
            raise RuntimeError("GitHub secret update failed")
        print(f"WECHAT_CLOUD_AUTH 已保存到 {args.repo}；没有打印凭据或写入公开文件。")
    except Exception as error:
        print(f"授权上传未完成（{type(error).__name__}），未输出私密值。")
        raise SystemExit(1)


if __name__ == "__main__":
    main()
