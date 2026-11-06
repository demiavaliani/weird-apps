#!/usr/bin/env python3
"""Build the public site into an output folder.

Only real site files are published, so the backlog stays private on the site:
  - SITE_FILES (the launcher and friends)
  - the folders of published apps (NN-slug/)
  - apps.json, reduced to listed apps

Published: "deployed" apps (reachable at their URL so they can be checked, but not
listed in the launcher) and "live" apps (listed). With --preview, "in-review" apps
are published and listed too, so a PR preview shows the app in the launcher.

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

    published_statuses = {"deployed", "live"}
    listed_statuses = {"live"}
    if preview:
        published_statuses.add("in-review")
        listed_statuses.add("in-review")
    apps = json.loads((REPO_ROOT / "apps.json").read_text(encoding="utf-8"))

    public_apps = []
    for app in apps:
        status = app.get("status")
        if status not in published_statuses:
            continue
        folder = f"{app['id']}-{app['slug']}"
        source = REPO_ROOT / folder
        if not (source / "index.html").is_file():
            print(f"Published app {folder} has no {folder}/index.html", file=sys.stderr)
            return 1
        shutil.copytree(source, out / folder)
        if status not in listed_statuses:
            continue
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

    published = sorted(p.name for p in out.iterdir() if p.is_dir())
    listed = ", ".join(a["slug"] for a in public_apps) or "none"
    print(f"Built {'preview' if preview else 'site'} in {out} "
          f"(published: {', '.join(published) or 'none'}; listed: {listed})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
