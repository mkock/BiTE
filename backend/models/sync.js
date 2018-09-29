/*******************************************************************************
 * This file is part of the BiTE package.
*******************************************************************************/

/* jshint node: true */
'use strict';

// Load dependencies.
var _ = require('underscore');
var debug = require('debug')('bite:sync');
var async = require('async');
var util = require('util');
var crypto = require('crypto');
var url = require('url');
var db = require('./../core/database');
var config = require('./../core/config');
var itemsDb = require('./contentitems');
var tagsDb = require('./tags');
var bondApi = require('./bond-api');
var feed = require('./feed');
var imgcache = require('./imgcache');
var generic = require('./../core/generic');
var imageuploader = require('./imageuploader');

// Utility function that extracts the filename from a URL or FS path.
// Note; if the URL doesn't end with a filename extension, the extracted
// filename will not contain one either.
var getFilePart = function(path) {
    var localPath = path.replace(/\/$/g, '');
    return localPath.substring(localPath.lastIndexOf('/') + 1);
};

// Utility function that follows the given path through the given object
// and returns the value if the path exists, and Null if the path doesn't exist.
var getPath = function(object, path) {
    var fields, first;
    if (!_.isString(path) || _.isEmpty(path)) {
        return null;
    }
    fields = path.split('.');
    first = _.first(fields);
    if (_.has(object, first)) {
        if (fields.length === 1) {
            return object[first];
        } else {
            return getPath(object[first], _.rest(fields).join('.'));
        }
    } else {
        return null;
    }
};

// Utility function that creates the given path of fields on the given object.
// If parts of the path already exist, they are simply extended.
var createPath = function(object, path, fullObject) {
    var fields, first;
    if (!_.isString(path) || _.isEmpty(path)) {
        return fullObject || object;
    }
    fields = path.split('.');
    first = _.first(fields);
    if (_.has(object, first)) {
        if (fields.length === 1) {
            return fullObject;
        } else if (_.isObject(object[first])) {
            return createPath(
                object[first], _.rest(fields).join('.'), fullObject || object
            );
        }
    } else {
        object[first] = {};
        return createPath(
            object[first], _.rest(fields).join('.'), fullObject || object
        );
    }
};

// Utility function that deletes a single queueItem.
var deleteQueueItem = function(queueItem, nextFunc) {
    itemsDb.remove(queueItem.item, function(error, result) {
        generic.printError(error);
        return nextFunc();
    });
};

// Utility function that updates a single queueItem.
var updateQueueItem = function(queueItem, nextFunc) {
    var syncOptions = {
        'skipCache': true,
        'includeBody': true
    };
    // The item is naturally already tagged correctly; this call exists to
    // ensure that the priority is updated if it has changed.
    itemsDb.addTag(queueItem.item, queueItem.tag, queueItem.priority);
    queueItem.item.synced = queueItem.tag.synced;
    itemsDb.update(queueItem.item, function(error, item) {
        if (error) {
            generic.printError(error);
            return nextFunc();
        } else {
            module.exports.syncItem(item, syncOptions, function(error, item) {
                generic.printError(error);
                return nextFunc();
            });
        }
    });
};

// Utility function that creates a single queueItem.
var createQueueItem = function(queueItem, nextFunc) {
    var syncOptions = {
        'skipCache': true,
        'includeBody': true
    };
    // Create a new contentitem with data from the node.
    return bondApi.nodeToItem(queueItem.node, function(error, item) {
        if (error) {
            generic.printError(error);
            return nextFunc();
        } else {
            // Add the tag to the item.
            itemsDb.addTag(item, queueItem.tag, queueItem.priority);
            // Create the item.
            item.synced = queueItem.tag.synced;
            return itemsDb.createNew(item, function(error, item) {
                if (error) {
                    generic.printError(error);
                    return nextFunc();
                } else {
                    return module.exports.syncItem(
                        item, syncOptions, function(error, item) {
                            generic.printError(error);
                            return nextFunc();
                        }
                    );
                }
            });
        }
    });
};

// Utility function that marks the tag as being actively synchronizing.
var markTagSyncStart = function(tag, nextFunc) {
    tag.syncInProgress = true;
    tag.syncStarted = db.toDbTime();
    return tagsDb.update(tag, nextFunc);
};

// Utility function that marks the tag as being done synchronizing.
var markTagSyncEnd = function(tag, nextFunc) {
    delete tag.syncInProgress;
    delete tag.syncStarted;
    tag.synced = db.toDbTime();
    return tagsDb.update(tag, nextFunc);
};

// Utility function that builds an "execution queue" - an array of functions
// that will import individual nodes when called.
var buildQueue = function(tag, nodequeue, nextFunc) {
    var queue = [],
        nrToCreate = 0,
        nrToUpdate = 0,
        nrToDelete = 0,
        nrToSkip = 0;
    // Iterate over nodequeue nodes and check each one.
    // For each node, we compare its status with the corresponding local
    // contentitem. Algorithm for how to treat contentitems:
    // - If the node is published and the item is present, update it.
    // - If the node is published and the item is absent, create it.
    // - If the node is unpublished and the item is present, delete it.
    // - If the node is unpublished and the item is absent, do nothing.
    async.each(nodequeue.nodes, function(node, callback) {
        // Retrieve the node and node id so we can look for it locally.
        var priority = nodequeue.nodes.indexOf(node),
            nodeId = parseInt(node.id),
            queueItem = {
                'node': node,
                'item': null,
                'tag': tag,
                'priority': priority
            };
        // Fetch contentitem locally by nodeId.
        itemsDb.getByNodeId(nodeId, function(error, item) {
            if (error) {
                return callback(error);
            } else {
                queueItem.item = item;
                if (item && node.statusText !== 'Unpublished') {
                    // TODO: We relentlessly update all items instead of
                    // checking if they actually need to be updated. This might
                    // be improved by checking some kind of "last modified" date.
                    queue.push(function(nextFunc) {
                        var _item = queueItem;
                        return updateQueueItem(_item, nextFunc);
                    });
                    nrToUpdate++;
                } else if (item && node.statusText === 'Unpublished') {
                    queue.push(function(nextFunc) {
                        var _item = queueItem;
                        return deleteQueueItem(_item, nextFunc);
                    });
                    nrToDelete++;
                } else if (!item && node.statusText !== 'Unpublished') {
                    queue.push(function(nextFunc) {
                        var _item = queueItem;
                        return createQueueItem(_item, nextFunc);
                    });
                    nrToCreate++;
                } else {
                    nrToSkip++;
                }
                return callback();
            }
        });
    }, function(error) {
        if (error) {
            generic.printError(error);
            return nextFunc(error, null);
        }
        console.log(util.format(
            'Tag #%s; create %d %s, update %d %s, delete %d %s and skip %d %s',
            tag._id.toString(),
            nrToCreate,
            plural(nrToCreate, 'item'),
            nrToUpdate,
            plural(nrToUpdate, 'item'),
            nrToDelete,
            plural(nrToDelete, 'item'),
            nrToSkip,
            plural(nrToSkip, 'item')
        ));
        // Start processing individual functions on the queue.
        return nextFunc(null, queue);
        function plural(value, unit) {
            return (value === 1 ? unit : unit + 's');
        }
    });
};

// Function that "resets" a tag by removing the flag which indicates that a
// synchronization effort is underway. It only removes this flag when the last
// synchronization is at least config.bond.cleanupDelta minutes old.
var cleanupTag = function(tag, nextFunc) {
    var updateTime = db.toDbTime() - config.bond.cleanupDelta,
        updateCond = {'$and': [
            {'_id': tag._id},
            {'syncInProgress': {'$exists': true}},
            {'syncStarted': {'$lt': updateTime}}
        ]},
        updateOp = {'$unset': {'syncInProgress': true, 'syncStarted': true}};
    db.collection('tags').update(updateCond, updateOp, nextFunc);
};

// Function that synchronizes a tag with its corresponding BOND nodequeue.
// Each node is compared to its corresponding contentitem; if the item doesn't
// exist, it's created, if it exists, it's updated, and if the node is
// unpublished, the item is deleted.
// This function also converts and stores item & tag images and sets the correct
// description and image on dynamic tags.
// If the given tag is already being synchronized, this function will abort the
// synchronization after checking if the current synchronization has gone stale,
// in which case the situation is remedied. This means that stale tags will
// start synchronizing again on the second attempt.
// Algorithm:
// 1.  Mark tag as being in a state of synchronization
// 2.  Get nodequeue from BOND
// 3.  Compare nodequeue and tag hash values and abort if they are identical
// 4.  Build a queue of functions that process individual nodes
// 5.  Process the queue of tasks
// 6.  Update tag description based on the first node or tag title
// 7.  Upload tag images
// 8.  Clean up
// 9.  Mark tag as being done with synchronization
// 10. Execute!
module.exports.syncTag = function(tag, nextFunc) {
    var queue = [],
        series = [],
        nodequeue,
        firstItem;
    if (!_.has(tag, 'nodequeueId')) {
        // No nodequeueId, so we're done.
        return nextFunc(null, tag);
    }
    if (_.has(tag, 'syncInProgress') && tag.syncInProgress) {
        debug(util.format(
            'Tag #%s: abort, already in progress', tag._id.toString()
        ));
        // Synchronization is already in progress. Clean up the tag if required.
        return cleanupTag(tag, function() {
            return nextFunc(null, tag);
        });
    }
    // Log the beginning of synchronization.
    console.log(util.format('Tag %s: start sync', tag._id.toString()));
    // Construct array with series of functions to call;
    // 1. Mark tag as being in a state of synchronization.
    series.push(function(callback) {
        return markTagSyncStart(tag, callback);
    });
    // 2. Get nodequeue from BOND.
    //    Notice that "nodequeue" is used in subsequent tasks.
    series.push(function(callback) {
        bondApi.getNodequeue(tag.nodequeueId, function(error, nq) {
            if (error) {
                return callback(error);
            }
            // Assign "nq" to "nodequeue" in outer scope.
            nodequeue = nq;
            return callback();
        });
    });
    // 3. Compare nodequeue and tag hash values and abort if they are identical.
    series.push(function(callback) {
        var queueHash = crypto
            .createHash('md5')
            .update(JSON.stringify(nodequeue))
            .digest('hex');
        if (_.has(tag, 'queueHash') &&
            queueHash === tag.queueHash &&
            !_.isEmpty(tag.image.images)) {
            // Abort synchronization if the tag's hash value matches that of
            // the nodequeue.
            debug(util.format(
                'Tag #%s: abort, already up-to-date', tag._id.toString()
            ));
            return markTagSyncEnd(tag, nextFunc);
        } else {
            // Continue with synchronization, and save the hash for next time.
            tag.queueHash = queueHash;
            return callback();
        }
    });
    // 4. Build a queue of functions that process individual nodes.
    //    Notice that "queue" is used again in step 5.
    series.push(function(callback) {
        return buildQueue(tag, nodequeue, function(error, tasklist) {
            queue = tasklist;
            return callback(error);
        });
    });
    // 5. Process the queue of tasks.
    series.push(function(callback) {
        async.parallel(queue, function(error) {
            return callback(error);
        });
    });
    // 6. Update tag description from the first (published) node or tag title.
    //    Notice that "firstItem" is used again in step 7 for dynamic tags.
    series.push(function(callback) {
        itemsDb.getFirstByTag(tag, function(error, result) {
            firstItem = _.first(result);
            tag.name = bondApi.convertTagTitle(nodequeue.title);
            if (tag.imageStrategy === 'default') {
                tag.description = tag.name;
            } else if (tag.imageStrategy === 'article') {
                tag.description = firstItem.title;
            }
            return callback();
        });
    });
    // 7. Upload tag images.
    series.push(function(callback) {
        return module.exports.uploadTagImages(tag, firstItem, function(error) {
            return callback(error);
        });
    });
    // 8. Clean up.
    series.push(function(callback) {
        async.parallel([
            function(callback) {
                // Clean up unsynchronized items.
                return module.exports.cleanupItems(tag, function(error) {
                    return callback(error);
                });
            },
            function(callback) {
                // Clean up old files in the download directory.
                // TODO: This doesn't really need to run for every tag sync,
                // just once for the overall request, so there's room for
                // optimization here.
                imgcache.cleanDownloadDir();
                return callback();
            }
        ], function(error) {
            console.log(util.format(
                'Tag #%s; cleaned up unsynchronized tags, items and files',
                tag._id.toString()
            ));
            return callback(error);
        });
    });
    // 9. Mark tag as being done with synchronization.
    series.push(function(callback) {
        return markTagSyncEnd(tag, callback);
    });
    // 10. Execute!
    async.series(series, function(error) {
        // We're done with the entire series of function calls.
        generic.printError(error);
        // We're done!
        console.log(util.format('Tag #%s; done', tag._id.toString()));
        return nextFunc(error, tag);
    });
};

// Utility function that sets and uploads the tag image to the image cache.
module.exports.uploadTagImages = function(tag, firstItem, nextFunc) {
    var useTagImage = true,
        url;
    if (tag.imageStrategy === 'default' &&
        getPath(tag, 'image.image') &&
        (_.isNull(getPath(tag, 'image.images')) ||
        _.isEmpty(tag.image.images))) {
        imageuploader.upload({
            'url': getPath(tag, 'image.image'),
            'type': 'tagImages',
            'pathId': tag._id.toString(),
            'fileName': getFilePart(tag.image.image)
        }, function(error, images) {
            generic.printError(error);
            createPath(tag, 'image.images');
            tag.image.images = {
                'default': images
            };
            tag.image.imageCached = db.toDbTime();
            return tagsDb.update(tag, nextFunc);
        });
    } else if (tag.imageStrategy === 'article') {
        // Make and upload images from first item image source.
        if (firstItem && !_.isNull(getPath(firstItem, 'image.image'))) {
            // We have an item we can retrieve the image from.
            if (_.isNull(tag.firstItem)) {
                // The tag has no first item recorded, so we set the url.
                url = firstItem.image.image;
            } else if (tag.firstItem !== firstItem._id.toString()) {
                // There is a first item, but it's different from current.
                url = firstItem.image.image;
            } else if (_.isEmpty(tag.image.images)) {
                // There are two first items, and they are identical.
                // But the responsive images are absent, so we'll update anyway.
                url = firstItem.image.image;
            } else {
                // There are two first items, and they are identical.
                // Instead of uploading the same image again, save the tag.
                url = null;
            }
            useTagImage = false;
        }
        if (useTagImage && !_.isNull(getPath(tag, 'image.image'))) {
            // Fallback; use the tag image if the item image unavailable.
            url = getPath(tag, 'image.image');
            debug(util.format(
                'Contentitem #%s has no image, using tag image instead',
                (firstItem ? firstItem._id.toString() : 'N/A')
            ));
        }
        if (url) {
            imageuploader.upload({
                'url': url,
                'type': 'tagImages',
                'pathId': tag._id.toString(),
                'fileName': getFilePart(url)
            }, function(error, images) {
                if (error) {
                    return nextFunc(error, null);
                }
                createPath(tag, 'image.images');
                tag.image.images.article = images;
                if (firstItem) {
                    // Store id of firstItem so we can check if it has
                    // changed during the next synchronization. We don't
                    // want to upload the same image again and again.
                    tag.firstItem = firstItem._id.toString();
                }
                tag.image.imageCached = db.toDbTime();
                return tagsDb.update(tag, nextFunc);
            });
        } else {
            return tagsDb.update(tag, nextFunc);
        }
    } else {
        // Nothing to upload.
        return nextFunc(null, tag);
    }
};

// Function that synchronizes a single contentitem with its external source.
// This includes uploading related images to the imagecache.
module.exports.syncItem = function(contentItem, options, nextFunc) {
    return feed.extendOne(contentItem, options || {}, function(error, item) {
        if (error) {
            return nextFunc(error, item);
        } else {
            return itemsDb.update(item, function(error, item) {
                return module.exports.uploadItemImages(item, nextFunc);
            });
        }
    });
};

// Function that uploads a contentitem's images to the imagecache.
// Algorithm: item.image.image will be the original image as it was imported,
// and is simply an absolute URL. This function checks if item.image.images
// (plural) exists, and creates it if it doesn't. item.image.images is an object
// containing several fields named after the viewport size that the image is
// made for. imageuploader is used for fetching the original image, uploading
// it to the image manipulation cloud service (where different sizes are
// generated (for mobile and desktop etc.), and finally storing them in S3.
// The same algorithm applies to the author image.
module.exports.uploadItemImages = function(item, nextFunc) {
    async.series([
        function(callback) {
            // Upload the main article image.
            if (getPath(item, 'image.image') &&
                (_.isNull(getPath(item, 'image.imagePrev')) ||
                    item.image.imagePrev !== item.image.image)) {
                imageuploader.upload({
                    'url': getPath(item, 'image.image'),
                    'type': 'articleImages',
                    'pathId': item._id.toString()
                }, function(error, images) {
                    return callback(error, images);
                });
            } else {
                return callback();
            }
        },
        function(callback) {
            // Upload the author image.
            var authorImage;
            if (getPath(item, 'author.image') && !getPath(item, 'author.images')) {
                authorImage = url.resolve(
                    config.bond.relUrlHost, item.author.image
                );
                imageuploader.upload({
                    'url': authorImage,
                    'type': 'authorImages',
                    'pathId': generic.sluggify(getPath(item, 'author.name'))
                }, function(error, images) {
                    return callback(error, images);
                });
            } else {
                return callback();
            }
        }
    ], function(error, results) {
        var contentImages = results[0],
            authorImages = results[1],
            now = db.toDbTime();
        if (error) {
            console.log(util.format(
                'Error while converting images for item #%s: %s',
                item._id.toString(),
                error
            ));
        } else {
            if (!_.isEmpty(contentImages)) {
                item = createPath(item, 'image.images');
                item.image.images = contentImages;
                item.image.imageCached = now;
            }
            if (!_.isEmpty(authorImages)) {
                item = createPath(item, 'author');
                item.author.picture = authorImages;
                item.author.imageCached = now;
            }
        }
        return itemsDb.update(item, nextFunc);
    });
};

// Function that cleans up all contentitems that are tagged with the given tag,
// and doesn't have a "synced" field that equals the value of "tag.synced".
module.exports.cleanupItems = function(tag, nextFunc) {
    if (!tag.synced) {
        // Abort if "tag.synced" isn't a valid timestamp since we would
        // otherwise risk deleting random contentitems!
        return nextFunc(null, tag); // Just send along the tag.
    }
    async.parallel({
        // 1) Delete items with only one matching tag and an old timestamp.
        'remove': function(asyncNext) {
            var removeCond = {
                '$and': [
                    {'tags': {'$size': 1}},
                    {'tags.tagId': tag._id.toString()},
                    {'synced': {'$exists': true}},
                    {'synced': {'$lt': tag.synced}}
                ]
            };
            db.collection('contentitems')
                .remove(removeCond, function(error, result) {
                    return asyncNext(error, result);
                });
        },
        // 2) Remove tag from contentitems that has more than one tag.
        'untag': function(asyncNext) {
            var cond = {
                '$and': [
                    {'tags.tagId': tag._id.toString()},
                    {'tags.1': {'$exists': true}}, // At least two elements!
                    {'synced': {'$lt': tag.synced}}
                ]
            },
            op = {'$pull': {'tags': {'tagId': tag._id.toString()}}},
            options = {'multi': true};
            db.collection('contentitems')
                .update(cond, op, options, function(error, result) {
                    return asyncNext(error, result);
                });
        }
    }, function(error, results) {
        if (!error) {
            debug(util.format(
                'Tag #%s: Removed %d untagged items and untagged %d items',
                tag._id.toString(),
                results.remove,
                results.untag
            ));
        }
        return nextFunc(error, tag);
    });
};
