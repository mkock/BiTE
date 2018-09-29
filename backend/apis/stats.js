/*******************************************************************************
 * This file is part of the BiTE package.
*******************************************************************************/

/* jshint node: true */
'use strict';

var itemsDb = require('../models/contentitems');
var replies = require('../core/replies');

// Function that counts the total upvotes for a specific tag.
module.exports.getUpvotesTotalByTag = function(request, response) {
    itemsDb.getUpvotesTotalByTag(request.tag, function(error, result) {
        replies.replyFoundOrError(response, error, {}, null, result);
    });
};

// Function that counts the total downvotes for a specific tag.
module.exports.getDownvotesTotalByTag = function(request, response) {
    itemsDb.getDownvotesTotalByTag(request.tag, function(error, result) {
        replies.replyFoundOrError(response, error, result);
    });
};

// Function that counts the total upvotes for a specific contenttype.
module.exports.getUpvotesTotalByType = function(request, response) {
    itemsDb.getUpvotesTotalByType(request.contenttype, function(error, result) {
        replies.replyFoundOrError(response, error, result);
    });
};

// Function that counts the total downvotes for a specific contenttype.
module.exports.getDownvotesTotalByType = function(request, response) {
    itemsDb.getDownvotesTotalByType(request.contenttype, function(error, result) {
        replies.replyFoundOrError(response, error, result);
    });
};
