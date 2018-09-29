/*******************************************************************************
 * This file is part of the BiTE package.
*******************************************************************************/

/* jshint node: true */
'use strict';

var _ = require('underscore');
var db = require('../core/database');
var typesDb = require('../models/contenttypes');
var replies = require('../core/replies');
var pager = require('data-pager');

// Function which preloads a contenttype based on id or slug, and attaches it
// to the request if it does. Provided that request.params.type is set,
// it will add the variable "contenttype" to the request.
module.exports.preload = function(request, response, nextFunc) {
    var typeId = request.params.type;
    if (db.isHash(typeId)) {
        typesDb.getByHash(typeId, function(error, typeObject) {
            replies.replyNotFoundOrPass(response, error, typeObject, function() {
                request.contenttype = typeObject;
                return nextFunc();
            });
        });
    } else {
        typesDb.getBySlug(typeId, function(error, typeObject) {
            replies.replyNotFoundOrPass(response, error, typeObject, function() {
                request.contenttype = typeObject;
                return nextFunc();
            });
        });
    }
};

// Function that simply wraps contenttypes in an envelope object and sends them.
// This function assumes that there were no errors until now; otherwise, they
// should have been handled by other middleware. The callback chain stops here.
module.exports.wrapAndSend = function(request, response) {
    var meta = response.locals.meta || {},
        nav;
    if (response.locals.paginator) {
        nav = replies.paginate(response.locals.paginator);
    } else {
        nav = null;
    }
    return replies.wrapAndSend(
        response, null, meta, nav, response.locals.contenttypes
    );
};

// Function that returns a contenttype by id (hash/slug).
module.exports.getById = function(request, response, nextFunc) {
    // Contenttype is already preloaded, so we just pass it to the response.
    response.locals.contenttypes = [request.contenttype];
    return nextFunc();
};

// Function that creates a new contenttype.
module.exports.postType = function(request, response) {
    var contenttype = request.body;
    // Create an id.
    contenttype._id = db.getId();
    // Ensure field "name" is present.
    if (!_.has(contenttype, 'name')) {
        return replies.replyBadRequest(response, 'Field "name" is missing');
    }
    // Create timestamps.
    contenttype.created = db.toDbTime();
    contenttype.updated = contenttype.created;
    // Create the contenttype.
    typesDb.createNew(contenttype, function(error, contenttypeObject) {
        return replies.replyCreatedOrError(response, error, contenttypeObject);
    });
};

// Function that updates an existing contenttype.
module.exports.putType = function(request, response) {
    var oldType = request.contenttype,
        newType = request.body;
    // Transfer id.
    newType._id = oldType._id;
    // Ensure field "name" is present.
    if (!_.has(newType, 'name')) {
        return replies.replyBadRequest(response, 'Field "name" is missing');
    }
    // Update/transfer timestamps.
    if (_.has(oldType, 'created')) {
        newType.created = oldType.created;
    }
    newType.updated = db.toDbTime();
    typesDb.update(newType, function(error, typeObject) {
        return replies.replyUpdatedOrError(response, error, typeObject);
    });
};

// Function which checks if a contenttype exists based on name.
module.exports.ensureNotExists = function(request, response, nextFunc) {
    var newType = request.body;
    typesDb.getByName(newType.name, function(error, contentType) {
        replies.replyConflictOrPass(response, error, contentType, function() {
            return nextFunc();
        });
    });
};

// Function that returns all contenttypes with support for pagination.
// Query options:
// - page=[0-9]* 1-indexed page number to get.
// - pagesize=[0-9]* Number of items to show per page.
module.exports.getTypes = function(request, response, nextFunc) {
    var pageNum = parseInt(request.query.page);
    var pageSize = parseInt(request.query.pagesize);
    // Set some pagination defaults when no query parameters are provided.
    pageNum = (isNaN(pageNum) ? 1 : pageNum);
    pageSize = (isNaN(pageSize) ? 10 : pageSize);
    // Search and paginate.
    typesDb.countActive(function(error, typeCount) {
        replies.replyErrorOrPass(response, error, function() {
            var typePager = new pager(typeCount, pageSize, pageNum);
            if (pageNum > typePager.last) {
                // Pretend we're on the last page when we exceed boundaries.
                typePager.page = typePager.last;
            }
            typesDb.getTypes(
                typePager.skip,
                typePager.perpage,
                function(error, types) {
                    return replies.replyErrorOrPass(response, error, function() {
                        response.locals.contenttypes = types;
                        response.locals.paginator = typePager;
                        return nextFunc();
                    });
                }
            );
        });
    });
};
