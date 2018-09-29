/*******************************************************************************
 * This file is part of the BiTE package.
*******************************************************************************/

/* jshint node: true */
'use strict';

// Experimental Facebook caching function.
module.exports.getStatus = function(id) {
    return function(nextFunc) {
        nextFunc(null, 'I am Facebook post #' + id);
    };
};
