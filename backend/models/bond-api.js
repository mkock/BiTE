/*******************************************************************************
 * This file is part of the BiTE package.
*******************************************************************************/

/* jshint node: true */
'use strict';

// Load dependencies.
var _ = require('underscore');
var async = require('async');
var debug = require('debug')('bite:bond');
var request = require('request');
var util = require('util');
var config = require('./../core/config');
var typesDb = require('./contenttypes');
var db = require('./../core/database');

// Function that fetches a nodequeue from BOND via the BOND MMF API.
module.exports.getNodequeue = function(nodequeueId, nextFunc) {
    var url = util.format(
        '%s/nodequeue/%s.ave-json', config.bondApiUrl, nodequeueId
    );
    debug(util.format('Fetch nodequeue %d', nodequeueId));
    request.get(
        {'url': url, 'json': true, 'timeout': 0},
        function(error, response, queue) {
            if (error) {
                return nextFunc(error, null);
            } else if (!error && response.statusCode === 200) {
                // A BOND API release scheduled for week 5, 2015 will change the
                // "images" array to an object; we detect this and convert it
                // back into an array to avoid issues.
                if (_.has(queue, 'images') && _.isObject(queue.images)) {
                    queue.images = _.toArray(queue.images);
                }
                return nextFunc(null, queue);
            } else {
                return nextFunc(
                    new Error(
                        util.format(
                            'Unable to fetch nodequeue with nid %d from BOND; status code: %s, failed request: %s %s',
                            nodequeueId,
                            response.statusCode,
                            response.request.method,
                            response.request.uri.href
                        )
                    ),
                    null
                );
            }
        }
    );
};

// Function that fetches a single node from two different BOND API's;
// - From "BOND API" we fetch the entire node
// - From MMF (MECOM Mobile Framework API) we fetch body only
// The body from MMF is added to the returned node as "body".
module.exports.getNode = function(nodeId, nextFunc) {
    var bondNode = false,
        mmfNode = false;
    // Query the two API's in parallel.
    async.parallel([
        function(asyncNext) {
            module.exports.getBondNode(nodeId, function(error, node) {
                if (!error) {
                    bondNode = node;
                }
                return asyncNext(error);
            });
        },
        function(asyncNext) {
            module.exports.getMecomNode(nodeId, function(error, node) {
                if (!error) {
                    mmfNode = node;
                }
                return asyncNext(error);
            });
        }
    ], function(error) {
        var mmfItem; // Shorthand for mmfNode.items[0].
        if (error) {
            return nextFunc(error);
        }
        if (
            mmfNode.items &&
            _.isArray(mmfNode.items) &&
            mmfNode.items.length &&
            _.isObject(mmfNode.items[0])
        ) {
            mmfItem = mmfNode.items[0];
            // Assign HTML markup to "body" field.
            bondNode.body = mmfNode.items[0].content;
            // Assign author social media profiles to author field.
            if (_.has(bondNode, 'authors') && bondNode.authors.length && _.has(mmfItem, 'author') && mmfItem.author.length) {
                bondNode.authors[0].twitterProfileId = mmfItem.author[0].value.twitter_profile_id || null;
                bondNode.authors[0].facebookProfileId = mmfItem.author[0].value.facebook_profile_id || null;
                bondNode.authors[0].instagramProfileId = mmfItem.author[0].value.instagram_profile_id || null;
            }
        } else {
            message = util.format(
                'Unable to retrieve body field of node %s from BOND MMF; unexpected JSON response',
                nodeId
            );
            return nextFunc(new Error(message));
        }
        return nextFunc(null, bondNode);
    });
};

// Function that fetches a single node from the BOND API.
module.exports.getBondNode = function(nodeId, nextFunc) {
    var url = util.format('%s/node/%s.ave-json', config.bondApiUrl, nodeId);
    debug(util.format('Fetch node %d from BONDAPI', nodeId));
    request.get(
        {'url': url, 'json': true, 'timeout': 0},
        function(error, response, nodeObject) {
            if (error) {
                // Something went wrong - let's crash.
                return nextFunc(error, null);
            } else if (!error && response.statusCode === 401) {
                // 401 Unauthorized is for unpublished articles; they are not
                // exposed through the BOND API, so we can't get their content.
                // By calling nextFunc with no content, we can return some data
                // without breaking everything.
                console.log(util.format(
                    'Unable to fetch node with nid %d from BOND API; status code: %s, failed request: %s %s',
                    nodeId,
                    response.statusCode,
                    response.request.method,
                    response.request.uri.href
                ));
                return nextFunc(null, null);
                // 200 OK is for requests that went well.
            } else if (!error && response.statusCode === 200) {
                return nextFunc(null, nodeObject);
            } else {
                return nextFunc(
                    new Error(
                        util.format(
                            'Unable to fetch node with nid %d from BOND API; status code: %s, failed request: %s %s',
                            nodeId,
                            response.statusCode,
                            response.request.method,
                            response.request.uri.href
                        )
                    ),
                    null
                );
            }
        }
    );
};

// Function that fetches a single node from the BOND MMF API.
module.exports.getMecomNode = function(nodeId, nextFunc) {
    // Define query options for MMF API.
    // You can actually add custom options here if required.
    var mecomApiOptions;
    if (_.isArray(config.mecomApiOptions)) {
        mecomApiOptions = config.mecomApiOptions.join('&');
    } else if (_.isString(config.mecomApiOptions)) {
        mecomApiOptions = config.mecomApiOptions;
    } else {
        mecomApiOptions = '';
    }
    var url = util.format(
        '%s/node/%s?%s', config.mecomApiUrl, nodeId, mecomApiOptions
    );
    debug(util.format('Fetch node %d from MECOMAPI', nodeId));
    request.get(
        {'url': url, 'json': true, 'followRedirect': false, 'timeout': 0},
        function(error, response, nodeObject) {
            if (error) {
                // Something went wrong - let's crash.
                return nextFunc(error, null);
            } else if (!error && response.statusCode === 302) {
                // 302 Found is for unpublished articles; they are not
                // exposed through the MMF API, so we can't get their content.
                // By calling nextFunc with no content, we can return some data
                // without breaking everything.
                console.log(util.format(
                    'Unable to fetch node with nid %d from BOND MMF; status code: %s, failed request: %s %s',
                    nodeId,
                    response.statusCode,
                    response.request.method,
                    response.request.uri.href
                ));
                return nextFunc(null, null);
                // 200 OK is for requests that went well.
            } else if (!error && response.statusCode === 200) {
                return nextFunc(null, nodeObject);
            } else {
                return nextFunc(
                    new Error(
                        util.format(
                            'Unable to fetch node with nid %d from BOND MMF; status code: %s, failed request: %s %s',
                            nodeId,
                            response.statusCode,
                            response.request.method,
                            response.request.uri.href
                        )
                    ),
                    null
                );
            }
        }
    );
};

// Function that creates a new contentitem from a node.
module.exports.nodeToItem = function(node, nextFunc) {
    typesDb.getBySlug('bond-article', function(error, type) {
        var published;
        if (error) {
            return nextFunc(error, null);
        }
        if (module.exports.isPublished(node)) {
            published = db.toDbTime(node.dateCreated);
        } else {
            published = null;
        }
        var item = {
            'typeId': type._id.toString(),
            'typeSlug': type.slug,
            'tags': [],
            'name': node.title,
            'nodeId': parseInt(node.id),
            'upvotes': 0,
            'downvotes': 0,
            'views': 0,
            'published': published,
            'created': db.toDbTime(node.dateCreated),
            'updated': db.toDbTime()
        };
        return nextFunc(null, item);
    });
};

// Function that converts a BOND title to a format that is more suitable
// for BITE. It splits the title into its categories and returns what is
// essentially the part that describes the original nodequeue most accurately.
// This is probably the last one or two category names, but never the first name
// which is always the site name.
// Example: "bt.dk > Forsiden > Primær Flow" becomes "Forsiden, Primær Flow".
module.exports.convertTagTitle = function(title, nextFunc) {
    if (_.isNull(title)) {
        return '';
    }
    var sections = title.split(/>/).map(function(value) {
        return value.trim();
    });
    if (sections.length === 1) {
        return sections[0];
    } else if (sections.length === 2) {
        return sections[1];
    } else if (sections.length > 2) {
        return util.format(
            '%s, %s', sections[sections.length-2], sections[sections.length-1]
        );
    } else {
        return title;
    }
};

// Function that checks if a given node is published or not.
module.exports.isPublished = function(node) {
    return node.statusText === 'Published';
};
