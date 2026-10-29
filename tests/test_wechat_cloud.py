import importlib.util
import json
import tempfile
import unittest
import io
from contextlib import redirect_stdout
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from collect_wechat_cloud import restore_auth, save_auth


@unittest.skipUnless(importlib.util.find_spec("cryptography"), "Optional cloud crypto runtime")
class CloudAuthTests(unittest.TestCase):
    def bundle(self):
        from cryptography.fernet import Fernet
        return {"key": Fernet.generate_key().decode(), "accounts": [{"token": "synthetic-test-account-token"}]}

    def test_encrypted_cache_preserves_updates_without_plaintext(self):
        with tempfile.TemporaryDirectory() as d:
            bundle = self.bundle()
            path = Path(d) / "auth.enc"
            updated = [{"token": "synthetic-refreshed-account-token"}]
            save_auth(bundle, [{**updated[0], "nickname": "irrelevant profile", "avatar": "irrelevant avatar"}], path)
            self.assertNotIn(b"synthetic-refreshed", path.read_bytes())
            self.assertEqual(restore_auth(bundle, path), updated)

    def test_new_key_supersedes_old_cache_and_tampering_is_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            old, new = self.bundle(), self.bundle()
            path = Path(d) / "auth.enc"
            save_auth(old, [{"token": "old"}], path)
            self.assertEqual(restore_auth(new, path), new["accounts"])
            path.write_bytes(path.read_bytes()[:-3] + b"bad")
            self.assertEqual(restore_auth(old, path), old["accounts"])

    def test_absent_cache_uses_only_the_authorised_seed(self):
        with tempfile.TemporaryDirectory() as d:
            bundle = self.bundle()
            self.assertEqual(restore_auth(bundle, Path(d) / "missing"), bundle["accounts"])

    def test_seed_excludes_profile_and_unrelated_fields(self):
        from upload_wechat_auth import prepare_bundle
        result = prepare_bundle([{"id": "test", "token": "synthetic-token", "nickname": "private profile", "avatar": "private avatar", "unrelated": "must not transfer"}])
        self.assertEqual(result["accounts"], [{"id": "test", "token": "synthetic-token"}])
        with self.assertRaises(ValueError):
            prepare_bundle([])

    def test_stale_status_is_not_reported_as_a_successful_cloud_fetch(self):
        import collect_wechat_cloud as cloud
        with tempfile.TemporaryDirectory() as folder:
            base = Path(folder)
            (base / "data").mkdir()
            (base / "data/wechat_source_status.json").write_text(json.dumps([{"name": "fixture", "status": "ok", "checked_at": "2000-01-01T00:00:00+08:00"}]))
            out = io.StringIO()
            with patch.multiple(cloud, BASE=base, COLLECTOR=base / ".local/collector", AUTH_CACHE=base / ".local/auth.enc"), patch.dict(cloud.os.environ, {"WECHAT_CLOUD_AUTH": json.dumps(self.bundle()), "GITHUB_ACTIONS": "false"}), patch.object(cloud.subprocess, "run", return_value=SimpleNamespace(returncode=0)), redirect_stdout(out):
                cloud.main()
            self.assertIn("未刷新来源状态", out.getvalue())
            self.assertNotIn("检查完成", out.getvalue())
            self.assertFalse((base / ".local/collector/data").exists())

    def test_fresh_run_summary_accepts_honest_older_resumed_source_times(self):
        import collect_wechat_cloud as cloud
        from datetime import datetime, timezone
        with tempfile.TemporaryDirectory() as folder:
            base = Path(folder)
            (base / "data").mkdir()
            (base / "data/wechat_source_status.json").write_text(json.dumps([{"name": "fixture", "status": "ok", "checked_at": "2000-01-01T00:00:00+08:00", "resumed": True}]))
            def run(*_args, **_kwargs):
                (base / "data/wechat_run_status.json").write_text(json.dumps({"checked_at": datetime.now(timezone.utc).isoformat(), "status": "ok", "resumed_sources": 1}))
                return SimpleNamespace(returncode=0)
            out = io.StringIO()
            with patch.multiple(cloud, BASE=base, COLLECTOR=base / ".local/collector", AUTH_CACHE=base / ".local/auth.enc"), patch.dict(cloud.os.environ, {"WECHAT_CLOUD_AUTH": json.dumps(self.bundle()), "GITHUB_ACTIONS": "false"}), patch.object(cloud.subprocess, "run", side_effect=run), redirect_stdout(out):
                cloud.main()
            self.assertIn("检查完成", out.getvalue())
            self.assertIn("已成功来源 1", out.getvalue())
            self.assertFalse((base / ".local/collector/data").exists())

    def test_missing_cloud_secret_records_setup_problem_without_expiry_claim(self):
        import collect_wechat_cloud as cloud
        with tempfile.TemporaryDirectory() as folder:
            base = Path(folder)
            with patch.object(cloud, "BASE", base), patch.dict(cloud.os.environ, {"WECHAT_CLOUD_AUTH": ""}), redirect_stdout(io.StringIO()):
                cloud.main()
            health = json.loads((base / "data/wechat_run_status.json").read_text())
            self.assertEqual(health["status"], "auth_missing")
