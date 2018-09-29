/*******************************************************************************
 * This file is part of the BiTE package.
*******************************************************************************/

/* jshint node: true */
'use strict';

// Load dependencies.
var _ = require('underscore');
var redis = require('redis');
var config = require('./../core/config');

// Establish connection to redis.
var client = redis.createClient(config.redisPort, config.redisHost, {});

// Function that returns the current time in seconds.
var nowInSecs = function() {
    return Math.round(Date.now() / 1000);
};

// Function that stores given content with given key for "expiresWhen" seconds.
module.exports.set = function(key, content, expiresWhen, nextFunc) {
    var stringifiedContent,
        expires = nowInSecs() + (expiresWhen || config.redisCacheTime);
    if (_.isObject(content)) {
        stringifiedContent = JSON.stringify(content);
    } else {
        stringifiedContent = content;
    }
    client.set(key, stringifiedContent);
    client.expire(key, expires);
    return nextFunc(null, stringifiedContent);
};

// Function that returns the content with the given key if it exists.
module.exports.get = function(key, nextFunc) {
    return client.get(key, nextFunc);
};

// Function that fetches content from redis cache based on a key.
// If key does not exist, content is fetched from original source and stored
// with the given expire (time-to-live) in seconds.
// We don't assume to know what kind of parameters fetchFunc needs in order to
// to its job, so we call it without any. You may implement fetchFunc as a
// nested function inside another function that can keep track of these
// parameters in order to keep it argument-free. See the example function below.
//
// Caching algorithm explained;
// 1. Fetch content from cache
// 2. Is cache empty?
//    2.1 YES: Load content from source; return fallback content if it exists
//        and fetch updated content asynchronously
//    2.2 NO: Return cached content immediately AND check expiration date
//    2.3 Is expiration date passed?
//        2.3.1 YES: Fetch updated content asynchronously AND set new expiration
//        2.3.2 NO: Pass
// 3. Return content
// Note; We don't keep track of updates which are in progress, which means that
// multiple identical updates could potentially run in parallel; it's not
// currently a problem, but could need a fix at some point.
module.exports.fetch = function(key, fetchFunc, expiresWhen, nextFunc) {
    var contentKey = key + ':content';
    var fallbackKey = key + ':content:fallback';
    var expireKey = key + ':expire';
    // Local function that calls fetchFunc and stores the returned content in
    // the redis cache with some metadata (primarily expiration time).
    var fetchAndCache = function(nextFunc) {
        return fetchFunc(function(error, content) {
            var stringifiedContent = JSON.stringify(content);
            if (!error && stringifiedContent) {
                // "expireKey" expires too, which is fine; when not present,
                // we can safely assume that content has expired, and it
                // won't take up unnecessary space after content is gone.
                client.set(contentKey, stringifiedContent);
                client.set(fallbackKey, stringifiedContent);
                client.set(
                    expireKey, nowInSecs() + (expiresWhen || config.redisCacheTime)
                );
                client.expire(contentKey, config.redisCacheTime);
                client.expire(expireKey, config.redisCacheTime);
            }
            if (nextFunc) {
                return nextFunc(error, content);
            }
        });
    };
    // Fetch "content" and "expire" keys simultaneously from cache, and fetch
    // content from source as necessary. Algorithm:
    // 1. Is the short term content cached?
    //    1.1 Yes; Just return it immediately
    //    1.2 No; Is the long term content cached?
    //        1.3.1 Yes; Return it immediately while updating in the background
    //        1.3.2 No; Fetch it again in the foreground and return it when done
    // Since the "expire" key also expires, we don't currently need it.
    client.mget([contentKey, fallbackKey, expireKey], function(error, results) {
        var shortTermContent = (results[0] ? JSON.parse(results[0]) : null),
            longTermContent = (results[1] ? JSON.parse(results[1]) : null),
            expires = results[2],
            doFetch = false, doWait = false;
        if (!shortTermContent) {
            doFetch = true;
        }
        if (!longTermContent) {
            doFetch = true;
            doWait = true;
        }
        if (error) {
            return nextFunc(error, null);
        } else if (doFetch && doWait) {
            return fetchAndCache(function(error, content) {
                var contentObject;
                if (_.isString(content)) {
                    contentObject = JSON.parse(content);
                } else {
                    contentObject = content;
                }
                if (error) {
                    return nextFunc(error, null);
                } else {
                    return nextFunc(null, contentObject);
                }
            });
        } else if (doFetch && !doWait) {
            fetchAndCache(function(error, content) {
                if (error) {
                    console.log(error);
                }
            });
            return nextFunc(null, (shortTermContent || longTermContent));
        } else {
            return nextFunc(null, (shortTermContent || longTermContent));
        }
    });
};

// Error handling.
client.on('error', function(error) {
    console.log(error);
});
