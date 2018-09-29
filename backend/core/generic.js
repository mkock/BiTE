/*******************************************************************************
 * This file is part of the BiTE package.
*******************************************************************************/

/* jshint node: true */
'use strict';

// Load dependencies.
var _ = require('underscore');
var slug = require('slug');

// Set up Danish charmap for slugs.
slug.charmap['æ'] = 'ae';
slug.charmap['Æ'] = 'Ae';
slug.charmap['ø'] = 'oe';
slug.charmap['Ø'] = 'Oe';
slug.charmap['å'] = 'aa';
slug.charmap['Å'] = 'Aa';
slug.charmap['>'] = 'og';
slug.charmap['<'] = 'og';

// Function that returns the sluggified version of a text.
module.exports.sluggify = function(text) {
    return (_.isString(text) ? slug(text).toLowerCase() : '');
};

// Function that returns true if the given text represents a "truthy" value.
// The regexp says is all.
module.exports.isTruthy = function(text) {
    return /^(1|yes|true)$/i.test(text);
};

// Function that returns true if the given text represents a "falsy" value.
// The regexp says is all.
module.exports.isFalsy = function(text) {
    return /^(0|no|false)$/i.test(text);
};

// Function that returns true if the given text represents a "truthy" or
// no value. The regexp says is all.
module.exports.isNotFalsy = function(text) {
    return _.isUndefined(text) || module.exports.isTruthy(text);
};

// Function that prints the argument if it's an error.
module.exports.printError = function(error) {
    if (error instanceof Error) {
        console.log(error);
    }
};
