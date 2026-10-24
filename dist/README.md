# Static Website - yes

This repository contains a static website you can publish with GitHub Pages.

Quick setup (Windows PowerShell):

```powershell
# 1) Install Git: https://git-scm.com/download/win
git --version

# 2) From the project folder
cd "c:\Users\aswin\Documents\Codex\2026-05-21\https-www-ey-com-en-in"
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/aswinofficial2254-oss/yes.git
git push -u origin main
```

Enable GitHub Pages:

- Open your repository on GitHub: https://github.com/aswinofficial2254-oss/yes
- Go to Settings -> Pages, set Source to `main` branch and root `/`, then Save.

Public URL (after Pages is enabled):

- `https://aswinofficial2254-oss.github.io/yes/`

Troubleshooting:

- If `git` is not found, install Git and reopen PowerShell.
- If the push fails due to an existing remote, run:

```powershell
git remote remove origin
git remote add origin https://github.com/aswinofficial2254-oss/yes.git
git push -u origin main
```

If you'd like, I can also add a GitHub Actions workflow to auto-deploy the site — tell me and I'll add it.
