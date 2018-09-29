/*******************************************************************************
 * This file is part of the BiTE package.
*******************************************************************************/

/* jshint node: true */
'use strict';

// Load dependencies.
var config = require('./../core/config');
var instagram = require('instagram-node').instagram();

// Connect to Instagram.
instagram.use({
    'client_id': config.instagramClientId,
    'client_secret': config.instagramClientSecret
});

// Function which returns another function that fetches an Instagram image.
module.exports.getImage = function(item) {
    var userId = item.data.Tag;
    var options = {'count': item.data.count || 10};
    return function(nextFunc) {
        instagram.user_media_recent(userId, options, function(error, imageObject) {
            nextFunc(error, imageObject);
        });
    };
};
