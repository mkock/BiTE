/*******************************************************************************
 * This file is part of the BiTE package.
*******************************************************************************/

/* jshint node: true */
'use strict';

var _ = require('underscore');

// Function that replies with 500 Internal Server Error if given an Error,
// 200 OK if given a result, and 404 Not Found if given an empty result.
module.exports.replyFoundOrError = function(response, error, result) {
    if (error instanceof Error) {
        response.status(500).send({'error': error.toString()});
    } else if (result) {
        response.status(200).send(result);
    } else {
        response.sendStatus(404);
    }
};

// Function that replies with 500 Internal Server Error if given an Error,
// 201 Created if given a result, and 503 Service Unavailable if given an
// empty result.
module.exports.replyCreatedOrError = function(response, error, result) {
    if (error instanceof Error) {
        response.status(500).send({'error': error.toString()});
    } else if (result) {
        response.status(201).send(result);
    } else {
        response.sendStatus(503);
    }
};

// Function that replies with 500 Internal Server Error if given an Error,
// 200 OK if given a result, and 503 Service Unavailable if given an
// empty result.
module.exports.replyUpdatedOrError = function(response, error, result) {
    if (error instanceof Error) {
        response.status(500).send({'error': error.toString()});
    } else if (result) {
        response.status(200).send(result);
    } else {
        response.sendStatus(503);
    }
};

// Function that replies with 500 Internal Server Error if given an Error,
// or calls the provided function if there is no error.
module.exports.replyErrorOrPass = function(response, error, passFunc) {
    if (error instanceof Error) {
        response.status(500).send({'error': error.toString()});
    } else {
        return passFunc();
    }
};

// Function that replies with 404 Not Found if there is no result, or calls
// the provided function if is one.
module.exports.replyNotFoundOrPass = function(response, error, result, passFunc) {
    if (((_.isArray(result) && result.length > 0)) ||
        (!_.isArray(result) && result)) {
        return passFunc();
    } else if (error instanceof Error) {
        response.status(500).send({'error': error.toString()});
    } else {
        response.sendStatus(404);
    }
};

// Function that replies with 409 Conflict if there is a result, 500 Internal
// Server error if there is an error, or calls the provided function otherwise.
module.exports.replyConflictOrPass = function(response, error, result, passFunc) {
    if (result) {
        response.status(409).send('Resource already exists');
    } else if (error instanceof Error) {
        response.status(500).send({'error': error.toString()});
    } else {
        return passFunc();
    }
};

// Function that replies with a 403 Forbidden message.
module.exports.replyForbidden = function(response, msg) {
    response.status(403).send('Forbidden: ' + msg);
};

// Function that replies with a 400 Bad Request message.
module.exports.replyBadRequest = function(response, msg) {
    response.status(400).send(msg);
};

// Function that replies with a 200 OK if there is a result, 500 Internal Server
// Error if there is an error, or 401 Unauthorized otherwise.
module.exports.replyFoundOrUnauthorized = function(response, error, result, msg) {
    if (result) {
        response.status(200).send(result);
    } else if (error instanceof Error) {
        response.status(500).send({'error': error.toString()});
    } else {
        response.status(401).send({'message': msg});
    }
};

// Function that nests the response in a standardized envelope; a JSON object
// with some predefined fields that are guaranteed to exist on 200 OK responses.
module.exports.wrapAndSend = function(response, error, meta, nav, objects) {
    var envelope;
    var objectList;
    if (error instanceof Error) {
        envelope = null;
    } else {
        if (objects instanceof Array) {
            objectList = objects;
        } else {
            objectList = [objects];
        }
        envelope = {
            'meta': meta || {},
            'navigation': {},
            'items': objectList
        };
        envelope.meta.itemCount = objectList.length;
        if (nav) {
            envelope.navigation = nav;
        }
    }
    return module.exports.replyFoundOrError(response, error, envelope);
};

// Utility function that creates navigation based on a pager.
module.exports.paginate = function(pager) {
    return {
        'page': pager.page,
        'nextPage': pager.next,
        'prevPage': pager.previous,
        'pageCount': pager.last,
    };
};
