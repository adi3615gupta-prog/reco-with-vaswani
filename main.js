const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { google } = require('googleapis');

// Configuration
const DB_PATH = path.join(app.getPath('userData'), 'reco_vaswani.sqlite');
const LOCAL_BACKUP_DIR = 'C:\\Backups\\RecoWithVaswani';
const GOOGLE_DRIVE_FOLDER_ID = '15fiqRwHDbUH3iIc2aXyDyyXAyH1yzPgW'; // Get this from your G-Drive URL

// Initialize Google Drive API (Requires a Service Account credentials.json file)
const auth = new google.auth.GoogleAuth({
  keyFile: path.join(__dirname, 'credentials.json'), // Path to your Google Cloud credentials
  scopes: ['https://www.googleapis.com/auth/drive.file'],
});
const drive = google.drive({ version: 'v3', auth });

let lastDbModTime = 0;

// Setup background CRON Job to scan every 5 seconds
cron.schedule('*/5 * * * * *', async () => {

  // 1. CREATE LOCAL BACKUP
  if (!fs.existsSync(LOCAL_BACKUP_DIR)){
    fs.mkdirSync(LOCAL_BACKUP_DIR, { recursive: true });
  }

  if (fs.existsSync(DB_PATH)) {
    const stats = fs.statSync(DB_PATH);
    // Only backup if the database has been modified since the last check
    if (stats.mtimeMs <= lastDbModTime) return; // Skip if no usage/changes

    lastDbModTime = stats.mtimeMs;
    console.log('Database activity detected! Initiating 5-second interval backup...');

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `reco_backup_${timestamp}.sqlite`;
    const localBackupPath = path.join(LOCAL_BACKUP_DIR, fileName);
    
    // Copy the database to the secure local folder
    fs.copyFileSync(DB_PATH, localBackupPath);
    console.log(`Local Backup Successful! Saved to ${localBackupPath}`);

    // 2. UPLOAD TO GOOGLE DRIVE
    try {
      console.log('Uploading backup to Google Drive...');
      const fileMetadata = {
        name: fileName,
        parents: [GOOGLE_DRIVE_FOLDER_ID]
      };
      const media = {
        mimeType: 'application/x-sqlite3',
        body: fs.createReadStream(localBackupPath)
      };

      const response = await drive.files.create({
        resource: fileMetadata,
        media: media,
        fields: 'id'
      });

      console.log(`Google Drive Upload Successful! File ID: ${response.data.id}`);
    } catch (error) {
      console.error('Google Drive Upload Failed:', error.message);
    }

  } else {
  }
});
