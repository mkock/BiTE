/*******************************************************************************
 * This file is part of the BiTE package.
*******************************************************************************/

/* jshint node: true */
'use strict';

// Load dependencies.
var _ = require('underscore');
var url = require('url');
var db = require('./../core/database');
var bondApi = require('./bond-api');
var config = require('./../core/config');

// Function that fetches a single node from the BOND MMF API.
// We are currently lenient about the absence of a nodeId, returning an
// unpopulated contentitem instead of taking the crash-and-burn route.
module.exports.getNode = function(item) {
    // Set up the feed context.
    var nodeId = parseInt(item.nodeId);
    if (isNaN(nodeId)) {
        return function(nextFunc) {
            nextFunc(null, null);
        };
    } else {
        // This is the actual function getting called for the feed.
        return function(nextFunc) {
            return bondApi.getNode(nodeId, nextFunc);
        };
    }
};

// Function that populates an item with fields from a BOND node.
// The "options" argument can be used to control which fields are populated.
// Note; It's important to actually *extend* item without accidentally
// overwriting any existing fields when they're not supposed to be.
module.exports.populate = function(item, node, options, nextFunc) {
   if (!_.isObject(node)) {
        // Call callback without populating item if node is not an object.
        return nextFunc(null, item);
    }
    // Populate nodeId.
    if ((!_.has(item, 'nodeId') || !item.nodeId) && _.has(node, 'id')) {
        item.nodeId = parseInt(node.id);
    }
    // Populate title.
    if (_.has(node, 'title')) {
        item.name = node.title;
        item.title = node.title;
    }
    // Populate supertitle.
    if (_.has(node, 'supertitle')) {
        item.supertitle = node.supertitle;
    }
    // Populate description.
    if (_.has(node, 'summary')) {
        item.description = node.summary;
    }
    // Populate website.
    if (_.has(node, 'website')) {
        item.website = node.website;
    }
    // Populate body.
    if (options.includeBody && _.has(node, 'body')) {
        item.body = node.body;
    }
    // Populate author.
    if (_.has(node, 'authors') &&
        _.isArray(node.authors) &&
        _.isObject(node.authors[0])
    ) {
        if (!_.has(item, 'author')) {
            item.author = {};
        }
        item.author.name = node.authors[0].name || node.authors[0].freetext;
        item.author.email = node.authors[0].email;
        item.author.image = node.authors[0].picture;
        item.author.profileName = node.authors[0].profileName || item.author.name;
        item.author.profileEmail = node.authors[0].profileEmail;
        item.author.twitterProfile = {
            'id': node.authors[0].twitterProfileId || null
        };
        item.author.facebookProfile = {
            'id': node.authors[0].facebookProfileId || null
        };
        item.author.instagramProfile = {
            'id': node.authors[0].instagramProfileId || null
        };
    }
    // Populate article image.
    if (_.has(node, 'images') &&
        _.isArray(node.images) &&
        _.isObject(node.images[0])
    ) {
        if (!_.has(item, 'image')) {
            item.image = {};
        }
        // Save the previous image so we'll know whether or not to re-cache it.
        if (_.has(item.image, 'image')) {
            item.image.imagePrev = item.image.image;
        }
        item.image.title = node.images[0].title;
        item.image.photographer = node.images[0].photographer;
        item.image.fileName = node.images[0].file.name;
        item.image.image = url.resolve(
            config.bond.relUrlHost, node.images[0].file.path
        );
        item.image.mimeType = node.images[0].file.mimeType;
        item.image.size = node.images[0].file.size;
        // Append metadata such as image dimensions if it exists.
        if ((_.isObject(node.images[0].file.metadata)) &&
            _.isObject(node.images[0].file.metadata.fixed)
        ) {
            if (!_.has(item.image, 'dimensions')) {
                item.image.dimensions = {};
            }
            item.image.dimensions.width = parseInt(
                node.images[0].file.metadata.fixed.width
            );
            item.image.dimensions.height = parseInt(
                node.images[0].file.metadata.fixed.height
            );
        }
        // Populate published.
        if (bondApi.isPublished(node) && _.has(node, 'dateCreated')) {
            item.published = db.toDbTime(node.dateCreated);
        } else {
            item.published = null;
        }
    }
    return nextFunc(null, item);
};
