/*******************************************************************************
 * This file is part of the BiTE package.
*******************************************************************************/

/* jshint node: true */
'use strict';

// Load dependencies.
var _ = require('underscore');
var util = require('util');
var db = require('./../core/database');
var config = require('./../core/config');
var generic = require('./../core/generic');
var itemsDb = require('./contentitems');

// Local utility function that helps convert filter intends to MongoDB criteria.
var filterToCriteria = function(filter) {
    var criteria;
    if (filter === 'frontpage') {
        criteria = {'ignoreOnFrontpage': false};
    } else if (filter === 'menu') {
        criteria = {'showInMenu': true};
    } else if (filter === 'tiles') {
        criteria = {'showAsTile': true};
    } else {
        criteria = {};
    }
    return criteria;
};

// Function that fetches a tag by hash.
module.exports.getByHash = function(hash, nextFunc) {
    db.collection('tags').findOne({'_id': db.getId(hash)}, {}, nextFunc);
};

// Function that fetches a tag by name (field "tag").
module.exports.getByName = function(tagName, nextFunc) {
    db.collection('tags').findOne({'tag': tagName}, {}, nextFunc);
};

// Function that fetches a tag by slug (field "slug").
module.exports.getBySlug = function(slug, nextFunc) {
    db.collection('tags').findOne(
        {'slug': slug}, {}, nextFunc);
};

// Function that creates a new tag.
module.exports.createNew = function(tag, nextFunc) {
    // Enrich tag before saving.
    if (!_.has(tag, 'created')) {
        tag.created = db.toDbTime();
    }
    tag.slug = generic.sluggify(tag.name);
    // Save the tag.
    db.collection('tags').insert(tag, function(error, result) {
        if (error) {
            return nextFunc(error, null);
        } else {
            return nextFunc(null, result.pop());
        }
    });
};

// Function that updates an existing tag.
// tag._id is the identifier used for finding the tag to update.
module.exports.update = function(tag, nextFunc) {
    // Enrich tag before saving.
    tag.updated = db.toDbTime();
    tag.slug = generic.sluggify(tag.name);
    // Save the tag.
    var options = {'upsert': false, 'multi': false};
    db.collection('tags')
        .update({'_id': tag._id}, tag, options, function(error, result) {
            return nextFunc(error, tag);
    });
};

// Function that returns all tags, or a subset if there are too many.
// Sorting is by timestamp, descending (newest first).
module.exports.getTags = function(filter, skip, limit, nextFunc) {
    var collection = db.collection('tags')
        .find(filterToCriteria(filter))
        .sort({'priority': 1});
    if (skip !== null && limit !== null) {
        collection.skip(skip)
            .limit(limit);
    }
    collection.toArray(nextFunc);
};

// Function that returns all tags that haven't been synchronized within the
// last "delta" seconds. Results are ordered by "synced", oldest first.
module.exports.getNotSyncedSince = function(delta, nextFunc) {
    db.collection('tags')
        .find({'$and': [
            {'synced': {'$exists': true}},
            {'synced': {'$lt': db.toDbTime() - parseInt(delta)}}
        ]})
        .sort({'synced': 1})
        .toArray(nextFunc);
};

// Function that counts the number of tags.
module.exports.count = function(filter, nextFunc) {
    db.collection('tags')
        .count(filterToCriteria(filter), function(error, result) {
            nextFunc(error, result);
        });
};

// Function that removes a tag and removes the tag from all related items.
module.exports.remove = function(tagObject, nextFunc) {
    var tagRemoved = false,
        itemsUntagged = false;
    // Local function that does final cleanup and triggers the callback when
    // we're done removing the tag.
    var confirmAndContinue = function() {
        if (tagRemoved && itemsUntagged) {
            // Clean up contentitems by removing the untagged ones.
            process.nextTick(function() {
                itemsDb.cleanup(function(error, result) {
                    if (error) {
                        console.log(error);
                    }
                });
            });
            return nextFunc(null, tagObject);
        }
    };
    // Remove the tag.
    db.collection('tags').remove({'_id': tagObject._id}, function(error, result) {
        if (error) {
            return nextFunc(error, null);
        }
        tagRemoved = true;
        return confirmAndContinue();
    });
    // Untag related items.
    itemsDb.untag(tagObject, function(error, result) {
        if (error) {
            return nextFunc(error, null);
        }
        itemsUntagged = true;
        return confirmAndContinue();
    });
};

// Function that finds the highest prioritized tag of those associated with the
// given contentitem, and keeps it while removing all other tags. This works
// for tag stubs too, since we just need the id.
module.exports.reduceToPrioritized = function(tags, nextFunc) {
    var tagIds = [],
        highestTag;
    if (tags.length < 2) {
        // There's nothing to reduce if there are exactly zero or one tag.
        return nextFunc(null, tags);
    }
    for (var index = 0; index < tags.length; index++) {
        tagIds.push(db.getId(tags[index].tagId));
    }
    db.collection('tags')
        .find({'_id': {'$in': tagIds}})
        .sort({'priority': 1})
        .limit(1)
        .toArray(function(error, tags) {
            if (error) {
                return nextFunc(error, null);
            }
            highestTag = _.first(tags);
            return nextFunc(error, [{
                'tagId': highestTag._id.toString(),
                'prio': highestTag.priority
            }]);
        });
};

// Function that sets the tag priority to a new value.
module.exports.setPriority = function(tag, priority, nextFunc) {
    var updateOp = {'$set': {'priority': priority}},
        options = {'upsert': false, 'multi': false};
    db.collection('tags')
        .update({'_id': tag._id}, updateOp, options, function(error, result) {
            tag.priority = priority;
            return nextFunc(error, tag);
        });
};
