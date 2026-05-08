# 🚀 GitHub Auto-Update Setup Guide

## ✅ Configuration Complete!

Your software is now configured for **automatic updates via GitHub**!

**GitHub Username:** `adi3615gupta-prog`  
**Repository:** `reco-with-vaswani`

---

## 🎯 How It Works

### **The Magic Flow:**

```
You Push Code → GitHub Actions Builds → Creates Release → Users Get Auto-Update
     ↑                                                                  ↓
  Make changes                                                    Notification pops up
  Commit & Push                                                   User clicks "Update"
  Tag with v1.0.0                                                 App restarts with new version!
```

---

## 📋 Step-by-Step Setup

### **Step 1: Create GitHub Repository**

1. Go to https://github.com/new
2. **Repository name:** `reco-with-vaswani`
3. **Visibility:** Public (recommended for auto-updates) or Private
4. **Initialize with:** README (optional)
5. Click **"Create repository"**

---

### **Step 2: Push Your Code**

```bash
# Initialize git (if not already done)
git init

# Add your files
git add .

# Commit
git commit -m "Initial commit with auto-updater"

# Connect to GitHub
git remote add origin https://github.com/adi3615gupta-prog/reco-with-vaswani.git

# Push to main branch
git branch -M main
git push -u origin main
```

---

### **Step 3: Enable GitHub Actions**

1. Go to your repo: `https://github.com/adi3615gupta-prog/reco-with-vaswani`
2. Click **"Actions"** tab
3. Click **"I understand my workflows, go ahead and enable them"**

✅ **Done!** GitHub will now automatically build your app on every push!

---

## 🔄 How to Release Updates

### **Method 1: Automatic (Recommended)**

Every time you push a **tag** starting with `v`, it automatically creates a release:

```bash
# 1. Make your changes
# Edit files, add features, fix bugs...

# 2. Update version in package.json
# Change: "version": "0.0.0" → "version": "0.0.1"

# 3. Commit changes
git add .
git commit -m "Added new feature: XYZ"

# 4. Create a version tag
git tag v0.0.1

# 5. Push to GitHub
git push origin main
git push origin v0.0.1
```

🎉 **That's it!** GitHub Actions will:
- Build the app automatically
- Create a release with the .exe file
- Users will get auto-update notification!

---

### **Method 2: Manual Release**

1. Build locally:
```bash
npm run build:exe
```

2. Go to GitHub → Releases → "Create a new release"

3. Fill in:
   - **Choose a tag:** `v0.0.1` (create new)
   - **Release title:** `Version 0.0.1`
   - **Description:** What changed?

4. Upload files from `dist-electron/`:
   - `RECO WITH VASWANI Setup 0.0.1.exe`
   - `latest.yml` ⚠️ **IMPORTANT!**
   - `RECO WITH VASWANI Setup 0.0.1.exe.blockmap`

5. Click **"Publish release"**

---

## 🆕 Version Numbering

### **When to update version:**

| Change | Version Update | Example |
|--------|---------------|---------|
| Bug fix | Patch `0.0.1` → `0.0.2` | `git tag v0.0.2` |
| New feature | Minor `0.0.2` → `0.1.0` | `git tag v0.1.0` |
| Major changes | Major `0.1.0` → `1.0.0` | `git tag v1.0.0` |

### **Where to update:**
```json
// package.json
{
  "name": "vite_react_shadcn_ts",
  "version": "0.0.1",  // ← CHANGE THIS
  ...
}
```

---

## 👥 What Users See

### **When Update is Available:**
```
┌─────────────────────────────┐
│  🔄 Update Available          │
│                             │
│  A new version is available. │
│  It will be downloaded in    │
│  the background.             │
│                             │
│        [  OK  ]             │
└─────────────────────────────┘
```

### **When Update is Ready:**
```
┌─────────────────────────────┐
│  ✅ Update Ready              │
│                             │
│  Update downloaded. The      │
│  application will restart    │
│  to apply updates.           │
│                             │
│  [Restart Now]  [Later]     │
└─────────────────────────────┘
```

---

## 🔐 Private Repository?

If your repo is **private**, users need a GitHub token to get updates.

### **Solution:**
1. Create a GitHub Personal Access Token (classic)
2. Set token permissions: `repo` scope
3. Distribute token with app (not recommended for security)

**Better approach:** Make repo **public** for auto-updates to work seamlessly.

---

## 🧪 Testing Auto-Update

### **Test the flow:**

1. **Install current version** on your machine
2. **Make a small change** (e.g., change a title)
3. **Update version** in package.json: `0.0.0` → `0.0.1`
4. **Create tag:** `git tag v0.0.1`
5. **Push:** `git push && git push origin v0.0.1`
6. **Wait** for GitHub Actions to finish (2-3 minutes)
7. **Open your installed app** → Should show update notification!

---

## 📊 GitHub Actions Status

Check build status:
1. Go to: `https://github.com/adi3615gupta-prog/reco-with-vaswani/actions`
2. See if workflow is running/green/red
3. Click on a workflow run to see logs

---

## 🆘 Troubleshooting

### **"Update not working"**
```bash
# Check if GitHub repo exists and is public
curl https://github.com/adi3615gupta-prog/reco-with-vaswani

# Verify latest.yml exists in latest release
```

### **"GitHub Actions failing"**
- Check if `package.json` has correct scripts
- Verify all dependencies are in package.json
- Check Actions logs for error details

### **"Users not getting updates"**
- Ensure `latest.yml` is uploaded with .exe
- Check version number actually increased
- Verify GitHub release is "Published" not "Draft"

---

## 🚀 Quick Commands Cheat Sheet

```bash
# Everyday development
git add .
git commit -m "Your message"
git push origin main

# Release new version
# 1. Edit package.json version
# 2. Commit
# 3. Create and push tag
git tag v0.0.1
git push origin v0.0.1

# Delete tag (if needed)
git tag -d v0.0.1
git push --delete origin v0.0.1

# Force push (use with caution!)
git push -f origin main
```

---

## 📁 Files Created for You

| File | Purpose |
|------|---------|
| `.github/workflows/release.yml` | Auto-build on GitHub |
| `main.cjs` | Auto-updater logic |
| `package.json` | Updated with publish config |
| `GITHUB_AUTO_UPDATE_SETUP.md` | This guide |

---

## ✅ Checklist - First Release

- [ ] Create GitHub repo: `reco-with-vaswani`
- [ ] Push code to GitHub
- [ ] Enable GitHub Actions
- [ ] Update version to `0.0.1` in package.json
- [ ] Commit changes
- [ ] Create tag: `git tag v0.0.1`
- [ ] Push tag: `git push origin v0.0.1`
- [ ] Wait for GitHub Actions to complete
- [ ] Check Release is created
- [ ] Test installed app shows update

---

## 🎯 Next Steps

1. **Create GitHub repository** (if not exists)
2. **Push this code** to GitHub
3. **Create first release** with `git tag v0.0.1`
4. **Distribute** the initial .exe to users
5. **Future updates:** Just push tags, users auto-update!

**Questions?** The auto-updater will start working as soon as you create your first GitHub release! 🎉
