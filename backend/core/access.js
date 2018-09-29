/*******************************************************************************
 * This file is part of the BiTE package.
*******************************************************************************/

/* jshint node: true */
'use strict';

// Load dependencies.
var util = require('util');
var _ = require('underscore');
var config = require('./config');
var accessDb = require('./../models/access');
var replies = require('./../core/replies');

// Function which adds response headers that allows for cross-origin calls.
// Note that browsers that support CORS (Cross-Origin Resource Sharing)
// always send the "origin" header when XMLHttpRequests are made - when no
// such header is present, we can assume that the request is made directly,
// and therefore doesn't require any same-origin checks. When the header is
// present, however, we need to compare it to a list of approved domains
// (a whitelist), which we keep in MongoDB.
module.exports.whitelistOnly = function(request, response, nextFunc) {
    var methods, headersAllowed;
    if (request.headers.origin) {
        accessDb.getUrl(request.headers.origin, function(error, result) {
            if (result === null) {
                return replies.replyForbidden(
                    response, util.format(
                        'Origin "%s" is not whitelisted', request.headers.origin
                    )
                );
            }
            // Use some generous fallback privileges if left unspecified;
            if (_.has(result, 'methods')) {
                methods = result.methods;
            } else {
                methods = config.headers.defaultMethods;
            }
            if (_.has(result, 'types')) {
                headersAllowed = result.types;
            } else {
                headersAllowed = config.headers.defaultAllowed;
            }
            replies.replyErrorOrPass(response, error, function() {
                if (!response._headerSent) {
                    response.header('Access-Control-Allow-Origin', result.url);
                    response.header('Access-Control-Allow-Methods', methods);
                    response.header(
                        'Access-Control-Allow-Headers', headersAllowed
                    );
                    response.header(
                        'Access-Control-Expose-Headers',
                        config.headers.defaultExposed
                    );
                }
            });
        });
    }
    return nextFunc();
};

// Function which adds response headers that allows for cross-origin calls
// from all hosts. Intended for development use only.
module.exports.unrestricted = function(request, response, nextFunc) {
    if (request.headers.origin) {
        response.header('Access-Control-Allow-Origin', request.headers.origin);
        response.header(
            'Access-Control-Allow-Methods',
            'GET, PUT, POST, DELETE, HEAD, OPTIONS'
        );
        response.header(
            'Access-Control-Allow-Headers', config.headers.defaultAllowed
        );
        // There is no catch-all for Access-Control-Expose-Headers.
        response.header(
            'Access-Control-Expose-Headers', config.headers.defaultExposed
        );
    }
    return nextFunc();
};
