/*******************************************************************************
 * This file is part of the BiTE package.
*******************************************************************************/

/* jshint node: true */
' use strict';

var util = require('util');
var _ = require('underscore');
var replies = require('./replies');

// Simply add objects to this list in order to allow more options; the "test"
// field is a regular expression that must match for the option to be valid.
var optionsMap = [
    {'option': 'trimitems', 'test': /^(1|yes|true|0|no|false)$/i, 'testHuman': '1|yes|true|0|no|false'},
    {'option': 'skipcache', 'test': /^(1|yes|true|0|no|false)$/i, 'testHuman': '1|yes|true|0|no|false'},
    {'option': 'extendtags', 'test': /^(1|yes|true|0|no|false)$/i, 'testHuman': '1|yes|true|0|no|false'},
    {'option': 'extendtemplates', 'test': /^(1|yes|true|0|no|false)$/i, 'testHuman': '1|yes|true|0|no|false'},
    {'option': 'extendfirstitems', 'test': /^(1|yes|true|0|no|false)$/i, 'testHuman': '1|yes|true|0|no|false'},
    {'option': 'autosync', 'test': /^(1|yes|true|0|no|false)$/i, 'testHuman': '1|yes|true|0|no|false'},
    {'option': 'addview', 'test': /^(1|yes|true|0|no|false)$/i, 'testHuman': '1|yes|true|0|no|false'},
    {'option': 'page', 'test': /^[0-9]*$/, 'testHuman': '[0-9]*'},
    {'option': 'pagesize', 'test': /^[0-9]*$/, 'testHuman': '[0-9]*'},
    {'option': 'pubfrom', 'test': /^[0-9]*$/, 'testHuman': '[0-9]*'},
    {'option': 'pubto', 'test': /^[0-9]*$/, 'testHuman': '[0-9]*'},
    {
        'option': 'sortby',
        'test': /^(upvotes|downvotes|views|priority|name|published)$/,
        'testHuman': '(upvotes|downvotes|views|priority|name|published)'
    },
    {
        'option': 'filter',
        'test': /^(all|frontpage|menu|tiles)$/,
        'testHuman': '(all|frontpage|menu|tiles)'
    }
];

// Function that checks all query parameters and replies with an error if any
// one of them is given, but invalid according to the optionsMap defined above.
module.exports.validate = function(request, response, nextFunc) {
    for (var index = 0; index < optionsMap.length; index++) {
        var option = optionsMap[index];
        if (_.has(request.query, option.option)) {
            if (!option.test.test(request.query[option.option])) {
                return replies.replyBadRequest(
                    response,
                    util.format(
                        'Invalid value "%s" for option "%s"; allowed values are "%s"',
                        request.query[option.option],
                        option.option,
                        option.testHuman
                    )
                );
            }
        }
    }
    // After falling through all checks, we end up accepting the options
    // and therefore trigger the next callback.
    return nextFunc();
};
