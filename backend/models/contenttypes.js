/*******************************************************************************
 * This file is part of the BiTE package.
*******************************************************************************/

/* jshint node: true */
'use strict';

// Load dependencies.
var _ = require('underscore');
var db = require('../core/database');
var generic = require('./../core/generic');

// Function that fetches a contenttype by hash.
module.exports.getByHash = function(hash, nextFunc) {
    var criteria = {'_id': db.getId(hash)};
    db.collection('contenttypes').findOne(criteria, nextFunc);
};

// Function that fetches a contenttype by name.
module.exports.getByName = function(name, nextFunc) {
    var criteria = {'name': name};
    db.collection('contenttypes').findOne(criteria, nextFunc);
};

// Function that fetches a contenttype by slug.
module.exports.getBySlug = function(slug, nextFunc) {
    var criteria = {'slug': slug};
    db.collection('contenttypes').findOne(criteria, nextFunc);
};

// Function that creates a new contenttype.
module.exports.createNew = function(contenttype, nextFunc) {
    if (_.has(contenttype, 'name')) {
        contenttype.slug = generic.sluggify(contenttype.name);
    }
    db.collection('contenttypes').insert(contenttype, function(error, result) {
        if (error) {
            nextFunc(error, null);
        } else {
            nextFunc(null, result.pop());
        }
    });
};

// Function that updates an existing contenttype.
// contentType._id is the identifier used for finding the contenttype to update.
module.exports.update = function(contentType, nextFunc) {
    var options = {'upsert': false, 'multi': false};
    if (_.has(contentType, 'name')) {
        contentType.slug = generic.sluggify(contentType.name);
    }
    db.collection('contenttypes').update(
        {'_id': contentType._id}, contentType, options, function(error, result) {
            return nextFunc(error, contentType);
        }
    );
};

// Function that returns all types, or a subset if there are too many.
// Sorting is by name, ascending.
module.exports.getTypes = function(skip, limit, nextFunc) {
    db.collection('contenttypes').find({'active': true})
        .sort({'name': 1})
        .skip(skip)
        .limit(limit)
        .toArray(function(error, result) {
            return nextFunc(error, result);
        });
};

// Function that counts the number of active types.
module.exports.countActive = function(nextFunc) {
    db.collection('contenttypes')
        .count({'active': true}, function(error, result) {
            nextFunc(error, result);
        });
};
