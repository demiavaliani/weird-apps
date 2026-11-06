#!/usr/bin/env python3
"""Build the public site into an output folder.

Only real site files are published, so the backlog stays private on the site:
  - SITE_FILES (the launcher and friends)
  - apps.json, reduced to released apps
  - the folders of released apps (NN-slug/)

Released means status "live". With --preview, apps that are "in-review" count as
released too, and are shown as "live", so a PR preview looks like the site will
after merging.

Usage: build-site.py <out-dir> [--preview]
"""

import json
import shutil
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]

# Root files that belong on the site. Add here if the launcher ever needs more.
SITE_FILES = ["index.html", ".nojekyll"]

# Fields the launcher needs; anything else stays out of the public apps.json.
PUBLIC_FIELDS = ["id", "slug", "name", "idea", "status"]


def main() -> int:
    args = sys.argv[1:]
    preview = "--preview" in args
    positional = [a for a in args if not a.startswith("--")]
    if len(positional) != 1:
        print(__doc__, file=sys.stderr)
        return 2

    out = Path(positional[0]).resolve()
    if out == REPO_ROOT or REPO_ROOT.is_relative_to(out):
        print(f"Refusing to build into {out}", file=sys.stderr)
        return 2
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)

    released_statuses = {"live", "in-review"} if preview else {"live"}
    apps = json.loads((REPO_ROOT / "apps.json").read_text(encoding="utf-8"))

    public_apps = []
    for app in apps:
        if app.get("status") not in released_statuses:
            continue
        folder = f"{app['id']}-{app['slug']}"
        source = REPO_ROOT / folder
        if not (source / "index.html").is_file():
            print(f"Released app {folder} has no {folder}/index.html", file=sys.stderr)
            return 1
        shutil.copytree(source, out / folder)
        entry = {key: app[key] for key in PUBLIC_FIELDS if key in app}
        entry["status"] = "live"
        public_apps.append(entry)

    for name in SITE_FILES:
        # The site-wide .nojekyll at the gh-pages root already covers previews,
        # and a copy inside a preview would be left behind when it's removed.
        if preview and name == ".nojekyll":
            continue
        if (REPO_ROOT / name).exists():
            shutil.copy2(REPO_ROOT / name, out / name)

    (out / "apps.json").write_text(json.dumps(public_apps, indent=2) + "\n", encoding="utf-8")

    released = ", ".join(a["slug"] for a in public_apps) or "none"
    print(f"Built {'preview' if preview else 'site'} in {out} (released apps: {released})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
