/*******************************************************************************
 * This file is part of the BiTE package.
*******************************************************************************/

/* jshint node: true */
'use strict';

// Load dependencies.
var _ = require('underscore');
var crypto = require('crypto');
var uuid = require('node-uuid');
var redis = require('redis');
var db = require('./../core/database');
var config = require('./../core/config');
var generic = require('./../core/generic');

// Establish connection to redis.
var client = redis.createClient(config.redisPort, config.redisHost, {});

// Function that creates a new user.
module.exports.create = function(user, nextFunc) {
    // Ensure that the username is URL friendly.
    user.username = generic.sluggify(user.username);
    // Set timestamps.
    if (!_.has(user, 'created')) {
        user.created = db.toDbTime();
    }
    // Create the user.
    db.collection('users').insert(user, function(error, result) {
        var userObject = null;
        if (!error) {
            userObject = result.pop();
        }
        return nextFunc(error, userObject);
    });
};

// Function that updates an existing user.
module.exports.update = function(user, nextFunc) {
    var options = {'upsert': false, 'multi': false};
    // Ensure that the username is URL friendly.
    user.username = generic.sluggify(user.username);
    // Set timestamps.
    if (!_.has(user, 'created')) {
        user.created = db.toDbTime();
    }
    user.updated = db.toDbTime();
    // Save the user.
    db.collection('users')
        .update({'_id': user._id}, user, options, function(error, result) {
            return nextFunc(error, user);
        }
    );
};

// Function that deletes a user.
module.exports.remove = function(user, nextFunc) {
    db.collection('users').remove({'_id': user._id}, nextFunc);
};

// Function that fetches a single user by username.
module.exports.getByUsername = function(username, nextFunc) {
    db.collection('users').findOne({'username': username}, {}, nextFunc);
};

// Function that fetches a single user by id.
module.exports.getById = function(userId, nextFunc) {
    db.collection('users').findOne({'_id': db.getId(userId)}, {}, nextFunc);
};

// Function that fetches all users, ordered by username.
module.exports.getUsers = function(nextFunc) {
    return db.collection('users').find().sort({'username': 1}).toArray(nextFunc);
};

// Function that authenticates a user by returning a public key if the user
// exists; a SHA256-hashed string based on the public key and the user's
// password concatenated is stored in Redis with a TTL. It's sent to the client
// as a challenge, and if matched by the client's response in a login call,
// the user is authenticated.
module.exports.authenticate = function(username, nextFunc) {
    var publicKey = uuid.v4(),
        challenge;
    module.exports.getByUsername(username, function(error, user) {
        if (error) {
            // Something went wrong; we need to propagate the error.
            return nextFunc(error, null);
        } else if (!user || !user.active) {
            // User not found, or deactivated.
            return nextFunc(null, null);
        }
        // Create a challenge hash.
        challenge = crypto.createHash('sha256')
            .update(publicKey + user.password)
            .digest('hex');
        // Store challenge for a later match.
        client.setex(
            'challenge:' + challenge,
            config.authentication.challengeLifetime,
            username
        );
        return nextFunc(null, publicKey);
    });
};

// Function that attempts to login a user by means of a "response" (hash)
// (see authenticate()). If the challenge matches our own, an access key is
// created and provided to the callback.
module.exports.login = function(response, nextFunc) {
    var hash = 'challenge:' + response,
        token;
    client.get(hash, function(error, username) {
        if (error || !username) {
            return nextFunc(null, null);
        } else {
            // Delete the challenge.
            client.del(hash, function() {
                token = uuid.v4();
                client.setex(
                    'token:' + token,
                    config.authentication.tokenLifetime,
                    username
                );
                return nextFunc(null, {
                    'token': token,
                    'username': username,
                    'ttl': config.authentication.tokenLifetime
                });
            });
        }
    });
};

// Function that validates the given access token, and returns the related
// username if it validates.
module.exports.validateAccessToken = function(token, nextFunc) {
    return client.get('token:' + token, nextFunc);
};

// Function that simply returns the given access token if it exists, and Null
// otherwise.
module.exports.getAccessToken = function(token, nextFunc) {
    var tokenObject = {},
        next = _.after(2, function(error, tokenObject) {
            // Make sure to return Null if the token doesn't exist.
            if (!error && (_.isNull(tokenObject.ttl) || tokenObject.ttl < 0)) {
                return nextFunc(null, null);
            } else {
                return nextFunc(error, tokenObject);
            }
        });
    // Get the username associated with the token.
    client.get('token:' + token, function(error, username) {
        tokenObject.username = username;
        return next(error, tokenObject);
    });
    // Get token TTL.
    client.ttl('token:' + token, function(error, ttl) {
        tokenObject.ttl = ttl;
        return next(error, tokenObject);
    });
};

// Function that renews an existing access token if it's valid.
module.exports.renewAccessToken = function(token, nextFunc) {
    var newToken = uuid.v4();
    module.exports.getAccessToken(token, function(error, username) {
        if (error) {
            return nextFunc(error, null);
        } else if (!username) {
            return nextFunc(null, null);
        }
        // Valid token found; renew it.
        client.del('token:' + token);
        client.setex(
            'token:' + newToken, config.authentication.tokenLifetime, username
        );
        return nextFunc(null, newToken);
    });
};
