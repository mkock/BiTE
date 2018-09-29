/*******************************************************************************
 * This file is part of the BiTE package.
*******************************************************************************/

/* jshint node: true */
'use strict';

// Load dependencies.
var _ = require('underscore');
var debug = require('debug')('bite:imgcache');
var util = require('util');
var request = require('request');
var fs = require('fs');
var s3 = require('s3');
var findRemove = require('find-remove');
var config = require('./../core/config');

// Establish connection to S3 bucket.
var client = s3.createClient({
    'maxAsyncS3': config.s3.maxAsyncS3,
    's3RetryCount': config.s3.s3RetryCount,
    's3RetryDelay': config.s3.s3RetryDelay,
    'multipartUploadThreshold': config.s3.multipartUploadThreshold,
    'multipartUploadSize': config.s3.multipartUploadSize,
    's3Options': {
        'accessKeyId': config.s3.key,
        'secretAccessKey': config.s3.secret,
        'region': config.s3.region
    }
});

// Utility function that extracts the filename from a URL or FS path.
// Note; if the URL doesn't end with a filename extension, the extracted
// filename will not contain one either.
var getFilePart = function(path) {
    var localPath = path.replace(/\/$/g, '');
    return localPath.substring(localPath.lastIndexOf('/') + 1);
};

// Function that cleans up files in the download directory when they are
// older than a preconfigured delta. It should not be called too frequently,
// even with the time check.
module.exports.cleanDownloadDir = function() {
    var cleanConfig = {
        'extensions': ['.jpg', '.png', '.gif'],
        'age': {
            'seconds': config.files.ageDelta
        },
        'maxLevel': 1
    };
    // This is the call that actually does the cleanup.
    findRemove(config.files.tmpDir, cleanConfig);
};

// Function that ensures that the download directory exists.
module.exports.ensureDownloadDir = function(nextFunc) {
    fs.exists(config.files.tmpDir, function(doExists) {
        if (!doExists) {
            fs.mkdir(config.files.tmpDir);
        }
    });
    return nextFunc();
};

// Function that fetches a file from a URL and uploads it to S3.
module.exports.uploadExternal = function(params, nextFunc) {
    var url = params.url,
        uploadPath = params.uploadPath,
        fileName = params.fileName;
    // Download the file.
    module.exports.downloadExternal(url, function(error, filePath) {
        module.exports.uploadFile({
            'filePath': filePath,
            'uploadPath': uploadPath,
            'fileName': fileName
        }, function(error, s3File) {
            if (error) {
                console.log(error);
            }
            return nextFunc(null, s3File);
        });
    });
};

// Function that uploads a single file to the bucket. It triggers the callback
// immediately without waiting for the transfer to complete.
// Note; how do we handle failed uploads?
module.exports.uploadFile = function(options, nextFunc) {
    var filePath = options.filePath,
        uploadPath = options.uploadPath,
        rewriteFileName = (options.fileName ? (options.fileName + '.' + filePath.match(/[0-9a-zA-Z]+$/)) : null),
        fileName = rewriteFileName || getFilePart(filePath).replace(/^\d+\-/, ''),  // Remove timestamp.
        key = uploadPath + '/' + fileName,
        params = {
            'localFile': filePath,
            's3Params': {
                'Bucket': config.s3.bucket,
                'Key': key
            }
        };
    var uploader = client.uploadFile(params);
    uploader.on('error', function(error) {
        console.log('error upload');
    });
    uploader.on('end', function() {
        debug(util.format(
            'Uploaded "%s" to AWS S3 as "%s"',
            getFilePart(fileName),
            key
        ));
    });
    return nextFunc(
        null, s3.getPublicUrl(config.s3.bucket, key, config.s3.region)
    );
};

// Function that downloads the file found at the given URL to a temporary
// location, and provides the full path and filename to that location.
// Note: We've seen indications that there might be issues with filenames when
// uploading to S3.
module.exports.downloadExternal = function(url, nextFunc) {
    var name = getFilePart(url),
        path = config.files.tmpDir + (new Date()).getTime() + '-' + name;
    // Note: The path adds a timestamp as a hash, which is needed for properly
    // working with files with the same name.
    request(url).pipe(fs.createWriteStream(path)).on('close', function() {
        return nextFunc(null, path);
    });
};

// Function that returns an uploading path on Amazon S3.
module.exports.getUploadPath = function(type, pathId, mediatype) {
    return ['images', type, pathId, mediatype].join('/');
};
