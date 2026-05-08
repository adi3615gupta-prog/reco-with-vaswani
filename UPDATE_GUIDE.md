# 📦 Software Update Guide - RECO WITH VASWANI

## ✅ Auto-Updater is Now Configured!

Your application now has **automatic update capability** built-in!

---

## 🔄 How Updates Work

### **For Users (End Users):**
1. Open the application
2. Auto-updater checks for updates automatically (after 3 seconds)
3. If update found → downloads in background
4. When ready → prompts user to restart
5. User clicks "Restart Now" → app updates and relaunches

### **For You (Developer):**

#### **Option 1: Manual Method (Current)**
```bash
# 1. Make your code changes
# 2. Update version in package.json (e.g., 0.0.0 → 0.0.1)
# 3. Rebuild
npm run build:exe

# 4. Distribute the new .exe file to users
# Located at: dist-electron/RECO WITH VASWANI Setup 0.0.1.exe
```

#### **Option 2: GitHub Auto-Update (Recommended)**

**Step 1: Update Version**
```json
// In package.json
"version": "0.0.1"  // Increment this
```

**Step 2: Set up GitHub Repository**
```json
// In package.json "build" section, update:
"publish": {
  "provider": "github",
  "owner": "YOUR_GITHUB_USERNAME",  // ← Replace this
  "repo": "reco-with-vaswani",
  "releaseType": "release"
}
```

**Step 3: Build and Publish**
```bash
# Build
npm run build:exe

# This creates:
# - dist-electron/RECO WITH VASWANI Setup 0.0.1.exe
# - dist-electron/latest.yml (update metadata)

# Upload both files to GitHub Releases
```

**Step 4: Create GitHub Release**
1. Go to your GitHub repo → Releases → "Create new release"
2. Tag: `v0.0.1`
3. Title: `Version 0.0.1`
4. Upload files:
   - `RECO WITH VASWANI Setup 0.0.1.exe`
   - `latest.yml`
5. Publish release

**✅ Done!** All existing users will automatically get the update notification!

---

## 📋 Quick Update Checklist

| Step | Action | File/Command |
|------|--------|-------------|
| 1 | Update version | `package.json` → `"version"` |
| 2 | Make code changes | Edit source files |
| 3 | Build | `npm run build:exe` |
| 4 | Test | Install and run new .exe |
| 5 | Distribute | Share .exe or publish to GitHub |

---

## 🎯 Version Numbering Guide

```
Format: MAJOR.MINOR.PATCH

Example: 0.1.2
         │ │ │
         │ │ └── Small fixes, patches
         │ └──── New features, improvements
         └────── Major changes, breaking updates
```

**Examples:**
- `0.0.0` → `0.0.1` : Bug fix
- `0.0.1` → `0.1.0` : New feature added
- `0.1.0` → `1.0.0` : Major release

---

## 🚀 Combining Multiple Repositories

To merge another repository into this one:

### **Method 1: Copy Files**
```bash
# Copy the second project's src folder
# Merge into current src/structure
# Update imports and routing
```

### **Method 2: Module Integration**
1. Create `src/modules/` folder
2. Place each app in its own folder:
   ```
   src/
   ├── modules/
   │   ├── gst-reconciliation/     # Current app
   │   └── other-module/           # New app
   ├── components/                 # Shared components
   └── pages/
       └── Dashboard.tsx           # App selector
   ```

3. Add navigation menu in sidebar
4. Route between modules

**Want me to help integrate another repository?** 
Just provide:
- Path/URL of the second repository
- What it does
- How you want them combined (tabs/sidebar/integrated)

---

## 🆘 Troubleshooting

### "Update not working"
- Check GitHub repo settings (make it public)
- Verify `owner` field in package.json
- Ensure `latest.yml` is uploaded with .exe

### "Build fails"
```bash
# Clean and rebuild
rm -rf dist dist-electron node_modules
npm install
npm run build:exe
```

### "Changes not showing"
- Clear browser cache in app (Ctrl+F5)
- Check if correct .exe was installed
- Verify version number increased

---

## 📞 Need Help?

**To update now:**
1. Close running app (Task Manager)
2. Run: `npm run build:exe`
3. Install new .exe from `dist-electron/`

**To add another repository:**
Tell me the repository details and I'll integrate it!

**Files Modified:**
- ✅ `main.cjs` - Added auto-updater
- ✅ `package.json` - Added dependencies & publish config
- ✅ New `UPDATE_GUIDE.md` - This file
