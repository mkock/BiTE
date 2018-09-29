/*******************************************************************************
 * This file is part of the BiTE package.
*******************************************************************************/

/* jshint node: true */
'use strict';

// Load dependencies.
var _ = require('underscore');
var generic = require('./../core/generic');
var db = require('./../core/database');
var usersDb = require('./../models/users');
var replies = require('./../core/replies');

// Utility function that changes a user's password into asterisk symbols.
var hidePassword = function(user) {
    var length;
    if (user && user.password) {
        length = (user.password.length + 1);
        user.password = new Array(length).join('*');
    }
    return user;
};

// Function that preloads a user based on user (id or username).
module.exports.preload = function(request, response, nextFunc) {
    var id = request.params.user;
    var failOrPass = function(error, user) {
        return replies.replyNotFoundOrPass(response, error, user, function() {
            request.user = user;
            return nextFunc();
        });
    };
    if (db.isHash(id)) {
        return usersDb.getById(id, failOrPass);
    } else {
        return usersDb.getByUsername(id, failOrPass);
    }
};

// Function that simply wraps users in an envelope object and sends them.
// This function assumes that there were no errors until now; otherwise, they
// should have been handled by other middleware. The callback chain stops here.
module.exports.wrapAndSend = function(request, response) {
    var meta = response.locals.meta || {},
        nav;
    if (response.locals.paginator) {
        nav = replies.paginate(response.locals.paginator);
    } else if (response.locals.navigation) {
        nav = response.locals.navigation;
    } else {
        nav = null;
    }
    return replies.wrapAndSend(
        response, null, meta, nav, response.locals.users
    );
};

// Function that loads a user by username.
module.exports.getByUsername = function(request, response, nextFunc) {
    // Simply pass the preloaded user to the response.
    response.locals.users = [hidePassword(request.user)];
    return nextFunc();
};

// Function that finds all users.
module.exports.getUsers = function(request, response, nextFunc) {
    return usersDb.getUsers(function(error, users) {
        return replies.replyErrorOrPass(response, error, function() {
            _.map(users, hidePassword);
            response.locals.users = users;
            return nextFunc();
        });
    });
};

// Function that authenticates a user by looking up his or her username.
module.exports.authenticate = function(request, response) {
    var username = request.params.username;
    return usersDb.authenticate(username, function(error, challenge) {
        var challengeObject;
        if (challenge) {
            challengeObject = {'challenge': challenge};
        }
        return replies.replyFoundOrUnauthorized(
            response, error, challengeObject, 'Unauthorized'
        );
    });
};

// Function that logs in a user based on his or her response to a challenge.
module.exports.login = function(request, response) {
    var challengeResponse = request.params.response;
    return usersDb.login(challengeResponse, function(error, tokenObject) {
        return replies.replyFoundOrUnauthorized(
            response, error, tokenObject, 'Unauthorized'
        );
    });
};

// Function that attempts to validate an access token supplied as part of the
// URI, or supplied as a header "Access-Token".
module.exports.validateAccessToken = function(request, response) {
    var token = request.params.token || request.headers['access-token'];
    return usersDb.validateAccessToken(token, function(error, username) {
        var user;
        if (username) {
            // A username was found based on the token; return the user.
            return usersDb.getByUsername(username, function(error, user) {
                return replies.replyFoundOrUnauthorized(
                    response,
                    error,
                    hidePassword(user),
                    'Unauthorized: Invalid access token'
                );
            });
        } else {
            // Token mismatch or not found; return an explanation.
            return replies.replyFoundOrUnauthorized(
                response, error, false, 'Unauthorized: Invalid access token'
            );
        }
    });
};

// Function that, if used with a route, requires the header Access-Token
// to be present. It will pass through if the token is valid.
module.exports.checkAccessToken = function(request, response, nextFunc) {
    var token = request.headers['access-token'];
    return usersDb.validateAccessToken(token, function(error, username) {
        if (username) {
            // Everything's okay; we're done here.
            return nextFunc();
        } else {
            // Token mismatch or not found; return an explanation.
            return replies.replyFoundOrUnauthorized(
                response, error, false, 'Unauthorized: Invalid access token'
            );
        }
    });
};

// Function that simply returns an access token if it exists.
// Notice that the returned tokenObject matches that from usersDb.login().
module.exports.getAccessToken = function(request, response) {
    var token = request.params.token;
    usersDb.getAccessToken(token, function(error, tokenObject) {
        var reply;
        if (tokenObject) {
            reply = {
                'token': token,
                'username': tokenObject.username,
                'ttl': tokenObject.ttl
            };
        }
        return replies.replyFoundOrUnauthorized(
            response, error, reply, 'Unauthorized'
        );
    });
};

// Function that generates a new access token if the supplied token is valid.
module.exports.renewAccessToken = function(request, response) {
    var token = request.params.token;
    return usersDb.renewAccessToken(token, function(error, newToken) {
        var tokenObject;
        if (newToken) {
            tokenObject = {'token': newToken};
        }
        return replies.replyFoundOrUnauthorized(
            response,
            error,
            tokenObject,
            'Unauthorized'
        );
    });
};

// Function that creates a new user if the provided username is not taken.
module.exports.postUser = function(request, response) {
    var user = request.body;
    if (!user.username) {
        return replies.replyBadRequest(response, 'No username provided');
    }
    // Check if another user with the provided (sluggified) username exists.
    usersDb.getByUsername(generic.sluggify(user.username), function(error, realUser) {
        return replies.replyConflictOrPass(response, null, realUser, function() {
            usersDb.create(user, function(error, newUser) {
                return replies.replyCreatedOrError(
                    response, error, hidePassword(newUser)
                );
            });
        });
    });
};

// Function that modifies an existing user.
module.exports.putUser = function(request, response) {
    var user = request.body,
        realUser = request.user,
        sluggifiedUsername;
    // Local function that updates a user when it's been proven that the
    // username, if changed, is not occupied by someone else (identify theft).
    var createUser = function() {
        // Transfer user id.
        user._id = realUser._id;
        // Check for a valid password.
        if ((!user.password) || (user.password && /^\**$/.test(user.password))) {
            // If no password was provided, or if a censored password was provided,
            // we assume that that existing password is to be re-used.
            user.password = realUser.password;
        }
        // Update the user.
        return usersDb.update(user, function(error, updatedUser) {
            return replies.replyUpdatedOrError(
                response, error, hidePassword(updatedUser)
            );
        });
    };
    // Make sure there's a username.
    if (!user.username) {
        return replies.replyBadRequest(response, 'No username provided');
    }
    // Check if the new username is taken by another other.
    sluggifiedUsername = generic.sluggify(user.username);
    if (sluggifiedUsername !== realUser.username) {
        usersDb.getByUsername(sluggifiedUsername, function(error, otherUser) {
            return replies.replyErrorOrPass(response, error, function() {
                if (otherUser &&
                    otherUser._id.toString() !== realUser._id.toString()
                ) {
                    // Identity theft! Call the police!
                    return replies.replyConflictOrPass(
                        response, null, otherUser, createUser
                    );
                } else {
                    // Another user was found with the new username, but that
                    // user matches the preloaded user, so we're good to go.
                    return createUser();
                }
            });
        });
    } else {
        // Username matches the user we preloaded, so we're good to go.
        return createUser();
    }
};
