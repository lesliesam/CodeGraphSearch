
const { S3Client, PutObjectCommand, ListObjectsV2Command, GetObjectCommand } = require('@aws-sdk/client-s3');
const path = require('path');
const fs = require('fs');

const s3Client = new S3Client();

const CODE_SOURCE_BUCKET_PREFIX = 'code_source';
const CODE_PROCRESS_BUCKET_PREFIX = 'code_process';


async function uploadFolderToS3(bucketName, folderPath, bucketPrefix = '') {
    const files = fs.readdirSync(folderPath);

    for (const file of files) {
        const filePath = path.join(folderPath, file);
        const stats = fs.statSync(filePath);

        if (stats.isDirectory()) {
            await uploadFolderToS3(bucketName, filePath, path.join(bucketPrefix, file));
        } else {
            const fileStream = fs.createReadStream(filePath);
            const key = path.join(bucketPrefix, file);

            const uploadParams = {
                Bucket: bucketName,
                Body: fileStream,
                Key: key,
            };

            try {
                const data = await s3Client.send(new PutObjectCommand(uploadParams));
                console.log(`File uploaded successfully. ${file}`);
            } catch (err) {
                console.log('Error', err);
            }
        }
    }
}

async function downloadS3Files(bucketName, folderPath, localPath) {
    const listParams = {
        Bucket: bucketName,
        Prefix: folderPath,
    };

    const listObjectsCommand = new ListObjectsV2Command(listParams);
    const listResponse = await s3Client.send(listObjectsCommand);

    if (!listResponse.Contents) {
        console.log(`No objects found in ${bucketName}/${folderPath}`);
        return;
    }

    for (const object of listResponse.Contents) {
        const objectKey = object.Key;
        const downloadPath = path.join(localPath, objectKey.replace(folderPath, ""));

        const getObjectParams = {
            Bucket: bucketName,
            Key: objectKey,
        };

        const getObjectCommand = new GetObjectCommand(getObjectParams);
        const response = await s3Client.send(getObjectCommand);

        fs.mkdirSync(path.dirname(downloadPath), { recursive: true });
        const fileStream = fs.createWriteStream(downloadPath);
        response.Body.pipe(fileStream);
    }
}

module.exports = {
    uploadFolderToS3,
    downloadS3Files,
    CODE_SOURCE_BUCKET_PREFIX,
    CODE_PROCRESS_BUCKET_PREFIX
};
