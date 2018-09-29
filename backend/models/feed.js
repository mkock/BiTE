/*******************************************************************************
 * This file is part of the BiTE package.
*******************************************************************************/

/* jshint node: true */
'use strict';

// Load dependencies.
var _ = require('underscore');
var async = require('async');
var util = require('util');
var cache = require('./cache');
var bond = require('./bond-feed');
// Social media content disabled because it will be part of article content.
/* var facebook = require('./facebook-feed');
var twitter = require('./twitter-feed');
var instagram = require('./instagram-feed'); */

// Mapping of contenttype to a feed source.
// The map keys must correspond to contenttype slugs.
// Redis naming scheme: feed:<site>:<type>:<id>.
var feedMap = {
    'bond-article': {
        'fetchFunc': bond.getNode,
        'populateFunc': bond.populate,
        'keyName': 'feed:bond:node:%s',
        'expires': 2 * 60 // 2 minutes (relative, in seconds)
    }/*
    // Social media content disabled because it will be part of article content.
    'facebook': {
        'fetchFunc': facebook.getStatus,
        'keyName': 'feed:face:status:%s',
        'expires': 60 // 1 minute (relative, in seconds)
    },
    'User Tweets': {
        'fetchFunc': twitter.getTimeline,
        'keyName': 'feed:twit:tline:%s',
        'expires': 60 // 1 minute (relative, in seconds)
    },
    'Instagram # feed': {
        'fetchFunc': instagram.getImage,
        'keyName': 'feed:gram:image:%s',
        'expires': 2* 60 // 2 minutes (relative, in seconds)
    }*/
};

// Function that determines whether first argument is an array of contentitems
// or a single contentitem, and calls the function that matches the type.
// Accepted options:
// - skipCache (boolean) Set to true to skip the cache and fetch externally.
// - includeBody (boolean) Set to true to include the content body.
module.exports.extend = function(items, options, nextFunc) {
    if (items instanceof Array) {
        return module.exports.extendAll(items, options, nextFunc);
    } else {
        return module.exports.extendOne(items, options, nextFunc);
    }
};

// Function that extends a contentitem with feed data from a data source
// determined by its contenttype.
module.exports.extendOne = function(item, options, nextFunc) {
    var contentType = item.typeSlug;
    var typeMap, key;
    // Local function that does actual item population - isolated for re-use.
    var doPopulate = function(error, content) {
        if (content !== null && _.isFunction(typeMap.populateFunc)) {
            return typeMap.populateFunc(item, content, options, nextFunc);
        } else {
            return nextFunc(error, item);
        }
    };
    if (_.has(feedMap, contentType)) {
        typeMap = feedMap[contentType];
        if (options.skipCache) {
            // Skip cache and load directly from source (incurs waiting time).
            (typeMap.fetchFunc(item))(function(error, results) {
                if (!error) {
                    // Populate item with external data.
                    return doPopulate(error, results);
                } else {
                    // Continue without populating item with external data.
                    return nextFunc(error, item);
                }
            });
        } else {
            // Load feed content while taking advantage of redis to cache
            // content transparently. feedMap provides the mapping information
            // we need.
            key = util.format(typeMap.keyName, item._id.toString());
            return cache.fetch(
                key,
                typeMap.fetchFunc(item),
                typeMap.expires,
                doPopulate
            );
        }
    } else {
        // No recognized contenttype to act upon.
        return nextFunc(null, item);
    }
};

// Function that extends multiple contentitems with feed data from a data
// source determined by their contenttypes.
module.exports.extendAll = function(items, options, nextFunc) {
    async.each(items, function(item, asyncNext) {
        module.exports.extendOne(item, options, function(error, extendedItem) {
            var pos;
            if (!error) {
                pos = items.indexOf(item);
                items[pos] = extendedItem;
            }
            return asyncNext(error);
        });
    }, function(error) {
        return nextFunc(error, items);
    });
};
