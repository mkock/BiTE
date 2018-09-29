/*******************************************************************************
 * This file is part of the BiTE package.
*******************************************************************************/

/* jshint node: true */
'use strict';

// Load dependencies.
var _ = require('underscore');
var debug = require('debug')('bite:api');
var pager = require('data-pager');
var async = require('async');
var config = require('./../core/config');
var db = require('./../core/database');
var tagsDb = require('./../models/tags');
var templatesDb = require('./../models/templates');
var itemsDb = require('./../models/contentitems');
var sync = require('./../models/sync');
var replies = require('./../core/replies');
var delegate = require('./../core/delegate');
var generic = require('./../core/generic');

// Function that simply wraps tags in an envelope object and sends them.
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
        response, null, meta, nav, response.locals.tags
    );
};

// Function that finds a tag by id (hash/slug).
// Query options:
// - extendtemplates=[yes|no] Whether or not to extend template stubs
//   into full-fledged objects.
module.exports.getById = function(request, response, nextFunc) {
    response.locals.tags = [request.tag];
    return nextFunc();
};

// Function that iterates over a list of tags, and for each one,
// replaces the template id with a full-fledged template object.
module.exports.extendTagsWithTemplates = function(request, response, nextFunc) {
    var extendTemplates = generic.isTruthy(request.query.extendtemplates),
        tags = response.locals.tags;
    if (!extendTemplates || tags.length === 0) {
        // Skip this entire middleware if "extendtemplates" option is falsey.
        return nextFunc();
    }
    async.each(tags, function(tag, asyncNext) {
        templatesDb.getByHash(tag.template, function(error, template) {
            if (!error) {
                tag.template = template;
            }
            return asyncNext(error);
        });
    }, function(error) {
        return replies.replyErrorOrPass(response, error, nextFunc);
    });
};

// Function that iterates over a list of tags, and for each one, inserts the
// first contentitem according to its priority.
module.exports.extendTagsWithFirstItems = function(request, response, nextFunc) {
    var extendFirstItems = generic.isTruthy(request.query.extendfirstitems),
        tags = response.locals.tags;
    if (!extendFirstItems || tags.length === 0) {
        // Skip this entire middleware if "includefirstitems" option is falsey.
        return nextFunc();
    }
    debug('Begin extending tags with first items');
    async.each(tags, function(tag, asyncNext) {
        itemsDb.getFirstByTag(tag, function(error, items) {
            var tagClone;
            if (!error) {
                tagClone = _.clone(tag);
                // Assign full object to correct position in list.
                tag.firstContentItem = _.first(items);
                // Instead of a list of tag stubs, we just want our
                // firstContentItem to contain a single (full) tag.
                if (_.isObject(tag.firstContentItem)) {
                    delete tag.firstContentItem.tags;
                    tag.firstContentItem.tag = tagClone;
                }
            }
            return asyncNext(error);
        });
    }, function(error) {
        debug('Done extending tags with first items');
        return replies.replyErrorOrPass(response, error, nextFunc);
    });
};

// Function that iterates over a list of tags, and for each one, rewrites & adds
// some information from first contentitem for dynamic tags.
module.exports.reformDynamicTags = function(request, response, nextFunc) {
    var tags = response.locals.tags;
    debug('Begin extending dynamic tags');
    async.map(tags, function(tag, asyncNext) {
        if (_.has(tag.image, 'images') && _.isObject(tag.image.images)) {
            if (tag.imageStrategy === 'article') {
                tag.image.images = tag.image.images.article;
            } else if (tag.imageStrategy === 'default') {
                tag.image.images = tag.image.images.default;
            }
        }
        return asyncNext(null, tag);
    }, function(error, tags) {
        response.locals.tags = tags;
        debug('Done extending dynamic tags');
        return nextFunc();
    });
};

// Function that trims down the image objects.
module.exports.trimImages = function(request, response, nextFunc) {
    var tags = response.locals.tags,
        doTrim = function(value, key) {
            delete value.secure_url;
            delete value.uploadPath;
            return [key, value];
        };
    debug('Begin trimming images');
    _.each(tags, function(tag) {
        // Trim images nested in tags.
        if (_.has(tag, 'image') && _.has(tag.image, 'images')) {
            if (_.has(tag.image.images, 'article')) {
                tag.image.images = _.object(
                    _.map(tag.image.images.article, doTrim)
                );
            } else if (_.has(tag.image.images, 'default')) {
                tag.image.images = _.object(
                    _.map(tag.image.images.default, doTrim)
                );
            } else {
                tag.image.images = _.object(_.map(tag.image.images, doTrim));
            }
        }
        // Trim images nested in firstContentItems.
        if (_.has(tag, 'firstContentItem') &&
            _.has(tag.firstContentItem, 'image') &&
            _.has(tag.firstContentItem.image, 'images')) {
            tag.firstContentItem.image.images = _.object(
                _.map(tag.firstContentItem.image.images, doTrim)
            );
        }
    });
    debug('Done trimming images');
    return nextFunc();
};

// Function that synchronizes a tag against its external source.
module.exports.synchronize = function(request, response) {
    // Synchronize tag asynchronously.
    sync.syncTag(request.tag, function(error, tagObject) {
        if (error) {
            console.log(error);
        }
    });
    replies.replyUpdatedOrError(response, null, 'OK');
};

// Middleware that automatically synchronizes tags with BOND upon any GET
// request, if, and only if, their "synced" timestamps are sufficiently
// old.
// Note: You can provide the query parameter "autosync=no" to skip autosync.
module.exports.autosync = function(request, response, nextFunc) {
    var autosync = generic.isNotFalsy(request.query.autosync);
    if (autosync) {
        // Delay sync until we've had a chance to serve the request.
        setTimeout(function() {
            // Fetch all tags not synchronized within the last "syncDelta" seconds.
            tagsDb.getNotSyncedSince(config.bond.syncDelta, function(error, tags) {
                if (error) {
                    console.log('Autosync: ' + error);
                }
                if (_.isNull(tags)) {
                    return;
                }
                async.each(tags, function(tag, asyncNext) {
                    sync.syncTag(tag, function(error, tag) {
                        return asyncNext(error);
                    });
                }, function(error) {
                    if (error) {
                        console.log('Autosync error: ' + error);
                    }
                });
            });
        }, 1000);
    }
    // We don't wait for synchronization to complete;
    // that would cause insufferable delays.
    return nextFunc();
};

// Function that creates a new tag.
module.exports.postTag = function(request, response) {
    var tag = request.body;
    tag._id = db.getId();
    tagsDb.createNew(tag, function(error, tagObject) {
        if (!error) {
            // Synchronize tag asynchronously.
            process.nextTick(function() {
                sync.syncTag(tagObject, function(error, tagObject) {
                    if (error) {
                        console.log(error);
                    }
                });
            });
            // Emit "tag-added" event.
            delegate.emit('tag-added', tagObject);
        }
        replies.replyCreatedOrError(response, error, tagObject);
    });
};

// Function that updates an existing tag.
module.exports.putTag = function(request, response) {
    var oldTag = request.tag;
    var newTag = request.body;
    newTag._id = oldTag._id;
    tagsDb.update(newTag, function(error, tagObject) {
        // Synchronize tag asynchronously.
        sync.syncTag(tagObject, function(error, tagObject) {
            if (error) {
                console.log(error);
            }
        });
        return replies.replyUpdatedOrError(response, error, tagObject);
    });
};

// Function which preloads a tag based on id or slug, and attaches it
// to the request if it does. Provided that request.params.tag is set,
// it will add the variable "tag" to the request.
module.exports.preload = function(request, response, nextFunc) {
    var tagId = request.params.tag;
    if (db.isHash(tagId)) {
        tagsDb.getByHash(tagId, function(error, tag) {
            replies.replyNotFoundOrPass(response, error, tag, function() {
                request.tag = tag;
                return nextFunc();
            });
        });
    } else {
        tagsDb.getBySlug(tagId, function(error, tag) {
            replies.replyNotFoundOrPass(response, error, tag, function() {
                request.tag = tag;
                return nextFunc();
            });
        });
    }
};

// Function which checks if a tag exists based on name.
module.exports.ensureNotExists = function(request, response, nextFunc) {
    var newTag = request.body;
    tagsDb.getByName(newTag.tag, function(error, tag) {
        replies.replyConflictOrPass(response, error, tag, function() {
            return nextFunc();
        });
    });
};

// Function that returns all tags, or a subset if there are a lot of them.
// Query options:
// - pagenum=[0-9]* 1-indexed page number to fetch.
// - pagesize=[0-9]* Number of items to show per page.
// - filter=all|tiles|menu Set limitation on type of tags to fetch
//   (default is 'all').
// - extendtemplates=[yes|no] Whether or not to extend template stubs
//   into full-fledged objects.
module.exports.getTags = function(request, response, nextFunc) {
    var pageNum = parseInt(request.query.page),
        pageSize = parseInt(request.query.pagesize),
        filter = request.query.filter || 'all';
    if (filter === 'frontpage') {
        return replies.replyBadRequest(
            response, 'Option "filter=frontpage" makes no sense in this context.'
        );
    }
    // Set some pagination defaults when no query parameters are provided.
    pageNum = (isNaN(pageNum) ? 1 : pageNum);
    pageSize = (isNaN(pageSize) ? 10 : pageSize);
    // Search and paginate.
    tagsDb.count(filter, function(error, tagCount) {
        replies.replyErrorOrPass(response, error, function() {
            var tagPager = new pager(tagCount, pageSize, pageNum);
            if (pageNum > tagPager.last) {
                // Pretend we're on the last page when we exceed boundaries.
                tagPager.page = tagPager.last;
            }
            tagsDb.getTags(
                filter,
                tagPager.skip,
                tagPager.perpage,
                function(error, tags) {
                    return replies.replyErrorOrPass(response, error, function() {
                        response.locals.tags = tags;
                        response.locals.paginator = tagPager;
                        return nextFunc();
                    });
                }
            );
        });
    });
};

// Function that preloads the set of tags that match the filter provided as
// a query parameter. Note that if the "filter" parameter is not present, or
// has the value "all", no tags are preloaded. The purpose of this function
// is to be able to limit searches after contentitems based on tag filtering.
module.exports.preloadFiltered = function(request, response, nextFunc) {
    var filter = request.query.filter || 'all';
    if (filter === 'all') {
        // Skip preloading.
        return nextFunc();
    }
    tagsDb.getTags(filter, null, null, function(error, tags) {
        return replies.replyErrorOrPass(response, error, function() {
            response.locals.filterTags = _.map(
                tags, function(tag) { return tag._id.toString(); }
            );
            return nextFunc();
        });
    });
};

// Function that deletes a tag.
module.exports.deleteTag = function(request, response, nextFunc) {
    tagsDb.remove(request.tag, function(error, result) {
        return replies.replyFoundOrError(response, error, result);
    });
};

// Function that sets a new priority for a tag.
module.exports.setPriority = function(request, response, nextFunc) {
    var priority = parseInt(request.params.prio);
    if (_.isFinite(priority) && priority >= 0) {
        tagsDb.setPriority(request.tag, priority, function(error, tag) {
            return replies.replyUpdatedOrError(response, error, tag);
        });
    } else {
        return replies.replyBadRequest(
            response, 'Priority must be a positive integer'
        );
    }
};
