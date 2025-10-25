const { exec } = require("child_process");
const fs = require('fs');
var admin = require("firebase-admin");

var serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const date = new Date().toLocaleDateString().replace(/\//g, '-');



const BACKUP_DIR = process.env.BACKUP_PATH || `./.mongodump`;
const BACKUP_PATH = `${BACKUP_DIR}/.mongodump-${date}`;
const BACKUP_ARCHIVE_PATH = `${BACKUP_PATH}.tar.gz`;

const TYPE = process.env.TYPE;
const DB_URL = process.env.DB_URL

const BACKUP_URL = `mongodump --uri=${DB_URL} --out=${BACKUP_PATH}`;

if (!TYPE) {
    console.error('TYPE is required in env (backup/restore)');
    process.exit(0);
} else if (TYPE !== 'backup' && TYPE !== 'restore') {
    console.error('TYPE should be backup or restore');
    process.exit(0);
} else if (!DB_URL) {
    console.error('DB_URL is required in env to connect to database');
    process.exit(0);
}

console.log("Process Started");



(async () => {

    if (TYPE === 'restore') {
        console.log("Restore Started");
        const latestBackup = await admin.storage().bucket("mongodump-d46ba.appspot.com").getFiles({
            prefix: 'backups/',
            delimiter: '/'
        }).then((data) => {
            data[0].sort((a, b) => {
                const dateA = new Date(a.name.split('/')[1].split('.')[0]);
                const dateB = new Date(b.name.split('/')[1].split('.')[0]);
                return dateB.getTime() - dateA.getTime();
            });
            return data[0].pop();
        });

        if (!latestBackup) {
            console.error('No backups found');
            process.exit(0);
        }
        console.log("Latest Backup:", latestBackup.name);


        const backupFolderName = `.mongodump-${latestBackup.name.replace('backups/', '').replace('.tar.gz', '')}`;
        const backupArchiveName = `${backupFolderName}.tar.gz`;

        console.log("Downloading Backup", backupArchiveName);
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
        await latestBackup.download({ destination: `${BACKUP_DIR}/${backupArchiveName}` });

        console.log("Extracting Backup", `${BACKUP_DIR} / ${backupArchiveName}`);
        exec(`tar -xzvf ${BACKUP_DIR}/${backupArchiveName} -C ./`, (error, stdout, stderr) => {
            if (error) {
                console.error("Extract Error:", error);
            }
            if (stderr) {
                console.error("Extract Error:", stderr);
            }
            console.log("Extract Done");
            console.log("Restoring Backup");
            exec(`mongorestore --uri=${DB_URL} --drop ${BACKUP_DIR}/${backupFolderName}`, (error, stdout, stderr) => {
                if (error) {
                    console.error("Restore Error:", error);
                }
                if (stderr) {
                    console.error("Restore Error:", stderr);
                }
                console.log("Restore Done");
                fs.rmdirSync(BACKUP_DIR, { recursive: true });
            });
        });
    } else {
        console.log("Backup Started");
        exec(BACKUP_URL, (error, stdout, stderr) => {
            if (error) {
                console.error("Backup Error:", error);
            }
            if (stderr) {
                console.error("Backup Error:", stderr);
            }
            console.log("Backup Done");

            console.log("Archiving Backup");
            exec(`tar -czvf ${BACKUP_ARCHIVE_PATH} ${BACKUP_PATH}`, (error, stdout, stderr) => {
                if (error) {
                    console.error("Archive Error:", error);
                }
                if (stderr) {
                    console.error("Archive Error:", stderr);
                }
                console.log("Archive Done");
                console.log("Uploading to storage");

                const bucket = admin.storage().bucket("mongodump-d46ba.appspot.com");

                bucket.upload(BACKUP_ARCHIVE_PATH, {
                    destination: `backups/${date}.tar.gz`,
                })
                    .then((file) => {
                        console.log(`File uploaded successfully: ${file[0].name}`);
                        fs.rmdirSync(BACKUP_DIR, { recursive: true });
                    })
                    .catch((error) => {
                        console.error('Error uploading file:', error);
                    });


            });


        });
    }
})();
