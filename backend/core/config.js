/*******************************************************************************
 * This file is part of the BiTE package.
*******************************************************************************/

/* jshint node: true */
'use strict';

var errors = [], warnings = [];

// APP_PORT - the port that this node app listens on (optional).
if (process.env.APP_PORT === undefined) {
    warnings.push('Environment variable APP_PORT missing - using default');
}
// MONGODB_DB - name of the MongoDB database.
if (process.env.MONGODB_DB === undefined) {
    errors.push('Environment variable MONGODB_DB missing');
}
// MONGODB_HOST - hostname/IP address of server running MongoDB.
if (process.env.MONGODB_HOST === undefined) {
    warnings.push('Environment variable MONGODB_HOST missing - using default');
}
// MONGODB_PORT - port number that MongoDB is listening on (optional).
// But only complain when we don't seem to be using replica sets.
if (process.env.MONGODB_REPLSET !== undefined && process.env.MONGODB_PORT === undefined) {
    warnings.push('Environment variable MONGODB_PORT missing - using default');
}
// MONGODB_REPLSET - replication set that MongoDB is a member of (optional).
if (process.env.MONGODB_REPLSET === undefined) {
    warnings.push('Environment variable MONGODB_REPLSET missing - assuming no replication set');
}
// MONGODB_USER - username for authenticating against MongoDB (optional).
if (process.env.MONGODB_USER === undefined) {
    warnings.push('Environment variable MONGODB_USER missing - assuming no login required');
}
// MONGODB_PASS - password for authenticating against MongoDB (optional).
if (process.env.MONGODB_PASS === undefined) {
    warnings.push('Environment variable MONGODB_PASS missing - assuming no login required');
}
// BOND_API_URL.
if (process.env.BOND_API_URL === undefined) {
    errors.push('Environment variable BOND_API_URL missing');
}
// MECOM_API_URL.
if (process.env.MECOM_API_URL === undefined) {
    errors.push('Environment variable MECOM_API_URL missing');
}
// REDIS_HOST (optional).
if (process.env.REDIS_HOST === undefined) {
    warnings.push('Environment variable REDIS_HOST missing - using default');
}
// REDIS_PORT (optional).
if (process.env.REDIS_PORT === undefined) {
    warnings.push('Environment variable REDIS_PORT missing - using default');
}
// SERVEDBY (optional).
if (process.env.SERVEDBY === undefined) {
    warnings.push('Environment variable SERVEDBY missing - using default');
}
// AWS S3 - access key.
if (process.env.AWS_S3_ACCESS_KEY === undefined) {
    errors.push('Environment variable AWS_S3_ACCESS_KEY missing');
}
// AWS S3 - access key secret.
if (process.env.AWS_S3_ACCESS_SECRET === undefined) {
    errors.push('Environment variable AWS_S3_ACCESS_SECRET missing');
}
// AWS S3 - region (optional).
if (process.env.AWS_S3_REGION === undefined) {
    warnings.push('Environment variable AWS_S3_REGION missing - using default');
}
// AWS S3 - bucket name.
if (process.env.AWS_S3_BUCKET === undefined) {
    errors.push('Environment variable AWS_S3_BUCKET missing');
}
// CLOUDINARY_NAME
if (process.env.CLOUDINARY_NAME === undefined) {
    errors.push('Environment variable CLOUDINARY_NAME missing');
}
// CLOUDINARY_API_KEY
if (process.env.CLOUDINARY_API_KEY === undefined) {
    errors.push('Environment variable CLOUDINARY_API_KEY missing');
}
// CLOUDINARY_API_SECRET
if (process.env.CLOUDINARY_API_SECRET === undefined) {
    errors.push('Environment variable CLOUDINARY_API_SECRET missing');
}
// Facebook APP ID to be used when sharing articles. See opengraph.
if (process.env.FACEBOOK_APP_ID === undefined) {
    warnings.push('Environment variable FACEBOOK_APP_ID missing');
}
// Twitter @username for the website used in the card footer when sharing.
// See opengraph.
if (process.env.TWITTER_USERNAME === undefined) {
    warnings.push('Environment variable TWITTER_USERNAME missing');
}

// Deprecated config related to social media.
/*
// TWITTER_CKEY (optional).
if (process.env.TWITTER_CKEY === undefined) {
    warnings.push('Environment variable TWITTER_CKEY missing - using default');
}
// TWITTER_CSECRET (optional).
if (process.env.TWITTER_CSECRET === undefined) {
    warnings.push('Environment variable TWITTER_CSECRET missing - using default');
}
// TWITTER_TKEY (optional).
if (process.env.TWITTER_TKEY === undefined) {
    warnings.push('Environment variable TWITTER_TKEY missing - using default');
}
// TWITTER_TSECRET (optional).
if (process.env.TWITTER_TSECRET === undefined) {
    warnings.push('Environment variable TWITTER_TSECRET missing - using default');
}
// INSTAGRAM_CID (optional).
if (process.env.INSTAGRAM_CID === undefined) {
    warnings.push('Environment variable INSTAGRAM_CID missing - using default');
}
// INSTAGRAM_CSECRET (optional).
if (process.env.INSTAGRAM_CSECRET === undefined) {
    warnings.push('Environment variable INSTAGRAM_CSECRET missing - using default');
}
*/

// Display warnings.
if (warnings.length > 0) {
    for (var index = 0; index < warnings.length; index++) {
        console.warn('Warning: ' + warnings[index]);
    }
}

// Display errors and exit.
if (errors.length > 0) {
    for (var index = 0; index < errors.length; index++) {
        console.error('Error: ' + errors[index]);
    }
    process.exit(1);
}

// One object contains all environment-dependent configuration.
// Do not use process.env variables directly throughout the app.
module.exports = {
    'appPort': process.env.APP_PORT || 5000,
    'mongodbDb': process.env.MONGODB_DB || false,
    'mongodbHost': process.env.MONGODB_HOST || '127.0.0.1',
    'mongodbPort': process.env.MONGODB_PORT || 27017,
    'mongodbReplSet': process.env.MONGODB_REPLSET || false,
    'mongodbUser': process.env.MONGODB_USER || false,
    'mongodbPass': process.env.MONGODB_PASS || false,
    'bondApiUrl': process.env.BOND_API_URL || false,
    'mecomApiUrl': process.env.MECOM_API_URL || false,
    'mecomApiOptions': [
        'output_type=json',
        'image_size=480x',
        'mmfd_version=2.0',
        'show_external=true',
        'show_embedded',
        'show_video',
        'embedded_preset=true'
    ],
    'redisHost': process.env.REDIS_HOST || '127.0.0.1',
    'redisPort': process.env.REDIS_PORT || 6379,
    'redisCacheTime': 5 * 60, // 5 minutes.
    'servedBy': process.env.SERVEDBY || 'HAL-9000',
    'headers': {
        'defaultAllowed': 'Content-Type, If-Match, success-action-redirect, x-csrf-token',
        'defaultExposed': 'Content-Length, Content-Type, Date, ETag, X-CSRF, X-Powered-By',
        'defaultMethods': 'GET, PUT, POST, DELETE, HEAD, OPTIONS'
    },
    'pagination': {
        'defaultPageSize': 10
    },
    'stats': {
        'defaultTopX': 5 // Nr of items to return in a Top-x list.
    },
    'files': {
        'tmpDir': '/tmp/bitedk/', // Use trailing slash. Write access required. And only one subdirectory is supported.
        'ageDelta': 30 * 60 // 30 minutes.
    },
    's3': {
        'key': process.env.AWS_S3_ACCESS_KEY,
        'secret': process.env.AWS_S3_ACCESS_SECRET,
        'region': process.env.AWS_S3_REGION || 'eu-west-1',
        'bucket': process.env.AWS_S3_BUCKET,
        'maxAsyncS3': 20,
        's3RetryCount': 10,
        's3RetryDelay': 1000,
        'multipartUploadThreshold': 20971520, // 20 MB.
        'multipartUploadSize': 15728640 // 15 MB.
    },
    'bond': {
        'relUrlHost': 'http://www.bt.dk',
        'syncDelta': 5 * 60, // 5 minutes.
        'cleanupDelta': 10 * 60 // 10 minutes.
    },
    'cloudinary': {
        'cloud_name': process.env.CLOUDINARY_NAME,
        'api_key': process.env.CLOUDINARY_API_KEY,
        'api_secret': process.env.CLOUDINARY_API_SECRET
    },
    'sharing': {
        'twitter': {
            'username': process.env.TWITTER_USERNAME || false
        },
        'facebook': {
            'appId': process.env.FACEBOOK_APP_ID || false
        }
    },
    'imagepreset': {
        'tagImages': {
            'mobile': {
                'width': 150,
                'height': 112,
                'crop': 'fill',
                'gravity': 'face',
                'effect': 'grayscale',
                'quality': 80,
                'format': 'jpg'
            },
            'mobile2x': {
                'width': 300,
                'height': 224,
                'crop': 'fill',
                'gravity': 'face',
                'effect': 'grayscale',
                'quality': 80,
                'format': 'jpg'
            },
            'desktop': {
                'width': 307,
                'height': 227,
                'crop': 'fill',
                'gravity': 'face',
                'effect': 'grayscale',
                'quality': 80,
                'format': 'jpg'
            },
            'desktop2x': {
                'width': 614,
                'height': 454,
                'crop': 'fill',
                'gravity': 'face',
                'effect': 'grayscale',
                'quality': 80,
                'format': 'jpg'
            }
        },
        'articleImages': {
            'mobile': {
                'width': 150,
                'height': 112,
                'crop': 'fill',
                'gravity': 'face',
                'quality': 80,
                'format': 'jpg'
            },
            'mobile2x': {
                'width': 300,
                'height': 224,
                'crop': 'fill',
                'gravity': 'face',
                'quality': 80,
                'format': 'jpg'
            },
            'desktop': {
                'width': 704,
                'height': 394,
                'crop': 'fill',
                'gravity': 'face',
                'quality': 80,
                'format': 'jpg'
            },
            'desktop2x': {
                'width': 1408,
                'height': 788,
                'crop': 'fill',
                'gravity': 'face',
                'quality': 80,
                'format': 'jpg'
            }
        },
        'authorImages': {
            'mobile': {
                'width': 150,
                'height': 112,
                'crop': 'fill',
                'gravity': 'face',
                'quality': 80,
                'format': 'jpg'
            },
            'mobile2x': {
                'width': 300,
                'height': 224,
                'crop': 'fill',
                'gravity': 'face',
                'quality': 60,
                'format': 'jpg'
            },
            'desktop': {
                'width': 307,
                'height': 227,
                'crop': 'fill',
                'gravity': 'face',
                'quality': 80,
                'format': 'jpg'
            },
            'desktop2x': {
                'width': 614,
                'height': 454,
                'crop': 'fill',
                'gravity': 'face',
                'quality': 80,
                'format': 'jpg'
            }
        }
    },
    'authentication': {
        'challengeLifetime': 60, // 60 secs.
        'tokenLifetime': 3600 // 60 minutes.
    }
    // Deprecated config related to social media.
    /*'twitterConsumerKey': process.env.TWITTER_CKEY || false,
    'twitterConsumerSecret': process.env.TWITTER_CSECRET || false,
    'twitterAccessTokenKey': process.env.TWITTER_TKEY || false,
    'twitterAccessTokenSecret': process.env.TWITTER_TSECRET || false,
    'instagramClientId': process.env.INSTAGRAM_CID || false,
    'instagramClientSecret': process.env.INSTAGRAM_CSECRET || false */
};
