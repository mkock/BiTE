/*******************************************************************************
 * This file is part of the BiTE package.
*******************************************************************************/

/* jshint node: true */
'use strict';

// Load dependencies.
var _ = require('underscore');
var debug = require('debug');
var async = require('async');
var util = require('util');
var url = require('url');
var pager = require('data-pager');
var db = require('./../core/database');
var itemsDb = require('./../models/contentitems');
var templatesDb = require('./../models/templates');
var tagsDb = require('./../models/tags');
var replies = require('./../core/replies');
var delegate = require('./../core/delegate');
var config = require('./../core/config');
var generic = require('./../core/generic');

// Function which preloads a contentitem based on id or slug, and attaches it
// to the request if it does. Provided that request.params.item is set,
// it will add the variable "contentitem" to the request.
module.exports.preload = function(request, response, nextFunc) {
    var itemId = request.params.item;
    if (db.isHash(itemId)) {
        itemsDb.getByHash(itemId, function(error, item) {
            replies.replyNotFoundOrPass(response, error, item, function() {
                request.contentitem = item;
                return nextFunc();
            });
        });
    } else {
        itemsDb.getBySlug(itemId, function(error, item) {
            replies.replyNotFoundOrPass(response, error, item, function() {
                request.contentitem = item;
                return nextFunc();
            });
        });
    }
};

// Function that simply wraps contentitems in an envelope object and sends them.
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
        response, null, meta, nav, response.locals.contentitems
    );
};

// Function that iterates over a list of contentitems, and for each one,
// replaces a list of tag stubs with a list of full tag objects.
module.exports.extendItemsWithTags = function(request, response, nextFunc) {
    var extendTags = generic.isNotFalsy(request.query.extendtags),
        items = response.locals.contentitems;
    if (!extendTags || items.length === 0) {
        // Skip this entire middleware if "extendtags" option is falsy.
        return nextFunc();
    }
    async.each(items, function(item, asyncNext) {
        module.exports.extendTags(item.tags, function(error, tags) {
            if (!error) {
                item.tags = tags;
            }
            return asyncNext(error);
        });
    }, function(error) {
        return replies.replyErrorOrPass(response, error, nextFunc);
    });
};

// Utility function that extends a list of tags with full template objects.
var extendTagTemplates = function(tags, nextFunc) {
    if (tags.length === 0) {
        return nextFunc(null, tags);
    }
    async.each(tags, function(tag, asyncNext) {
        templatesDb.getByHash(tag.template, function(error, template) {
            if (!error) {
                tag.template = template;
            }
            return asyncNext(error);
        });
    }, function(error) {
        return nextFunc(error, tags);
    });
};

// Function that iterates over a list of contentitems, and for each one,
// replaces a list of "tags" or a single "tag" with corresponding tags
// containing full template objects.
module.exports.extendItemsWithTemplates = function(request, response, nextFunc) {
    var extendTemplates = (generic.isNotFalsy(request.query.extendtags) &&
        generic.isNotFalsy(request.query.extendtemplates)),
        items = response.locals.contentitems;
    if (!extendTemplates || items.length === 0) {
        // Skip this entire middleware if "extendtemplates" option is falsey.
        return nextFunc();
    }
    async.each(items, function(item, asyncNext) {
        extendTagTemplates(item.tags, function(error, tags) {
            if (!error) {
                item.tags = tags;
            }
            return asyncNext(error);
        });
    }, function(error) {
        return replies.replyErrorOrPass(response, error, nextFunc);
    });
};

// Extends a list of tags with their full object representations.
// Note; it's possible to optimize the algorithm here by first checking how
// many unique tag id's we need to fetch, and then only fetching each one once.
// Then we'll need a list to keep track of preloaded tags.
module.exports.extendTags = function(tags, nextFunc) {
    if (tags.length === 0) {
        // No tags to extend.
        return nextFunc(null, tags);
    }
    async.each(tags, function(tag, asyncNext) {
        tagsDb.getByHash(tag.tagId, function(error, fullTag) {
            var pos = tags.indexOf(tag);
            if (!error) {
                tags[pos] = fullTag;
            }
            return asyncNext(error);
        });
    }, function(error) {
        return nextFunc(error, tags);
    });
};

// Function that returns a fixed number of contentitems for the frontpage.
module.exports.getFrontPage = function(request, response, nextFunc) {
    return itemsDb.getFrontPage(function(error, items) {
        return replies.replyErrorOrPass(response, error, function() {
            response.locals.contentitems = items;
            return nextFunc();
        });
    });
};

// Function that finds a contentitem by id or slug.
// Query options:
// - trimitem=[yes|no] Whether or not to omit remote content (default=no).
// - skipcache=[yes|no] Whether or not to skip cache (default=no).
//   Only relevant when trimitem=no.
// - extendtags=[yes|no] Whether or not to extend nested tag stubs with full
//   objects.
module.exports.getById = function(request, response, nextFunc) {
    // Simply pass the preloaded contentitem to the response.
    response.locals.contentitems = [request.contentitem];
    return nextFunc();
};

// Function that finds all contentitems that contain the given tag id or slug.
// Query options:
// - pubfrom=[0-9]* Fetch only items published after this timestamp.
// - pubto=[0-9]* Fetch only items published before this timestamp.
// - pagenum=[0-9]* 1-indexed page number to fetch (default=1).
// - pagesize=[0-9]* Number of items per page (default=10).
// - trimitem=[yes|no] Whether or not to omit remote content (default=no).
// - skipcache=[yes|no] Whether or not to skip cache (default=no).
// - extendtags=[yes|no] Whether or not to extend nested tag stubs with full
//   objects.
// - sortby=upvotes|downvotes|views|priority
// TODO: sortby=priority does not work as intended - use aggregation.
module.exports.getByTag = function(request, response, nextFunc) {
    var tagId = request.tag._id.toString(),
        pubFrom = parseInt(request.query.pubfrom),
        pubTo = parseInt(request.query.pubto),
        pageNum = parseInt(request.query.page),
        pageSize = parseInt(request.query.pagesize),
        sortBy = request.query.sortby || 'priority';
    pageNum = (isNaN(pageNum) ? 1 : pageNum);
    pageSize = (isNaN(pageSize) ? config.pagination.defaultPageSize : pageSize);
    // Search and paginate.
    itemsDb.getByTag(
        tagId, sortBy, pubFrom, pubTo, true, null, null, function(error, itemCount) {
            return replies.replyErrorOrPass(response, error, function() {
                var itemPager = new pager(itemCount, pageSize, pageNum);
                if (pageNum > itemPager.last) {
                    // Pretend we're on the last page when we exceed boundaries.
                    itemPager.page = itemPager.last;
                }
                itemsDb.getByTag(
                    tagId,
                    sortBy,
                    pubFrom,
                    pubTo,
                    false,
                    itemPager.skip,
                    itemPager.perpage,
                    function(error, items) {
                        return replies.replyErrorOrPass(response, error, function() {
                            // Done. Store items in request scope and trigger
                            // the callback.
                            response.locals.contentitems = items;
                            response.locals.paginator = itemPager;
                            return nextFunc();
                        });
                    }
                );
            });
        }
    );
};

// Function that fetches a single contentitem - specifically, the first one
// appearing in the tag.
// Query options:
// - trimitem=[yes|no] Whether or not to omit remote content (default=no).
// - skipcache=[yes|no] Whether or not to skip cache (default=no).
//   Only relevant when trimitem=no.
// - extendtags=[yes|no] Whether or not to extend nested tag stubs with full
//   objects.
module.exports.getFirstByTag = function(request, response, nextFunc) {
    var tagId = request.tag._id.toString();
    itemsDb.getFirstByTag(tagId, function(error, items) {
        return replies.replyNotFoundOrPass(response, error, items, function() {
            response.locals.contentitems = items;
            return nextFunc();
        });
    });
};

// Function that fetches a single contentitem - specifically, the last one
// appearing in the tag.
// Query options:
// - trimitem=[yes|no] Whether or not to omit remote content (default=no).
// - skipcache=[yes|no] Whether or not to skip cache (default=no).
//   Only relevant when trimitem=no.
// - extendtags=[yes|no] Whether or not to extend nested tag stubs with full
//   objects.
module.exports.getLastByTag = function(request, response, nextFunc) {
    var tagId = request.tag._id.toString();
    itemsDb.getLastByTag(tagId, function(error, items) {
        return replies.replyNotFoundOrPass(response, error, items, function() {
            response.locals.contentitems = items;
            return nextFunc();
        });
    });
};

// Function that fetches a single contentitem - specifically, the one
// immediately after the one identified in the URL.
// Query options:
// - trimitem=[yes|no] Whether or not to omit remote content (default=no).
// - skipcache=[yes|no] Whether or not to skip cache (default=no).
//   Only relevant when trimitem=no.
// - extendtags=[yes|no] Whether or not to extend nested tag stubs with full
//   objects.
module.exports.getNextByTag = function(request, response, nextFunc) {
    itemsDb.getNextByTag(request.tag, request.contentitem, function(error, items) {
        return replies.replyNotFoundOrPass(response, error, items, function() {
            response.locals.contentitems = items;
            return nextFunc();
        });
    });
};

// Function that fetches a single contentitem - specifically, the one
// immediately preceding the one identified in the URL.
// Query options:
// - trimitem=[yes|no] Whether or not to omit remote content (default=no).
// - skipcache=[yes|no] Whether or not to skip cache (default=no).
//   Only relevant when trimitem=no.
// - extendtags=[yes|no] Whether or not to extend nested tag stubs with full
//   objects.
module.exports.getPrevByTag = function(request, response, nextFunc) {
    itemsDb.getPrevByTag(request.tag, request.contentitem, function(error, items) {
        return replies.replyNotFoundOrPass(response, error, items, function() {
            response.locals.contentitems = items;
            return nextFunc();
        });
    });
};

// Function that fetches a single contentitem - specifically, the one identified
// in the URL.
// Query options:
// - trimitem=[yes|no] Whether or not to omit remote content (default=no).
// - skipcache=[yes|no] Whether or not to skip cache (default=no).
//   Only relevant when trimitem=no.
// - extendtags=[yes|no] Whether or not to extend nested tag stubs with full
//   objects.
module.exports.getOneByTag = function(request, response, nextFunc) {
    itemsDb.getOneByTag(request.tag, request.contentitem, function(error, items) {
        return replies.replyNotFoundOrPass(response, error, items, function() {
            response.locals.contentitems = items;
            return nextFunc();
        });
    });
};

// Function that creates a new contentitem.
module.exports.postItem = function(request, response) {
    var contentItem = request.body;
    contentItem._id = db.getId();
    // Ensure field "name" is present.
    if (!_.has(contentItem, 'name')) {
        return replies.replyBadRequest(response, 'Field "name" is missing');
    }
    itemsDb.createNew(contentItem, function(error, contentItemObject) {
        replies.replyCreatedOrError(response, error, contentItemObject);
    });
};

// Function that updates an existing contentitem.
module.exports.putItem = function(request, response) {
    var newItem = request.body;
    newItem._id = request.contentitem._id;
    // Ensure field "name" is present.
    if (!_.has(newItem, 'name')) {
        return replies.replyBadRequest(response, 'Field "name" is missing');
    }
    itemsDb.update(newItem, function(error, itemObject) {
        replies.replyUpdatedOrError(response, error, itemObject);
    });
};

// Function that upvotes a contentitem by increasing the "upvotes" field.
module.exports.upvote = function(request, response) {
    var ip = request._remoteAddress,
        userAgent = request.headers['user-agent'];
    itemsDb.upvote(request.contentitem, function(error, itemObject) {
        if (!error) {
            // Log the view, but don't wait for it before replying the client.
            itemsDb.logUpvote(itemObject, ip, userAgent, _.noop);
            // Emit "item-upvoted" event to the talk module.
            delegate.emit('item-upvoted', itemObject);
        }
        return replies.replyUpdatedOrError(response, error, itemObject);
    });
};

// Function that upvotes a contentitem by increasing the "upvotes" field.
module.exports.downvote = function(request, response) {
    var ip = request._remoteAddress,
        userAgent = request.headers['user-agent'];
    itemsDb.downvote(request.contentitem, function(error, itemObject) {
        if (!error) {
            // Log the view, but don't wait for it before replying the client.
            itemsDb.logDownvote(itemObject, ip, userAgent, _.noop);
            // Emit "item-upvoted" event to the talk module.
            delegate.emit('item-downvoted', itemObject);
        }
        return replies.replyUpdatedOrError(response, error, itemObject);
    });
};

// Function that adds a view to a contentitem by increasing the "views" field.
module.exports.addView = function(request, response) {
    var ip = request._remoteAddress,
        userAgent = request.headers['user-agent'];
    itemsDb.addView(request.contentitem, function(error, itemObject) {
        if (!error) {
            // Log the view, but don't wait for it before replying the client.
            itemsDb.logView(itemObject, ip, userAgent, _.noop);
            // Emit "item-viewed" event to the talk module.
            delegate.emit('item-viewed', itemObject);
        }
        return replies.replyUpdatedOrError(response, error, itemObject);
    });
};

// Function that adds a view to a contentitem by increasing the "views" field.
// It will act as part of the routing call chain if nextFunc is given.
module.exports.thenAddView = function(request, response, nextFunc) {
    var addView = generic.isNotFalsy(request.query.addview),
        item = _.first(response.locals.contentitems),
        ip = request._remoteAddress,
        userAgent = request.headers['user-agent'];
    if (addView) {
        itemsDb.addView(item, function(error, item) {
            if (!error) {
                // Log the view, but don't wait for it before replying the client.
                itemsDb.logView(item, ip, userAgent, _.noop);
                // Emit "item-viewed" event to the talk module.
                delegate.emit('item-viewed', item);
            }
            // Replace the updated item in the response.
            response.locals.contentitems = [item];
            return nextFunc();

        });
    } else {
        return nextFunc();
    }
};

// Function that adds an existing tag to a contentitem.
module.exports.addTag = function(request, response) {
    var item = request.contentitem,
        priority = parseInt(request.query.priority) || 1;
    itemsDb.addTag(item, request.tag, priority);
    itemsDb.update(item, function(error, itemObject) {
        return replies.replyUpdatedOrError(response, error, itemObject);
    });
};

// Function that removes a tag from a contentitem.
module.exports.removeTag = function(request, response) {
    var item = request.contentitem,
        untaggedItem;
    untaggedItem = itemsDb.removeTag(item, request.tag);
    itemsDb.update(untaggedItem, function(error, itemObject) {
        return replies.replyUpdatedOrError(response, error, itemObject);
    });
};

// Middleware function that checks a contentitem for a contenttype and
// if it exists.
module.exports.checkContentType = function(request, response, nextFunc) {
    var contentItem = request.body;
    itemsDb.checkContentType(contentItem, function(error, result) {
        replies.replyErrorOrPass(response, error, nextFunc);
    });
};

// Middleware function that checks a contentitem for tags and if they exist.
module.exports.checkTags = function(request, response, nextFunc) {
    var contentItem = request.body;
    itemsDb.checkTags(contentItem, function(error, result) {
        replies.replyErrorOrPass(response, error, nextFunc);
    });
};

// Function that returns all contentitems, or a subset
// if there are a lot of them.
// Query options:
// - trimitem=[yes|no] Whether or not to omit remote content (default=no).
// - skipcache=[yes|no] Whether or not to skip cache (default=no).
//   Only relevant when trimitem=no.
// - page=[0-9]* 1-indexed page offset for pagination
// - pagesize=[0-9]* Nr of items to show per page (defaults to 10)
// - sortby=upvotes|downvotes|views|name|priority
// - extendtags=yes|no Whether or not to replace tag stubs with full objects
// - filter=frontpage|menu|tiles Provide a filter to limit contentitems
module.exports.getItems = function(request, response, nextFunc) {
    var pageNum = parseInt(request.query.page),
        pageSize = parseInt(request.query.pagesize),
        sortBy = request.query.sortby || 'name',
        searchCriteria;
    // Prohibit option sortby=priority as it only makes sense with tags.
    if (sortBy === 'priority') {
        return replies.replyBadRequest(
            response, 'Option "sortby=priority" makes no sense in this context.'
        );
    }
    // Set some pagination defaults when no query parameters are provided.
    pageNum = (isNaN(pageNum) ? 1 : pageNum);
    pageSize = (isNaN(pageSize) ? config.pagination.defaultPageSize : pageSize);
    // Create search criteria based on tag filtration, if any.
    if (response.locals.filterTags && response.locals.filterTags.length > 0) {
        searchCriteria = {'tags.tagId': {'$in': response.locals.filterTags}};
    } else {
        searchCriteria = {};
    }
    // Search and paginate.
    itemsDb.count(searchCriteria, function(error, itemCount) {
        return replies.replyErrorOrPass(response, error, function() {
            var itemPager = new pager(itemCount, pageSize, pageNum);
            if (pageNum > itemPager.last) {
                // Pretend we're on the last page when we exceed boundaries.
                itemPager.page = itemPager.last;
            }
            itemsDb.getItems(
                searchCriteria,
                sortBy,
                itemPager.skip,
                itemPager.perpage,
                function(error, items) {
                    return replies.replyErrorOrPass(response, error, function() {
                        response.locals.contentitems = items;
                        response.locals.paginator = itemPager;
                        return nextFunc();
                    });
                }
            );
        });
    });
};

// Function that synchronizes a single contentitem with its external source.
module.exports.synchronize = function(request, response) {
    var syncOptions = {
        'skipCache': true,
        'includeBody': true
    };
    process.nextTick(function() {
        itemsDb.sync(request.contentitem, syncOptions, function(error, item) {
            if (error) {
                console.log(error);
            }
        });
    });
    return replies.replyUpdatedOrError(response, null, 'OK');
};

// Function that adds context navigation to the response, which consists mainly
// of absolute URLs to the previous and the next contentitem in a tag context.
// It does this by adding it to the "meta" field of the response.
module.exports.addContextNav = function(request, response, nextFunc) {
    var tag = request.tag,
        items = response.locals.contentitems,
        next = _.after(3, nextFunc);
    if (!_.isArray(items) || items.length !== 1) {
        // We need an array with exactly one contentitem in order for context
        // navigation to make sense.
        return nextFunc();
    }
    // Function that generates the navigation URLs and keeps track of progress.
    var addNavigation = function(navType, item) {
        var nav;
        if (_.isObject(item)) {
            nav = {
                'ref': util.format(
                    '%s/%s',
                    tag.slug || tag._id.toString(),
                    item.slug || item._id.toString()
                ),
                'query': url.parse(request.url).query || ''
            };
            response.locals.navigation[navType] = nav;
        }
        return next();
    };
    // Assign the item.
    response.locals.navigation = {};
    // Load prev, current & next items.
    itemsDb.getPrevByTag(tag, _.first(items), function(error, items) {
        return addNavigation('prev', _.first(items));
    });
    addNavigation('current', _.first(items));
    itemsDb.getNextByTag(tag, _.first(items), function(error, items) {
        return addNavigation('next', _.first(items));
    });
};

// Function that reforms dynamic tags embedded within items when full tags
// are provided. Call this function before any of the "trim" functions.
module.exports.reformTags = function(request, response, nextFunc) {
    var items = response.locals.contentitems;
    _.each(items, function(item) {
        _.each(item.tags, function(tag) {
            if (_.has(tag.image, 'images')) {
                if (tag.imageStrategy === 'article') {
                    tag.image.images = tag.image.images.article;
                } else if (tag.imageStrategy === 'default') {
                    tag.image.images = tag.image.images.default;
                }
            }
        });
    });
    return nextFunc();
};

// Function that trims body content from all contentitem if the query
// option "trimitems" is truthy.
module.exports.trimContent = function(request, response, nextFunc) {
    var trimItems = generic.isTruthy(request.query.trimitems);
    if (response.locals.contentitems && trimItems) {
        _.each(response.locals.contentitems, function(item) {
            delete item.body;
        });
    }
    return nextFunc();
};

// Function that trims down contentitems to remove excessive fields.
module.exports.trimExcess = function(request, response, nextFunc) {
    if (response.locals.contentitems) {
        debug('Begin trimming excess fields');
        _.each(response.locals.contentitems, function(item) {
            if (_.has(item, 'image')) {
                // Remove some fields from item.image.
                delete item.image.imagePrev;
                delete item.image.imageCached;
                // Remove some fields from item.image.images.
                if (_.has(item.image, 'images')) {
                    _.each(item.image.images, function(value, key) {
                        delete item.image.images[key].secure_url;
                        delete item.image.images[key].uploadPath;
                    });
                }
                // Remove some fields from item.tags.
                _.each(item.tags, function(tag) {
                    if (_.has(tag, 'image')) {
                        delete tag.image.imageCached;
                        if (_.has(tag.image, 'images')) {
                            _.each(tag.image.images, function(value, key) {
                                delete tag.image.images[key].secure_url;
                                delete tag.image.images[key].uploadPath;
                            });
                        }
                    }
                });
            }
        });
        debug('Done trimming excess fields');
    }
    return nextFunc();
};
