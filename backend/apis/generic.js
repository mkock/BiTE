/*******************************************************************************
 * This file is part of the BiTE package.
*******************************************************************************/

/* jshint node: true */
'use strict';

// Load dependencies.
var _ = require('underscore');
var redis = require('redis');
var db = require('./../core/database');
var replies = require('./../core/replies');
var config = require('./../core/config');
var imgcache = require('./../models/imgcache');

// Establish connection to redis.
var client = redis.createClient(config.redisPort, config.redisHost, {});

// Function that returns a simple copyright notice.
module.exports.copyright = function(request, response) {
    var notice = 'Copyright 2014 - 2015, Berlingske Media A/S';
    return replies.replyFoundOrError(response, null, notice);
};

// Function that returns some useful information about redis.
module.exports.getCacheInfo = function(request, response) {
    return client.dbsize(function(error, size) {
        return replies.replyFoundOrError(response, error, {'keyCount': size});
    });
};

// Function that returns 500 Internal Server Error if either MongoDB or Redis
// are down.
module.exports.status = function(request, response) {
    var mongoConfig,
        redisError = false,
        mongoError = false,
        status = {'time': (new Date()).toString()};
    // Local function that summarizes service statuses.
    var returnSummary = _.after(2, function() {
        var hasErrors = redisError || mongoError;
        status.redis = (redisError ? redisError.toString() : 'running');
        status.mongo = (mongoError ? mongoError.toString() : 'running');
        if (hasErrors) {
            return response.status(500).send(status);
        } else {
            return response.status(200).send(status);
        }
    });
    // Check Redis.
    client.dbsize(function(error, size) {
        if (error) {
            redisError = error;
        }
        return returnSummary();
    });
    // Check MongoDB.
    mongoConfig = db.collection('tags').db.serverConfig;
    if (mongoConfig._serverState !== 'connected') {
        mongoError = mongoConfig._serverState;
    }
    return returnSummary();
};
