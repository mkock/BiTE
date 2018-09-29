/*******************************************************************************
 * This file is part of the BiTE package.
*******************************************************************************/

/* jshint node: true */
'use strict';

// Load dependencies.
var db = require('./../core/database');

// Function that fetches a template by hash.
module.exports.getByHash = function(hash, nextFunc) {
    db.collection('templates').findOne(
        {'_id': db.getId(hash)}, {}, function(error, templateObject) {
            return nextFunc(error, templateObject);
        }
    );
};

// Function that fetches a template by slug.
module.exports.getBySlug = function(slug, nextFunc) {
    db.collection('templates').findOne(
        {'slug': slug}, {}, function(error, templateObject) {
            return nextFunc(error, templateObject);
        }
    );
};

// Function that fetches a template by name.
module.exports.getByName = function(name, nextFunc) {
    db.collection('templates').findOne(
        {'name': name}, {}, function(error, templateObject) {
            return nextFunc(error, templateObject);
        }
    );
};

// Function that counts the total number of templates.
module.exports.countAll = function(nextFunc) {
    db.collection('templates').count(function(error, result) {
        nextFunc(error, result);
    });
};

// Function that returns all templates, or a subset if there are too mnay.
// Sorting is by name, ascending.
module.exports.getTemplates = function(skip, limit, nextFunc) {
    db.collection('templates')
        .find({})
        .sort({'name': 1})
        .skip(skip)
        .limit(limit)
        .toArray(function(error, result) {
            return nextFunc(error, result);
        }
    );
};

// Function that creates a new template.
module.exports.createNew = function(template, nextFunc) {
    db.collection('templates').insert(template, function(error, result) {
        return nextFunc(
            error, (result instanceof Array ? result.pop() : result)
        );
    });
};

// Function that updates an existing template.
// template._id is the identifier used for finding the template to update.
module.exports.update = function(template, nextFunc) {
    var options = {'upsert': false, 'multi': false};
    db.collection('templates').update(
        {'_id': template._id}, template, options, function(error, result) {
            return nextFunc(error, template);
        }
    );
};
