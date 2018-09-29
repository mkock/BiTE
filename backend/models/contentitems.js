/*******************************************************************************
 * This file is part of the BiTE package.
*******************************************************************************/

/* jshint node: true */
'use strict';

// Load dependencies.
var _ = require('underscore');
var async = require('async');
var util = require('util');
var generic = require('./../core/generic');
var db = require('./../core/database');
var sync = require('./sync');
var tagsDb = require('./tags');
var typesDb = require('./contenttypes');
var feed = require('./feed');

// Utility function that returns a MongoDB sorting order based on a string
// with one of the values "min|max".
var toSortOrder = function(sortString) {
    // 1 = ASC, -1 = DESC.
    // DESC is the default for noninterpretable values.
    return (sortString === 'min' ? 1 : -1);
};

// Utility function that returns an object which can be used directly as
// MongoDB search criteria.
var toSortCriteria = function(criteria) {
    var sortCriteria;
    if (criteria === 'upvotes') {
        sortCriteria = {'upvotes': -1};
    } else if (criteria === 'downvotes') {
        sortCriteria = {'downvotes': -1};
    } else if (criteria === 'views') {
        sortCriteria = {'views': -1};
    } else if (criteria === 'priority') {
        sortCriteria = {'tags.prio': 1};
    } else if (criteria === 'name') {
        sortCriteria = {'name': 1};
    } else if (criteria === 'published') {
        sortCriteria = {'published': -1};
    } else {
        // Fallback sorting order. But usually, the default value will be
        // defined in the API layer.
        sortCriteria = {'name': 1};
    }
    return sortCriteria;
};

// Utility function that converts each item tag object into a list.
// Note: After using $unwind in the MongoDB aggregate() calls, items.tags will
// be a single object, which needs to be converted back into an array.
var rewindTags = function(items) {
   for (var index = 0; index < items.length; index++) {
        items[index].tags = [items[index].tags];
    }
};

// Function that checks if contenttype exists.
module.exports.checkContentType = function(item, nextFunc) {
    if (!_.has(item, 'typeId')) {
        // Nothing to check.
        nextFunc(null, true);
    }
    (function(typeId) {
        typesDb.getByHash(typeId, function(error, contenttype) {
            var notFoundError;
            if (error) {
                nextFunc(error, null);
            } else if (!contenttype) {
                notFoundError = new Error(
                    util.format('No contenttype with id %s', typeId)
                );
                nextFunc(notFoundError, null);
            } else {
                nextFunc(null, true);
            }
        });
    })(item.typeId);
};

// Function that checks if array of tag id's exist.
module.exports.checkTags = function(item, nextFunc) {
    if (!_.has(item, 'tags') || _.isEmpty(item.tags)) {
        return nextFunc(null, true);
    }
    async.each(item.tags, function(tag, asyncNext) {
        tagsDb.getByHash(tag.tagId, function(error, tag) {
            var notFoundError;
            if (!tag) {
                notFoundError = new Error(util.format(
                    'No tag with id %s', tag.tagId
                ));
            }
            return asyncNext(error || notFoundError);
        });
    }, function(error) {
        return nextFunc(error, error || true);
    });
};

// Function that fetches contentitems for the front page.
module.exports.getFrontPage = function(nextFunc) {
   tagsDb.getTags('frontpage', null, null, function(error, tags) {
        var filterTags = [];
        if (error) {
            return nextFunc(error, null);
        }
        // Gather the id's of tags that appear on the frontpage into an array.
        for (var index = 0; index < tags.length; index++) {
            filterTags.push(tags[index]._id.toString());
        }
        db.collection('contentitems')
            .find({'tags.tagId': {'$in': filterTags}})
            .sort({'published': -1})
            .limit(3)
            .toArray(function(error, items) {
                if (error) {
                    return nextFunc(error, null);
                } else if (items.length === 0) {
                    return nextFunc(null, items);
                }
                // Reduce each tag list to a single tag, which is the highest
                // prioritized one in each case.
                async.each(items, function(item, asyncNext) {
                    tagsDb.reduceToPrioritized(item.tags, function(error, tags) {
                        if (!error) {
                            item.tags = tags;
                        }
                        return asyncNext(error);
                    });
                }, function(error) {
                    return nextFunc(error, items);
                });
            });
    });
};

// Function that fetches a contentitem by hash.
module.exports.getByHash = function(hash, nextFunc) {
    db.collection('contentitems').findOne({'_id': db.getId(hash)}, {}, nextFunc);
};

// Function that fetches a contentitem by slug.
module.exports.getBySlug = function(slug, nextFunc) {
    db.collection('contentitems').findOne({'slug': slug}, {}, nextFunc);
};

// Function that fetches a contentitem by BOND nodeid.
module.exports.getByNodeId = function(nodeId, nextFunc) {
    db.collection('contentitems').findOne({'nodeId': nodeId}, {}, nextFunc);
};

// Function that fetches all contentitems with the given tag id or slug.
// Sorting is by position in the tag.
module.exports.getByTag = function(
    tagId, sortBy, pubFrom, pubTo, getTotal, skip, limit, nextFunc
) {
    var criteria, stages = [];
    // Set limitations based on tags.
    criteria = {
        'tags.tagId': tagId
    };
    // Set limitations based on publication date (published).
    if (pubFrom || pubTo) {
        criteria.published = {};
        if (pubFrom) {
            criteria.published.$gte = pubFrom;
        }
        if (pubTo) {
            criteria.published.$lt = pubTo;
        }
    }
    // Fetch/count items by constructing an array of aggregation stages.
    stages.push(
        {'$match': criteria},
        {'$unwind': '$tags'},
        {'$match': {'tags.tagId': tagId}}
    );
    if (getTotal) {
        stages.push({'$group': {'_id': true, 'count': {'$sum': 1}}});
    } else {
        stages.push({'$sort': toSortCriteria(sortBy)});
    }
    if (!getTotal && skip !== null && limit !== null) {
        stages.push({'$skip': skip}, {'$limit': limit});
    }
    // When retrieving contentitems with sortBy="priority", we need to use the
    // MongoDB aggregration framework in order to sort array content correctly;
    // To simplify things we just use aggregation framework for each query type.
    db.collection('contentitems').aggregate(
        stages, function(error, items) {
            var itemCount;
            if (!error) {
                rewindTags(items);
            }
            if (getTotal) {
                itemCount = (items.length === 1 ? items[0].count : 0);
                return nextFunc(error, itemCount);
            } else {
                return nextFunc(error, items);
            }
        }
    );
};

// Function that returns the first contentitem in the list given by a tag.
module.exports.getFirstByTag = function(tag, nextFunc) {
    var tagId = (_.isObject(tag) ? tag._id.toString() : tag),
        stages = [];
    // Find the item with the highest priority.
    stages.push(
        {'$match': {'tags.tagId': tagId}},
        {'$unwind': '$tags'},
        {'$match': {'tags.tagId': tagId}},
        {'$sort': {'tags.prio': 1}},
        {'$limit': 1}
    );
    db.collection('contentitems').aggregate(stages, function(error, items) {
        var itemCount;
        if (!error) {
            rewindTags(items);
        }
        return nextFunc(error, items);
    });
};

// Function that returns the last contentitem in the list given by a tag.
module.exports.getLastByTag = function(tag, nextFunc) {
    var tagId = (_.isObject(tag) ? tag._id.toString() : tag),
        stages = [];
    // Find the item with the lowest priority.
    stages.push(
        {'$match': {'tags.tagId': tagId}},
        {'$unwind': '$tags'},
        {'$match': {'tags.tagId': tagId}},
        {'$sort': {'tags.prio': -1}},
        {'$limit': 1}
    );
    db.collection('contentitems').aggregate(stages, function(error, items) {
        var itemCount;
        if (!error) {
            rewindTags(items);
        }
        return nextFunc(error, items);
    });
};

// Function that returns a single contentitems by tag.
// It returns the tag immediately before it unless it's already the first tag.
// In this case, null is returned.
module.exports.getPrevByTag = function(tag, item, nextFunc) {
    var tagId = tag._id.toString(),
        tagStub,
        priority,
        stages = [];
    // Find the priority of the item within the tag.
    tagStub = _.find(item.tags, function(tag) { return tag.tagId === tagId; });
    priority = parseInt(tagStub.prio);
    // Now find the next item with the same tag, and which has a lower priority
    // than the current one, sorted by priority so we get the highest of the
    // lower priorities.
    stages.push(
        {'$match': {'tags.tagId': tagId}},
        {'$unwind': '$tags'},
        {'$match': {'tags.tagId': tagId}},
        {'$match': {'tags.prio': {'$lt': priority}}},
        {'$sort': {'tags.prio': -1}},
        {'$limit': 1}
    );
    db.collection('contentitems').aggregate(stages, function(error, items) {
        var itemCount;
        if (!error) {
            rewindTags(items);
        }
        return nextFunc(error, items);
    });
};

// Function that returns a single contentitems by tag.
// It returns the tag immediately after it unless it's already the last tag.
// In this case, null is returned.
module.exports.getNextByTag = function(tag, item, nextFunc) {
    var tagId = tag._id.toString(),
        tagStub,
        priority,
        stages = [];
    // Find the priority of the item within the tag.
    tagStub = _.find(item.tags, function(tag) { return tag.tagId === tagId; });
    priority = parseInt(tagStub.prio);
    // Now find the next item with the same tag, and which has a higher priority
    // than the current one, sorted by priority so we get the lowest of the
    // higher priorities.
    stages.push(
        {'$match': {'tags.tagId': tagId}},
        {'$unwind': '$tags'},
        {'$match': {'tags.tagId': tagId}},
        {'$match': {'tags.prio': {'$gt': priority}}},
        {'$sort': {'tags.prio': 1}},
        {'$limit': 1}
    );
    db.collection('contentitems').aggregate(stages, function(error, items) {
        var itemCount;
        if (!error) {
            rewindTags(items);
        }
        return nextFunc(error, items);
    });
};

// Function that returns a single contentitems by tag.
module.exports.getOneByTag = function(tag, item, nextFunc) {
    var stages = [];
    stages.push(
        {'$match': {'_id': item._id}},
        {'$unwind': '$tags'},
        {'$match': {'tags.tagId': tag._id.toString()}},
        {'$limit': 1}
    );
    db.collection('contentitems').aggregate(stages, function(error, items) {
        var itemCount;
        if (!error) {
            rewindTags(items);
        }
        return nextFunc(error, items);
    });
};

// Function that creates a new contentitem.
module.exports.createNew = function(item, nextFunc) {
    item.slug = generic.sluggify(item.title);
    db.collection('contentitems').insert(item, function(error, result) {
        if (error) {
            return nextFunc(error, null);
        } else {
            return nextFunc(null, result.pop());
        }
    });
};

// Function that updates an existing contentitem.
// contentItem._id is the identifier used for finding the contentitem to update.
module.exports.update = function(contentItem, nextFunc) {
    var options = {'upsert': false, 'multi': false};
    // Ensure that the "updated" timestamp is set correctly.
    contentItem.updated = db.toDbTime();
    contentItem.slug = generic.sluggify(contentItem.title);
    db.collection('contentitems').update(
        {'_id': contentItem._id}, contentItem, options, function(error, result) {
            if (error) {
                return nextFunc(error, null);
            } else {
                return nextFunc(null, contentItem);
            }
        }
    );
};

// Function that upvotes a contentitem by one.
module.exports.upvote = function(contentItem, nextFunc) {
    var options = {'upsert': false, 'multi': false};
    var op = {
        '$inc': {'upvotes': 1},
        '$set': {'updated': db.toDbTime()}
    };
    db.collection('contentitems').update(
        {'_id': contentItem._id}, op, options, function(error, result) {
            if (error) {
                return nextFunc(error, null);
            } else {
                contentItem.upvotes += 1;
                return nextFunc(null, contentItem);
            }
        }
    );
};

// Function that downvotes a contentitem by one.
module.exports.downvote = function(contentItem, nextFunc) {
    var options = {'upsert': false, 'multi': false};
    var op = {
        '$inc': {'downvotes': 1},
        '$set': {'updated': db.toDbTime()}
    };
    db.collection('contentitems').update(
        {'_id': contentItem._id}, op, options, function(error, result) {
            if (error) {
                return nextFunc(error, null);
            } else {
                contentItem.downvotes += 1;
                return nextFunc(null, contentItem);
            }
        }
    );
};

// Function that adds a view to a contentitem.
module.exports.addView = function(contentItem, nextFunc) {
    var options = {'upsert': false, 'multi': false};
    var op = {
        '$inc': {'views': 1},
        '$set': {'updated': db.toDbTime()}
    };
    db.collection('contentitems').update(
        {'_id': contentItem._id}, op, options, function(error, result) {
            if (error) {
                return nextFunc(error, null);
            } else {
                contentItem.views += 1;
                return nextFunc(null, contentItem);
            }
        }
    );
};

// Function that logs a single view of a contentitem, with some client info.
module.exports.logView = function(contentItem, ip, userAgent, nextFunc) {
    var entry = {
        'itemId': contentItem._id.toString(),
        'created': db.toDbTime(),
        'client': {
            'ip': ip,
            'userAgent': userAgent
        }
    };
    db.collection('views').insert(entry, nextFunc);
};

// Function that logs a single upvote of a contentitem, with some client info.
module.exports.logUpvote = function(contentItem, ip, userAgent, nextFunc) {
    var entry = {
        'itemId': contentItem._id.toString(),
        'created': db.toDbTime(),
        'client': {
            'ip': ip,
            'userAgent': userAgent
        }
    };
    db.collection('upvotes').insert(entry, nextFunc);
};

// Function that logs a single downvote of a contentitem, with some client info.
module.exports.logDownvote = function(contentItem, ip, userAgent, nextFunc) {
    var entry = {
        'itemId': contentItem._id.toString(),
        'created': db.toDbTime(),
        'client': {
            'ip': ip,
            'userAgent': userAgent
        }
    };
    db.collection('downvotes').insert(entry, nextFunc);
};

// Functions that adds an existing tag to a contentitem.
// If the tag already exists, the priority is updated with the one given.
module.exports.addTag = function(contentItem, tag, priority) {
    var tagId = tag._id.toString(),
        computedPriority = (_.isFinite(priority) ? priority : tag.priority),
        tagStub;
    // Look for the tag and update the priority if it exists.
    tagStub = _.find(
        contentItem.tags, function(tag) {
            return tag.tagId === tagId;
        }
    );
    if (tagStub) {
        tagStub.prio = computedPriority;
    } else {
        contentItem.tags.push({
            'tagId': tag._id.toString(),
            'prio': computedPriority
        });
    }
};

// Function that removes a tag from a contentitem.
module.exports.removeTag = function(contentItem, tag) {
    var tagId = tag._id.toString();
    contentItem.tags = _.filter(contentItem.tags, function(tag) {
        return tag.tagId !== tagId;
    });
    return contentItem;
};

// Function that removes a tag from each contentitem that contains
// a reference to it.
module.exports.untag = function(tag, nextFunc) {
    var criteria = {'tags.tagId': tag._id.toString()},
        op = {'$pull': {'tags': {'tagId': tag._id.toString()}}},
        options = {'multi': true};
    db.collection('contentitems').update(criteria, op, options, nextFunc);
};

// Function that returns the total number of upvotes of all contentitems of the
// given contenttype. Also provides the total number of contentitems of that
// contenttype, along with the 'max' and 'min' number of upvotes given to any
// single contentitem.
module.exports.getUpvotesTotalByType = function(contentType, nextFunc) {
    var matching = {'$match': {'typeId': contentType._id.toString()}};
    var grouping = {
        '$group': {
            '_id': '$typeId',
            'items': {'$sum': 1},
            'upvotes': {'$sum': '$upvotes'},
            'max': {'$max': '$upvotes'},
            'min': {'$min': '$upvotes'}
        }
    };
    db.collection('contentitems').aggregate([matching, grouping], nextFunc);
};

// Function that returns the total number of downvotes of all contentitems of
// the given contenttype. Also provides the total number of contentitems of that
// contenttype, along with the 'max' and 'min' number of upvotes given to any
// single contentitem.
module.exports.getDownvotesTotalByType = function(contentType, nextFunc) {
    var matching = {'$match': {'typeId': contentType._id.toString()}};
    var grouping = {
        '$group': {
            '_id': '$typeId',
            'items': {'$sum': 1},
            'downvotes': {'$sum': '$downvotes'},
            'max': {'$max': '$downvotes'},
            'min': {'$min': '$downvotes'}
        }
    };
    db.collection('contentitems').aggregate([matching, grouping], nextFunc);
};

// Function that returns the id's of the most/least upvoted contentitems.
module.exports.getUpvotedByType = function(contentType, order, count, nextFunc) {
    db.collection('contentitems').find(
        {'typeId': contentType._id.toString()},
        {'_id': 1, 'upvotes': 1}
    )
    .sort({'upvotes': toSortOrder(order)})
    .limit(count)
    .toArray(nextFunc);
};

// Function that returns the id's of the most/least downvoted contentitems.
module.exports.getDownvotedByType = function(contentType, order, count, nextFunc) {
    db.collection('contentitems').find(
        {'typeId': contentType._id.toString()},
        {'_id': 1, 'downvotes': 1}
    )
    .sort({'downvotes': toSortOrder(order)})
    .limit(count)
    .toArray(nextFunc);
};

// Function that returns the id's of the most/least viewed contentitems.
module.exports.getViewedByType = function(contentType, order, count, nextFunc) {
    db.collection('contentitems').find(
        {'typeId': contentType._id.toString()},
        {'_id': 1, 'views': 1}
    )
    .sort({'views': toSortOrder(order)})
    .limit(count)
    .toArray(nextFunc);
};

// Function that returns the total number of upvotes of all contentitems that
// are related to the given tag. Also provides the total number of contentitems
// with that tag, along with the 'max' and 'min' number of upvotes given to any
// single contentitem.
module.exports.getUpvotesTotalByTag = function(tag, nextFunc) {
    var matching = {'$match': {'tags.tagId': tag._id.toString()}};
    var grouping = {
        '$group': {
            '_id': '$tags.tagId',
            'items': {'$sum': 1},
            'upvotes': {'$sum': '$upvotes'},
            'max': {'$max': '$upvotes'},
            'min': {'$min': '$upvotes'}
        }
    };
    db.collection('contentitems').aggregate([matching, grouping], nextFunc);
};

// Function that returns the total number of downvotes of all contentitems that
// are related to the given tag. Also provides the total number of contentitems
// with that tag, along with the 'max' and 'min' number of downvotes given to
// any single contentitem.
module.exports.getDownvotesTotalByTag = function(tag, nextFunc) {
    var matching = {'$match': {'tags.tagId': tag._id.toString()}};
    var grouping = {
        '$group': {
            '_id': '$tags.tagId',
            'items': {'$sum': 1},
            'downvotes': {'$sum': '$downvotes'},
            'max': {'$max': '$downvotes'},
            'min': {'$min': '$downvotes'}
        }
    };
    db.collection('contentitems').aggregate([matching, grouping], nextFunc);
};

// Function that returns the id's of the most/least upvoted contentitems.
module.exports.getUpvotedByTag = function(tag, order, count, nextFunc) {
    db.collection('contentitems').find(
        {'tags.tagId': tag._id.toString()},
        {'_id': 1, 'upvotes': 1}
    )
    .sort({'upvotes': toSortOrder(order)})
    .limit(count)
    .toArray(nextFunc);
};

// Function that returns the id's of the most/least downvoted contentitems.
module.exports.getDownvotedByTag = function(tag, order, count, nextFunc) {
    db.collection('contentitems').find(
        {'tags.tagId': tag._id.toString()},
        {'_id': 1, 'downvotes': 1}
    )
    .sort({'downvotes': toSortOrder(order)})
    .limit(count)
    .toArray(nextFunc);
};

// Function that returns the id's of the most/least viewed contentitems.
module.exports.getViewedByTag = function(tag, order, count, nextFunc) {
    db.collection('contentitems').find(
        {'tags.tagId': tag._id.toString()},
        {'_id': 1, 'views': 1}
    )
    .sort({'views': toSortOrder(order)})
    .limit(count)
    .toArray(nextFunc);
};

// Function that returns all items, or a subset if there are too many.
module.exports.getItems = function(criteria, sortBy, skip, limit, nextFunc) {
    var searchCriteria = criteria || {},
        sortCriteria;
    db.collection('contentitems')
        .find(searchCriteria)
        .sort(toSortCriteria(sortBy))
        .skip(skip)
        .limit(limit)
        .toArray(nextFunc);
};

// Function that counts the number of items, with or without search criteria.
module.exports.count = function(criteria, nextFunc) {
    var searchCriteria = criteria || {};
    db.collection('contentitems').count(searchCriteria, function(error, result) {
        return nextFunc(error, result);
    });
};

// Function that synchronizes a single contentitem with its external source.
// This includes uploading related images to the imagecache.
module.exports.sync = function(contentItem, options, nextFunc) {
    return feed.extendOne(contentItem, options || {}, function(error, item) {
        if (error) {
            return nextFunc(error, item);
        } else {
            return module.exports.update(item, function(error, item) {
                return sync.uploadItemImages(item, nextFunc);
            });
        }
    });
};

// Function that removes a single contentitem.
module.exports.remove = function(item, nextFunc) {
    db.collection('contentitems').remove({'_id': item._id}, nextFunc);
};

// Function that removes multiple contentitems.
module.exports.removeMultiple = function(items, nextFunc) {
    var ids = _.map(items, function(item) {
        return item._id;
    });
    db.collection('contentitems').remove({'_id': {'$in': ids}}, nextFunc);
};

// Function that cleans up contentitems by removing those that have no tags
// referencing them.
module.exports.cleanup = function(nextFunc) {
    db.collection('contentitems').remove({'tags': {'$size': 0}}, nextFunc);
};
