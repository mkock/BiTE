/*******************************************************************************
 * This file is part of the BiTE package.
*******************************************************************************/

/* jshint node: true */
'use strict';

// Load dependencies.
var _ = require('underscore');
var db = require('./../core/database');
var templatesDb = require('./../models/templates');
var replies = require('./../core/replies');
var delegate = require('./../core/delegate');
var pager = require('data-pager');
var generic = require('./../core/generic');

// Function which preloads a template based on id or slug, and attaches it
// to the request if it does. Provided that request.params.type is set,
// it will add the variable "template" to the request.
module.exports.preload = function(request, response, nextFunc) {
    var typeId = request.params.template;
    if (db.isHash(typeId)) {
        templatesDb.getByHash(typeId, function(error, template) {
            replies.replyNotFoundOrPass(response, error, template, function() {
                request.template = template;
                return nextFunc();
            });
        });
    } else {
        templatesDb.getBySlug(typeId, function(error, template) {
            replies.replyNotFoundOrPass(response, error, template, function() {
                request.template = template;
                return nextFunc();
            });
        });
    }
};

// Function that simply wraps templates in an envelope object and sends them.
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
        response, null, meta, nav, response.locals.templates
    );
};

// Function that checks if the given template exists based on name.
module.exports.ensureNotExists = function(request, response, nextFunc) {
    var newTemplate = request.body;
    templatesDb.getByName(newTemplate.name, function(error, template) {
        replies.replyConflictOrPass(response, error, template, function() {
            return nextFunc();
        });
    });
};

// Function that creates a new template.
module.exports.postTemplate = function(request, response) {
    var template = request.body;
    template._id = db.getId();
    if (!_.has(template, 'name')) {
        return replies.replyBadRequest(response, 'Field "name" is missing');
    }
    if (!_.has(template, 'created')) {
        template.created = db.toDbTime();
    }
    if (!_.has(template, 'description') || template.description === null) {
        template.description = '';
    }
    // Create slug.
    template.slug = generic.sluggify(template.name);
    templatesDb.createNew(template, function(error, templateObject) {
        if (!error) {
            delegate.emit('template-added', templateObject);
        }
        replies.replyCreatedOrError(response, error, templateObject);
    });
};

// Function that updates an existing template.
module.exports.putTemplate = function(request, response) {
    var oldTemplate = request.template,
        newTemplate = request.body;
    // Ensure field "name" is present.
    if (!_.has(newTemplate, 'name')) {
        return replies.replyBadRequest(response, 'Field "name" is missing');
    }
    // Transfer id to the new template.
    newTemplate._id = oldTemplate._id;
    // Transfer/update timestamps.
    if (_.has(oldTemplate, 'created')) {
        newTemplate.created = oldTemplate.created;
    }
    // Update slug.
    newTemplate.slug = generic.sluggify(newTemplate.name);
    newTemplate.updated = db.toDbTime();
    templatesDb.update(newTemplate, function(error, template) {
        replies.replyUpdatedOrError(response, error, template);
    });
};

// Function that finds a template by id (hash/name).
module.exports.getById = function(request, response, nextFunc) {
    // Template is already been preloaded, so we just pass it to the response.
    response.locals.templates = [request.template];
    return nextFunc();
};

// Function that returns all templates, or a subset if there are a lot of them.
module.exports.getTemplates = function(request, response, nextFunc) {
    var pageNum = parseInt(request.query.page);
    var pageSize = parseInt(request.query.pagesize);
    // Set some pagination defauls when no query parameters are provided.
    pageNum = (isNaN(pageNum) ? 1 : pageNum);
    pageSize = (isNaN(pageSize) ? 10 : pageSize);
    // Search and paginate.
    templatesDb.countAll(function(error, templateCount) {
        replies.replyErrorOrPass(response, error, function() {
            var templatePager = new pager(templateCount, pageSize, pageNum);
            if (pageNum > templatePager.last) {
                // Pretend we're on the last page when we exceed boundaries.
                templatePager.page = templatePager.last;
            }
            templatesDb.getTemplates(
                templatePager.skip,
                templatePager.perpage,
                function(error, templates) {
                    return replies.replyErrorOrPass(response, error, function() {
                        response.locals.templates = templates;
                        response.locals.paginator = templatePager;
                        return nextFunc();
                    });
                }
            );
        });
    });
};
